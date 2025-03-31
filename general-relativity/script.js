// --- Imports ---
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Constants and Configuration ---
const SUN_RADIUS = 25;  // Sun radius
const ORBIT_LINE_COLOR = 0x444444;
const SELECTED_HIGHLIGHT_COLOR = 0x00ffff;
const ORBIT_SCALE_FACTOR = 120; // Base orbital scale factor
const MOON_ORBIT_SCALE = 5; // Scale factor for moon orbits (now fixed)
const MOON_SIZE_SCALE = 0.8; // Moons appear slightly smaller than they should be for visibility

// Texture URLs
const TEXTURE_URLS = {
  sun: 'textures/sun.jpg',
  mercury: 'textures/mercury.jpg',
  venus: 'textures/venus.jpg',
  earth: 'textures/earth.jpg',
  earth_clouds: 'textures/earth_clouds.jpg',
  earth_night: 'textures/earth_night.jpg',
  moon: 'textures/moon.jpg',
  mars: 'textures/mars.jpg',
  jupiter: 'textures/jupiter.jpg',
  io: 'textures/io.jpg',
  europa: 'textures/europa.jpg',
  ganymede: 'textures/ganymede.jpg',
  callisto: 'textures/callisto.jpg',
  saturn: 'textures/saturn.jpg',
  saturn_ring: 'textures/saturn_ring.png',
  titan: 'textures/titan.jpg',
  uranus: 'textures/uranus.jpg',
  neptune: 'textures/neptune.jpg',
  triton: 'textures/triton.jpg'
};

