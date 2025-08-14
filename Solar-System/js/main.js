// File: Solar-System/js/main.js// --- Main Module — Solar System Simulation ----------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

import * as SceneSetup from "./sceneSetup.js";
import * as UI from "./ui.js";
import * as Controls from "./controls.js";
import * as Animation from "./animation.js";
import { ShadowManager } from "./shadowManager.js";

import { createStarfield } from "./starfield.js";
import { createSun, createPlanetsAndOrbits } from "./celestialBodies.js";
import { createAsteroidBelt } from "./asteroidbelt.js";
import { findCelestialBodyByName } from "./utils.js";
import { updateScene } from "./animation.js";
import { MarsLaunchWindow } from "./marsLaunchWindow.js";

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
let shadowManager;

let isInitialized = false;
let cameraFollowTarget = null;
let cameraFollowDistance = 50;
let marsLaunchWindow;

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

  // Emergency timeout to show error if stuck
  const emergencyTimeout = setTimeout(() => {
    console.error('[EMERGENCY] Init taking too long, forcing error display');
    showLoadingScreen(false);
    showErrorMessage('Initialization timed out. Check console for details.');
  }, 10000); // 10 second timeout

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
    
    // Add camera following functions to window
    window.setCameraFollowTarget = setCameraFollowTarget;
    window.getCameraFollowTarget = getCameraFollowTarget;

    /* Lighting & UI */
    SceneSetup.setupLighting(scene);
    shadowManager = new ShadowManager(renderer);
    UI.initUI();

    /* Loading splash */
    showLoadingScreen(true, "Loading textures…");

    /* Starfield and Sun (Pass pre-loaded env map texture) */
    createStarfield(scene, environmentTexture);
    const sunData = createSun(scene, textureLoader);
    sunMesh = sunData.mesh;
    celestialBodies.push(sunMesh);
    window.sunMesh = sunMesh; // Make available globally for labels

    /* Planets & moons */
    console.log("[Init] Creating planets and orbits...");
    const planetData = await createPlanetsAndOrbits(
      scene,
      textureLoader,
      planetConfigs
    );
    console.log("[Init] Planets created:", planetData.planets.length);
    planets = planetData.planets;
    celestialBodies.push(...planetData.celestialBodies);
    window.planets = planets;

    /* Optional asteroid belt */
    if (CONSTANTS.ASTEROID_BELT_ENABLED) {
      console.log('[Main] Creating asteroid belt...');
      window.asteroidBelt = createAsteroidBelt(scene, textureLoader);
      if (window.asteroidBelt) {
        console.log('[Main] Asteroid belt created successfully with', window.asteroidBelt.children.length, 'asteroids');
        console.log('[Main] Asteroid belt position:', window.asteroidBelt.position);
        console.log('[Main] Asteroid belt visible:', window.asteroidBelt.visible);
      } else {
        console.log('[Main] Asteroid belt creation failed');
      }
    }

    /* Dropdown builder */
    setupPlanetDropdown(planets, sunMesh);

    clearTimeout(emergencyTimeout);
    showLoadingScreen(false);

    /* Mars Launch Window */
    console.log("[Init] Creating Mars launch window...");
    marsLaunchWindow = new MarsLaunchWindow();
    setupMarsLaunchWindowEvents();

    /* Event hooks */
    if (!celestialBodies || celestialBodies.length === 0) {
      console.error(
        "[Init] CRITICAL: celestialBodies array is empty or invalid!"
      );
    }
    Controls.setupPointerEvents(scene, camera, renderer, celestialBodies);
    Controls.setupUIControls(planetConfigs, celestialBodies, scene);


    /* Kick off animation loop */
    startAnimationLoop();
    console.log("[Init] done");
  } catch (err) {
    clearTimeout(emergencyTimeout);
    console.error("Init failed:", err);
    showLoadingScreen(false);
    showErrorMessage(err.message || "Unknown error during init");
    isInitialized = false;
  }
}

