import { seedFromName } from "../core/random.js";
import { getOrbitalState, normalizeAngle } from "./kepler.js";
import { getInterpolatedEphemerisPositionAU } from "./orbitalRuntime.js";

export function getPlanetPositionAU(config, days) {
  const sampled = getInterpolatedEphemerisPositionAU(config, days);
  if (sampled) return sampled;
  const radians = Math.PI / 180;
  const { x, y } = getOrbitalState(days, {
    a: config.orbitRadiusAU, e: config.info?.orbitalEccentricity ?? 0,
    w: (config.kepler?.argPeriapsisDeg ?? 0) * radians,
    M0: (config.kepler?.meanAnomalyDeg ?? 0) * radians,
  });
  const inclination = (config.kepler?.inclinationDeg ?? config.info?.orbitalInclinationDeg ?? 0) * radians;
  const node = (config.kepler?.longAscNodeDeg ?? 0) * radians;
  return {
    x: x * Math.cos(node) - y * Math.sin(node) * Math.cos(inclination),
    y: x * Math.sin(node) + y * Math.cos(node) * Math.cos(inclination),
    z: y * Math.sin(inclination),
  };
}

export function angleAtDays(days, periodDays, direction = 1, initialAngle = 0) {
  const period = Math.abs(periodDays);
  if (!Number.isFinite(period) || period === 0) return initialAngle;
  return normalizeAngle(initialAngle + ((days % period) / period) * 2 * Math.PI * direction);
}

// No measured epoch phases are available for these illustrative moon paths.
export function initialMoonPhase(config) {
  if (Number.isFinite(config.meanAnomalyDeg)) return config.meanAnomalyDeg * Math.PI / 180;
  return seedFromName(config.name ?? "moon") / 4294967296 * 2 * Math.PI;
}