// Planet and moon configurations
const planetConfigs = [
  {
    name: "Mercury",
    actualRadius: 0.383, // Kept for info panel and moon calculations if needed elsewhere
    scaledRadius: 2.5,   // Used for visual representation
    textureUrl: TEXTURE_URLS.mercury,
    orbitRadiusAU: 0.387,
    baseOrbitSpeedFactor: 1 / 0.241,
    gravityStrength: 0.38,
    initialAngle: 0,
    rotationPeriod: 58.6,
    axialTilt: 0.03,
    atmosphere: { exists: false },
    moons: [],
    info: {
      Mass: "0.055 Earths",
      Composition: "Rocky planet with iron core",
      SurfaceTemp: "-173°C to 427°C",
      RotationPeriod: "58.6 Earth days",
      OrbitalPeriod: "88 Earth days",
      Distance: "0.39 AU from Sun"
    }
  },
  {
    name: "Venus",
    actualRadius: 0.949,
    scaledRadius: 4,
    textureUrl: TEXTURE_URLS.venus,
    orbitRadiusAU: 0.723,
    baseOrbitSpeedFactor: 1 / 0.615,
    gravityStrength: 0.91,
    initialAngle: Math.PI / 4,
    rotationPeriod: -243,
    axialTilt: 177.3,
    atmosphere: {
      exists: true,
      color: 0xfff7d6,
      density: 0.7
    },
    moons: [],
    info: {
      Mass: "0.815 Earths",
      Composition: "Rocky planet with thick CO₂ atmosphere",
      SurfaceTemp: "462°C (hottest planet)",
      RotationPeriod: "243 Earth days (retrograde)",
      OrbitalPeriod: "225 Earth days",
      Distance: "0.72 AU from Sun"
    }
  },
  {
    name: "Earth",
    actualRadius: 1.0,
    scaledRadius: 4.2,
    textureUrl: TEXTURE_URLS.earth,
    cloudTextureUrl: TEXTURE_URLS.earth_clouds,
    nightTextureUrl: TEXTURE_URLS.earth_night,
    orbitRadiusAU: 1.0,
    baseOrbitSpeedFactor: 1 / 1.0,
    gravityStrength: 1.0,
    initialAngle: Math.PI / 2,
    rotationPeriod: 1.0,
    axialTilt: 23.4,
    atmosphere: {
      exists: true,
      color: 0x6b8cff,
      density: 0.3
    },
    moons: [
      {
        name: "Moon",
        actualRadius: 0.273, // Used for moon size calculation
        orbitRadiusKm: 384400,
        orbitalPeriod: 27.3,
        rotationPeriod: 27.3,
        textureUrl: TEXTURE_URLS.moon
      }
    ],
    info: {
      Mass: "1.0 Earths (5.97×10²⁴ kg)",
      Composition: "Rocky planet with nitrogen-oxygen atmosphere",
      SurfaceTemp: "-88°C to 58°C",
      RotationPeriod: "24 hours",
      OrbitalPeriod: "365.25 days",
      Distance: "1.0 AU from Sun",
      Moons: "1 (Luna)"
    }
  },
  {
    name: "Mars",
    actualRadius: 0.532,
    scaledRadius: 3,
    textureUrl: TEXTURE_URLS.mars,
    orbitRadiusAU: 1.524,
    baseOrbitSpeedFactor: 1 / 1.881,
    gravityStrength: 0.38,
    initialAngle: 3 * Math.PI / 4,
    rotationPeriod: 1.03,
    axialTilt: 25.2,
    atmosphere: {
      exists: true,
      color: 0xd09470,
      density: 0.1
    },
    moons: [], // Phobos/Deimos too small to render effectively with current logic
    info: {
      Mass: "0.107 Earths",
      Composition: "Rocky planet with thin CO₂ atmosphere",
      SurfaceTemp: "-153°C to 20°C",
      RotationPeriod: "24.6 hours",
      OrbitalPeriod: "687 Earth days",
      Distance: "1.52 AU from Sun",
      Moons: "2 (Phobos, Deimos) - too small to show at scale"
    }
  },
  {
    name: "Jupiter",
    actualRadius: 11.209,
    scaledRadius: 10,
    textureUrl: TEXTURE_URLS.jupiter,
    orbitRadiusAU: 5.203,
    baseOrbitSpeedFactor: 1 / 11.86,
    gravityStrength: 2.53,
    initialAngle: Math.PI,
    rotationPeriod: 0.41,
    axialTilt: 3.1,
    atmosphere: {
      exists: true,
      color: 0xf0e8d8,
      density: 0.5
    },
    moons: [
      {
        name: "Io",
        actualRadius: 0.286,
        orbitRadiusKm: 421800,
        orbitalPeriod: 1.77,
        rotationPeriod: 1.77,
        textureUrl: TEXTURE_URLS.io
      },
      {
        name: "Europa",
        actualRadius: 0.245,
        orbitRadiusKm: 671100,
        orbitalPeriod: 3.55,
        rotationPeriod: 3.55,
        textureUrl: TEXTURE_URLS.europa
      },
      {
        name: "Ganymede",
        actualRadius: 0.413,
        orbitRadiusKm: 1070400,
        orbitalPeriod: 7.15,
        rotationPeriod: 7.15,
        textureUrl: TEXTURE_URLS.ganymede
      },
      {
        name: "Callisto",
        actualRadius: 0.378,
        orbitRadiusKm: 1882700,
        orbitalPeriod: 16.69,
        rotationPeriod: 16.69,
        textureUrl: TEXTURE_URLS.callisto
      }
    ],
    info: {
      Mass: "317.8 Earths",
      Composition: "Gas giant (hydrogen, helium)",
      Temperature: "-108°C (cloud tops)",
      RotationPeriod: "9.9 hours (fastest)",
      OrbitalPeriod: "11.86 Earth years",
      Distance: "5.2 AU from Sun",
      Moons: "79+ (4 large Galilean moons shown)"
    }
  },
  {
    name: "Saturn",
    actualRadius: 9.449,
    scaledRadius: 8.5,
    textureUrl: TEXTURE_URLS.saturn,
    ringTextureUrl: TEXTURE_URLS.saturn_ring,
    orbitRadiusAU: 9.539,
    baseOrbitSpeedFactor: 1 / 29.46,
    gravityStrength: 1.07,
    initialAngle: 5 * Math.PI / 4,
    rotationPeriod: 0.45,
    axialTilt: 26.7,
    ringTilt: 26.7, // Tilt for the rings
    atmosphere: {
      exists: true,
      color: 0xf0e6d2,
      density: 0.4
    },
    moons: [
      {
        name: "Titan",
        actualRadius: 0.404,
        orbitRadiusKm: 1221870,
        orbitalPeriod: 15.95,
        rotationPeriod: 15.95,
        textureUrl: TEXTURE_URLS.titan,
        atmosphere: { exists: true, color: 0xffa500, density: 0.3 } // Titan's atmosphere
      }
    ],
    info: {
      Mass: "95.2 Earths",
      Composition: "Gas giant (hydrogen, helium) with iconic rings",
      Temperature: "-139°C (cloud tops)",
      RotationPeriod: "10.7 hours",
      OrbitalPeriod: "29.5 Earth years",
      Distance: "9.5 AU from Sun",
      Moons: "82+ (Titan shown - only moon with thick atmosphere)"
    }
  },
  {
    name: "Uranus",
    actualRadius: 4.007,
    scaledRadius: 6,
    textureUrl: TEXTURE_URLS.uranus,
    orbitRadiusAU: 19.191,
    baseOrbitSpeedFactor: 1 / 84.01,
    gravityStrength: 0.89,
    initialAngle: 3 * Math.PI / 2,
    rotationPeriod: -0.72,
    axialTilt: 97.8, // Extreme tilt
    atmosphere: {
      exists: true,
      color: 0xd1e7e7,
      density: 0.3
    },
    moons: [],
    info: {
      Mass: "14.5 Earths",
      Composition: "Ice giant (hydrogen, helium, methane)",
      Temperature: "-197°C",
      RotationPeriod: "17.2 hours (retrograde)",
      OrbitalPeriod: "84 Earth years",
      Distance: "19.2 AU from Sun",
      Moons: "27 (none shown at this scale)",
      UniqueFeature: "97.8° axial tilt (rotates sideways)"
    }
  },
  {
    name: "Neptune",
    actualRadius: 3.883,
    scaledRadius: 6,
    textureUrl: TEXTURE_URLS.neptune,
    orbitRadiusAU: 30.069,
    baseOrbitSpeedFactor: 1 / 164.8,
    gravityStrength: 1.14,
    initialAngle: 7 * Math.PI / 4,
    rotationPeriod: 0.67,
    axialTilt: 28.3,
    atmosphere: {
      exists: true,
      color: 0x4b70dd,
      density: 0.3
    },
    moons: [
      {
        name: "Triton",
        actualRadius: 0.212,
        orbitRadiusKm: 354759,
        orbitalPeriod: -5.88, // Retrograde orbit
        rotationPeriod: 5.88, // Tidally locked, but orbit is retrograde
        textureUrl: TEXTURE_URLS.triton
      }
    ],
    info: {
      Mass: "17.1 Earths",
      Composition: "Ice giant (hydrogen, helium, methane)",
      Temperature: "-201°C",
      RotationPeriod: "16.1 hours",
      OrbitalPeriod: "165 Earth years",
      Distance: "30.1 AU from Sun",
      Moons: "14 (Triton shown - has retrograde orbit)"
    }
  }
];

