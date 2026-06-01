// File: Solar-System/js/starfield.js
// --- Starfield Module --------------------------------------------------
import * as THREE from "./vendor/three/build/three.module.js";
import * as CONSTANTS from "./constants.js";
import { createStarTexture } from "./utils.js";
import { debug as logDebug } from "./logger.js";

/* ---------------------------------------------------------------------- */
/*          Public: createStarfield(scene, texture)                       */
/* ---------------------------------------------------------------------- */
/**
 * Adds a layered background starfield with both a sky texture and procedural stars.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Texture} texture Pre-loaded equirectangular background texture.
 * @returns {THREE.Group} Starfield group containing the skybox and procedural layers.
 */
export function createStarfield(scene, texture) {
  const starfield = new THREE.Group();
  starfield.name = "starfield";

  const skybox = createSkybox(texture);
  starfield.add(skybox);

  const layers = createProceduralStarLayers();
  layers.forEach((layer) => {
    if (layer) starfield.add(layer);
  });

  scene.add(starfield);
  logDebug("Starfield", `Created skybox + ${layers.filter(Boolean).length} procedural star layers.`);
  return starfield;
}

/* ---------------------------------------------------------------------- */
/*                      Private helpers                                   */
/* ---------------------------------------------------------------------- */
function createSkybox(texture) {
  const geom = new THREE.SphereGeometry(CONSTANTS.STARFIELD_RADIUS, 64, 32);
  const mat = new THREE.MeshBasicMaterial({
    map: texture ?? null,
    side: THREE.BackSide,
    color: 0xa7acb6,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  });
  return new THREE.Mesh(geom, mat);
}

function createProceduralStarLayers() {
  const spriteTexture = createStarTexture();
  spriteTexture.colorSpace = THREE.SRGBColorSpace;
  spriteTexture.needsUpdate = true;
  return CONSTANTS.STARFIELD_LAYER_CONFIGS.map((layerConfig, index) =>
    createProceduralLayer(layerConfig, index, spriteTexture)
  );
}

function createProceduralLayer(layerConfig, layerIndex, spriteTexture) {
  const count = Math.max(0, Math.floor(CONSTANTS.STAR_COUNT * Number(layerConfig?.share ?? 0)));
  if (count < 1) return null;

  const minRadius = CONSTANTS.STARFIELD_RADIUS * Number(layerConfig?.minRadiusFactor ?? 0.8);
  const maxRadius = CONSTANTS.STARFIELD_RADIUS * Number(layerConfig?.maxRadiusFactor ?? 1.0);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color(CONSTANTS.STARFIELD_TINT_COLOR);

  for (let i = 0; i < count; i++) {
    writeStarPosition(positions, i, minRadius, maxRadius);
    writeStarColor(colors, i, layerConfig, tint);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.PointsMaterial({
    map: spriteTexture,
    size: getLayerPointSize(layerConfig),
    transparent: true,
    opacity: clamp(Number(layerConfig?.opacity ?? 0.5), 0.1, 1.0),
    vertexColors: true,
    depthWrite: false,
    alphaTest: 0.01,
    sizeAttenuation: true,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.rotation.set(layerIndex * 0.17, layerIndex * 0.73, layerIndex * 0.31);
  points.userData = { isStarLayer: true, layerIndex };
  return points;
}

function writeStarPosition(target, starIndex, minRadius, maxRadius) {
  const radiusMix = Math.pow(Math.random(), 0.72);
  const radius = THREE.MathUtils.lerp(minRadius, maxRadius, radiusMix);
  const y = Math.random() * 2 - 1;
  const phi = Math.random() * Math.PI * 2;
  const planar = Math.sqrt(Math.max(0, 1 - y * y));
  const x = Math.cos(phi) * planar;
  const z = Math.sin(phi) * planar;
  const offset = starIndex * 3;
  target[offset] = x * radius;
  target[offset + 1] = y * radius;
  target[offset + 2] = z * radius;
}

function writeStarColor(target, starIndex, layerConfig, tint) {
  const color = getStarColor(layerConfig, tint);
  const offset = starIndex * 3;
  target[offset] = color.r;
  target[offset + 1] = color.g;
  target[offset + 2] = color.b;
}

function getStarColor(layerConfig, tint) {
  const temperatureRoll = Math.random();
  const hue = getTemperatureHue(temperatureRoll) + (Math.random() - 0.5) * 0.02;
  const saturationBase = Number(layerConfig?.saturation ?? 0.2);
  const saturation = clamp(saturationBase * THREE.MathUtils.lerp(0.8, 1.2, Math.random()), 0.05, 0.4);
  const lightnessMin = Number(layerConfig?.lightnessMin ?? 0.6);
  const lightnessMax = Number(layerConfig?.lightnessMax ?? 0.92);
  const lightness = THREE.MathUtils.lerp(lightnessMin, lightnessMax, Math.pow(Math.random(), 0.52));
  const color = new THREE.Color().setHSL(hue, saturation, clamp(lightness, 0.4, 1.0));
  color.lerp(tint, CONSTANTS.STARFIELD_TINT_STRENGTH * THREE.MathUtils.lerp(0.8, 1.1, Math.random()));
  return color;
}

function getLayerPointSize(layerConfig) {
  const layerSizeFactor = Number(layerConfig?.sizeFactor ?? 1.0);
  const requestedSize = CONSTANTS.STAR_BASE_SIZE * layerSizeFactor;
  const minSize = CONSTANTS.STAR_BASE_SIZE * CONSTANTS.STAR_MIN_SIZE_FACTOR;
  const maxSize = CONSTANTS.STAR_BASE_SIZE * CONSTANTS.STAR_MAX_SIZE_FACTOR;
  return clamp(requestedSize, minSize, maxSize);
}

function getTemperatureHue(roll) {
  if (roll < 0.08) return 0.08; // warm orange giants
  if (roll < 0.22) return 0.12; // yellow-white stars
  if (roll < 0.84) return 0.58; // white stars
  return 0.63; // blue-white stars
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
