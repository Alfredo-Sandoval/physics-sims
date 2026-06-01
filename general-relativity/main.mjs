import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SURFACE_SIZE = 180;
const SURFACE_SEGMENTS = 140;
const ORBIT_GUIDE_SEGMENTS = 180;
const TAU = Math.PI * 2;

const state = {
  centralMass: 165,
  orbitingMass: 18,
  falloff: 1.42,
  orbitRadius: 31,
  orbitSpeed: 0.32,
  timeScale: 1,
  showSurface: true,
  showWireframe: true,
  showHud: true,
  playing: true,
  orbitPhase: 0,
};

const ui = {
  hud: document.getElementById("hud"),
  playPauseButton: document.getElementById("playPauseButton"),
  resetViewButton: document.getElementById("resetViewButton"),
  surfaceToggle: document.getElementById("surfaceToggle"),
  wireframeToggle: document.getElementById("wireframeToggle"),
  hudToggleBtn: document.getElementById("hudToggleBtn"),
  hudClose: document.getElementById("hudClose"),
  orbitAngleReadout: document.getElementById("orbitAngleReadout"),
  orbitHeightReadout: document.getElementById("orbitHeightReadout"),
  wellDepthReadout: document.getElementById("wellDepthReadout"),
  fpsReadout: document.getElementById("fpsReadout"),
};

const sliderBindings = [
  {
    id: "centralMass",
    valueId: "centralMassValue",
    key: "centralMass",
    format: (value) => `${Math.round(value)} u`,
  },
  {
    id: "orbitingMass",
    valueId: "orbitingMassValue",
    key: "orbitingMass",
    format: (value) => `${Math.round(value)} u`,
  },
  {
    id: "falloff",
    valueId: "falloffValue",
    key: "falloff",
    format: (value) => value.toFixed(2),
  },
  {
    id: "orbitRadius",
    valueId: "orbitRadiusValue",
    key: "orbitRadius",
    format: (value) => `${value.toFixed(1)} u`,
  },
  {
    id: "orbitSpeed",
    valueId: "orbitSpeedValue",
    key: "orbitSpeed",
    format: (value) => `${value.toFixed(2)} rad/s`,
  },
  {
    id: "timeScale",
    valueId: "timeScaleValue",
    key: "timeScale",
    format: (value) => `${value.toFixed(2)}x`,
  },
];

let scene;
let camera;
let renderer;
let controls;
let clock;

let surfaceGeometry;
let surfaceMesh;
let wireframeMesh;
let centralSphere;
let orbitingSphere;
let orbitGuide;
let starfield;
let primaryLight;
let centralGlow;

let baseX;
let baseWorldZ;
let heights;
let colors;
let fpsEstimate = 60;
let minHeight = 0;

const colorFlat = new THREE.Color("#0e1e30");
const colorSlope = new THREE.Color("#1a4568");
const colorDeep = new THREE.Color("#3ac8ff");
const colorHot = new THREE.Color("#88e8ff");

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#03050b");
  scene.fog = new THREE.FogExp2("#040812", 0.0065);

  camera = new THREE.PerspectiveCamera(
    48,
    window.innerWidth / window.innerHeight,
    0.1,
    900
  );
  resetCamera();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  document.getElementById("viewport").appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 20;
  controls.maxDistance = 180;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.target.set(0, -4, 0);

  clock = new THREE.Clock();

  addLights();
  addStarfield();
  addSurface();
  addBodies();
  addOrbitGuide();
  bindInterface();
  refreshControlLabels();
  syncToggleButtons();
  syncOrbitProbe();
  updateSurface();
  updateBodies();

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("keydown", onKeyDown);
}

function addLights() {
  const ambient = new THREE.HemisphereLight("#7bb8ff", "#04101c", 0.6);
  scene.add(ambient);

  primaryLight = new THREE.PointLight("#ffd8a0", 38, 240, 2);
  primaryLight.position.set(0, 18, 0);
  scene.add(primaryLight);

  const fill = new THREE.DirectionalLight("#7ce3ff", 0.9);
  fill.position.set(-28, 20, 24);
  scene.add(fill);
}

