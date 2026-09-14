// --- Scene Setup -------------------------------------------------------
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as CONSTANTS from "../core/config.js";
import { debug as logDebug } from "../core/logger.js";
import { getViewportSize } from "../core/viewport.js";

/* Scene ---------------------------------------------------------------- */
export function setupScene(environmentTexture) {
  // MODIFIED: Accept environment texture
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Set the loaded starfield texture as the environment map
  if (environmentTexture) {
    scene.environment = environmentTexture;
    logDebug("SceneSetup", "Environment map assigned to scene.");
  }

  return scene;
}

export function getRecommendedPixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  let maxPR = 2;
  try {
    const isSmallScreen = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (isSmallScreen || lowMemory || saveData) {
      maxPR = 1.5;
    }
  } catch {}
  return Math.min(dpr, maxPR);
}

/* Camera --------------------------------------------------------------- */
export function getInnerSystemCameraPosition(camera) {
  // A higher oblique view separates inner orbits; portrait screens need more room.
  const distance = 280 * Math.max(1, 1.2 / camera.aspect);
  return new THREE.Vector3(1, 1.6, 1).normalize().multiplyScalar(distance);
}

export function setupCamera() {
  const { width, height } = getViewportSize();
  const camera = new THREE.PerspectiveCamera(
    60,
    width / height,
    0.1,
    CONSTANTS.STARFIELD_RADIUS * 3 // far plane covers stars
  );
  camera.position.copy(getInnerSystemCameraPosition(camera));
  return camera;
}

/* Renderer ------------------------------------------------------------- */
export function setupRenderer() {
  const { width, height } = getViewportSize();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
    precision: "mediump",
    logarithmicDepthBuffer: false,
    preserveDrawingBuffer: false, // Save memory
    stencil: false, // Save memory
  });
  renderer.setSize(width, height);
  const pixelRatio = getRecommendedPixelRatio();
  renderer.setPixelRatio(pixelRatio);
  renderer.userData = renderer.userData || {};
  renderer.userData.originalPixelRatio = pixelRatio;
  renderer.userData.maxPixelRatio = pixelRatio;
  renderer.shadowMap.enabled = false; // Off by default; toggled via UI checkbox
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // Manual shadow updates for better performance
  // three r169 uses physically-based lighting by default; no legacy toggle needed
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Tone mapping for improved visuals
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  // Memory optimizations
  if (renderer.debug) renderer.debug.checkShaderErrors = false;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

/* OrbitControls -------------------------------------------------------- */
export function setupControls(camera, renderer) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = true; // scroll-wheel zoom
  // Default ON for mouse: zoom toward cursor feels more natural and avoids
  // being pulled toward the origin; can be toggled via localStorage.
  try {
    const pref = localStorage.getItem("sim:zoomToCursor");
    controls.zoomToCursor = pref === null ? true : pref === "true";
  } catch {
    controls.zoomToCursor = true;
  }
  // Wheel response (can override via localStorage 'sim:zoomSpeed')
  let wheelSpeed = 1.2; // Increased from 0.22 based on user feedback
  try {
    const stored = parseFloat(localStorage.getItem('sim:zoomSpeed'));
    if (Number.isFinite(stored) && stored > 0.01 && stored < 5) wheelSpeed = stored;
  } catch {}
  controls.zoomSpeed = wheelSpeed;
  controls.enablePan = true;
  controls.panSpeed = 0.8;
  controls.rotateSpeed = 0.8;
  controls.screenSpacePanning = false;
  // Prevent dollying the camera inside the Sun at origin
  controls.minDistance = Math.max(
    CONSTANTS.ZOOM.MIN_DISTANCE_BASE,
    CONSTANTS.SUN_RADIUS * CONSTANTS.ZOOM.NEAR_SUN_FACTOR
  );
  controls.maxDistance = CONSTANTS.STARFIELD_RADIUS * 3;
  controls.target.set(0, 0, 0);
  controls.update();
  return controls;
}

/* Lighting ------------------------------------------------------------- */
let bounceFillLight = null;

export function setupLighting(scene) {
  // Ambient
  scene.add(new THREE.AmbientLight(0x282828, CONSTANTS.AMBIENT_LIGHT_INTENSITY));

  // Subtle hemisphere fill to keep night sides from going flat black
  const hemi = new THREE.HemisphereLight(
    CONSTANTS.HEMI_LIGHT_SKY_COLOR,
    CONSTANTS.HEMI_LIGHT_GROUND_COLOR,
    CONSTANTS.HEMI_LIGHT_INTENSITY
  );
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  // Sun point light
  const sunLight = new THREE.PointLight(
    0xffffee,
    CONSTANTS.SUN_POINT_LIGHT_INTENSITY * 2.5,
    0,
    CONSTANTS.SUN_POINT_LIGHT_DECAY
  );
  sunLight.position.set(0, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(512, 512); // Reduced from 1024 for better performance
  sunLight.shadow.camera.near = 20; // Optimized near plane
  sunLight.shadow.camera.far = 500; // Reduced far plane for better shadow quality
  sunLight.shadow.bias = -0.0005; // Adjusted bias for lower resolution
  sunLight.shadow.radius = 2; // Reduced soft shadow radius
  sunLight.shadow.blurSamples = 4; // Reduced blur samples
  scene.add(sunLight);

  // Optional gentle bounce light (disabled when intensity is 0)
  if (CONSTANTS.BOUNCE_LIGHT_INTENSITY > 0) {
    bounceFillLight = new THREE.DirectionalLight(0x152233, CONSTANTS.BOUNCE_LIGHT_INTENSITY);
    bounceFillLight.position.set(-1, 0.4, -0.6).normalize().multiplyScalar(400);
    bounceFillLight.target.position.set(0, 0, 0);
    scene.add(bounceFillLight);
    scene.add(bounceFillLight.target);
  } else {
    bounceFillLight = null;
  }

  // Removed separate glow light to keep the sun less glaring
}

export function updateBounceLight(camera, selectedBody) {
  if (!bounceFillLight || !camera) return;
  if (selectedBody && selectedBody.userData.type !== "star") {
    bounceFillLight.intensity = CONSTANTS.INSPECTION_LIGHT_INTENSITY;
    bounceFillLight.color.setHex(0xffffff);
    bounceFillLight.position.copy(camera.position);
    selectedBody.getWorldPosition(bounceFillLight.target.position);
    bounceFillLight.target.updateMatrixWorld();
    return;
  }
  bounceFillLight.intensity = CONSTANTS.BOUNCE_LIGHT_INTENSITY;
  bounceFillLight.color.setHex(0x152233);
  const dir = bounceFillLight.position.copy(camera.position).normalize();
  if (!Number.isFinite(dir.x) || !Number.isFinite(dir.y) || !Number.isFinite(dir.z)) {
    return;
  }
  bounceFillLight.position.copy(dir.multiplyScalar(CONSTANTS.STARFIELD_RADIUS * 0.4));
  bounceFillLight.target.position.set(0, 0, 0);
  bounceFillLight.target.updateMatrixWorld();
}

/* Resize handler ------------------------------------------------------- */
// Removed the setTimeout for immediate resizing
export function handleWindowResize(camera, renderer) {
  // Clear any pending resize (if we re-add debouncing later)
  // clearTimeout(resizeTimeout);

  if (!camera || !renderer) return; // Check if objects still exist

  const { width, height } = getViewportSize();

  // Resize without logging spam

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
