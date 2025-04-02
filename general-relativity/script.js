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
// REMOVED: Will be loaded from JSON
// const planetConfigs = [ ... ];

// --- Constants (Moved and Expanded) ---
const HIGHLIGHT_MATERIAL = new THREE.MeshBasicMaterial({ color: SELECTED_HIGHLIGHT_COLOR, wireframe: true });
const OUTLINE_MATERIAL = new THREE.MeshBasicMaterial({ color: SELECTED_HIGHLIGHT_COLOR, side: THREE.BackSide });
const OUTLINE_SCALE = 1.06; // How much larger the outline mesh is

// Scaling and Display
const MOON_ORBIT_SCALE_FACTOR = MOON_ORBIT_SCALE; // Use previous constant
const MOON_SIZE_SCALE_FACTOR = MOON_SIZE_SCALE; // Use previous constant
const MIN_MOON_RADIUS = 0.5; // Smallest visual size for a moon
const ATMOSPHERE_SCALE_FACTOR = 1.05; // How much larger atmosphere mesh is than planet
const ATMOSPHERE_OPACITY_MULTIPLIER = 0.3;
const MOON_ATMOSPHERE_SCALE_FACTOR = 1.1;
const MOON_ATMOSPHERE_OPACITY_MULTIPLIER = 0.4;
const CLOUD_SCALE_FACTOR = 1.02; // How much larger cloud mesh is than planet
const CLOUD_OPACITY = 0.7;
const CLOUD_ROTATION_SPEED_MULTIPLIER = 1.1; // Clouds rotate slightly faster
const SATURN_RING_INNER_RADIUS_FACTOR = 1.2;
const SATURN_RING_OUTER_RADIUS_FACTOR = 2.5;
const SATURN_RING_OPACITY = 0.9;
const PLANET_SEGMENTS = 32; // Geometry detail for planets
const MOON_SEGMENTS = 16;   // Geometry detail for moons
const ORBIT_SEGMENTS = 128; // Geometry detail for orbit lines
const MOON_ORBIT_SEGMENTS = 64; // Geometry detail for moon orbit lines
const EARTH_RADIUS_KM = 6371; // For info display

// Starfield
const STARFIELD_RADIUS = 3000;
const STAR_COUNT = 15000;
const STAR_BASE_SIZE = 1.5;
const STAR_MIN_SIZE_FACTOR = 0.5;
const STAR_MAX_SIZE_FACTOR = 1.5;
const STAR_MIN_COLOR_FACTOR = 0.7; // Multiplier for brightness (0.7 to 1.0)

// Physics & Time
const BASE_ORBIT_SPEED_UNIT_TIME = 60; // Sim seconds representing 1 Earth year for baseOrbitSpeedFactor=1
const DAYS_PER_SIM_SECOND_AT_1X = 365.25 / BASE_ORBIT_SPEED_UNIT_TIME; // How many sim days pass per real second at 1x speed
// const RADS_PER_DAY = (2 * Math.PI) / (24 * 60 * 60); // Not directly used in animation loop

// Lighting
const AMBIENT_LIGHT_INTENSITY = 0.15;
const SUN_POINT_LIGHT_INTENSITY = 5; // Main light source intensity
const SUN_POINT_LIGHT_DECAY = 1;
const SUN_GLOW_LIGHT_INTENSITY = 2; // Softer glow around sun
const SUN_GLOW_LIGHT_DISTANCE = 200;
const SUN_GLOW_LIGHT_DECAY = 1.5;
const DIR_LIGHT_INTENSITY = 0.3; // Simulating distant starlight
const HEMI_LIGHT_INTENSITY = 0.2; // Fill light

// Materials
const PLANET_ROUGHNESS = 0.7;
const PLANET_METALNESS = 0.1;
const SUN_EMISSIVE_COLOR = 0xffddaa;
const SUN_EMISSIVE_INTENSITY = 1.5; // Make the sun mesh glow

// --- Global Variables ---
let scene, camera, renderer, controls, clock, textureLoader, raycaster, pointer;
let sunMesh, sunConfig; // Store sun config separately
let planets = []; // Array to hold planet data { group, mesh, config, orbitRadius, displayRadius }
let moonGroups = []; // Array to hold moon system groups { parentPlanetName, group }
let celestialBodies = []; // Combined list of selectable objects (planet groups, moon meshes, sun mesh)
let planetConfigs = []; // Loaded from JSON

let simulationSpeed = 1;
// REMOVED: let gravityModifier = 1;
let selectedObject = null;
let originalMaterials = new Map(); // Map<Mesh, Material>
let activeOutlines = new Map(); // Map<Object3D, Mesh> Keep track of active outline meshes

// Simulation time tracker
let simulatedDays = 0;

// --- DOM Elements ---
const infoPanel = document.getElementById('info');
const infoName = document.getElementById('info-name');
const infoOrbit = document.getElementById('info-orbit');
const infoSize = document.getElementById('info-size');
const infoDetailsContainer = document.getElementById('info-details'); // Use the container directly
const speedValueSpan = document.getElementById('speedValue');
// REMOVED: const gravityValueSpan = ...
const dayCounter = document.getElementById('dayCounter');