function addStarfield() {
  const starCount = 2200;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const point = new THREE.Vector3();
  const color = new THREE.Color();

  for (let index = 0; index < starCount; index += 1) {
    const radius = 220 + Math.random() * 340;
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    point.setFromSphericalCoords(radius, phi, theta);

    starPositions[index * 3] = point.x;
    starPositions[index * 3 + 1] = point.y;
    starPositions[index * 3 + 2] = point.z;

    color
      .setHSL(0.54 + Math.random() * 0.08, 0.55, 0.7 + Math.random() * 0.2);
    starColors[index * 3] = color.r;
    starColors[index * 3 + 1] = color.g;
    starColors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
  });

  starfield = new THREE.Points(geometry, material);
  scene.add(starfield);
}

function addSurface() {
  surfaceGeometry = new THREE.PlaneGeometry(
    SURFACE_SIZE,
    SURFACE_SIZE,
    SURFACE_SEGMENTS,
    SURFACE_SEGMENTS
  );

  const positionAttribute = surfaceGeometry.attributes.position;
  const vertexCount = positionAttribute.count;

  baseX = new Float32Array(vertexCount);
  baseWorldZ = new Float32Array(vertexCount);
  heights = new Float32Array(vertexCount);
  colors = new Float32Array(vertexCount * 3);

  for (let index = 0; index < vertexCount; index += 1) {
    baseX[index] = positionAttribute.getX(index);
    baseWorldZ[index] = -positionAttribute.getY(index);
  }

  surfaceGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    roughness: 0.58,
    metalness: 0.08,
    emissive: new THREE.Color("#1a4a6a"),
    emissiveIntensity: 0.7,
    side: THREE.DoubleSide,
  });

  const wireMaterial = new THREE.MeshBasicMaterial({
    color: "#7ce3ff",
    wireframe: true,
    transparent: true,
    opacity: 0.42,
  });

  surfaceMesh = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  surfaceMesh.rotation.x = -Math.PI / 2;
  scene.add(surfaceMesh);

  wireframeMesh = new THREE.Mesh(surfaceGeometry, wireMaterial);
  wireframeMesh.rotation.x = -Math.PI / 2;
  scene.add(wireframeMesh);
}

function addBodies() {
  // Central star: bright core
  const centralGeometry = new THREE.SphereGeometry(4.2, 48, 48);
  const centralMaterial = new THREE.MeshBasicMaterial({
    color: "#fff8ee",
  });
  centralSphere = new THREE.Mesh(centralGeometry, centralMaterial);
  scene.add(centralSphere);

  // Soft glow sprite
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const ctx = glowCanvas.getContext("2d");
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255, 220, 140, 0.6)");
  grad.addColorStop(0.3, "rgba(255, 180, 80, 0.2)");
  grad.addColorStop(0.7, "rgba(255, 140, 40, 0.04)");
  grad.addColorStop(1, "rgba(255, 100, 20, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  centralGlow = new THREE.Sprite(glowMat);
  centralGlow.scale.set(28, 28, 1);
  scene.add(centralGlow);

  // Orbiting body
  const orbitingGeometry = new THREE.SphereGeometry(1.55, 28, 28);
  const orbitingMaterial = new THREE.MeshStandardMaterial({
    color: "#b9f4ff",
    emissive: "#3db6ff",
    emissiveIntensity: 0.62,
    roughness: 0.42,
    metalness: 0.05,
  });
  orbitingSphere = new THREE.Mesh(orbitingGeometry, orbitingMaterial);
  scene.add(orbitingSphere);
}

function addOrbitGuide() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array((ORBIT_GUIDE_SEGMENTS + 1) * 3), 3)
  );

  const material = new THREE.LineBasicMaterial({
    color: "#ffc979",
    transparent: true,
    opacity: 0.82,
  });

  orbitGuide = new THREE.LineLoop(geometry, material);
  scene.add(orbitGuide);
}

