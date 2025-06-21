// --- Asteroid‑belt Module ---------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";
import { createStarTexture } from "./utils.js";

/**
 * Create a fancy, multi‑layer asteroid belt and return the group.
 * The belt automatically spins; call updateAsteroidBelt() each frame.
 */
export function createAsteroidBelt(scene, loader) {
  if (!CONSTANTS.ASTEROID_BELT_ENABLED) return null;

  const belt = new THREE.Group();
  belt.name = "AsteroidBelt";
  scene.add(belt);

  /* ---------- geometry & material helpers -------------------------- */
  const innerR =
    CONSTANTS.ASTEROID_BELT_INNER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const outerR =
    CONSTANTS.ASTEROID_BELT_OUTER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const thick =
    CONSTANTS.ASTEROID_BELT_THICKNESS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;

  const rockMat = new THREE.MeshStandardMaterial({
    color: CONSTANTS.ASTEROID_COLOR,
    roughness: 0.9,
    metalness: 0.15,
    flatShading: true,
  });

  const toRadians = (deg) => (deg * Math.PI) / 180;

  // Helper: Generate a random asteroid orbit and return position
  function randomAsteroidPosition(innerR, outerR, thick) {
    // Semi-major axis (distance from Sun)
    const a = THREE.MathUtils.randFloat(innerR, outerR);
    // Eccentricity (0 = circle, up to ~0.3 for real asteroids)
    const e = THREE.MathUtils.randFloat(0, 0.3);
    // Inclination (tilt, up to ±20°)
    const inc = toRadians(THREE.MathUtils.randFloatSpread(20));
    // Longitude of perihelion
    const omega = Math.random() * Math.PI * 2;
    // Mean anomaly (position along orbit)
    const M = Math.random() * Math.PI * 2;

    // Solve for true anomaly (approximate: for small e, ν ≈ M + 2e sin(M))
    const nu = M + 2 * e * Math.sin(M);
    // Distance from focus (Sun)
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));

    // Position in orbital plane
    let x = r * Math.cos(nu);
    let z = r * Math.sin(nu);
    let y = 0;

    // Rotate by inclination
    const cosInc = Math.cos(inc);
    const sinInc = Math.sin(inc);
    const yRot = z * sinInc;
    z = z * cosInc;
    y = yRot + (Math.random() - 0.5) * thick * 0.5; // add some vertical scatter

    // Rotate by longitude of perihelion
    const cosO = Math.cos(omega);
    const sinO = Math.sin(omega);
    const xRot = x * cosO - z * sinO;
    const zRot = x * sinO + z * cosO;

    return [xRot, y, zRot];
  }

  // -- LAYER 1 : “big boys” (individualised InstancedMesh) ------------
  const bigCount = Math.floor(CONSTANTS.ASTEROID_COUNT * 0.1);
  const bigGeom = new THREE.IcosahedronGeometry(1, 1);
  const bigMesh = new THREE.InstancedMesh(bigGeom, rockMat, bigCount);
  bigMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  belt.add(bigMesh);

  // -- LAYER 2 : mid‑sized rubble ------------------------------------
  const midCount = Math.floor(CONSTANTS.ASTEROID_COUNT * 0.4);
  const midGeom = new THREE.DodecahedronGeometry(0.6, 0);
  const midMesh = new THREE.InstancedMesh(midGeom, rockMat, midCount);
  midMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  belt.add(midMesh);

  // -- LAYER 3 : dusty points cloud ----------------------------------
  const dustCount = CONSTANTS.ASTEROID_COUNT - bigCount - midCount;
  const positions = new Float32Array(dustCount * 3);
  const sizes = new Float32Array(dustCount);

  let p = 0;
  for (let i = 0; i < dustCount; i++) {
    const [x, y, z] = randomAsteroidPosition(innerR, outerR, thick);
    positions[p] = x;
    positions[p + 1] = y;
    positions[p + 2] = z;
    sizes[i] = THREE.MathUtils.randFloat(4, 10);
    p += 3;
  }

  const dustGeom = new THREE.BufferGeometry();
  dustGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  dustGeom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  // Use procedural texture instead of loading a file that doesn't exist
  const dustTex = createStarTexture();
  const dustMat = new THREE.PointsMaterial({
    map: dustTex,
    size: 8,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: CONSTANTS.ASTEROID_COLOR,
  });
  const dustPts = new THREE.Points(dustGeom, dustMat);
  belt.add(dustPts);

  /* ---------- populate instanced meshes --------------------------- */
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();

  const populate = (mesh, count, sMin, sMax) => {
    for (let i = 0; i < count; i++) {
      const [x, y, z] = randomAsteroidPosition(innerR, outerR, thick);
      dummy.position.set(x, y, z);
      dummy.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      const s = THREE.MathUtils.randFloat(sMin, sMax);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // gentle colour shift (cool → warm greys)
      colour.setHSL(0, 0, THREE.MathUtils.randFloat(0.35, 0.6));
      mesh.setColorAt?.(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
  };

  populate(bigMesh, bigCount, 1.2, 3.0);
  populate(midMesh, midCount, 0.4, 1.1);

  /* ---------- belt meta‑data / animation params ------------------- */
  belt.userData = {
    rotationSpeed: 0.025, // degrees per sim‑day
    spinNoise: Math.random() * 1000, // uniq per session
  };

  return belt;
}

/* --------- per‑frame updater (called from animation.js) -------------- */
export function updateAsteroidBelt(belt, delta, simSpeed) {
  if (!belt) return;
  const rotRads = THREE.MathUtils.degToRad(
    belt.userData.rotationSpeed *
      delta *
      simSpeed *
      CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X
  );
  belt.rotation.y += rotRads;
}
