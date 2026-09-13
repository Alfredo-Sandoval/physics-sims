import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { getSelectedObject, updateFollowTarget, stopCameraFollow, setSelectedObject as setSelectedObjectState } from "../core/state.js";
import { debug as logDebug, warn as logWarn } from "../core/logger.js";
import { hasAnime, stopAnime } from "./animationLibrary.js";
import { initBodyDetails, displayObjectInfo, cleanupBodyDetails } from "./bodyDetails.js";
import { initLabels, cleanupLabels } from "./labels.js";
import { initMenuToggle, cleanupMenu } from "./menu.js";
import { initTelemetry, cleanupTelemetry } from "./telemetry.js";
export { buildInitialLabels, updatePlanetLabels, updateLabelsVisibility } from "./labels.js";
export { updateInfoFollow } from "./bodyDetails.js";
export { setEpochLabel, setFrameLabel, setEpochDate, setEphemerisMetadata,
  updateDayCounter, updateUIDisplay } from "./telemetry.js";

const outlineMeshes = new Map(); // Object3D → outline Mesh
// Cache for outline geometries to avoid geometry.clone() on each selection
const outlineGeometryCache = new Map(); // originalGeometry.uuid → BufferGeometry (cached clone)
const OUTLINE_RENDER_ORDER = 2;
const OUTLINE_SCALE_MIN = 1.02;
const OUTLINE_SCALE_MAX = 1.12;
const OUTLINE_THICKNESS_MIN = 0.02;
const OUTLINE_THICKNESS_MAX = 0.18;
const OUTLINE_THICKNESS_FACTOR = 0.05;

export function initUI() {
  initBodyDetails(deselectObject);
  initLabels(selectObject);
  initMenuToggle();
  initTelemetry();
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
export function selectObject(obj, follow = true) {
  deselectObject(); // clear previous

  setSelectedObjectState(obj);
  if (follow) {
    updateFollowTarget(obj);
  }

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
  const selectedObject = getSelectedObject();
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

  displayObjectInfo(null);
  setSelectedObjectState(null);
  stopCameraFollow();
  window.dispatchEvent(new CustomEvent("solar-system:selection-changed", { detail: { name: null } }));
}

export function cleanupUI() {
  cleanupBodyDetails();
  cleanupLabels();
  cleanupMenu();
  cleanupTelemetry();
  // Clear and dispose outline meshes
  outlineMeshes.forEach((outline, obj) => {
    if (outline) {
      if (outline.parent) {
        outline.parent.remove(outline);
      }
      if (outline.geometry && !outline.geometry.userData?.outlineCached) {
        outline.geometry.dispose();
      }
      if (outline.material) {
        if (outline.material.map) outline.material.map.dispose();
        outline.material.dispose();
      }
    }
  });
  outlineMeshes.clear();

  for (const geometry of outlineGeometryCache.values()) geometry.dispose();
  outlineGeometryCache.clear();
  setSelectedObjectState(null);
}
