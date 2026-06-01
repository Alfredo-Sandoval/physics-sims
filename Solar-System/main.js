// File: Solar-System/main.js
// --- Main Module — Solar System Simulation ----------------------------
import * as THREE from "./vendor/three/build/three.module.js";
import * as CONSTANTS from "./constants.js";

import * as SceneSetup from "./sceneSetup.js";
import * as UI from "./ui.js";
import * as Controls from "./controls.js";
import { ShadowManager } from "./shadowManager.js";

import { createStarfield } from "./starfield.js";
import { createSun, createPlanetsAndOrbits } from "./celestialBodies.js";
import { createAsteroidBelt, updateAsteroidBelt } from "./asteroidbelt.js";
import { createKuiperBelt, updateKuiperBelt } from "./kuiperbelt.js";
import { findCelestialBodyByName, clearTextureCache, getMoonLocalPosition } from "./utils.js";
import {
  applyMoonJ2PrecessionStep,
  getPlanetRadiusForMoonPrecession,
} from "./orbitalRuntime.js";
import { updateScene } from "./animation.js";
import { onResize, offResize } from "./viewport.js";
import {
  getSimulationSpeed,
  getSimulatedDays,
  getMoons,
  getAsteroidBelt,
  getClock,
  setScene,
  setCamera,
  setRenderer,
  setControls,
  setClock,
  setPlanets,
  setCelestialBodies,
  setMoons,
  setSun,
  setAsteroidBelt,
  setSimulationSpeed,
  setSimulatedDays,
  updateFollowTarget,
  stopCameraFollow,
  getFollowTarget,
  getFollowDistance,
  getSelectedObject,
  resetState,
} from "./appState.js";
import { on as eventOn, clearListeners as clearEventListeners } from "./eventBus.js";
import {
  debug as logDebug,
  info as logInfo,
  warn as logWarn,
  error as logError,
} from "./logger.js";
import { initTextureLoader } from "./textureService.js";
import { PerformanceTuner } from "./performanceTuner.js";
import { createRendererWithFallback } from "./rendererFactory.js";

/* ---------------------------------------------------------------------- */
/*                        Global state (exported)                         */
/* ---------------------------------------------------------------------- */
let scene, camera, renderer, controls;
let celestialBodies = []; // everything selectable
let planets = []; // planet groups only
let planetConfigs = []; // JSON data
let simulationEpochJD = null;
let simulationEpochDateUtc = null;
let simulationEpochLabel = null;
let simulationFrameLabel = null;

let clock;
let textureLoader;
let sunMesh;
let shadowManager;
let performanceTuner = null;

let isInitialized = false;

let memoryCheckIntervalId = null;
let resizeHandler = null;
let animationFrameId = null;
let isSeekingSimDays = false;

// Multithreading support
let simulationWorker = null;
let workerReady = false;
// Typed-array position streaming (double-buffered)
let posBuffers = [];
let posAvailableBuffers = [];
let posInFlight = false;
// Returned buffer waiting to be applied
let pendingPositionBuffer = null;
// Avoid flooding rotation requests
let rotationInFlight = false;
const workerMoonPosScratch = new THREE.Vector3();

// Preference: allow enabling/disabling the worker via URL or localStorage
function shouldUseWorker() {
  // URL param takes precedence: ?worker=on|off|true|false|1|0
  try {
    const usp = new URL(window.location.href).searchParams;
    const p = usp.get("worker");
    if (p !== null) {
      const v = String(p).toLowerCase();
      return !(v === "off" || v === "false" || v === "0");
    }
  } catch {}
  // Fallback to localStorage key 'sim:useWorker'
  try {
    const s = localStorage.getItem("sim:useWorker");
    if (s !== null) return s === "true";
  } catch {}
  // Default: enable worker
  return true;
}

function resetWorkerStreamingState() {
  posBuffers = [];
  posAvailableBuffers = [];
  posInFlight = false;
  pendingPositionBuffer = null;
  rotationInFlight = false;
}

function failoverToMainThread(reason, error = null) {
  if (error) {
    logError("Worker", reason, error);
  } else {
    logWarn("Worker", reason);
  }

  workerReady = false;
  resetWorkerStreamingState();

  if (!simulationWorker) return;
  try {
    simulationWorker.terminate();
  } catch (terminateError) {
    logDebug("Worker", "worker terminate error during failover", terminateError);
  }
  simulationWorker = null;
}

function getWorkerOutBuffer(payload) {
  const nested = payload?.data?.outBuffer;
  if (nested instanceof ArrayBuffer) return nested;

  const topLevel = payload?.outBuffer;
  if (topLevel instanceof ArrayBuffer) return topLevel;

  return null;
}

// Apply position updates from worker to Three.js scene
function applyWorkerPositionUpdates(updates) {
  if (!planets) return;
  if (pendingPositionBuffer) {
    // Fast path: typed array positions [x,y,z]*
    const arr = new Float32Array(pendingPositionBuffer);
    const n = Math.min(planets.length, Math.floor(arr.length / 3));
    for (let i = 0; i < n; i++) {
      const base = i * 3;
      planets[i].position.set(arr[base + 0], arr[base + 1], arr[base + 2]);
    }
    pendingPositionBuffer = null;
    return;
  }
  // Legacy object path
  if (!updates) return;
  planets.forEach((group, index) => {
    const update = updates[index];
    if (update && update.position) {
      group.position.set(update.position.x, update.position.y, update.position.z);
    }
  });
}

