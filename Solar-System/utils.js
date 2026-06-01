// File: Solar-System/js/utils.js
// --- Utility Functions -------------------------------------------------
import * as THREE from "./vendor/three/build/three.module.js";
import * as CONSTANTS from "./constants.js";
import { eccentricAnomaly, trueAnomaly, radius } from "./kepler.js"; // Import Kepler helpers
import { getTextureLoader } from "./textureService.js";
import { error as logError, warn as logWarn } from "./logger.js";

/* Texture cache for performance ---------------------------------------- */
const textureCache = new Map();

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveRadiusEarthRadii(bodyConfig) {
  const fromEarthRadii = toFiniteNumber(bodyConfig?.actualRadiusEarthRadii);
  if (Number.isFinite(fromEarthRadii)) return fromEarthRadii;
  const fromLegacy = toFiniteNumber(bodyConfig?.actualRadius);
  if (Number.isFinite(fromLegacy)) return fromLegacy;
  return null;
}

/* Centralised texture loader ------------------------------------------ */
/**
 * Loads a texture with correct colour‑space, caching, and error handling.
 * Assumes textureLoader.setPath('./textures/') has already been called.
 *
 * @param {string} filename  The filename within the textures folder.
 * @param {THREE.TextureLoader} loader  Shared THREE.TextureLoader instance.
 * @returns {THREE.Texture}  (asynchronously filled)
 */
export function loadTexture(filename, loader = getTextureLoader()) {
  if (!filename || !loader) {
    logError("Texture", "loadTexture: missing filename or loader");
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
      try {
        const maxSize = CONSTANTS.MAX_TEXTURE_SIZE;
        if (CONSTANTS.ENABLE_TEXTURE_COMPRESSION && Number.isFinite(maxSize) && maxSize > 0) {
          const img = t.image;
          const w =
            img?.naturalWidth ??
            img?.videoWidth ??
            img?.width ??
            (Number.isFinite(img?.width) ? img.width : 0);
          const h =
            img?.naturalHeight ??
            img?.videoHeight ??
            img?.height ??
            (Number.isFinite(img?.height) ? img.height : 0);
          const largest = Math.max(w || 0, h || 0);
          if (largest > maxSize && w > 0 && h > 0) {
            const scale = maxSize / largest;
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              t.image = canvas;
            }
          }
        }
      } catch (err) {
        logWarn("Texture", `Downscale skipped for ${filename}`, err);
      }
      t.needsUpdate = true;
    },
    undefined,
    (err) => {
      logError("Texture", `loadTexture failed for ${filename}`, err);
      // Create a simple colored texture as fallback and assign to the same texture object
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#666666";
        ctx.fillRect(0, 0, 64, 64);
        tex.image = canvas;
      } else {
        logWarn("Texture", `2D canvas context unavailable for ${filename}; using 1x1 fallback.`);
        tex.image = { data: new Uint8Array([102, 102, 102, 255]), width: 1, height: 1 };
      }
      tex.colorSpace = THREE.SRGBColorSpace;
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
  // Dispose textures before clearing to avoid leaking GPU memory
  try {
    for (const tex of textureCache.values()) {
      try {
        tex.dispose?.();
      } catch {}
      // If tex.image is a Canvas or ImageBitmap, no dispose needed; guard anyway
      try {
        tex.image?.close?.();
      } catch {}
    }
  } finally {
    textureCache.clear();
  }
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
    displayRadius: dispRadius,
  };
}

export function createMoonUserData(moonConfig, planetConfig, orbitRadius, moonRadius) {
  const radiusEarthRadii = resolveRadiusEarthRadii(moonConfig);
  const radiusKm = Number.isFinite(radiusEarthRadii) ? radiusEarthRadii * CONSTANTS.EARTH_RADIUS_KM : null;
  const orbitRadiusKm = toFiniteNumber(moonConfig.orbitRadiusKm);
  const orbitalPeriod = toFiniteNumber(moonConfig.orbitalPeriod ?? moonConfig.orbitalPeriodDays) ?? 0;
  const rotationPeriod = toFiniteNumber(moonConfig.rotationPeriod ?? moonConfig.rotationPeriodDays) ?? 0;
  const isTidallyLocked =
    Number.isFinite(orbitalPeriod) &&
    Number.isFinite(rotationPeriod) &&
    Math.abs(Math.abs(rotationPeriod) - Math.abs(orbitalPeriod)) < 1e-6;

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
      Size: Number.isFinite(radiusKm) ? `${radiusKm.toFixed(0)} km radius` : "—",
      Orbit: Number.isFinite(orbitRadiusKm)
        ? `${orbitRadiusKm.toLocaleString()} km from ${planetConfig.name}`
        : `Orbiting ${planetConfig.name}`,
      OrbitalPeriod: (() => {
        const retro = orbitalPeriod < 0 ? " (retrograde)" : "";
        return `${Math.abs(orbitalPeriod).toFixed(2)} days${retro}`;
      })(),
      RotationPeriod: (() => {
        const locked = isTidallyLocked ? " (tidally locked)" : "";
        return `${Math.abs(rotationPeriod).toFixed(2)} days${locked}`;
      })(),
      ParentPlanet: planetConfig.name,
      ...(moonConfig.info || {}),
    },
  };
}

