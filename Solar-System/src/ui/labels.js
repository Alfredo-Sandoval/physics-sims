import * as THREE from "three";
import { getSelectedObject } from "../core/state.js";
import { getViewportSize } from "../core/viewport.js";
import { formatMeasurement } from "./dom.js";

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
let selectBody;

export function initLabels(onSelect) {
  selectBody = onSelect;
  setupLabelToggles();
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
    selectBody(celestialBody);
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
  line.style.opacity = body === getSelectedObject() ? "0.78" : "0.42";
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
  if (body === getSelectedObject()) return 100;
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
    const forceVisible = body === getSelectedObject() || body.userData?.type === "star";
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

export function cleanupLabels() {
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
  selectBody = null;
}