// Apply rotation updates from worker to Three.js scene
function applyWorkerRotationUpdates(updates) {
  if (!updates || !planets) return;

  planets.forEach((group, index) => {
    const update = updates[index];
    if (!update) return;

    const ud = group.userData;
    const mesh = ud.planetMesh;
    const parentRadius = getPlanetRadiusForMoonPrecession(ud);

    // Planet rotation
    if (mesh?.isMesh) {
      mesh.rotation.y += update.rotation;

      // Cloud layer
      if (mesh.userData.cloudMesh?.isMesh) {
        mesh.userData.cloudMesh.rotation.y +=
          update.rotation * CONSTANTS.CLOUD_ROTATION_SPEED_MULTIPLIER;
      }
    }

    // Moon updates
    group.traverse((child) => {
      if (!child.isMesh || child.userData.type !== "moon") return;
      const mu = child.userData;
      const moonIndex = child.userData.moonIndex;

      if (update.moons && update.moons[moonIndex]) {
        const moonUpdate = update.moons[moonIndex];

        // Moon rotation
        child.rotation.y += moonUpdate.rotation;

        // Moon orbit
        const nextMeanAnomaly = (mu.currentMeanAnomaly ?? mu.currentAngle ?? 0) + moonUpdate.orbit;
        mu.currentMeanAnomaly = THREE.MathUtils.euclideanModulo(nextMeanAnomaly, 2 * Math.PI);
        mu.currentAngle = mu.currentMeanAnomaly;
        applyMoonJ2PrecessionStep(mu, ud?.name, parentRadius, moonUpdate.orbit);
        child.position.copy(
          getMoonLocalPosition(
            mu.currentMeanAnomaly,
            mu,
            group?.userData?.axialTilt ?? 0,
            workerMoonPosScratch
          )
        );
      }
    });
  });
}

// Send position update request to worker
function requestPositionUpdates(planets, simulatedDays) {
  if (!workerReady || !simulationWorker) return;

  // Prefer typed-array buffer to minimize per-frame cloning/GC
  if (!posInFlight) {
    const buffer = posAvailableBuffers.pop();
    if (buffer) {
      try {
        posInFlight = true;
        simulationWorker.postMessage(
          {
            type: "UPDATE_POSITIONS_BUFFER",
            data: {
              simulatedDays,
              orbitScaleFactor: CONSTANTS.ORBIT_SCALE_FACTOR,
              outBuffer: buffer,
            },
          },
          [buffer]
        );
      } catch (error) {
        posInFlight = false;
        failoverToMainThread(
          "Failed to send UPDATE_POSITIONS_BUFFER request; using main-thread mode",
          error
        );
      }
      return;
    }
  }

  // Fallback to legacy object-based path if buffers not ready yet
  const planetData = planets.map((group) => ({ config: group.userData.config }));
  try {
    simulationWorker.postMessage({
      type: "UPDATE_POSITIONS",
      data: { planets: planetData, simulatedDays, orbitScaleFactor: CONSTANTS.ORBIT_SCALE_FACTOR },
    });
  } catch (error) {
    failoverToMainThread("Failed to send UPDATE_POSITIONS request; using main-thread mode", error);
  }
}

// Send rotation update request to worker
function requestRotationUpdates(planets, delta, simulationSpeed) {
  if (!workerReady || !simulationWorker || rotationInFlight) return;

  const planetData = planets.map((group) => {
    const ud = group.userData;
    let moonMeshes = ud.__moonMeshes;

    if (!Array.isArray(moonMeshes)) {
      moonMeshes = [];
      group.traverse((child) => {
        if (!child?.isMesh || child.userData?.type !== "moon") return;
        moonMeshes.push(child);
      });
      ud.__moonMeshes = moonMeshes;
    }

    return {
      config: ud.config,
      moons: moonMeshes.map((moon, index) => {
        moon.userData.moonIndex = index;
        const mu = moon.userData;
        const cfg = mu?.config;
        return {
          calculatedRotationSpeed: mu.rotationSpeed ?? cfg?.calculatedRotationSpeed,
          rotationDirection: mu.rotationDirection ?? cfg?.rotationDirection,
          calculatedOrbitSpeed: mu.orbitSpeed ?? cfg?.calculatedOrbitSpeed,
          orbitDirection: mu.orbitDirection ?? cfg?.orbitDirection,
        };
      }),
    };
  });

  rotationInFlight = true;
  try {
    simulationWorker.postMessage({
      type: "UPDATE_ROTATIONS",
      data: {
        planets: planetData,
        delta: delta,
        simulationSpeed: simulationSpeed,
      },
    });
  } catch (error) {
    rotationInFlight = false;
    failoverToMainThread("Failed to send UPDATE_ROTATIONS request; using main-thread mode", error);
  }
}

/* ---------------------------------------------------------------------- */
/*                      Simulation Worker (Multithreading)                */
/* ---------------------------------------------------------------------- */
function initSimulationWorker() {
  if (!shouldUseWorker()) {
    workerReady = false;
    resetWorkerStreamingState();
    if (simulationWorker) {
      try {
        simulationWorker.terminate();
      } catch (err) {
        logDebug("Worker", "worker terminate error while disabling", err);
      }
      simulationWorker = null;
    }
    logInfo("Worker", "disabled by setting (URL/localStorage)");
    return;
  }
  try {
    simulationWorker = new Worker(new URL("./simulation-worker.js", import.meta.url), {
      type: "module",
    });
    logInfo("Worker", "Simulation worker initialized");

    simulationWorker.onmessage = function (e) {
      try {
        const payload = e?.data;
        const type = payload?.type;
        const data = payload?.data;

        switch (type) {
          case "INIT_DONE":
            workerReady = true;
            logInfo("Worker", "INIT_DONE received");
            break;
          case "POSITIONS_UPDATED":
            applyWorkerPositionUpdates(data);
            break;
          case "POSITIONS_UPDATED_BUFFER": {
            // Support both payload shapes:
            // { type, data: { outBuffer } } and { type, outBuffer }.
            const outBuffer = getWorkerOutBuffer(payload);
            posInFlight = false;
            if (!outBuffer) {
              logWarn("Worker", "POSITIONS_UPDATED_BUFFER missing outBuffer; skipping frame");
              break;
            }
            pendingPositionBuffer = outBuffer;
            posAvailableBuffers.push(outBuffer);
            applyWorkerPositionUpdates(null);
            break;
          }
          case "ROTATIONS_UPDATED":
            rotationInFlight = false;
            applyWorkerRotationUpdates(data); // delta already accounted in worker
            break;
          default:
            logWarn("Worker", "Unknown message type:", type);
        }
      } catch (error) {
        failoverToMainThread("Worker message handling failed; switching to main-thread mode", error);
      }
    };

    simulationWorker.onerror = function (error) {
      failoverToMainThread("Worker error; switching to main-thread mode", error);
    };

    simulationWorker.onmessageerror = function (error) {
      failoverToMainThread("Worker message deserialization failed; switching to main-thread mode", error);
    };

    // workerReady flips true after we send INIT and receive INIT_DONE
  } catch (error) {
    failoverToMainThread("Failed to initialize simulation worker; using main-thread mode", error);
  }
}

