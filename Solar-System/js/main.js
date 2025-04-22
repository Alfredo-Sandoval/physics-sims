// --- Main Module — Solar System Simulation ----------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

import * as SceneSetup from "./sceneSetup.js";
import * as UI from "./ui.js";
import * as Controls from "./controls.js";
import * as Animation from "./animation.js";

import { createStarfield } from "./starfield.js";
import { createSun, createPlanetsAndOrbits } from "./celestialBodies.js";
import { createAsteroidBelt } from "./asteroidbelt.js";
import { findCelestialBodyByName } from "./utils.js";
import { updateScene } from "./animation.js";

/* ---------------------------------------------------------------------- */
/*                        Global state (exported)                         */
/* ---------------------------------------------------------------------- */
let scene, camera, renderer, controls;
let celestialBodies = []; // everything selectable
let planets = []; // planet groups only
let planetConfigs = []; // JSON data

let clock;
let textureLoader;
let sunMesh;

let isInitialized = false;

export const appState = {
  get scene() {
    return scene;
  },
  get camera() {
    return camera;
  },
  get controls() {
    return controls;
  },
  get clock() {
    return clock;
  },
  get planets() {
    return planets;
  },
  get simulationSpeed() {
    return window.simulationSpeed;
  },
  get simulatedDays() {
    return window.simulatedDays;
  },
  get asteroidBelt() {
    return window.asteroidBelt;
  },
};

/* ---------------------------------------------------------------------- */
/*                            Initialization                              */
/* ---------------------------------------------------------------------- */
export async function init() {
  console.log("[Init] starting…");
  if (isInitialized) {
    console.warn("init called twice");
    return;
  }
  isInitialized = true;

  try {
    await loadPlanetData();
    console.log("[Init] planet JSON loaded");

    /* Clock & texture loader */
    clock = new THREE.Clock();
    textureLoader = new THREE.TextureLoader();
    textureLoader.setPath("./textures/");
    window.clock = clock;

    /* Load Environment Map Texture FIRST */
    const environmentTexture = textureLoader.load(
      "Moon_JPG_Collection/hipparcos star map.jpg",
      () => {
        console.log("[Texture] Environment map loaded.");
      },
      undefined,
      (err) => {
        console.error("[Texture] Failed to load environment map:", err);
      }
    );
    environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
    environmentTexture.colorSpace = THREE.SRGBColorSpace;

    /* Scene / camera / renderer (Pass env map to scene setup) */
    scene = SceneSetup.setupScene(environmentTexture);
    camera = SceneSetup.setupCamera();
    renderer = SceneSetup.setupRenderer();
    controls = SceneSetup.setupControls(camera, renderer);

    window.scene = scene;
    window.camera = camera;
    window.controls = controls;

    /* Lighting & UI */
    SceneSetup.setupLighting(scene);
    UI.initUI();

    /* Loading splash */
    showLoadingScreen(true, "Loading textures…");

    /* Starfield and Sun (Pass pre-loaded env map texture) */
    createStarfield(scene, environmentTexture);
    const sunData = createSun(scene, textureLoader);
    sunMesh = sunData.mesh;
    celestialBodies.push(sunMesh);

    /* Planets & moons */
    const planetData = await createPlanetsAndOrbits(
      scene,
      textureLoader,
      planetConfigs
    );
    planets = planetData.planets;
    celestialBodies.push(...planetData.celestialBodies);
    window.planets = planets;

    /* Optional asteroid belt */
    if (CONSTANTS.ASTEROID_BELT_ENABLED) {
      window.asteroidBelt = createAsteroidBelt(scene, textureLoader);
    }

    /* Dropdown builder */
    setupPlanetDropdown(planets, sunMesh);

    showLoadingScreen(false);

    /* Event hooks */
    // --- DEBUG: Log the selectable bodies array ---
    console.log(
      "[Init] Selectable bodies before setupPointerEvents:",
      celestialBodies
    );
    if (!celestialBodies || celestialBodies.length === 0) {
      console.error(
        "[Init] CRITICAL: celestialBodies array is empty or invalid!"
      );
    }
    // --- END DEBUG ---
    Controls.setupPointerEvents(scene, camera, renderer, celestialBodies);
    Controls.setupZoomDetection(renderer, controls);
    Controls.setupUIControls(planetConfigs, celestialBodies, scene);

    /* Debug list */
    console.log("Selectable bodies:");
    celestialBodies.forEach((o, i) =>
      console.log(`  ${i}: ${o.userData?.name} (${o.type})`)
    );

    /* Kick off animation loop */
    startAnimationLoop();
    console.log("[Init] done");
  } catch (err) {
    console.error("Init failed:", err);
    showErrorMessage(err.message || "Unknown error during init");
    isInitialized = false;
  }
}

