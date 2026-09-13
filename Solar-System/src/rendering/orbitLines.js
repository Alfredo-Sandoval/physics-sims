import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { eccentricAnomaly, trueAnomaly, radius } from "../simulation/kepler.js";
import { warn as logWarn } from "../core/logger.js";

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
