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
    const r = THREE.MathUtils.randFloat(innerR, outerR);
    const θ = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * thick;
    positions[p] = Math.cos(θ) * r;
    positions[p + 1] = y;
    positions[p + 2] = Math.sin(θ) * r;
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
      const r = THREE.MathUtils.randFloat(innerR, outerR);
      const θ = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * thick;
      dummy.position.set(Math.cos(θ) * r, y, Math.sin(θ) * r);
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
