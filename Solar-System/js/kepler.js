// --- Kepler helper -----------------------------------------------------
//
//   import { getOrbitalState } from './kepler.js'
//
//   const state = getOrbitalState(
//       elapsedDays,
//       {   a : 1.0,            // semi‑major axis  [AU]
//           e : 0.0167,         // eccentricity
//           i : 0.000,          // inclination [rad]  (ignored – 2‑D plane)
//           Ω : 0.000,          // longitude of ascending node [rad] (ignored)
//           ω : 102.9372*DEG2RAD, // argument of periapsis [rad]
//           M0: 0.0             // mean anomaly at t=0 [rad]
//       }
//   );
//
//   // state.{x,y} are in the orbital plane, units = semi‑major‑axis (e.g. AU)
// ----------------------------------------------------------------------

import * as THREE from "three";

const DEG2RAD = Math.PI / 180;

/* Mean motion --------------------------------------------------------- */
export function meanMotion(aAU, μ = 0.01720209895 ** 2) {
  // μ in AU^3 day⁻²: default is (G*(M☉+m)) with M☉ dominant
  return Math.sqrt(μ / (aAU * aAU * aAU)); // rad · day⁻¹
}

/* Solve Kepler’s equation  M = E − e·sinE  via Newton–Raphson ---------- */
export function eccentricAnomaly(M, e, tol = 1e-6) {
  let E = e < 0.8 ? M : Math.PI; // first guess
  for (let i = 0; i < 12; i++) {
    const d = E - e * Math.sin(E) - M;
    E -= d / (1 - e * Math.cos(E));
    if (Math.abs(d) < tol) break;
  }
  return E;
}

/* True anomaly -------------------------------------------------------- */
export function trueAnomaly(E, e) {
  const cosν = (Math.cos(E) - e) / (1 - e * Math.cos(E));
  const sinν = (Math.sqrt(1 - e * e) * Math.sin(E)) / (1 - e * Math.cos(E));
  return Math.atan2(sinν, cosν); // −π … +π
}

/* Radius (distance from focus) --------------------------------------- */
export function radius(a, e, ν) {
  return (a * (1 - e * e)) / (1 + e * Math.cos(ν));
}

/* Main API ------------------------------------------------------------ */
export function getOrbitalState(tDays, elems) {
  const { a, e, ω = 0, M0 = 0 } = elems; // keep flat for now

  // Mean anomaly at time t
  const n = meanMotion(a); // rad/day
  const M = THREE.MathUtils.euclideanModulo(M0 + n * tDays, 2 * Math.PI);

  // Eccentric anomaly
  const E = eccentricAnomaly(M, e);

  // True anomaly & radius
  const ν = trueAnomaly(E, e);
  const r = radius(a, e, ν); // in AU if a in AU

  // Position in orbital plane (periapsis along +X)
  let x = r * Math.cos(ν);
  let y = r * Math.sin(ν);

  // Rotate by argument of periapsis ω
  if (ω !== 0) {
    const cosω = Math.cos(ω),
      sinω = Math.sin(ω);
    const xr = x * cosω - y * sinω;
    const yr = x * sinω + y * cosω;
    x = xr;
    y = yr;
  }

  // Velocity magnitude (vis‑viva) & direction -------------------------
  const μAU = 0.01720209895 ** 2; // AU^3 day⁻²
  const vMag = Math.sqrt(μAU * (2 / r - 1 / a)); // AU/day
  const h = Math.sqrt(μAU * a * (1 - e * e)); // specific angular momentum
  const vx = -(μAU / h) * Math.sin(ν);
  const vy = (μAU / h) * (e + Math.cos(ν));

  return { x, y, vx, vy, trueAnomaly: ν };
}