const MOON_ORBIT_Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * Compute moon position in the parent-planet local frame from mean anomaly.
 * Output axes match the rest of the sim: X,Z are in-plane and Y is ecliptic north.
 *
 * @param {number} meanAnomalyRad Current mean anomaly [rad].
 * @param {object} orbit Orbit parameters.
 * @param {number} [planetAxialTiltRad=0] Parent planet axial tilt [rad].
 * @param {THREE.Vector3} [out] Optional output vector.
 * @returns {THREE.Vector3}
 */
export function getMoonLocalPosition(
  meanAnomalyRad,
  orbit,
  planetAxialTiltRad = 0,
  out = new THREE.Vector3()
) {
  const a = Number(orbit?.orbitSemiMajor ?? orbit?.orbitRadius ?? 0);
  if (!Number.isFinite(a) || a <= 0) {
    out.set(0, 0, 0);
    return out;
  }

  const eRaw = Number(orbit?.orbitEccentricity ?? 0);
  const e = Math.max(0, Math.min(0.99, Number.isFinite(eRaw) ? eRaw : 0));
  const iRaw = Number(orbit?.orbitInclinationRad ?? 0);
  const Oraw = Number(orbit?.orbitAscendingNodeRad ?? 0);
  const wRaw = Number(orbit?.orbitArgPeriapsisRad ?? 0);
  const i = Number.isFinite(iRaw) ? iRaw : 0;
  const O = Number.isFinite(Oraw) ? Oraw : 0;
  const w = Number.isFinite(wRaw) ? wRaw : 0;
  const meanAnomaly = Number(meanAnomalyRad);
  const M = THREE.MathUtils.euclideanModulo(Number.isFinite(meanAnomaly) ? meanAnomaly : 0, 2 * Math.PI);

  const E = eccentricAnomaly(M, e);
  const nu = trueAnomaly(E, e);
  const r = radius(a, e, nu);
  if (!Number.isFinite(E) || !Number.isFinite(nu) || !Number.isFinite(r)) {
    out.set(0, 0, 0);
    return out;
  }
  const u = nu + w;

  const cosu = Math.cos(u);
  const sinu = Math.sin(u);
  const cosO = Math.cos(O);
  const sinO = Math.sin(O);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);

  const xRef = r * (cosO * cosu - sinO * sinu * cosi);
  const yRef = r * (sinO * cosu + cosO * sinu * cosi);
  const zRef = r * (sinu * sini);
  if (!Number.isFinite(xRef) || !Number.isFinite(yRef) || !Number.isFinite(zRef)) {
    out.set(0, 0, 0);
    return out;
  }

  // Scene mapping keeps Y as ecliptic north, matching planet transforms.
  out.set(xRef, zRef, yRef);

  // Most regular moons are specified in the parent's equatorial frame.
  if (orbit?.orbitReference !== "ecliptic" && Number.isFinite(planetAxialTiltRad)) {
    out.applyAxisAngle(MOON_ORBIT_Z_AXIS, planetAxialTiltRad);
  }

  return out;
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
  const { font = "12px sans-serif", padding = 4, bg = "rgba(0,0,0,0.4)", fg = "#fff" } = options;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + padding * 2;
  const h = 20 + padding * 2;
  canvas.width = w;
  canvas.height = h;
  // redraw with correct size
  const ctx2 = canvas.getContext("2d");
  ctx2.font = font;
  ctx2.fillStyle = bg;
  ctx2.fillRect(0, 0, w, h);
  ctx2.fillStyle = fg;
  ctx2.textBaseline = "middle";
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
  const material = new THREE.MeshStandardMaterial({
    map: texture ?? undefined,
    color: texture ? 0xffffff : 0x888888, // grey placeholder if missing
    roughness: CONSTANTS.PLANET_ROUGHNESS,
    metalness: CONSTANTS.PLANET_METALNESS,
    envMapIntensity: CONSTANTS.PLANET_ENV_INTENSITY,
  });

  // Keep a slight emissive lift so darker albedo textures still read cleanly.
  if (texture) {
    material.emissiveMap = texture;
    material.emissive = new THREE.Color(0xffffff);
    material.emissiveIntensity = 0.08;
  }

  return material;
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
  const segmentCount = Number.isFinite(segments) ? Math.floor(segments) : 0;
  const scale = Number(scaleFactor);
  if (segmentCount < 3 || !Number.isFinite(scale)) {
    logWarn("OrbitLine", `Skipping for ${cfg?.name ?? "unknown"}: invalid segment/scale config`);
    return null;
  }

  const elements = getOrbitElements(cfg);
  if (!elements) return null;

  const points = buildOrbitPoints(elements, segmentCount, scale, cfg?.name ?? "unknown");
  if (!points) return null;

  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const style = resolveOrbitLineStyle(cfg, elements.a, colour);
  const mat = new THREE.LineBasicMaterial({
    color: style.color,
    transparent: true,
    opacity: style.opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new THREE.LineLoop(geom, mat);
  line.userData = {
    isOrbitLine: true,
    orbitClass: style.orbitClass,
    orbitDistanceAU: elements.a,
  };
  if (parent) parent.add(line);
  return line;
}

function getOrbitElements(cfg) {
  const semiMajor = Number(cfg?.orbitRadiusAU);
  if (!Number.isFinite(semiMajor) || semiMajor <= 0) {
    logWarn("OrbitLine", `Skipping for ${cfg?.name ?? "unknown"}: invalid semi-major axis ${semiMajor}`);
    return null;
  }

  const eccentricityRaw = Number(cfg?.info?.orbitalEccentricity ?? 0);
  const inclinationRaw = Number(cfg?.kepler?.inclinationDeg ?? cfg?.info?.orbitalInclinationDeg ?? 0);
  const ascNodeRaw = Number(cfg?.kepler?.longAscNodeDeg ?? 0);
  const argPeriRaw = Number(cfg?.kepler?.argPeriapsisDeg ?? 0);
  return {
    a: semiMajor,
    e: Math.max(0, Math.min(0.99, Number.isFinite(eccentricityRaw) ? eccentricityRaw : 0)),
    i: (Number.isFinite(inclinationRaw) ? inclinationRaw : 0) * THREE.MathUtils.DEG2RAD,
    Ω: (Number.isFinite(ascNodeRaw) ? ascNodeRaw : 0) * THREE.MathUtils.DEG2RAD,
    ω: (Number.isFinite(argPeriRaw) ? argPeriRaw : 0) * THREE.MathUtils.DEG2RAD,
  };
}

function buildOrbitPoints(elements, segmentCount, scale, bodyName) {
  const points = [];
  for (let k = 0; k <= segmentCount; k++) {
    const M = (k / segmentCount) * 2 * Math.PI;
    const E = eccentricAnomaly(M, elements.e);
    const nu = trueAnomaly(E, elements.e);
    const r = radius(elements.a, elements.e, nu);
    if (!Number.isFinite(E) || !Number.isFinite(nu) || !Number.isFinite(r)) {
      logWarn("OrbitLine", `Skipping for ${bodyName}: non-finite orbital solution`);
      return null;
    }

    const u = nu + elements.ω;
    const cosu = Math.cos(u);
    const sinu = Math.sin(u);
    const cosO = Math.cos(elements.Ω);
    const sinO = Math.sin(elements.Ω);
    const cosi = Math.cos(elements.i);
    const sini = Math.sin(elements.i);
    const xEcl = r * (cosO * cosu - sinO * sinu * cosi);
    const yEcl = r * (sinO * cosu + cosO * sinu * cosi);
    const zEcl = r * (sinu * sini);
    const x = xEcl * scale;
    const y = yEcl * scale;
    const z = zEcl * scale;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      logWarn("OrbitLine", `Skipping for ${bodyName}: non-finite orbit vertex`);
      return null;
    }
    points.push(new THREE.Vector3(x, z, y));
  }
  return points;
}

