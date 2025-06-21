// --- Asteroid‑belt Module ---------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

/**
 * Create a cleaner, more performant asteroid belt
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

  // Create material for asteroids
  const rockMat = new THREE.MeshStandardMaterial({
    color: CONSTANTS.ASTEROID_COLOR,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
  });

  // Create main asteroid field using InstancedMesh for performance
  const asteroidGeom = new THREE.IcosahedronGeometry(1, 0);
  const asteroidMesh = new THREE.InstancedMesh(
    asteroidGeom,
    rockMat,
    CONSTANTS.ASTEROID_COUNT
  );
  asteroidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const scale = new THREE.Vector3();

  // Populate asteroid instances
  for (let i = 0; i < CONSTANTS.ASTEROID_COUNT; i++) {
    // Random position in belt
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.randFloat(innerR, outerR);
    const height = THREE.MathUtils.randFloatSpread(thick);

    position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);

    // Random rotation
    rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    // Random scale within bounds
    const size = THREE.MathUtils.randFloat(
      CONSTANTS.ASTEROID_MIN_SIZE,
      CONSTANTS.ASTEROID_MAX_SIZE
    );
    const elongation = THREE.MathUtils.randFloat(0.7, 1.3);
    scale.set(size, size * elongation, size);

    matrix.compose(
      position,
      new THREE.Quaternion().setFromEuler(rotation),
      scale
    );
    asteroidMesh.setMatrixAt(i, matrix);
  }

  asteroidMesh.instanceMatrix.needsUpdate = true;
  belt.add(asteroidMesh);

  // Store references for animation
  belt.userData.asteroidMesh = asteroidMesh;
  belt.userData.rotationSpeed = 0.0001; // Very slow rotation

  return belt;
}

/**
 * Update asteroid belt animation
 */
export function updateAsteroidBelt(belt, deltaTime) {
  if (!belt || !belt.userData.asteroidMesh) return;

  // Slowly rotate the entire belt
  belt.rotation.y += belt.userData.rotationSpeed * deltaTime;
}
