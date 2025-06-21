// --- Asteroid‑belt Module ---------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

/**
 * Create a beautiful, performant asteroid belt with multiple techniques
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

  // Create different materials for variety
  const materials = [
    new THREE.MeshStandardMaterial({
      color: 0x8b7355, // Brown rock
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x696969, // Dark gray
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x654321, // Dark brown
      roughness: 0.98,
      metalness: 0.01,
      flatShading: true,
    }),
  ];

  // Make sure asteroids don't cast shadows (prevents pixelated shadows)
  materials.forEach((mat) => {
    mat.userData.castShadow = false;
    mat.userData.receiveShadow = false;
  });

  // Create main asteroid field - larger, more visible asteroids
  const mainAsteroidCount = Math.floor(CONSTANTS.ASTEROID_COUNT * 0.3);
  const asteroidGeom = new THREE.IcosahedronGeometry(1, 1); // Higher detail

  materials.forEach((material, index) => {
    const asteroidMesh = new THREE.InstancedMesh(
      asteroidGeom,
      material,
      Math.floor(mainAsteroidCount / 3)
    );
    asteroidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    asteroidMesh.castShadow = false; // Disable shadow casting
    asteroidMesh.receiveShadow = false; // Disable shadow receiving

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Euler();
    const scale = new THREE.Vector3();

    // Populate asteroid instances
    for (let i = 0; i < Math.floor(mainAsteroidCount / 3); i++) {
      // Create more realistic orbital distribution
      const angle = Math.random() * Math.PI * 2;
      const radius = THREE.MathUtils.randFloat(innerR, outerR);

      // Add some orbital eccentricity
      const eccentricity = THREE.MathUtils.randFloat(0, 0.1);
      const adjustedRadius = radius * (1 + eccentricity * Math.cos(angle * 3));

      const height = THREE.MathUtils.randFloatSpread(thick * 0.5); // Thinner distribution

      position.set(
        Math.cos(angle) * adjustedRadius,
        height,
        Math.sin(angle) * adjustedRadius
      );

      // Random rotation
      rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // Varied sizes with more realistic distribution
      const baseSize = THREE.MathUtils.randFloat(
        CONSTANTS.ASTEROID_MIN_SIZE * 2,
        CONSTANTS.ASTEROID_MAX_SIZE * 1.5
      );
      const elongation = THREE.MathUtils.randFloat(0.6, 1.4);
      scale.set(
        baseSize,
        baseSize * elongation,
        baseSize * THREE.MathUtils.randFloat(0.8, 1.2)
      );

      matrix.compose(
        position,
        new THREE.Quaternion().setFromEuler(rotation),
        scale
      );
      asteroidMesh.setMatrixAt(i, matrix);
    }

    asteroidMesh.instanceMatrix.needsUpdate = true;
    belt.add(asteroidMesh);
  });

  // Add dust/debris field using points for distant aesthetic
  const dustCount = CONSTANTS.ASTEROID_COUNT - mainAsteroidCount;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);

  for (let i = 0; i < dustCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.randFloat(innerR * 0.9, outerR * 1.1);
    const height = THREE.MathUtils.randFloatSpread(thick);

    const i3 = i * 3;
    dustPositions[i3] = Math.cos(angle) * radius;
    dustPositions[i3 + 1] = height;
    dustPositions[i3 + 2] = Math.sin(angle) * radius;

    // Varied dust colors
    const brightness = THREE.MathUtils.randFloat(0.3, 0.8);
    dustColors[i3] = brightness * 0.8; // R
    dustColors[i3 + 1] = brightness * 0.6; // G
    dustColors[i3 + 2] = brightness * 0.4; // B
  }

  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(dustPositions, 3)
  );
  dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));

  const dustMaterial = new THREE.PointsMaterial({
    size: 3,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  const dustPoints = new THREE.Points(dustGeometry, dustMaterial);
  belt.add(dustPoints);

  // Store references for animation
  belt.userData.rotationSpeed = 0.00005; // Even slower rotation
  belt.userData.materials = materials;
  belt.userData.dustPoints = dustPoints;

  return belt;
}

/**
 * Update asteroid belt animation
 */
export function updateAsteroidBelt(belt, deltaTime) {
  if (!belt || !belt.userData) return;

  // Very slow rotation of the entire belt
  belt.rotation.y += belt.userData.rotationSpeed * deltaTime;

  // Optional: Subtle animation of dust opacity for twinkling effect
  if (belt.userData.dustPoints) {
    const time = performance.now() * 0.001;
    belt.userData.dustPoints.material.opacity =
      0.4 + 0.2 * Math.sin(time * 0.5);
  }
}
