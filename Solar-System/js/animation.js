// File: Solar-System/js/animation.js
// --- Animation Module --------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";
import { getOrbitalState } from "./kepler.js";

import { updateDayCounter, updateOutlines, updatePlanetLabels } from "./ui.js";
import { updateAsteroidBelt } from "./asteroidbelt.js"; // Added import for asteroid belt updates

// Flags and state
let isFirstCall = true; // for THREE.Clock reset on first call

/* ---------------------------------------------------------------------- */
/*                      Position / Orbit update                           */
/* ---------------------------------------------------------------------- */
export function updatePositions(planets, delta, simulationSpeed) {
  // No delta needed here, we use total elapsed time for Kepler
  const simulatedDays = window.simulatedDays || 0;

  /* Update each planet group using Kepler's laws --------------------- */
  planets.forEach((group, index) => {
    if (!group?.userData?.config) return;
    const ud = group.userData;
    const cfg = ud.config;

    // Get orbital elements, reading from nested kepler object
    const elements = {
      a: cfg.orbitRadiusAU, // semi‑major axis
      e: cfg.info?.orbitalEccentricity ?? 0, // eccentricity
      ω: (cfg.kepler?.argPeriapsisDeg ?? 0) * THREE.MathUtils.DEG2RAD,
      M0: (cfg.kepler?.meanAnomalyDeg ?? 0) * THREE.MathUtils.DEG2RAD,
      // Inclination (i) & Ω ignored for the 2‑D plane variant
    };

    // Planet state in AU
    const { x, y } = getOrbitalState(simulatedDays, elements);

    // Map AU → scene units
    const sceneX = x * CONSTANTS.ORBIT_SCALE_FACTOR;
    const sceneZ = y * CONSTANTS.ORBIT_SCALE_FACTOR;


    group.position.set(
      x * CONSTANTS.ORBIT_SCALE_FACTOR,
      0,
      y * CONSTANTS.ORBIT_SCALE_FACTOR
    );

    /* Moons (keep circular orbits) ---------------------------------- */
    const dt = THREE.MathUtils.clamp(delta, 0.001, 0.1);
    const tf = dt * simulationSpeed * 5.0; // same “speed‑boost” as before

    group.traverse((child) => {
      if (!child.isMesh || child.userData.type !== "moon") return;
      const mu = child.userData;
      mu.currentAngle =
        (mu.currentAngle ?? 0) + mu.orbitSpeed * mu.orbitDirection * tf;
      child.position.set(
        mu.orbitRadius * Math.cos(mu.currentAngle),
        0,
        mu.orbitRadius * Math.sin(mu.currentAngle)
      );
    });
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
  updateDayCounter(Math.floor(total));
  return total;
}

/* ---------------------------------------------------------------------- */
/*                        Optional animation loop                         */
/* ---------------------------------------------------------------------- */
export function createAnimationLoop(
  renderer,
  scene,
  camera,
  controls,
  clock,
  planets,
  cameraTarget
) {
  let simDays = 0;
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const speed = window.simulationSpeed ?? 1.0;
    updatePositions(planets, delta, speed);
    updateRotations(planets, delta, speed);
    updateOutlines(); // Update outline positions to follow moving objects
    simDays = updateSimulation(delta, speed, simDays);

    if (window.asteroidBelt)
      updateAsteroidBelt(window.asteroidBelt, delta, speed);

    renderer.render(scene, camera);
  }
  return animate;
}

/* ---------------------------------------------------------------------- */
/*                  Main‑loop helper called from main.js                  */
/* ---------------------------------------------------------------------- */
export function updateScene(simSpeed) {
  const clock = window.clock;
  const planets = window.planets ?? [];
  const belt = window.asteroidBelt ?? null;
  let currentDays = Number.isFinite(window.simulatedDays)
    ? window.simulatedDays
    : 0;

  if (!clock) {
    console.error("updateScene: clock missing");
    return;
  }

  if (isFirstCall) {
    clock.start();
    clock.getDelta(); // prime
    console.log("***** CLOCK RESET *****");
    isFirstCall = false;
  }

  const delta = clock.getDelta();
  const speed = Number.isFinite(simSpeed) && simSpeed >= 0 ? simSpeed : 1.0;
  try {
    updatePositions(planets, delta, speed);
    updateRotations(planets, delta, speed);
    updateAsteroidBelt(belt, delta, speed);
    updateOutlines(); // Update outline positions to follow moving objects
    
    // Update planet labels
    const celestialBodies = [...planets, ...(window.asteroidBelt ? [] : [])];
    if (window.sunMesh) celestialBodies.push(window.sunMesh);
    updatePlanetLabels(window.camera, celestialBodies);
    
    window.simulatedDays = updateSimulation(delta, speed, currentDays);
  } catch (err) {
    console.error("updateScene error:", err);
    window.simulationSpeed = 0; // pause on error
  }
}
