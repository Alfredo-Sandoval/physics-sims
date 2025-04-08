// --- Imports ---
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Constants and Configuration ---
const SUN_RADIUS = 25;  // Sun radius
const ORBIT_LINE_COLOR = 0x444444;
const SELECTED_HIGHLIGHT_COLOR = 0x00ffff;
const ORBIT_SCALE_FACTOR = 120; // Base orbital scale factor
const MOON_ORBIT_SCALE = 5; // Scale factor for moon orbits (now fixed)
const MOON_SIZE_SCALE = 1.2; // More realistic size (reduced from 2.5, was 0.8 originally)

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
const SATURN_RING_INNER_GAP = 1.4; // Gap between inner ring and planet
const SATURN_RING_OUTER_GAP = 2.2; // Gap between rings
const PLANET_SEGMENTS = 32; // Geometry detail for planets
const MOON_SEGMENTS = 16;   // Geometry detail for moons
const ORBIT_SEGMENTS = 128; // Geometry detail for orbit lines
const MOON_ORBIT_SEGMENTS = 64; // Geometry detail for moon orbit lines
const EARTH_RADIUS_KM = 6371; // For info display

// Starfield
const STARFIELD_RADIUS = 5000; // Increased from 3000
const STAR_COUNT = 20000;  // Increased from 15000
const STAR_BASE_SIZE = 2.0;   // Increased from 1.5
const STAR_MIN_SIZE_FACTOR = 0.5;
const STAR_MAX_SIZE_FACTOR = 1.5;
const STAR_MIN_COLOR_FACTOR = 0.7; // Multiplier for brightness (0.7 to 1.0)

// Physics & Time
const BASE_ORBIT_SPEED_UNIT_TIME = 60; // Sim seconds representing 1 Earth year for baseOrbitSpeedFactor=1
const DAYS_PER_SIM_SECOND_AT_1X = 365.25 / BASE_ORBIT_SPEED_UNIT_TIME; // How many sim days pass per real second at 1x speed
// const RADS_PER_DAY = (2 * Math.PI) / (24 * 60 * 60); // Not directly used in animation loop

// Lighting
const AMBIENT_LIGHT_INTENSITY = 0.3; // Increased from 0.15
const SUN_POINT_LIGHT_INTENSITY = 7; // Increased from 5
const SUN_POINT_LIGHT_DECAY = 0.8; // Reduced decay for farther reach
const SUN_GLOW_LIGHT_INTENSITY = 3; // Increased from 2
const SUN_GLOW_LIGHT_DISTANCE = 300; // Increased from 200
const SUN_GLOW_LIGHT_DECAY = 1.0; // Reduced decay for farther reach
const DIR_LIGHT_INTENSITY = 0.5; // Increased from 0.3
const HEMI_LIGHT_INTENSITY = 0.4; // Increased from 0.2

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
let selectedObject = null;
let originalMaterials = new Map(); // Map<Mesh, Material>
let activeOutlines = new Map(); // Map<Object3D, Mesh> Keep track of active outline meshes

// Simulation time tracker
let simulatedDays = 0;

// DEBUG: Make these global for console debugging
let _lastHit = null; // Store the last hit object for debugging via console
let _lastIntersects = []; // Store last intersections for debugging
let debugInfoElement = null; // Element to display debug info on screen
let planetNavDropdown = null; // Reference to the planet navigation dropdown

// --- Camera follow variables
let isCameraAnimating = false; // Flag to indicate camera animation in progress
let cameraTarget = null; // Object the camera is following
let isManualZoom = false; // Flag to track if user is manually changing camera distance
let lastCameraDistance = 0; // Tracks last camera distance for zoom detection

