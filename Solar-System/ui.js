// File: Solar-System/ui.js
// --- UI Module ---------------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";
import {
  updateFollowTarget,
  stopCameraFollow,
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
import { hasAnime, runAnime, stopAnime } from "./animationLibrary.js";

/* ---------------------------------------------------------------------- */
/*                        DOM element refs                                */
/* ---------------------------------------------------------------------- */
let infoPanel, infoTitle, infoTypeBadge, infoDistance, infoSize, infoBodyType;
let infoPhysical, infoOrbital, infoCoolFacts, infoDetails, coolFactsSection;
let speedSpan, speedRate, dayCounter, debugDiv, debugToggleBtn;
let epochLabel;
let frameLabel;
let propagationMode;
let ephemerisSource;
let ephemerisRange;
let materials;
let lastDisplayedDay = null;
let lastDisplayedSpeed = null;
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
let simulationEpochMs = null; // epoch timestamp in ms for date computation
let ephemerisMinJD = null;
let ephemerisMaxJD = null;

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

const currentDistanceTempVec = new THREE.Vector3();
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
  speedRate = document.getElementById("speedRate");
  dayCounter = document.getElementById("dayCounter");
  epochLabel = document.getElementById("epochLabel");
  frameLabel = document.getElementById("frameLabel");
  propagationMode = document.getElementById("propagationMode");
  ephemerisSource = document.getElementById("ephemerisSource");
  ephemerisRange = document.getElementById("ephemerisRange");
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
  if (Number.isFinite(ms)) { simulationEpochMs = ms; lastDisplayedDay = null; }
}

