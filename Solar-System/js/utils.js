// --- Utility Functions -------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";
import { eccentricAnomaly, trueAnomaly, radius } from "./kepler.js"; // Import Kepler helpers

/* Centralised texture loader ------------------------------------------ */
/**
 * Loads a texture with correct colour‑space and basic error logging.
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
  return tex;
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

/* Planet material factory --------------------------------------------- */
export function createPlanetMaterial(filename, loader) {
  const texture = filename ? loadTexture(filename, loader) : null;
  return new THREE.MeshStandardMaterial({
    map: texture ?? undefined,
    color: texture ? 0xffffff : 0x888888, // grey placeholder if missing
    roughness: CONSTANTS.PLANET_ROUGHNESS,
    metalness: CONSTANTS.PLANET_METALNESS,
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
  };

  if (elements.a <= 0) {
    console.warn(
      `Skipping orbit line for ${cfg.name}: invalid semi-major axis ${elements.a}`
    );
    return null;
  }

  for (let i = 0; i <= segments; i++) {
    const M = (i / segments) * 2 * Math.PI; // Mean anomaly for this segment
    const E = eccentricAnomaly(M, elements.e); // Solve Kepler's equation
    const ν = trueAnomaly(E, elements.e); // True anomaly
    const r = radius(elements.a, elements.e, ν); // Radius at this point

    // Position in orbital plane (periapsis along +X)
    let x0 = r * Math.cos(ν);
    let y0 = r * Math.sin(ν);

    // Rotate by argument of periapsis ω
    const cosω = Math.cos(elements.ω);
    const sinω = Math.sin(elements.ω);
    const x = x0 * cosω - y0 * sinω;
    const y = x0 * sinω + y0 * cosω;

    // Scale and add point (y maps to scene Z)
    points.push(new THREE.Vector3(x * scaleFactor, 0, y * scaleFactor));
  }

  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: colour, linewidth: 1 });
  const line = new THREE.LineLoop(geom, mat);
  line.userData = { isOrbitLine: true };
  if (parent) parent.add(line);
  return line;
}