function resolveOrbitLineStyle(cfg, semiMajorAU, baseColor) {
  const orbitClass = getOrbitClass(cfg, semiMajorAU);
  const distanceCap = Number(CONSTANTS.ORBIT_MAX_VISUAL_DISTANCE_AU);
  const cappedDistance = Math.max(0, Math.min(semiMajorAU, Number.isFinite(distanceCap) ? distanceCap : semiMajorAU));
  const distanceT = clamp01(Math.log1p(cappedDistance) / Math.log1p(Math.max(1, distanceCap)));
  const color = new THREE.Color(Number.isFinite(baseColor) ? baseColor : CONSTANTS.ORBIT_LINE_COLOR);
  color.lerp(new THREE.Color(CONSTANTS.ORBIT_ICE_GIANT_TINT), distanceT * CONSTANTS.ORBIT_DISTANCE_COLOR_BLEND);
  if (orbitClass === "inner") color.lerp(new THREE.Color(CONSTANTS.ORBIT_INNER_TINT), 0.32);
  if (orbitClass === "gas") color.lerp(new THREE.Color(CONSTANTS.ORBIT_GAS_GIANT_TINT), 0.28);
  if (orbitClass === "ice") color.lerp(new THREE.Color(CONSTANTS.ORBIT_ICE_GIANT_TINT), 0.38);
  const opacity = THREE.MathUtils.lerp(CONSTANTS.ORBIT_OPACITY_NEAR, CONSTANTS.ORBIT_OPACITY_FAR, distanceT);
  return { orbitClass, color, opacity: clamp01(opacity) };
}

function getOrbitClass(cfg, semiMajorAU) {
  const name = String(cfg?.name ?? "").toLowerCase();
  if (name === "jupiter" || name === "saturn") return "gas";
  if (name === "uranus" || name === "neptune") return "ice";
  const composition = String(cfg?.info?.composition ?? "").toLowerCase();
  if (composition.includes("ice giant")) return "ice";
  if (composition.includes("gas giant")) return "gas";
  if (semiMajorAU <= 2.5) return "inner";
  return "outer";
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
