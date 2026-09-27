import * as THREE from "three";
import { eccentricAnomaly, trueAnomaly, radius } from "./kepler.js";
import { eclipticToScene } from "./frames.js";

const orbitX = new THREE.Vector3();
const orbitY = new THREE.Vector3();
const orbitZ = new THREE.Vector3();
const orbitBasis = new THREE.Matrix4();

function usesEquatorialFrame(orbit, planetSpinFrame) {
  return orbit?.orbitReference !== "ecliptic" && planetSpinFrame?.isQuaternion;
}

/**
 * Compute moon position in the parent-planet local frame from mean anomaly.
 * Output axes match the rest of the sim: X,Z are in-plane and Y is ecliptic north.
 *
 * @param {number} meanAnomalyRad Current mean anomaly [rad].
 * @param {object} orbit Orbit parameters.
 * @param {THREE.Quaternion} [planetSpinFrame] Parent planet's equatorial frame.
 * @param {THREE.Vector3} [out] Optional output vector.
 * @returns {THREE.Vector3}
 */
export function getMoonLocalPosition(
  meanAnomalyRad,
  orbit,
  planetSpinFrame = null,
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

  eclipticToScene(xRef, yRef, zRef, out);

  // Most regular moons are specified in the parent's equatorial frame.
  if (usesEquatorialFrame(orbit, planetSpinFrame)) out.applyQuaternion(planetSpinFrame);

  return out;
}

/**
 * Rotation whose +Y is the moon's orbit normal and +X its ascending node, so a
 * spin about local Y shares the orbit's sense (tidal locking keeps one face inward).
 */
export function getMoonOrbitFrameQuaternion(orbit, planetSpinFrame = null, out = new THREE.Quaternion()) {
  const i = Number(orbit?.orbitInclinationRad) || 0;
  const O = Number(orbit?.orbitAscendingNodeRad) || 0;
  eclipticToScene(Math.cos(O), Math.sin(O), 0, orbitX);
  eclipticToScene(Math.sin(i) * Math.sin(O), -Math.sin(i) * Math.cos(O), Math.cos(i), orbitY);
  orbitZ.crossVectors(orbitX, orbitY);
  out.setFromRotationMatrix(orbitBasis.makeBasis(orbitX, orbitY, orbitZ));
  if (usesEquatorialFrame(orbit, planetSpinFrame)) out.premultiply(planetSpinFrame);
  return out;
}

const SPIN_AXIS = new THREE.Vector3(0, 1, 0);
const periapsisTurn = new THREE.Quaternion();

// Orientation for an orbit path drawn in its own perifocal plane (periapsis on +X),
// so precessing nodes and periapses only rotate the line instead of rebuilding it.
export function getMoonOrbitLineQuaternion(orbit, planetSpinFrame = null, out = new THREE.Quaternion()) {
  getMoonOrbitFrameQuaternion(orbit, planetSpinFrame, out);
  return out.multiply(periapsisTurn.setFromAxisAngle(SPIN_AXIS, Number(orbit?.orbitArgPeriapsisRad) || 0));
}
