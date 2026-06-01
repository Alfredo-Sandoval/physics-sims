// File: Solar-System/js/ui.js
// --- UI Module ---------------------------------------------------------
import * as THREE from "./vendor/three/build/three.module.js";
import * as CONSTANTS from "./constants.js";
import {
  updateFollowTarget,
  stopCameraFollow,
  getCamera,
  setSelectedObject as setSelectedObjectState,
  getSelectedObject as getSelectedObjectState,
} from "./appState.js";
import {
  debug as logDebug,
  info as logInfo,
  warn as logWarn,
  error as logError,
} from "./logger.js";
import { getViewportSize, getComputedStyleSafe } from "./viewport.js";

/* ---------------------------------------------------------------------- */
/*                        DOM element refs                                */
/* ---------------------------------------------------------------------- */
let infoPanel, infoTitle, infoTypeBadge, infoDistance, infoSize, infoBodyType;
let infoPhysical, infoOrbital, infoCoolFacts, infoDetails, coolFactsSection;
let speedSpan, dayCounter, debugDiv, debugToggleBtn;
let epochLabel;
let frameLabel;
let materials;
let simulationEpochMs = null; // epoch timestamp in ms for date computation

let selectedObject = null;
const originalMaterials = new Map(); // Mesh → Material
const outlineMeshes = new Map(); // Object3D → outline Mesh
// Cache for outline geometries to avoid geometry.clone() on each selection
const outlineGeometryCache = new Map(); // originalGeometry.uuid → BufferGeometry (cached clone)
const OUTLINE_RENDER_ORDER = 2;
const OUTLINE_SCALE_MIN = 1.02;
const OUTLINE_SCALE_MAX = 1.12;
const OUTLINE_THICKNESS_MIN = 0.02;
const OUTLINE_THICKNESS_MAX = 0.18;
const OUTLINE_THICKNESS_FACTOR = 0.05;

/* Collapsible menu refs */
let menuContainer, menuToggleBtn;
let menuToggleHandler = null;

/* Planet labels */
const planetLabels = new Map(); // Object3D → HTML label element
const planetLabelLines = new Map(); // Object3D → SVG line element
const SVG_NS = "http://www.w3.org/2000/svg";
let planetLabelsVisible = true;
let moonLabelsVisible = false;
let planetLabelBtn = null;
let moonLabelBtn = null;
let planetLabelToggleHandler = null;
let moonLabelToggleHandler = null;
let planetLabelLayer = null;

// Cache layout metrics for the info panel to avoid forced reflow each frame
const infoPanelMetrics = {
  panelWidth: 480,
  panelHeight: 400,
  vw: 0,
  vh: 0,
  targetX: 0,
  targetY: 0,
};

// Temp vector for projecting object position to screen
const infoPanelTempVec = new THREE.Vector3();
let infoPanelHideTimeoutId = null;

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
  epochLabel = document.getElementById("epochLabel");
  frameLabel = document.getElementById("frameLabel");
  setFrameLabel("--");

  materials = CONSTANTS.createMaterials();

  createDebugOverlay();
  initMenuToggle();
  initLabels();
  setupLabelToggles();
}

export function setEpochLabel(text) {
  if (!epochLabel) return;
  epochLabel.textContent = text || "--";
}

export function setFrameLabel(text) {
  if (!frameLabel) return;
  frameLabel.textContent = text || "--";
}

export function setEpochDate(isoDateUtc) {
  if (!isoDateUtc) return;
  const ms = Date.parse(isoDateUtc);
  if (Number.isFinite(ms)) simulationEpochMs = ms;
}