/* ---------------------------------------------------------------------- */
/*                         Animation loop                                 */
/* ---------------------------------------------------------------------- */
function startAnimationLoop() {
  console.log("[Animation] startAnimationLoop called.");
  let animationFrameId = null; // Store frame ID for potential cancellation
  const targetWorldPos = new THREE.Vector3(); // Cache vector for target position

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const currentSpeed = window.simulationSpeed ?? 1.0;
    updateScene(currentSpeed); // move planets etc.

    // --- Camera Target Following Logic ---
    const currentTarget = Controls.getCameraTarget();
    const isAnimating = Controls.isCameraAnimating();

    if (currentTarget && !isAnimating && controls) {
      // If we have a target and the camera isn't doing the Anime.js transition,
      // keep the controls.target updated to the object's current position.
      currentTarget.getWorldPosition(targetWorldPos);
      controls.target.copy(targetWorldPos);
    }
    // --- End Camera Target Following ---

    // OrbitControls damping/update
    if (controls?.enableDamping) controls.update();

    // UI read‑outs
    UI.updateUIDisplay(currentSpeed);

    // render frame
    renderer?.render(scene, camera);
  }

  if (window.clock) {
    animate(); // Start the loop
  } else {
    console.error("[Animation] Clock not initialized, cannot start loop.");
  }
}

/* ---------------------------------------------------------------------- */
/*                       JSON data loader                                 */
/* ---------------------------------------------------------------------- */
async function loadPlanetData() {
  const res = await fetch("./solarsystem_data.json");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  planetConfigs = await res.json();

  planetConfigs.forEach((cfg) => {
    /* orbit speed pre‑compute (circular model) ------------------------- */
    cfg.calculatedOrbitSpeed = cfg.baseOrbitSpeedFactor
      ? (2 * Math.PI * cfg.baseOrbitSpeedFactor) /
        CONSTANTS.BASE_ORBIT_SPEED_UNIT_TIME
      : 0;

    /* rotation speed --------------------------------------------------- */
    const P = Math.abs(cfg.rotationPeriod || 0);
    cfg.calculatedRotationSpeed = P
      ? (2 * Math.PI) / (P * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
      : 0;
    cfg.rotationDirection = cfg.rotationPeriod >= 0 ? 1 : -1;

    /* atmosphere colour parsing --------------------------------------- */
    if (cfg.atmosphere?.exists) {
      const col = cfg.atmosphere.color;
      if (typeof col === "string" && col.startsWith("#"))
        cfg.atmosphere.color = parseInt(col.replace("#", "0x"), 16);
    }

    /* moons pre‑compute ------------------------------------------------ */
    cfg.moons?.forEach((m) => {
      const Pm = Math.abs(m.orbitalPeriod || 0);
      m.calculatedOrbitSpeed = Pm
        ? (2 * Math.PI) / (Pm * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
        : 0;
      m.orbitDirection = m.orbitalPeriod >= 0 ? 1 : -1;

      const Rm = Math.abs(m.rotationPeriod || 0);
      m.calculatedRotationSpeed = Rm
        ? (2 * Math.PI) / (Rm * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
        : 0;
      m.rotationDirection = m.rotationPeriod >= 0 ? 1 : -1;

      if (m.atmosphere?.exists) {
        const col = m.atmosphere.color;
        if (typeof col === "string" && col.startsWith("#"))
          m.atmosphere.color = parseInt(col.replace("#", "0x"), 16);
      }
    });
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
    // Use Anime.js to fade out
    anime.remove(div); // Remove previous animations if any
    anime({
      targets: div,
      opacity: [1, 0],
      duration: 500,
      easing: "easeOutQuad",
      complete: () => {
        div.style.display = "none"; // Hide after fade
        // Optionally remove the element if it won't be reused
        // div.remove();
      },
    });
  }
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
  div.innerHTML = `<strong>Initialization Error:</strong> ${msg}<br>Check console (F12) for details.`;
  div.style.display = "block";
}

/* ---------------------------------------------------------------------- */
/*                        Dropdown builder                                */
/* ---------------------------------------------------------------------- */
function setupPlanetDropdown(planets, sunMesh) {
  const sel = document.getElementById("planetNav");
  if (!sel) {
    console.error("planetNav dropdown missing");
    return;
  }

  sel.innerHTML = ""; // wipe template
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
/*                   DOM event: resize                                    */
/* ---------------------------------------------------------------------- */
window.addEventListener("resize", () => {
  if (window.camera && window.renderer)
    SceneSetup.handleWindowResize(window.camera, window.renderer);
});