// --- Global Variables ---
let scene, camera, renderer, controls, clock, textureLoader, raycaster, pointer;
let sunMesh, planets = [], moonGroups = [];
// Removed useScaledSize variable
let simulationSpeed = 1, gravityModifier = 1;
let selectedObject = null;
let originalMaterials = new Map();
const highlightMaterial = new THREE.MeshBasicMaterial({ color: SELECTED_HIGHLIGHT_COLOR, wireframe: true });

// Simulation time tracker
let simulatedDays = 0;

// --- DOM Elements ---
const infoPanel = document.getElementById('info');
const infoName = document.getElementById('info-name');
const infoOrbit = document.getElementById('info-orbit');
const infoSize = document.getElementById('info-size');
const speedValueSpan = document.getElementById('speedValue');
const gravityValueSpan = document.getElementById('gravityValue');
// Extended info element
const infoDetails = document.getElementById('info-details') || document.createElement('div');
if (!document.getElementById('info-details')) {
  infoDetails.id = 'info-details';
  infoPanel.appendChild(infoDetails);
}

// --- Initialization ---
function init() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
  camera.position.set(150, 100, 150);

  // Renderer with better settings for visual quality
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
  renderer.physicallyCorrectLights = true; // Enable physically correct lighting
  renderer.outputEncoding = THREE.sRGBEncoding; // Better color reproduction
  document.body.appendChild(renderer.domElement);

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 30;
  controls.maxDistance = 1500;
  controls.target.set(0, 0, 0);

  // Clock, texture loader, raycaster, pointer
  clock = new THREE.Clock();
  textureLoader = new THREE.TextureLoader();
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // Set up improved lighting
  setupLighting();

  // Create objects
  createStarfield();
  createSun();
  createPlanetsAndOrbits(); // This now uses the fixed scaled size

  // Set up event listeners
  setupEventListeners(); // Event listeners for size mode removed from here

  // Start animation loop
  animate();

  // Remove any existing toggle button (if present) - keeping this as it was in original
  const toggleButton = document.getElementById('toggleMeshBtn');
  if (toggleButton) {
    toggleButton.remove();
  }
}

// --- Improved Lighting System ---
function setupLighting() {
  // Very low ambient light for dramatic contrast
  const ambientLight = new THREE.AmbientLight(0x111111, 0.15);
  scene.add(ambientLight);

  // Main sun light - brighten it significantly
  const sunLight = new THREE.PointLight(0xffffee, 5, 0, 1);
  sunLight.position.set(0, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 5000;
  scene.add(sunLight);

  // Secondary sun glow light (no shadows, just illumination)
  const sunGlowLight = new THREE.PointLight(0xffddaa, 2, 200, 1.5);
  sunGlowLight.position.set(0, 0, 0);
  scene.add(sunGlowLight);

  // Directional light to simulate distant star light
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
  dirLight.position.set(1, 0.5, 0.5).normalize();
  scene.add(dirLight);

  // Subtle hemisphere light for fill
  const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.2);
  scene.add(hemiLight);
}

// --- Improved Material Creation ---
function createImprovedPlanetMaterial(textureUrl) {
  const texture = textureLoader.load(textureUrl);

  // Standard material with better light response settings
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.7,      // Slightly rougher for better light diffusion
    metalness: 0.1,      // Low metalness for terrestrial planets
    envMapIntensity: 0.5 // Softer environment reflections
  });
}

// --- Object Creation Functions ---
function createStarfield() {
  const STAR_COUNT = 15000; // More stars for better visibility
  const starVertices = [];

  // Generate random stars distributed throughout space
  for (let i = 0; i < STAR_COUNT; i++) {
    const x = THREE.MathUtils.randFloatSpread(6000);
    const y = THREE.MathUtils.randFloatSpread(6000);
    const z = THREE.MathUtils.randFloatSpread(6000);
    starVertices.push(x, y, z);
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));

  // Create a simple point material that looks like stars
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.0,
    sizeAttenuation: true
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
}

