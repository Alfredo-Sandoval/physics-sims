// File: Solar-System/js/ui.js
// --- UI Module ---------------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

/* ---------------------------------------------------------------------- */
/*                        DOM element refs                                */
/* ---------------------------------------------------------------------- */
let infoPanel, infoTitle, infoTypeBadge, infoDistance, infoSize, infoBodyType;
let infoPhysical, infoOrbital, infoCoolFacts, infoDetails, coolFactsSection;
let speedSpan, dayCounter, debugDiv;
let materials;

let selectedObject = null;
const originalMaterials = new Map(); // Mesh → Material
const outlineMeshes = new Map(); // Object3D → outline Mesh

/* Collapsible menu refs */
let menuContainer, menuToggleBtn;

/* Planet labels */
const planetLabels = new Map(); // Object3D → HTML label element
const planetLabelLines = new Map(); // Object3D → SVG line element
let labelsEnabled = true;
let moonLabelsEnabled = false;

/* ---------------------------------------------------------------------- */
/*                         Initialisation                                 */
/* ---------------------------------------------------------------------- */
export function initUI() {
  infoPanel = document.getElementById("info");
  infoTitle = document.getElementById("info-title");
  infoTypeBadge = document.getElementById("info-type-badge");
  infoDistance = document.getElementById("info-distance");
  infoSize = document.getElementById("info-size");
  infoBodyType = document.getElementById("info-body-type");
  infoPhysical = document.getElementById("info-physical");
  infoOrbital = document.getElementById("info-orbital");
  infoCoolFacts = document.getElementById("info-cool-facts");
  infoDetails = document.getElementById("info-details");
  coolFactsSection = document.getElementById("cool-facts-section");
  speedSpan = document.getElementById("speedValue");
  dayCounter = document.getElementById("dayCounter");

  materials = CONSTANTS.createMaterials();

  createDebugOverlay();
  initMenuToggle();
  initLabels();
}

/* ---------------------------------------------------------------------- */
/*                         Planet Labels                                  */
/* ---------------------------------------------------------------------- */
function initLabels() {
  // Create toggle button for labels
  const toggleBtn = document.createElement("button");
  toggleBtn.textContent = "Hide Labels";
  toggleBtn.className = "controlBtn";
  toggleBtn.id = "toggleLabelsBtn";
  
  // Create toggle button for moon labels
  const moonToggleBtn = document.createElement("button");
  moonToggleBtn.textContent = "Show Moon Labels";
  moonToggleBtn.className = "controlBtn";
  moonToggleBtn.id = "toggleMoonLabelsBtn";
  
  // Add to additional controls
  const additionalControls = document.getElementById("additionalControls");
  if (additionalControls) {
    additionalControls.appendChild(toggleBtn);
    additionalControls.appendChild(moonToggleBtn);
  }
  
  toggleBtn.addEventListener("click", () => {
    labelsEnabled = !labelsEnabled;
    toggleBtn.textContent = labelsEnabled ? "Hide Labels" : "Show Labels";
    updateLabelsVisibility();
  });
  
  moonToggleBtn.addEventListener("click", () => {
    moonLabelsEnabled = !moonLabelsEnabled;
    moonToggleBtn.textContent = moonLabelsEnabled ? "Hide Moon Labels" : "Show Moon Labels";
    updateLabelsVisibility();
  });
}

export function createPlanetLabel(celestialBody) {
  if (!celestialBody?.userData?.name) return;
  
  const label = document.createElement("div");
  label.className = "planet-label";
  label.textContent = celestialBody.userData.name;
  
  // Add appropriate class based on object type
  if (celestialBody.userData.type === "star") {
    label.classList.add("sun");
  } else if (celestialBody.userData.type === "moon") {
    label.classList.add("moon");
  }
  
  // Create extended info panel
  const extendedInfo = document.createElement("div");
  extendedInfo.className = "planet-label-extended";
  
  // Add basic info to extended panel
  const config = celestialBody.userData.config;
  if (config?.info) {
    const infoText = [];
    if (config.info.massEarths) infoText.push(`Mass: ${config.info.massEarths} Earths`);
    if (config.info.orbitalPeriod) infoText.push(`Orbit: ${config.info.orbitalPeriod} days`);
    if (config.info.composition) infoText.push(`Type: ${config.info.composition.split(' ')[0]}`);
    extendedInfo.innerHTML = infoText.join('<br>');
  }
  
  label.appendChild(extendedInfo);
  
  // Add click handler for camera following
  label.addEventListener('click', (e) => {
    e.stopPropagation();
    selectObject(celestialBody);
    // Start following the clicked object
    if (window.setCameraFollowTarget) {
      window.setCameraFollowTarget(celestialBody);
    }
  });
  
  // Create SVG line element
  const lineContainer = document.createElement("div");
  lineContainer.className = "planet-label-line";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100");
  svg.setAttribute("height", "100");
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.appendChild(path);
  lineContainer.appendChild(svg);
  
  document.body.appendChild(label);
  document.body.appendChild(lineContainer);
  
  planetLabels.set(celestialBody, label);
  planetLabelLines.set(celestialBody, { container: lineContainer, svg: svg, path: path });
  
  return label;
}

