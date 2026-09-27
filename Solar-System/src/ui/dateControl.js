import { getSimulatedDays, seekToDays } from "../core/state.js";

export function setupDatePicker({ simulationEpochJD, simulationEpochDateUtc }) {
  const input = document.getElementById("datePicker");
  const listeners = new AbortController();
  const epoch = Number.isFinite(simulationEpochJD)
    ? (simulationEpochJD - 2440587.5) * 86400000
    : Date.parse(simulationEpochDateUtc ?? "2000-01-01T12:00:00Z");
  function jump(timestamp) { seekToDays((timestamp - epoch) / 86400000); }
  input.addEventListener("change", () => {
    const timestamp = Date.parse(input.value + "T12:00:00Z");
    if (Number.isFinite(timestamp)) jump(timestamp);
  }, { signal: listeners.signal });
  for (const [id, step] of [["stepBackDayBtn", -1], ["stepForwardDayBtn", 1]]) {
    document.getElementById(id).addEventListener("click", () => {
      seekToDays(getSimulatedDays() + step);
    }, { signal: listeners.signal });
  }
  document.getElementById("todayBtn").addEventListener("click", () => {
    jump(Date.now());
  }, { signal: listeners.signal });
  return () => listeners.abort();
}
