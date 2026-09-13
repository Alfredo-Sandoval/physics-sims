import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { selectObject, deselectObject } from "./index.js";
import { findCelestialBodyByName } from "../core/state.js";
import { getSelectedObject, getCamera, getControls, getRenderer, updateFollowTarget,
  stopCameraFollow, setSelectedObject } from "../core/state.js";
import { initPlaybackControls, cleanupPlaybackControls } from "./playback.js";

let orbitLinesVisible = true;
let selectionChangeHandler;
let panelListeners;
const SCALE_MODE_ENHANCED = "enhanced";
const SCALE_MODE_RELATIVE = "relative";
function listen(target, type, handler) {
  target?.addEventListener(type, handler, { signal: panelListeners.signal });
}

function broadcastUiModeEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
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

  const selected = getSelectedObject();
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
export function setupUIControls(planetConfigs, selectable, scene) {
  panelListeners?.abort();
  panelListeners = new AbortController();
  initPlaybackControls();

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

  if (selectionChangeHandler) window.removeEventListener("solar-system:selection-changed", selectionChangeHandler);
  selectionChangeHandler = (event) => {
    const { name, type, parentPlanetName } = event.detail;
    const planetName = type === "moon" ? parentPlanetName : name;
    if (planetNav) planetNav.value = planetName || "";
    updateMoonDropdown(planetName);
    if (moonNav && type === "moon") moonNav.value = name;
  };
  listen(window, "solar-system:selection-changed", selectionChangeHandler);

  if (planetNav) {
    listen(planetNav, "change", () => {
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
    listen(moonNav, "change", () => {
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

  const setCameraView = (position, up) => {
    const camera = getCamera();
    const controlsRef = getControls();
    if (!camera || !controlsRef) return;
    deselectObject();
    stopCameraFollow();
    // Flush residual drag damping before applying an explicit view preset.
    const damping = controlsRef.enableDamping;
    controlsRef.enableDamping = false;
    controlsRef.update();
    camera.position.copy(position);
    camera.up.copy(up);
    camera.near = 0.1;
    camera.updateProjectionMatrix();
    controlsRef.target.set(0, 0, 0);
    controlsRef.update();
    controlsRef.enableDamping = damping;
  };

  listen(document.getElementById("resetCameraBtn"), "click", () => {
    setCameraView(new THREE.Vector3(200, 150, 200), new THREE.Vector3(0, 1, 0));
  });
  listen(document.getElementById("wholeSystemBtn"), "click", () => {
    const camera = getCamera();
    if (!camera) return;
    const radius = Math.max(...planetConfigs.map((cfg) =>
      cfg.orbitRadiusAU * (1 + (cfg.info?.orbitalEccentricity || 0)) * CONSTANTS.ORBIT_SCALE_FACTOR));
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
    const distance = radius / Math.sin(halfFov) * 1.12;
    setCameraView(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(distance), new THREE.Vector3(0, 1, 0));
  });
  // View from ecliptic north (+Y); +X is screen-right, prograde is CCW.
  listen(document.getElementById("topDownBtn"), "click", () => {
    const camera = getCamera();
    if (!camera) return;
    const distance = Math.max(camera.position.length(), CONSTANTS.DEFAULT_CAMERA_DISTANCE);
    setCameraView(new THREE.Vector3(0, distance, 0), new THREE.Vector3(0, 0, -1));
  });

  /* Toggle orbit‑lines ------------------------------------------------- */
  const toggleOrbitsBtn = document.getElementById("toggleOrbitsBtn");
  if (toggleOrbitsBtn && scene) {
    toggleOrbitsBtn.textContent = orbitLinesVisible ? "Hide Orbits" : "Show Orbits";
    listen(toggleOrbitsBtn, "click", () => {
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
    listen(toggleAsteroidBeltBtn, "click", () => {
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
    listen(highlightAsteroidBeltBtn, "click", () => {
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
    listen(labelsCheckbox, "change", () => setLabels(labelsCheckbox.checked));
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
    listen(planesCheckbox, "change", () => setPlanes(planesCheckbox.checked));
  }

  /* Shadows toggle ---------------------------------------------------- */
  const shadowsCheckbox = document.getElementById("shadowsCheckbox");
  if (shadowsCheckbox) {
    // Off by default — shadows are expensive and barely visible in a space scene
    shadowsCheckbox.checked = false;
    const renderer = getRenderer();
    if (renderer) renderer.shadowMap.enabled = false;

    listen(shadowsCheckbox, "change", () => {
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
    listen(scaleModeBtn, "click", () => {
      activeScaleMode = applyScaleMode(
        scaleModeBtn,
        scaleIndicator,
        scene,
        activeScaleMode === SCALE_MODE_ENHANCED ? SCALE_MODE_RELATIVE : SCALE_MODE_ENHANCED
      );
    });
  }

  if (focusModeBtn) {
    listen(focusModeBtn, "click", () => {
      focusModeEnabled = applyFocusMode(focusModeBtn, !focusModeEnabled);
    });
  }
}

export function cleanupControls() {
  cleanupPlaybackControls();
  panelListeners?.abort();
  panelListeners = null;
  if (selectionChangeHandler) window.removeEventListener("solar-system:selection-changed", selectionChangeHandler);
  selectionChangeHandler = null;
}