export function updateLabelsVisibility() {
  planetLabels.forEach((label, body) => {
    const isMoon = body.userData?.type === "moon";
    const shouldShow = labelsEnabled && (!isMoon || moonLabelsEnabled);
    label.style.display = shouldShow ? "block" : "none";
    
    const lineData = planetLabelLines.get(body);
    if (lineData) {
      lineData.container.style.display = shouldShow ? "block" : "none";
    }
  });
}

export function updatePlanetLabels(camera, celestialBodies) {
  if (!camera || !celestialBodies) return;
  
  const tempVector = new THREE.Vector3();
  
  // Simple, fast label updates - only show major objects
  const cameraDistance = camera.position.length();
  
  celestialBodies.forEach(body => {
    if (!body?.userData?.name) return;
    
    let label = planetLabels.get(body);
    if (!label) {
      label = createPlanetLabel(body);
    }
    
    if (!label) return;
    
    const isMoon = body.userData?.type === "moon";
    const isSun = body.userData?.name === "Sun";
    const isOuterPlanet = ["Jupiter", "Saturn", "Uranus", "Neptune"].includes(body.userData?.name);
    const isInnerPlanet = ["Mercury", "Venus", "Earth", "Mars"].includes(body.userData?.name);
    
    // Improved visibility rules for better label visibility
    let showLabel = false;
    if (isSun) showLabel = true;
    else if (cameraDistance < 800 && isOuterPlanet) showLabel = true;
    else if (cameraDistance < 600 && isInnerPlanet) showLabel = true;
    else if (cameraDistance < 400 && !isMoon) showLabel = true;
    
    if (!showLabel) {
      label.style.display = "none";
      return;
    }
    
    // Get world position
    body.getWorldPosition(tempVector);
    tempVector.project(camera);
    
    // Check if behind camera
    if (tempVector.z > 1) {
      label.style.display = "none";
      return;
    }
    
    // Convert to screen coordinates
    const x = (tempVector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (tempVector.y * -0.5 + 0.5) * window.innerHeight;
    
    // Simple offset
    const offset = isSun ? 30 : 20;
    
    // Apply styling
    label.style.left = (x + offset) + "px";
    label.style.top = (y - offset) + "px";
    label.style.display = "block";
    label.style.opacity = 1;
    label.style.transform = "scale(1)";
  });
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
      infoPanel.classList.remove("show");
      
      // Use CSS transition for smooth animation
      setTimeout(() => {
        infoPanel.style.display = "none";
        infoPanel.classList.remove("animating-out");
      }, 400);
    }
    return;
  }

  const ud = obj.userData;
  const cfg = ud.config;

  // Update title and badge
  infoTitle.textContent = ud.name || "Unknown";
  infoTypeBadge.textContent = ud.type || "Unknown";
  infoTypeBadge.className = `info-type-badge ${ud.type}`;

  // Update quick stats
  if (ud.type === "star") {
    infoDistance.textContent = "Center";
    infoSize.textContent = cfg.info.Diameter || "--";
    infoBodyType.textContent = "Star";
    
    populateStarInfo(cfg);
  } else if (ud.type === "planet") {
    infoDistance.textContent = `${cfg.orbitRadiusAU} AU`;
    const actualRadius = cfg.actualRadius;
    infoSize.textContent = `${actualRadius.toFixed(2)}× Earth`;
    infoBodyType.textContent = "Planet";
    
    populatePlanetInfo(cfg);
  } else if (ud.type === "moon") {
    infoDistance.textContent = `${(cfg.orbitRadiusKm / 1000).toFixed(0)}k km`;
    infoSize.textContent = `${(cfg.actualRadius * CONSTANTS.EARTH_RADIUS_KM).toFixed(0)} km`;
    infoBodyType.textContent = "Moon";
    
    populateMoonInfo(ud);
  }

  // Handle cool facts
  if (cfg.coolFacts && cfg.coolFacts.length > 0) {
    coolFactsSection.style.display = "block";
    populateCoolFacts(cfg.coolFacts);
  } else {
    coolFactsSection.style.display = "none";
  }

  ensureCloseButton();

  // Position panel next to the selected planet
  positionInfoPanel(obj);

  // Animate in with modern styling
  infoPanel.style.display = "block"; // Make it visible first
  infoPanel.classList.remove("show");
  anime.remove(infoPanel); // Remove any existing animations on this element
  
  // Use CSS transition for smooth animation
  requestAnimationFrame(() => {
    infoPanel.classList.add("show");
    infoPanel.classList.remove("animating-out");
  });
}