function clearElement(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function appendInfoRow(container, label, value) {
  if (!container) return;
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  const span = document.createElement("span");
  span.textContent = value ?? "--";
  p.appendChild(strong);
  p.appendChild(document.createTextNode(" "));
  p.appendChild(span);
  container.appendChild(p);
}

function renderInfoSection(container, rows) {
  clearElement(container);
  rows.forEach(({ label, value }) => appendInfoRow(container, label, value));
}

function populateParagraphList(container, items) {
  clearElement(container);
  items.forEach((text) => {
    const p = document.createElement("p");
    p.textContent = text;
    container.appendChild(p);
  });
}

function getMeshRadius(mesh) {
  const geom = mesh?.geometry;
  if (geom?.parameters?.radius) return geom.parameters.radius;
  if (geom && !geom.boundingSphere && typeof geom.computeBoundingSphere === "function") {
    geom.computeBoundingSphere();
  }
  if (geom?.boundingSphere?.radius) return geom.boundingSphere.radius;
  if (Number.isFinite(mesh?.userData?.displayRadius)) return mesh.userData.displayRadius;
  return 1;
}

function getOutlineBaseScale(mesh) {
  const radius = Math.max(0.05, getMeshRadius(mesh));
  const thickness = THREE.MathUtils.clamp(
    radius * OUTLINE_THICKNESS_FACTOR,
    OUTLINE_THICKNESS_MIN,
    OUTLINE_THICKNESS_MAX
  );
  const scale = 1 + thickness / radius;
  return THREE.MathUtils.clamp(scale, OUTLINE_SCALE_MIN, OUTLINE_SCALE_MAX);
}

/* ---------------------------------------------------------------------- */
/*                         Planet Labels                                  */
/* ---------------------------------------------------------------------- */
function initLabels() {
  if (planetLabelLayer?.parentElement) {
    planetLabelLayer.parentElement.removeChild(planetLabelLayer);
  }

  planetLabelLayer = document.createElementNS(SVG_NS, "svg");
  planetLabelLayer.classList.add("planet-label-layer");
  planetLabelLayer.setAttribute("aria-hidden", "true");
  planetLabelLayer.setAttribute("focusable", "false");
  planetLabelLayer.setAttribute("width", "100%");
  planetLabelLayer.setAttribute("height", "100%");
  document.body.appendChild(planetLabelLayer);
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
    const addLine = (label, value) => {
      if (value === undefined || value === null || value === "") return;
      const p = document.createElement("p");
      p.textContent = `${label}: ${value}`;
      extendedInfo.appendChild(p);
    };
    if (config.info.massEarths !== undefined) addLine("Mass", `${config.info.massEarths} Earths`);
    if (config.info.orbitalPeriod !== undefined)
      addLine("Orbit", `${config.info.orbitalPeriod} days`);
    if (config.info.composition) addLine("Type", config.info.composition.split(" ")[0]);
  }

  label.appendChild(extendedInfo);

  const connectorLine = document.createElementNS(SVG_NS, "line");
  connectorLine.classList.add("planet-label-line");
  planetLabelLayer?.appendChild(connectorLine);
  planetLabelLines.set(celestialBody, connectorLine);

  // Add click handler for camera following
  label.addEventListener("click", (e) => {
    e.stopPropagation();
    selectObject(celestialBody);
    // Start following the clicked object
    setSelectedObjectState(celestialBody);
    updateFollowTarget(celestialBody);
  });

  // Attach label to DOM
  document.body.appendChild(label);

  planetLabels.set(celestialBody, label);

  return label;
}

export function updateLabelsVisibility() {
  planetLabels.forEach((label, body) => {
    const isMoon = body.userData?.type === "moon";
    const shouldShow = isMoon ? moonLabelsVisible : planetLabelsVisible;
    const line = planetLabelLines.get(body);
    label.style.display = shouldShow ? "block" : "none";
    if (line) {
      line.style.display = shouldShow ? "block" : "none";
    }
  });
}

function hideLabelConnector(body) {
  const line = planetLabelLines.get(body);
  if (line) line.style.display = "none";
}

function updateLabelConnector(body, screenX, screenY, labelX, labelY) {
  const line = planetLabelLines.get(body);
  if (!line) return;

  const yOffset = body.userData?.type === "moon" ? 10 : 12;
  line.setAttribute("x1", screenX.toFixed(1));
  line.setAttribute("y1", screenY.toFixed(1));
  line.setAttribute("x2", (labelX - 10).toFixed(1));
  line.setAttribute("y2", (labelY + yOffset).toFixed(1));
  line.style.display = "block";
  line.style.opacity = body === selectedObject ? "0.78" : "0.42";
}

/* ---------------------------------------------------------------------- */
/*                 Label bootstrap (create once at init)                  */
/* ---------------------------------------------------------------------- */
export function buildInitialLabels(celestialBodies) {
  if (!Array.isArray(celestialBodies)) return;
  celestialBodies.forEach((body) => {
    if (!body?.userData?.name) return;
    if (!planetLabels.has(body)) {
      createPlanetLabel(body);
    }
  });
  updateLabelsVisibility();
}

/* ---------------------------------------------------------------------- */
/*                      Per-frame label positioning                       */
/* ---------------------------------------------------------------------- */
const labelTempVector = new THREE.Vector3();
const occlusionCameraPos = new THREE.Vector3();
const occlusionTargetPos = new THREE.Vector3();
const occlusionDirection = new THREE.Vector3();
const occlusionOtherPos = new THREE.Vector3();
const occlusionToOther = new THREE.Vector3();
const occlusionScale = new THREE.Vector3();

function getOcclusionMesh(body) {
  if (!body) return null;
  const mesh = body.userData?.planetMesh;
  if (mesh?.isMesh) return mesh;
  if (body.isMesh) return body;
  return null;
}

