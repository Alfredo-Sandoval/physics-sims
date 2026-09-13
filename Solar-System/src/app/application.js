import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import * as SceneSetup from "../rendering/scene.js";
import * as UI from "../ui/index.js";
import { setupUIControls, cleanupControls } from "../ui/controls.js";
import { setupPointerEvents, cleanupPointerListeners, setupZoomDetection, cleanupZoomDetectionListeners } from "../navigation/pointer.js";
import { setupKeyboardShortcuts, cleanupKeyboardShortcuts } from "../navigation/keyboard.js";
import { disposeBeltWorker } from "../simulation/beltWorkerClient.js";
import { ShadowManager } from "../rendering/shadows.js";
import { createStarfield } from "../rendering/starfield.js";
import { createSun, createPlanetsAndOrbits } from "../rendering/bodies.js";
import { createAsteroidBelt } from "../rendering/belts/asteroidBelt.js";
import { createKuiperBelt } from "../rendering/belts/kuiperBelt.js";
import { clearTextureCache } from "../rendering/textures.js";
import { onResize, offResize } from "../core/viewport.js";
import { setScene, setCamera, setRenderer, setControls, setClock, setPlanets, setCelestialBodies,
  setMoons, setSun, setAsteroidBelt, setSimulationSpeed, setSimulatedDays, getMoons, resetState } from "../core/state.js";
import { clearListeners as clearEventListeners } from "../core/events.js";
import { debug as logDebug, info as logInfo, warn as logWarn, error as logError } from "../core/logger.js";
import { initTextureLoader } from "../rendering/textures.js";
import { PerformanceTuner } from "../rendering/quality.js";
import { createRendererWithFallback } from "../rendering/renderer.js";
import { loadPlanetData } from "../simulation/catalog.js";
import { createOrbitWorkerClient } from "../simulation/orbitWorkerClient.js";
import { startAnimationLoop } from "./renderLoop.js";
import { createJupiterTrojans } from "../rendering/belts/trojans.js";
import { setupDatePicker } from "../ui/dateControl.js";
import { showLoadingScreen, showErrorMessage, clearErrorMessage } from "../ui/appStatus.js";
import { setupPlanetDropdown } from "../ui/planetDropdown.js";
import { createFrameTimer, checkMemoryUsage, MEMORY_CHECK_INTERVAL } from "./timing.js";

/* ---------------------------------------------------------------------- */
/*                        Application lifetime                         */
/* ---------------------------------------------------------------------- */
let scene, camera, renderer, controls;
let celestialBodies = []; // everything selectable
let planets = []; // planet groups only
let planetConfigs = []; // JSON data
let simulationEpochJD = null;
let simulationEpochDateUtc = null;
let simulationEpochLabel = null;
let simulationFrameLabel = null;
let ephemerisMinJD = null;
let ephemerisMaxJD = null;

let clock;
let textureLoader;
let sunMesh;
let shadowManager;
let performanceTuner = null;

let isInitialized = false;

let memoryCheckIntervalId = null;
let resizeHandler = null;
let stopAnimationLoop = null;
let cleanupDateControl;

let orbitWorker;

