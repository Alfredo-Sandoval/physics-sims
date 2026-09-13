import * as THREE from "three";
import { eccentricAnomaly, trueAnomaly, radius } from "./kepler.js";

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