function getWorldRadius(mesh) {
  const r = mesh?.geometry?.parameters?.radius;
  if (!Number.isFinite(r)) return null;
  mesh.getWorldScale(occlusionScale);
  const s = Math.max(
    Math.abs(occlusionScale.x || 0),
    Math.abs(occlusionScale.y || 0),
    Math.abs(occlusionScale.z || 0)
  );
  return r * (Number.isFinite(s) && s > 0 ? s : 1);
}

function isBodyOccluded(targetBody, targetPos, camera, bodies) {
  if (!targetBody || !targetPos || !camera || !Array.isArray(bodies)) return false;

  camera.getWorldPosition(occlusionCameraPos);

  const targetMesh = getOcclusionMesh(targetBody);
  const targetRadius = targetMesh ? getWorldRadius(targetMesh) : null;
  const targetRadiusPad = Number.isFinite(targetRadius) && targetRadius > 0 ? targetRadius : 0;

  occlusionDirection.subVectors(targetPos, occlusionCameraPos);
  const targetDistance = occlusionDirection.length();
  if (!Number.isFinite(targetDistance) || targetDistance <= 0) return false;
  occlusionDirection.multiplyScalar(1 / targetDistance);

  const targetType = targetBody.userData?.type;
  for (const other of bodies) {
    if (!other || other === targetBody) continue;
    const otherType = other.userData?.type;
    if (otherType !== "star" && otherType !== "planet" && otherType !== "moon") continue;
    if (targetType === "planet" && otherType === "moon") continue;

    const occluderMesh = getOcclusionMesh(other);
    if (!occluderMesh) continue;
    const radius = getWorldRadius(occluderMesh);
    if (!Number.isFinite(radius) || radius <= 0) continue;

    other.getWorldPosition(occlusionOtherPos);
    occlusionToOther.subVectors(occlusionOtherPos, occlusionCameraPos);
    const t = occlusionToOther.dot(occlusionDirection);
    if (t <= 0 || t >= targetDistance) continue;
    const d2 = occlusionToOther.lengthSq() - t * t;
    const effectiveRadius = radius + targetRadiusPad;
    if (d2 <= effectiveRadius * effectiveRadius) return true;
  }

  return false;
}

function getLabelPriority(body) {
  if (!body) return 0;
  if (body === selectedObject) return 100;
  const type = body.userData?.type;
  if (type === "star") return 90;
  if (type === "planet") return 70;
  if (type === "moon") return 50;
  return 10;
}

function getLabelMinSpacingPx(type) {
  if (type === "star") return 60;
  if (type === "moon") return 28;
  return 44;
}

function labelWouldOverlap(placed, x, y, spacing) {
  for (let i = 0; i < placed.length; i += 1) {
    const other = placed[i];
    const minDistance = (spacing + other.spacing) * 0.5;
    const dx = x - other.x;
    const dy = y - other.y;
    if (dx * dx + dy * dy < minDistance * minDistance) return true;
  }
  return false;
}

export function updatePlanetLabels(camera, celestialBodies) {
  if (!camera || !Array.isArray(celestialBodies)) return;

  const { width, height } = getViewportSize();
  const placedLabels = [];
  const bodies = [...celestialBodies].sort((a, b) => getLabelPriority(b) - getLabelPriority(a));

  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    if (!body?.userData?.name) continue;
    const label = planetLabels.get(body);
    if (!label) continue;

    const isMoon = body.userData?.type === "moon";
    const visible = isMoon ? moonLabelsVisible : planetLabelsVisible;
    if (!visible) {
      label.style.display = "none";
      hideLabelConnector(body);
      continue;
    }

    body.getWorldPosition(occlusionTargetPos);
    labelTempVector.copy(occlusionTargetPos);
    labelTempVector.project(camera);

    if (labelTempVector.z > 1) {
      label.style.display = "none";
      hideLabelConnector(body);
      continue;
    }

    if (
      body.userData?.type === "planet" &&
      isBodyOccluded(body, occlusionTargetPos, camera, celestialBodies)
    ) {
      label.style.display = "none";
      hideLabelConnector(body);
      continue;
    }

    const x = (labelTempVector.x * 0.5 + 0.5) * width;
    const y = (labelTempVector.y * -0.5 + 0.5) * height;

    const offset = 20;
    const labelX = x + offset;
    const labelY = y - offset;
    const spacing = getLabelMinSpacingPx(body.userData?.type);
    const forceVisible = body === selectedObject || body.userData?.type === "star";
    if (!forceVisible && labelWouldOverlap(placedLabels, labelX, labelY, spacing)) {
      label.style.display = "none";
      hideLabelConnector(body);
      continue;
    }

    placedLabels.push({ x: labelX, y: labelY, spacing });
    label.style.left = `${labelX}px`;
    label.style.top = `${labelY}px`;
    label.style.display = "block";
    label.style.opacity = 1;
    updateLabelConnector(body, x, y, labelX, labelY);
  }
}

