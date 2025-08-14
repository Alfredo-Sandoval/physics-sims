// File: Solar-System/js/controls.js
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

// Camera targeting variables removed - using standard orbit controls

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
  
  // REMOVED: Wheel event listener that was conflicting with OrbitControls
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
      if (tgt !== getUIReferences().selectedObject) {
        selectObject(tgt);
        // Start following the clicked object
        if (window.setCameraFollowTarget) {
          window.setCameraFollowTarget(tgt);
        }
      }
    } else {
      if (getUIReferences().selectedObject) {
        deselectObject();
        // Stop following when clicking empty space
        if (window.setCameraFollowTarget) {
          window.setCameraFollowTarget(null);
        }
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
        // Start following the selected object
        if (window.setCameraFollowTarget) {
          window.setCameraFollowTarget(obj);
        }
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

  /* Labels toggle ------------------------------------------------------ */
  const labelsCheckbox = document.getElementById("labelsCheckbox");
  if (labelsCheckbox && scene) {
    labelsCheckbox.checked = !!CONSTANTS.SHOW_LABELS;
    const setLabels = (vis) => {
      scene.traverse((o) => {
        if (o.userData?.isLabel) o.visible = vis;
      });
    };
    setLabels(labelsCheckbox.checked);
    labelsCheckbox.addEventListener("change", () => setLabels(labelsCheckbox.checked));
  }

  /* Orbital planes toggle --------------------------------------------- */
  const planesCheckbox = document.getElementById("planesCheckbox");
  if (planesCheckbox && scene) {
    const setPlanes = (vis) => {
      scene.traverse((o) => {
        if (o.userData?.isOrbitalPlane) o.visible = vis;
      });
    };
    setPlanes(false);
    planesCheckbox.addEventListener("change", () => setPlanes(planesCheckbox.checked));
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
  // Zoom detection disabled - no auto-targeting anymore
  console.log("[Controls] Zoom detection disabled - using standard OrbitControls");
}

/* Simple getters / setters -------------------------------------------- */
export function getCameraTarget() {
  return null; // Always return null - no targeting
}

export function getIsManualZoom() {
  return false; // Always return false - no manual zoom tracking
}

// Camera targeting functions removed - using standard orbit controls
