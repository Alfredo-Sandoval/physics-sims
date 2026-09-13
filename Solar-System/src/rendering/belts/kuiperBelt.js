// --- Kuiper Belt Module ---------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "../../core/config.js";
import { getSimulatedDays } from "../../core/state.js";
import {
  registerWorkerBelt,
  requestWorkerBeltUpdate,
  unregisterWorkerBelt,
} from "../../simulation/beltWorkerClient.js";

const TWO_PI = Math.PI * 2;

function normalizeAngle(angleRadians) {
  const wrapped = angleRadians % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/**
 * Create a realistic Kuiper Belt with:
 * - Individual Keplerian orbits for each Kuiper Belt object
 * - Named dwarf planets (Pluto, Eris, Makemake, Haumea)
 * - Ice and rock composition-based materials
 * - More spread out than asteroid belt
 */
export function createKuiperBelt(scene, loader) {
  if (!CONSTANTS.KUIPER_BELT_ENABLED) return null;

  const belt = new THREE.Group();
  belt.name = "KuiperBelt";
  scene.add(belt);

  // Scene-unit ranges
  const innerR = CONSTANTS.KUIPER_BELT_INNER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const outerR = CONSTANTS.KUIPER_BELT_OUTER_RADIUS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;
  const thick = CONSTANTS.KUIPER_BELT_THICKNESS_AU * CONSTANTS.ORBIT_SCALE_FACTOR;

  // Device-based scaling
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const CORES = (navigator && navigator.hardwareConcurrency) || 4;
  const deviceScale = (CORES >= 8 ? 1.0 : 0.6) * (DPR > 1.5 ? 0.85 : 1.0);
  const TARGET_COUNT = Math.max(300, Math.floor(CONSTANTS.KUIPER_COUNT * deviceScale));

  // Composition-based materials (icy and rocky, no shadows)
  // Icy composition (most common in Kuiper Belt)
  const icyMaterial = new THREE.MeshStandardMaterial({
    color: CONSTANTS.KUIPER_COLOR_ICE,
    roughness: 0.85,
    metalness: 0.02,
    flatShading: false,
    side: THREE.DoubleSide,
  });

  // Rocky composition (less common)
  const rockyMaterial = new THREE.MeshStandardMaterial({
    color: CONSTANTS.KUIPER_COLOR_ROCK,
    roughness: 0.95,
    metalness: 0.01,
    flatShading: false,
    side: THREE.DoubleSide,
  });

  const materials = [icyMaterial, rockyMaterial];
  materials.forEach((m) => {
    m.vertexColors = true;
    m.userData.castShadow = false;
    m.userData.receiveShadow = false;
  });

  // Create deformed geometries for variety (more irregular for distant objects)
  function createDeformedGeometry(baseType, detail) {
    let geom;
    if (baseType === "icosahedron") {
      geom = new THREE.IcosahedronGeometry(1, detail);
    } else if (baseType === "dodecahedron") {
      geom = new THREE.DodecahedronGeometry(1, detail);
    } else {
      geom = new THREE.TetrahedronGeometry(1, detail);
    }

    // Deform vertices randomly for irregular asteroid shape (more deformation for distant objects)
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

      // Add random deformation (craters and bumps) - more irregular than asteroids
      const deform = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
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
  const sampleBiased = (min, max, power = 2.1) =>
    min + (max - min) * Math.pow(Math.random(), power);

  // Sample radius with mid-belt bias (Kuiper Belt is more spread out)
  function sampleRadius() {
    const r0 = innerR / CONSTANTS.ORBIT_SCALE_FACTOR; // in AU
    const r1 = outerR / CONSTANTS.ORBIT_SCALE_FACTOR;

    // More uniform distribution than asteroid belt
    return r0 + (r1 - r0) * Math.pow(Math.random(), 0.8);
  }

  // Generate orbital parameters for a Kuiper Belt object
  function generateOrbitalParams() {
    const a = sampleRadius(); // semi-major axis in AU
    const e = THREE.MathUtils.randFloat(0, 0.25); // higher eccentricity possible
    const i = THREE.MathUtils.randFloat(0, 0.5); // higher inclination possible
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
  const kboData = [];

  // Distribute Kuiper Belt objects by composition
  const icyCount = Math.floor(TARGET_COUNT * 0.85); // 85% icy
  const rockyCount = TARGET_COUNT - icyCount;

  const compositionalGroups = [
    { material: icyMaterial, count: icyCount },
    { material: rockyMaterial, count: rockyCount },
  ];

  let totalInstances = 0;

  // Create instanced meshes for each composition type
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

      const baseSize =
        sampleBiased(CONSTANTS.KUIPER_MIN_SIZE, CONSTANTS.KUIPER_MAX_SIZE, 2.4) *
        CONSTANTS.KUIPER_VISUAL_SCALE;
      const elong = THREE.MathUtils.randFloat(0.5, 1.8); // More irregular shapes
      scale.set(baseSize, baseSize * elong, baseSize * THREE.MathUtils.randFloat(0.6, 1.4));

      const quat = new THREE.Quaternion().setFromEuler(rotation);
      matrix.compose(pos, quat, scale);
      inst.setMatrixAt(i, matrix);
      color.copy(material.color).multiplyScalar(THREE.MathUtils.randFloat(0.85, 1.15));
      inst.setColorAt(i, color);

      workerInstances.push({
        orbitalParams,
        rotation: [rotation.x, rotation.y, rotation.z],
        rotationSpeed: [
          THREE.MathUtils.randFloat(-0.005, 0.005),
          THREE.MathUtils.randFloat(-0.005, 0.005),
          THREE.MathUtils.randFloat(-0.005, 0.005),
        ],
        scale: [scale.x, scale.y, scale.z],
      });
    }

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    belt.add(inst);

    const beltId = `kuiper-${inst.uuid}`;

    registerWorkerBelt({
      beltId,
      orbitScaleFactor: CONSTANTS.ORBIT_SCALE_FACTOR,
      instances: workerInstances,
      onMatrices: (matrixArray) => {
        inst.instanceMatrix.array.set(matrixArray);
        inst.instanceMatrix.needsUpdate = true;
      },
    });

    kboData.push({
      mesh: inst,
      beltId,
      count,
    });

    totalInstances += count;
  });

  // Create named dwarf planets
  const namedKBObjects = createNamedKBObjects(scene, belt);

  // Store data for updates
  belt.userData.kboData = kboData;
  belt.userData.namedKBObjects = namedKBObjects;
  belt.userData.materials = materials;
  const previousDispose =
    typeof belt.userData.dispose === "function" ? belt.userData.dispose.bind(belt.userData) : null;
  belt.userData.dispose = () => {
    if (previousDispose) {
      previousDispose();
    }
    cleanupKuiperBelt(belt);
  };
  belt.userData.cleanup = belt.userData.dispose;

  console.log(`[KuiperBelt] Created ${belt.children.length} groups`);
  console.log(`[KuiperBelt] Named objects: ${namedKBObjects.length}`);
  console.log(`[KuiperBelt] Total instances: ${totalInstances}`);

  return belt;
}