// Send static orbital data to worker and allocate buffers
function initWorkerPlanetData(planets) {
  if (!simulationWorker || !Array.isArray(planets)) return;
  const payload = planets.map((group) => {
    const cfg = group?.userData?.config || {};
    return {
      a: cfg.orbitRadiusAU,
      e: cfg.info?.orbitalEccentricity ?? 0,
      iDeg: cfg.kepler?.inclinationDeg ?? cfg.info?.orbitalInclinationDeg ?? 0,
      OmegaDeg: cfg.kepler?.longAscNodeDeg ?? 0,
      omegaDeg: cfg.kepler?.argPeriapsisDeg ?? 0,
      M0Deg: cfg.kepler?.meanAnomalyDeg ?? 0,
      epochJD: cfg.kepler?.epochJD ?? simulationEpochJD ?? null,
      epochDateUtc: cfg.kepler?.epochDateUtc ?? simulationEpochDateUtc ?? null,
      ephemeris: cfg.ephemeris ?? null,
      __configForLegacy: cfg,
    };
  });
  try {
    simulationWorker.postMessage({
      type: "INIT",
      data: {
        planets: payload,
        epochJD: simulationEpochJD ?? null,
        epochDateUtc: simulationEpochDateUtc ?? null,
      },
    });
  } catch (error) {
    failoverToMainThread("Failed to send INIT payload to worker; using main-thread mode", error);
    return;
  }

  // Double-buffer positions: [x,y,z] float32 per planet
  const count = planets.length;
  const bytes = count * 3 * 4;
  posBuffers = [new ArrayBuffer(bytes), new ArrayBuffer(bytes)];
  posAvailableBuffers = [...posBuffers];
  posInFlight = false;
}

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
    await loadPlanetData();
    logInfo("Init", "planet JSON loaded");

    /* Clock & texture loader */
    clock = new THREE.Clock();
    textureLoader = initTextureLoader(new URL("./textures/", import.meta.url).toString());
    setClock(clock);

    /* Initialize simulation worker for multithreading */
    initSimulationWorker();

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
    initWorkerPlanetData(planets);

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
    Controls.setupPointerEvents(scene, camera, renderer, celestialBodies);
    Controls.setupUIControls(planetConfigs, celestialBodies, scene);
    // Detect manual zoom/drag to disable follow-mode promptly
    Controls.setupZoomDetection(renderer, controls);
    Controls.setupKeyboardShortcuts(scene);

    /* Date picker setup */
    setupDatePicker();

    /* Kick off animation loop */
    startAnimationLoop();
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

function createJupiterTrojans(scene, planets, planetConfigs) {
  // Find Jupiter
  const jupiterPlanet = planets.find((p) => p.userData.name === "Jupiter");
  if (!jupiterPlanet) {
    logWarn("JupiterTrojans", "Jupiter not found, skipping Trojans");
    return;
  }

  const jupiterConfig = planetConfigs.find((p) => p.name === "Jupiter");
  if (!jupiterConfig) {
    logWarn("JupiterTrojans", "Jupiter config not found, skipping Trojans");
    return;
  }

  // The entire trojansGroup rotates around Y to track Jupiter's orbital angle
  const trojansGroup = new THREE.Group();
  trojansGroup.name = "JupiterTrojans";
  trojansGroup.userData.jupiterPlanet = jupiterPlanet;
  scene.add(trojansGroup);

  const jupiterAU = jupiterConfig.orbitRadiusAU;
  const jupiterScalePos = jupiterAU * CONSTANTS.ORBIT_SCALE_FACTOR;

  const l4Angle = (CONSTANTS.JUPITER_L4_OFFSET_DEG * Math.PI) / 180;
  const l5Angle = (CONSTANTS.JUPITER_L5_OFFSET_DEG * Math.PI) / 180;

  const l4Count = Math.floor(CONSTANTS.JUPITER_TROJANS_COUNT / 2);
  const l5Count = CONSTANTS.JUPITER_TROJANS_COUNT - l4Count;

  const trojanMaterial = new THREE.MeshStandardMaterial({
    color: CONSTANTS.JUPITER_TROJAN_COLOR,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: false,
    side: THREE.FrontSide,
  });

  const geom = new THREE.IcosahedronGeometry(1, 0);

  // Use InstancedMesh for L4 and L5 groups (single draw call each)
  function createTrojansInstanced(centerAngle, count, pointName) {
    const inst = new THREE.InstancedMesh(geom, trojanMaterial, count);
    inst.name = `Jupiter${pointName}`;
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = CONSTANTS.ENABLE_FRUSTUM_CULLING;

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const angleSpread =
        (Math.random() - 0.5) * 2 * ((CONSTANTS.JUPITER_TROJAN_SPREAD_DEG * Math.PI) / 180);
      const distanceSpread = (Math.random() - 0.5) * 2;
      const inclination =
        (Math.random() - 0.5) * 2 * ((CONSTANTS.JUPITER_TROJAN_INCLINATION_MAX_DEG * Math.PI) / 180);

      const angle = centerAngle + angleSpread;
      const distance = jupiterScalePos + distanceSpread * CONSTANTS.ORBIT_SCALE_FACTOR;

      pos.set(
        distance * Math.cos(angle),
        distance * Math.sin(inclination) * 0.1,
        distance * Math.sin(angle)
      );

      const size = THREE.MathUtils.randFloat(
        CONSTANTS.JUPITER_TROJAN_SIZE_MIN,
        CONSTANTS.JUPITER_TROJAN_SIZE_MAX
      );
      scl.setScalar(size);

      quat.setFromEuler(new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      ));

      matrix.compose(pos, quat, scl);
      inst.setMatrixAt(i, matrix);
    }

    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }

  trojansGroup.add(createTrojansInstanced(l4Angle, l4Count, "L4"));
  trojansGroup.add(createTrojansInstanced(l5Angle, l5Count, "L5"));

  logInfo("JupiterTrojans", `Created ${l4Count} L4 and ${l5Count} L5 Trojans (instanced)`);
}