function julianDayToUtcDate(jd) {
  if (!Number.isFinite(jd)) return null;
  const date = new Date((jd - 2440587.5) * 86400000);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatMonthYearUtc(jd) {
  const date = julianDayToUtcDate(jd);
  if (!date) return null;
  return date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function setEphemerisMetadata({ source, minJD, maxJD } = {}) {
  ephemerisMinJD = Number.isFinite(minJD) ? minJD : null;
  ephemerisMaxJD = Number.isFinite(maxJD) ? maxJD : null;

  if (ephemerisSource) {
    ephemerisSource.textContent = source || CONSTANTS.EPHEMERIS_SOURCE_NAME;
  }
  if (ephemerisRange) {
    const start = formatMonthYearUtc(ephemerisMinJD);
    const end = formatMonthYearUtc(ephemerisMaxJD);
    ephemerisRange.textContent = start && end ? `valid ${start}–${end}` : "valid range unavailable";
  }
}

function updatePropagationMode(days) {
  if (!propagationMode || simulationEpochMs === null || !Number.isFinite(days)) return;
  const simulationJD = simulationEpochMs / 86400000 + 2440587.5 + days;
  const usingEphemeris =
    Number.isFinite(ephemerisMinJD) &&
    Number.isFinite(ephemerisMaxJD) &&
    simulationJD >= ephemerisMinJD &&
    simulationJD <= ephemerisMaxJD;
  propagationMode.textContent = usingEphemeris
    ? "Horizons ephemeris"
    : "Kepler approximation";
  propagationMode.dataset.mode = usingEphemeris ? "ephemeris" : "kepler";
}

function clearElement(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function appendInfoRow(container, label, value, valueId = null) {
  if (!container) return;
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  const span = document.createElement("span");
  span.textContent = value ?? "--";
  if (valueId) span.id = valueId;
  p.appendChild(strong);
  p.appendChild(document.createTextNode(" "));
  p.appendChild(span);
  container.appendChild(p);
}

function renderInfoSection(container, rows) {
  clearElement(container);
  rows.forEach(({ label, value, valueId }) => appendInfoRow(container, label, value, valueId));
}

function formatFiniteNumber(value, maximumFractionDigits = 2, minimumFractionDigits = 0) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return numeric.toLocaleString("en-US", { maximumFractionDigits, minimumFractionDigits });
}

function formatAstronomicalUnits(value) {
  const text = formatFiniteNumber(value, 4, 4);
  return text === "—" ? text : `${text} AU`;
}

function getCurrentHeliocentricDistanceAU(obj) {
  if (!obj || obj.userData?.type !== "planet") return null;
  obj.getWorldPosition(currentDistanceTempVec);
  const distance = currentDistanceTempVec.length() / CONSTANTS.ORBIT_SCALE_FACTOR;
  return Number.isFinite(distance) ? distance : null;
}

function updatePlanetDistanceReadout(obj) {
  if (obj?.userData?.type !== "planet") return;
  const distanceText = formatAstronomicalUnits(getCurrentHeliocentricDistanceAU(obj));
  if (infoDistance && infoDistance.textContent !== distanceText) infoDistance.textContent = distanceText;
  const row = document.getElementById("info-current-distance");
  if (row && row.textContent !== distanceText) row.textContent = distanceText;
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

  const label = document.createElement("button");
  label.type = "button";
  label.className = "planet-label";
  label.dataset.planet = celestialBody.userData.name;
  label.setAttribute("aria-label", `Focus ${celestialBody.userData.name}`);

  const labelText = document.createElement("span");
  labelText.textContent = celestialBody.userData.name;
  label.appendChild(labelText);

  // Add appropriate class based on object type
  if (celestialBody.userData.type === "star") {
    label.classList.add("sun");
  } else if (celestialBody.userData.type === "moon") {
    label.classList.add("moon");
  }

  // Create extended info panel
  const extendedInfo = document.createElement("span");
  extendedInfo.className = "planet-label-extended";
  extendedInfo.setAttribute("aria-hidden", "true");

  // Add basic info to extended panel
  const config = celestialBody.userData.config;
  if (config?.info) {
    let hasLine = false;
    const addLine = (label, value) => {
      if (value === undefined || value === null || value === "") return;
      if (hasLine) extendedInfo.appendChild(document.createElement("br"));
      extendedInfo.appendChild(document.createTextNode(`${label}: ${value}`));
      hasLine = true;
    };
    if (config.info.massEarths !== undefined) addLine("Mass", formatMeasurement(config.info.massEarths, "× Earth", 3));
    if (config.info.orbitalPeriod !== undefined)
      addLine("Orbit", formatMeasurement(config.info.orbitalPeriod, "days"));
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
const occluderBounds = new Map();
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

  for (const [other, bound] of occluderBounds) {
    if (other === targetBody) continue;
    const radius = bound.radius;
    if (!Number.isFinite(radius) || radius <= 0) continue;
    occlusionToOther.subVectors(bound.position, occlusionCameraPos);
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
  if (!planetLabelsVisible && !moonLabelsVisible) return;
  for (const body of celestialBodies) {
    if (body.userData?.type !== "planet" && body.userData?.type !== "star") continue;
    let bound = occluderBounds.get(body);
    if (!bound) {
      bound = { position: new THREE.Vector3(), radius: 0 };
      occluderBounds.set(body, bound);
    }
    body.getWorldPosition(bound.position);
    bound.radius = getWorldRadius(getOcclusionMesh(body));
  }
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

    if (labelTempVector.z > 1 || labelTempVector.z < -1 || Math.abs(labelTempVector.x) > 1 || Math.abs(labelTempVector.y) > 1) {
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
    label.style.translate = `${labelX.toFixed(1)}px ${labelY.toFixed(1)}px`;
    label.style.display = "block";
    label.style.opacity = 1;
    updateLabelConnector(body, x, y, labelX, labelY);
  }
}

/* ---------------------------------------------------------------------- */
/*                       Info panel follow (per-frame)                    */
/* ---------------------------------------------------------------------- */
export function updateInfoFollow() {
  if (selectedObject && infoPanel?.style.display !== "none") {
    updatePlanetDistanceReadout(selectedObject);
  }
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

  const syncMenuToggleState = (collapsed) => {
    menuToggleBtn.setAttribute("aria-expanded", String(!collapsed));
    menuToggleBtn.setAttribute("aria-label", collapsed ? "Open controls" : "Close controls");
  };

  const applyMenuState = (collapsed, persist = true) => {
    menuContainer.classList.toggle("collapsed", collapsed);
    menuContainer.style.transform = collapsed ? `translateX(${getCollapsedX()})` : "translateX(0px)";
    syncMenuToggleState(collapsed);
    if (persist) {
      try {
        localStorage.setItem("menuCollapsed", String(collapsed));
      } catch {}
    }
  };

  // Initial state from localStorage (guarded for privacy-restricted contexts)
  let initiallyCollapsed = false;
  try {
    initiallyCollapsed = localStorage.getItem("menuCollapsed") === "true";
  } catch {}
  applyMenuState(initiallyCollapsed, false);

  // Click listener (remove old handler if re-init)
  if (menuToggleHandler) {
    menuToggleBtn.removeEventListener("click", menuToggleHandler);
  }
  menuToggleHandler = () => {
    if (!menuContainer) return;
    const isCurrentlyCollapsed = menuContainer.classList.contains("collapsed");
    applyMenuState(!isCurrentlyCollapsed);
  };
  menuToggleBtn.addEventListener("click", menuToggleHandler);
}

function setupLabelToggles() {
  planetLabelBtn = document.getElementById("togglePlanetLabelsBtn");
  moonLabelBtn = document.getElementById("toggleMoonLabelsBtn");
  if (!planetLabelBtn || !moonLabelBtn) return;

  const syncToggleButtonState = () => {
    planetLabelBtn.textContent = planetLabelsVisible ? "Hide Planet Labels" : "Show Planet Labels";
    planetLabelBtn.setAttribute("aria-pressed", String(planetLabelsVisible));
    moonLabelBtn.textContent = moonLabelsVisible ? "Hide Moon Labels" : "Show Moon Labels";
    moonLabelBtn.setAttribute("aria-pressed", String(moonLabelsVisible));
  };

  if (planetLabelToggleHandler) {
    planetLabelBtn.removeEventListener("click", planetLabelToggleHandler);
  }
  planetLabelToggleHandler = () => {
    planetLabelsVisible = !planetLabelsVisible;
    syncToggleButtonState();
    updateLabelsVisibility();
  };
  planetLabelBtn.addEventListener("click", planetLabelToggleHandler);

  if (moonLabelToggleHandler) {
    moonLabelBtn.removeEventListener("click", moonLabelToggleHandler);
  }
  moonLabelToggleHandler = () => {
    moonLabelsVisible = !moonLabelsVisible;
    syncToggleButtonState();
    updateLabelsVisibility();
  };
  moonLabelBtn.addEventListener("click", moonLabelToggleHandler);

  syncToggleButtonState();
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

  const distanceLabel = document.getElementById("info-distance-label");
  const periodLabel = document.getElementById("info-period-label");
  const radius = cfg.actualRadius ?? cfg.actualRadiusEarthRadii;
  infoSize.textContent = formatMeasurement(
    Number.isFinite(radius) ? radius * CONSTANTS.EARTH_RADIUS_KM : null, "km", 0
  );
  if (ud.type === "star") {
    distanceLabel.textContent = "Reference position";
    infoDistance.textContent = "Sun-centered";
    periodLabel.textContent = "Rotation period";
    infoBodyType.textContent = "25–36 days";
    populateStarInfo(cfg);
  } else if (ud.type === "planet") {
    distanceLabel.textContent = "Current distance from Sun";
    infoDistance.textContent = formatAstronomicalUnits(getCurrentHeliocentricDistanceAU(obj));
    periodLabel.textContent = "Kepler year estimate";
    infoBodyType.textContent = formatMeasurement(cfg.info?.orbitalPeriod, "days");
    populatePlanetInfo(cfg, obj);
  } else if (ud.type === "moon") {
    distanceLabel.textContent = `Orbit size from ${ud.parentPlanetName}`;
    infoDistance.textContent = formatMeasurement(cfg.orbitRadiusKm, "km", 0);
    periodLabel.textContent = "Orbital period";
    infoBodyType.textContent = formatMeasurement(Math.abs(cfg.orbitalPeriod), "days");
    populateMoonInfo(ud);
  }

  const textureNote = document.getElementById("info-texture-note");
  textureNote.hidden = !cfg.textureNote;
  textureNote.textContent = cfg.textureNote ? `Illustrative texture. ${cfg.textureNote}` : "";
  document.getElementById("info-technical").open = false;
  document.getElementById("info-more-facts").open = false;
  const facts = cfg.coolFacts?.length ? cfg.coolFacts : [
    cfg.info?.composition || cfg.info?.Composition || cfg.composition,
  ].filter(Boolean);
  coolFactsSection.style.display = facts.length ? "block" : "none";
  populateParagraphList(infoCoolFacts, facts.slice(0, 1));
  document.getElementById("info-more-facts").hidden = facts.length < 2;
  populateParagraphList(document.getElementById("info-other-facts"), facts.slice(1));

  ensureCloseButton();

  // The shared dock keeps details clear of metadata and tour controls.
  infoPanel.style.display = "block";
  infoPanel.classList.remove("show");
  if (hasAnime()) {
    stopAnime(infoPanel); // Remove any existing animations on this element
  }

  infoPanel.scrollTop = 0;

  // Use CSS transition for smooth animation
  requestAnimationFrame(() => {
    infoPanel.classList.add("show");
    infoPanel.classList.remove("animating-out");
  });
}

function formatMeasurement(value, unit, digits = 2) {
  const text = formatFiniteNumber(value, digits);
  return text === "—" ? text : `${text} ${unit}`;
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

function populatePlanetInfo(cfg, obj) {
  const actualR = Number.isFinite(cfg.actualRadius)
    ? cfg.actualRadius
    : Number.isFinite(cfg.actualRadiusEarthRadii)
      ? cfg.actualRadiusEarthRadii
      : null;
  const diameterKm = Number.isFinite(actualR)
    ? Math.round(actualR * 2 * CONSTANTS.EARTH_RADIUS_KM).toLocaleString()
    : null;
  const info = cfg?.info || {};

  renderInfoSection(infoPhysical, [
    {
      label: "Radius",
      value: Number.isFinite(actualR) ? `${actualR.toFixed(3)} Earth radii` : "—",
    },
    { label: "Diameter", value: diameterKm ? `${diameterKm} km` : "—" },
    { label: "Mass", value: formatMeasurement(info.massEarths, "× Earth", 3) },
    { label: "Density", value: formatMeasurement(info.densityGcm3, "g/cm³", 3) },
    {
      label: "Surface Gravity",
      value: formatMeasurement(cfg.gravityStrength, "g", 3),
    },
    {
      label: "Escape Velocity",
      value: formatMeasurement(info.escapeVelocityKms, "km/s"),
    },
  ]);

  renderInfoSection(infoOrbital, [
    {
      label: "Current Distance from Sun",
      value: formatAstronomicalUnits(getCurrentHeliocentricDistanceAU(obj)),
      valueId: "info-current-distance",
    },
    { label: "Semi-major Axis", value: formatAstronomicalUnits(cfg.orbitRadiusAU) },
    {
      label: "Kepler Period Estimate",
      value:
        info.orbitalPeriod !== undefined
          ? `${formatFiniteNumber(info.orbitalPeriod, 2)} days`
          : "—",
    },
    {
      label: "Mean Orbital Speed",
      value:
        info.meanOrbitalSpeedKms !== undefined
          ? `${formatFiniteNumber(info.meanOrbitalSpeedKms, 2)} km/s`
          : "—",
    },
    {
      label: "Orbital Eccentricity",
      value: formatFiniteNumber(info.orbitalEccentricity, 4),
    },
    {
      label: "Axial Tilt",
      value: cfg.axialTilt !== undefined ? `${formatFiniteNumber(cfg.axialTilt, 2)}°` : "—",
    },
    {
      label: "Sidereal Rotation Period",
      value:
        cfg.rotationPeriod !== undefined
          ? `${formatFiniteNumber(Math.abs(cfg.rotationPeriod), 2)} days${cfg.retrograde ? " (retrograde)" : ""}`
          : "—",
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
    { label: `Semi-major axis from ${ud.parentPlanetName}`, value: formatMeasurement(cfg.orbitRadiusKm, "km", 0) },
    { label: "Sidereal Orbital Period", value: displayInfo?.OrbitalPeriod },
    { label: "Sidereal Rotation Period", value: displayInfo?.RotationPeriod },
  ]);

  populateDetailedData(displayInfo, { bodyType: "moon", config: cfg });
}

function populateDetailedData(dataObj, context = null) {
  const fields = [
    ["composition", "Composition"],
    ["surfaceTempMinC", "Minimum temperature", "°C", 0],
    ["surfaceTempMaxC", "Maximum temperature", "°C", 0],
    ["orbitalInclinationDeg", "Orbital inclination", "°", 3],
    ["ringCount", "Ring groups (dataset)", "", 0],
    ["magnetosphere", "Intrinsic magnetosphere"],
    ["albedoGeometric", "Geometric albedo", "", 3],
  ];
  const rows = [];
  for (const [key, label, unit, digits] of fields) {
    const value = dataObj?.[key];
    if (value === null || value === undefined) continue;
    rows.push({ label, value: typeof value === "boolean" ? (value ? "Yes" : "No")
      : typeof value === "number" ? formatMeasurement(value, unit, digits).trim() : value });
  }
  if (context?.bodyType === "planet" && Number.isFinite(dataObj?.moonCount)) {
    rows.push({ label: "Known moons (dataset)", value: formatFiniteNumber(dataObj.moonCount, 0) });
    rows.push({ label: "Moons shown here", value: context.config.moons.length });
  }
  renderInfoSection(infoDetails, rows);
  document.getElementById("info-additional-section").hidden = rows.length === 0;
}

function ensureCloseButton() {
  if (infoPanel.querySelector(".info-close-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "×";
  btn.className = "info-close-btn";
  btn.setAttribute("aria-label", "Close body details");
  btn.title = "Close";
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
  window.dispatchEvent(new CustomEvent("solar-system:selection-changed", { detail: {
    name: obj.userData.name,
    type: obj.userData.type,
    parentPlanetName: obj.userData.parentPlanetName,
  } }));
  return { cameraTarget: follow ? obj : null };
}

export function deselectObject() {
  if (!selectedObject) return;

  // Remove outline with proper cleanup
  const outline = outlineMeshes.get(selectedObject);
  if (outline) {
    if (hasAnime()) {
      if (outline.scale) stopAnime(outline.scale);
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
  window.dispatchEvent(new CustomEvent("solar-system:selection-changed", { detail: { name: null } }));
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
  const day = Math.floor(days);
  if (!dayCounter || day === lastDisplayedDay) return;
  lastDisplayedDay = day;
  dayCounter.textContent = simulationEpochMs !== null
    ? dateFormatter.format(new Date(simulationEpochMs + day * 86400000))
    : `Day ${day}`;
  updatePropagationMode(days);
}

export function updateUIDisplay(simSpeed) {
  if (simSpeed === lastDisplayedSpeed) return;
  lastDisplayedSpeed = simSpeed;
  if (speedSpan) speedSpan.textContent = `${simSpeed.toFixed(1)}×`;
  if (speedRate) speedRate.textContent = CONSTANTS.formatSimulationRate(simSpeed);
}

/* ---------------------------------------------------------------------- */
/*                      Outline position update                           */
/* ---------------------------------------------------------------------- */
export function updateOutlines() {
  outlineMeshes.forEach((outline, obj) => {
    if (!outline || !obj) {
      logWarn("UI", "Invalid outline or object found, cleaning up...");
      if (hasAnime()) {
        if (outline?.scale) stopAnime(outline.scale);
      }
      outlineMeshes.delete(obj);
      return;
    }

    // Get the main mesh (planet or moon)
    const mesh = obj.userData.planetMesh ?? obj;
    if (!mesh || !mesh.isMesh) {
      logWarn("UI", `Invalid mesh for ${obj.userData?.name}, cleaning up outline...`);
      if (hasAnime()) {
        if (outline?.scale) stopAnime(outline.scale);
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
  occluderBounds.clear();

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
  propagationMode = null;
  ephemerisSource = null;
  ephemerisRange = null;
  speedRate = null;
  ephemerisMinJD = null;
  ephemerisMaxJD = null;
  simulationEpochMs = null;
  lastDisplayedDay = null;
  lastDisplayedSpeed = null;

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
