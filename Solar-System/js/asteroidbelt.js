// File: Solar-System/js/asteroidbelt.js
// --- Asteroid‑belt Module ---------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";

/**
 * Create a realistic asteroid belt using instanced rendering for performance
 * Based on research of successful three.js solar system implementations
 */
export function createAsteroidBelt(scene, loader) {
  if (!CONSTANTS.ASTEROID_BELT_ENABLED) return null;

  const belt = new THREE.Group();
  belt.name = "AsteroidBelt";
  scene.add(belt);
  
  console.log('[AsteroidBelt] Creating realistic asteroid belt with instanced rendering...');

  const innerR = CONSTANTS.ASTEROID_BELT_INNER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const outerR = CONSTANTS.ASTEROID_BELT_OUTER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const thick = CONSTANTS.ASTEROID_BELT_THICKNESS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  
  console.log(`[AsteroidBelt] Dimensions: innerR=${innerR}, outerR=${outerR}, thick=${thick}`);

  // Create base geometry with higher detail for close viewing
  const baseGeometry = new THREE.SphereGeometry(1, 8, 6);
  
  // Create realistic asteroid material with proper lighting
  const material = new THREE.MeshStandardMaterial({
    color: CONSTANTS.ASTEROID_COLOR_BROWN,
    roughness: 0.95,
    metalness: 0.02,
    // Add subtle variations in roughness for realism
    roughnessMap: null // Can be added later with procedural noise
  });
  
  // Use instanced rendering for better performance
  const asteroidCount = CONSTANTS.ASTEROID_COUNT;
  const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, asteroidCount);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedMesh.castShadow = true;
  instancedMesh.receiveShadow = true;
  
  // Generate asteroid data for realistic distribution
  const asteroidData = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const scale = new THREE.Vector3();
  
  console.log(`[AsteroidBelt] Generating ${asteroidCount} asteroids with realistic distribution...`);
  
  for (let i = 0; i < asteroidCount; i++) {
    // Realistic orbital parameters
    // Most asteroids cluster around 2.7 AU (main belt peak)
    const u = Math.random();
    const radius = innerR + (outerR - innerR) * (u < 0.6 ? Math.pow(u / 0.6, 0.3) : 1 - Math.pow((1 - u) / 0.4, 1.5));
    const angle = Math.random() * Math.PI * 2;
    
    // Realistic vertical distribution - most asteroids stay close to ecliptic plane
    const heightFactor = Math.random() - 0.5;
    const height = heightFactor * thick * Math.exp(-Math.abs(heightFactor) * 4);
    
    // Calculate orbital speed based on Kepler's third law
    const orbitSpeed = Math.sqrt(1 / (radius / CONSTANTS.ORBIT_SCALE_FACTOR)) * 0.0005;
    
    // Set initial position
    position.set(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );
    
    // Realistic size distribution - power law with most asteroids small
    const sizeRandom = Math.random();
    const sizeScale = CONSTANTS.ASTEROID_MIN_SIZE + 
      (CONSTANTS.ASTEROID_MAX_SIZE - CONSTANTS.ASTEROID_MIN_SIZE) * 
      Math.pow(sizeRandom, 2.5); // Power law distribution
    
    // Add some variation in shape (slightly elliptical)
    const scaleVariation = 0.8 + Math.random() * 0.4;
    scale.set(
      sizeScale * scaleVariation,
      sizeScale * (0.8 + Math.random() * 0.4),
      sizeScale * (0.8 + Math.random() * 0.4)
    );
    
    // Random rotation
    rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );
    
    // Apply transformation to instance
    matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
    instancedMesh.setMatrixAt(i, matrix);
    
    // Store asteroid data for animation
    asteroidData.push({
      radius: radius,
      angle: angle,
      height: height,
      orbitSpeed: orbitSpeed,
      rotationSpeed: (Math.random() - 0.5) * 0.01,
      rotationAxis: new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize()
    });
  }
  
  instancedMesh.instanceMatrix.needsUpdate = true;
  belt.add(instancedMesh);
  
  console.log(`[AsteroidBelt] Created instanced mesh with ${asteroidCount} asteroids`);
  console.log(`[AsteroidBelt] Sample positions:`);
  for (let i = 0; i < Math.min(3, asteroidData.length); i++) {
    const data = asteroidData[i];
    const x = Math.cos(data.angle) * data.radius;
    const z = Math.sin(data.angle) * data.radius;
    console.log(`  Asteroid ${i}: (${x.toFixed(1)}, ${data.height.toFixed(1)}, ${z.toFixed(1)})`);
  }
  
  // Store references for animation
  belt.userData.instancedMesh = instancedMesh;
  belt.userData.asteroidData = asteroidData;
  belt.userData.isSelectable = false;
  belt.userData.name = "Asteroid Belt";
  belt.userData.type = "asteroid_belt";
  
  return belt;
}

/**
 * Update asteroid belt animation with proper orbital mechanics using instanced rendering
 */
export function updateAsteroidBelt(belt, deltaTime, simulationSpeed = 1.0) {
  if (!belt || !belt.userData.instancedMesh || !belt.userData.asteroidData) return;
  
  const instancedMesh = belt.userData.instancedMesh;
  const asteroidData = belt.userData.asteroidData;
  const speedFactor = simulationSpeed * deltaTime * 0.001;
  
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  
  // Update each asteroid instance
  for (let i = 0; i < asteroidData.length; i++) {
    const data = asteroidData[i];
    
    // Update orbital angle
    data.angle += data.orbitSpeed * speedFactor;
    
    // Update position based on orbital mechanics
    position.set(
      Math.cos(data.angle) * data.radius,
      data.height,
      Math.sin(data.angle) * data.radius
    );
    
    // Update rotation
    const rotationAmount = data.rotationSpeed * speedFactor;
    quaternion.setFromAxisAngle(data.rotationAxis, rotationAmount);
    
    // Get current matrix to preserve scale
    instancedMesh.getMatrixAt(i, matrix);
    matrix.decompose(position, quaternion, scale);
    
    // Apply rotation increment
    const currentQuaternion = new THREE.Quaternion();
    matrix.decompose(position, currentQuaternion, scale);
    currentQuaternion.multiply(quaternion);
    
    // Set new position and rotation
    matrix.compose(position, currentQuaternion, scale);
    instancedMesh.setMatrixAt(i, matrix);
  }
  
  instancedMesh.instanceMatrix.needsUpdate = true;
}