/* ---------------------------------------------------------------------- */
/*                            Initialization                              */
/* ---------------------------------------------------------------------- */
export async function init() {
  logInfo("Init", "starting…");
  if (isInitialized) {
    logWarn("Init", "init called twice");
    return;
  }
  isInitialized = true;
  setSimulationSpeed(1);
  clearErrorMessage();

  // Emergency timeout to show error if stuck
  const emergencyTimeout = setTimeout(() => {
    logError("Init", "Init taking too long, forcing error display");
    showLoadingScreen(false);
    showErrorMessage("Initialization timed out. Check console for details.");
  }, 10000); // 10 second timeout

  try {
    ({ planetConfigs, simulationEpochJD, simulationEpochDateUtc, simulationEpochLabel,
      simulationFrameLabel, ephemerisMinJD, ephemerisMaxJD } = await loadPlanetData());
    logInfo("Init", "planet JSON loaded");

    /* Clock & texture loader */
    clock = createFrameTimer();
    textureLoader = initTextureLoader();
    setClock(clock);

    /* Initialize simulation worker for multithreading */
    orbitWorker = createOrbitWorkerClient({ simulationEpochJD, simulationEpochDateUtc });
    orbitWorker.initialize();

    /* Load Environment Map Texture FIRST */
    const environmentTexture = textureLoader.load(
      "Moon_JPG_Collection/hipparcos star map.jpg",
      () => {
        logDebug("Texture", "Environment map loaded");
      },
      undefined,
      (err) => {
        logError("Texture", "Failed to load environment map", err);
      }
    );
    environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
    environmentTexture.colorSpace = THREE.SRGBColorSpace;

    /* Scene / camera / renderer (Pass env map to scene setup) */
    scene = SceneSetup.setupScene(environmentTexture);
    camera = SceneSetup.setupCamera();
    const rendererChoice = await createRendererWithFallback();
    renderer = rendererChoice.renderer;
    const rendererKind = rendererChoice.type;
    logInfo("Renderer", `Using ${rendererKind.toUpperCase()} renderer`);
    controls = SceneSetup.setupControls(camera, renderer);

    setScene(scene);
    setCamera(camera);
    setControls(controls);
    setRenderer(renderer);

    attachResizeHandler();

    /* Lighting & UI */
    SceneSetup.setupLighting(scene);
    shadowManager = new ShadowManager(renderer);
    performanceTuner = new PerformanceTuner(renderer, shadowManager);
    UI.initUI();
    if (simulationEpochLabel) UI.setEpochLabel(simulationEpochLabel);
    if (simulationFrameLabel) UI.setFrameLabel(simulationFrameLabel);
    if (simulationEpochDateUtc) UI.setEpochDate(simulationEpochDateUtc);
    UI.setEphemerisMetadata({
      source: CONSTANTS.EPHEMERIS_SOURCE_NAME,
      minJD: ephemerisMinJD,
      maxJD: ephemerisMaxJD,
    });

    /* Loading splash */
    showLoadingScreen(true, "Loading textures…");

    /* Starfield and Sun (Pass pre-loaded env map texture) */
    createStarfield(scene, environmentTexture);
    const sunData = createSun(scene, textureLoader);
    sunMesh = sunData.mesh;
    celestialBodies.push(sunMesh);
    setSun(sunMesh);

    /* Planets & moons */
    logInfo("Init", "Creating planets and orbits...");
    const planetData = await createPlanetsAndOrbits(scene, textureLoader, planetConfigs);
    logInfo("Init", `Planets created: ${planetData.planets.length}`);
    planets = planetData.planets;
    celestialBodies.push(...planetData.celestialBodies);
    setPlanets(planets);
    setCelestialBodies(celestialBodies);

    // Initialize worker with static data and buffers once planets exist
    orbitWorker.initializePlanets(planets);

    /* Jupiter Trojans (needs planets to be created first) */
    if (CONSTANTS.JUPITER_TROJANS_ENABLED) {
      logInfo("JupiterTrojans", "Creating Jupiter Trojan asteroids...");
      createJupiterTrojans(scene, planets, planetConfigs);
    }

    /* Initialize simulation day from data epoch (fallback to J2000) */
    (function initSimulationDateFromEpoch() {
      const nowMs = Date.now();
      if (simulationEpochDateUtc) {
        const epochMs = Date.parse(simulationEpochDateUtc);
        if (Number.isFinite(epochMs)) {
          setSimulatedDays((nowMs - epochMs) / 86400000);
          return;
        }
      }
      if (Number.isFinite(simulationEpochJD)) {
        const nowJD = nowMs / 86400000 + 2440587.5; // Unix ms → JD (UTC)
        setSimulatedDays(nowJD - simulationEpochJD);
        return;
      }
      const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
      setSimulatedDays((nowMs - j2000) / 86400000);
    })();

    /* Optional asteroid belt */
    if (CONSTANTS.ASTEROID_BELT_ENABLED) {
      logInfo("AsteroidBelt", "Creating asteroid belt...");
      const belt = createAsteroidBelt(scene, textureLoader);
      setAsteroidBelt(belt);
      if (belt) {
        logInfo("AsteroidBelt", `Created with ${belt.children.length} asteroids`);
        logDebug("AsteroidBelt", "Position", belt.position);
        logDebug("AsteroidBelt", "Visible", belt.visible);
      } else {
        logWarn("AsteroidBelt", "Creation failed");
      }
    }

    /* Optional Kuiper belt */
    if (CONSTANTS.KUIPER_BELT_ENABLED) {
      logInfo("KuiperBelt", "Creating Kuiper belt...");
      const kuiperBelt = createKuiperBelt(scene, textureLoader);
      if (kuiperBelt) {
        logInfo("KuiperBelt", `Created with ${kuiperBelt.children.length} groups`);
        logDebug("KuiperBelt", "Position", kuiperBelt.position);
        logDebug("KuiperBelt", "Visible", kuiperBelt.visible);

        // Add named Kuiper Belt objects to celestial bodies for selection/labels
        kuiperBelt.traverse((child) => {
          if (child.userData && child.userData.type === "dwarf_planet") {
            celestialBodies.push(child);
          }
        });
      } else {
        logWarn("KuiperBelt", "Creation failed");
      }
    }

    /* Cache list of moons once to avoid per-frame traversals */
    try {
      const moons = [];
      planets.forEach((planet) => {
        planet.traverse((child) => {
          if (child?.userData?.type === "moon") moons.push(child);
        });
      });
      setMoons(moons);
    } catch (err) {
      logDebug("Init", "moon cache error", err);
    }

    // Build DOM labels once up‑front (no per‑frame rebuilds)
    try {
      const bodiesForLabels = [...planets];
      if (sunMesh) bodiesForLabels.push(sunMesh);
      const moonsList = getMoons();
      if (Array.isArray(moonsList)) bodiesForLabels.push(...moonsList);
      UI.buildInitialLabels(bodiesForLabels);
    } catch (err) {
      logDebug("UI", "initial label build error", err);
    }

    /* Dropdown builder */
    setupPlanetDropdown(planets, sunMesh);

    clearTimeout(emergencyTimeout);
    showLoadingScreen(false);
    clearErrorMessage();

    /* Event hooks */
    if (!celestialBodies || celestialBodies.length === 0) {
      logError("Init", "CRITICAL: celestialBodies array is empty or invalid!");
    }
    setupPointerEvents(scene, camera, renderer, celestialBodies);
    setupUIControls(planetConfigs, celestialBodies, scene);
    // User gestures cancel automatic framing while preserving target tracking.
    setupZoomDetection(renderer, controls);
    setupKeyboardShortcuts(scene);

    /* Date picker setup */
    cleanupDateControl = setupDatePicker({ simulationEpochJD, simulationEpochDateUtc });

    /* Kick off animation loop */
    stopAnimationLoop = startAnimationLoop({ scene, camera, renderer, controls, clock, planets, celestialBodies, shadowManager, performanceTuner, orbitWorker });
    if (!memoryCheckIntervalId) {
      memoryCheckIntervalId = setInterval(checkMemoryUsage, MEMORY_CHECK_INTERVAL);
    }
    logInfo("Init", "done");
  } catch (err) {
    clearTimeout(emergencyTimeout);
    logError("Init", "failed", err);
    showLoadingScreen(false);
    showErrorMessage(err.message || "Unknown error during init");
    isInitialized = false;
  }
}

