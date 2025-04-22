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

/* Cached vectors to avoid heavy allocations --------------------------- */
const targetPosition = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
let cameraAnimation = null; // Store the current camera animation instance

/* ---------------------------------------------------------------------- */
/*                       Public API                                       */
/* ---------------------------------------------------------------------- */

/**
 * Attach pointer‑move & click listeners for object selection.
 */
export function setupPointerEvents(scene, camera, renderer, selectable) {
  // Track pointer coords
  renderer.domElement.addEventListener(
    "pointermove",
    (e) => {
      // Update BOTH X and Y coordinates (X was missing)
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    },
    { passive: true }
  );

  // Click selection
  renderer.domElement.addEventListener("click", (e) => {
    console.log("[Click] Event triggered"); // Log click event

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(selectable, true);

    console.log("[Click] Raycaster hits:", hits); // Log all intersections

    let tgt = null;
    for (const h of hits) {
      const o = h.object;
      if (o.userData?.isSelectable) {
        tgt = o;
        break;
      }
      if (o.parent?.userData?.isSelectable) {
        tgt = o.parent;
        break;
      }
      if (o.userData?.clickTarget?.userData?.isSelectable) {
        tgt = o.userData.clickTarget;
        break;
      }
    }

    if (tgt) {
      console.log("[Click] Selected target:", tgt.userData.name, tgt); // Log selected target
      if (tgt !== getUIReferences().selectedObject) {
        selectObject(tgt);
        setCameraTarget(tgt); // Use the setter function to trigger animation
      } else {
        setCameraTarget(tgt); // Re-trigger animation
      }
    } else {
      console.log("[Click] No selectable target found, deselecting."); // Log deselection
      if (getUIReferences().selectedObject) {
        deselectObject();
        setCameraTarget(null); // Animate back to origin
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

export function setCameraTarget(obj) {
  if (obj === cameraTarget) {
    isManualZoom = false;
    return;
  }

  if (obj !== null && !obj?.userData?.isSelectable) {
    console.warn("setCameraTarget: object not selectable", obj);
    return;
  }

  cameraTarget = obj;
  isManualZoom = false;

  if (cameraAnimation) {
    cameraAnimation.forEach((anim) => anim.pause());
    anime.remove(window.camera.position);
    anime.remove(window.controls.target);
  }

  animateCameraToTarget(cameraTarget);
}

// --- NEW: Function to handle camera animation ---
function animateCameraToTarget(target) {
  const camera = window.camera;
  const controls = window.controls;
  if (!camera || !controls) return;

  let finalTargetPos = new THREE.Vector3(0, 0, 0);
  let desiredDist = CONSTANTS.DEFAULT_CAMERA_DISTANCE;

  if (target) {
    target.getWorldPosition(finalTargetPos);
    const ud = target.userData;
    const geom = target.geometry || ud?.planetMesh?.geometry;

    if (ud.type === "star") desiredDist = CONSTANTS.SUN_RADIUS * 4;
    else if (ud.type === "planet" && geom?.parameters?.radius)
      desiredDist =
        geom.parameters.radius * CONSTANTS.PLANET_CAMERA_DISTANCE_MULTIPLIER;
    else if (ud.type === "moon" && geom?.parameters?.radius)
      desiredDist =
        geom.parameters.radius * CONSTANTS.MOON_CAMERA_DISTANCE_MULTIPLIER;
  }

  // Calculate the desired camera position based on the current offset direction
  const currentOffset = new THREE.Vector3().subVectors(
    camera.position,
    controls.target
  );
  // Ensure offset has some length to avoid NaN issues if camera is exactly at target
  if (currentOffset.lengthSq() < 0.001) {
    currentOffset.set(0, 0.1, 1); // Default offset if too close
  }
  const finalCamPos = new THREE.Vector3()
    .copy(finalTargetPos)
    .add(currentOffset.normalize().multiplyScalar(desiredDist));

  // --- REFACTORED: Use separate Anime.js calls ---
  // Stop any previous camera animation
  if (cameraAnimation) {
    cameraAnimation.forEach((anim) => anim.pause());
    anime.remove(camera.position);
    anime.remove(controls.target);
  }

  // Animate camera position
  const camAnim = anime({
    targets: camera.position,
    x: finalCamPos.x,
    y: finalCamPos.y,
    z: finalCamPos.z,
    duration: 1200,
    easing: "easeOutCubic",
    update: () => {
      // Check for manual interruption during camera move
      if (isManualZoom && cameraAnimation) {
        cameraAnimation.forEach((anim) => anim.pause());
        anime.remove(camera.position);
        cameraAnimation = null;
      }
    },
    complete: () => {
      // Remove this specific animation from the tracking array
      if (cameraAnimation) {
        cameraAnimation = cameraAnimation.filter((a) => a !== camAnim);
        if (cameraAnimation.length === 0) cameraAnimation = null;
      }
    },
  });

  // Animate controls target
  const targetAnim = anime({
    targets: controls.target,
    x: finalTargetPos.x,
    y: finalTargetPos.y,
    z: finalTargetPos.z,
    duration: 1200,
    easing: "easeOutCubic",
    update: () => {
      // Check for manual interruption during target move
      if (isManualZoom && cameraAnimation) {
        cameraAnimation.forEach((anim) => anim.pause());
        anime.remove(controls.target);
        cameraAnimation = null;
      }
    },
    complete: () => {
      // Remove this specific animation from the tracking array
      if (cameraAnimation) {
        cameraAnimation = cameraAnimation.filter((a) => a !== targetAnim);
        if (cameraAnimation.length === 0) cameraAnimation = null;
      }
    },
  });

  // Store both animations
  cameraAnimation = [camAnim, targetAnim];
  // --- END REFACTOR ---
}

// --- NEW: Helper to check animation status ---
export function isCameraAnimating() {
  return !!cameraAnimation; // True if cameraAnimation array exists and is not null/empty
}