function bindInterface() {
  for (const binding of sliderBindings) {
    const input = document.getElementById(binding.id);
    input.addEventListener("input", () => {
      state[binding.key] = Number(input.value);
      refreshControlLabels();
    });
  }

  ui.playPauseButton.addEventListener("click", () => {
    state.playing = !state.playing;
    syncToggleButtons();
  });

  ui.resetViewButton.addEventListener("click", () => {
    resetCamera();
    controls.target.set(0, -4, 0);
    controls.update();
  });

  ui.surfaceToggle.addEventListener("click", () => {
    state.showSurface = !state.showSurface;
    syncToggleButtons();
  });

  ui.wireframeToggle.addEventListener("click", () => {
    state.showWireframe = !state.showWireframe;
    syncToggleButtons();
  });

  ui.hudToggleBtn.addEventListener("click", () => {
    state.showHud = !state.showHud;
    syncToggleButtons();
  });

  ui.hudClose.addEventListener("click", () => {
    state.showHud = false;
    syncToggleButtons();
  });
}

function refreshControlLabels() {
  for (const binding of sliderBindings) {
    const output = document.getElementById(binding.valueId);
    output.textContent = binding.format(state[binding.key]);
  }
}

function syncToggleButtons() {
  ui.playPauseButton.dataset.active = String(state.playing);
  ui.playPauseButton.textContent = state.playing ? "Pause" : "Play";

  ui.surfaceToggle.dataset.on = String(state.showSurface);
  ui.surfaceToggle.textContent = state.showSurface ? "Surf" : "Surf";

  ui.wireframeToggle.dataset.on = String(state.showWireframe);
  ui.wireframeToggle.textContent = state.showWireframe ? "Grid" : "Grid";

  ui.hud.classList.toggle("is-open", state.showHud);
  ui.hud.setAttribute("aria-hidden", String(!state.showHud));
  ui.hudToggleBtn.dataset.open = String(state.showHud);
  ui.hudToggleBtn.setAttribute("aria-expanded", String(state.showHud));
  ui.hudToggleBtn.innerHTML = state.showHud ? "&#x2715;" : "&#x2699;";
}

function onKeyDown(event) {
  if (event.code === "Space") {
    event.preventDefault();
    state.playing = !state.playing;
    syncToggleButtons();
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "w") {
    state.showWireframe = !state.showWireframe;
    syncToggleButtons();
  } else if (key === "h") {
    state.showHud = !state.showHud;
    syncToggleButtons();
  }
}

function getCentralSoftening() {
  return 18 + state.centralMass * 0.2;
}

function getOrbitingSoftening() {
  return 8 + state.orbitingMass * 0.32;
}

function gravityContribution(dx, dz, strength, softening) {
  const falloffExponent = Math.max(0.4, state.falloff) * 0.5;
  const distanceSquared = dx * dx + dz * dz;
  return -strength / Math.pow(distanceSquared + softening, falloffExponent);
}

function sampleCentralCurvature(x, z) {
  return gravityContribution(x, z, state.centralMass, getCentralSoftening());
}

function sampleOrbitingCurvature(x, z) {
  const dx = x - orbitingSphere.position.x;
  const dz = z - orbitingSphere.position.z;
  return gravityContribution(dx, dz, state.orbitingMass, getOrbitingSoftening());
}

function sampleCurvature(x, z, includeOrbiting = true) {
  const total = sampleCentralCurvature(x, z);
  return includeOrbiting ? total + sampleOrbitingCurvature(x, z) : total;
}

