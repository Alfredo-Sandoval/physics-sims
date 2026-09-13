import { getSimulatedDays, seekToDays } from "../core/state.js";

export function setupDatePicker({ simulationEpochJD, simulationEpochDateUtc }) {
  const input = document.getElementById("datePicker");
  const listeners = new AbortController();
  const epoch = Number.isFinite(simulationEpochJD)
    ? (simulationEpochJD - 2440587.5) * 86400000
    : Date.parse(simulationEpochDateUtc ?? "2000-01-01T12:00:00Z");
  function jump(timestamp) { seekToDays((timestamp - epoch) / 86400000); }
  input.value = new Date().toISOString().slice(0, 10);
  input.addEventListener("change", () => {
    const timestamp = Date.parse(input.value + "T12:00:00Z");
    if (Number.isFinite(timestamp)) jump(timestamp);
  }, { signal: listeners.signal });
  for (const [id, step] of [["stepBackDayBtn", -1], ["stepForwardDayBtn", 1]]) {
    document.getElementById(id).addEventListener("click", () => {
      seekToDays(getSimulatedDays() + step);
      input.value = new Date(epoch + getSimulatedDays() * 86400000).toISOString().slice(0, 10);
    }, { signal: listeners.signal });
  }
  document.getElementById("todayBtn").addEventListener("click", () => {
    const now = Date.now(); jump(now); input.value = new Date(now).toISOString().slice(0, 10);
  }, { signal: listeners.signal });
  return () => listeners.abort();
}
