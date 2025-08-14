// File: Solar-System/js/asteroidbelt.js
// --- Asteroid‑belt Module ---------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

/**
 * Create a realistic, performant asteroid belt.
 * - Orbital-like distribution (mild eccentricity, inclination)
 * - Density bias toward mid-belt with Kirkwood gaps
 * - Device-based count scaling and shadow-free materials
 */
export function createAsteroidBelt(scene, loader) {
  if (!CONSTANTS.ASTEROID_BELT_ENABLED) return null;

  const belt = new THREE.Group();
  belt.name = "AsteroidBelt";
  scene.add(belt);
  
  const innerR =
    CONSTANTS.ASTEROID_BELT_INNER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const outerR =
    CONSTANTS.ASTEROID_BELT_OUTER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const thick =
    CONSTANTS.ASTEROID_BELT_THICKNESS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;

  // Device-based scaling
  const DPR = Math.min((window.devicePixelRatio || 1), 2);
  const CORES = (navigator && navigator.hardwareConcurrency) || 4;
  const deviceScale = (CORES >= 8 ? 1.0 : 0.6) * (DPR > 1.5 ? 0.85 : 1.0);
  const TARGET_COUNT = Math.max(
    400,
    Math.floor(CONSTANTS.ASTEROID_COUNT * deviceScale)
  );

  // Materials (shadow-free)
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.95, metalness: 0.02, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.9, metalness: 0.05, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.98, metalness: 0.01, flatShading: true }),
  ];
  materials.forEach((m) => {
    m.userData.castShadow = false;
    m.userData.receiveShadow = false;
  });

  // Counts
  const mainAsteroidCount = Math.floor(TARGET_COUNT * 0.35);
  const perMaterial = Math.max(1, Math.floor(mainAsteroidCount / materials.length));
  // Scene-unit ranges
  const innerR =
    CONSTANTS.ASTEROID_BELT_INNER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const outerR =
    CONSTANTS.ASTEROID_BELT_OUTER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const thick =
    CONSTANTS.ASTEROID_BELT_THICKNESS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;

  // Device-based scaling
  const DPR = Math.min((window.devicePixelRatio || 1), 2);
  const CORES = (navigator && navigator.hardwareConcurrency) || 4;
  const deviceScale = (CORES >= 8 ? 1.0 : 0.6) * (DPR > 1.5 ? 0.85 : 1.0);
  const TARGET_COUNT = Math.max(
    400,
    Math.floor(CONSTANTS.ASTEROID_COUNT * deviceScale)
  );

  // Materials (shadow-free)
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.95, metalness: 0.02, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.9, metalness: 0.05, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.98, metalness: 0.01, flatShading: true }),
  ];
  materials.forEach((m) => {
    m.userData.castShadow = false;
    m.userData.receiveShadow = false;
  });

  // Counts
  const mainAsteroidCount = Math.floor(TARGET_COUNT * 0.35);
  const perMaterial = Math.max(1, Math.floor(mainAsteroidCount / materials.length));

  // Geometries for subtle variety
  const geoms = [
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.DodecahedronGeometry(0.9, 0),
    new THREE.IcosahedronGeometry(1.2, 0),
  ];

  // Helpers
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Euler();
  const scale = new THREE.Vector3();

  // Kirkwood gaps (AU)
  const gapsAU = [2.06, 2.5, 2.82, 2.95];
  const gapWidthAU = 0.05; // width of dip
  const gapDepth = 0.6; // probability to skip near center

  // Sample a radius (scene units) with mid-belt bias and gaps
  function sampleRadius() {
    const r0 = innerR;
    const r1 = outerR;
    // Mid-belt bias
    let r = r0 + (r1 - r0) * Math.pow(Math.random(), 0.6);
    // Convert to AU to test gaps
    const rAU = r / CONSTANTS.ORBIT_SCALE_FACTOR;
    for (const g of gapsAU) {
      const dist = Math.abs(rAU - g);
      if (dist < gapWidthAU) {
        const p = 1 - (dist / gapWidthAU); // 1 at center → 0 at edge
        if (Math.random() < p * gapDepth) {
          // resample
          return sampleRadius();
        }
      }
    }
    return r;
  }

  // Orbital-like position with small e and inclination
  function randomAsteroidPosition() {
    const a = sampleRadius(); // scene units
    const e = THREE.MathUtils.randFloat(0, 0.12);
    const omega = Math.random() * Math.PI * 2; // in-plane orientation
    const M = Math.random() * Math.PI * 2; // mean anomaly
    const nu = M + 2 * e * Math.sin(M); // approx true anomaly
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
    // position in orbital (XZ) plane
    const x0 = r * Math.cos(nu);
    const z0 = r * Math.sin(nu);
    const cosO = Math.cos(omega);
    const sinO = Math.sin(omega);
    const x = x0 * cosO - z0 * sinO;
    const z = x0 * sinO + z0 * cosO;
    // keep belt in XZ plane with subtle vertical scatter only
    const y = THREE.MathUtils.randFloatSpread(thick * 0.25);
    return new THREE.Vector3(x, y, z);
  }

  // Create main field across materials/geometries
  for (let mi = 0; mi < materials.length; mi++) {
    const material = materials[mi];
    const geom = geoms[mi % geoms.length];
    const count = perMaterial;
    const inst = new THREE.InstancedMesh(geom, material, count);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.castShadow = false;
    inst.receiveShadow = false;

    for (let i = 0; i < count; i++) {
      const pos = randomAsteroidPosition();
      rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      const baseSize = THREE.MathUtils.randFloat(
        CONSTANTS.ASTEROID_MIN_SIZE * 1.6,
        CONSTANTS.ASTEROID_MAX_SIZE * 1.4
      );
      const elong = THREE.MathUtils.randFloat(0.6, 1.4);
      scale.set(baseSize, baseSize * elong, baseSize * THREE.MathUtils.randFloat(0.8, 1.2));
      const quat = new THREE.Quaternion().setFromEuler(rotation);
      matrix.compose(pos, quat, scale);
      inst.setMatrixAt(i, matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    belt.add(inst);
  }

  // Dust layer (points)
  const dustCount = Math.max(0, TARGET_COUNT - mainAsteroidCount);
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const pos = randomAsteroidPosition();
    const i3 = i * 3;
    dustPositions[i3] = pos.x;
    dustPositions[i3 + 1] = pos.y * 0.7; // slightly thinner dust
    dustPositions[i3 + 2] = pos.z;
    const b = THREE.MathUtils.randFloat(0.35, 0.75);
    dustColors[i3] = b * 0.8;
    dustColors[i3 + 1] = b * 0.6;
    dustColors[i3 + 2] = b * 0.45;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  const dustMaterial = new THREE.PointsMaterial({
    size: DPR > 1.5 ? 2 : 3,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const dustPoints = new THREE.Points(dustGeometry, dustMaterial);
  belt.add(dustPoints);

  // Animation meta
  belt.userData.rotationSpeed = 0.00005;
  belt.userData.materials = materials;
  belt.userData.dustPoints = dustPoints;
  return belt;
}

export function updateAsteroidBelt(belt, deltaTime) {
  if (!belt || !belt.userData) return;
  belt.rotation.y += belt.userData.rotationSpeed * deltaTime;
  if (belt.userData.dustPoints) {
    const t = performance.now() * 0.001;
    belt.userData.dustPoints.material.opacity = 0.4 + 0.2 * Math.sin(t * 0.5);
>>>>>>> 758d87c (Solar System: 3D orbit inclinations, labels, sun glow, tone mapping; UI toggles; innerHTML hardening)
  }

  // Animation meta
  belt.userData.rotationSpeed = 0.00005;
  belt.userData.materials = materials;
  belt.userData.dustPoints = dustPoints;
  return belt;
}

export function updateAsteroidBelt(belt, deltaTime) {
  if (!belt || !belt.userData) return;
  belt.rotation.y += belt.userData.rotationSpeed * deltaTime;
  if (belt.userData.dustPoints) {
    const t = performance.now() * 0.001;
    belt.userData.dustPoints.material.opacity = 0.4 + 0.2 * Math.sin(t * 0.5);
  }
}