// REMOVED: Old extended info element creation block
// if (!document.getElementById('info-details')) { ... }

// --- Initialization ---
// Make init async to await data loading
async function init() {
    try {
        // Load planet data first
        await loadPlanetData();

        // Basic Scene Setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        clock = new THREE.Clock();
        textureLoader = new THREE.TextureLoader();
        raycaster = new THREE.Raycaster();
        pointer = new THREE.Vector2();

        // Camera
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, STARFIELD_RADIUS * 2.5); // Adjust far plane
        camera.position.set(150, 100, 150);

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.physicallyCorrectLights = true;
        renderer.outputEncoding = THREE.sRGBEncoding;
        document.body.appendChild(renderer.domElement);

        // Controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 10; // Allow closer zoom
        controls.maxDistance = STARFIELD_RADIUS * 1.5; // Increase max zoom out distance significantly
        controls.target.set(0, 0, 0);

        // Setup Scene Contents
        setupLighting();
        createStarfield(); // Use improved starfield
        createSun(); // Use improved sun material
        createPlanetsAndOrbits(); // Uses loaded data and constants

        // Combine all selectable objects (moons added during their creation)
        celestialBodies.push(sunMesh);
        planets.forEach(p => celestialBodies.push(p.group)); // Add planet groups

        // Event Listeners
        setupEventListeners(); // Updated listeners

        // Start Animation
        animate();

    } catch (error) {
        console.error("Initialization failed:", error);
        // Display error message to the user
         const errorDiv = document.createElement('div');
         errorDiv.style.color = 'red';
         errorDiv.style.position = 'absolute';
         errorDiv.style.top = '10px'; // Position below controls
         errorDiv.style.left = '10px';
         errorDiv.style.background = 'rgba(0,0,0,0.8)';
         errorDiv.style.padding = '10px';
         errorDiv.style.border = '1px solid red';
         errorDiv.style.zIndex = '1000';
         errorDiv.textContent = `Failed to initialize simulation: ${error.message}. Check console.`;
         document.body.appendChild(errorDiv);
    }
}

// --- Data Loading --- Function to load and process JSON data
async function loadPlanetData() {
    try {
        const response = await fetch('solarsystem_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        planetConfigs = await response.json();

        // Pre-process data (calculate speeds, parse colors)
        planetConfigs.forEach(config => {
            // Orbit speed (radians per simulation second at 1x speed)
            config.calculatedOrbitSpeed = (2 * Math.PI * config.baseOrbitSpeedFactor) / BASE_ORBIT_SPEED_UNIT_TIME;

            // Rotation speed - DECOUPLED from orbit time base
            const ROTATION_SPEED_SCALE_FACTOR = 0.05; // ** NEW ** - Adjust this to globally speed up/slow down rotation
            const BASE_SECONDS_PER_DAY_FOR_ROTATION = 10; // Arbitrary visual scaling - 1 Earth day rotation takes 10 sim seconds at 1x
            if (config.rotationPeriod && config.rotationPeriod !== 0) {
                 config.calculatedRotationSpeed = ((2 * Math.PI) / (Math.abs(config.rotationPeriod) * BASE_SECONDS_PER_DAY_FOR_ROTATION)) * ROTATION_SPEED_SCALE_FACTOR;
            } else {
                config.calculatedRotationSpeed = 0;
            }
            config.rotationDirection = config.rotationPeriod >= 0 ? 1 : -1;

            // Convert atmosphere color string hex to number
            if (config.atmosphere && typeof config.atmosphere.color === 'string') {
                config.atmosphere.color = parseInt(config.atmosphere.color, 16);
            }

            // Process moons
            if (config.moons) {
                config.moons.forEach(moon => {
                    // Moon orbit speed (uses orbital time base)
                    const secondsPerDayInSim = BASE_ORBIT_SPEED_UNIT_TIME / 365.25;
                    moon.calculatedOrbitSpeed = (2 * Math.PI) / (Math.abs(moon.orbitalPeriod) * secondsPerDayInSim);
                    moon.orbitDirection = moon.orbitalPeriod >= 0 ? 1 : -1;
                    // Moon rotation speed (uses new rotation time base)
                    moon.calculatedRotationSpeed = ((2 * Math.PI) / (Math.abs(moon.rotationPeriod) * BASE_SECONDS_PER_DAY_FOR_ROTATION)) * ROTATION_SPEED_SCALE_FACTOR;
                    moon.rotationDirection = moon.rotationPeriod >= 0 ? 1 : -1;
                    if (moon.atmosphere && typeof moon.atmosphere.color === 'string') {
                        moon.atmosphere.color = parseInt(moon.atmosphere.color, 16);
                    }
                });
            }
        });
        console.log("Planet data loaded and processed.");

    } catch (error) {
        console.error("Failed to load or process planet data:", error);
        planetConfigs = []; // Ensure it's an empty array on failure
        throw error; // Re-throw to stop initialization
    }
}

// --- Lighting Setup (using constants) ---
function setupLighting() {
    // Reduce ambient and hemisphere light for better contrast
    scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY * 0.3)); // Reduced

    const sunLight = new THREE.PointLight(0xffffee, SUN_POINT_LIGHT_INTENSITY, 0, SUN_POINT_LIGHT_DECAY);
    sunLight.position.set(0, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = STARFIELD_RADIUS * 1.2; // Ensure shadow camera covers enough distance
    scene.add(sunLight);

    const sunGlowLight = new THREE.PointLight(SUN_EMISSIVE_COLOR, SUN_GLOW_LIGHT_INTENSITY, SUN_GLOW_LIGHT_DISTANCE, SUN_GLOW_LIGHT_DECAY);
    sunGlowLight.position.set(0, 0, 0);
    scene.add(sunGlowLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, DIR_LIGHT_INTENSITY);
    dirLight.position.set(1, 0.5, 0.5).normalize();
    scene.add(dirLight);

    // Reduce hemisphere light significantly
    const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, HEMI_LIGHT_INTENSITY * 0.2); // Reduced
    scene.add(hemiLight);
}

