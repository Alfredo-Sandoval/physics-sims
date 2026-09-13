import * as THREE from "three";
import { ENABLE_LOD } from "../core/config.js";
import { getSelectedObject } from "../core/state.js";
import { loadTexture, releaseTexture } from "./textures.js";

// Pixel radius thresholds with hysteresis prevent geometry flicker while zooming.
export function detailLevel(pixelRadius, current = "low") {
  if (pixelRadius > (current === "high" ? 55 : 75)) return "high";
  if (pixelRadius > (current === "low" ? 12 : 8)) return "medium";
  return "low";
}
export function createDetailController(bodies, renderer) {
  const world = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const meshes = [...new Set(bodies.map((body) => body.userData.planetMesh ?? body))]
    .filter((mesh) => mesh.isMesh && mesh.geometry?.type === "SphereGeometry")
    .map((mesh) => ({ mesh, original: mesh.geometry, level: null, cache: new Map() }));
  let detailTexture = null;
  let activeMaterial = null;
  let baseTexture = null;
  let generation = 0;
  function restoreTexture() {
    generation++;
    if (activeMaterial) { activeMaterial.map = baseTexture; activeMaterial.emissiveMap = baseTexture; activeMaterial.needsUpdate = true; }
    releaseTexture(detailTexture);
    detailTexture = activeMaterial = baseTexture = null;
  }
  function sharpen(mesh) {
    if (activeMaterial === mesh?.material) return;
    restoreTexture();
    const base = mesh?.material?.map;
    if (!base?.userData.filename || base.userData.originalSize <= 1024) return;
    const maxSize = Math.min(2048, renderer.capabilities?.maxTextureSize ?? 2048);
    if (maxSize <= base.userData.maxSize) return;
    activeMaterial = mesh.material; baseTexture = base;
    const material = activeMaterial;
    const token = generation;
    detailTexture = loadTexture(base.userData.filename, undefined, maxSize);
    detailTexture.userData.ready.then((texture) => {
      if (generation !== token) return;
      texture.anisotropy = Math.min(8, renderer.capabilities?.getMaxAnisotropy?.() ?? 1);
      texture.needsUpdate = true;
      material.map = texture; material.emissiveMap = texture; material.needsUpdate = true;
    });
  }
  return {
    update(camera) {
      const height = renderer.domElement.clientHeight;
      const pixelsPerUnit = height / (2 * Math.tan(camera.fov * Math.PI / 360));
      const selected = getSelectedObject();
      const selectedMesh = selected?.userData.planetMesh ?? selected;
      let inspectMesh = null;
      for (const record of meshes) {
        const { mesh, original, cache } = record;
        mesh.getWorldPosition(world).applyMatrix4(camera.matrixWorldInverse);
        mesh.getWorldScale(scale);
        const radius = original.parameters.radius;
        const pixelRadius = world.z < 0 ? radius * Math.max(scale.x, scale.y, scale.z) / -world.z * pixelsPerUnit : 0;
        const level = detailLevel(pixelRadius, record.level ?? "low");
        if (ENABLE_LOD && record.level !== level) {
          if (!cache.has(level)) {
            const segments = { low: 12, medium: 32, high: 80 }[level];
            cache.set(level, new THREE.SphereGeometry(radius, segments, Math.max(8, segments / 2)));
          }
          mesh.geometry = cache.get(level);
          mesh.userData.detailLevel = level;
          record.level = level;
        }
        if (mesh === selectedMesh && pixelRadius > 60) inspectMesh = mesh;
      }
      sharpen(inspectMesh);
    },
    dispose() {
      restoreTexture();
      for (const { mesh, original, cache } of meshes) {
        mesh.geometry = original;
        for (const geometry of cache.values()) geometry.dispose();
      }
    },
  };
}