/* ---------------------------------------------------------------------- */
/*                      Mars Launch Window Events                         */
/* ---------------------------------------------------------------------- */
function setupMarsLaunchWindowEvents() {
  // Jump to launch window event
  window.addEventListener('jumpToLaunchWindow', () => {
    console.log("[Mars Launch] Jump to launch window requested");
    
    // Calculate the next launch window
    const launchWindow = marsLaunchWindow.calculateLaunchWindow(window.simulatedDays || 0);
    
    // Speed up time to get to the launch window faster
    if (launchWindow.daysUntil > 0) {
      const speedIncrease = Math.min(launchWindow.daysUntil / 30, 10); // Max 10x speed
      window.simulationSpeed = speedIncrease;
      
      // Show Mars and Earth
      const earthMesh = findCelestialBodyByName(celestialBodies, "Earth");
      const marsMesh = findCelestialBodyByName(celestialBodies, "Mars");
      
      if (earthMesh && marsMesh) {
        // Focus on Earth-Mars system
        const midpoint = new THREE.Vector3();
        midpoint.addVectors(earthMesh.position, marsMesh.position).multiplyScalar(0.5);
        
        // Set camera to view both planets
        camera.position.set(midpoint.x, midpoint.y + 100, midpoint.z + 100);
        camera.lookAt(midpoint);
        
        // Update controls
        if (controls && controls.target) {
          controls.target.copy(midpoint);
        }
      }
    }
  });

  // Show trajectory event
  window.addEventListener('showMarsTrajectory', () => {
    console.log("[Mars Launch] Show trajectory requested");
    showHohmannTransferTrajectory();
  });
}

function showHohmannTransferTrajectory() {
  const earthMesh = findCelestialBodyByName(celestialBodies, "Earth");
  const marsMesh = findCelestialBodyByName(celestialBodies, "Mars");
  
  if (!earthMesh || !marsMesh) return;
  
  // Remove existing trajectory
  const existingTrajectory = scene.getObjectByName('marsTrajectory');
  if (existingTrajectory) {
    scene.remove(existingTrajectory);
  }
  
  // Create Hohmann transfer trajectory
  const trajectoryGroup = new THREE.Group();
  trajectoryGroup.name = 'marsTrajectory';
  
  // Calculate semi-major axis for Hohmann transfer
  const earthOrbitRadius = earthMesh.position.length();
  const marsOrbitRadius = marsMesh.position.length();
  const semiMajorAxis = (earthOrbitRadius + marsOrbitRadius) / 2;
  
  // Create trajectory curve
  const trajectoryPoints = [];
  const segments = 64;
  
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI; // Half orbit
    const x = semiMajorAxis * Math.cos(angle);
    const z = semiMajorAxis * Math.sin(angle);
    trajectoryPoints.push(new THREE.Vector3(x, 0, z));
  }
  
  const trajectoryGeometry = new THREE.BufferGeometry().setFromPoints(trajectoryPoints);
  const trajectoryMaterial = new THREE.LineBasicMaterial({ 
    color: 0xff6b6b, 
    linewidth: 3,
    transparent: true,
    opacity: 0.8
  });
  
  const trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
  trajectoryGroup.add(trajectoryLine);
  
  // Add trajectory to scene
  scene.add(trajectoryGroup);
  
  // Remove trajectory after 10 seconds
  setTimeout(() => {
    scene.remove(trajectoryGroup);
  }, 10000);
}