// --- Material Creation Helper (using constants) ---
function createPlanetMaterial(textureUrl) {
    const texture = textureLoader.load(textureUrl, undefined, undefined, (err) => console.error(`Error loading texture: ${textureUrl}`, err));
    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: PLANET_ROUGHNESS,
        metalness: PLANET_METALNESS,
        // envMapIntensity: 0.5 // Removed, adjust globally if needed
    });
}

// --- Object Creation Functions ---

// --- Starfield with Texture ---
function createStarfield() {
    const vertices = [];
    const colors = [];
    const sizes = [];
    const color = new THREE.Color();
    const starTexture = createStarTexture(); // Create the texture once

    for (let i = 0; i < STAR_COUNT; i++) {
        const vertex = new THREE.Vector3();
        // Distribute stars spherically
        const phi = Math.acos(-1 + (2 * i) / STAR_COUNT);
        const theta = Math.sqrt(STAR_COUNT * Math.PI) * phi;
        const radius = Math.cbrt(Math.random()) * STARFIELD_RADIUS; // Cube root for more uniform spatial distribution

        vertex.setFromSphericalCoords(radius, phi, theta);

        vertices.push(vertex.x, vertex.y, vertex.z);

        // Vary color slightly (brightness)
        const brightness = THREE.MathUtils.randFloat(STAR_MIN_COLOR_FACTOR, 1.0);
        color.setHSL(0.0, 0.0, brightness); // Grayscale brightness variation
        colors.push(color.r, color.g, color.b);

        // Vary size
        sizes.push(STAR_BASE_SIZE * THREE.MathUtils.randFloat(STAR_MIN_SIZE_FACTOR, STAR_MAX_SIZE_FACTOR));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        map: starTexture, // Use the texture for shape
        // alphaMap: starTexture, // Let's disable alphaMap temporarily to test
        size: STAR_BASE_SIZE, // Base size, multiplied by attribute
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true, // Keep transparency for the texture map
        depthWrite: false, // Avoid stars hiding each other incorrectly
        // blending: THREE.AdditiveBlending // Revert to NormalBlending for now
        blending: THREE.NormalBlending
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
}

// --- Helper function to create star texture ---
function createStarTexture() {
    console.log("Creating star texture..."); // Add log
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.1, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true; // Ensure texture uploads
    return texture;
}

// --- Improved Sun Creation --- Function updated
function createSun() {
    const sunTexture = textureLoader.load(TEXTURE_URLS.sun);
    const sunGeometry = new THREE.SphereGeometry(SUN_RADIUS, 64, 32); // Higher detail sun

    // Use MeshStandardMaterial for realistic lighting and emission
    const sunMaterial = new THREE.MeshStandardMaterial({
        map: sunTexture,
        emissive: SUN_EMISSIVE_COLOR, // Make it glow
        emissiveIntensity: SUN_EMISSIVE_INTENSITY,
        emissiveMap: sunTexture, // Use texture for emission pattern
        // No need for base color if emissive is strong
    });

    sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.userData.isSelectable = true;
    sunMesh.userData.name = "Sun";
    sunMesh.userData.type = "star"; // Define type

    // Define sun specific config directly (as it doesn't come from JSON)
    sunConfig = {
        name: "Sun",
        info: {
            Mass: "333,000 Earths",
            Composition: "Hydrogen (73%), Helium (25%), other elements (2%)",
            Temperature: "5,500°C (surface), 15,000,000°C (core)",
            RotationPeriod: "25-35 days (varies by latitude)",
            // Calculate approximate diameter based on scaled Earth
            Diameter: `~${(SUN_RADIUS * 2 * (EARTH_RADIUS_KM / 4.2)).toLocaleString()} km`, // Assuming Earth scaledRadius is 4.2
            Type: "G-type main-sequence star (G2V)",
            Age: "~4.6 billion years"
        },
        // No orbital/rotational data needed for simplified model
    };
    sunMesh.userData.config = sunConfig; // Link config info to mesh

    scene.add(sunMesh);
}

// --- Create Planets (using loaded data & constants) --- Function updated
function createPlanetsAndOrbits() {
    if (!planetConfigs || planetConfigs.length === 0) {
        console.warn("No planet configurations loaded. Skipping planet creation.");
        return;
    }

    planetConfigs.forEach(config => {
        const orbitRadius = config.orbitRadiusAU * ORBIT_SCALE_FACTOR;
        const displayRadius = config.scaledRadius; // Use pre-defined scaled size

        // --- Planet Group --- (Stores shared data like orbit)
        const planetGroup = new THREE.Group();
        planetGroup.userData = {
            isSelectable: true,
            name: config.name,
            type: 'planet',
            config: config, // Store reference to full config
            orbitRadius: orbitRadius,
            orbitSpeed: config.calculatedOrbitSpeed,
            rotationSpeed: config.calculatedRotationSpeed,
            rotationDirection: config.rotationDirection,
            initialAngle: config.initialAngle, // Assuming radians from JSON processing
            currentAngle: config.initialAngle,
            axialTilt: config.axialTilt ? config.axialTilt * (Math.PI / 180) : 0
        };
        // planetGroup.userData.currentAngle = config.initialAngle; // Set initial angle

        // --- Planet Mesh --- (The visible planet)
        const planetGeometry = new THREE.SphereGeometry(displayRadius, PLANET_SEGMENTS, PLANET_SEGMENTS / 2);
        const planetMaterial = createPlanetMaterial(config.textureUrl);
        const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
        planetMesh.castShadow = true;
        planetMesh.receiveShadow = true;
        planetMesh.rotation.order = 'YXZ'; // Set rotation order for tilt
        planetMesh.rotation.z = planetGroup.userData.axialTilt; // Apply tilt
        planetGroup.userData.planetMesh = planetMesh; // Keep reference in group data
        planetGroup.add(planetMesh);

        // --- Atmosphere --- (If defined in config)
        if (config.atmosphere && config.atmosphere.exists) {
            const atmoGeometry = new THREE.SphereGeometry(displayRadius * ATMOSPHERE_SCALE_FACTOR, PLANET_SEGMENTS, PLANET_SEGMENTS / 2);
            const atmoMaterial = new THREE.MeshBasicMaterial({ // Basic glow
                color: config.atmosphere.color, // Use processed color number
                transparent: true,
                opacity: config.atmosphere.density * ATMOSPHERE_OPACITY_MULTIPLIER,
                side: THREE.BackSide // Render inside for glow effect
            });
            const atmosphereMesh = new THREE.Mesh(atmoGeometry, atmoMaterial);
            atmosphereMesh.raycast = () => {}; // ** Make non-raycastable **
            planetGroup.add(atmosphereMesh);
        }

        // --- Clouds --- (Specific to Earth config)
        if (config.name === "Earth" && config.cloudTextureUrl) {
            const cloudGeometry = new THREE.SphereGeometry(displayRadius * CLOUD_SCALE_FACTOR, PLANET_SEGMENTS, PLANET_SEGMENTS / 2);
            const cloudTexture = textureLoader.load(config.cloudTextureUrl);
            const cloudMaterial = new THREE.MeshStandardMaterial({
                map: cloudTexture,
                transparent: true,
                opacity: CLOUD_OPACITY,
                blending: THREE.AdditiveBlending, // Optional: brighter clouds where they overlap sun
                depthWrite: false // Render clouds without hiding planet below
            });
            const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloudMesh.raycast = () => {}; // ** Make non-raycastable **
            planetMesh.userData.cloudMesh = cloudMesh; // Attach to planet mesh for rotation
            planetGroup.add(cloudMesh);
        }

        // --- Rings --- (Specific to Saturn config)
        if (config.ringTextureUrl) {
            createRings(config, displayRadius, planetGroup);
        }

        // --- Initial Position --- (Place the group)
        const initialAngleRad = planetGroup.userData.initialAngle;
        planetGroup.position.set(
            orbitRadius * Math.cos(initialAngleRad),
            0,
            orbitRadius * Math.sin(initialAngleRad)
        );
        scene.add(planetGroup);

        // --- Orbit Line --- (Added directly to scene)
        createOrbitLine(orbitRadius, ORBIT_LINE_COLOR, ORBIT_SEGMENTS);

        // --- Store Planet Data --- (For potential later use)
        planets.push({
            group: planetGroup,
            mesh: planetMesh,
            config: config, // Includes info, speeds etc.
            orbitRadius: orbitRadius,
            displayRadius: displayRadius
        });

        // --- Moons --- (If defined in config)
        if (config.moons && config.moons.length > 0) {
            createMoonSystem(config, planetGroup, displayRadius);
        }
    });
}

// --- Helper for Saturn's Rings --- Function Updated
function createRings(planetConfig, planetRadius, planetGroup) {
    const innerRadius = planetRadius * SATURN_RING_INNER_RADIUS_FACTOR;
    const outerRadius = planetRadius * SATURN_RING_OUTER_RADIUS_FACTOR;
    const ringGeometry = new THREE.RingGeometry(innerRadius, outerRadius, ORBIT_SEGMENTS); // Use high segments
    const ringTexture = textureLoader.load(planetConfig.ringTextureUrl);

    // Fix UV mapping for RingGeometry (crucial for texture)
    const uvs = ringGeometry.attributes.uv.array;
    const pos = ringGeometry.attributes.position.array;
    for (let i = 0; i < pos.length / 3; i++) {
        const x = pos[i * 3];
        const z = pos[i * 3 + 2]; // Use X and Z for radius/angle in horizontal plane
        const radius = Math.sqrt(x * x + z * z);
        const angle = Math.atan2(z, x); // Angle in XZ plane

        uvs[i * 2] = (radius - innerRadius) / (outerRadius - innerRadius); // Map radius to U (0 to 1)
        uvs[i * 2 + 1] = (angle + Math.PI) / (2 * Math.PI);           // Map angle to V (0 to 1)
    }
    ringGeometry.attributes.uv.needsUpdate = true;

    const ringMaterial = new THREE.MeshStandardMaterial({
        map: ringTexture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: SATURN_RING_OPACITY,
        roughness: 0.8,
        metalness: 0.1,
        depthWrite: false // Render rings without hiding planet/moons behind them
    });

    const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    ringMesh.receiveShadow = true;
    ringMesh.raycast = () => {}; // ** Make non-raycastable **

    // Orient rings horizontally initially (RingGeometry is in XY plane)
    ringMesh.rotation.x = Math.PI / 2;

    // Apply tilt (use ringTilt from config if available, else planet's axial tilt)
    const ringTiltRad = (planetConfig.ringTilt ?? planetConfig.axialTilt ?? 0) * (Math.PI / 180);
    // Tilt around the appropriate axis after the initial rotation (usually Z)
    ringMesh.rotation.z += ringTiltRad;

    planetGroup.add(ringMesh);
}

// --- Helper for Orbit Lines --- Function updated
function createOrbitLine(radius, color, segments = ORBIT_SEGMENTS) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(
            radius * Math.cos(theta),
            0,
            radius * Math.sin(theta)
        ));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.4 // Slightly dimmer orbits
    });
    const line = new THREE.Line(geometry, material);
    scene.add(line); // Add directly to scene
    return line;
}