function createSun() {
  // Simple sun with texture
  const sunTexture = textureLoader.load(TEXTURE_URLS.sun);
  const sunGeometry = new THREE.SphereGeometry(SUN_RADIUS, 64, 32);
  const sunMaterial = new THREE.MeshBasicMaterial({
    map: sunTexture,
    color: 0xffddaa // Add a bit of color tint
  });
  sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  sunMesh.userData.isSelectable = true;
  sunMesh.userData.name = "Sun";
  sunMesh.userData.info = {
    Mass: "333,000 Earths",
    Composition: "Hydrogen (73%), Helium (25%), other elements (2%)",
    Temperature: "5,500°C (surface), 15,000,000°C (core)",
    RotationPeriod: "25-35 days (varies by latitude)",
    Diameter: "109 Earths",
    Type: "G-type main-sequence star (G2V)",
    Age: "~4.6 billion years"
  };

  scene.add(sunMesh);
}

function createPlanetsAndOrbits() {
  const baseOrbitScale = ORBIT_SCALE_FACTOR;

  planetConfigs.forEach(config => {
    const orbitRadius = config.orbitRadiusAU * baseOrbitScale;
    // calculateDisplayRadius is now simplified and always uses scaledRadius
    const displayRadius = calculateDisplayRadius(config);

    // Create group for planet, atmosphere, and moons
    const planetGroup = new THREE.Group();
    planetGroup.userData = {
      isSelectable: true,
      name: config.name,
      type: 'planet',
      info: config.info // Store reference to detailed info
    };

    // Create planet mesh using improved material
    const planetGeometry = new THREE.SphereGeometry(displayRadius, 32, 16);
    const planetMaterial = createImprovedPlanetMaterial(config.textureUrl);
    const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
    planetMesh.castShadow = true;
    planetMesh.receiveShadow = true;

    // Add atmosphere if applicable
    if (config.atmosphere && config.atmosphere.exists) {
      const atmoRadius = displayRadius * 1.05;
      const atmoGeometry = new THREE.SphereGeometry(atmoRadius, 32, 16);
      const atmoMaterial = new THREE.MeshBasicMaterial({
        color: config.atmosphere.color,
        transparent: true,
        opacity: config.atmosphere.density * 0.3, // Adjust opacity as needed
        side: THREE.BackSide // Render inside for effect
      });
      const atmosphereMesh = new THREE.Mesh(atmoGeometry, atmoMaterial);
      planetGroup.add(atmosphereMesh);
    }

    // Special handling for Earth clouds
    if (config.name === "Earth" && config.cloudTextureUrl) {
      const cloudGeometry = new THREE.SphereGeometry(displayRadius * 1.02, 32, 16);
      const cloudTexture = textureLoader.load(config.cloudTextureUrl);
      const cloudMaterial = new THREE.MeshStandardMaterial({ // Use Standard for light interaction
        map: cloudTexture,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide // Render both sides
      });
      const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
      planetGroup.add(cloudMesh);

      // Store cloud mesh for rotation animation
      planetMesh.userData.cloudMesh = cloudMesh; // Attach to planet mesh's data
    }

    // Apply axial tilt to the planet mesh itself within the group
    if (config.axialTilt) {
      const tiltRadians = config.axialTilt * (Math.PI / 180);
      // We rotate the mesh, not the group, so orbit isn't affected by tilt
      planetMesh.rotation.order = 'YXZ'; // Set rotation order if needed
      planetMesh.rotation.z = tiltRadians; // Tilt around Z-axis relative to its orbit path
    }

    // Special handling for Saturn's rings
    if (config.ringTextureUrl) {
      const innerRadius = displayRadius * 1.2;
      const outerRadius = displayRadius * 2.5;
      const ringGeometry = new THREE.RingGeometry(innerRadius, outerRadius, 64);
      const ringTexture = textureLoader.load(config.ringTextureUrl);

      // Adjust UV mapping for proper texture display
      const uvs = ringGeometry.attributes.uv.array;
      const phiSegments = ringGeometry.parameters.phiSegments;
      const thetaSegments = ringGeometry.parameters.thetaSegments;
      for (let i = 0; i < phiSegments + 1; i++) {
        for (let j = 0; j < thetaSegments + 1; j++) {
          const idx = (i * (thetaSegments + 1) + j) * 2;
          // Correct UV mapping for ring geometry
          const radius = innerRadius + (outerRadius - innerRadius) * (i / phiSegments);
          uvs[idx] = j / thetaSegments; // Maps theta angle to U
          uvs[idx + 1] = (radius - innerRadius) / (outerRadius - innerRadius); // Maps radius to V
        }
      }
      ringGeometry.attributes.uv.needsUpdate = true; // Flag UVs as updated

      const ringMaterial = new THREE.MeshStandardMaterial({
        map: ringTexture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        roughness: 0.8, // Rings aren't perfectly smooth
        metalness: 0.1
      });

      const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
      ringMesh.rotation.x = Math.PI / 2; // Orient rings horizontally initially

      // Apply ring tilt relative to the planet's tilt (often similar)
      if (config.ringTilt) {
         const ringTiltRadians = config.ringTilt * (Math.PI / 180);
         // Apply tilt - assuming tilt axis is consistent with planet's axial tilt axis
         ringMesh.rotation.z += ringTiltRadians; // Adjust tilt axis if needed
      }


      ringMesh.castShadow = true;
      ringMesh.receiveShadow = true;
      planetGroup.add(ringMesh); // Add rings to the planet's group
    }


    // Add the planet mesh to the group
    planetGroup.add(planetMesh);

    // Position planet group at its orbital location
    const angle = config.initialAngle;
    planetGroup.position.set(
      orbitRadius * Math.cos(angle),
      0,
      orbitRadius * Math.sin(angle)
    );

    // Store rotation and orbit data in the GROUP's userData
    planetGroup.userData.orbitRadius = orbitRadius;
    planetGroup.userData.orbitSpeed = (2 * Math.PI / 60) * config.baseOrbitSpeedFactor; // Speed relative to Earth's 60s = 1 year
    planetGroup.userData.initialAngle = config.initialAngle;
    planetGroup.userData.currentAngle = config.initialAngle;
    // Use Earth days for rotation speed calculation consistency
    planetGroup.userData.rotationSpeed = (2 * Math.PI) / (Math.abs(config.rotationPeriod) * 24 * 60); // Radians per simulation second at 1x speed
    planetGroup.userData.rotationDirection = config.rotationPeriod >= 0 ? 1 : -1;
    planetGroup.userData.planetMesh = planetMesh; // Keep reference if needed
    if (config.axialTilt) {
        planetGroup.userData.axialTilt = config.axialTilt * (Math.PI / 180);
    }


    scene.add(planetGroup);

    // Store planet data (including group and mesh)
     const planetData = {
         group: planetGroup,
         mesh: planetMesh,
         config: config,
         orbitRadius: orbitRadius,
         currentRadius: displayRadius // Store the radius used
     };
    planets.push(planetData);


    // Create moon systems if defined
    if (config.moons && config.moons.length > 0) {
      // Pass planet's display radius for moon calculations
      const moonSystem = createMoonSystem(config, planetGroup, displayRadius);
      moonGroups.push(moonSystem);
    }

    // Draw orbit line
    const orbitPoints = [];
    const segments = 128; // Increased segments for smoother orbits
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      orbitPoints.push(new THREE.Vector3(
        orbitRadius * Math.cos(theta),
        0,
        orbitRadius * Math.sin(theta)
      ));
    }

    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMaterial = new THREE.LineBasicMaterial({
      color: ORBIT_LINE_COLOR,
      transparent: true,
      opacity: 0.5 // Slightly more visible orbits
    });

    const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
    scene.add(orbitLine);
  });
}


