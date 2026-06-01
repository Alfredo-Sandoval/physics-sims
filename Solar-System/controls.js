// File: Solar-System/controls.js
// --- Controls Module ---------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

// Import just the UI helpers we need
import { selectObject, deselectObject, getUIReferences } from "./ui.js";
import { findCelestialBodyByName } from "./utils.js";
import {
  getCamera,
  getControls,
  getRenderer,
  getSimulationSpeed,
  setSimulationSpeed,
  updateFollowTarget,
  stopCameraFollow,
  setSelectedObject,
  getCelestialBodies,
} from "./appState.js";
import { updateLabelsVisibility } from "./ui.js";

/* ---------------------------------------------------------------------- */
/*                          Internal state                                */
/* ---------------------------------------------------------------------- */
let simulationSpeed = getSimulationSpeed() ?? 1.0;
let orbitLinesVisible = true;

// Interaction tracking
let isUserInteracting = false;
let manualInteractionTimeout = null;
const INTERACTION_IDLE_DELAY_MS = CONSTANTS.ZOOM.IDLE_DELAY_MS;
let selectableObjectsRef = [];

// Listener references so we can detach during cleanup
let pointerMoveHandler = null;
let clickHandler = null;
let wheelHandler = null;
let keydownHandler = null;
let controlsStartHandler = null;
let controlsEndHandler = null;
let pointerRendererElement = null;
let zoomRendererElement = null;
let controlsInstance = null;
let lastActiveSimulationSpeed = simulationSpeed > 0 ? simulationSpeed : 1.0;
const SCALE_MODE_ENHANCED = "enhanced";
const SCALE_MODE_RELATIVE = "relative";

/* Pointer / ray‑casting helpers --------------------------------------- */
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
// Improve raycaster precision for small objects
raycaster.near = 0.1;
raycaster.far = 10000;

function broadcastUiModeEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function isPausedSpeed(speed) {
  return !Number.isFinite(speed) || speed <= 0;
}

function clampSimulationSpeed(speed) {
  if (!Number.isFinite(speed)) return 1.0;
  return Math.max(0, Math.min(5.0, speed));
}

function getResumeSpeed() {
  return Math.max(0.1, Math.min(5.0, lastActiveSimulationSpeed || 1.0));
}

function syncPlaybackUi(speed) {
  const normalized = clampSimulationSpeed(speed);
  const speedSlider = document.getElementById("speedSlider");
  const speedSpan = document.getElementById("speedValue");
  const togglePlaybackBtn = document.getElementById("togglePlaybackBtn");
  const resetSpeedBtn = document.getElementById("resetSpeedBtn");
  const paused = isPausedSpeed(normalized);

  if (speedSlider) speedSlider.value = String(normalized);
  if (speedSpan) speedSpan.textContent = normalized.toFixed(1) + "x";
  if (togglePlaybackBtn) {
    togglePlaybackBtn.textContent = paused ? "Resume" : "Pause";
    togglePlaybackBtn.setAttribute("aria-pressed", String(!paused));
  }
  if (resetSpeedBtn) {
    resetSpeedBtn.disabled = !paused && Math.abs(normalized - 1.0) < 0.001;
  }
}

function applySimulationSpeed(speed) {
  const normalized = clampSimulationSpeed(speed);
  simulationSpeed = normalized;
  if (!isPausedSpeed(normalized)) {
    lastActiveSimulationSpeed = normalized;
  }
  setSimulationSpeed(normalized);
  syncPlaybackUi(normalized);
}

