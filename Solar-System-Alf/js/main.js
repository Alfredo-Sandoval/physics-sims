// --- Main Module - Solar System Simulation ---
import * as THREE from 'three';
import * as CONSTANTS from './constants.js';
import * as SceneSetup from './sceneSetup.js';
import * as UI from './ui.js';
import * as Controls from './controls.js';
import * as Effects from './effects.js';
import * as Animation from './animation.js';
import { createStarfield } from './starfield.js';
import { createSun, createPlanetsAndOrbits } from './celestialBodies.js';
import { findCelestialBodyByName } from './utils.js';
import { updateScene } from './animation.js';
// import { updateControls } from './controls.js'; // Removed import
// import { renderMinimap, updateMinimapIndicators } from './ui.js'; // Removed import

// Global variables
let scene, camera, renderer, controls;
let celestialBodies = [];
let clock = new THREE.Clock();
let simulationSpeed = 1.0;
window.simulationSpeed = simulationSpeed; // Make sure it's set on the window object
let textureLoader; // Declare textureLoader variable

// Create physics space-time mesh
let spacetimeMesh = null;
let isSpacetimeMeshVisible = false;

// Camera following and object selection
let selectedObject = null;
let followingObject = null;

let sunMesh, sunConfig, planets = [];
let minimap = null;
let planetConfigs = [];

// Make essential variables available globally (for module communication)
window.scene = scene;
window.clock = null; // Will be initialized in init()
window.planets = planets;
window.simulatedDays = 0;
window.spacetimeMesh = spacetimeMesh;
window.simulationSpeed = simulationSpeed; // Re-ensure global speed is set

// Initialize the application
export async function init() {
    try {
        // Load planet data first
        await loadPlanetData();

        // Set up basic scene, camera, renderer
        scene = SceneSetup.setupScene();
        camera = SceneSetup.setupCamera();
        renderer = SceneSetup.setupRenderer();
        controls = SceneSetup.setupControls(camera, renderer);
        
        clock = new THREE.Clock();
        textureLoader = new THREE.TextureLoader();
        
        // IMPORTANT: Set the base path for all textures
        textureLoader.setPath('./textures/');
        console.log("🔍 TextureLoader path set to ./textures/");
        
        // Update global window references
        window.scene = scene;
        window.clock = clock;
        window.simulationSpeed = simulationSpeed;
        
        // Setup lighting in the scene
        SceneSetup.setupLighting(scene);
        
        // Initialize UI
        UI.initUI();
        
        // Show loading message
        showLoadingScreen(true, "Loading textures...");
        
        // Create starfield
        createStarfield(scene);
        
        // Create sun
        const sunData = createSun(scene, textureLoader);
        sunMesh = sunData.mesh;
        sunConfig = sunData.config;
        celestialBodies.push(sunMesh);
        
        // Create planets and wait for it to complete
        const planetData = await createPlanetsAndOrbits(scene, textureLoader, planetConfigs);
        planets = planetData.planets;
        celestialBodies = celestialBodies.concat(planetData.celestialBodies);
        
        // Update global window reference for planets
        window.planets = planets;
        window.simulationSpeed = 1.0; // Initialize global speed here
        
        // Hide loading screen
        showLoadingScreen(false);
        
        // Set up controls and events
        Controls.setupPointerEvents(scene, camera, renderer, celestialBodies);
        Controls.setupZoomDetection(renderer, controls);
        
        // Initialize minimap
        // minimap = UI.initMinimap(); // Commented out minimap initialization
        
        // Call the main UI controls setup from Controls module
        Controls.setupUIControls(planetConfigs, celestialBodies);
        
        // Log celestial bodies for debugging
        console.log("--- Celestial Bodies Added to Selectable List ---");
        celestialBodies.forEach((body, index) => {
            console.log(`[${index}] Name: ${body.userData?.name || body.name}, Type: ${body.userData?.type}, ObjectType: ${body.constructor.name}`);
        });
        console.log("-------------------------------------------------");
        
        // Start the animation loop
        startAnimationLoop();
        
    } catch (error) {
        console.error("Initialization failed:", error);
        showErrorMessage(error.message);
    }
}