// Create moon systems for planets with moons
function createMoonSystem(planetConfig, planetGroup, planetRadius) {
  const moonSystem = new THREE.Group(); // Group for all moons of this planet
  moonSystem.userData.parentPlanet = planetConfig.name;

  planetConfig.moons.forEach(moonConfig => {
      // --- Use fixed scale factor for orbits ---
      const fixedScaleFactor = MOON_ORBIT_SCALE; // Use constant
      // Calculate orbit radius relative to planet radius and scaled distance
      let orbitRadius = (moonConfig.orbitRadiusKm / 100000) * fixedScaleFactor + planetRadius * 1.5; // Adjusted scaling factor for KM distance

      let moonRadius;
      // --- Use fixed calculation for moon radius (based on original scaled logic) ---
      // Calculate moon radius relative to the parent planet's DISPLAY radius and moon's actual relative size
      moonRadius = planetRadius * (moonConfig.actualRadius * MOON_SIZE_SCALE); // Apply general moon scale down
      moonRadius = Math.max(moonRadius, 0.5); // Ensure minimum size for visibility

      // Create moon mesh using improved material
      const moonGeometry = new THREE.SphereGeometry(moonRadius, 16, 12);
      const moonMaterial = createImprovedPlanetMaterial(moonConfig.textureUrl);

      const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
      moonMesh.castShadow = true;
      moonMesh.receiveShadow = true;

      // Add atmosphere for moons that have one (like Titan)
      if (moonConfig.atmosphere && moonConfig.atmosphere.exists) {
          const atmoRadius = moonRadius * 1.1; // Slightly larger than moon
          const atmoGeometry = new THREE.SphereGeometry(atmoRadius, 16, 12);
          const atmoMaterial = new THREE.MeshBasicMaterial({
              color: moonConfig.atmosphere.color,
              transparent: true,
              opacity: moonConfig.atmosphere.density * 0.4,
              side: THREE.BackSide
          });
          const atmosphereMesh = new THREE.Mesh(atmoGeometry, atmoMaterial);
          moonMesh.add(atmosphereMesh); // Add atmosphere directly to moon mesh
      }

      // --- Moon Positioning and Orbit Data ---
      const moonOrbitContainer = new THREE.Group(); // Container for moon and its orbit line

      const initialAngle = Math.random() * Math.PI * 2; // Randomize starting position
      // Position the moon MESH relative to the moonOrbitContainer center
      moonMesh.position.set(
          orbitRadius * Math.cos(initialAngle),
          0,
          orbitRadius * Math.sin(initialAngle)
      );

      // Store data specific to this moon in its MESH userData
      moonMesh.userData = {
          isSelectable: true,
          name: moonConfig.name,
          parentPlanet: planetConfig.name,
          orbitRadius: orbitRadius,
          initialAngle: initialAngle,
          currentAngle: initialAngle,
          // Calculate orbit speed based on its period in Earth days
          orbitSpeed: (2 * Math.PI) / (Math.abs(moonConfig.orbitalPeriod) * 24 * 60), // Radians per simulation second at 1x
          orbitDirection: moonConfig.orbitalPeriod >= 0 ? 1 : -1,
          // Calculate rotation speed based on its period
          rotationSpeed: (2 * Math.PI) / (Math.abs(moonConfig.rotationPeriod) * 24 * 60), // Radians per simulation second at 1x
          rotationDirection: moonConfig.rotationPeriod >= 0 ? 1 : -1,
          // Pre-format info for the panel
          info: {
              // Use actualRadius relative to Earth's radius (approx 6371 km)
              Size: `${(moonConfig.actualRadius * 6371).toFixed(0)} km radius`,
              Orbit: `${moonConfig.orbitRadiusKm.toLocaleString()} km from ${planetConfig.name}`,
              OrbitalPeriod: `${Math.abs(moonConfig.orbitalPeriod).toFixed(2)} days ${moonConfig.orbitalPeriod < 0 ? '(retrograde)' : ''}`,
              // Assume tidal locking if rotation/orbital periods match (or based on real data)
              RotationPeriod: `${Math.abs(moonConfig.rotationPeriod).toFixed(2)} days ${moonConfig.rotationPeriod === moonConfig.orbitalPeriod ? '(tidally locked)' : ''}`,
              ParentPlanet: planetConfig.name
          }
      };

      // --- Create Moon Orbit Line ---
      const moonOrbitPoints = [];
      const segments = 64; // Smoother orbit line
      for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          moonOrbitPoints.push(new THREE.Vector3(
              orbitRadius * Math.cos(theta),
              0,
              orbitRadius * Math.sin(theta)
          ));
      }
      const moonOrbitGeometry = new THREE.BufferGeometry().setFromPoints(moonOrbitPoints);
      const moonOrbitMaterial = new THREE.LineBasicMaterial({
          color: 0x555555, // Slightly different color for moon orbits
          transparent: true,
          opacity: 0.3
      });
      const moonOrbitLine = new THREE.Line(moonOrbitGeometry, moonOrbitMaterial);

      // Add moon mesh and orbit line to the container
      moonOrbitContainer.add(moonMesh);
      moonOrbitContainer.add(moonOrbitLine); // Orbit line is relative to the planet center

      // Add this moon's container to the overall moon system group for the planet
      moonSystem.add(moonOrbitContainer);
  });

  // Add the complete moon system (all moons and orbits for this planet) to the planet's group
  planetGroup.add(moonSystem);
  return moonSystem; // Return the group containing all moon containers
}