function updateSurface() {
  const positionAttribute = surfaceGeometry.attributes.position;
  const colorAttribute = surfaceGeometry.attributes.color;
  let nextMinHeight = Infinity;
  let nextMaxHeight = -Infinity;

  for (let index = 0; index < positionAttribute.count; index += 1) {
    const height = sampleCurvature(baseX[index], baseWorldZ[index], true);
    heights[index] = height;
    nextMinHeight = Math.min(nextMinHeight, height);
    nextMaxHeight = Math.max(nextMaxHeight, height);
    positionAttribute.setZ(index, height);
  }

  const range = Math.max(0.001, nextMaxHeight - nextMinHeight);
  const tint = new THREE.Color();

  for (let index = 0; index < positionAttribute.count; index += 1) {
    const d = 1 - (heights[index] - nextMinHeight) / range;
    // Flat areas: dark blue-grey. Slopes: teal. Deep well: bright cyan glow
    tint.copy(colorFlat);
    tint.lerp(colorSlope, Math.pow(d, 0.6) * 0.7);
    tint.lerp(colorDeep, Math.pow(d, 1.2) * 0.85);
    tint.lerp(colorHot, Math.pow(d, 2.5) * 0.5);

    colorAttribute.setXYZ(index, tint.r, tint.g, tint.b);
  }

  minHeight = nextMinHeight;
  positionAttribute.needsUpdate = true;
  colorAttribute.needsUpdate = true;
  surfaceGeometry.computeVertexNormals();

  surfaceMesh.visible = state.showSurface;
  wireframeMesh.visible = state.showWireframe;
}

function updateBodies() {
  const orbitX = orbitingSphere.position.x;
  const orbitZ = orbitingSphere.position.z;
  const centralY = sampleCurvature(0, 0, false) + 4.6;
  const orbitY = sampleCurvature(orbitX, orbitZ, true) + 1.7;

  centralSphere.position.set(0, centralY, 0);
  centralGlow.position.copy(centralSphere.position);
  const glowSize = 22 + state.centralMass * 0.06;
  centralGlow.scale.set(glowSize, glowSize, 1);

  primaryLight.position.set(0, centralY + 12, 0);
  primaryLight.intensity = 28 + state.centralMass * 0.08;

  orbitingSphere.position.set(orbitX, orbitY, orbitZ);

  updateOrbitGuide();

  ui.orbitAngleReadout.textContent = `${formatAngle(state.orbitPhase)} `;
  ui.orbitHeightReadout.textContent = `${orbitY.toFixed(2)} `;
  ui.wellDepthReadout.textContent = `${Math.abs(minHeight).toFixed(2)} `;
}

function updateOrbitGuide() {
  const attribute = orbitGuide.geometry.attributes.position;

  for (let index = 0; index <= ORBIT_GUIDE_SEGMENTS; index += 1) {
    const angle = (index / ORBIT_GUIDE_SEGMENTS) * TAU;
    const x = Math.cos(angle) * state.orbitRadius;
    const z = Math.sin(angle) * state.orbitRadius;
    const y = sampleCentralCurvature(x, z) + 0.3;
    attribute.setXYZ(index, x, y, z);
  }

  attribute.needsUpdate = true;
}

function formatAngle(angle) {
  const normalized = ((angle % TAU) + TAU) % TAU;
  return Math.round(THREE.MathUtils.radToDeg(normalized));
}

function resetCamera() {
  if (!camera) {
    return;
  }

  camera.position.set(40, 30, 54);
  camera.lookAt(0, -4, 0);
}

function syncOrbitProbe() {
  orbitingSphere.position.x = Math.cos(state.orbitPhase) * state.orbitRadius;
  orbitingSphere.position.z = Math.sin(state.orbitPhase) * state.orbitRadius;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  fpsEstimate = THREE.MathUtils.lerp(fpsEstimate, 1 / Math.max(delta, 0.001), 0.08);

  if (state.playing) {
    state.orbitPhase += delta * state.orbitSpeed * state.timeScale;
  }

  syncOrbitProbe();

  starfield.rotation.y += delta * 0.01;
  starfield.rotation.x += delta * 0.002;

  updateSurface();
  updateBodies();
  controls.update();
  renderer.render(scene, camera);

  ui.fpsReadout.textContent = `${Math.round(fpsEstimate)} `;
}