// Update Jupiter Trojans to co-orbit with Jupiter (called per-frame)
function updateJupiterTrojans(scene, planets) {
  const trojansGroup = scene.getObjectByName("JupiterTrojans");
  if (!trojansGroup) return;

  const jupiter = trojansGroup.userData.jupiterPlanet;
  if (!jupiter) return;

  // Compute Jupiter's current orbital angle from its position in the XZ plane
  const jx = jupiter.position.x;
  const jz = jupiter.position.z;
  const jupiterAngle = Math.atan2(jz, jx);

  // Rotate the entire Trojan group to match Jupiter's angular position
  trojansGroup.rotation.y = -jupiterAngle;
}

/* ---------------------------------------------------------------------- */
/*                       Screenshot (middle-click)                        */
/* ---------------------------------------------------------------------- */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function defaultScreenshotName() {
  const d = new Date();
  return `solar-sim_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.png`;
}

function captureScreenshot(filename = defaultScreenshotName()) {
  try {
    if (!renderer || !scene || !camera) throw new Error("Renderer/scene/camera missing");

    const size = new THREE.Vector2();
    renderer.getSize(size);
    const ratio = renderer.getPixelRatio();
    const width = Math.max(1, Math.floor(size.x * ratio));
    const height = Math.max(1, Math.floor(size.y * ratio));

    const rt = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    rt.texture.colorSpace = THREE.SRGBColorSpace;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevTarget);

    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, width, height, pixels);
    rt.dispose();

    // Flip Y and write to a canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(width, height);
    const row = width * 4;
    for (let y = 0; y < height; y++) {
      const srcStart = (height - 1 - y) * row;
      const dstStart = y * row;
      img.data.set(pixels.subarray(srcStart, srcStart + row), dstStart);
    }
    ctx.putImageData(img, 0, 0);

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    logError("Screenshot", "Failed", e);
  }
}