// --- Update Functions ---
// Simplified: Always calculates scaled radius (or Sun's fixed radius)
function calculateDisplayRadius(config) {
    if (config.name === "Sun") {
        return SUN_RADIUS; // Sun uses fixed radius constant
    } else {
        // Planets use their defined scaledRadius
        return config.scaledRadius;
    }
}

// Removed the updatePlanetSizes function as sizes are now fixed at initialization


function updatePlanetPositions(deltaTime) {
  // Use consistent time factor based on simulation speed
  // deltaTime is seconds passed since last frame
  const timeFactor = deltaTime * simulationSpeed;

  planets.forEach(planetData => {
    const group = planetData.group;
    const orbitRadius = group.userData.orbitRadius;

    // Update angle based on orbit speed (radians per sim second * time passed)
    group.userData.currentAngle += group.userData.orbitSpeed * timeFactor;
    const angle = group.userData.currentAngle;

    // Update group position based on new angle
    group.position.set(
      orbitRadius * Math.cos(angle),
      0,
      orbitRadius * Math.sin(angle)
    );

    // Update moons if they exist (moons orbit relative to the planet group)
    // Find the moonSystem group within the planet's group children
     const moonSystemGroup = group.children.find(child => child.userData.parentPlanet === planetData.config.name);

     if (moonSystemGroup) {
         moonSystemGroup.children.forEach(moonOrbitContainer => {
             // The first child of the container is the moon mesh
             const moonMesh = moonOrbitContainer.children[0];
             if (moonMesh && moonMesh.userData.orbitSpeed) { // Check if it's a valid moon mesh
                 const userData = moonMesh.userData;
                 userData.currentAngle += userData.orbitSpeed * userData.orbitDirection * timeFactor;
                 const moonAngle = userData.currentAngle;
                 const moonOrbitRadius = userData.orbitRadius;

                 // Update moon MESH position relative to the planet center (within its container)
                 moonMesh.position.set(
                     moonOrbitRadius * Math.cos(moonAngle),
                     0,
                     moonOrbitRadius * Math.sin(moonAngle)
                 );
             }
         });
     }

  });
}

