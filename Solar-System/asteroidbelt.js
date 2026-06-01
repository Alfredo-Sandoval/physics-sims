// File: Solar-System/asteroidbelt.js
// --- Asteroid‑belt Module ---------------------------------------------
import * as THREE from "./vendor/three/build/three.module.js";
import * as CONSTANTS from "./constants.js";
import { getSimulatedDays, getCamera } from "./appState.js";
import {
  registerWorkerBelt,
  requestWorkerBeltUpdate,
  unregisterWorkerBelt,
} from "./beltWorkerClient.js";

const TWO_PI = Math.PI * 2;

function normalizeAngle(angleRadians) {
  const wrapped = angleRadians % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/**
 * Create a realistic, performant asteroid belt with:
 * - Individual Keplerian orbits for each asteroid
 * - Named major asteroids (Ceres, Vesta, Pallas, Hygiea)
 * - Composition-based materials (C-type, S-type, M-type)
 * - Kirkwood gaps and density distribution
 * - Deformed geometries for variety
 */
export function createAsteroidBelt(scene, loader) {
  if (!CONSTANTS.ASTEROID_BELT_ENABLED) return null;

  const belt = new THREE.Group();
  belt.name = "AsteroidBelt";
  scene.add(belt);

  // Scene-unit ranges
  const innerR = CONSTANTS.ASTEROID_BELT_INNER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const outerR = CONSTANTS.ASTEROID_BELT_OUTER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const thick = CONSTANTS.ASTEROID_BELT_THICKNESS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;

  // Device-based scaling
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const CORES = (navigator && navigator.hardwareConcurrency) || 4;
  const deviceScale = (CORES >= 8 ? 1.0 : 0.6) * (DPR > 1.5 ? 0.85 : 1.0);
  const TARGET_COUNT = Math.max(400, Math.floor(CONSTANTS.ASTEROID_COUNT * deviceScale));

  // Composition-based materials (shadow-free)
  // C-type (carbonaceous) - 75% of belt, very dark
  const cTypeMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d3d3d,
    roughness: 0.98,
    metalness: 0.01,
    flatShading: false,
    side: THREE.FrontSide,
  });

  // S-type (silicaceous) - 17% of belt, stony/brownish
  const sTypeMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b7355,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: false,
    side: THREE.FrontSide,
  });

  // M-type (metallic) - 8% of belt, gray/metallic
  const mTypeMaterial = new THREE.MeshStandardMaterial({
    color: 0x6d6d6d,
    roughness: 0.85,
    metalness: 0.15,
    flatShading: false,
    side: THREE.FrontSide,
  });

  const materials = [cTypeMaterial, sTypeMaterial, mTypeMaterial];
  materials.forEach((m) => {
    m.vertexColors = true;
    m.userData.castShadow = false;
    m.userData.receiveShadow = false;
  });

  function createDustTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.4, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Simple impostor ring for far view (fast fallback)
  const impostorGeom = new THREE.RingGeometry(innerR, outerR, 96, 2);
  impostorGeom.rotateX(Math.PI / 2);
  const impostorMat = new THREE.MeshBasicMaterial({
    color: 0x88837a,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const impostor = new THREE.Mesh(impostorGeom, impostorMat);
  impostor.name = "AsteroidBeltImpostor";
  impostor.renderOrder = 0;
  impostor.visible = false; // toggled dynamically based on camera distance
  belt.add(impostor);

  // Create deformed geometries for variety
  function createDeformedGeometry(baseType, detail) {
    let geom;
    if (baseType === "icosahedron") {
      geom = new THREE.IcosahedronGeometry(1, detail);
    } else if (baseType === "dodecahedron") {
      geom = new THREE.DodecahedronGeometry(1, detail);
    } else {
      geom = new THREE.TetrahedronGeometry(1, detail);
    }

    // Deform vertices randomly for irregular asteroid shape
    const positions = geom.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Normalize to get direction
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;

      // Add random deformation (craters and bumps)
      // Keep base size ~1.0, just add variation
      const deform = 0.85 + Math.random() * 0.3; // 0.85 to 1.15
      positions.setXYZ(i, nx * deform, ny * deform, nz * deform);
    }

    geom.computeVertexNormals();
    return geom;
  }

  // Create fewer geometry types for better performance
  const geomTypes = ["icosahedron", "dodecahedron"];
  const geoms = [];
  for (let i = 0; i < 2; i++) {
    const baseType = geomTypes[i % geomTypes.length];
    const detail = 0; // Reduced detail for performance
    geoms.push(createDeformedGeometry(baseType, detail));
  }

  // Helpers
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  const sampleBiased = (min, max, power = 2.2) =>
    min + (max - min) * Math.pow(Math.random(), power);

  // Kirkwood gaps (AU)
  const gapsAU = [2.06, 2.5, 2.82, 2.95];
  const gapWidthAU = 0.05;
  const gapDepth = 0.6;

  // Sample radius with mid-belt bias and Kirkwood gaps
  function sampleRadius() {
    const r0 = innerR / CONSTANTS.ORBIT_SCALE_FACTOR; // in AU
    const r1 = outerR / CONSTANTS.ORBIT_SCALE_FACTOR;

    for (let attempt = 0; attempt < 12; attempt++) {
      const rAU = r0 + (r1 - r0) * Math.pow(Math.random(), 0.6);

      let inGap = false;
      for (const g of gapsAU) {
        const dist = Math.abs(rAU - g);
        if (dist < gapWidthAU) {
          const p = 1 - dist / gapWidthAU;
          if (Math.random() < p * gapDepth) {
            inGap = true;
            break;
          }
        }
      }
      if (!inGap) return rAU;
    }
    return (r0 + r1) * 0.5;
  }

  const dustCount = Math.max(1200, Math.floor(TARGET_COUNT * 2.5));
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  const dustColorA = new THREE.Color(0x8a7a66);
  const dustColorB = new THREE.Color(0x6c5d4b);
  for (let i = 0; i < dustCount; i++) {
    const rAU = sampleRadius();
    const r = rAU * CONSTANTS.ORBIT_SCALE_FACTOR;
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() * 2 - 1) * (thick * 0.25);
    const base = i * 3;
    dustPositions[base + 0] = r * Math.cos(theta);
    dustPositions[base + 1] = y;
    dustPositions[base + 2] = r * Math.sin(theta);

    color.copy(dustColorA).lerp(dustColorB, Math.random());
    color.multiplyScalar(THREE.MathUtils.randFloat(0.7, 1.1));
    dustColors[base + 0] = color.r;
    dustColors[base + 1] = color.g;
    dustColors[base + 2] = color.b;
  }
  const dustGeom = new THREE.BufferGeometry();
  dustGeom.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeom.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  const dustMaterial = new THREE.PointsMaterial({
    size: 1.2,
    map: createDustTexture(),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
  });
  const dustPoints = new THREE.Points(dustGeom, dustMaterial);
  dustPoints.name = "AsteroidBeltDust";
  dustPoints.renderOrder = -1;
  dustPoints.frustumCulled = CONSTANTS.ENABLE_FRUSTUM_CULLING;
  belt.add(dustPoints);

  // Generate orbital parameters for an asteroid
  function generateOrbitalParams() {
    const a = sampleRadius(); // semi-major axis in AU
    const e = Math.pow(Math.random(), 1.8) * 0.22; // bias toward low eccentricity
    const i = Math.pow(Math.random(), 2.4) * 0.35; // bias toward low inclination (rad)
    const Omega = Math.random() * Math.PI * 2; // longitude of ascending node
    const omega = Math.random() * Math.PI * 2; // argument of periapsis
    const M0 = Math.random() * Math.PI * 2; // initial mean anomaly

    // Orbital period using Kepler's 3rd law: T² ∝ a³
    // T in Earth days
    const T = Math.sqrt(a * a * a) * 365.25;

    return { a, e, i, Omega, omega, M0, T };
  }

  // Calculate position from orbital elements using Kepler's laws
  function calculateOrbitalPosition(params, t) {
    const { a, e, i, Omega, omega, M0, T } = params;

    // Mean motion (radians per day)
    const n = TWO_PI / T;

    // Mean anomaly at time t
    const M = normalizeAngle(M0 + n * t);

    // Solve Kepler's equation for eccentric anomaly E
    // M = E - e*sin(E)
    let E = M;
    for (let iter = 0; iter < 5; iter++) {
      E = M + e * Math.sin(E);
    }

    // True anomaly
    const nu =
      2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));

    // Distance from Sun
    const r = a * (1 - e * Math.cos(E));

    // Position in orbital plane
    const x_orb = r * Math.cos(nu);
    const y_orb = r * Math.sin(nu);

    // Rotate by argument of periapsis
    const cos_w = Math.cos(omega);
    const sin_w = Math.sin(omega);
    const x_peri = x_orb * cos_w - y_orb * sin_w;
    const y_peri = x_orb * sin_w + y_orb * cos_w;

    // Rotate by inclination
    const cos_i = Math.cos(i);
    const sin_i = Math.sin(i);
    const x_incl = x_peri;
    const y_incl = y_peri * cos_i;
    const z_incl = y_peri * sin_i;

    // Rotate by longitude of ascending node
    const cos_O = Math.cos(Omega);
    const sin_O = Math.sin(Omega);
    const x = x_incl * cos_O - y_incl * sin_O;
    const z = x_incl * sin_O + y_incl * cos_O;
    const y = z_incl;

    // Convert AU to scene units
    return new THREE.Vector3(
      x * CONSTANTS.ORBIT_SCALE_FACTOR,
      y * CONSTANTS.ORBIT_SCALE_FACTOR,
      z * CONSTANTS.ORBIT_SCALE_FACTOR
    );
  }

  // Store asteroid data for updates
  const asteroidData = [];

  // Distribute asteroids by composition
  const cTypeCount = Math.floor(TARGET_COUNT * 0.75);
  const sTypeCount = Math.floor(TARGET_COUNT * 0.17);
  const mTypeCount = TARGET_COUNT - cTypeCount - sTypeCount;

  const compositionalGroups = [
    { material: cTypeMaterial, count: cTypeCount },
    { material: sTypeMaterial, count: sTypeCount },
    { material: mTypeMaterial, count: mTypeCount },
  ];

  // Create instanced meshes for each composition type
  let totalInstances = 0;

  compositionalGroups.forEach((group, groupIdx) => {
    const { material, count } = group;
    const geom = geoms[groupIdx % geoms.length];

    const inst = new THREE.InstancedMesh(geom, material, count);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Dynamic for updates
    inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = CONSTANTS.ENABLE_FRUSTUM_CULLING; // Use frustum culling for performance

    const workerInstances = [];

    for (let i = 0; i < count; i++) {
      const orbitalParams = generateOrbitalParams();
      const pos = calculateOrbitalPosition(orbitalParams, 0);

      const rotation = new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      const baseSize = sampleBiased(
        CONSTANTS.ASTEROID_MIN_SIZE * 2.0,
        CONSTANTS.ASTEROID_MAX_SIZE * 3.2,
        2.4
      );
      const elong = THREE.MathUtils.randFloat(0.6, 1.5);
      scale.set(baseSize, baseSize * elong, baseSize * THREE.MathUtils.randFloat(0.7, 1.3));

      const quat = new THREE.Quaternion().setFromEuler(rotation);
      matrix.compose(pos, quat, scale);
      inst.setMatrixAt(i, matrix);
      color.copy(material.color).multiplyScalar(THREE.MathUtils.randFloat(0.85, 1.15));
      inst.setColorAt(i, color);

      workerInstances.push({
        orbitalParams,
        rotation: [rotation.x, rotation.y, rotation.z],
        rotationSpeed: [
          THREE.MathUtils.randFloat(-0.01, 0.01),
          THREE.MathUtils.randFloat(-0.01, 0.01),
          THREE.MathUtils.randFloat(-0.01, 0.01),
        ],
        scale: [scale.x, scale.y, scale.z],
      });
    }

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    belt.add(inst);

    const beltId = `asteroid-${inst.uuid}`;

    registerWorkerBelt({
      beltId,
      orbitScaleFactor: CONSTANTS.ORBIT_SCALE_FACTOR,
      instances: workerInstances,
      onMatrices: (matrixArray) => {
        inst.instanceMatrix.array.set(matrixArray);
        inst.instanceMatrix.needsUpdate = true;
      },
    });

    asteroidData.push({
      mesh: inst,
      beltId,
      count,
    });

    totalInstances += count;
  });

  // Create named major asteroids
  const namedAsteroids = createNamedAsteroids(scene, belt);

  // Store data for updates
  belt.userData.asteroidData = asteroidData;
  belt.userData.namedAsteroids = namedAsteroids;
  belt.userData.materials = materials;
  belt.userData.beltRadius = (innerR + outerR) * 0.5;
  belt.userData.lastUpdateMs = 0;
  belt.userData.lastDistance = null;
  belt.userData.impostor = impostor;
  belt.userData.useImpostor = false;
  belt.userData.dust = dustPoints;
  belt.userData.dustMaterial = dustMaterial;
  const previousDispose =
    typeof belt.userData.dispose === "function" ? belt.userData.dispose.bind(belt.userData) : null;
  belt.userData.dispose = () => {
    if (previousDispose) {
      previousDispose();
    }
    cleanupAsteroidBelt(belt);
  };
  belt.userData.cleanup = belt.userData.dispose;

  console.log(`[AsteroidBelt] Created ${belt.children.length} asteroid groups`);
  console.log(`[AsteroidBelt] Named asteroids: ${namedAsteroids.length}`);
  console.log(`[AsteroidBelt] Total instances: ${totalInstances}`);

  return belt;
}