// --- DOM Elements ---
const infoPanel = document.getElementById('info');
const infoName = document.getElementById('info-name');
const infoOrbit = document.getElementById('info-orbit');
const infoSize = document.getElementById('info-size');
const infoDetailsContainer = document.getElementById('info-details'); // Use the container directly
const speedValueSpan = document.getElementById('speedValue');
// REMOVED: const gravityValueSpan = ...
const dayCounter = document.getElementById('dayCounter');
// NEW: Get the planet nav dropdown
const planetNav = document.getElementById('planetNav');

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
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, STARFIELD_RADIUS * 3); // Increased far plane to see all stars
        camera.position.set(150, 100, 150);

        // Renderer - enable antialiasing for better visuals
        renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            powerPreference: "high-performance",
            alpha: true // Enable alpha for better compositing
        });
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
        controls.maxDistance = STARFIELD_RADIUS * 0.8; // Allow zooming out to see the stars
        controls.target.set(0, 0, 0);

        // Setup Scene Contents
        setupLighting();
        createStarfield(); // Create starfield first (background)
        createSun(); // Create sun next

        // Show loading message
        const loadingElement = document.createElement('div');
        loadingElement.style.position = 'absolute';
        loadingElement.style.top = '50%';
        loadingElement.style.left = '50%';
        loadingElement.style.transform = 'translate(-50%, -50%)';
        loadingElement.style.color = 'white';
        loadingElement.style.fontSize = '24px';
        loadingElement.style.fontFamily = 'Arial, sans-serif';
        loadingElement.textContent = 'Loading textures...';
        document.body.appendChild(loadingElement);

        // Now create planets and wait for it to complete
        await createPlanetsAndOrbits(); // Uses loaded data and constants
        
        // Remove loading message
        document.body.removeChild(loadingElement);

        // Combine all selectable objects
        celestialBodies.push(sunMesh); // Add Sun mesh
        planets.forEach(p => celestialBodies.push(p.group)); // Add Planet groups
        // Moons are added to celestialBodies in createMoonSystem

        // ** NEW: Log the final list of selectable bodies for verification **
        console.log("--- Celestial Bodies Added to Selectable List ---");
        celestialBodies.forEach((body, index) => {
            console.log(`[${index}] Name: ${body.userData.name || body.name}, Type: ${body.userData.type}, ObjectType: ${body.constructor.name}`);
        });
        console.log("-------------------------------------------------");

        // ** Apply Info Panel Styles via JS **
        if (infoPanel) {
            infoPanel.style.background = 'rgba(20, 20, 30, 0.85)'; // Darker, slightly less transparent
            infoPanel.style.padding = '15px';
            infoPanel.style.border = '1px solid rgba(100, 100, 120, 0.6)';
            infoPanel.style.borderRadius = '8px'; // Slightly more rounded
            infoPanel.style.maxWidth = '280px';
            infoPanel.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)'; // Slightly stronger shadow
        }

        // ** NEW ** Create visual debug overlay
        createDebugOverlay();

        // Event Listeners
        setupEventListeners();

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
    // Much brighter ambient light for moon visibility
    scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY * 1.5)); // Significantly increased

    // More powerful sun light with further reach
    const sunLight = new THREE.PointLight(0xffffee, SUN_POINT_LIGHT_INTENSITY * 1.5, 0, SUN_POINT_LIGHT_DECAY * 0.8);
    sunLight.position.set(0, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = STARFIELD_RADIUS * 1.2;
    scene.add(sunLight);

    // Enhanced sun glow with further reach
    const sunGlowLight = new THREE.PointLight(SUN_EMISSIVE_COLOR, SUN_GLOW_LIGHT_INTENSITY * 1.5, SUN_GLOW_LIGHT_DISTANCE * 2, SUN_GLOW_LIGHT_DECAY * 0.8);
    sunGlowLight.position.set(0, 0, 0);
    scene.add(sunGlowLight);

    // Multiple directional lights for better global lighting
    const dirLight1 = new THREE.DirectionalLight(0xffffff, DIR_LIGHT_INTENSITY * 2.0);
    dirLight1.position.set(1, 0.5, 0.5).normalize();
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffee, DIR_LIGHT_INTENSITY * 1.5);
    dirLight2.position.set(-1, -0.5, -0.5).normalize();
    scene.add(dirLight2);

    const dirLight3 = new THREE.DirectionalLight(0xffffee, DIR_LIGHT_INTENSITY * 1.5);
    dirLight3.position.set(0, 1, 0).normalize();
    scene.add(dirLight3);

    // Increase hemisphere light for better ambient illumination
    const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, HEMI_LIGHT_INTENSITY * 1.0);
    scene.add(hemiLight);
}

