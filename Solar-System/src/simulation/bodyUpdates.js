import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { getSimulatedDays } from "../core/state.js";
import { getPlanetPositionAU, angleAtDays } from "./positions.js";
import { getMoonLocalPosition } from "./moonPosition.js";
import { applyMoonJ2PrecessionAtTime, getPlanetRadiusForMoonPrecession } from "./orbitalRuntime.js";

const moonPosition = new THREE.Vector3();
export function updatePositions(planets, days = getSimulatedDays()) {
  for (const group of planets) {
    const position = getPlanetPositionAU(group.userData.config, days);
    group.position.set(position.x, position.z, position.y).multiplyScalar(CONSTANTS.ORBIT_SCALE_FACTOR);
  }
}

export function updateRotations(planets, days = getSimulatedDays()) {
  const surfaceDays = days / CONSTANTS.PLANET_SPIN_SLOWDOWN;
  for (const group of planets) {
    const ud = group.userData;
    const mesh = ud.planetMesh;
    mesh.rotation.y = angleAtDays(surfaceDays, ud.config.rotationPeriod, ud.rotationDirection);
    const clouds = mesh.userData.cloudMesh;
    if (clouds) clouds.rotation.y = angleAtDays(surfaceDays, ud.config.rotationPeriod / CONSTANTS.CLOUD_ROTATION_SPEED_MULTIPLIER, ud.rotationDirection);
    if (!ud.__moonMeshes) {
      ud.__moonMeshes = [];
      group.traverse((child) => { if (child.isMesh && child.userData.type === "moon") ud.__moonMeshes.push(child); });
    }
    for (const moon of ud.__moonMeshes) {
      const mu = moon.userData;
      mu.currentMeanAnomaly = angleAtDays(days, mu.config.orbitalPeriod, mu.orbitDirection, mu.initialMeanAnomaly);
      mu.currentAngle = mu.currentMeanAnomaly;
      applyMoonJ2PrecessionAtTime(mu, ud.name, getPlanetRadiusForMoonPrecession(ud), days);
      moon.position.copy(getMoonLocalPosition(mu.currentMeanAnomaly, mu, ud.axialTilt, moonPosition));
      moon.rotation.y = angleAtDays(days, mu.config.rotationPeriod, mu.rotationDirection, mu.initialMeanAnomaly);
    }
  }
}