// --- Create Moons (using loaded data & constants) --- Function updated
function createMoonSystem(planetConfig, planetGroup, planetRadius) {
    const moonSystemGroup = new THREE.Group(); // Group for all moons/orbits of this planet
    moonSystemGroup.userData.parentPlanetName = planetConfig.name; // Identify group

    planetConfig.moons.forEach(moonConfig => {
        // Calculate orbit radius relative to planet display size + scaled distance
        const orbitRadius = planetRadius * 1.5 + (moonConfig.orbitRadiusKm / 100000) * MOON_ORBIT_SCALE_FACTOR;

        // Calculate moon display radius relative to planet display size
        let moonRadius = planetRadius * (moonConfig.actualRadius * MOON_SIZE_SCALE_FACTOR);
        moonRadius = Math.max(moonRadius, MIN_MOON_RADIUS); // Ensure minimum size

        // --- Moon Mesh ---
        const moonGeometry = new THREE.SphereGeometry(moonRadius, MOON_SEGMENTS, MOON_SEGMENTS / 2);
        const moonMaterial = createPlanetMaterial(moonConfig.textureUrl);
        const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        moonMesh.castShadow = true;
        moonMesh.receiveShadow = true;

        // --- Moon Atmosphere (e.g., Titan) ---
        if (moonConfig.atmosphere && moonConfig.atmosphere.exists) {
            const atmoGeometry = new THREE.SphereGeometry(moonRadius * MOON_ATMOSPHERE_SCALE_FACTOR, MOON_SEGMENTS, MOON_SEGMENTS / 2);
            const atmoMaterial = new THREE.MeshBasicMaterial({
                color: moonConfig.atmosphere.color,
                transparent: true,
                opacity: moonConfig.atmosphere.density * MOON_ATMOSPHERE_OPACITY_MULTIPLIER,
                side: THREE.BackSide
            });
            const moonAtmosphereMesh = new THREE.Mesh(atmoGeometry, atmoMaterial);
            moonAtmosphereMesh.raycast = () => {}; // ** Make non-raycastable **
            moonMesh.add(moonAtmosphereMesh); // Add atmosphere as child of moon mesh
        }

        // --- Moon Positioning & Data ---
        const initialAngle = Math.random() * Math.PI * 2; // Random start
        moonMesh.position.set(
            orbitRadius * Math.cos(initialAngle),
            0,
            orbitRadius * Math.sin(initialAngle)
        );

        // Store data in MESH userData (this is the selectable object)
        moonMesh.userData = {
            isSelectable: true,
            name: moonConfig.name,
            type: 'moon',
            parentPlanetName: planetConfig.name,
            config: moonConfig, // Store reference to moon config
            orbitRadius: orbitRadius,
            orbitSpeed: moonConfig.calculatedOrbitSpeed,
            orbitDirection: moonConfig.orbitDirection,
            rotationSpeed: moonConfig.calculatedRotationSpeed,
            rotationDirection: moonConfig.rotationDirection,
            initialAngle: initialAngle,
            currentAngle: initialAngle,
            // Pre-format info for display panel convenience
            displayInfo: {
                Size: `${(moonConfig.actualRadius * EARTH_RADIUS_KM).toFixed(0)} km radius`,
                Orbit: `${moonConfig.orbitRadiusKm.toLocaleString()} km from ${planetConfig.name}`,
                OrbitalPeriod: `${Math.abs(moonConfig.orbitalPeriod).toFixed(2)} days ${moonConfig.orbitalPeriod < 0 ? '(retrograde)' : ''}`,
                RotationPeriod: `${Math.abs(moonConfig.rotationPeriod).toFixed(2)} days ${moonConfig.rotationPeriod === moonConfig.orbitalPeriod ? '(tidally locked)' : ''}`, // Basic check for tidal lock
                ParentPlanet: planetConfig.name,
                // Include details from moonConfig.info if it exists
                ...(moonConfig.info || {})
            }
        };
        celestialBodies.push(moonMesh); // Add moon mesh to main selectable list

        // --- Moon Orbit Line --- (Relative to planet center)
        const moonOrbitLine = createOrbitLine(orbitRadius, ORBIT_LINE_COLOR * 0.8, MOON_ORBIT_SEGMENTS);
        moonOrbitLine.raycast = () => {}; // ** Make non-raycastable **

        // Add moon mesh and its orbit line to the system group
        moonSystemGroup.add(moonMesh);
        moonSystemGroup.add(moonOrbitLine); // Add orbit line here so it moves with the planet
    });

    // Add the whole system (all moons/orbits for this planet) to the planet's group
    planetGroup.add(moonSystemGroup);
    moonGroups.push({ parentPlanetName: planetConfig.name, group: moonSystemGroup }); // Store reference
}

