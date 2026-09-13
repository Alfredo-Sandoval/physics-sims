import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import * as SceneSetup from "../rendering/scene.js";
import * as UI from "../ui/index.js";
import { CameraFollowController } from "../navigation/cameraFollow.js";
import { updatePositions, updateRotations, updateSimulation } from "../simulation/bodyUpdates.js";
import { updateAsteroidBelt } from "../rendering/belts/asteroidBelt.js";
import { updateKuiperBelt } from "../rendering/belts/kuiperBelt.js";
import { updateJupiterTrojans } from "../rendering/belts/trojans.js";
import { getState, getSimulationSpeed, setSimulationSpeed, getSimulatedDays, setSimulatedDays, getAsteroidBelt, getClock } from "../core/state.js";
import { info as logInfo, error as logError } from "../core/logger.js";

export function startAnimationLoop({ scene, camera, renderer, controls, clock, planets, celestialBodies, shadowManager, performanceTuner, orbitWorker }) {
  let animationFrameId;
  logInfo("Animation", "startAnimationLoop called");
  const cameraFollow = new CameraFollowController();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Throttle expensive UI work to ~30fps
  let lastUiUpdateMs = 0;
  let uiUpdateIntervalMs = performanceTuner?.getUiIntervalMs?.() ?? 33; // ~30fps

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const currentSpeed = getSimulationSpeed() ?? 1.0;
    const elapsed = clock.getDelta();
    if (document.hidden) return;
    const delta = Math.min(elapsed, 0.1);
    if (performanceTuner) {
      uiUpdateIntervalMs = performanceTuner.tick(elapsed) ?? uiUpdateIntervalMs;
    }

    const currentDays = getSimulatedDays();
    if (orbitWorker.ready) {
      orbitWorker.updatePositions(planets, currentDays);
      orbitWorker.updateRotations(planets, delta, currentSpeed);
      const add = currentSpeed > 0 && CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X > 0
        ? delta * currentSpeed * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X : 0;
      setSimulatedDays((currentDays || 0) + add);
    } else {
      try {
        updatePositions(planets, delta, currentSpeed);
        updateRotations(planets, delta, currentSpeed);
        setSimulatedDays(updateSimulation(delta, currentSpeed, currentDays));
      } catch (err) {
        logError("Animation", "Body update failed", err);
        setSimulationSpeed(0);
      }
    }
    UI.updateOutlines();
    UI.updateDayCounter(Math.floor(getSimulatedDays()));

    const belt = getAsteroidBelt();
    if (belt) updateAsteroidBelt(belt, delta);
    const kuiperBelt = scene.getObjectByName("KuiperBelt");
    if (kuiperBelt) updateKuiperBelt(kuiperBelt, delta);

    // Update Jupiter Trojans to co-orbit with Jupiter
    if (CONSTANTS.JUPITER_TROJANS_ENABLED) {
      updateJupiterTrojans(scene, planets);
    }

    cameraFollow.update(getState(), delta, reducedMotion.matches);

    // OrbitControls update
    if (controls) {
      // Let OrbitControls handle wheel dolly; avoid per-frame minDistance clamps
      // that can fight the user's scroll wheel. We now update minDistance when
      // the follow target changes (see appState.updateFollowTarget).
      controls.update();
      SceneSetup.updateBounceLight(camera);
    }

    // UI (throttled): text readouts + info panel follow
    const nowMs = performance.now();
    if (nowMs - lastUiUpdateMs >= uiUpdateIntervalMs) {
      lastUiUpdateMs = nowMs;
      UI.updateUIDisplay(currentSpeed);
      UI.updateInfoFollow(camera);
    }

    // Update labels every frame to prevent jitter during camera movement
    UI.updatePlanetLabels(camera, celestialBodies);

    // Update shadows with performance optimization
    shadowManager.update(performance.now());

    // Auto‑exposure based on camera distance to Sun (origin)
    if (renderer && camera) {
      const dist = camera.position.length();
      const exp = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(
          dist,
          100,
          CONSTANTS.STARFIELD_RADIUS,
          CONSTANTS.TONE_MAPPING_EXPOSURE_MIN,
          CONSTANTS.TONE_MAPPING_EXPOSURE_MAX
        ),
        CONSTANTS.TONE_MAPPING_EXPOSURE_MIN,
        CONSTANTS.TONE_MAPPING_EXPOSURE_MAX
      );
      renderer.toneMappingExposure = exp;
    }

    // render frame
    renderer?.render(scene, camera);
  }

  if (getClock()) {
    animate(); // Start the loop
  } else {
    logError("Animation", "Clock not initialized, cannot start loop");
  }

  return () => cancelAnimationFrame(animationFrameId);
}