// Animation loop
function startAnimationLoop() {
    function animate() {
        requestAnimationFrame(animate);
        
        // Update simulation
        updateScene(simulationSpeed);
        // updateControls(); // Removed call
        
        // Get updated simulation days from window object
        simulatedDays = window.simulatedDays;
        
        // Update UI elements
        UI.updateUIDisplay(window.simulationSpeed); // Update speed display
        
        // Render the scene
        renderer.render(scene, camera);
        
        // Render the minimap
        // renderMinimap(scene); // Commented out minimap rendering
        
        // Update the minimap planet indicators
        // updateMinimapIndicators(celestialBodies); // Commented out minimap indicators update
    }
    
    animate();
}

// Load planet data from JSON
async function loadPlanetData() {
    try {
        // Fix the path to the JSON file - use the correct path relative to HTML
        const response = await fetch('./solarsystem_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        planetConfigs = await response.json();

        // Pre-process data (calculate speeds, parse colors)
        planetConfigs.forEach(config => {
            // Orbit speed (radians per simulation second at 1x speed)
            config.calculatedOrbitSpeed = (2 * Math.PI * config.baseOrbitSpeedFactor) / CONSTANTS.BASE_ORBIT_SPEED_UNIT_TIME;

            // Rotation speed - DECOUPLED from orbit time base
            const ROTATION_SPEED_SCALE_FACTOR = 0.05; // Adjust this to globally speed up/slow down rotation
            const BASE_SECONDS_PER_DAY_FOR_ROTATION = 10; // Arbitrary visual scaling - 1 Earth day rotation takes 10 sim seconds at 1x
            if (config.rotationPeriod && config.rotationPeriod !== 0) {
                 config.calculatedRotationSpeed = ((2 * Math.PI) / (Math.abs(config.rotationPeriod) * BASE_SECONDS_PER_DAY_FOR_ROTATION)) * ROTATION_SPEED_SCALE_FACTOR;
            } else {
                config.calculatedRotationSpeed = 0;
            }
            config.rotationDirection = config.rotationPeriod >= 0 ? 1 : -1;

            // Convert atmosphere color string hex to number
            if (config.atmosphere && typeof config.atmosphere.color === 'string') {
                config.atmosphere.color = parseInt(config.atmosphere.color.replace('#', ''), 16);
            }

            // Process moons
            if (config.moons) {
                config.moons.forEach(moon => {
                    // Moon orbit speed (uses orbital time base)
                    const secondsPerDayInSim = CONSTANTS.BASE_ORBIT_SPEED_UNIT_TIME / 365.25;
                    moon.calculatedOrbitSpeed = (2 * Math.PI) / (Math.abs(moon.orbitalPeriod) * secondsPerDayInSim);
                    moon.orbitDirection = moon.orbitalPeriod >= 0 ? 1 : -1;
                    // Moon rotation speed (uses new rotation time base)
                    moon.calculatedRotationSpeed = ((2 * Math.PI) / (Math.abs(moon.rotationPeriod) * BASE_SECONDS_PER_DAY_FOR_ROTATION)) * ROTATION_SPEED_SCALE_FACTOR;
                    moon.rotationDirection = moon.rotationPeriod >= 0 ? 1 : -1;
                    if (moon.atmosphere && typeof moon.atmosphere.color === 'string') {
                        moon.atmosphere.color = parseInt(moon.atmosphere.color.replace('#', ''), 16);
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

// Show/hide loading screen
function showLoadingScreen(show, message = "Loading...") {
    let loadingElement = document.getElementById('loadingScreen');
    
    if (show) {
        if (!loadingElement) {
            loadingElement = document.createElement('div');
            loadingElement.id = 'loadingScreen';
            loadingElement.style.position = 'absolute';
            loadingElement.style.top = '50%';
            loadingElement.style.left = '50%';
            loadingElement.style.transform = 'translate(-50%, -50%)';
            loadingElement.style.color = 'white';
            loadingElement.style.fontSize = '24px';
            loadingElement.style.fontFamily = 'Arial, sans-serif';
            document.body.appendChild(loadingElement);
        }
        loadingElement.textContent = message;
        loadingElement.style.display = 'block';
    } else if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

// Show error message
function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.position = 'absolute';
    errorDiv.style.top = '10px';
    errorDiv.style.left = '10px';
    errorDiv.style.background = 'rgba(0,0,0,0.8)';
    errorDiv.style.padding = '10px';
    errorDiv.style.border = '1px solid red';
    errorDiv.style.zIndex = '1000';
    errorDiv.textContent = `Failed to initialize simulation: ${message}. Check console.`;
    document.body.appendChild(errorDiv);
}

// Initialize the application
window.addEventListener('DOMContentLoaded', init);