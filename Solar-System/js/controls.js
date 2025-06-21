// --- Controls Module ---------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

// Import just the UI helpers we need
import { selectObject, deselectObject, getUIReferences } from "./ui.js";
import { findCelestialBodyByName } from "./utils.js";

/* ---------------------------------------------------------------------- */
/*                          Internal state                                */
/* ---------------------------------------------------------------------- */
let simulationSpeed = 1.0; // shadow copy of global window.simulationSpeed
let orbitLinesVisible = true;

let cameraTarget = null; // THREE.Object3D currently followed
let isManualZoom = false; // true while user is scrolling / dragging
let lastCameraDist = 0;

/* Pointer / ray‑casting helpers --------------------------------------- */
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
// Improve raycaster precision for small objects
raycaster.near = 0.1;
raycaster.far = 10000;

/* Cached vectors to avoid heavy allocations --------------------------- */
const targetPosition = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();

/* ---------------------------------------------------------------------- */
/*                       Public API                                       */
/* ---------------------------------------------------------------------- */

/**
 * Attach pointer‑move & click listeners for object selection.
 */
export function setupPointerEvents(scene, camera, renderer, selectable) {
  // Throttle pointer move events for performance
  let lastPointerUpdate = 0;
  const POINTER_THROTTLE_MS = 16; // ~60fps

  // Track pointer coords
  renderer.domElement.addEventListener(
    "pointermove",
    (e) => {
      const now = performance.now();
      if (now - lastPointerUpdate < POINTER_THROTTLE_MS) return;
      lastPointerUpdate = now;

      // Update BOTH X and Y coordinates (X was missing)
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    },
    { passive: true }
  );
  // Click selection
  renderer.domElement.addEventListener("click", (e) => {
    // Prevent default to avoid any browser behavior
    e.preventDefault();

    // Update pointer position at click time to ensure accuracy
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(selectable, true);

    let tgt = null;
    // Find the first selectable object in the hit list
    for (const hit of hits) {
      const obj = hit.object;

      // Check if object has a click target
      if (obj.userData?.clickTarget?.userData?.isSelectable) {
        tgt = obj.userData.clickTarget;
        break;
      }

      // Check the object itself
      if (obj.userData?.isSelectable) {
        tgt = obj;
        break;
      }

      // Check parent hierarchy - go up until we find a selectable object
      let parent = obj.parent;
      while (parent) {
        if (parent.userData?.isSelectable) {
          tgt = parent;
          break;
        }
        parent = parent.parent;
      }

      if (tgt) break;
    }

    if (tgt) {
      console.log("[DEBUG] Selected:", tgt.userData.name);
      if (tgt !== getUIReferences().selectedObject) {
        selectObject(tgt);
        setCameraTarget(tgt);
      } else {
        setCameraTarget(tgt); // Re-trigger animation
      }
    } else {
      console.log("[DEBUG] No target found, deselecting");
      if (getUIReferences().selectedObject) {
        deselectObject();
        setCameraTarget(null);
      }
    }
  });
}

/**
 * Hook up all DOM UI controls (speed slider, dropdown, buttons).
 */
export function setupUIControls(planetConfigs, selectable, scene) {
  /* Speed slider ------------------------------------------------------- */
  const speedSlider = document.getElementById("speedSlider");
  const speedSpan = document.getElementById("speedValue");
  if (speedSlider && speedSpan) {
    simulationSpeed = window.simulationSpeed ?? 1.0;
    speedSlider.value = simulationSpeed;
    speedSpan.textContent = simulationSpeed.toFixed(1) + "x";

    speedSlider.addEventListener("input", () => {
      simulationSpeed = parseFloat(speedSlider.value);
      window.simulationSpeed = simulationSpeed;
      speedSpan.textContent = simulationSpeed.toFixed(1) + "x";
    });
  }

  /* Planet navigation dropdown ---------------------------------------- */
  const planetNav = document.getElementById("planetNav");
  if (planetNav) {
    planetNav.addEventListener("change", () => {
      const name = planetNav.value;
      if (!name) return;
      const obj = findCelestialBodyByName(name, selectable);
      if (obj) {
        selectObject(obj);
        setCameraTarget(obj);
      }
      setTimeout(() => {
        planetNav.value = "";
      }, 200);
    });
  }

  /* Camera reset ------------------------------------------------------- */
  document.getElementById("resetCameraBtn")?.addEventListener("click", () => {
    if (!window.camera || !window.controls) return;
    window.camera.position.set(150, 100, 150);
    window.controls.target.set(0, 0, 0);
    window.controls.update();
    deselectObject();
    setCameraTarget(null);
  });

  /* Toggle orbit‑lines ------------------------------------------------- */
  const toggleOrbitsBtn = document.getElementById("toggleOrbitsBtn");
  if (toggleOrbitsBtn && scene) {
    toggleOrbitsBtn.textContent = orbitLinesVisible
      ? "Hide Orbits"
      : "Show Orbits";
    toggleOrbitsBtn.addEventListener("click", () => {
      orbitLinesVisible = !orbitLinesVisible;
      scene.traverse((o) => {
        if (o.userData?.isOrbitLine) o.visible = orbitLinesVisible;
      });
      toggleOrbitsBtn.textContent = orbitLinesVisible
        ? "Hide Orbits"
        : "Show Orbits";
    });
  }

  /* Playback buttons --------------------------------------------------- */
  const setSpeed = (s) => {
    simulationSpeed = s;
    window.simulationSpeed = s;
    if (speedSlider) speedSlider.value = s;
    if (speedSpan) speedSpan.textContent = s.toFixed(1) + "x";
  };
  document
    .getElementById("pauseBtn")
    ?.addEventListener("click", () => setSpeed(0));
  document
    .getElementById("playBtn")
    ?.addEventListener("click", () => setSpeed(1));
  document
    .getElementById("slowDownBtn")
    ?.addEventListener("click", () =>
      setSpeed(Math.max(0.1, (window.simulationSpeed || 1) / 2))
    );
  document
    .getElementById("speedUpBtn")
    ?.addEventListener("click", () =>
      setSpeed(Math.min(5.0, (window.simulationSpeed || 1) * 2))
    );
}

/**
 * Mark manual zoom when user scrolls wheel or starts orbit‑control drag.
 */
export function setupZoomDetection(renderer, controls) {
  renderer.domElement.addEventListener(
    "wheel",
    () => {
      if (cameraTarget) isManualZoom = true;
    },
    { passive: true }
  );
  controls.addEventListener("start", () => {
    if (cameraTarget) isManualZoom = true;
  });
}

/* Simple getters / setters -------------------------------------------- */
export function getCameraTarget() {
  return cameraTarget;
}

// ADDED: Getter for isManualZoom
export function getIsManualZoom() {
  return isManualZoom;
}

export function setCameraTarget(obj) {
  console.log("[DEBUG] setCameraTarget called with:", obj);
  // Simplified: Only set the target and reset manual zoom flag.
  // The main animation loop will handle the lerp movement.
  if (obj === cameraTarget) {
    // If clicking the same target again, maybe reset zoom/offset smoothly?
    // For now, just reset manual zoom flag to allow lerp to continue.
    isManualZoom = false;
    // Potentially add logic here to smoothly reset camera distance if desired.
    return;
  }

  if (obj !== null && !obj?.userData?.isSelectable) {
    console.warn("setCameraTarget: object not selectable", obj);
    return;
  }

  console.log(
    `[Controls] Setting camera target to: ${obj ? obj.userData.name : "null"}`
  );
  cameraTarget = obj;
  isManualZoom = false; // Reset manual zoom flag on new target selection
}
