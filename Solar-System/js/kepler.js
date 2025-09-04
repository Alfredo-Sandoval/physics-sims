// File: Solar-System/js/kepler.js
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
  // Clamp eccentricity to prevent mathematical instability
  e = Math.max(0, Math.min(0.99, e));

  let E = e < 0.8 ? M : Math.PI; // first guess
  for (let i = 0; i < 12; i++) {
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const denominator = 1 - e * cosE;

    // Prevent division by zero
    if (Math.abs(denominator) < 1e-10) {
      console.warn("Numerical instability in eccentric anomaly calculation");
      break;
    }

    const d = E - e * sinE - M;
    E -= d / denominator;
    if (Math.abs(d) < tol) break;
  }
  return E;
}

/* True anomaly -------------------------------------------------------- */
export function trueAnomaly(E, e) {
  const denominator = 1 - e * Math.cos(E);

  // Prevent division by zero for parabolic/hyperbolic orbits
  if (Math.abs(denominator) < 1e-10) {
    console.warn("Near-parabolic orbit detected, using approximation");
    return E; // Fallback approximation
  }

  const cosν = (Math.cos(E) - e) / denominator;
  const sinν = (Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E)) / denominator;
  return Math.atan2(sinν, cosν); // −π … +π
}

/* Radius (distance from focus) --------------------------------------- */
export function radius(a, e, ν) {
  return (a * (1 - e * e)) / (1 + e * Math.cos(ν));
}

/* Main API ------------------------------------------------------------ */
export function getOrbitalState(tDays, elems) {
  const { a, e, ω = 0, M0 = 0 } = elems; // keep flat for now

  // Validate inputs
  if (!Number.isFinite(a) || a <= 0) {
    console.error("Invalid semi-major axis:", a);
    return { x: 0, y: 0, vx: 0, vy: 0, trueAnomaly: 0 };
  }

  if (!Number.isFinite(e) || e < 0) {
    console.error("Invalid eccentricity:", e);
    return { x: 0, y: 0, vx: 0, vy: 0, trueAnomaly: 0 };
  }

  if (!Number.isFinite(tDays)) {
    console.error("Invalid time:", tDays);
    return { x: 0, y: 0, vx: 0, vy: 0, trueAnomaly: 0 };
  }

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
  // const vMag = Math.sqrt(μAU * (2 / r - 1 / a)); // AU/day (not used currently)
  const h = Math.sqrt(μAU * a * (1 - e * e)); // specific angular momentum
  const vx = -(μAU / h) * Math.sin(ν);
  const vy = (μAU / h) * (e + Math.cos(ν));

  // Validate final results
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    console.error("Invalid orbital position calculated:", { x, y, a, e, ν });
    return { x: a, y: 0, vx: 0, vy: 0, trueAnomaly: 0 }; // Fallback to circular orbit
  }

  return { x, y, vx, vy, trueAnomaly: ν };
}
