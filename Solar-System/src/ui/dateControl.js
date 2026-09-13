import { getSimulatedDays, setSimulatedDays } from "../core/state.js";
let isSeekingSimDays = false;
let seekFrameId = null;

function tweenSimulationDays(fromDays, toDays, durationMs = 1500, onDone) {
  if (!Number.isFinite(fromDays) || !Number.isFinite(toDays) || durationMs <= 0) {
    setSimulatedDays(toDays);
    if (typeof onDone === "function") onDone();
    return;
  }
  if (isSeekingSimDays) return; // prevent overlapping seeks
  isSeekingSimDays = true;
  const start = performance.now();
  const dist = toDays - fromDays;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const t = Math.min(1, (now - start) / durationMs);
    const days = fromDays + dist * easeOutCubic(t);
    setSimulatedDays(days);
    if (t < 1) {
      seekFrameId = requestAnimationFrame(step);
    } else {
      setSimulatedDays(toDays);
      isSeekingSimDays = false;
      if (typeof onDone === "function") onDone();
    }
  }
  seekFrameId = requestAnimationFrame(step);
}

/* ---------------------------------------------------------------------- */
/*                        Date Picker (time travel)                       */
/* ---------------------------------------------------------------------- */
export function setupDatePicker({ simulationEpochJD, simulationEpochDateUtc }) {
  const input = document.getElementById("datePicker");
  if (!input) return;

  // Set initial value to today
  const today = new Date();
  input.value = today.toISOString().slice(0, 10);

  const onChange = (e) => {
    const dateStr = e.target.value;
    if (!dateStr) return;

    const targetDate = new Date(dateStr + "T12:00:00Z");
    const targetMs = targetDate.getTime();
    if (!Number.isFinite(targetMs)) return;

    let newDays;
    if (simulationEpochDateUtc) {
      const epochMs = Date.parse(simulationEpochDateUtc);
      if (Number.isFinite(epochMs)) {
        newDays = (targetMs - epochMs) / 86400000;
      }
    }
    if (newDays == null && Number.isFinite(simulationEpochJD)) {
      const targetJD = targetMs / 86400000 + 2440587.5;
      newDays = targetJD - simulationEpochJD;
    }
    if (newDays == null) {
      const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
      newDays = (targetMs - j2000) / 86400000;
    }

    const currentDays = getSimulatedDays() || 0;
    tweenSimulationDays(currentDays, newDays, 1500);
  };
  input.addEventListener("change", onChange);
  return () => {
    input.removeEventListener("change", onChange);
    cancelAnimationFrame(seekFrameId);
    isSeekingSimDays = false;
  };
}