function updatePlanetRotations(deltaTime) {
  // Consistent time factor
  const timeFactor = deltaTime * simulationSpeed;

  planets.forEach(planetData => {
    const group = planetData.group;
    const planetMesh = group.userData.planetMesh; // Get the planet mesh itself
    const userData = group.userData; // Get the group's user data

    // Rotate the planet MESH around its local Y-axis (up axis)
    // Rotation speed is radians per simulation second * time passed
    planetMesh.rotateY(userData.rotationSpeed * userData.rotationDirection * timeFactor);

    // Rotate clouds slightly faster if they exist
    if (planetMesh.userData.cloudMesh) {
      planetMesh.userData.cloudMesh.rotateY(
          userData.rotationSpeed * userData.rotationDirection * timeFactor * 1.1 // Cloud differential rotation
      );
    }

     // Rotate moons around their own axes
     const moonSystemGroup = group.children.find(child => child.userData.parentPlanet === planetData.config.name);
     if (moonSystemGroup) {
         moonSystemGroup.children.forEach(moonOrbitContainer => {
             const moonMesh = moonOrbitContainer.children[0];
             if (moonMesh && moonMesh.userData.rotationSpeed) {
                 const moonUserData = moonMesh.userData;
                 moonMesh.rotateY(moonUserData.rotationSpeed * moonUserData.rotationDirection * timeFactor);
             }
         });
     }

  });
}