/* ---------------------------------------------------------------------- */
/*                       Info panel follow (per-frame)                    */
/* ---------------------------------------------------------------------- */
export function updateInfoFollow(camera) {
  const refs = getUIReferences();
  const obj = refs.selectedObject;
  const panel = refs.infoPanel;
  if (!obj || !panel || panel.style.display === "none") return;

  const { width, height } = getViewportSize();
  if (width <= 768) {
    panel.style.left = "";
    panel.style.top = "";
    return;
  }

  // Only re-sample expensive measurements when viewport changes
  if (width !== infoPanelMetrics.vw || height !== infoPanelMetrics.vh) {
    const cs = getComputedStyleSafe(panel);
    infoPanelMetrics.panelWidth = parseFloat(cs.width) || infoPanelMetrics.panelWidth;
    infoPanelMetrics.panelHeight = parseFloat(cs.height) || infoPanelMetrics.panelHeight;
    infoPanelMetrics.vw = width;
    infoPanelMetrics.vh = height;
  }

  const panelWidth = infoPanelMetrics.panelWidth;
  const panelHeight = infoPanelMetrics.panelHeight;

  // Project object position to screen coordinates
  obj.getWorldPosition(infoPanelTempVec);
  infoPanelTempVec.project(camera);

  const objScreenX = (infoPanelTempVec.x * 0.5 + 0.5) * width;
  const objScreenY = (infoPanelTempVec.y * -0.5 + 0.5) * height;

  // Calculate offset from the object (to the right of it)
  const offsetFromObject = 80; // pixels from object center
  const menuWidth = 280; // approximate width of the left menu
  const padding = 24;

  let finalX, finalY;

  // Determine if panel should go to the right or left of the object
  const spaceOnRight = width - objScreenX - offsetFromObject;
  const spaceOnLeft = objScreenX - offsetFromObject - menuWidth;

  if (spaceOnRight >= panelWidth + padding) {
    // Place to the right of the object
    finalX = objScreenX + offsetFromObject;
  } else if (spaceOnLeft >= panelWidth + padding) {
    // Place to the left of the object
    finalX = objScreenX - offsetFromObject - panelWidth;
  } else {
    // Fallback: place on the right edge with minimum padding
    finalX = width - panelWidth - padding;
  }

  // Vertical: align with object but keep within bounds
  finalY = objScreenY - panelHeight / 2;

  // Ensure panel stays within viewport bounds
  finalX = Math.max(menuWidth + padding, Math.min(finalX, width - panelWidth - padding));
  finalY = Math.max(padding, Math.min(finalY, height - panelHeight - padding));

  // Smooth lerp for responsive positioning
  const currentX = parseFloat(panel.style.left) || finalX;
  const currentY = parseFloat(panel.style.top) || finalY;
  const lerp = 0.12;
  panel.style.left = currentX + (finalX - currentX) * lerp + "px";
  panel.style.top = currentY + (finalY - currentY) * lerp + "px";
}

/* ---------------------------------------------------------------------- */
/*                         Collapsible menu                               */
/* ---------------------------------------------------------------------- */
function initMenuToggle() {
  menuContainer = document.getElementById("menuContainer");
  menuToggleBtn = document.getElementById("menuToggle");

  if (!menuContainer || !menuToggleBtn) {
    logError("UI", "Menu elements not found!");
    return;
  }

  // Helper to compute collapsed translateX from actual menu width
  const getCollapsedX = () => {
    if (!menuContainer) return "-246px"; // fallback
    const w = menuContainer.getBoundingClientRect().width || menuContainer.offsetWidth || 246;
    return `-${Math.ceil(w)}px`;
  };

  // Initial state from localStorage (guarded for privacy-restricted contexts)
  let initiallyCollapsed = false;
  try {
    initiallyCollapsed = localStorage.getItem("menuCollapsed") === "true";
  } catch {}
  if (initiallyCollapsed) {
    menuContainer.classList.add("collapsed");
    // Set initial position without animation using measured width
    menuContainer.style.transform = `translateX(${getCollapsedX()})`;
  } else {
    menuContainer.style.transform = "translateX(0px)";
  }

  // Click listener (remove old handler if re-init)
  if (menuToggleHandler) {
    menuToggleBtn.removeEventListener("click", menuToggleHandler);
  }
  menuToggleHandler = () => {
    if (!menuContainer) return;

    const isCurrentlyCollapsed = menuContainer.classList.contains("collapsed");
    const targetTranslateX = isCurrentlyCollapsed ? "0px" : getCollapsedX();

    if (typeof anime !== "undefined") {
      anime.remove(menuContainer); // Stop previous animation
    }
    anime({
      targets: menuContainer,
      translateX: targetTranslateX,
      duration: 60,
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
        // Save state after animation completes (guarded)
        try {
          localStorage.setItem("menuCollapsed", !isCurrentlyCollapsed);
        } catch {}
      },
    });
  };
  menuToggleBtn.addEventListener("click", menuToggleHandler);
}