/**
 * Position the info panel next to the selected planet
 */
function positionInfoPanel(obj) {
  if (!window.camera || !obj) return;
  
  const tempVector = new THREE.Vector3();
  
  // Get the world position of the selected object
  obj.getWorldPosition(tempVector);
  tempVector.project(window.camera);
  
  // Convert to screen coordinates
  const x = (tempVector.x * 0.5 + 0.5) * window.innerWidth;
  const y = (tempVector.y * -0.5 + 0.5) * window.innerHeight;
  
  // Position panel to the right of the planet
  const offsetX = 60; // Distance from planet
  const panelWidth = 300; // Panel width from CSS
  const panelHeight = 400; // Estimated panel height
  
  let finalX = x + offsetX;
  let finalY = y - panelHeight / 2;
  
  // Keep panel within screen bounds
  if (finalX + panelWidth > window.innerWidth) {
    finalX = x - offsetX - panelWidth; // Position to the left instead
  }
  if (finalY < 20) {
    finalY = 20;
  }
  if (finalY + panelHeight > window.innerHeight - 20) {
    finalY = window.innerHeight - panelHeight - 20;
  }
  
  // Apply position
  infoPanel.style.left = finalX + "px";
  infoPanel.style.top = finalY + "px";
}

function populateStarInfo(cfg) {
  // Physical properties
  infoPhysical.innerHTML = `
    <p><strong>Mass:</strong> <span>${cfg.info.Mass}</span></p>
    <p><strong>Temperature:</strong> <span>${cfg.info.Temperature}</span></p>
    <p><strong>Composition:</strong> <span>${cfg.info.Composition}</span></p>
    <p><strong>Type:</strong> <span>${cfg.info.Type}</span></p>
    <p><strong>Age:</strong> <span>${cfg.info.Age}</span></p>
  `;
  
  // Orbital info (minimal for star)
  infoOrbital.innerHTML = `
    <p><strong>Position:</strong> <span>Center of Solar System</span></p>
    <p><strong>Rotation:</strong> <span>${cfg.info.Rotation}</span></p>
  `;
  
  // Detailed data
  populateDetailedData(cfg.info);
}

function populatePlanetInfo(cfg) {
  // Physical properties
  const actualDiameter = (cfg.actualRadius * 2 * CONSTANTS.EARTH_RADIUS_KM).toLocaleString();
  infoPhysical.innerHTML = `
    <p><strong>Radius:</strong> <span>${cfg.actualRadius.toFixed(3)} Earth radii</span></p>
    <p><strong>Diameter:</strong> <span>${actualDiameter} km</span></p>
    <p><strong>Mass:</strong> <span>${cfg.info.massEarths}× Earth</span></p>
    <p><strong>Density:</strong> <span>${cfg.info.densityGcm3} g/cm³</span></p>
    <p><strong>Surface Gravity:</strong> <span>${cfg.gravityStrength}g</span></p>
    <p><strong>Escape Velocity:</strong> <span>${cfg.info.escapeVelocityKms} km/s</span></p>
  `;
  
  // Orbital mechanics
  infoOrbital.innerHTML = `
    <p><strong>Distance from Sun:</strong> <span>${cfg.orbitRadiusAU} AU</span></p>
    <p><strong>Orbital Period:</strong> <span>${cfg.info.orbitalPeriod} days</span></p>
    <p><strong>Orbital Speed:</strong> <span>${cfg.info.meanOrbitalSpeedKms} km/s</span></p>
    <p><strong>Orbital Eccentricity:</strong> <span>${cfg.info.orbitalEccentricity}</span></p>
    <p><strong>Axial Tilt:</strong> <span>${cfg.axialTilt}°</span></p>
    <p><strong>Rotation Period:</strong> <span>${cfg.rotationPeriod} days</span></p>
  `;
  
  // Detailed data
  populateDetailedData(cfg.info);
}

