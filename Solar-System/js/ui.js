// --- UI Module ---------------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

/* ---------------------------------------------------------------------- */
/*                        DOM element refs                                */
/* ---------------------------------------------------------------------- */
let infoPanel, infoName, infoOrbit, infoSize, infoDetails;
let speedSpan, dayCounter, debugDiv;
let materials;

let selectedObject = null;
const originalMaterials = new Map(); // Mesh → Material
const outlineMeshes = new Map(); // Object3D → outline Mesh

/* Collapsible menu refs */
let menuContainer, menuToggleBtn;

/* ---------------------------------------------------------------------- */
/*                         Initialisation                                 */
/* ---------------------------------------------------------------------- */
export function initUI() {
  infoPanel = document.getElementById("info");
  infoName = document.getElementById("info-name");
  infoOrbit = document.getElementById("info-orbit");
  infoSize = document.getElementById("info-size");
  infoDetails = document.getElementById("info-details");
  speedSpan = document.getElementById("speedValue");
  dayCounter = document.getElementById("dayCounter");

  materials = CONSTANTS.createMaterials();

  createDebugOverlay();
  initMenuToggle();
}

/* ---------------------------------------------------------------------- */
/*                         Collapsible menu                               */
/* ---------------------------------------------------------------------- */
function initMenuToggle() {
  menuContainer = document.getElementById("menuContainer");
  menuToggleBtn = document.getElementById("menuToggle");

  if (!menuContainer || !menuToggleBtn) {
    console.error("UI Error: Menu elements not found!");
    return;
  }

  // Initial state from localStorage
  const initiallyCollapsed = localStorage.getItem("menuCollapsed") === "true";
  if (initiallyCollapsed) {
    menuContainer.classList.add("collapsed");
    // Set initial position without animation
    menuContainer.style.transform = "translateX(-246px)"; // UPDATED VALUE
  } else {
    menuContainer.style.transform = "translateX(0px)";
  }

  // Click listener
  menuToggleBtn.addEventListener("click", () => {
    if (!menuContainer) return;

    const isCurrentlyCollapsed = menuContainer.classList.contains("collapsed");
    const targetTranslateX = isCurrentlyCollapsed ? "0px" : "-246px"; // UPDATED VALUE

    anime.remove(menuContainer); // Stop previous animation
    anime({
      targets: menuContainer,
      translateX: targetTranslateX,
      duration: 350,
      easing: "easeOutQuad",
      begin: () => {
        if (isCurrentlyCollapsed) {
          // Corrected logic: remove class when expanding
          menuContainer.classList.remove("collapsed");
        }
      },
      complete: () => {
        if (!isCurrentlyCollapsed) {
          // Corrected logic: add class after collapsing
          menuContainer.classList.add("collapsed");
        }
        // Save state after animation completes
        localStorage.setItem("menuCollapsed", !isCurrentlyCollapsed);
      },
    });
  });
}

/* ---------------------------------------------------------------------- */
/*                        Object info panel                               */
/* ---------------------------------------------------------------------- */
export function displayObjectInfo(obj) {
  if (!infoPanel) return; // Guard against missing element

  if (!obj?.userData?.config) {
    // Animate out if currently visible
    if (
      infoPanel.style.display !== "none" &&
      !infoPanel.classList.contains("animating-out")
    ) {
      infoPanel.classList.add("animating-out");
      anime({
        targets: infoPanel,
        translateX: ["0%", "-100%"], // Animate from current to off-screen
        opacity: [1, 0],
        duration: 300,
        easing: "easeInQuad",
        complete: () => {
          infoPanel.style.display = "none";
          infoPanel.classList.remove("animating-out");
        },
      });
    }
    return;
  }

  const ud = obj.userData;
  const cfg = ud.config;

  infoName.textContent = ud.name || "Unknown";

  if (ud.type === "star") {
    infoOrbit.textContent = "Center of Solar System";
    infoSize.textContent = cfg.info.Diameter ?? "";
    populateDetails(cfg.info);
  } else if (ud.type === "planet") {
    infoOrbit.textContent = `${cfg.orbitRadiusAU} AU`;
    infoSize.textContent = `${cfg.actualRadiusEarthRadii.toFixed(
      3
    )} Earth radii (${(
      cfg.actualRadiusEarthRadii * CONSTANTS.EARTH_RADIUS_KM
    ).toLocaleString()} km)`;
    populateDetails(cfg.info);
  } else if (ud.type === "moon") {
    infoOrbit.textContent = ud.displayInfo.Orbit;
    infoSize.textContent = ud.displayInfo.Size;
    populateDetails(ud.displayInfo);
  }

  ensureCloseButton();

  // Animate in
  infoPanel.style.display = "block"; // Make it visible first
  infoPanel.style.transform = "translateX(-100%)";
  infoPanel.style.opacity = 0;
  anime.remove(infoPanel); // Remove any existing animations on this element
  anime({
    targets: infoPanel,
    translateX: ["-100%", "0%"],
    opacity: [0, 1],
    duration: 400,
    easing: "easeOutQuad",
    begin: () => {
      infoPanel.classList.remove("animating-out"); // Ensure out-animation class is removed
    },
  });
}