// REMOVED: calculateDisplayRadius function (using fixed scaledRadius)
// REMOVED: updatePlanetSizes function

// --- Update Functions --- Consolidated position and rotation updates

function updatePositions(deltaTime) {
    const timeFactor = deltaTime * simulationSpeed;

    // Update Planets (Groups)
    planets.forEach(planetData => {
        const group = planetData.group;
        const userData = group.userData;
        // Skip if speed is zero or not defined
        if (!userData.orbitSpeed || userData.orbitSpeed === 0) return;

        userData.currentAngle += userData.orbitSpeed * timeFactor;
        group.position.set(
            userData.orbitRadius * Math.cos(userData.currentAngle),
            0,
            userData.orbitRadius * Math.sin(userData.currentAngle)
        );
    });

    // Update Moons (Meshes within Moon Systems)
    moonGroups.forEach(mg => {
        mg.group.children.forEach(child => {
            // Identify moon meshes by checking for orbitSpeed in userData
            if (child.isMesh && child.userData.orbitSpeed) {
                const moonMesh = child;
                const userData = moonMesh.userData;

                userData.currentAngle += userData.orbitSpeed * userData.orbitDirection * timeFactor;
                moonMesh.position.set(
                    userData.orbitRadius * Math.cos(userData.currentAngle),
                    0,
                    userData.orbitRadius * Math.sin(userData.currentAngle)
                );
            }
        });
    });
}

