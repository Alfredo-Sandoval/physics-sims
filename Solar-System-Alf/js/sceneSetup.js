// --- Scene Setup ---
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CONSTANTS from './constants.js';

// Setup the scene, camera and renderer
export function setupScene() {
    // Create scene and set background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    return scene;
}

// Setup camera with proper settings
export function setupCamera() {
    const camera = new THREE.PerspectiveCamera(
        75, 
        window.innerWidth / window.innerHeight, 
        0.1, 
        CONSTANTS.STARFIELD_RADIUS * 3
    );
    
    // Set initial camera position
    camera.position.set(150, 100, 150);
    
    return camera;
}

// Setup WebGL renderer with proper settings
export function setupRenderer() {
    const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        powerPreference: "high-performance",
        alpha: true // Enable alpha for better compositing
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.physicallyCorrectLights = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Add to DOM
    document.body.appendChild(renderer.domElement);
    
    return renderer;
}

// Setup camera controls
export function setupControls(camera, renderer) {
    const controls = new OrbitControls(camera, renderer.domElement);
    
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10; // Allow closer zoom
    controls.maxDistance = CONSTANTS.STARFIELD_RADIUS * 0.8; // Allow zooming out to see the stars
    controls.target.set(0, 0, 0);
    
    return controls;
}

// Setup all lights in the scene
export function setupLighting(scene) {
    // Ambient light
    scene.add(new THREE.AmbientLight(0xffffff, CONSTANTS.AMBIENT_LIGHT_INTENSITY * 1.5));

    // Sun point light
    const sunLight = new THREE.PointLight(
        0xffffee, 
        CONSTANTS.SUN_POINT_LIGHT_INTENSITY * 1.5, 
        0, 
        CONSTANTS.SUN_POINT_LIGHT_DECAY * 0.8
    );
    sunLight.position.set(0, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = CONSTANTS.STARFIELD_RADIUS * 1.2;
    scene.add(sunLight);

    // Sun glow light
    const sunGlowLight = new THREE.PointLight(
        CONSTANTS.SUN_EMISSIVE_COLOR, 
        CONSTANTS.SUN_GLOW_LIGHT_INTENSITY * 1.5, 
        CONSTANTS.SUN_GLOW_LIGHT_DISTANCE * 2, 
        CONSTANTS.SUN_GLOW_LIGHT_DECAY * 0.8
    );
    sunGlowLight.position.set(0, 0, 0);
    scene.add(sunGlowLight);

    // Directional lights from multiple angles
    const dirLight1 = new THREE.DirectionalLight(0xffffff, CONSTANTS.DIR_LIGHT_INTENSITY * 2.0);
    dirLight1.position.set(1, 0.5, 0.5).normalize();
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffee, CONSTANTS.DIR_LIGHT_INTENSITY * 1.5);
    dirLight2.position.set(-1, -0.5, -0.5).normalize();
    scene.add(dirLight2);

    const dirLight3 = new THREE.DirectionalLight(0xffffee, CONSTANTS.DIR_LIGHT_INTENSITY * 1.5);
    dirLight3.position.set(0, 1, 0).normalize();
    scene.add(dirLight3);

    // Hemisphere light for better ambient illumination
    const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, CONSTANTS.HEMI_LIGHT_INTENSITY * 1.0);
    scene.add(hemiLight);
}

// Handle window resize
export function handleWindowResize(camera, renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}