function attachResizeHandler() {
  detachResizeHandler();
  resizeHandler = () => {
    if (camera && renderer) {
      SceneSetup.handleWindowResize(camera, renderer);
    }
  };
  onResize(resizeHandler);
}

function detachResizeHandler() {
  if (resizeHandler) {
    offResize(resizeHandler);
    resizeHandler = null;
  }
}

/**
 * Clean up all resources to prevent memory leaks
 */
export function cleanup() {
  logInfo("Cleanup", "Starting cleanup");

  stopAnimationLoop?.();
  stopAnimationLoop = null;

  detachResizeHandler();
  cleanupControls();
  cleanupPointerListeners();
  cleanupZoomDetectionListeners();
  cleanupKeyboardShortcuts();
  controls?.dispose();
  cleanupDateControl?.();
  cleanupDateControl = null;

  if (memoryCheckIntervalId) {
    clearInterval(memoryCheckIntervalId);
    memoryCheckIntervalId = null;
  }
  performanceTuner = null;
  // Clean up renderer DOM element before disposing
  if (renderer?.domElement?.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  // Clean up UI resources
  UI.cleanupUI();

  // Dispose scene objects
  if (scene) {
    scene.traverse((object) => {
      const disposeHook = object?.userData?.dispose;
      if (typeof disposeHook === "function") {
        try {
          disposeHook();
        } catch (err) {
          logDebug("Cleanup", "user dispose hook error", err);
        }
      }
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => {
            if (material.map) material.map.dispose();
            material.dispose();
          });
        } else {
          if (object.material.map) object.material.map.dispose();
          object.material.dispose();
        }
      }
    });
    scene.clear();
  }

  // Clean up renderer
  if (renderer) {
    renderer.dispose();
  }

  disposeBeltWorker();
  orbitWorker?.dispose();
  orbitWorker = null;

  // Clear texture cache
  try {
    clearTextureCache?.();
  } catch (err) {
    logDebug("Cleanup", "texture cache clear error", err);
  }

  // Clear arrays
  celestialBodies.length = 0;
  planets.length = 0;
  planetConfigs.length = 0;

  // Reset state
  isInitialized = false;
  scene = null;
  camera = null;
  renderer = null;
  controls = null;
  simulationEpochJD = null;
  simulationEpochDateUtc = null;
  simulationEpochLabel = null;
  simulationFrameLabel = null;
  ephemerisMinJD = null;
  ephemerisMaxJD = null;
  shadowManager = null;
  resetState();
  clearEventListeners();

  logInfo("Cleanup", "completed");
}