function updateRotations(deltaTime) {
    const timeFactor = deltaTime * simulationSpeed;

    // Rotate Planets (Meshes)
    planets.forEach(planetData => {
        const planetMesh = planetData.mesh;
        const userData = planetData.group.userData; // Get speeds from group data

        if (userData.rotationSpeed && userData.rotationSpeed !== 0) {
             planetMesh.rotateY(userData.rotationSpeed * userData.rotationDirection * timeFactor);
        }

        // Rotate Clouds
        if (planetMesh.userData.cloudMesh && userData.rotationSpeed && userData.rotationSpeed !== 0) {
            planetMesh.userData.cloudMesh.rotateY(
                userData.rotationSpeed * userData.rotationDirection * timeFactor * CLOUD_ROTATION_SPEED_MULTIPLIER
            );
        }
    });

    // Rotate Moons (Meshes)
    moonGroups.forEach(mg => {
        mg.group.children.forEach(child => {
            // Identify moon meshes by checking for rotationSpeed
            if (child.isMesh && child.userData.rotationSpeed && child.userData.rotationSpeed !== 0) {
                const moonMesh = child;
                const moonUserData = moonMesh.userData;
                moonMesh.rotateY(moonUserData.rotationSpeed * moonUserData.rotationDirection * timeFactor);
            }
        });
    });

    // Rotate Sun (Optional)
    // Add rotationPeriod to sunConfig if needed and uncomment
    // if (sunMesh && sunConfig.calculatedRotationSpeed) {
    //     sunMesh.rotateY(sunConfig.calculatedRotationSpeed * timeFactor);
    // }
}


