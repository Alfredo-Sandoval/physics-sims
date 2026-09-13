import * as CONSTANTS from "../core/config.js";
import { getSimulationSpeed, setSimulationSpeed } from "../core/state.js";
let lastActiveSimulationSpeed = 1;
let listeners;

export function isPausedSpeed(speed) {
  return !Number.isFinite(speed) || speed <= 0;
}

function clampSimulationSpeed(speed) {
  if (!Number.isFinite(speed)) return 1.0;
  return Math.max(0, Math.min(5.0, speed));
}

export function getResumeSpeed() {
  return Math.max(0.1, Math.min(5.0, lastActiveSimulationSpeed || 1.0));
}

function syncPlaybackUi(speed) {
  const normalized = clampSimulationSpeed(speed);
  const speedSlider = document.getElementById("speedSlider");
  const speedSpan = document.getElementById("speedValue");
  const speedRate = document.getElementById("speedRate");
  const togglePlaybackBtn = document.getElementById("togglePlaybackBtn");
  const resetSpeedBtn = document.getElementById("resetSpeedBtn");
  const paused = isPausedSpeed(normalized);

  if (speedSlider) speedSlider.value = String(normalized);
  if (speedSpan) speedSpan.textContent = normalized.toFixed(1) + "×";
  if (speedRate) speedRate.textContent = CONSTANTS.formatSimulationRate(normalized);
  if (togglePlaybackBtn) {
    togglePlaybackBtn.textContent = paused ? "Resume" : "Pause";
    togglePlaybackBtn.setAttribute("aria-pressed", String(!paused));
  }
  if (resetSpeedBtn) {
    resetSpeedBtn.disabled = !paused && Math.abs(normalized - 1.0) < 0.001;
  }
}

export function applySimulationSpeed(speed) {
  const normalized = clampSimulationSpeed(speed);
  if (!isPausedSpeed(normalized)) {
    lastActiveSimulationSpeed = normalized;
  }
  setSimulationSpeed(normalized);
  syncPlaybackUi(normalized);
}

export function initPlaybackControls() {
  cleanupPlaybackControls();
  listeners = new AbortController();
  const options = { signal: listeners.signal };
  /* Speed slider ------------------------------------------------------- */
  const speedSlider = document.getElementById("speedSlider");
  const togglePlaybackBtn = document.getElementById("togglePlaybackBtn");
  const resetSpeedBtn = document.getElementById("resetSpeedBtn");
  if (speedSlider) {
    // Ensure a sane default: 1.0x on first load
    let simulationSpeed = getSimulationSpeed();
    // If speed is not valid or is zero, default to 1.0
    if (!Number.isFinite(simulationSpeed) || simulationSpeed === 0) {
      simulationSpeed = 1.0;
    }
    applySimulationSpeed(simulationSpeed);

    speedSlider.addEventListener("input", () => {
      applySimulationSpeed(parseFloat(speedSlider.value));
    }, options);
  }

  togglePlaybackBtn?.addEventListener("click", () => {
    const currentSpeed = getSimulationSpeed() ?? 1;
    applySimulationSpeed(isPausedSpeed(currentSpeed) ? getResumeSpeed() : 0);
  }, options);

  resetSpeedBtn?.addEventListener("click", () => {
    applySimulationSpeed(1.0);
  }, options);
}

export function cleanupPlaybackControls() {
  listeners?.abort();
  listeners = null;
}