function setupLabelToggles() {
  planetLabelBtn = document.getElementById("togglePlanetLabelsBtn");
  moonLabelBtn = document.getElementById("toggleMoonLabelsBtn");
  if (!planetLabelBtn || !moonLabelBtn) return;

  if (planetLabelToggleHandler) {
    planetLabelBtn.removeEventListener("click", planetLabelToggleHandler);
  }
  planetLabelToggleHandler = () => {
    planetLabelsVisible = !planetLabelsVisible;
    planetLabelBtn.textContent = planetLabelsVisible ? "Hide Planet Labels" : "Show Planet Labels";
    updateLabelsVisibility();
  };
  planetLabelBtn.addEventListener("click", planetLabelToggleHandler);

  if (moonLabelToggleHandler) {
    moonLabelBtn.removeEventListener("click", moonLabelToggleHandler);
  }
  moonLabelToggleHandler = () => {
    moonLabelsVisible = !moonLabelsVisible;
    moonLabelBtn.textContent = moonLabelsVisible ? "Hide Moon Labels" : "Show Moon Labels";
    updateLabelsVisibility();
  };
  moonLabelBtn.addEventListener("click", moonLabelToggleHandler);

  planetLabelBtn.textContent = planetLabelsVisible ? "Hide Planet Labels" : "Show Planet Labels";
  moonLabelBtn.textContent = moonLabelsVisible ? "Hide Moon Labels" : "Show Moon Labels";
}

/* ---------------------------------------------------------------------- */
/*                        Object info panel                               */
/* ---------------------------------------------------------------------- */
function clearInfoPanelHideTimer() {
  if (infoPanelHideTimeoutId === null) return;
  clearTimeout(infoPanelHideTimeoutId);
  infoPanelHideTimeoutId = null;
}

function scheduleInfoPanelHide() {
  clearInfoPanelHideTimer();
  infoPanelHideTimeoutId = setTimeout(() => {
    infoPanelHideTimeoutId = null;
    if (!infoPanel) return;
    infoPanel.style.display = "none";
    infoPanel.classList.remove("animating-out");
  }, 400);
}