// --- Interactivity --- Updated logic
let cameraTarget = null; // ** NEW ** Variable to store the object camera should follow
const targetPosition = new THREE.Vector3(); // Reusable vector for target position
const cameraOffset = new THREE.Vector3(); // Reusable vector for offset calculation
const CAMERA_FOLLOW_LERP_FACTOR = 0.05; // Smoothness of camera following (lower = smoother)

function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onPointerClick(event) {
    console.log("--- Pointer Click ---");
    raycaster.setFromCamera(pointer, camera);
    // Important: Check against scene children recursively to hit everything, *then* filter
    const intersects = raycaster.intersectObjects(scene.children, true);

    let clickedSelectable = null;
    if (intersects.length > 0) {
        // Iterate through intersects because the first hit might be non-selectable (e.g., orbit line)
        for (let i = 0; i < intersects.length; i++) {
            let hitObject = intersects[i].object;
            console.log(`Raycast hit candidate [${i}]: ${hitObject.name || 'Unnamed'} (Type: ${hitObject.type}, IsMesh: ${hitObject.isMesh}, IsGroup: ${hitObject.isGroup})`);

            // Find the nearest ancestor that is in our selectable list
            let current = hitObject;
            while (current) {
                if (celestialBodies.includes(current)) {
                    clickedSelectable = current;
                    console.log(`Found selectable object via traversal: ${clickedSelectable.userData.name || clickedSelectable.name}`);
                    break; // Found the selectable object, stop searching this intersection
                }
                current = current.parent;
            }
            if (clickedSelectable) {
                break; // Found the selectable object, stop iterating through intersects
            }
        }
    }

    // --- Selection / Deselection Logic --- (remains the same)
    if (clickedSelectable) {
        console.log(`Final Selected: ${clickedSelectable.userData.name || clickedSelectable.name || 'Unknown'} (Type: ${clickedSelectable.userData.type || 'N/A'})`);
    } else {
        console.log("No selectable object found in intersection path.");
    }

    if (!clickedSelectable || clickedSelectable === sunMesh) {
        console.log("Clicked Sun or empty space/non-selectable -> Deselecting");
        deselectObject();
    } else if (clickedSelectable !== selectedObject) {
        console.log("Clicked new selectable object -> Selecting");
        selectObject(clickedSelectable);
    } else {
        console.log("Clicked already selected object -> No Action");
    }
    console.log("---------------------");
}

function selectObject(object) {
    deselectObject(); // Deselect previous first, including outline

    selectedObject = object;

    let meshToHighlight = null;
    let parentForOutline = scene; // Default parent for outline (Sun, Moons)

    if (selectedObject.userData.type === 'star') {
        meshToHighlight = sunMesh;
    } else if (selectedObject.userData.type === 'planet') {
        meshToHighlight = selectedObject.userData.planetMesh;
        parentForOutline = selectedObject; // Add outline to planet group
    } else if (selectedObject.userData.type === 'moon') {
        meshToHighlight = selectedObject;
        parentForOutline = selectedObject.parent; // Add outline to moon's container group
    }

    // ** NEW ** Outline Logic
    if (meshToHighlight) {
        // Create outline mesh
        const outlineMesh = meshToHighlight.clone();
        outlineMesh.material = OUTLINE_MATERIAL.clone(); // Use outline material
        outlineMesh.scale.set(OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE);
        outlineMesh.raycast = () => {}; // Outline should not be clickable
        outlineMesh.userData.isOutline = true; // Mark as outline

        // Add outline to the appropriate parent and store reference
        parentForOutline.add(outlineMesh);
        activeOutlines.set(selectedObject, outlineMesh);
    }

    displayObjectInfo(selectedObject);

    // Set cameraTarget
    if (selectedObject.userData.type === 'planet' || selectedObject.userData.type === 'moon') {
        cameraTarget = selectedObject;
    } else {
        cameraTarget = null;
    }
}

function deselectObject() {
    // ** NEW ** Remove existing outline
    if (selectedObject && activeOutlines.has(selectedObject)) {
        const outlineMesh = activeOutlines.get(selectedObject);
        if (outlineMesh && outlineMesh.parent) {
            outlineMesh.parent.remove(outlineMesh);
        }
        // Dispose geometry/material if needed, but maybe not critical here
        // outlineMesh.geometry.dispose();
        // outlineMesh.material.dispose();
        activeOutlines.delete(selectedObject); // Remove from map
    }

    // Restore original material (no longer used if we ditch wireframe)
    /*
    if (selectedObject) {
        let meshToRestore = null;
        // ... find meshToRestore ...
        if (meshToRestore && originalMaterials.has(meshToRestore)) {
            meshToRestore.material = originalMaterials.get(meshToRestore);
            originalMaterials.delete(meshToRestore);
        }
    }
    */

    selectedObject = null;
    infoPanel.style.display = 'none';
    cameraTarget = null; // Reset camera target
}

