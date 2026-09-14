import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import * as SceneSetup from "../rendering/scene.js";
import * as UI from "../ui/index.js";
import { CameraFollowController } from "../navigation/cameraFollow.js";
import { createDetailController } from "../rendering/detail.js";
import { updatePositions, updateRotations } from "../simulation/bodyUpdates.js";
import { updateAsteroidBelt } from "../rendering/belts/asteroidBelt.js";
import { updateKuiperBelt } from "../rendering/belts/kuiperBelt.js";
import { updateJupiterTrojans } from "../rendering/belts/trojans.js";
import { getState, getSimulationSpeed, getSimulatedDays, setSimulatedDays, getAsteroidBelt } from "../core/state.js";
import { on } from "../core/events.js";

export function startAnimationLoop({ scene, camera, renderer, controls, clock, planets, celestialBodies, shadowManager, performanceTuner, orbitWorker }) {
  let frameId = null, rendering = false, stopped = false;
  let lastDay = null, lastRevision = -1, lastUiUpdate = 0;
  const cameraFollow = new CameraFollowController();
  const detail = createDetailController(celestialBodies, renderer);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const listeners = new AbortController();
  const drawState = { frames: 0, lastFrameMs: 0 };
  renderer.userData.drawState = drawState;

  function wake() {
    if (stopped || rendering || frameId !== null || document.hidden) return;
    clock.start();
    frameId = requestAnimationFrame(animate);
  }
  function animate() {
    frameId = null;
    if (stopped || document.hidden) return;
    rendering = true;
    const start = performance.now();
    const delta = Math.min(clock.getDelta(), 0.1);
    const speed = getSimulationSpeed();
    if (speed !== 0) setSimulatedDays(getSimulatedDays() + delta * speed * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X);
    const days = getSimulatedDays();
    const revision = getState().timeRevision;
    const timeChanged = days !== lastDay || revision !== lastRevision;
    if (timeChanged) {
      if (!orbitWorker.ready || speed === 0 || revision !== lastRevision) updatePositions(planets, days);
      if (speed !== 0) orbitWorker.updatePositions(planets, days);
      updateRotations(planets, days);
      lastDay = days; lastRevision = revision;
    }
    // Worker belts are also date-driven and only run when their visible state changes.
    const belt = getAsteroidBelt();
    const kuiper = scene.getObjectByName("KuiperBelt");
    for (const [object, update] of [[belt, updateAsteroidBelt], [kuiper, updateKuiperBelt]]) {
      if (object?.visible && (object.userData.lastRenderedDay !== days || object.userData.lastRenderedRevision !== revision)) {
        update(object, delta);
        object.userData.lastRenderedDay = days;
        object.userData.lastRenderedRevision = revision;
      }
    }
    updateJupiterTrojans(scene, planets);
    cameraFollow.update(getState(), Math.max(delta, 1 / 120), reducedMotion.matches);
    const cameraChanged = controls.update();
    camera.updateMatrixWorld();
    SceneSetup.updateBounceLight(camera, getState().selectedObject);
    detail.update(camera);
    UI.updateOutlines();
    UI.updateDayCounter(days);
    const now = performance.now();
    const interval = speed !== 0 && delta > 0 ? performanceTuner?.tick(delta) ?? 33 : 0;
    if (now - lastUiUpdate >= interval || timeChanged) {
      lastUiUpdate = now;
      UI.updateUIDisplay(speed);
      UI.updateInfoFollow(camera);
    }
    UI.updatePlanetLabels(camera, celestialBodies);
    shadowManager.update(now);
    renderer.toneMappingExposure = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(camera.position.length(), 100, CONSTANTS.STARFIELD_RADIUS,
        CONSTANTS.TONE_MAPPING_EXPOSURE_MIN, CONSTANTS.TONE_MAPPING_EXPOSURE_MAX),
      CONSTANTS.TONE_MAPPING_EXPOSURE_MIN, CONSTANTS.TONE_MAPPING_EXPOSURE_MAX);
    renderer.render(scene, camera);
    drawState.frames++; drawState.lastFrameMs = performance.now() - start;
    rendering = false;
    if (getSimulationSpeed() !== 0 || getState().frameRequested || cameraChanged) frameId = requestAnimationFrame(animate);
  }
  const unsubscribe = on("render", wake);
  controls.addEventListener("change", wake);
  for (const type of ["input", "change", "click", "toggle", "transitionend", "scroll"]) {
    document.addEventListener(type, wake, { capture: true, passive: true, signal: listeners.signal });
  }
  window.addEventListener("resize", wake, { signal: listeners.signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(frameId); frameId = null; }
    else wake();
  }, { signal: listeners.signal });
  document.fonts?.ready.then(wake);
  wake();
  return () => {
    stopped = true; cancelAnimationFrame(frameId); unsubscribe(); listeners.abort();
    controls.removeEventListener("change", wake); detail.dispose();
  };
}