/* ---------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------- */
/*                         Animation loop                                 */
/* ---------------------------------------------------------------------- */
function startAnimationLoop() {
  logInfo("Animation", "startAnimationLoop called");
  const targetWorldPos = new THREE.Vector3(); // Cache vector for target position
  const idealCamPos = new THREE.Vector3(); // Cache vector for ideal camera position
  const followDirection = new THREE.Vector3(); // Direction used for follow offsets
  const parentWorldPos = new THREE.Vector3(); // Parent position cache for moons
  const upVector = new THREE.Vector3(0, 1, 0); // Global up for gentle elevation bias

  const CAMERA_DISTANCE_PADDING = 1.35;
  const CAMERA_VERTICAL_OFFSET_RATIO = 0.22;
  const MIN_RADIUS_FALLBACK = 0.75;
  const worldScaleScratch = new THREE.Vector3();

  const getWorldScaleFactor = (object) => {
    if (!object) return 1;
    if (typeof object.getWorldScale === "function") {
      object.getWorldScale(worldScaleScratch);
      const sx = Math.abs(worldScaleScratch.x || 0);
      const sy = Math.abs(worldScaleScratch.y || 0);
      const sz = Math.abs(worldScaleScratch.z || 0);
      const scale = Math.max(sx, sy, sz);
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }
    const sx = Math.abs(object.scale?.x ?? 1);
    const sy = Math.abs(object.scale?.y ?? sx);
    const sz = Math.abs(object.scale?.z ?? sx);
    return Math.max(sx, sy, sz, 1);
  };

  const getApproxSceneRadius = (object) => {
    if (!object) return MIN_RADIUS_FALLBACK;
    const ud = object.userData ?? {};

    const planetMesh = ud.planetMesh;
    if (planetMesh?.geometry?.parameters?.radius) {
      return Math.max(
        MIN_RADIUS_FALLBACK,
        planetMesh.geometry.parameters.radius * getWorldScaleFactor(planetMesh)
      );
    }

    const geometry = object.geometry;
    if (geometry?.parameters?.radius) {
      return Math.max(
        MIN_RADIUS_FALLBACK,
        geometry.parameters.radius * getWorldScaleFactor(object)
      );
    }

    if (typeof ud.displayRadius === "number" && Number.isFinite(ud.displayRadius)) {
      return Math.max(MIN_RADIUS_FALLBACK, ud.displayRadius);
    }

    const scaledRadius = ud.config?.scaledRadius ?? ud.config?.scaledRadiusDisplayUnits;
    if (typeof scaledRadius === "number" && Number.isFinite(scaledRadius)) {
      return Math.max(MIN_RADIUS_FALLBACK, scaledRadius);
    }

    if (geometry?.boundingSphere?.radius) {
      return Math.max(MIN_RADIUS_FALLBACK, geometry.boundingSphere.radius);
    }

    return MIN_RADIUS_FALLBACK;
  };

  // Throttle expensive UI work to ~30fps
  let lastUiUpdateMs = 0;
  let uiUpdateIntervalMs = performanceTuner?.getUiIntervalMs?.() ?? 33; // ~30fps

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const currentSpeed = getSimulationSpeed() ?? 1.0;
    const delta = clock.getDelta();
    if (performanceTuner) {
      uiUpdateIntervalMs = performanceTuner.tick(delta) ?? uiUpdateIntervalMs;
    }

    // Multithreaded updates
    if (workerReady) {
      const simulatedDays = getSimulatedDays();
      // Request NEW updates; worker messages will apply results when they arrive
      requestPositionUpdates(planets, simulatedDays);
      requestRotationUpdates(planets, delta, currentSpeed);
    } else {
      // Fallback to single-threaded updates. Use the same delta we just sampled
      // so timing is consistent within this frame, and let updateScene handle
      // simulation-day advancement and belt updates.
      updateScene(currentSpeed, delta);
    }

    // Update simulation days and belts only in worker mode.
    // In single-threaded mode, updateScene already advanced days and belts.
    if (workerReady) {
      const currentDays = getSimulatedDays();
      const add =
        currentSpeed > 0 && CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X > 0
          ? delta * currentSpeed * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X
          : 0;
      const total = (currentDays || 0) + add;
      setSimulatedDays(total);
      UI.updateDayCounter(Math.floor(total));

      const belt = getAsteroidBelt();
      if (belt) updateAsteroidBelt(belt, delta);

      const kuiperBelt = scene.getObjectByName("KuiperBelt");
      if (kuiperBelt) updateKuiperBelt(kuiperBelt, delta);
    }

    // Update Jupiter Trojans to co-orbit with Jupiter
    if (CONSTANTS.JUPITER_TROJANS_ENABLED) {
      updateJupiterTrojans(scene, planets);
    }

    // Camera following logic (pause while user manually interacts)
    const userInteracting =
      typeof Controls.getIsManualZoom === "function" ? Controls.getIsManualZoom() : false;
    const followTarget = getFollowTarget();
    if (followTarget && followTarget.userData && !userInteracting) {
      followTarget.getWorldPosition(targetWorldPos);

      const userData = followTarget.userData;
      const targetRadius = getApproxSceneRadius(followTarget);
      let desiredDistance = Math.max(
        getFollowDistance() || 0,
        targetRadius * CAMERA_DISTANCE_PADDING
      );

      const type = userData.type;
      if (type === "planet") {
        desiredDistance = Math.max(
          desiredDistance,
          targetRadius * CONSTANTS.PLANET_CAMERA_DISTANCE_MULTIPLIER
        );
        followDirection.copy(camera.position).sub(targetWorldPos);
      } else if (type === "moon") {
        desiredDistance = Math.max(
          desiredDistance,
          targetRadius * CONSTANTS.MOON_CAMERA_DISTANCE_MULTIPLIER
        );
        const parentName = userData.parentPlanetName;
        const parentObject = parentName
          ? findCelestialBodyByName(parentName, celestialBodies)
          : null;
        if (parentObject) {
          parentObject.getWorldPosition(parentWorldPos);
          followDirection.copy(targetWorldPos).sub(parentWorldPos);
        } else {
          followDirection.copy(targetWorldPos);
        }
      } else {
        if (type === "star") {
          desiredDistance = Math.max(desiredDistance, 80);
        }
        followDirection.copy(camera.position).sub(targetWorldPos);
      }

      if (followDirection.lengthSq() < 1e-8) {
        followDirection.set(0, 0, 1);
      } else {
        followDirection.normalize();
      }

      const safetyDistance = Math.max(desiredDistance, targetRadius * CAMERA_DISTANCE_PADDING);
      if (type === "planet" || type === "moon") {
        const radialPadding = Math.max(targetRadius * 0.8, 2);
        idealCamPos
          .copy(targetWorldPos)
          .addScaledVector(followDirection, safetyDistance + radialPadding)
          .addScaledVector(upVector, safetyDistance * CAMERA_VERTICAL_OFFSET_RATIO);
      } else {
        idealCamPos.copy(targetWorldPos).addScaledVector(followDirection, safetyDistance);
      }

      const alpha = 1 - Math.exp(-CONSTANTS.CAMERA_FOLLOW_LERP_FACTOR * delta);
      camera.position.lerp(idealCamPos, alpha);
      controls.target.lerp(targetWorldPos, alpha);
    }

    // OrbitControls update
    if (controls) {
      // Let OrbitControls handle wheel dolly; avoid per-frame minDistance clamps
      // that can fight the user's scroll wheel. We now update minDistance when
      // the follow target changes (see appState.updateFollowTarget).
      controls.update();
      SceneSetup.updateBounceLight(camera);
    }

    // UI (throttled): text readouts + info panel follow
    const nowMs = performance.now();
    if (nowMs - lastUiUpdateMs >= uiUpdateIntervalMs) {
      lastUiUpdateMs = nowMs;
      UI.updateUIDisplay(currentSpeed);
      UI.updateInfoFollow(camera);
    }

    // Update labels every frame to prevent jitter during camera movement
    UI.updatePlanetLabels(camera, celestialBodies);

    // Update shadows with performance optimization
    shadowManager.update(performance.now());

    // Auto‑exposure based on camera distance to Sun (origin)
    if (renderer && camera) {
      const dist = camera.position.length();
      const exp = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(
          dist,
          100,
          CONSTANTS.STARFIELD_RADIUS,
          CONSTANTS.TONE_MAPPING_EXPOSURE_MIN,
          CONSTANTS.TONE_MAPPING_EXPOSURE_MAX
        ),
        CONSTANTS.TONE_MAPPING_EXPOSURE_MIN,
        CONSTANTS.TONE_MAPPING_EXPOSURE_MAX
      );
      renderer.toneMappingExposure = exp;
    }

    // render frame
    renderer?.render(scene, camera);
  }

  if (getClock()) {
    animate(); // Start the loop
  } else {
    logError("Animation", "Clock not initialized, cannot start loop");
  }

}

