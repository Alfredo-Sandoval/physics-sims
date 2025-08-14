// File: Solar-System/js/utils.js
// --- Utility Functions -------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";
import { eccentricAnomaly, trueAnomaly, radius } from "./kepler.js"; // Import Kepler helpers

/* Texture cache for performance ---------------------------------------- */
const textureCache = new Map();

/* Centralised texture loader ------------------------------------------ */
/**
 * Loads a texture with correct colour‑space, caching, and error handling.
 * Assumes textureLoader.setPath('./textures/') has already been called.
 *
 * @param {string} filename  The filename within the textures folder.
 * @param {THREE.TextureLoader} loader  Shared THREE.TextureLoader instance.
 * @returns {THREE.Texture}  (asynchronously filled)
 */
export function loadTexture(filename, loader) {
  if (!filename || !loader) {
    console.error("loadTexture: missing filename or loader");
    return new THREE.Texture(); // placeholder
  }

  // Check cache first
  if (textureCache.has(filename)) {
    return textureCache.get(filename);
  }

  const tex = loader.load(
    filename,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
    },
    undefined,
    (err) => {
      console.error(`Texture load failed: ${filename}`, err);
      // Create a simple colored texture as fallback
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#666666";
      ctx.fillRect(0, 0, 64, 64);
      const fallbackTex = new THREE.CanvasTexture(canvas);
      fallbackTex.colorSpace = THREE.SRGBColorSpace;
      tex.image = canvas;
      tex.needsUpdate = true;
    }
  );
  
  // Cache the texture
  textureCache.set(filename, tex);
  return tex;
}

/**
 * Clear texture cache (useful for cleanup)
 */
export function clearTextureCache() {
  textureCache.clear();
}

/* Standardized userData factories ------------------------------------ */
export function createPlanetUserData(config, orbitRadius, dispRadius) {
  return {
    isSelectable: true,
    name: config.name,
    type: "planet",
    config: config,
    orbitRadius: orbitRadius,
    orbitSpeed: config.calculatedOrbitSpeed,
    rotationSpeed: config.calculatedRotationSpeed,
    rotationDirection: config.rotationDirection,
    initialAngle: config.initialAngleRad || config.initialAngle || 0,
    currentAngle: config.initialAngleRad || config.initialAngle || 0,
    axialTilt: (config.axialTilt || 0) * THREE.MathUtils.DEG2RAD,
    displayRadius: dispRadius
  };
}

export function createMoonUserData(moonConfig, planetConfig, orbitRadius, moonRadius) {
  return {
    isSelectable: true,
    name: moonConfig.name,
    type: "moon",
    parentPlanetName: planetConfig.name,
    config: moonConfig,
    orbitRadius: orbitRadius,
    orbitSpeed: moonConfig.calculatedOrbitSpeed,
    orbitDirection: moonConfig.orbitDirection,
    rotationSpeed: moonConfig.calculatedRotationSpeed,
    rotationDirection: moonConfig.rotationDirection,
    initialAngle: Math.random() * Math.PI * 2,
    currentAngle: Math.random() * Math.PI * 2,
    displayRadius: moonRadius,
    displayInfo: {
      Size: `${(moonConfig.actualRadiusEarthRadii * CONSTANTS.EARTH_RADIUS_KM).toFixed(0)} km radius`,
      Orbit: `${moonConfig.orbitRadiusKm.toLocaleString()} km from ${planetConfig.name}`,
      OrbitalPeriod: `${Math.abs(moonConfig.orbitalPeriod || moonConfig.orbitalPeriodDays || 0).toFixed(2)} days${(moonConfig.orbitalPeriod || moonConfig.orbitalPeriodDays || 0) < 0 ? " (retrograde)" : ""}`,
      RotationPeriod: `${Math.abs(moonConfig.rotationPeriod || moonConfig.rotationPeriodDays || 0).toFixed(2)} days${moonConfig.rotationPeriod === moonConfig.orbitalPeriod ? " (tidally locked)" : ""}`,
      ParentPlanet: planetConfig.name,
      ...(moonConfig.info || {})
    }
  };
}

/* Look‑up helper ------------------------------------------------------- */
export function findCelestialBodyByName(name, list) {
  if (!name || !Array.isArray(list)) return null;
  for (const obj of list) {
    if (obj.userData?.name === name) return obj;
    if (obj.name === name) return obj; // fallback
  }
  return null;
}