// --- Material Creation Helper (using constants) ---
function createPlanetMaterial(textureUrl) {
    const texture = textureLoader.load(
        textureUrl, 
        (loadedTexture) => {
            // Apply proper encoding and settings once loaded
            loadedTexture.encoding = THREE.sRGBEncoding;
            loadedTexture.needsUpdate = true;
        },
        undefined, 
        (err) => console.error(`Error loading texture: ${textureUrl}`, err)
    );
    
    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: PLANET_ROUGHNESS,
        metalness: PLANET_METALNESS,
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
        const brightness = THREE.MathUtils.randFloat(0.8, 1.0); // Increased minimum brightness
        
        // Add a slight color tint for variety
        const colorHue = Math.random() > 0.7 ? THREE.MathUtils.randFloat(0.5, 0.7) : 0; // Some stars slightly blue/yellow
        const colorSat = Math.random() > 0.8 ? THREE.MathUtils.randFloat(0.1, 0.3) : 0; // Low saturation for color
        color.setHSL(colorHue, colorSat, brightness);
        
        colors.push(color.r, color.g, color.b);

        // Vary size - increase the size range for more visible stars
        sizes.push(STAR_BASE_SIZE * THREE.MathUtils.randFloat(STAR_MIN_SIZE_FACTOR, STAR_MAX_SIZE_FACTOR * 1.5));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        map: starTexture,
        size: STAR_BASE_SIZE * 2, // Double the base size
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        depthWrite: false, // Avoid stars hiding each other incorrectly
        blending: THREE.AdditiveBlending // Use additive blending for brighter stars
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
    
    // Add a second layer of fewer, brighter stars to make some stand out
    const brightStarCount = STAR_COUNT / 10;
    const brightVertices = [];
    const brightColors = [];
    const brightSizes = [];
    
    for (let i = 0; i < brightStarCount; i++) {
        const vertex = new THREE.Vector3();
        const phi = Math.acos(-1 + (2 * i) / brightStarCount);
        const theta = Math.sqrt(brightStarCount * Math.PI) * phi;
        const radius = Math.cbrt(Math.random()) * STARFIELD_RADIUS * 0.8; // Slightly closer

        vertex.setFromSphericalCoords(radius, phi, theta);
        brightVertices.push(vertex.x, vertex.y, vertex.z);

        // Brighter stars
        const brightness = THREE.MathUtils.randFloat(0.9, 1.0);
        color.setHSL(0, 0, brightness);
        brightColors.push(color.r, color.g, color.b);

        // Larger stars
        brightSizes.push(STAR_BASE_SIZE * THREE.MathUtils.randFloat(2, 3.5));
    }

    const brightGeometry = new THREE.BufferGeometry();
    brightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(brightVertices, 3));
    brightGeometry.setAttribute('color', new THREE.Float32BufferAttribute(brightColors, 3));
    brightGeometry.setAttribute('size', new THREE.Float32BufferAttribute(brightSizes, 1));

    const brightMaterial = new THREE.PointsMaterial({
        map: starTexture,
        size: STAR_BASE_SIZE * 3,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const brightStars = new THREE.Points(brightGeometry, brightMaterial);
    scene.add(brightStars);
}

// --- Helper function to create star texture ---
function createStarTexture() {
    console.log("Creating star texture..."); // Add log
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    
    // Make the center brighter and more defined with a sharper falloff
    gradient.addColorStop(0, 'rgba(255,255,255,1.0)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(0.65, 'rgba(255,255,255,0.1)');
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
    sunMesh.userData.type = "star";
    sunMesh.userData.clickTarget = sunMesh; // Direct reference to itself
    sunMesh.name = "Sun"; // Set the actual mesh name for easier debugging

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
async function createPlanetsAndOrbits() {
    if (!planetConfigs || planetConfigs.length === 0) {
        console.warn("No planet configurations loaded. Skipping planet creation.");
        return;
    }

    // Process planets in sequence to ensure properly loaded textures
    for (const config of planetConfigs) {
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

        // --- Planet Mesh --- (The visible planet)
        const planetGeometry = new THREE.SphereGeometry(displayRadius, PLANET_SEGMENTS, PLANET_SEGMENTS / 2);
        const planetMaterial = createPlanetMaterial(config.textureUrl);
        const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
        planetMesh.castShadow = true;
        planetMesh.receiveShadow = true;
        planetMesh.rotation.order = 'YXZ'; // Set rotation order for tilt
        planetMesh.rotation.z = planetGroup.userData.axialTilt; // Apply tilt
        planetGroup.userData.planetMesh = planetMesh; // Keep reference in group data
        planetGroup.userData.belongsTo = config.name;
        planetGroup.userData.clickTarget = planetGroup; // Reference to parent group
        planetMesh.name = `${config.name}_mesh`; // Naming for debugging
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
            atmosphereMesh.userData.belongsTo = config.name;
            atmosphereMesh.userData.clickTarget = planetGroup;
            atmosphereMesh.name = `${config.name}_atmosphere`;
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
            cloudMesh.userData.belongsTo = config.name;
            cloudMesh.userData.clickTarget = planetGroup;
            cloudMesh.name = `${config.name}_clouds`;
            planetMesh.userData.cloudMesh = cloudMesh; // Attach to planet mesh for rotation
            planetGroup.add(cloudMesh);
        }

        // --- Rings --- (Specific to Saturn config)
        if (config.ringTextureUrl) {
            await createRings(config, displayRadius, planetGroup);
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
    }
}

// --- Helper for Saturn's Rings --- Completely rewritten with simple approach
async function createRings(planetConfig, planetRadius, planetGroup) {
    // Create a ring group to hold all ring elements
    const ringGroup = new THREE.Group();
    
    // Create multiple ring segments with different radii and colors for a more realistic appearance
    const ringSegments = [
        { inner: planetRadius * 1.2, outer: planetRadius * 1.4, color: 0xD4CEB9, opacity: 0.9 }, // Inner A ring
        { inner: planetRadius * 1.4, outer: planetRadius * 1.6, color: 0xDBD3BF, opacity: 0.85 }, // Middle A ring
        { inner: planetRadius * 1.6, outer: planetRadius * 1.9, color: 0xE2D9C5, opacity: 0.8 },  // Outer A ring
        { inner: planetRadius * 2.0, outer: planetRadius * 2.3, color: 0xD4CEB9, opacity: 0.7 },  // Inner B ring (with gap)
        { inner: planetRadius * 2.3, outer: planetRadius * 2.5, color: 0xCEC8B5, opacity: 0.6 }   // Outer B ring
    ];
    
    // Create each ring segment
    for (const segment of ringSegments) {
        const geometry = new THREE.RingGeometry(segment.inner, segment.outer, 128, 8);
        const material = new THREE.MeshBasicMaterial({
            color: segment.color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: segment.opacity,
            depthWrite: false
        });
        
        const ringMesh = new THREE.Mesh(geometry, material);
        ringMesh.rotation.x = Math.PI / 2; // Orient horizontally
        ringMesh.receiveShadow = true;
        ringMesh.castShadow = true;
        ringMesh.raycast = () => {}; // Make non-raycastable
        
        ringGroup.add(ringMesh);
    }
    
    // Apply tilt (use ringTilt from config if available, else planet's axial tilt)
    const ringTiltRad = (planetConfig.ringTilt ?? planetConfig.axialTilt ?? 0) * (Math.PI / 180);
    ringGroup.rotation.z = ringTiltRad;
    
    // Add a subtle point light to illuminate the rings 
    const ringLight = new THREE.PointLight(0xffffee, 0.4, planetRadius * 8);
    ringLight.position.set(0, -planetRadius * 2, 0);
    planetGroup.add(ringLight);
    
    planetGroup.add(ringGroup);
    return ringGroup;
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
        
        // Load the moon texture
        const moonTexture = textureLoader.load(moonConfig.textureUrl);
        
        // Create a much brighter material with self-illumination
        const moonMaterial = new THREE.MeshStandardMaterial({
            map: moonTexture,
            roughness: 0.3, // Smoother surface to reflect more light
            metalness: 0.1,
            emissive: 0x333333, // Add significant self-illumination
            emissiveIntensity: 0.4, // Strong self-glow
            emissiveMap: moonTexture // Use same texture for emission
        });
        
        const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        moonMesh.castShadow = true;
        moonMesh.receiveShadow = true;

        // --- Moon Atmosphere (e.g., Titan) ---
        if (moonConfig.atmosphere && moonConfig.atmosphere.exists) {
            const atmoGeometry = new THREE.SphereGeometry(moonRadius * MOON_ATMOSPHERE_SCALE_FACTOR, MOON_SEGMENTS, MOON_SEGMENTS / 2);
            const atmoMaterial = new THREE.MeshBasicMaterial({
                color: moonConfig.atmosphere.color,
                transparent: true,
                opacity: moonConfig.atmosphere.density * MOON_ATMOSPHERE_OPACITY_MULTIPLIER * 1.5, // Increased opacity
                side: THREE.BackSide
            });
            const moonAtmosphereMesh = new THREE.Mesh(atmoGeometry, atmoMaterial);
            moonAtmosphereMesh.raycast = () => {}; // Make non-raycastable
            moonMesh.add(moonAtmosphereMesh); // Add atmosphere as child of moon mesh
        }

        // --- Add multiple lights around each moon for better visibility ---
        // Main moon light - fairly bright
        const moonLight = new THREE.PointLight(0xffffff, 1.0, moonRadius * 15);
        moonLight.position.set(0, 0, 0);
        moonMesh.add(moonLight);
        
        // Second light for better exposure - positioned slightly offset
        const moonLight2 = new THREE.PointLight(0xffffee, 0.5, moonRadius * 10);
        moonLight2.position.set(moonRadius * 3, 0, 0);
        moonMesh.add(moonLight2);

        // --- Moon Positioning & Data ---
        const initialAngle = Math.random() * Math.PI * 2; // Random start
        moonMesh.position.set(
            orbitRadius * Math.cos(initialAngle),
            0,
            orbitRadius * Math.sin(initialAngle)
        );

        // Store data in MESH userData
        moonMesh.userData = {
            isSelectable: true,
            name: moonConfig.name,
            type: 'moon',
            parentPlanetName: planetConfig.name,
            config: moonConfig,
            orbitRadius: orbitRadius,
            orbitSpeed: moonConfig.calculatedOrbitSpeed,
            orbitDirection: moonConfig.orbitDirection,
            rotationSpeed: moonConfig.calculatedRotationSpeed,
            rotationDirection: moonConfig.rotationDirection,
            initialAngle: initialAngle,
            currentAngle: initialAngle,
            displayInfo: {
                Size: `${(moonConfig.actualRadius * EARTH_RADIUS_KM).toFixed(0)} km radius`,
                Orbit: `${moonConfig.orbitRadiusKm.toLocaleString()} km from ${planetConfig.name}`,
                OrbitalPeriod: `${Math.abs(moonConfig.orbitalPeriod).toFixed(2)} days ${moonConfig.orbitalPeriod < 0 ? '(retrograde)' : ''}`,
                RotationPeriod: `${Math.abs(moonConfig.rotationPeriod).toFixed(2)} days ${moonConfig.rotationPeriod === moonConfig.orbitalPeriod ? '(tidally locked)' : ''}`, // Basic check for tidal lock
                ParentPlanet: planetConfig.name,
                // Include details from moonConfig.info if it exists
                ...(moonConfig.info || {})
            },
            belongsTo: moonConfig.name,
            clickTarget: moonMesh // Self-reference
        };
        
        // Also set object name for easier debugging
        moonMesh.name = moonConfig.name;
        
        celestialBodies.push(moonMesh);
        
        // --- Moon Orbit Line --- (Relative to planet center)
        const moonOrbitLine = createOrbitLine(orbitRadius, ORBIT_LINE_COLOR * 0.8, MOON_ORBIT_SEGMENTS);
        // Ensure non-raycastable
        if (moonOrbitLine) { // Check if line was created
             moonOrbitLine.raycast = () => {};
        }

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
// Using the global cameraTarget variable declared earlier
const targetPosition = new THREE.Vector3(); // Reusable vector for target position
const cameraOffset = new THREE.Vector3(); // Reusable vector for offset calculation
const CAMERA_FOLLOW_LERP_FACTOR = 0.05; // Smoothness of camera following (lower = smoother)

function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onPointerClick(event) {
    console.clear(); // Clear previous debug logs
    console.log("=== CLICK EVENT ===");
    
    // Prepare debug message for on-screen display
    let debugMsg = "<strong>CLICK DEBUG:</strong><br>";
    
    raycaster.setFromCamera(pointer, camera);
    
    // First, create a list of all selectable objects (celestial bodies and their components)
    // This helps improve clicking reliability
    const allSelectableObjects = [];
    
    // Add all celestial bodies
    celestialBodies.forEach(body => {
        allSelectableObjects.push(body);
        
        // For planets, also check if they have planet meshes to make clickable
        if (body.userData && body.userData.type === 'planet' && body.userData.planetMesh) {
            allSelectableObjects.push(body.userData.planetMesh);
        }
    });
    
    // Raycast against ALL scene objects
    const intersects = raycaster.intersectObjects(scene.children, true);
    _lastIntersects = intersects;
    
    debugMsg += `Found ${intersects.length} intersections<br>`;
    console.log(`Found ${intersects.length} intersections`);
    
    // If no intersections found, it's a click on empty space - don't change anything
    if (intersects.length === 0) {
        debugMsg += "Empty space click - keeping current target<br>";
        console.log("Empty space click - keeping current target");
        updateDebugInfo(debugMsg);
        return; // *** IMPORTANT: Don't deselect or change camera on empty clicks ***
    }
    
    // Get the first hit object (closest to camera)
    const hitObject = intersects[0].object;
    _lastHit = hitObject;
    
    // Debug properties
    debugMsg += `Hit: ${hitObject.name || "unnamed"}<br>`;
    debugMsg += `Type: ${hitObject.type}<br>`;
    debugMsg += `Has clickTarget: ${!!hitObject.userData?.clickTarget}<br>`;
    
    console.log("Hit object:", hitObject);
    console.log("Name:", hitObject.name);
    console.log("Type:", hitObject.type);
    console.log("userData:", hitObject.userData);
    console.log("hasClickTarget:", !!hitObject.userData?.clickTarget);
    
    let targetToSelect = null;
    
    // Improved selection logic with better moon support
    // 1. First check if the hit object has a clickTarget reference
    if (hitObject.userData && hitObject.userData.clickTarget) {
        targetToSelect = hitObject.userData.clickTarget;
        let targetName = targetToSelect.userData?.name || targetToSelect.name || "unknown";
        debugMsg += `Method 1: Using direct clickTarget (${targetName})<br>`;
        console.log(`Method 1: Using direct clickTarget (${targetName})`);
    }
    // 2. Check if the hit object itself is in celestialBodies (direct hit on a selectable object)
    else if (celestialBodies.includes(hitObject)) {
        targetToSelect = hitObject;
        debugMsg += `Method 2: Hit object is directly in celestialBodies<br>`;
        console.log(`Method 2: Hit object is directly in celestialBodies`);
    }
    // 3. Check if this is a hit on a planet mesh that belongs to a planet group
    else if (hitObject.parent && hitObject.parent.userData && hitObject.parent.userData.type === 'planet') {
        targetToSelect = hitObject.parent;  // Select the parent planet group
        debugMsg += `Method 3: Hit on planet mesh, selecting planet group<br>`;
        console.log(`Method 3: Hit on planet mesh, selecting planet group`);
    }
    // 4. For moons, improve the selection logic by checking parent hierarchies
    else {
        debugMsg += "Trying parent traversal for complex objects like moons<br>";
        let current = hitObject;
        let steps = 0;
        let found = false;
        
        // Traverse up through the parent hierarchy
        while (current && steps < 10 && !found) {
            steps++;
            debugMsg += `Step ${steps}: checking ${current.name || "unnamed"}<br>`;
            console.log(`Step ${steps}: checking ${current.name || "unnamed"}`);
            
            // Check if current object is in celestialBodies
            if (celestialBodies.includes(current)) {
                targetToSelect = current;
                debugMsg += `Found in celestialBodies via traversal<br>`;
                found = true;
                break;
            }
            
            // Special handling for moon systems
            // Check if we're inside a moon group by looking for parent relationships
            if (current.parent) {
                // Check if any of the celestialBodies is a child of current.parent
                for (const body of celestialBodies) {
                    if (body.parent === current.parent && body.userData && body.userData.type === 'moon') {
                        // We hit something in a moon system, find the exact moon
                        if (current.userData && current.userData.name) {
                            // This could be the moon itself
                            targetToSelect = current;
                        } else if (body.name === current.name) {
                            // Direct name match
                            targetToSelect = body;
                        }
                        if (targetToSelect) {
                            debugMsg += `Found moon via parent relationship: ${targetToSelect.name}<br>`;
                            found = true;
                            break;
                        }
                    }
                }
            }
            
            if (found) break;
            
            // Check the belongsTo property which can point to a named celestial body
            if (current.userData && current.userData.belongsTo) {
                const name = current.userData.belongsTo;
                debugMsg += `Has belongsTo: ${name}<br>`;
                
                for (const body of celestialBodies) {
                    if ((body.userData && body.userData.name === name) || body.name === name) {
                        targetToSelect = body;
                        debugMsg += `Found via belongsTo property: ${name}<br>`;
                        found = true;
                        break;
                    }
                }
            }
            
            if (found) break;
            
            // Move up to parent for next iteration
            if (current.parent === scene || !current.parent) break;
            current = current.parent;
        }
    }
    
    // Final decision
    if (targetToSelect) {
        let finalTarget = targetToSelect.userData?.name || targetToSelect.name || "unnamed";
        debugMsg += `Final target: ${finalTarget}<br>`;
        
        if (targetToSelect === selectedObject) {
            debugMsg += "Already selected<br>";
            // Even if already selected, update the camera target to ensure
            // it gets proper focus - fixes issue with Earth and other planets
            cameraTarget = targetToSelect;
            // Reset manual zoom when clicking on an already selected object
            isManualZoom = false;
            debugMsg += "Resetting camera distance<br>";
        } else {
            debugMsg += "Selecting new target<br>";
            
            // When selecting via click, reset manual zoom and update camera target
            isManualZoom = false;
            selectObject(targetToSelect, true); // true = update camera target
        }
    } else {
        // Very important: Don't deselect or change camera target if we didn't find anything valid
        debugMsg += "No selectable target found - keeping current view<br>";
    }
    
    // Update on-screen debug info
    updateDebugInfo(debugMsg);
    console.log("=== END CLICK EVENT ===");
}

function selectObject(object, updateCameraTarget = false) {
    // Deselect previous but don't reset camera target
    deselectObject(false); 

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

    // ** FIXED ** Outline Logic for consistent color
    if (meshToHighlight) {
        // Create outline mesh using basic geometry instead of cloning
        // This ensures consistent appearance regardless of the original mesh's properties
        const outlineGeometry = meshToHighlight.geometry.clone();
        const outlineMesh = new THREE.Mesh(outlineGeometry, OUTLINE_MATERIAL.clone());
        
        // Match the position, rotation and scale of the original
        outlineMesh.position.copy(meshToHighlight.position);
        outlineMesh.rotation.copy(meshToHighlight.rotation);
        outlineMesh.scale.set(
            meshToHighlight.scale.x * OUTLINE_SCALE,
            meshToHighlight.scale.y * OUTLINE_SCALE,
            meshToHighlight.scale.z * OUTLINE_SCALE
        );
        
        outlineMesh.raycast = () => {}; // Outline should not be clickable
        outlineMesh.userData.isOutline = true; // Mark as outline

        // Add outline to the appropriate parent and store reference
        parentForOutline.add(outlineMesh);
        activeOutlines.set(selectedObject, outlineMesh);
    }

    displayObjectInfo(selectedObject);

    // Only update camera target if requested (e.g., from dropdown)
    if (updateCameraTarget) {
        cameraTarget = selectedObject;
    }
}

function deselectObject(resetCameraTarget = true) {
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

    selectedObject = null;
    infoPanel.style.display = 'none';
    
    // Only reset camera target if explicitly requested
    if (resetCameraTarget) {
        cameraTarget = null; // Reset camera target
    }
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
    
    // Add wheel event to detect manual zoom
    renderer.domElement.addEventListener('wheel', (event) => {
        if (event.deltaY !== 0 && cameraTarget) {
            // User is manually zooming
            isManualZoom = true;
            
            // Store current distance between camera and target
            const targetPos = new THREE.Vector3();
            cameraTarget.getWorldPosition(targetPos);
            lastCameraDistance = camera.position.distanceTo(targetPos);
            
            // Update debug info
            updateDebugInfo("Manual zoom - following at current distance");
        }
    }, { passive: true });

    // Speed slider listener
    document.getElementById('speedSlider').addEventListener('input', (e) => {
        simulationSpeed = parseFloat(e.target.value);
        speedValueSpan.textContent = `${simulationSpeed.toFixed(1)}x`;
    });

    // Planet navigation dropdown listener
    if (planetNav) {
        planetNav.addEventListener('change', onPlanetNavChange);
        planetNavDropdown = planetNav; // Store reference
    }

    // Safeguard button removal
    const toggleButton = document.getElementById('toggleMeshBtn');
    if (toggleButton) {
        toggleButton.remove();
    }
    
    // Add event listener for keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        // Space key to reset camera view to center
        if (e.code === 'Space') {
            // Reset view to center of solar system
            cameraTarget = null;
            controls.target.set(0, 0, 0);
            updateDebugInfo("View reset to solar system center");
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Animation Loop --- Updated with improved camera follow
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

    // Camera following logic - don't update during animations
    if (!isCameraAnimating && cameraTarget) {
        // Get the world position of the target
        const targetPos = new THREE.Vector3();
        cameraTarget.getWorldPosition(targetPos);
        
        // Always update the controls target to follow the celestial body
        controls.target.lerp(targetPos, 0.1);
        
        if (isManualZoom) {
            // In manual zoom mode, don't adjust the camera position
            // User maintains control of the zoom level
        } else {
            // Auto-follow mode - calculate appropriate camera position
            // Get target info to determine appropriate distance
            let targetRadius = 1; // Default size
            let adjustmentFactor = 3; // Default distance multiplier
            
            // Determine object type and size
            if (cameraTarget === sunMesh) {
                targetRadius = SUN_RADIUS;
                adjustmentFactor = 2.5; // Further for sun
            } else if (cameraTarget.userData && cameraTarget.userData.type === 'planet') {
                // For planets, find their display radius
                const planet = planets.find(p => p.group === cameraTarget);
                if (planet) {
                    targetRadius = planet.displayRadius;
                    
                    // Different distances for different planet types
                    if (cameraTarget.userData.name === 'Jupiter' || cameraTarget.userData.name === 'Saturn') {
                        adjustmentFactor = 3.5; // Gas giants
                    } else if (cameraTarget.userData.name === 'Uranus' || cameraTarget.userData.name === 'Neptune') {
                        adjustmentFactor = 4; // Ice giants
                    } else {
                        adjustmentFactor = 4.5; // Terrestrial planets
                    }
                }
            } else if (cameraTarget.userData && cameraTarget.userData.type === 'moon') {
                // For moons, estimate size
                targetRadius = cameraTarget.geometry.parameters.radius || 1;
                adjustmentFactor = 5; // Closer for moons
            }
            
            // Calculate desired view distance
            const desiredDistance = targetRadius * adjustmentFactor;
            
            // Calculate camera position based on its current direction
            const cameraDir = new THREE.Vector3();
            camera.getWorldDirection(cameraDir);
            cameraDir.multiplyScalar(-1); // Reverse direction (camera looks at target)
            
            // Calculate desired position
            const desiredPos = targetPos.clone().add(
                cameraDir.normalize().multiplyScalar(desiredDistance)
            );
            
            // Smoothly move the camera
            camera.position.lerp(desiredPos, 0.05);
        }
    } else if (!isCameraAnimating && !cameraTarget) {
        // If no target, smoothly return to the center (0,0,0)
        controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.05);
    }

    controls.update(); // Update orbit controls
    renderer.render(scene, camera);
}

// --- Start Simulation --- Updated
document.addEventListener('DOMContentLoaded', () => {
    init().catch(error => {
        // Error handling moved inside init's try/catch
        console.error("Caught error after init call in DOMContentLoaded:", error);
    });
});

// --- Helper function to create visual debug overlay ---
function createDebugOverlay() {
    // Create debug overlay if it doesn't exist
    if (!debugInfoElement) {
        debugInfoElement = document.createElement('div');
        debugInfoElement.style.position = 'absolute';
        debugInfoElement.style.top = '60px'; // Position below day counter
        debugInfoElement.style.left = '10px';
        debugInfoElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        debugInfoElement.style.color = '#00ff00'; // Green text
        debugInfoElement.style.padding = '10px';
        debugInfoElement.style.borderRadius = '5px';
        debugInfoElement.style.fontFamily = 'monospace';
        debugInfoElement.style.fontSize = '12px';
        debugInfoElement.style.maxWidth = '400px';
        debugInfoElement.style.maxHeight = '200px';
        debugInfoElement.style.overflowY = 'auto';
        debugInfoElement.style.zIndex = '1000';
        document.body.appendChild(debugInfoElement);
    }
}

// Function to update debug info on screen
function updateDebugInfo(message) {
    if (debugInfoElement) {
        debugInfoElement.innerHTML = message;
    }
}

// ** NEW ** Function to handle planet navigation dropdown change
function onPlanetNavChange(event) {
    const selectedValue = event.target.value;
    if (!selectedValue) return; // Nothing selected
    
    // Find the planet by name
    focusOnPlanet(selectedValue);
    
    // Reset dropdown to default option
    setTimeout(() => {
        event.target.value = '';
    }, 500);
}

// Updated function to focus camera on a specific planet
function focusOnPlanet(planetName) {
    // Reset manual zoom flag when selecting via dropdown
    isManualZoom = false;
    
    // Find the planet object by name
    let targetObject = null;
    
    if (planetName === 'Sun') {
        targetObject = sunMesh;
    } else {
        // Search in planets
        for (const planet of planets) {
            if (planet.config.name === planetName) {
                targetObject = planet.group;
                break;
            }
        }
        
        // If not found in planets, check for moons
        if (!targetObject) {
            for (const moonGroup of moonGroups) {
                moonGroup.group.children.forEach(child => {
                    if (child.isMesh && child.userData && child.userData.name === planetName) {
                        targetObject = child;
                    }
                });
            }
        }
    }
    
    if (!targetObject) {
        console.error(`Planet/Moon "${planetName}" not found`);
        return;
    }
    
    // Select the planet (this handles highlighting and info panel)
    selectObject(targetObject, true); // true = update camera target
    
    // Get proper distance based on planet/object size
    let objectRadius = SUN_RADIUS; // Default to Sun radius
    let adjustmentFactor = 3; // Default view distance multiplier
    
    if (planetName !== 'Sun') {
        // Find the planet data
        const planet = planets.find(p => p.config.name === planetName);
        if (planet) {
            objectRadius = planet.displayRadius;
            
            // Different factors for different types of planets
            if (planetName === 'Jupiter' || planetName === 'Saturn') {
                adjustmentFactor = 3.5; // Gas giants
            } else if (planetName === 'Uranus' || planetName === 'Neptune') {
                adjustmentFactor = 4; // Ice giants
            } else {
                adjustmentFactor = 4.5; // Terrestrial planets
            }
        } else {
            // This might be a moon, try to estimate size
            for (const moonGroup of moonGroups) {
                const moon = moonGroup.group.children.find(child => 
                    child.isMesh && child.userData && child.userData.name === planetName
                );
                if (moon) {
                    objectRadius = moon.geometry.parameters.radius || 1;
                    adjustmentFactor = 5; // Closer for moons
                    break;
                }
            }
        }
    } else {
        // Sun needs to be viewed from further away
        adjustmentFactor = 2.5;
    }
    
    const distance = objectRadius * adjustmentFactor;
    
    // Set camera target - this is what the camera will track
    cameraTarget = targetObject;
    
    // Calculate a relative position from the target
    const offset = new THREE.Vector3(distance, distance * 0.5, distance);
    
    // Store start position for animation
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    
    // Get immediate world position for initial animation step
    const targetPosition = new THREE.Vector3();
    targetObject.getWorldPosition(targetPosition);
    
    // Calculate the destination camera position as an offset from the target position
    const endPosition = targetPosition.clone().add(offset);
    
    // Animation parameters
    const duration = 1.5; // seconds
    const startTime = clock.getElapsedTime();
    
    // Set animation flag to prevent the main loop from interfering
    isCameraAnimating = true;
    
    // Define a one-time animation for camera movement
    function animateCameraMove() {
        const elapsed = clock.getElapsedTime() - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        
        // Ease in/out function
        const t = progress < 0.5 ? 4 * progress * progress * progress : 
                 1 - Math.pow(-2 * progress + 2, 3) / 2; // Cubic ease in-out
        
        // Get current target position (which may have changed if planet is moving)
        const currentTargetPos = new THREE.Vector3();
        targetObject.getWorldPosition(currentTargetPos);
        
        // Interpolate controls target position
        controls.target.lerpVectors(startTarget, currentTargetPos, t);
        
        // Calculate current destination as offset from current target position
        const currentDestination = currentTargetPos.clone().add(offset);
        
        // Interpolate camera position between start and current destination
        camera.position.lerpVectors(startPosition, currentDestination, t);
        
        // Force controls update during animation
        controls.update();
        
        // If still animating, continue
        if (progress < 1.0) {
            requestAnimationFrame(animateCameraMove);
        } else {
            // Animation complete
            isCameraAnimating = false;
            
            // Explicitly set the camera target again to ensure it persists
            cameraTarget = targetObject;
            
            // Log completion
            updateDebugInfo(`Now following: ${planetName}`);
        }
    }
    
    // Start camera animation
    animateCameraMove();
    
    // Log the action for debugging
    updateDebugInfo(`Focusing on ${planetName} - Distance: ${distance.toFixed(1)}, Radius: ${objectRadius.toFixed(1)}`);
}