// --- Interactivity ---
function onPointerMove(event) {
  // Calculate pointer position in normalized device coordinates (-1 to +1)
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onPointerClick(event) {
  // Update the picking ray with the camera and pointer position
  raycaster.setFromCamera(pointer, camera);

  // Calculate objects intersecting the picking ray
  // Pass scene.children and true to check descendants (planets/moons within groups)
  const intersects = raycaster.intersectObjects(scene.children, true);

  let clickedSelectable = null;

  // Iterate through intersects to find the closest selectable object
  for (let i = 0; i < intersects.length; i++) {
    let object = intersects[i].object;
    // Traverse up the hierarchy to find the object with isSelectable=true
    while (object && !clickedSelectable) {
      if (object.userData && object.userData.isSelectable) {
        // We might click a planet mesh, atmosphere, or moon mesh.
        // If it's a moon, we want the moon mesh itself.
        // If it's part of a planet (mesh, cloud, atmosphere, ring), we want the planet's GROUP.
        if (object.userData.parentPlanet) { // It's a moon mesh
             clickedSelectable = object;
        } else {
            // Traverse up until we hit the main planet/sun group or the scene
            let parentGroup = object;
            while (parentGroup.parent && parentGroup.parent !== scene) {
                parentGroup = parentGroup.parent;
            }
             // Ensure we selected a celestial body group, not something else
             if (parentGroup.userData && parentGroup.userData.isSelectable) {
                 clickedSelectable = parentGroup;
             } else if (object === sunMesh && sunMesh.userData.isSelectable) { // Handle direct sun click
                 clickedSelectable = sunMesh;
             }
        }
        break; // Exit the inner while loop once selectable is found
      }
      // Move up only if we haven't found the selectable object yet
       if (!clickedSelectable) object = object.parent;
    }
     if (clickedSelectable) break; // Exit the outer for loop if found
  }


  if (clickedSelectable) {
    // If we clicked the already selected object, maybe deselect or do nothing?
    // Current logic: re-select (updates highlight and info)
    selectObject(clickedSelectable);
  } else {
    // Clicked empty space or a non-selectable object
    deselectObject();
  }
}


function selectObject(object) {
  deselectObject(); // Deselect previous object first

  selectedObject = object; // Store the selected object (could be planet group or moon mesh)

  // --- Apply Highlight ---
  // Need to find the actual MESH to highlight (planet, sun, or moon)
  let meshToHighlight = null;
  if (selectedObject === sunMesh) {
      meshToHighlight = sunMesh;
  } else if (selectedObject.userData.type === 'planet') { // It's a planet group
      meshToHighlight = selectedObject.userData.planetMesh;
  } else if (selectedObject.userData.parentPlanet) { // It's a moon mesh
      meshToHighlight = selectedObject;
  }

  if (meshToHighlight && meshToHighlight.material) {
      // Store original material only if not already highlighted
      if (!originalMaterials.has(meshToHighlight)) {
          originalMaterials.set(meshToHighlight, meshToHighlight.material);
      }
      meshToHighlight.material = highlightMaterial;
  }


  displayObjectInfo(selectedObject); // Display info for the selected object/group
}

function deselectObject() {
  if (selectedObject) {
      // Find the mesh that was highlighted
      let meshToRestore = null;
      if (selectedObject === sunMesh) {
          meshToRestore = sunMesh;
      } else if (selectedObject.userData.type === 'planet') {
          meshToRestore = selectedObject.userData.planetMesh;
      } else if (selectedObject.userData.parentPlanet) {
          meshToRestore = selectedObject;
      }

      // Restore original material if found
      if (meshToRestore && originalMaterials.has(meshToRestore)) {
          meshToRestore.material = originalMaterials.get(meshToRestore);
          originalMaterials.delete(meshToRestore); // Remove from map
      }
  }
  selectedObject = null; // Clear selection reference
  infoPanel.style.display = 'none'; // Hide info panel
}


function displayObjectInfo(object) {
  // object is the selected item (planet group, sun mesh, or moon mesh)
  if (!object || !object.userData) {
    infoPanel.style.display = 'none';
    return;
  }

  const userData = object.userData; // Get data from the GROUP or MESH
  const name = userData.name || 'Unknown Object';
  infoName.textContent = name;

  const isMoon = userData.parentPlanet !== undefined;

  // Clear previous details
  infoDetails.innerHTML = '';

  if (isMoon) {
      // Use pre-formatted info stored in moon mesh userData
      infoOrbit.textContent = userData.info.Orbit || 'Unknown orbit';
      infoSize.textContent = userData.info.Size || 'Unknown size';
      let detailsHTML = `
         <p><strong>Parent Planet:</strong> ${userData.parentPlanet}</p>
         <p><strong>Orbital Period:</strong> ${userData.info.OrbitalPeriod || 'Unknown'}</p>
         <p><strong>Rotation Period:</strong> ${userData.info.RotationPeriod || 'Unknown'}</p>
      `;
      // Add other moon-specific info if available in userData.info
      infoDetails.innerHTML = detailsHTML;

  } else { // It's a planet group or the sun mesh
      // Find the config (for planets) or use sun's direct userData.info
      const config = (userData.name === "Sun") ? null : planetConfigs.find(p => p.name === userData.name);
      const infoSource = (userData.name === "Sun") ? userData.info : (config ? config.info : null);


      if (!infoSource && userData.name !== "Sun") { // Check if config was found for planet
          infoPanel.style.display = 'none';
          return;
      }

      // Display basic Orbit/Size
      if (userData.name === "Sun") {
          infoOrbit.textContent = "Center of Solar System";
          infoSize.textContent = "Radius: ~696,340 km"; // More specific size
      } else if (config) {
          infoOrbit.textContent = `Orbit: ${config.orbitRadiusAU.toFixed(2)} AU from Sun`;
          // Display actual size comparison using actualRadius
          infoSize.textContent = `Radius: ${config.actualRadius.toFixed(3)} × Earth's radius`;
      }

      // Display detailed info from config.info or sunMesh.userData.info
      let detailsHTML = '';
      if (infoSource) {
          for (const [key, value] of Object.entries(infoSource)) {
              detailsHTML += `<p><strong>${key}:</strong> ${value}</p>`;
          }
      }
      infoDetails.innerHTML = detailsHTML;
  }

  infoPanel.style.display = 'block'; // Show the panel
}


// --- Event Listeners Setup ---
function setupEventListeners() {
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('click', onPointerClick);

  // --- Removed Size Mode Radio Button Listeners ---

  document.getElementById('speedSlider').addEventListener('input', (e) => {
    simulationSpeed = parseFloat(e.target.value);
    speedValueSpan.textContent = `${simulationSpeed.toFixed(1)}x`;
  });

  document.getElementById('gravitySlider').addEventListener('input', (e) => {
    gravityModifier = parseFloat(e.target.value);
    gravityValueSpan.textContent = `${gravityModifier.toFixed(1)}x`;
    // Note: gravityModifier is not currently used in the physics calculations.
    // You would need to incorporate it into updatePlanetPositions/Rotations if desired.
  });

  // Remove the spacetime mesh toggle button (keeping as per original code)
  const toggleButton = document.getElementById('toggleMeshBtn');
  if (toggleButton) {
    toggleButton.remove();
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate); // Loop
  const deltaTime = clock.getDelta(); // Time since last frame in seconds

  // Update simulation time counter
  const DAYS_PER_REAL_SECOND_AT_1X = 365.25 / 60; // Approx days per second at 1x speed if 60s = 1 year
  const daysPassedThisFrame = deltaTime * simulationSpeed * DAYS_PER_REAL_SECOND_AT_1X;
  simulatedDays += daysPassedThisFrame;
  const dayCounter = document.getElementById('dayCounter');
  if (dayCounter) {
    dayCounter.textContent = `Simulated Days: ${Math.floor(simulatedDays)}`; // Show whole days
  }

  // Update simulation state
  updatePlanetPositions(deltaTime); // Update orbits and moon positions
  updatePlanetRotations(deltaTime); // Update self-rotation for planets and moons

  // Update controls (for damping, etc.)
  controls.update();

  // Render the scene
  renderer.render(scene, camera);
}

// --- DOM Content Loaded Event ---
document.addEventListener('DOMContentLoaded', function() {
  // Final check to remove toggle button (keeping as per original code)
  const toggleButton = document.getElementById('toggleMeshBtn');
  if (toggleButton) {
    toggleButton.remove();
  }

  // Start the simulation
  init();
});