function populateMoonInfo(ud) {
  const cfg = ud.config;
  const displayInfo = ud.displayInfo;
  
  // Physical properties
  infoPhysical.innerHTML = `
    <p><strong>Size:</strong> <span>${displayInfo.Size}</span></p>
    <p><strong>Parent Planet:</strong> <span>${displayInfo.ParentPlanet}</span></p>
    <p><strong>Composition:</strong> <span>${cfg.composition || "Rocky body"}</span></p>
  `;
  
  // Orbital mechanics
  infoOrbital.innerHTML = `
    <p><strong>Distance:</strong> <span>${displayInfo.Orbit}</span></p>
    <p><strong>Orbital Period:</strong> <span>${displayInfo.OrbitalPeriod}</span></p>
    <p><strong>Rotation Period:</strong> <span>${displayInfo.RotationPeriod}</span></p>
  `;
  
  // Detailed data
  populateDetailedData(displayInfo);
}

function populateCoolFacts(coolFacts) {
  infoCoolFacts.innerHTML = "";
  coolFacts.forEach(fact => {
    const p = document.createElement("p");
    p.textContent = fact;
    infoCoolFacts.appendChild(p);
  });
}

function populateDetailedData(dataObj) {
  infoDetails.innerHTML = "";
  Object.entries(dataObj).forEach(([k, v]) => {
    // Skip keys that are already shown in other sections
    if (['Mass', 'Temperature', 'Composition', 'Type', 'Age', 'Rotation', 
         'massEarths', 'densityGcm3', 'escapeVelocityKms', 'orbitalPeriod', 
         'meanOrbitalSpeedKms', 'orbitalEccentricity', 'Size', 'ParentPlanet', 
         'Orbit', 'OrbitalPeriod', 'RotationPeriod'].includes(k)) {
      return;
    }
    
    const p = document.createElement("p");
    p.innerHTML = `<strong>${k}:</strong> <span>${v}</span>`;
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
  
  // Limit outlines to prevent memory buildup
  limitOutlines();

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
    // Avoid injecting HTML to prevent XSS; show as plain text
    debugDiv.textContent = String(msg ?? "");
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
    infoTitle,
    infoTypeBadge,
    infoDistance,
    infoSize,
    infoBodyType,
    infoPhysical,
    infoOrbital,
    infoCoolFacts,
    infoDetails,
    coolFactsSection,
    speedSpan,
    dayCounter,
    debugDiv,
    selectedObject,
  };
}

/* ---------------------------------------------------------------------- */
/*                      Memory Management / Cleanup                       */
/* ---------------------------------------------------------------------- */

/**
 * Clean up all UI resources to prevent memory leaks
 */
export function cleanupUI() {
  // Clear and dispose outline meshes
  outlineMeshes.forEach((outline, obj) => {
    if (outline) {
      if (outline.parent) {
        outline.parent.remove(outline);
      }
      if (outline.geometry) {
        outline.geometry.dispose();
      }
      if (outline.material) {
        if (outline.material.map) outline.material.map.dispose();
        outline.material.dispose();
      }
    }
  });
  outlineMeshes.clear();

  // Clear original materials map
  originalMaterials.clear();

  // Clear planet labels
  planetLabels.forEach((label) => {
    if (label.parentElement) {
      label.parentElement.removeChild(label);
    }
  });
  planetLabels.clear();

  // Clear planet label lines
  planetLabelLines.forEach((line) => {
    if (line.parentElement) {
      line.parentElement.removeChild(line);
    }
  });
  planetLabelLines.clear();

  // Reset selected object
  selectedObject = null;

  console.log("UI resources cleaned up");
}

/**
 * Limit the number of outlines to prevent memory accumulation
 */
function limitOutlines() {
  const MAX_OUTLINES = 10; // Maximum number of outlines to keep
  
  if (outlineMeshes.size > MAX_OUTLINES) {
    const entries = Array.from(outlineMeshes.entries());
    const toRemove = entries.slice(0, outlineMeshes.size - MAX_OUTLINES);
    
    toRemove.forEach(([obj, outline]) => {
      if (outline) {
        if (outline.parent) outline.parent.remove(outline);
        if (outline.geometry) outline.geometry.dispose();
        if (outline.material) outline.material.dispose();
      }
      outlineMeshes.delete(obj);
    });
  }
}
