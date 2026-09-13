import * as CONSTANTS from "../core/config.js";
import { getSimulationSpeed, setSimulationSpeed } from "../core/state.js";
let lastActiveSimulationSpeed = 1;
let listeners;

export function isPausedSpeed(speed) {
  return !Number.isFinite(speed) || speed === 0;
}

function clampSimulationSpeed(speed) {
  if (!Number.isFinite(speed)) return 1.0;
  return Math.max(-5, Math.min(5, speed));
}

export function getResumeSpeed() {
  return lastActiveSimulationSpeed || 1;
}

function syncPlaybackUi(speed) {
  const normalized = clampSimulationSpeed(speed);
  const speedSlider = document.getElementById("speedSlider");
  const speedSpan = document.getElementById("speedValue");
  const speedRate = document.getElementById("speedRate");
  const togglePlaybackBtn = document.getElementById("togglePlaybackBtn");
  const resetSpeedBtn = document.getElementById("resetSpeedBtn");
  const paused = isPausedSpeed(normalized);
  const reverse = document.getElementById("reversePlaybackBtn");
  const backwards = (paused ? lastActiveSimulationSpeed : normalized) < 0;
  if (reverse) { reverse.textContent = backwards ? "Reverse" : "Forward"; reverse.setAttribute("aria-pressed", String(backwards)); }

  if (speedSlider) speedSlider.value = String(Math.abs(normalized));
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
      applySimulationSpeed(parseFloat(speedSlider.value) * Math.sign(getResumeSpeed()));
    }, options);
  }

  togglePlaybackBtn?.addEventListener("click", () => {
    const currentSpeed = getSimulationSpeed() ?? 1;
    applySimulationSpeed(isPausedSpeed(currentSpeed) ? getResumeSpeed() : 0);
  }, options);

  document.getElementById("reversePlaybackBtn")?.addEventListener("click", () => {
    lastActiveSimulationSpeed = -getResumeSpeed();
    applySimulationSpeed(isPausedSpeed(getSimulationSpeed()) ? 0 : -getSimulationSpeed());
  }, options);

  resetSpeedBtn?.addEventListener("click", () => {
    applySimulationSpeed(1.0);
  }, options);
}

export function cleanupPlaybackControls() {
  listeners?.abort();
  listeners = null;
}
