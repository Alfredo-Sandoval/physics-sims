// File: Solar-System/js/sceneSetup.js
// --- Scene Setup -------------------------------------------------------
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as CONSTANTS from "./constants.js";

/* Scene ---------------------------------------------------------------- */
export function setupScene(environmentTexture) {
  // MODIFIED: Accept environment texture
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Set the loaded starfield texture as the environment map
  if (environmentTexture) {
    scene.environment = environmentTexture;
    console.log("[SceneSetup] Environment map assigned to scene.");
  }

  return scene;
}

/* Camera --------------------------------------------------------------- */
export function setupCamera() {
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    CONSTANTS.STARFIELD_RADIUS * 3 // far plane covers stars
  );
  camera.position.set(200, 150, 200); // Start at reasonable distance
  return camera;
}

/* Renderer ------------------------------------------------------------- */
export function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: true,
    preserveDrawingBuffer: false, // Save memory
    stencil: false, // Save memory
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Limit pixel ratio to prevent excessive memory usage on high-DPI displays
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // Manual shadow updates for better performance
  renderer.physicallyCorrectLights = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Memory optimizations
  renderer.debug.checkShaderErrors = false;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

/* OrbitControls -------------------------------------------------------- */
export function setupControls(camera, renderer) {
  // Completely fresh OrbitControls instance
  const controls = new OrbitControls(camera, renderer.domElement);
  
  // Reset everything to absolute defaults
  controls.reset();
  
  // DISABLE OrbitControls zoom completely
  controls.enableZoom = false;
  controls.enableRotate = true;
  controls.enablePan = true;
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  
  // Force update
  controls.update();
  
  console.log("[SceneSetup] OrbitControls created with zoom DISABLED");
  
  // Manual zoom implementation
  const minDistance = 50;
  const maxDistance = 800;
  const zoomSpeed = 0.05; // Much smaller increments
  
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    // Stop camera following when user manually zooms
    if (window.setCameraFollowTarget) {
      window.setCameraFollowTarget(null);
    }
    
    const currentDistance = camera.position.distanceTo(controls.target);
    const zoomDelta = e.deltaY * zoomSpeed;
    
    console.log(`[MANUAL ZOOM] Delta: ${e.deltaY}, Current: ${currentDistance.toFixed(1)}, Zoom delta: ${zoomDelta.toFixed(2)}`);
    
    // Calculate new distance
    const newDistance = Math.max(minDistance, Math.min(maxDistance, currentDistance + zoomDelta));
    
    // Move camera towards/away from target
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).add(direction.multiplyScalar(newDistance));
    
    console.log(`[MANUAL ZOOM] New distance: ${newDistance.toFixed(1)}`);
    
  }, { passive: false });
  
  return controls;
}

/* Lighting ------------------------------------------------------------- */
export function setupLighting(scene) {
  // Ambient
  scene.add(
    new THREE.AmbientLight(0x282828, CONSTANTS.AMBIENT_LIGHT_INTENSITY)
  );

  // Sun point light
  const sunLight = new THREE.PointLight(
    0xffffee,
    CONSTANTS.SUN_POINT_LIGHT_INTENSITY * 2.5,
    0,
    CONSTANTS.SUN_POINT_LIGHT_DECAY
  );
  sunLight.position.set(0, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024); // Reduced from 2048 for better performance
  sunLight.shadow.camera.near = 20; // Optimized near plane
  sunLight.shadow.camera.far = 500; // Reduced far plane for better shadow quality
  sunLight.shadow.bias = -0.0005; // Adjusted bias for lower resolution
  sunLight.shadow.radius = 4; // Soft shadow radius
  sunLight.shadow.blurSamples = 8; // Reduced blur samples
  scene.add(sunLight);

  // Sun glow light (subtle bloom)
  const glow = new THREE.PointLight(
    CONSTANTS.SUN_EMISSIVE_COLOR,
    CONSTANTS.SUN_GLOW_LIGHT_INTENSITY,
    CONSTANTS.SUN_GLOW_LIGHT_DISTANCE,
    CONSTANTS.SUN_GLOW_LIGHT_DECAY
  );
  glow.position.set(0, 0, 0);
  scene.add(glow);
}

/* Resize handler ------------------------------------------------------- */
// Removed the setTimeout for immediate resizing
export function handleWindowResize(camera, renderer) {
  // Clear any pending resize (if we re-add debouncing later)
  // clearTimeout(resizeTimeout);

  if (!camera || !renderer) return; // Check if objects still exist

  const width = window.innerWidth;
  const height = window.innerHeight;

  console.log(`[Resize] Updating immediately to ${width}x${height}`); // Add logging

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