function getScaleMultiplierFromProfile(profile, mode) {
  if (!profile || typeof profile !== "object") return null;
  const raw =
    mode === SCALE_MODE_RELATIVE
      ? Number(profile.relative)
      : Number(profile.enhanced);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function applyScaleModeToScene(scene, mode) {
  if (!scene) return;
  scene.traverse((object) => {
    const profile = object.userData?.scaleModeProfile;
    const scale = getScaleMultiplierFromProfile(profile, mode);
    if (!Number.isFinite(scale)) return;
    object.scale.setScalar(scale);
  });

  scene.traverse((object) => {
    const ud = object.userData;
    if (!ud?.isSelectable) return;
    const enhanced = Number(ud.displayRadiusEnhanced);
    const relative = Number(ud.displayRadiusRelative);
    if (mode === SCALE_MODE_RELATIVE && Number.isFinite(relative) && relative > 0) {
      ud.displayRadius = relative;
      return;
    }
    if (Number.isFinite(enhanced) && enhanced > 0) {
      ud.displayRadius = enhanced;
    }
  });

  const selected = getUIReferences().selectedObject;
  if (selected) {
    updateFollowTarget(selected);
  }
}

function applyScaleMode(scaleModeBtn, scaleIndicator, scene, mode) {
  const activeMode = mode === SCALE_MODE_RELATIVE ? SCALE_MODE_RELATIVE : SCALE_MODE_ENHANCED;
  const isRelativeMode = activeMode === SCALE_MODE_RELATIVE;
  const modeLabel = isRelativeMode ? "Relative Size" : "Enhanced";
  const indicatorText = isRelativeMode
    ? "Scale Mode: Relative Sizes"
    : "Scale Mode: Enhanced Visibility";

  document.body.dataset.scaleMode = activeMode;
  document.documentElement.dataset.scaleMode = activeMode;

  if (scaleModeBtn) {
    scaleModeBtn.textContent = `Scale Mode: ${modeLabel}`;
    scaleModeBtn.setAttribute("aria-pressed", String(isRelativeMode));
  }
  if (scaleIndicator) {
    scaleIndicator.textContent = indicatorText;
    scaleIndicator.dataset.scaleMode = activeMode;
  }

  applyScaleModeToScene(scene, activeMode);
  broadcastUiModeEvent("solar-system:scale-mode-changed", { mode: activeMode });
  return activeMode;
}

function applyFocusMode(focusModeBtn, enabled) {
  const isEnabled = enabled === true;
  document.body.classList.toggle("focus-mode", isEnabled);
  document.body.dataset.focusMode = isEnabled ? "on" : "off";
  document.documentElement.dataset.focusMode = isEnabled ? "on" : "off";

  if (focusModeBtn) {
    focusModeBtn.textContent = isEnabled ? "Focus Mode: On" : "Focus Mode: Off";
    focusModeBtn.setAttribute("aria-pressed", String(isEnabled));
  }

  broadcastUiModeEvent("solar-system:focus-mode-changed", { enabled: isEnabled });
  return isEnabled;
}

/* ---------------------------------------------------------------------- */
/*                       Public API                                       */
/* ---------------------------------------------------------------------- */

/**
 * Attach pointer‑move & click listeners for object selection.
 */
export function setupPointerEvents(scene, camera, renderer, selectable) {
  cleanupPointerListeners();

  selectableObjectsRef = Array.isArray(selectable) ? selectable : [];
  pointerRendererElement = renderer?.domElement ?? null;
  if (!pointerRendererElement) return;

  // Throttle pointer move events for performance
  let lastPointerUpdate = 0;
  const POINTER_THROTTLE_MS = 16; // ~60fps

  pointerMoveHandler = (e) => {
    const now = performance.now();
    if (now - lastPointerUpdate < POINTER_THROTTLE_MS) return;
    lastPointerUpdate = now;

    // Compute NDC relative to the renderer element, not the window
    const rect = pointerRendererElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  pointerRendererElement.addEventListener("pointermove", pointerMoveHandler, {
    passive: true,
  });

  clickHandler = (e) => {
    e.preventDefault();

    const rect = pointerRendererElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(selectableObjectsRef, true);

    let tgt = null;
    for (const hit of hits) {
      const obj = hit.object;

      if (obj.userData?.clickTarget?.userData?.isSelectable) {
        tgt = obj.userData.clickTarget;
        break;
      }

      if (obj.userData?.isSelectable) {
        tgt = obj;
        break;
      }

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
        setSelectedObject(tgt);
        updateFollowTarget(tgt);
      }
    } else if (getUIReferences().selectedObject) {
      deselectObject();
      setSelectedObject(null);
      stopCameraFollow();
    }
  };

  pointerRendererElement.addEventListener("click", clickHandler);
}

function cleanupPointerListeners() {
  if (pointerRendererElement) {
    if (pointerMoveHandler) {
      pointerRendererElement.removeEventListener("pointermove", pointerMoveHandler);
    }
    if (clickHandler) {
      pointerRendererElement.removeEventListener("click", clickHandler);
    }
  }
  pointerMoveHandler = null;
  clickHandler = null;
  pointerRendererElement = null;
  selectableObjectsRef = [];
}

/**
 * Hook up all DOM UI controls (speed slider, dropdown, buttons).
 */
export function setupUIControls(planetConfigs, selectable, scene) {
  /* Speed slider ------------------------------------------------------- */
  const speedSlider = document.getElementById("speedSlider");
  const togglePlaybackBtn = document.getElementById("togglePlaybackBtn");
  const resetSpeedBtn = document.getElementById("resetSpeedBtn");
  if (speedSlider) {
    // Ensure a sane default: 1.0x on first load
    simulationSpeed = getSimulationSpeed();
    // If speed is not valid or is zero, default to 1.0
    if (!Number.isFinite(simulationSpeed) || simulationSpeed === 0) {
      simulationSpeed = 1.0;
    }
    applySimulationSpeed(simulationSpeed);

    speedSlider.addEventListener("input", () => {
      applySimulationSpeed(parseFloat(speedSlider.value));
    });
  }

  togglePlaybackBtn?.addEventListener("click", () => {
    const currentSpeed = getSimulationSpeed() ?? simulationSpeed;
    applySimulationSpeed(isPausedSpeed(currentSpeed) ? getResumeSpeed() : 0);
  });

  resetSpeedBtn?.addEventListener("click", () => {
    applySimulationSpeed(1.0);
  });

  /* Planet navigation dropdown ---------------------------------------- */
  const planetNav = document.getElementById("planetNav");
  const moonNav = document.getElementById("moonNav");

  // Build planet-to-moons mapping from planetConfigs
  const planetMoonsMap = new Map();
  if (Array.isArray(planetConfigs)) {
    planetConfigs.forEach((cfg) => {
      if (cfg.name && Array.isArray(cfg.moons) && cfg.moons.length > 0) {
        planetMoonsMap.set(cfg.name, cfg.moons.map((m) => m.name));
      }
    });
  }

  // Helper to update moon dropdown based on selected planet
  const updateMoonDropdown = (planetName) => {
    if (!moonNav) return;

    const moons = planetMoonsMap.get(planetName);
    // Clear existing options
    while (moonNav.firstChild) moonNav.removeChild(moonNav.firstChild);

    if (moons && moons.length > 0) {
      moonNav.disabled = false;
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = `-- Select Moon (${moons.length}) --`;
      moonNav.appendChild(defaultOpt);

      moons.forEach((moonName) => {
        const opt = document.createElement("option");
        opt.value = moonName;
        opt.textContent = moonName;
        moonNav.appendChild(opt);
      });
    } else {
      moonNav.disabled = true;
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = planetName === "Sun" || planetName === "Mercury" || planetName === "Venus"
        ? "-- No moons --"
        : "-- Select a planet first --";
      moonNav.appendChild(defaultOpt);
    }
  };

  if (planetNav) {
    planetNav.addEventListener("change", () => {
      const name = planetNav.value;
      if (!name) {
        updateMoonDropdown(null);
        return;
      }
      const obj = findCelestialBodyByName(name, selectable);
      if (obj) {
        selectObject(obj);
        setSelectedObject(obj);
        // Start following the selected object
        updateFollowTarget(obj);
        // Update moon dropdown for this planet
        updateMoonDropdown(name);
      }
    });
  }

  /* Moon navigation dropdown ------------------------------------------- */
  if (moonNav) {
    moonNav.addEventListener("change", () => {
      const name = moonNav.value;
      if (!name) return;
      const obj = findCelestialBodyByName(name, selectable);
      if (obj) {
        selectObject(obj);
        setSelectedObject(obj);
        // Start following the selected moon
        updateFollowTarget(obj);
      }
    });
  }

  /* Camera reset ------------------------------------------------------- */
  document.getElementById("resetCameraBtn")?.addEventListener("click", () => {
    const camera = getCamera();
    const controlsRef = getControls();
    if (!camera || !controlsRef) return;
    camera.position.set(150, 100, 150);
    camera.up.set(0, 1, 0);
    controlsRef.target.set(0, 0, 0);
    controlsRef.update();
    deselectObject();
    setSelectedObject(null);
    stopCameraFollow();
  });

  /* Angled ecliptic view --------------------------------------------- */
  document.getElementById("topDownBtn")?.addEventListener("click", () => {
    const camera = getCamera();
    const controlsRef = getControls();
    if (!camera || !controlsRef) return;
    const distance = Math.max(camera.position.length(), CONSTANTS.DEFAULT_CAMERA_DISTANCE);
    const y = distance * 0.4;
    const xz = distance * 0.65;
    camera.position.set(xz, y, xz);
    camera.up.set(0, 1, 0);
    controlsRef.target.set(0, 0, 0);
    controlsRef.update();
    deselectObject();
    setSelectedObject(null);
    stopCameraFollow();
  });

  /* Toggle orbit‑lines ------------------------------------------------- */
  const toggleOrbitsBtn = document.getElementById("toggleOrbitsBtn");
  if (toggleOrbitsBtn && scene) {
    toggleOrbitsBtn.textContent = orbitLinesVisible ? "Hide Orbits" : "Show Orbits";
    toggleOrbitsBtn.addEventListener("click", () => {
      orbitLinesVisible = !orbitLinesVisible;
      scene.traverse((o) => {
        if (o.userData?.isOrbitLine) o.visible = orbitLinesVisible;
      });
      toggleOrbitsBtn.textContent = orbitLinesVisible ? "Hide Orbits" : "Show Orbits";
    });
  }

  /* Asteroid Belt toggles ---------------------------------------------- */
  let asteroidBeltHighlighted = false;
  const toggleAsteroidBeltBtn = document.getElementById("toggleAsteroidBeltBtn");
  const highlightAsteroidBeltBtn = document.getElementById("highlightAsteroidBeltBtn");
  const syncAsteroidBeltControls = () => {
    if (!scene) return;
    const asteroidBelt = scene.getObjectByName("AsteroidBelt");
    if (!asteroidBelt) {
      if (toggleAsteroidBeltBtn) {
        toggleAsteroidBeltBtn.disabled = true;
        toggleAsteroidBeltBtn.textContent = "Asteroid Belt Unavailable";
      }
      if (highlightAsteroidBeltBtn) {
        highlightAsteroidBeltBtn.disabled = true;
      }
      return;
    }
    const visible = asteroidBelt.visible !== false;
    if (toggleAsteroidBeltBtn) {
      toggleAsteroidBeltBtn.disabled = false;
      toggleAsteroidBeltBtn.textContent = visible ? "Hide Asteroid Belt" : "Show Asteroid Belt";
    }
    if (highlightAsteroidBeltBtn) {
      highlightAsteroidBeltBtn.disabled = !visible;
      highlightAsteroidBeltBtn.textContent = asteroidBeltHighlighted
        ? "Un-highlight Asteroid Belt"
        : "Highlight Asteroid Belt";
    }
  };

  if (toggleAsteroidBeltBtn && scene) {
    syncAsteroidBeltControls();
    toggleAsteroidBeltBtn.addEventListener("click", () => {
      const asteroidBelt = scene.getObjectByName("AsteroidBelt");
      if (!asteroidBelt) {
        console.warn("Asteroid belt not found");
        syncAsteroidBeltControls();
        return;
      }
      asteroidBelt.visible = !asteroidBelt.visible;
      if (asteroidBelt.userData) {
        asteroidBelt.userData.lastUpdateMs = 0;
      }
      syncAsteroidBeltControls();
    });
  }

  /* Highlight Asteroid Belt -------------------------------------------- */
  if (highlightAsteroidBeltBtn && scene) {
    syncAsteroidBeltControls();
    highlightAsteroidBeltBtn.addEventListener("click", () => {
      asteroidBeltHighlighted = !asteroidBeltHighlighted;

      // Find the asteroid belt
      const asteroidBelt = scene.getObjectByName("AsteroidBelt");
      if (!asteroidBelt) {
        console.warn("Asteroid belt not found");
        return;
      }

      // Toggle highlight on impostor ring (visible when zoomed out)
      const impostor = asteroidBelt.getObjectByName("AsteroidBeltImpostor");
      if (impostor && impostor.material) {
        if (asteroidBeltHighlighted) {
          impostor.material.color.setHex(0xff8c42);
          impostor.material.opacity = 0.35;
        } else {
          impostor.material.color.setHex(0x88837a);
          impostor.material.opacity = 0.16;
        }
      }

      // Toggle emissive glow on all asteroid materials
      if (asteroidBelt.userData?.materials) {
        asteroidBelt.userData.materials.forEach((material) => {
          if (asteroidBeltHighlighted) {
            material.emissive.setHex(0x8b4513);
            material.emissiveIntensity = 0.4;
          } else {
            material.emissive.setHex(0x000000);
            material.emissiveIntensity = 0;
          }
        });
      }

      const dustMaterial = asteroidBelt.userData?.dustMaterial;
      if (dustMaterial) {
        if (asteroidBeltHighlighted) {
          dustMaterial.color.setHex(0xffb36a);
          dustMaterial.opacity = 0.55;
        } else {
          dustMaterial.color.setHex(0x9a8f84);
          dustMaterial.opacity = 0.35;
        }
      }

      // Toggle glow on named asteroids
      if (asteroidBelt.userData?.namedAsteroids) {
        asteroidBelt.userData.namedAsteroids.forEach((asteroid) => {
          if (asteroid.material) {
            if (asteroidBeltHighlighted) {
              asteroid.material.emissive.setHex(0xff8c42);
              asteroid.material.emissiveIntensity = 0.7;
            } else {
              asteroid.material.emissive.setHex(0x000000);
              asteroid.material.emissiveIntensity = 0;
            }
          }
        });
      }

      syncAsteroidBeltControls();
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
  const setPlanes = (vis) => {
    if (!scene) return;
    scene.traverse((o) => {
      if (o.userData?.isOrbitalPlane) o.visible = vis;
    });
  };

  // Hide orbital planes by default
  setPlanes(false);

  // Set up checkbox toggle if it exists
  const planesCheckbox = document.getElementById("planesCheckbox");
  if (planesCheckbox) {
    planesCheckbox.checked = false;
    planesCheckbox.addEventListener("change", () => setPlanes(planesCheckbox.checked));
  }

  /* Shadows toggle ---------------------------------------------------- */
  const shadowsCheckbox = document.getElementById("shadowsCheckbox");
  if (shadowsCheckbox) {
    // Off by default — shadows are expensive and barely visible in a space scene
    shadowsCheckbox.checked = false;
    const renderer = getRenderer();
    if (renderer) renderer.shadowMap.enabled = false;

    shadowsCheckbox.addEventListener("change", () => {
      const r = getRenderer();
      if (!r) return;
      r.shadowMap.enabled = shadowsCheckbox.checked;
      r.shadowMap.needsUpdate = true;
    });
  }

  /* Scale/focus UI mode toggles ---------------------------------------- */
  const scaleModeBtn = document.getElementById("toggleScaleModeBtn");
  const scaleIndicator = document.getElementById("scaleIndicator");
  const focusModeBtn = document.getElementById("toggleFocusModeBtn");

  let activeScaleMode = applyScaleMode(
    scaleModeBtn,
    scaleIndicator,
    scene,
    SCALE_MODE_ENHANCED
  );
  let focusModeEnabled = applyFocusMode(focusModeBtn, false);

  if (scaleModeBtn) {
    scaleModeBtn.addEventListener("click", () => {
      activeScaleMode = applyScaleMode(
        scaleModeBtn,
        scaleIndicator,
        scene,
        activeScaleMode === SCALE_MODE_ENHANCED ? SCALE_MODE_RELATIVE : SCALE_MODE_ENHANCED
      );
    });
  }

  if (focusModeBtn) {
    focusModeBtn.addEventListener("click", () => {
      focusModeEnabled = applyFocusMode(focusModeBtn, !focusModeEnabled);
    });
  }
}

/**
 * Mark manual zoom when user scrolls wheel or starts orbit‑control drag.
 */
export function setupZoomDetection(renderer, controls) {
  if (!renderer || !controls) return;
  cleanupZoomDetectionListeners();

  controlsInstance = controls;
  zoomRendererElement = renderer.domElement;
  if (!zoomRendererElement) return;

  controlsStartHandler = () => {
    isUserInteracting = true;
    if (manualInteractionTimeout) {
      clearTimeout(manualInteractionTimeout);
      manualInteractionTimeout = null;
    }
    stopCameraFollow();

    // Dynamic Resolution: Drop to 1.0 (or lower) for performance during interaction
    if (renderer) {
      renderer.userData = renderer.userData || {};
      const currentPixelRatio = renderer.getPixelRatio();
      renderer.userData.originalPixelRatio = currentPixelRatio;
      if (currentPixelRatio > 1) {
        renderer.setPixelRatio(Math.min(1.0, currentPixelRatio));
      }
    }
  };

  controlsEndHandler = () => {
    if (manualInteractionTimeout) {
      clearTimeout(manualInteractionTimeout);
      manualInteractionTimeout = null;
    }
    manualInteractionTimeout = setTimeout(() => {
      isUserInteracting = false;
      manualInteractionTimeout = null;

      // Dynamic Resolution: Restore high quality
      if (renderer && renderer.userData?.originalPixelRatio) {
        renderer.setPixelRatio(renderer.userData.originalPixelRatio);
      }
    }, INTERACTION_IDLE_DELAY_MS);
  };

  controls.addEventListener("start", controlsStartHandler);
  controls.addEventListener("end", controlsEndHandler);

  // Removed manual wheel listener to avoid conflict with OrbitControls.
  // OrbitControls 'start' event is sufficient to detect interaction.

  keydownHandler = (e) => {
    if (e.key !== "Escape") return;
    // Keyboard shortcuts handler owns Escape when registered.
    if (keyboardShortcutHandler) return;
    handleEscapeKeyAction();
  };

  window.addEventListener("keydown", keydownHandler);
}

function cleanupZoomDetectionListeners() {
  if (controlsInstance) {
    if (controlsStartHandler) {
      controlsInstance.removeEventListener("start", controlsStartHandler);
    }
    if (controlsEndHandler) {
      controlsInstance.removeEventListener("end", controlsEndHandler);
    }
  }
  // wheelHandler cleanup removed
  if (keydownHandler) {
    window.removeEventListener("keydown", keydownHandler);
  }
  controlsStartHandler = null;
  controlsEndHandler = null;
  wheelHandler = null;
  keydownHandler = null;
  zoomRendererElement = null;
  controlsInstance = null;
}

/* Simple getters / setters -------------------------------------------- */
export function getCameraTarget() {
  return null; // Targeting handled by main via cameraFollowTarget
}

export function getIsManualZoom() {
  return isUserInteracting;
}

export function cleanupControls() {
  cleanupPointerListeners();
  cleanupZoomDetectionListeners();
  cleanupKeyboardShortcuts();
  if (manualInteractionTimeout) {
    clearTimeout(manualInteractionTimeout);
    manualInteractionTimeout = null;
  }
  isUserInteracting = false;
}

/* ---------------------------------------------------------------------- */
/*                     Keyboard shortcuts                                  */
/* ---------------------------------------------------------------------- */
const PLANET_KEYS = ["Sun", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
let keyboardShortcutHandler = null;
let shortcutsHelpVisible = false;

function isElementVisible(element) {
  if (!element || element.hidden) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function hasOpenModalOrDialog() {
  const selectors = [
    "dialog[open]",
    ".modal.show",
    ".modal[aria-hidden='false']",
    "[role='dialog'][aria-hidden='false']",
    "[role='dialog'][aria-modal='true']",
  ];
  for (const selector of selectors) {
    const candidates = document.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (candidate.id === "shortcutsHelp") continue;
      if (isElementVisible(candidate)) return true;
    }
  }
  return false;
}

function handleEscapeKeyAction() {
  if (shortcutsHelpVisible) {
    toggleShortcutsHelp();
    return;
  }

  if (hasOpenModalOrDialog()) return;

  const selected = getUIReferences().selectedObject;
  if (selected) {
    deselectObject();
    setSelectedObject(null);
  }
  stopCameraFollow();
}

function shouldIgnoreShortcutEvent(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;

  const interactiveSelector = [
    "input",
    "textarea",
    "select",
    "button",
    "a[href]",
    "[contenteditable='true']",
    "[contenteditable='']",
    "[role='button']",
    "[role='textbox']",
  ].join(",");
  return Boolean(target.closest(interactiveSelector));
}

export function setupKeyboardShortcuts(scene) {
  if (keyboardShortcutHandler) {
    window.removeEventListener("keydown", keyboardShortcutHandler);
  }

  keyboardShortcutHandler = (e) => {
    if (shouldIgnoreShortcutEvent(e)) return;

    const selectable = getCelestialBodies() ?? [];

    const goToBody = (name) => {
      const obj = findCelestialBodyByName(name, selectable);
      if (obj) {
        selectObject(obj);
        setSelectedObject(obj);
        updateFollowTarget(obj);
        // Sync planet dropdown
        const planetNav = document.getElementById("planetNav");
        if (planetNav) planetNav.value = name;
      }
    };

    switch (e.key) {
      case " ":
        e.preventDefault();
        applySimulationSpeed(isPausedSpeed(getSimulationSpeed()) ? getResumeSpeed() : 0);
        break;
      case "+":
      case "=":
        e.preventDefault();
        applySimulationSpeed(Math.min(5.0, (getSimulationSpeed() || 1) * 2));
        break;
      case "-":
      case "_":
        e.preventDefault();
        applySimulationSpeed(Math.max(0.1, (getSimulationSpeed() || 1) / 2));
        break;
      case "0":
        goToBody("Sun");
        break;
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
        goToBody(PLANET_KEYS[parseInt(e.key)]);
        break;
      case "f":
      case "F":
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
        break;
      case "s":
      case "S": {
        e.preventDefault();
        const btn = document.getElementById("toggleScaleModeBtn");
        if (btn) btn.click();
        break;
      }
      case "v":
      case "V": {
        e.preventDefault();
        const btn = document.getElementById("toggleFocusModeBtn");
        if (btn) btn.click();
        break;
      }
      case "l":
      case "L": {
        const btn = document.getElementById("togglePlanetLabelsBtn");
        if (btn) btn.click();
        break;
      }
      case "m":
      case "M": {
        const btn = document.getElementById("toggleMoonLabelsBtn");
        if (btn) btn.click();
        break;
      }
      case "o":
      case "O": {
        const btn = document.getElementById("toggleOrbitsBtn");
        if (btn) btn.click();
        break;
      }
      case "r":
      case "R": {
        const btn = document.getElementById("resetCameraBtn");
        if (btn) btn.click();
        break;
      }
      case "?":
      case "h":
      case "H":
        toggleShortcutsHelp();
        break;
      case "Escape":
        handleEscapeKeyAction();
        break;
    }
  };

  window.addEventListener("keydown", keyboardShortcutHandler);
}

function toggleShortcutsHelp() {
  let panel = document.getElementById("shortcutsHelp");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "shortcutsHelp";
    panel.className = "shortcuts-help";
    const content = [
      ["Space", "Pause / Play"],
      ["+  /  -", "Speed up / Slow down"],
      ["0", "Go to Sun"],
      ["1 - 8", "Go to planet"],
      ["F", "Toggle fullscreen"],
      ["S", "Toggle scale mode"],
      ["V", "Toggle focus mode"],
      ["L", "Toggle planet labels"],
      ["M", "Toggle moon labels"],
      ["O", "Toggle orbits"],
      ["R", "Reset camera"],
      ["Esc", "Deselect / Close"],
      ["?  /  H", "This help"],
    ];
    const title = document.createElement("h4");
    title.textContent = "Keyboard Shortcuts";
    panel.appendChild(title);
    const table = document.createElement("div");
    table.className = "shortcuts-grid";
    content.forEach(([key, desc]) => {
      const kEl = document.createElement("kbd");
      kEl.textContent = key;
      const dEl = document.createElement("span");
      dEl.textContent = desc;
      table.appendChild(kEl);
      table.appendChild(dEl);
    });
    panel.appendChild(table);
    document.body.appendChild(panel);
  }
  shortcutsHelpVisible = !shortcutsHelpVisible;
  panel.style.display = shortcutsHelpVisible ? "block" : "none";
}

export function cleanupKeyboardShortcuts() {
  if (keyboardShortcutHandler) {
    window.removeEventListener("keydown", keyboardShortcutHandler);
    keyboardShortcutHandler = null;
  }
  const panel = document.getElementById("shortcutsHelp");
  if (panel?.parentElement) panel.parentElement.removeChild(panel);
  shortcutsHelpVisible = false;
}

// Camera targeting functions removed - using standard orbit controls