// --- Info Panel Display --- Updated logic
function displayObjectInfo(object) {
    // Ensure object and its necessary data exist
    if (!object || !object.userData || !object.userData.config) {
        infoPanel.style.display = 'none';
        return;
    }

    const userData = object.userData;
    const config = userData.config; // Config from planet/moon/sun data
    const name = userData.name || 'Unknown';
    const type = userData.type; // 'planet', 'moon', 'star'

    // --- Update Static DOM Elements --- (Name, Orbit, Size)
    infoName.textContent = name;

    let orbitText = '';
    let sizeText = '';
    let infoSource = null; // The object containing key-value pairs for details

    if (type === 'star') {
        infoSource = config.info;
        orbitText = "Center of Solar System";
        sizeText = infoSource.Diameter ? `Diameter: ${infoSource.Diameter}` : 'Size Unknown';
    } else if (type === 'moon') {
        infoSource = userData.displayInfo || config.info || {}; // Prefer pre-formatted displayInfo
        orbitText = infoSource.Orbit || `Orbiting ${userData.parentPlanetName}`;
        sizeText = infoSource.Size || 'Size Unknown';
    } else if (type === 'planet') {
        infoSource = config.info;
        orbitText = config.orbitRadiusAU ? `Orbit: ${config.orbitRadiusAU.toFixed(2)} AU` : 'Orbit Unknown';
        sizeText = config.actualRadius ? `Radius: ${config.actualRadius.toFixed(3)} Earths` : 'Size Unknown';
        if (config.actualRadius) {
            const radiusKm = (config.actualRadius * EARTH_RADIUS_KM).toFixed(0);
            sizeText += ` (~${radiusKm} km)`;
        }
    }

    infoOrbit.textContent = orbitText;
    infoSize.textContent = sizeText;

    // --- Populate Details Section --- (Dynamically add <p> elements)
    // Clear previous details efficiently
    while (infoDetailsContainer.firstChild) {
        infoDetailsContainer.removeChild(infoDetailsContainer.firstChild);
    }

    if (infoSource && Object.keys(infoSource).length > 0) {
        for (const [key, value] of Object.entries(infoSource)) {
            // Skip keys already shown in main info for moons if using displayInfo
            if (type === 'moon' && userData.displayInfo && ['Size', 'Orbit', 'ParentPlanet'].includes(key)) {
                continue;
            }
            // Skip keys already shown for sun
             if (type === 'star' && ['Diameter'].includes(key)) {
                 continue;
             }

            const p = document.createElement('p');
            const strong = document.createElement('strong');
            strong.textContent = `${key}: `;
            p.appendChild(strong);
            p.appendChild(document.createTextNode(value));
            infoDetailsContainer.appendChild(p);
        }
    } else {
        const p = document.createElement('p');
        p.textContent = "No detailed information available.";
        infoDetailsContainer.appendChild(p);
    }

    infoPanel.style.display = 'block'; // Show the panel
}


// --- Event Listeners Setup --- Updated
function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('click', onPointerClick);

    // Speed slider listener
    document.getElementById('speedSlider').addEventListener('input', (e) => {
        simulationSpeed = parseFloat(e.target.value);
        speedValueSpan.textContent = `${simulationSpeed.toFixed(1)}x`;
        // Speed calculations are now done by multiplying base speed by simSpeed in updates,
        // so no need to recalculate anything here.
    });

    // REMOVED: Gravity slider listener
    // REMOVED: Size mode radio button listeners
    // REMOVED: Toggle button listener

    // ** ADDED BACK ** Safeguard button removal
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

// --- Animation Loop --- Updated
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    // Update Simulation Time Counter
    const daysPassedThisFrame = deltaTime * simulationSpeed * DAYS_PER_SIM_SECOND_AT_1X;
    simulatedDays += daysPassedThisFrame;
    if (dayCounter) {
        dayCounter.textContent = `Simulated Days: ${Math.floor(simulatedDays)}`;
    }

    // Update Simulation State
    updatePositions(deltaTime);
    updateRotations(deltaTime);

    // ** NEW ** Camera Following Logic
    if (cameraTarget) {
        // Get the world position of the target
        cameraTarget.getWorldPosition(targetPosition);
        // Smoothly interpolate the controls target towards the object's position
        controls.target.lerp(targetPosition, CAMERA_FOLLOW_LERP_FACTOR);
    } else {
        // If no target, smoothly interpolate back to the center (0,0,0)
        controls.target.lerp(new THREE.Vector3(0, 0, 0), CAMERA_FOLLOW_LERP_FACTOR);
    }

    controls.update(); // Update orbit controls (handles damping, target following)
    renderer.render(scene, camera); // Render the scene
}

// --- Start Simulation --- Updated
document.addEventListener('DOMContentLoaded', () => {
    init().catch(error => {
        // Error handling moved inside init's try/catch
        console.error("Caught error after init call in DOMContentLoaded:", error);
    });
});