function populateDetails(obj) {
  infoDetails.innerHTML = "";
  Object.entries(obj).forEach(([k, v]) => {
    if (["Diameter", "Size", "Orbit", "Name"].includes(k)) return;
    const p = document.createElement("p");
    p.innerHTML = `<strong>${k}:</strong> ${v}`;
    infoDetails.appendChild(p);
  });
}

function ensureCloseButton() {
  if (infoPanel.querySelector(".info-close-btn")) return;
  const btn = document.createElement("button");
  btn.textContent = "×";
  btn.className = "info-close-btn";
  Object.assign(btn.style, {
    position: "absolute",
    top: "5px",
    right: "5px",
    background: "rgba(80,80,100,.5)",
    border: "none",
    color: "#fff",
    borderRadius: "50%",
    width: "24px",
    height: "24px",
    cursor: "pointer",
    fontSize: "16px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  });
  btn.addEventListener("click", deselectObject);
  infoPanel.appendChild(btn);
}

/* ---------------------------------------------------------------------- */
/*                        Selection / highlight                           */
/* ---------------------------------------------------------------------- */
export function selectObject(obj, follow = true) {
  deselectObject(); // clear previous

  selectedObject = obj;

  // Create outline for the main mesh (planet or sun)
  const mesh = obj.userData.planetMesh ?? obj;
  if (mesh && mesh.isMesh) {
    const outlineGeom = mesh.geometry.clone();

    // Create a unique material instance for this outline
    const outlineMat = new THREE.MeshBasicMaterial({
      color: CONSTANTS.SELECTED_HIGHLIGHT_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    const outline = new THREE.Mesh(outlineGeom, outlineMat);
    outline.scale.multiplyScalar(CONSTANTS.OUTLINE_SCALE);
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);

    // Add outline to the same parent as the mesh
    const parent = mesh.parent || obj;
    parent.add(outline);
    outlineMeshes.set(obj, outline);

    // Single flash effect
    let flashTime = 0;
    const flashDuration = 0.5; // 0.5 seconds
    const originalOpacity = 0.6;

    const flash = () => {
      if (
        flashTime < flashDuration &&
        outline.material &&
        outlineMeshes.has(obj)
      ) {
        flashTime += 0.016; // ~60fps
        const progress = flashTime / flashDuration;
        const opacity =
          originalOpacity + 0.4 * Math.sin(progress * Math.PI * 2); // Flash effect
        outline.material.opacity = Math.max(0.2, Math.min(1.0, opacity));
        requestAnimationFrame(flash);
      } else if (outline.material && outlineMeshes.has(obj)) {
        outline.material.opacity = originalOpacity; // Return to normal
      }
    };

    requestAnimationFrame(flash);

    console.log(`Added outline to ${obj.userData.name}`);
  }

  displayObjectInfo(obj);
  return { cameraTarget: follow ? obj : null };
}

export function deselectObject() {
  if (!selectedObject) return;

  // Remove outline with proper cleanup
  const outline = outlineMeshes.get(selectedObject);
  if (outline) {
    if (outline.parent) {
      outline.parent.remove(outline);
    }

    // Properly dispose of resources
    if (outline.geometry) {
      outline.geometry.dispose();
    }
    if (outline.material) {
      if (outline.material.map) outline.material.map.dispose();
      outline.material.dispose();
    }

    outlineMeshes.delete(selectedObject);
    console.log(`Removed outline from ${selectedObject.userData.name}`);
  }

  // Restore original material if changed
  const mesh = selectedObject.userData.planetMesh ?? selectedObject;
  if (mesh && mesh.isMesh && originalMaterials.has(mesh)) {
    mesh.material = originalMaterials.get(mesh);
    originalMaterials.delete(mesh);
  }

  displayObjectInfo(null);
  selectedObject = null;
}

/* ---------------------------------------------------------------------- */
/*                      Debug overlay & helpers                           */
/* ---------------------------------------------------------------------- */
export function createDebugOverlay() {
  debugDiv = document.createElement("div");
  Object.assign(debugDiv.style, {
    position: "absolute",
    bottom: "200px",
    right: "10px",
    color: "#fff",
    fontFamily: "monospace",
    fontSize: "10px",
    background: "rgba(0,0,0,.7)",
    padding: "5px",
    borderRadius: "3px",
    maxWidth: "300px",
    maxHeight: "200px",
    overflow: "auto",
    zIndex: 1000,
    display: "none",
  });
  document.body.appendChild(debugDiv);

  const btn = document.createElement("button");
  btn.textContent = "Debug";
  Object.assign(btn.style, {
    position: "absolute",
    bottom: "10px",
    right: "10px",
    padding: "4px 8px",
    fontSize: "10px",
    cursor: "pointer",
    background: "rgba(0,0,0,.7)",
    color: "#fff",
    border: "1px solid #444",
    borderRadius: "3px",
  });
  btn.addEventListener("click", () => {
    debugDiv.style.display =
      debugDiv.style.display === "none" ? "block" : "none";
  });
  document.body.appendChild(btn);
}

export function updateDebugInfo(msg) {
  if (debugDiv) {
    debugDiv.innerHTML = msg;
    debugDiv.style.display = "block";
  }
}

/* ---------------------------------------------------------------------- */
/*                     Day counter & speed read‑out                       */
/* ---------------------------------------------------------------------- */
export function updateDayCounter(days) {
  if (dayCounter) dayCounter.textContent = `Days: ${Math.floor(days)}`;
}

export function updateUIDisplay(simSpeed) {
  if (speedSpan) speedSpan.textContent = `${simSpeed.toFixed(1)}x`;

  const currentSelected = getUIReferences().selectedObject; // Get current selection state

  // Stop animations for outlines that are no longer selected or have been removed
  outlineMeshes.forEach((outline, obj) => {
    if (obj !== currentSelected && outline?.userData?.isAnimating) {
      anime.remove(outline.scale);
      outline.userData.isAnimating = false;
      // Optional: Reset scale if needed, though removal in deselectObject should handle this
      // outline.scale.setScalar(CONSTANTS.OUTLINE_SCALE);
    }
  });

  // Start or continue animation for the currently selected object
  if (currentSelected) {
    const outline = outlineMeshes.get(currentSelected);
    // Ensure outline exists and is not already animating
    if (outline && !outline.userData.isAnimating) {
      outline.userData.isAnimating = true;
      anime({
        targets: outline.scale,
        x: [CONSTANTS.OUTLINE_SCALE * 0.98, CONSTANTS.OUTLINE_SCALE * 1.02],
        y: [CONSTANTS.OUTLINE_SCALE * 0.98, CONSTANTS.OUTLINE_SCALE * 1.02],
        z: [CONSTANTS.OUTLINE_SCALE * 0.98, CONSTANTS.OUTLINE_SCALE * 1.02],
        duration: 1000,
        easing: "easeInOutSine",
        direction: "alternate",
        loop: true,
        // Use end callback which runs even if animation is removed/paused
        end: () => {
          // Check outline still exists in map before accessing userData
          if (outlineMeshes.has(currentSelected) && outline?.userData) {
            outline.userData.isAnimating = false;
          }
        },
      });
    }
  }
}

/* ---------------------------------------------------------------------- */
/*                      Outline position update                           */
/* ---------------------------------------------------------------------- */
export function updateOutlines() {
  outlineMeshes.forEach((outline, obj) => {
    if (!outline || !obj) {
      console.warn("Invalid outline or object found, cleaning up...");
      outlineMeshes.delete(obj);
      return;
    }

    // Get the main mesh (planet or moon)
    const mesh = obj.userData.planetMesh ?? obj;
    if (!mesh || !mesh.isMesh) {
      console.warn(
        `Invalid mesh for ${obj.userData?.name}, cleaning up outline...`
      );
      if (outline.parent) outline.parent.remove(outline);
      if (outline.geometry) outline.geometry.dispose();
      if (outline.material) outline.material.dispose();
      outlineMeshes.delete(obj);
      return;
    }

    // Update outline position to match the mesh
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
  });
}

/* ---------------------------------------------------------------------- */
/*                       Public getters                                   */
/* ---------------------------------------------------------------------- */
export function getUIReferences() {
  return {
    infoPanel,
    infoName,
    infoOrbit,
    infoSize,
    infoDetails,
    speedSpan,
    dayCounter,
    debugDiv,
    selectedObject,
  };
}