/* Procedural star sprite ---------------------------------------------- */
export function createStarTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.5)");
  g.addColorStop(0.65, "rgba(255,255,255,0.1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/* Text label sprite --------------------------------------------------- */
export function createTextSprite(text, options = {}) {
  const {
    font = '12px sans-serif',
    padding = 4,
    bg = 'rgba(0,0,0,0.4)',
    fg = '#fff',
  } = options;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + padding * 2;
  const h = 20 + padding * 2;
  canvas.width = w;
  canvas.height = h;
  // redraw with correct size
  const ctx2 = canvas.getContext('2d');
  ctx2.font = font;
  ctx2.fillStyle = bg;
  ctx2.fillRect(0, 0, w, h);
  ctx2.fillStyle = fg;
  ctx2.textBaseline = 'middle';
  ctx2.fillText(text, padding, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const scale = 12; // world units
  sprite.scale.set(scale, (scale * h) / w, 1);
  return sprite;
}

/* Planet material factory --------------------------------------------- */
export function createPlanetMaterial(filename, loader) {
  const texture = filename ? loadTexture(filename, loader) : null;
  return new THREE.MeshStandardMaterial({
    map: texture ?? undefined,
    color: texture ? 0xffffff : 0x888888, // grey placeholder if missing
    roughness: 0.9,
    metalness: 0.05,
  });
}

/* Atmosphere material (no Fresnel/rim) ------------------------------- */
export function createAtmosphereMaterial(color = 0xffffff, baseOpacity = 0.2) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: baseOpacity,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

/* Orbit line generator ------------------------------------------------- */
/**
 * Creates an elliptical orbit line based on Keplerian elements.
 *
 * @param {object} cfg Planet configuration object containing kepler elements and orbitRadiusAU.
 * @param {number} scaleFactor Scale factor (e.g., CONSTANTS.ORBIT_SCALE_FACTOR).
 * @param {number} colour Line color.
 * @param {number} segments Number of line segments.
 * @param {THREE.Object3D} parent Object to add the line to.
 * @returns {THREE.LineLoop}
 */
export function createOrbitLine(cfg, scaleFactor, colour, segments, parent) {
  const points = [];
  const elements = {
    a: cfg.orbitRadiusAU, // Semi-major axis
    e: cfg.info?.orbitalEccentricity ?? 0, // Eccentricity
    ω: (cfg.kepler?.argPeriapsisDeg ?? 0) * THREE.MathUtils.DEG2RAD, // Arg of Periapsis
    i: (cfg.kepler?.inclinationDeg ?? cfg.info?.orbitalInclinationDeg ?? 0) * THREE.MathUtils.DEG2RAD,
    Ω: (cfg.kepler?.longAscNodeDeg ?? 0) * THREE.MathUtils.DEG2RAD,
  };

  if (elements.a <= 0) {
    console.warn(
      `Skipping orbit line for ${cfg.name}: invalid semi-major axis ${elements.a}`
    );
    return null;
  }

  for (let k = 0; k <= segments; k++) {
    const M = (k / segments) * 2 * Math.PI; // Mean anomaly for this segment
    const E = eccentricAnomaly(M, elements.e); // Solve Kepler's equation
    const ν = trueAnomaly(E, elements.e); // True anomaly
    const r = radius(elements.a, elements.e, ν); // Radius at this point

    // Position in orbital plane (periapsis along +X), rotate by ω inside plane
    const cosω = Math.cos(elements.ω), sinω = Math.sin(elements.ω);
    const xω = r * Math.cos(ν) * cosω - r * Math.sin(ν) * sinω;
    const zω = r * Math.cos(ν) * sinω + r * Math.sin(ν) * cosω; // use as Z prior to tilt

    // Apply Ry(Ω) then Rx(i) in a Y-up world (XZ is base plane)
    const cosO = Math.cos(elements.Ω), sinO = Math.sin(elements.Ω);
    const x1 = xω * cosO + zω * sinO;
    const z1 = -xω * sinO + zω * cosO;
    const cosi = Math.cos(elements.i), sini = Math.sin(elements.i);
    const X = x1;
    const Y = -z1 * sini;
    const Z = z1 * cosi;

    points.push(new THREE.Vector3(X * scaleFactor, Y * scaleFactor, Z * scaleFactor));
  }

  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: colour, linewidth: 1 });
  const line = new THREE.LineLoop(geom, mat);
  line.userData = { isOrbitLine: true };
  if (parent) parent.add(line);
  return line;
}