// Smoothly adjust simulated days from 'fromDays' to 'toDays' over 'durationMs'
function tweenSimulationDays(fromDays, toDays, durationMs = 1500, onDone) {
  if (!Number.isFinite(fromDays) || !Number.isFinite(toDays) || durationMs <= 0) {
    setSimulatedDays(toDays);
    if (typeof onDone === "function") onDone();
    return;
  }
  if (isSeekingSimDays) return; // prevent overlapping seeks
  isSeekingSimDays = true;
  const start = performance.now();
  const dist = toDays - fromDays;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const t = Math.min(1, (now - start) / durationMs);
    const days = fromDays + dist * easeOutCubic(t);
    setSimulatedDays(days);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      setSimulatedDays(toDays);
      isSeekingSimDays = false;
      if (typeof onDone === "function") onDone();
    }
  }
  requestAnimationFrame(step);
}

/* ---------------------------------------------------------------------- */
/*                        Date Picker (time travel)                       */
/* ---------------------------------------------------------------------- */
function setupDatePicker() {
  const input = document.getElementById("datePicker");
  if (!input) return;

  // Set initial value to today
  const today = new Date();
  input.value = today.toISOString().slice(0, 10);

  input.addEventListener("change", (e) => {
    const dateStr = e.target.value;
    if (!dateStr) return;

    const targetDate = new Date(dateStr + "T12:00:00Z");
    const targetMs = targetDate.getTime();
    if (!Number.isFinite(targetMs)) return;

    let newDays;
    if (simulationEpochDateUtc) {
      const epochMs = Date.parse(simulationEpochDateUtc);
      if (Number.isFinite(epochMs)) {
        newDays = (targetMs - epochMs) / 86400000;
      }
    }
    if (newDays == null && Number.isFinite(simulationEpochJD)) {
      const targetJD = targetMs / 86400000 + 2440587.5;
      newDays = targetJD - simulationEpochJD;
    }
    if (newDays == null) {
      const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
      newDays = (targetMs - j2000) / 86400000;
    }

    const currentDays = getSimulatedDays() || 0;
    tweenSimulationDays(currentDays, newDays, 1500);
  });
}