/* ---------------------------------------------------------------------- */
/*                         Animation loop                                 */
/* ---------------------------------------------------------------------- */
function startAnimationLoop() {
  console.log("[Animation] startAnimationLoop called.");
  let animationFrameId = null; // Store frame ID for potential cancellation
  const targetWorldPos = new THREE.Vector3(); // Cache vector for target position
  const cameraOffset = new THREE.Vector3(); // Cache vector for camera offset
  const idealCamPos = new THREE.Vector3(); // Cache vector for ideal camera position

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    // Get delta time for lerping
    const delta = window.clock.getDelta();

    const currentSpeed = window.simulationSpeed ?? 1.0;
    updateScene(currentSpeed); // move planets etc.

    // Update Mars launch window
    if (marsLaunchWindow && window.simulatedDays) {
      const earthMesh = findCelestialBodyByName(celestialBodies, "Earth");
      const marsMesh = findCelestialBodyByName(celestialBodies, "Mars");
      
      if (earthMesh && marsMesh) {
        marsLaunchWindow.update(window.simulatedDays, earthMesh.position, marsMesh.position);
      }
    }

    // Camera following logic (pause while user manually interacts)
    const userInteracting = (typeof Controls.getIsManualZoom === 'function') ? Controls.getIsManualZoom() : false;
    if (cameraFollowTarget && cameraFollowTarget.userData && !userInteracting) {
      const targetPos = new THREE.Vector3();
      cameraFollowTarget.getWorldPosition(targetPos);
      
      // Calculate appropriate distance based on object type
      let distance = cameraFollowDistance;
      if (cameraFollowTarget.userData.type === "star") {
        distance = 80;
      } else if (cameraFollowTarget.userData.type === "planet") {
        distance = cameraFollowTarget.userData.config?.scaledRadius * 6 || 30;
      } else if (cameraFollowTarget.userData.type === "moon") {
        distance = 10;
      }
      
      // Smooth camera following
      const currentCameraPos = camera.position.clone();
      const targetCameraPos = targetPos.clone();
      const direction = currentCameraPos.clone().sub(targetPos).normalize();
      targetCameraPos.add(direction.multiplyScalar(distance));
      
      // Lerp camera position
      camera.position.lerp(targetCameraPos, 0.02);
      
      // Update controls target
      controls.target.lerp(targetPos, 0.02);
    }

    // OrbitControls update
    if (controls) {
      controls.update();
    }

    // UI read‑outs
    UI.updateUIDisplay(currentSpeed);
    
    // Update info panel position if following a target
    if (cameraFollowTarget && UI.getUIReferences().selectedObject === cameraFollowTarget) {
      if (UI.getUIReferences().infoPanel && UI.getUIReferences().infoPanel.style.display !== "none") {
        // Update panel position to follow the moving planet
        const tempVector = new THREE.Vector3();
        cameraFollowTarget.getWorldPosition(tempVector);
        tempVector.project(camera);
        
        const x = (tempVector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (tempVector.y * -0.5 + 0.5) * window.innerHeight;
        
        const offsetX = 30;
        const panelWidth = 480;
        const panelHeight = Math.min(window.innerHeight * 0.7, 600);
        
        let finalX = x + offsetX;
        let finalY = y - panelHeight / 2;
        
        // Keep panel within screen bounds
        if (finalX + panelWidth > window.innerWidth) {
          finalX = x - offsetX - panelWidth;
        }
        if (finalY < 20) {
          finalY = 20;
        }
        if (finalY + panelHeight > window.innerHeight - 20) {
          finalY = window.innerHeight - panelHeight - 20;
        }
        
        // Smoothly move the panel
        const currentX = parseFloat(UI.getUIReferences().infoPanel.style.left) || finalX;
        const currentY = parseFloat(UI.getUIReferences().infoPanel.style.top) || finalY;
        
        const lerpedX = currentX + (finalX - currentX) * 0.1;
        const lerpedY = currentY + (finalY - currentY) * 0.1;
        
        UI.getUIReferences().infoPanel.style.left = lerpedX + "px";
        UI.getUIReferences().infoPanel.style.top = lerpedY + "px";
      }
    }
    
    // Update planet labels
    const allCelestialBodies = [...planets];
    if (sunMesh) allCelestialBodies.push(sunMesh);
    // Add moons to the list
    planets.forEach(planet => {
      planet.traverse(child => {
        if (child.userData?.type === "moon") {
          allCelestialBodies.push(child);
        }
      });
    });
    UI.updatePlanetLabels(camera, allCelestialBodies);

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
  console.log("[LoadData] Starting JSON fetch...");
  const res = await fetch("./solarsystem_data.json");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  console.log("[LoadData] JSON fetched, parsing...");
  planetConfigs = await res.json();
  console.log("[LoadData] JSON parsed, got", planetConfigs.length, "planets");

  planetConfigs.forEach((cfg, index) => {
    try {
      console.log(`[LoadData] Processing planet ${index}: ${cfg.name}`);
    /* orbit speed pre‑compute (circular model) ------------------------- */
    cfg.calculatedOrbitSpeed = cfg.baseOrbitSpeedFactor
      ? (2 * Math.PI * cfg.baseOrbitSpeedFactor) /
        CONSTANTS.BASE_ORBIT_SPEED_UNIT_TIME
      : 0; /* rotation speed --------------------------------------------------- */
    const P = Math.abs(cfg.rotationPeriod || 0);
    cfg.calculatedRotationSpeed = P
      ? (2 * Math.PI) / (P * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
      : 0;
    cfg.rotationDirection = cfg.rotationPeriod >= 0 ? 1 : -1; /* atmosphere colour parsing --------------------------------------- */
    if (cfg.atmosphere?.exists) {
      const col = cfg.atmosphere.colorHex;
      if (typeof col === "string" && col.startsWith("#"))
        cfg.atmosphere.colorHex = parseInt(col.replace("#", "0x"), 16);
    } /* moons pre‑compute ------------------------------------------------ */
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
        const col = m.atmosphere.colorHex;
        if (typeof col === "string" && col.startsWith("#"))
          m.atmosphere.colorHex = parseInt(col.replace("#", "0x"), 16);
      }
    });
    console.log(`[LoadData] Completed planet ${index}: ${cfg.name}`);
    } catch (err) {
      console.error(`[LoadData] Error processing planet ${index} (${cfg.name}):`, err);
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
  // Safely construct message content without innerHTML
  div.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = "Initialization Error:";
  div.appendChild(strong);
  div.appendChild(document.createTextNode(` ${String(msg || "")}`));
  div.appendChild(document.createElement("br"));
  div.appendChild(
    document.createTextNode("Check console (F12) for details.")
  );
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
/*                   DOM event: resize                                    */
/* ---------------------------------------------------------------------- */
window.addEventListener("resize", () => {
  if (window.camera && window.renderer)
    SceneSetup.handleWindowResize(window.camera, window.renderer);
});

/* ---------------------------------------------------------------------- */
/*                        Cleanup and Disposal                            */
/* ---------------------------------------------------------------------- */

/**
 * Clean up all resources to prevent memory leaks
 */
export function cleanup() {
  console.log("Starting cleanup...");

  // Stop animation loop if running
  if (window.animationFrameId) {
    cancelAnimationFrame(window.animationFrameId);
  }

  // Clean up UI resources
  UI.cleanupUI();

  // Dispose scene objects
  if (scene) {
    scene.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => {
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

  // Clear arrays
  celestialBodies.length = 0;
  planets.length = 0;
  planetConfigs.length = 0;

  // Reset state
  isInitialized = false;
  
  console.log("Cleanup completed");
}

// Add window beforeunload event to cleanup
window.addEventListener('beforeunload', cleanup);

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

  if (performance.memory) {
    const used = Math.round(performance.memory.usedJSHeapSize / 1048576);
    const total = Math.round(performance.memory.totalJSHeapSize / 1048576);
    const limit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
    
    console.log(`Memory: ${used}MB / ${total}MB (limit: ${limit}MB)`);
    
    // Warn if memory usage is high
    if (used > limit * 0.8) {
      console.warn("High memory usage detected! Consider reducing quality settings.");
    }
  }
}

// Call this function regularly, e.g., in the animation loop
setInterval(checkMemoryUsage, 1000);

/* ---------------------------------------------------------------------- */
/*                    Camera Following Functions                          */
/* ---------------------------------------------------------------------- */

/**
 * Set the camera to follow a specific target object
 */
function setCameraFollowTarget(target) {
  cameraFollowTarget = target;
  console.log(`[Camera] Now following: ${target?.userData?.name || 'none'}`);
}

/**
 * Get the current camera follow target
 */
function getCameraFollowTarget() {
  return cameraFollowTarget;
}

/**
 * Stop camera following (when user manually navigates)
 */
function stopCameraFollowing() {
  cameraFollowTarget = null;
  console.log('[Camera] Stopped following');
}
