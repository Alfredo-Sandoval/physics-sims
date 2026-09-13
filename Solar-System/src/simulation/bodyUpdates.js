// --- Animation Module --------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { getOrbitalState } from "./kepler.js";
import { getMoonLocalPosition } from "./moonPosition.js";
import {
  applyMoonJ2PrecessionStep,
  getInterpolatedEphemerisPositionAU,
  getPlanetRadiusForMoonPrecession,
} from "./orbitalRuntime.js";

import { getSimulatedDays } from "../core/state.js";

// Flags and state
const moonPositionScratch = new THREE.Vector3();

function getPlanetPositionFromKeplerAU(cfg, simulatedDays) {
  const elements = {
    a: cfg.orbitRadiusAU,
    e: cfg.info?.orbitalEccentricity ?? 0,
    w: (cfg.kepler?.argPeriapsisDeg ?? 0) * THREE.MathUtils.DEG2RAD,
    M0: (cfg.kepler?.meanAnomalyDeg ?? 0) * THREE.MathUtils.DEG2RAD,
  };
  const { x, y } = getOrbitalState(simulatedDays, elements);
  const radius = Math.hypot(x, y);
  const argumentOfLatitude = Math.atan2(y, x);
  const inclinationRad =
    (cfg.kepler?.inclinationDeg ?? cfg.info?.orbitalInclinationDeg ?? 0) * THREE.MathUtils.DEG2RAD;
  const ascNodeRad = (cfg.kepler?.longAscNodeDeg ?? 0) * THREE.MathUtils.DEG2RAD;
  const cosu = Math.cos(argumentOfLatitude);
  const sinu = Math.sin(argumentOfLatitude);
  const cosO = Math.cos(ascNodeRad);
  const sinO = Math.sin(ascNodeRad);
  const cosi = Math.cos(inclinationRad);
  const sini = Math.sin(inclinationRad);
  return {
    x: radius * (cosO * cosu - sinO * sinu * cosi),
    y: radius * (sinO * cosu + cosO * sinu * cosi),
    z: radius * (sinu * sini),
  };
}

function getPlanetPositionAU(cfg, simulatedDays) {
  const ephemerisPosition = getInterpolatedEphemerisPositionAU(cfg, simulatedDays);
  if (ephemerisPosition) return ephemerisPosition;
  return getPlanetPositionFromKeplerAU(cfg, simulatedDays);
}

function getCachedMoonMeshes(group, userData) {
  let moonMeshes = userData.__moonMeshes;
  if (Array.isArray(moonMeshes)) return moonMeshes;

  moonMeshes = [];
  group.traverse((child) => {
    if (child.isMesh && child.userData.type === "moon") moonMeshes.push(child);
  });
  userData.__moonMeshes = moonMeshes;
  return moonMeshes;
}

function updateMoonPositions(group, userData, delta, simulationSpeed) {
  const dt = THREE.MathUtils.clamp(delta, 0.001, 0.1);
  const tf = Math.min(dt * simulationSpeed * 5.0, 0.5);
  const parentName = userData?.name;
  const parentRadius = getPlanetRadiusForMoonPrecession(userData);
  const moonMeshes = getCachedMoonMeshes(group, userData);

  for (let i = 0; i < moonMeshes.length; i += 1) {
    const moon = moonMeshes[i];
    const mu = moon.userData;
    const orbitDelta = (mu.orbitSpeed ?? 0) * (mu.orbitDirection ?? 1) * tf;
    const nextMeanAnomaly = (mu.currentMeanAnomaly ?? mu.currentAngle ?? 0) + orbitDelta;
    mu.currentMeanAnomaly = THREE.MathUtils.euclideanModulo(nextMeanAnomaly, 2 * Math.PI);
    mu.currentAngle = mu.currentMeanAnomaly;

    applyMoonJ2PrecessionStep(mu, parentName, parentRadius, orbitDelta);
    moon.position.copy(
      getMoonLocalPosition(mu.currentMeanAnomaly, mu, userData.axialTilt ?? 0, moonPositionScratch)
    );
  }
}

function setGroupPositionFromAU(group, positionAU) {
  group.position.set(
    positionAU.x * CONSTANTS.ORBIT_SCALE_FACTOR,
    positionAU.z * CONSTANTS.ORBIT_SCALE_FACTOR,
    positionAU.y * CONSTANTS.ORBIT_SCALE_FACTOR
  );
}

/* ---------------------------------------------------------------------- */
/*                      Position / Orbit update                           */
/* ---------------------------------------------------------------------- */
export function updatePositions(planets, delta, simulationSpeed) {
  // No delta needed here, we use total elapsed time for Kepler
  const simulatedDays = getSimulatedDays() || 0;

  /* Update each planet group using ephemeris/Kepler data ------------- */
  planets.forEach((group) => {
    if (!group?.userData?.config) return;
    const ud = group.userData;
    const cfg = ud.config;
    setGroupPositionFromAU(group, getPlanetPositionAU(cfg, simulatedDays));
    updateMoonPositions(group, ud, delta, simulationSpeed);
  });
}

/* ---------------------------------------------------------------------- */
/*                       Rotation update                                  */
/* ---------------------------------------------------------------------- */
export function updateRotations(planets, delta, simulationSpeed) {
  const dt = THREE.MathUtils.clamp(delta, 0.001, 0.1);
  const tf = dt * simulationSpeed;

  planets.forEach((group) => {
    if (!group?.userData?.planetMesh?.isMesh) return;
    const ud = group.userData;
    const mesh = ud.planetMesh;

    mesh.rotation.y += ud.rotationSpeed * ud.rotationDirection * tf;

    // cloud layer
    if (mesh.userData.cloudMesh?.isMesh)
      mesh.userData.cloudMesh.rotation.y +=
        ud.rotationSpeed * CONSTANTS.CLOUD_ROTATION_SPEED_MULTIPLIER * tf;

    // moons self‑rotation
    group.traverse((child) => {
      if (child.isMesh && child.userData.type === "moon") {
        const mu = child.userData;
        child.rotation.y += mu.rotationSpeed * mu.rotationDirection * tf;
      }
    });
  });
}

/* ---------------------------------------------------------------------- */
/*                   Simulation‑day counter                               */
/* ---------------------------------------------------------------------- */
export function updateSimulation(delta, simulationSpeed, currentDays) {
  const dt = THREE.MathUtils.clamp(delta, 0.001, 0.1);
  const add =
    simulationSpeed > 0 && CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X > 0
      ? dt * simulationSpeed * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X
      : 0;
  const total = (currentDays || 0) + add;
  return total;
}
