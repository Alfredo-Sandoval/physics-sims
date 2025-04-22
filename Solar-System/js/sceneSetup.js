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
  camera.position.set(150, 100, 150);
  return camera;
}

/* Renderer ------------------------------------------------------------- */
export function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.physicallyCorrectLights = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

/* OrbitControls -------------------------------------------------------- */
export function setupControls(camera, renderer) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 10;
  controls.maxDistance = CONSTANTS.STARFIELD_RADIUS * 0.8;
  controls.target.set(0, 0, 0);
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
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = CONSTANTS.STARFIELD_RADIUS * 1.2;
  sunLight.shadow.bias = -0.0001;
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