/* ---------------------------------------------------------------------- */
/*                       JSON data loader                                 */
/* ---------------------------------------------------------------------- */
async function loadPlanetData() {
  logInfo("LoadData", "Starting JSON fetch...");
  const res = await fetch(new URL("./solarsystem_data.json", import.meta.url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  logDebug("LoadData", "JSON fetched, parsing...");
  planetConfigs = await res.json();
  logInfo("LoadData", `JSON parsed, got ${planetConfigs.length} planets`);

  const epochMeta = planetConfigs?.[0]?.kepler || {};
  const ephemerisMeta = planetConfigs?.[0]?.ephemeris || {};
  simulationEpochJD = Number.isFinite(epochMeta.epochJD) ? epochMeta.epochJD : null;
  simulationEpochDateUtc = epochMeta.epochDateUtc || null;
  simulationEpochLabel = epochMeta.epochDate || epochMeta.epoch || null;
  const referenceFrame = epochMeta.referenceFrame || ephemerisMeta.frame || null;
  const referenceCenter = epochMeta.referenceCenter || ephemerisMeta.center || null;
  const referenceTimescale = epochMeta.timescale || ephemerisMeta.timescale || null;
  if (referenceFrame) {
    simulationFrameLabel = `${referenceFrame}${referenceCenter ? ` · ${referenceCenter}` : ""}${
      referenceTimescale ? ` (${referenceTimescale})` : ""
    }`;
  } else {
    simulationFrameLabel = null;
  }

  planetConfigs.forEach((cfg, index) => {
    try {
      logDebug("LoadData", `Processing planet ${index}: ${cfg.name}`);
      // Validate orbital data consistency from Horizons
      const issues = [];
      if (!Number.isFinite(cfg.orbitRadiusAU) || cfg.orbitRadiusAU <= 0) {
        issues.push("orbitRadiusAU");
      }
      if (!Number.isFinite(cfg.info?.orbitalEccentricity)) {
        issues.push("orbitalEccentricity");
      }
      const k = cfg.kepler || {};
      const requiredKepler = ["inclinationDeg", "longAscNodeDeg", "argPeriapsisDeg", "meanAnomalyDeg"];
      requiredKepler.forEach((key) => {
        if (!Number.isFinite(k[key])) issues.push(`kepler.${key}`);
      });
      if (Number.isFinite(simulationEpochJD) && Number.isFinite(k.epochJD)) {
        const drift = Math.abs(k.epochJD - simulationEpochJD);
        if (drift > 1e-6) issues.push("kepler.epochJD mismatch");
      }
      if (Number.isFinite(cfg.orbitRadiusAU) && Number.isFinite(cfg.info?.orbitalPeriod)) {
        const expectedPeriod = Math.sqrt(cfg.orbitRadiusAU ** 3) * 365.25;
        const relError = Math.abs(expectedPeriod - cfg.info.orbitalPeriod) / cfg.info.orbitalPeriod;
        if (relError > 0.01) issues.push("orbitalPeriod vs a mismatch");
      }
      if (issues.length) {
        logWarn("LoadData", `Orbit data warnings for ${cfg.name}: ${issues.join(", ")}`);
      }

      /* rotation speed --------------------------------------------------- */
      const P = Math.abs(cfg.rotationPeriod || 0);
      cfg.calculatedRotationSpeed = P
        ? (2 * Math.PI) / (P * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
        : 0;
      // Keep one spin convention: axial tilt encodes spin-axis orientation.
      // With this convention, direction should not be double-applied via signed periods.
      if (Number.isFinite(cfg.axialTilt)) {
        cfg.rotationDirection = 1;
      } else if (typeof cfg.retrograde === "boolean") {
        cfg.rotationDirection = cfg.retrograde ? -1 : 1;
      } else {
        cfg.rotationDirection = cfg.rotationPeriod >= 0 ? 1 : -1;
      }

      /* atmosphere colour parsing --------------------------------------- */
      if (cfg.atmosphere?.exists) {
        if (cfg.atmosphere.colorHex == null && typeof cfg.atmosphere.color === "string") {
          cfg.atmosphere.colorHex = cfg.atmosphere.color;
        }
        if (cfg.atmosphere.densityRelative == null && Number.isFinite(cfg.atmosphere.density)) {
          cfg.atmosphere.densityRelative = cfg.atmosphere.density;
        }
        const col = cfg.atmosphere.colorHex;
        if (typeof col === "string" && col.startsWith("#"))
          cfg.atmosphere.colorHex = parseInt(col.replace("#", "0x"), 16);
      } /* moons pre‑compute ------------------------------------------------ */
      cfg.moons?.forEach((m) => {
        // Normalize optional moon orbital-shape/orientation fields used by the renderer.
        const moonEccRaw = Number(m.orbitEccentricity ?? m.orbitalEccentricity ?? 0);
        m.orbitEccentricity = Math.max(0, Math.min(0.99, Number.isFinite(moonEccRaw) ? moonEccRaw : 0));

        const moonIncDeg = Number(m.orbitalInclinationDeg ?? m.inclinationDeg ?? 0);
        const moonNodeDeg = Number(m.longAscNodeDeg ?? m.ascendingNodeDeg ?? 0);
        const moonArgPeriDeg = Number(m.argPeriapsisDeg ?? m.argumentOfPeriapsisDeg ?? 0);
        m.orbitalInclinationDeg = Number.isFinite(moonIncDeg) ? moonIncDeg : 0;
        m.longAscNodeDeg = Number.isFinite(moonNodeDeg) ? moonNodeDeg : 0;
        m.argPeriapsisDeg = Number.isFinite(moonArgPeriDeg) ? moonArgPeriDeg : 0;
        m.orbitReference = m.orbitReference === "ecliptic" ? "ecliptic" : "equatorial";

        const Pm = Math.abs(m.orbitalPeriod || 0);
        m.calculatedOrbitSpeed = Pm
          ? (2 * Math.PI) / (Pm * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
          : 0;
        // Check retrograde flag first, then fall back to orbital period sign.
        if (typeof m.retrograde === "boolean") {
          m.orbitDirection = m.retrograde ? -1 : 1;
        } else {
          m.orbitDirection = m.orbitalPeriod >= 0 ? 1 : -1;
        }

        const Rm = Math.abs(m.rotationPeriod || 0);
        m.calculatedRotationSpeed = Rm
          ? (2 * Math.PI) / (Rm * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
          : 0;
        const isTidallyLocked = Pm > 0 && Rm > 0 && Math.abs(Pm - Rm) < 1e-6;
        if (typeof m.spinRetrograde === "boolean") {
          m.rotationDirection = m.spinRetrograde ? -1 : 1;
        } else if (isTidallyLocked) {
          // A tidally-locked moon should share the same inertial direction as its orbit.
          m.rotationDirection = m.orbitDirection;
        } else {
          m.rotationDirection = m.rotationPeriod >= 0 ? 1 : -1;
        }

        if (m.atmosphere?.exists) {
          if (m.atmosphere.colorHex == null && typeof m.atmosphere.color === "string") {
            m.atmosphere.colorHex = m.atmosphere.color;
          }
          if (m.atmosphere.densityRelative == null && Number.isFinite(m.atmosphere.density)) {
            m.atmosphere.densityRelative = m.atmosphere.density;
          }
          const col = m.atmosphere.colorHex;
          if (typeof col === "string" && col.startsWith("#"))
            m.atmosphere.colorHex = parseInt(col.replace("#", "0x"), 16);
        }
      });
      logDebug("LoadData", `Completed planet ${index}: ${cfg.name}`);
    } catch (err) {
      logError("LoadData", `Error processing planet ${index} (${cfg.name})`, err);
      throw err;
    }
  });
}

/* ---------------------------------------------------------------------- */
/*                    Helper: Loading screen                              */
/* ---------------------------------------------------------------------- */
function showLoadingScreen(show, msg = "Loading…") {
  let div = document.getElementById("loadingScreen");
  if (show) {
    if (!div) {
      div = document.createElement("div");
      div.id = "loadingScreen";
      // Apply styles directly - ensure opacity is 1 initially
      Object.assign(div.style, {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 2000,
        background: "rgba(0,0,0,.8)",
        color: "#fff",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        opacity: 1, // Start fully visible
      });
      document.body.appendChild(div);
    }
    div.textContent = msg;
    div.style.display = "flex";
    div.style.opacity = 1; // Ensure opacity is reset if shown again
  } else if (div) {
    // Use Anime.js to fade out if available; otherwise hide immediately
    if (typeof anime !== "undefined") {
      try {
        anime.remove(div);
      } catch {}
      anime({
        targets: div,
        opacity: [1, 0],
        duration: 500,
        easing: "easeOutQuad",
        complete: () => {
          div.style.display = "none";
        },
      });
    } else {
      div.style.display = "none";
    }
  }
}

function getSelectedObjectSafe() {
  return getSelectedObject() ?? null;
}

export function computeRecommendedMinDistance(controls, selected) {
  const targetLen = controls.target.length();
  const nearSunThreshold = Math.max(5, CONSTANTS.SUN_RADIUS * CONSTANTS.ZOOM.NEAR_SUN_FACTOR);
  const sunFloor =
    targetLen < nearSunThreshold
      ? Math.max(
          CONSTANTS.ZOOM.MIN_DISTANCE_BASE,
          CONSTANTS.SUN_RADIUS * CONSTANTS.ZOOM.NEAR_SUN_FACTOR
        )
      : CONSTANTS.ZOOM.DEFAULT_MIN_DISTANCE;

  const radius =
    selected?.userData?.planetMesh?.geometry?.parameters?.radius ??
    selected?.geometry?.parameters?.radius ??
    selected?.userData?.displayRadius ??
    0;
  const selectionFloor =
    radius > 0
      ? Math.max(CONSTANTS.ZOOM.MIN_SELECTION_DISTANCE, radius * CONSTANTS.ZOOM.SELECTION_FACTOR)
      : 0;

  return Math.max(sunFloor, selectionFloor);
}

/* ---------------------------------------------------------------------- */
/*                       Helper: Error overlay                             */
/* ---------------------------------------------------------------------- */
function showErrorMessage(msg) {
  let div = document.getElementById("errorOverlay");
  if (!div) {
    div = document.createElement("div");
    div.id = "errorOverlay";
    Object.assign(div.style, {
      position: "fixed",
      top: "10px",
      left: "10px",
      right: "10px",
      zIndex: 2001,
      background: "rgba(200,0,0,.9)",
      color: "#fff",
      padding: "15px",
      border: "1px solid darkred",
      borderRadius: "5px",
      fontFamily: "Arial,sans-serif",
      fontSize: "16px",
      textAlign: "center",
    });
    document.body.appendChild(div);
  }
  // Safely construct message content without innerHTML
  div.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = "Initialization Error:";
  div.appendChild(strong);
  div.appendChild(document.createTextNode(` ${String(msg || "")}`));
  div.appendChild(document.createElement("br"));
  div.appendChild(document.createTextNode("Check console (F12) for details."));
  div.style.display = "block";
}

function clearErrorMessage() {
  const div = document.getElementById("errorOverlay");
  if (!div) return;
  div.style.display = "none";
}

/* ---------------------------------------------------------------------- */
/*                        Dropdown builder                                */
/* ---------------------------------------------------------------------- */
function setupPlanetDropdown(planets, sunMesh) {
  const sel = document.getElementById("planetNav");
  if (!sel) {
    logError("UI", "planetNav dropdown missing");
    return;
  }

  // Wipe existing options safely
  sel.textContent = "";
  const defOpt = document.createElement("option");
  defOpt.value = "";
  defOpt.textContent = "Select Body..."; // Changed text
  defOpt.disabled = true;
  defOpt.selected = true;
  sel.appendChild(defOpt);

  // Sun
  if (sunMesh?.userData?.name) {
    const o = document.createElement("option");
    o.value = o.textContent = sunMesh.userData.name;
    sel.appendChild(o);
  }

  // Planets
  planets.forEach((g) => {
    if (g?.userData?.name) {
      const o = document.createElement("option");
      o.value = o.textContent = g.userData.name;
      sel.appendChild(o);
    }
  });

  // event handled in Controls.setupUIControls (for live select)
}

/* ---------------------------------------------------------------------- */
/*                        Cleanup and Disposal                            */
/* ---------------------------------------------------------------------- */

/**
 * Clean up all resources to prevent memory leaks
 */
export function cleanup() {
  logInfo("Cleanup", "Starting cleanup");

  // Stop animation loop if running
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  detachResizeHandler();
  Controls.cleanupControls();

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

  // Terminate worker and clear buffers
  if (simulationWorker) {
    try {
      simulationWorker.terminate();
    } catch (err) {
      logDebug("Cleanup", "worker terminate error", err);
    }
    simulationWorker = null;
  }
  workerReady = false;
  posBuffers = [];
  posAvailableBuffers = [];
  posInFlight = false;
  pendingPositionBuffer = null;
  rotationInFlight = false;

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
  shadowManager = null;
  resetState();
  clearEventListeners();

  logInfo("Cleanup", "completed");
}

// Add window beforeunload event to cleanup
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", cleanup);
}

/* ---------------------------------------------------------------------- */
/*                      Performance Monitoring                            */
/* ---------------------------------------------------------------------- */

let lastMemoryCheck = 0;
const MEMORY_CHECK_INTERVAL = 5000; // Check every 5 seconds

/**
 * Monitor memory usage (if available)
 */
function checkMemoryUsage() {
  const now = performance.now();
  if (now - lastMemoryCheck < MEMORY_CHECK_INTERVAL) return;
  lastMemoryCheck = now;

  // performance.memory is Chrome-only; guard to avoid noise on other browsers
  const memInfo = /** @type {any} */ (performance).memory;
  if (memInfo) {
    const used = Math.round(memInfo.usedJSHeapSize / 1048576);
    const total = Math.round(memInfo.totalJSHeapSize / 1048576);
    const limit = Math.round(memInfo.jsHeapSizeLimit / 1048576);

    logDebug("Memory", `Usage ${used}MB / ${total}MB (limit: ${limit}MB)`);

    if (used > limit * 0.8) {
      logWarn("Memory", "High usage detected; consider reducing quality settings");
    }
  }
}

// Call this function regularly, e.g., in the animation loop (scheduled in init)

/* ---------------------------------------------------------------------- */
/*                    Camera Following Functions                          */
/* ---------------------------------------------------------------------- */

/**
 * Set the camera to follow a specific target object
 */
function setCameraFollowTarget(target, distance) {
  updateFollowTarget(target, distance);
  logInfo("Camera", `Now following: ${target?.userData?.name || "none"}`);
}

function getCameraFollowTarget() {
  return getFollowTarget();
}

function stopCameraFollowing() {
  stopCameraFollow();
  logInfo("Camera", "Stopped following");
}