// Create the major Kuiper Belt objects as separate objects
function createNamedKBObjects(scene, belt) {
  const namedKBObjects = [];

  // Data: name, semi-major axis (AU), size multiplier, color, type
  const majorKBObjects = [
    {
      name: "Pluto",
      a: 39.5,
      size: 1.2,
      color: 0xe6f3ff,
      type: "Dwarf Planet",
      diameter: "2376 km",
      composition: "Icy rock with nitrogen atmosphere",
    },
    {
      name: "Eris",
      a: 67.7,
      size: 1.1,
      color: 0xf0f8ff,
      type: "Dwarf Planet",
      diameter: "2326 km",
      composition: "Icy surface with methane frost",
    },
    {
      name: "Makemake",
      a: 45.8,
      size: 0.9,
      color: 0xe0f0ff,
      type: "Dwarf Planet",
      diameter: "1430 km",
      composition: "Icy body with methane and nitrogen",
    },
    {
      name: "Haumea",
      a: 43.3,
      size: 0.8,
      color: 0xe8f4ff,
      type: "Dwarf Planet",
      diameter: "1632×1506×996 km",
      composition: "Elongated icy body with water ice",
    },
  ];

  majorKBObjects.forEach((data) => {
    const geom = new THREE.IcosahedronGeometry(1, 2);
    const material = new THREE.MeshStandardMaterial({
      color: data.color,
      roughness: 0.8,
      metalness: 0.03,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    material.userData.castShadow = false;
    material.userData.receiveShadow = false;

    const mesh = new THREE.Mesh(geom, material);
    mesh.scale.setScalar(data.size * CONSTANTS.KUIPER_VISUAL_SCALE);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = data.name;
    mesh.userData.type = "dwarf_planet";
    mesh.userData.config = {
      name: data.name,
      info: {
        diameter: data.diameter,
        type: data.type,
        composition: data.composition,
      },
    };

    // Orbital parameters (simplified)
    const orbitalParams = {
      a: data.a,
      e: 0.2 + Math.random() * 0.3, // High eccentricity typical of KBOs
      i: Math.random() * 0.5, // Inclination
      Omega: Math.random() * Math.PI * 2,
      omega: Math.random() * Math.PI * 2,
      M0: Math.random() * Math.PI * 2,
      T: Math.sqrt(data.a * data.a * data.a) * 365.25,
    };

    mesh.userData.orbitalParams = orbitalParams;

    belt.add(mesh);
    namedKBObjects.push(mesh);
  });

  return namedKBObjects;
}

export function updateKuiperBelt(belt, deltaTime) {
  if (!belt || !belt.userData) return;
  if (belt.visible === false) return;

  const kboData = belt.userData.kboData;
  const namedKBObjects = belt.userData.namedKBObjects;
  const simulatedDays = getSimulatedDays() || 0;

  if (!kboData) return;

  kboData.forEach((group) => {
    const { mesh, beltId } = group;
    mesh.visible = true;
    requestWorkerBeltUpdate(beltId, simulatedDays, deltaTime);
  });

  // Update named KBOs
  if (namedKBObjects) {
    namedKBObjects.forEach((kbo) => {
      kbo.visible = true;
      const params = kbo.userData.orbitalParams;
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

      kbo.position.set(
        x * CONSTANTS.ORBIT_SCALE_FACTOR,
        y * CONSTANTS.ORBIT_SCALE_FACTOR,
        z * CONSTANTS.ORBIT_SCALE_FACTOR
      );

      // Very slow rotation for distant objects
      kbo.rotation.y += 0.0005 * deltaTime;
    });
  }
}

function unregisterKuiperBelts(kboData) {
  if (!Array.isArray(kboData)) return;
  kboData.forEach((group) => {
    if (group?.beltId) {
      unregisterWorkerBelt(group.beltId);
    }
  });
}

export function cleanupKuiperBelt(belt) {
  if (!belt?.userData || belt.userData.workerBeltsReleased) return;
  unregisterKuiperBelts(belt.userData.kboData);
  belt.userData.workerBeltsReleased = true;
}