// Create the 4 largest asteroids as separate objects
function createNamedAsteroids(scene, belt) {
  const namedAsteroids = [];

  // Data: name, semi-major axis (AU), size multiplier, color
  const majorAsteroids = [
    { name: "Ceres", a: 2.77, size: 0.8, color: 0x4a4a4a, e: 0.076, i: 0.186 }, // Dwarf planet
    { name: "Vesta", a: 2.36, size: 0.45, color: 0x9d8b6c, e: 0.089, i: 0.123 },
    { name: "Pallas", a: 2.77, size: 0.44, color: 0x5a5a5a, e: 0.231, i: 0.597 },
    { name: "Hygiea", a: 3.14, size: 0.37, color: 0x3f3f3f, e: 0.117, i: 0.067 },
  ];

  majorAsteroids.forEach((data) => {
    const geom = new THREE.IcosahedronGeometry(1, 2);
    const material = new THREE.MeshStandardMaterial({
      color: data.color,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    material.userData.castShadow = false;
    material.userData.receiveShadow = false;

    const mesh = new THREE.Mesh(geom, material);
    mesh.scale.setScalar(data.size * 1.5); // Make named asteroids bigger
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = data.name;
    mesh.userData.type = "named_asteroid";
    mesh.userData.config = {
      name: data.name,
      info: {
        diameter:
          data.name === "Ceres"
            ? "939 km"
            : data.name === "Vesta"
              ? "525 km"
              : data.name === "Pallas"
                ? "512 km"
                : "434 km",
        type: data.name === "Ceres" ? "Dwarf Planet" : "Asteroid",
        composition:
          data.name === "Ceres"
            ? "C-type (carbonaceous)"
            : data.name === "Vesta"
              ? "V-type (basaltic)"
              : data.name === "Pallas"
                ? "B-type (carbonaceous)"
                : "C-type (carbonaceous)",
      },
    };

    // Orbital parameters
    const orbitalParams = {
      a: data.a,
      e: data.e,
      i: data.i,
      Omega: Math.random() * Math.PI * 2,
      omega: Math.random() * Math.PI * 2,
      M0: Math.random() * Math.PI * 2,
      T: Math.sqrt(data.a * data.a * data.a) * 365.25,
    };

    mesh.userData.orbitalParams = orbitalParams;

    belt.add(mesh);
    namedAsteroids.push(mesh);
  });

  return namedAsteroids;
}

function getBeltUpdateIntervalMs(distance, beltRadius) {
  if (!Number.isFinite(distance) || !Number.isFinite(beltRadius) || beltRadius <= 0) {
    return 48;
  }
  const ratio = distance / beltRadius;
  if (ratio < 1.8) return 24;
  if (ratio < 3.2) return 40;
  if (ratio < 5.5) return 80;
  return 160;
}

export function updateAsteroidBelt(belt, deltaTime) {
  if (!belt || !belt.userData) return;
  if (belt.visible === false) return;

  const asteroidData = belt.userData.asteroidData;
  const namedAsteroids = belt.userData.namedAsteroids;
  const simulatedDays = getSimulatedDays() || 0;
  const camera = getCamera();

  if (!asteroidData) return;

  const now = performance.now ? performance.now() : Date.now();
  const beltRadius = belt.userData.beltRadius ?? 0;
  const distance = camera?.position?.length?.() ?? null;
  const ratio = Number.isFinite(distance) && beltRadius > 0 ? distance / beltRadius : null;
  const useImpostor = Number.isFinite(ratio) ? ratio > 5.0 : false;
  const impostor = belt.userData.impostor ?? belt.getObjectByName("AsteroidBeltImpostor");
  if (impostor) impostor.visible = useImpostor;
  const showInstances = !useImpostor;
  const dust = belt.userData.dust ?? belt.getObjectByName("AsteroidBeltDust");
  if (dust) dust.visible = showInstances;
  const interval = getBeltUpdateIntervalMs(distance, beltRadius);
  const lastUpdateMs = belt.userData.lastUpdateMs ?? 0;
  const forceUpdate = belt.userData.useImpostor !== useImpostor;
  if (forceUpdate) {
    belt.userData.useImpostor = useImpostor;
  }
  const shouldUpdate = forceUpdate || now - lastUpdateMs >= interval;

  if (shouldUpdate) {
    belt.userData.lastUpdateMs = now;
    belt.userData.lastDistance = distance;
  }

  asteroidData.forEach((group) => {
    const { mesh, beltId } = group;
    mesh.visible = showInstances;
    if (showInstances && shouldUpdate) {
      requestWorkerBeltUpdate(beltId, simulatedDays, deltaTime);
    }
  });

  // Update named asteroids
  if (namedAsteroids) {
    namedAsteroids.forEach((asteroid) => {
      asteroid.visible = showInstances;
      if (!showInstances || !shouldUpdate) return;
      const params = asteroid.userData.orbitalParams;
      if (!params) return;

      const { a, e, i, Omega, omega, M0, T } = params;
      const n = TWO_PI / T;
      const M = normalizeAngle(M0 + n * simulatedDays);

      let E = M;
      for (let iter = 0; iter < 5; iter++) {
        E = M + e * Math.sin(E);
      }

      const nu =
        2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));

      const r = a * (1 - e * Math.cos(E));
      const x_orb = r * Math.cos(nu);
      const y_orb = r * Math.sin(nu);

      const cos_w = Math.cos(omega);
      const sin_w = Math.sin(omega);
      const x_peri = x_orb * cos_w - y_orb * sin_w;
      const y_peri = x_orb * sin_w + y_orb * cos_w;

      const cos_i = Math.cos(i);
      const sin_i = Math.sin(i);
      const x_incl = x_peri;
      const y_incl = y_peri * cos_i;
      const z_incl = y_peri * sin_i;

      const cos_O = Math.cos(Omega);
      const sin_O = Math.sin(Omega);
      const x = x_incl * cos_O - y_incl * sin_O;
      const z = x_incl * sin_O + y_incl * cos_O;
      const y = z_incl;

      asteroid.position.set(
        x * CONSTANTS.ORBIT_SCALE_FACTOR,
        y * CONSTANTS.ORBIT_SCALE_FACTOR,
        z * CONSTANTS.ORBIT_SCALE_FACTOR
      );

      // Slow rotation
      asteroid.rotation.y += 0.001 * deltaTime;
    });
  }
}

function unregisterAsteroidBelts(asteroidData) {
  if (!Array.isArray(asteroidData)) return;
  asteroidData.forEach((group) => {
    if (group?.beltId) {
      unregisterWorkerBelt(group.beltId);
    }
  });
}

export function cleanupAsteroidBelt(belt) {
  if (!belt?.userData || belt.userData.workerBeltsReleased) return;
  unregisterAsteroidBelts(belt.userData.asteroidData);
  belt.userData.workerBeltsReleased = true;
}