export function displayObjectInfo(obj) {
  if (!infoPanel) return; // Guard against missing element
  clearInfoPanelHideTimer();

  if (!obj?.userData?.config) {
    // Animate out if currently visible
    if (infoPanel.style.display !== "none" && !infoPanel.classList.contains("animating-out")) {
      infoPanel.classList.add("animating-out");
      infoPanel.classList.remove("show");
      scheduleInfoPanelHide();
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
    const actualRadius = Number.isFinite(cfg.actualRadius)
      ? cfg.actualRadius
      : Number.isFinite(cfg.actualRadiusEarthRadii)
        ? cfg.actualRadiusEarthRadii
        : null;
    infoSize.textContent = Number.isFinite(actualRadius)
      ? `${actualRadius.toFixed(2)}× Earth`
      : "—";
    infoBodyType.textContent = "Planet";

    populatePlanetInfo(cfg);
  } else if (ud.type === "moon") {
    const orbitKm = Number(cfg.orbitRadiusKm);
    const moonR = Number.isFinite(cfg.actualRadius)
      ? cfg.actualRadius
      : Number.isFinite(cfg.actualRadiusEarthRadii)
        ? cfg.actualRadiusEarthRadii
        : null;
    infoDistance.textContent = Number.isFinite(orbitKm)
      ? `${(orbitKm / 1000).toFixed(0)}k km`
      : "—";
    infoSize.textContent = Number.isFinite(moonR)
      ? `${(moonR * CONSTANTS.EARTH_RADIUS_KM).toFixed(0)} km`
      : "—";
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

  // Position panel next to the selected planet (captures layout metrics once)
  positionInfoPanel(obj);

  // Animate in with modern styling
  infoPanel.style.display = "block"; // Make it visible first
  infoPanel.classList.remove("show");
  if (typeof anime !== "undefined") {
    anime.remove(infoPanel); // Remove any existing animations on this element
  }

  // Use CSS transition for smooth animation
  requestAnimationFrame(() => {
    infoPanel.classList.add("show");
    infoPanel.classList.remove("animating-out");
  });
}

/**
 * Position the info panel relative to the selected object on screen
 */
function positionInfoPanel(obj) {
  if (!obj) return;

  const { width, height } = getViewportSize();
  if (width <= 768) {
    infoPanel.style.left = "";
    infoPanel.style.top = "";
    return;
  }

  // Use computed CSS values to avoid hardcoding; provide sensible fallbacks
  const cs = getComputedStyleSafe(infoPanel);
  const panelWidth = parseFloat(cs.width) || 480;
  // max-height is 70vh in CSS; compute a practical height bound
  const maxH = parseFloat(cs.maxHeight) || height * 0.7;
  const panelHeight = Math.min(maxH, Math.max(300, infoPanel.scrollHeight || 400));

  // Cache metrics for use during per-frame follow without measuring again
  infoPanelMetrics.panelWidth = panelWidth;
  infoPanelMetrics.panelHeight = panelHeight;
  infoPanelMetrics.vw = width;
  infoPanelMetrics.vh = height;

  const offsetFromObject = 80;
  const menuWidth = 280;
  const padding = 24;

  // Get camera from app state to project object position
  const camera = getCamera();
  let finalX, finalY;

  if (camera) {
    // Project object position to screen coordinates
    obj.getWorldPosition(infoPanelTempVec);
    infoPanelTempVec.project(camera);

    const objScreenX = (infoPanelTempVec.x * 0.5 + 0.5) * width;
    const objScreenY = (infoPanelTempVec.y * -0.5 + 0.5) * height;

    // Determine if panel should go to the right or left of the object
    const spaceOnRight = width - objScreenX - offsetFromObject;
    const spaceOnLeft = objScreenX - offsetFromObject - menuWidth;

    if (spaceOnRight >= panelWidth + padding) {
      finalX = objScreenX + offsetFromObject;
    } else if (spaceOnLeft >= panelWidth + padding) {
      finalX = objScreenX - offsetFromObject - panelWidth;
    } else {
      finalX = width - panelWidth - padding;
    }

    finalY = objScreenY - panelHeight / 2;
  } else {
    // Fallback: right side positioning
    finalX = width - panelWidth - padding;
    finalY = (height - panelHeight) / 2;
  }

  // Ensure panel stays within viewport bounds
  finalX = Math.max(menuWidth + padding, Math.min(finalX, width - panelWidth - padding));
  finalY = Math.max(padding, Math.min(finalY, height - panelHeight - padding));

  // Apply position
  infoPanel.style.left = finalX + "px";
  infoPanel.style.top = finalY + "px";
}

function populateStarInfo(cfg) {
  const info = cfg?.info || {};
  renderInfoSection(infoPhysical, [
    { label: "Mass", value: info.Mass },
    { label: "Temperature", value: info.Temperature },
    { label: "Composition", value: info.Composition },
    { label: "Type", value: info.Type },
    { label: "Age", value: info.Age },
  ]);

  renderInfoSection(infoOrbital, [
    { label: "Position", value: "Center of Solar System" },
    { label: "Sidereal Rotation", value: info.Rotation },
  ]);

  populateDetailedData(info, { bodyType: "star", config: cfg });
}

function populatePlanetInfo(cfg) {
  const actualR = Number.isFinite(cfg.actualRadius)
    ? cfg.actualRadius
    : Number.isFinite(cfg.actualRadiusEarthRadii)
      ? cfg.actualRadiusEarthRadii
      : null;
  const diameterKm = Number.isFinite(actualR)
    ? (actualR * 2 * CONSTANTS.EARTH_RADIUS_KM).toLocaleString()
    : null;
  const info = cfg?.info || {};

  renderInfoSection(infoPhysical, [
    {
      label: "Radius",
      value: Number.isFinite(actualR) ? `${actualR.toFixed(3)} Earth radii` : "—",
    },
    { label: "Diameter", value: diameterKm ? `${diameterKm} km` : "—" },
    { label: "Mass", value: info.massEarths !== undefined ? `${info.massEarths}× Earth` : "—" },
    { label: "Density", value: info.densityGcm3 !== undefined ? `${info.densityGcm3} g/cm³` : "—" },
    {
      label: "Surface Gravity",
      value: cfg.gravityStrength !== undefined ? `${cfg.gravityStrength}g` : "—",
    },
    {
      label: "Escape Velocity",
      value: info.escapeVelocityKms !== undefined ? `${info.escapeVelocityKms} km/s` : "—",
    },
  ]);

  renderInfoSection(infoOrbital, [
    { label: "Distance from Sun", value: `${cfg.orbitRadiusAU} AU` },
    {
      label: "Sidereal Orbital Period",
      value: info.orbitalPeriod !== undefined ? `${info.orbitalPeriod} days` : "—",
    },
    {
      label: "Orbital Speed",
      value: info.meanOrbitalSpeedKms !== undefined ? `${info.meanOrbitalSpeedKms} km/s` : "—",
    },
    { label: "Orbital Eccentricity", value: info.orbitalEccentricity },
    { label: "Axial Tilt", value: cfg.axialTilt !== undefined ? `${cfg.axialTilt}°` : "—" },
    {
      label: "Sidereal Rotation Period",
      value: cfg.rotationPeriod !== undefined ? `${cfg.rotationPeriod} days` : "—",
    },
  ]);

  populateDetailedData(info, { bodyType: "planet", config: cfg });
}

function populateMoonInfo(ud) {
  const cfg = ud.config;
  const displayInfo = ud.displayInfo;

  renderInfoSection(infoPhysical, [
    { label: "Size", value: displayInfo?.Size },
    { label: "Parent Planet", value: displayInfo?.ParentPlanet },
    { label: "Composition", value: cfg?.composition || "Rocky body" },
  ]);

  renderInfoSection(infoOrbital, [
    { label: "Distance", value: displayInfo?.Orbit },
    { label: "Sidereal Orbital Period", value: displayInfo?.OrbitalPeriod },
    { label: "Sidereal Rotation Period", value: displayInfo?.RotationPeriod },
  ]);

  populateDetailedData(displayInfo, { bodyType: "moon", config: cfg });
}

function populateCoolFacts(coolFacts) {
  populateParagraphList(infoCoolFacts, coolFacts);
}

function populateDetailedData(dataObj, context = null) {
  clearElement(infoDetails);
  if (!dataObj || typeof dataObj !== "object") return;
  Object.entries(dataObj).forEach(([k, v]) => {
    // Skip keys that are already shown in other sections
    if (
      [
        "Mass",
        "Temperature",
        "Composition",
        "Type",
        "Age",
        "Rotation",
        "massEarths",
        "densityGcm3",
        "escapeVelocityKms",
        "orbitalPeriod",
        "meanOrbitalSpeedKms",
        "orbitalEccentricity",
        "Size",
        "ParentPlanet",
        "Orbit",
        "OrbitalPeriod",
        "RotationPeriod",
      ].includes(k)
    ) {
      return;
    }

    if (k === "moonCount" && context?.bodyType === "planet") {
      const modeledMoonCount = Array.isArray(context?.config?.moons) ? context.config.moons.length : null;
      appendInfoRow(infoDetails, "Known Moons", v);
      if (Number.isFinite(modeledMoonCount) && modeledMoonCount !== v) {
        appendInfoRow(infoDetails, "Modeled Moons (This Sim)", modeledMoonCount);
      }
      return;
    }

    appendInfoRow(infoDetails, k, v);
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
  setSelectedObjectState(obj);
  if (follow) {
    updateFollowTarget(obj);
  }

  // Limit outlines to prevent memory buildup
  limitOutlines();

  // Create outline for the main mesh (planet or sun)
  const mesh = obj.userData.planetMesh ?? obj;
  if (mesh && mesh.isMesh) {
    // Reuse a cached outline geometry clone per source geometry
    let outlineGeom = null;
    const srcGeom = mesh.geometry;
    const key = srcGeom?.uuid;
    if (key && outlineGeometryCache.has(key)) {
      outlineGeom = outlineGeometryCache.get(key);
    } else {
      outlineGeom = srcGeom?.clone();
      if (outlineGeom && key) {
        outlineGeom.userData = { ...(outlineGeom.userData || {}), outlineCached: true };
        outlineGeometryCache.set(key, outlineGeom);
      }
    }

    // Create a smooth silhouette outline by rendering the backfaces of a slightly
    // scaled clone so only the rim shows through the original mesh.
    const outlineMat = new THREE.MeshBasicMaterial({
      color: CONSTANTS.SELECTED_HIGHLIGHT_COLOR,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.BackSide,
    });

    const outline = new THREE.Mesh(outlineGeom, outlineMat);
    const baseScale = getOutlineBaseScale(mesh);
    outline.userData.baseScale = baseScale;
    outline.renderOrder = OUTLINE_RENDER_ORDER;
    outline.raycast = () => {};
    outline.scale.setScalar(baseScale);
    outline.position.set(0, 0, 0);
    outline.rotation.set(0, 0, 0);

    // Attach outline to the mesh so it inherits transforms automatically
    mesh.add(outline);
    outlineMeshes.set(obj, outline);

    // Single flash effect
    logDebug("UI", `Added outline to ${obj.userData.name}`);
  }

  displayObjectInfo(obj);
  return { cameraTarget: follow ? obj : null };
}

export function deselectObject() {
  if (!selectedObject) return;

  // Remove outline with proper cleanup
  const outline = outlineMeshes.get(selectedObject);
  if (outline) {
    if (typeof anime !== "undefined") {
      if (outline.scale) anime.remove(outline.scale);
    }
    if (outline.parent) {
      outline.parent.remove(outline);
    }

    // Properly dispose of resources
    if (outline.geometry && !outline.geometry.userData?.outlineCached) {
      outline.geometry.dispose();
    }
    if (outline.material) {
      if (outline.material.map) outline.material.map.dispose();
      outline.material.dispose();
    }

    outlineMeshes.delete(selectedObject);
    logDebug("UI", `Removed outline from ${selectedObject.userData.name}`);
  }

  // Restore original material if changed
  const mesh = selectedObject.userData.planetMesh ?? selectedObject;
  if (mesh && mesh.isMesh && originalMaterials.has(mesh)) {
    mesh.material = originalMaterials.get(mesh);
    originalMaterials.delete(mesh);
  }

  displayObjectInfo(null);
  selectedObject = null;
  setSelectedObjectState(null);
  stopCameraFollow();
}

/* ---------------------------------------------------------------------- */
/*                      Debug overlay & helpers                           */
/* ---------------------------------------------------------------------- */
export function createDebugOverlay() {
  debugDiv = null;
  debugToggleBtn = null;
}

export function dumpUIStats() {
  try {
    const outlines = outlineMeshes.size;
    const labels = planetLabels.size;
    logDebug("UI", `Stats outlines=${outlines}, labels=${labels}`);
    updateDebugInfo(`UI Stats — outlines: ${outlines}, labels: ${labels}`);
  } catch (e) {
    logWarn("UI", "dumpUIStats failed", e);
  }
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
  if (!dayCounter) return;
  if (simulationEpochMs !== null) {
    const simMs = simulationEpochMs + days * 86400000;
    const d = new Date(simMs);
    const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    dayCounter.textContent = `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}`;
  } else {
    dayCounter.textContent = `Day ${Math.floor(days)}`;
  }
}

export function updateUIDisplay(simSpeed) {
  if (speedSpan) speedSpan.textContent = `${simSpeed.toFixed(1)}x`;

  const currentSelected = getUIReferences().selectedObject; // Get current selection state

  // Stop animations for outlines that are no longer selected or have been removed
  outlineMeshes.forEach((outline, obj) => {
    if (obj !== currentSelected && outline?.userData?.isAnimating) {
      if (typeof anime !== "undefined") anime.remove(outline.scale);
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
      const baseScale = outline.userData.baseScale ?? CONSTANTS.OUTLINE_SCALE;
      anime({
        targets: outline.scale,
        x: [baseScale * 0.98, baseScale * 1.02],
        y: [baseScale * 0.98, baseScale * 1.02],
        z: [baseScale * 0.98, baseScale * 1.02],
        duration: 1000,
        easing: "easeInOutSine",
        direction: "alternate",
        loop: true,
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
      logWarn("UI", "Invalid outline or object found, cleaning up...");
      if (typeof anime !== "undefined") {
        if (outline?.scale) anime.remove(outline.scale);
      }
      outlineMeshes.delete(obj);
      return;
    }

    // Get the main mesh (planet or moon)
    const mesh = obj.userData.planetMesh ?? obj;
    if (!mesh || !mesh.isMesh) {
      logWarn("UI", `Invalid mesh for ${obj.userData?.name}, cleaning up outline...`);
      if (typeof anime !== "undefined") {
        if (outline?.scale) anime.remove(outline.scale);
      }
      if (outline.parent) outline.parent.remove(outline);
      if (outline.geometry) outline.geometry.dispose();
      if (outline.material) outline.material.dispose();
      outlineMeshes.delete(obj);
      return;
    }

    if (outline.parent !== mesh) {
      if (outline.parent) outline.parent.remove(outline);
      mesh.add(outline);
    }

    const baseScale = getOutlineBaseScale(mesh);
    outline.userData.baseScale = baseScale;
    if (!outline.userData.isAnimating) {
      outline.scale.setScalar(baseScale);
    }
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
    epochLabel,
    frameLabel,
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
  clearInfoPanelHideTimer();

  if (menuToggleBtn && menuToggleHandler) {
    menuToggleBtn.removeEventListener("click", menuToggleHandler);
  }
  menuToggleHandler = null;
  menuToggleBtn = null;
  menuContainer = null;

  if (planetLabelBtn && planetLabelToggleHandler) {
    planetLabelBtn.removeEventListener("click", planetLabelToggleHandler);
  }
  if (moonLabelBtn && moonLabelToggleHandler) {
    moonLabelBtn.removeEventListener("click", moonLabelToggleHandler);
  }
  planetLabelToggleHandler = null;
  moonLabelToggleHandler = null;
  planetLabelBtn = null;
  moonLabelBtn = null;

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

  if (planetLabelLayer?.parentElement) {
    planetLabelLayer.parentElement.removeChild(planetLabelLayer);
  }
  planetLabelLayer = null;

  if (debugDiv?.parentElement) {
    debugDiv.parentElement.removeChild(debugDiv);
  }
  debugDiv = null;

  if (debugToggleBtn?.parentElement) {
    debugToggleBtn.parentElement.removeChild(debugToggleBtn);
  }
  debugToggleBtn = null;
  frameLabel = null;

  // Reset selected object
  selectedObject = null;
  setSelectedObjectState(null);

  logInfo("UI", "resources cleaned up");
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
