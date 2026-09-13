import * as CONSTANTS from "../core/config.js";
let speedSpan, speedRate, dayCounter, epochLabel, frameLabel;
let propagationMode, ephemerisSource, ephemerisRange;
let lastDisplayedDay = null;
let lastDisplayedSpeed = null;
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
let simulationEpochMs = null; // epoch timestamp in ms for date computation
let ephemerisMinJD = null;
let ephemerisMaxJD = null;

export function initTelemetry() {
  speedSpan = document.getElementById("speedValue");
  speedRate = document.getElementById("speedRate");
  dayCounter = document.getElementById("dayCounter");
  epochLabel = document.getElementById("epochLabel");
  frameLabel = document.getElementById("frameLabel");
  propagationMode = document.getElementById("propagationMode");
  ephemerisSource = document.getElementById("ephemerisSource");
  ephemerisRange = document.getElementById("ephemerisRange");
  setFrameLabel("--");
}

export function setEpochLabel(text) {
  if (!epochLabel) return;
  epochLabel.textContent = text || "--";
}

export function setFrameLabel(text) {
  if (!frameLabel) return;
  frameLabel.textContent = text || "--";
}

export function setEpochDate(isoDateUtc) {
  if (!isoDateUtc) return;
  const ms = Date.parse(isoDateUtc);
  if (Number.isFinite(ms)) { simulationEpochMs = ms; lastDisplayedDay = null; }
}

function julianDayToUtcDate(jd) {
  if (!Number.isFinite(jd)) return null;
  const date = new Date((jd - 2440587.5) * 86400000);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatMonthYearUtc(jd) {
  const date = julianDayToUtcDate(jd);
  if (!date) return null;
  return date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function setEphemerisMetadata({ source, minJD, maxJD } = {}) {
  ephemerisMinJD = Number.isFinite(minJD) ? minJD : null;
  ephemerisMaxJD = Number.isFinite(maxJD) ? maxJD : null;

  if (ephemerisSource) {
    ephemerisSource.textContent = source || CONSTANTS.EPHEMERIS_SOURCE_NAME;
  }
  if (ephemerisRange) {
    const start = formatMonthYearUtc(ephemerisMinJD);
    const end = formatMonthYearUtc(ephemerisMaxJD);
    ephemerisRange.textContent = start && end ? `valid ${start}–${end}` : "valid range unavailable";
  }
}

function updatePropagationMode(days) {
  if (!propagationMode || simulationEpochMs === null || !Number.isFinite(days)) return;
  const simulationJD = simulationEpochMs / 86400000 + 2440587.5 + days;
  const usingEphemeris =
    Number.isFinite(ephemerisMinJD) &&
    Number.isFinite(ephemerisMaxJD) &&
    simulationJD >= ephemerisMinJD &&
    simulationJD <= ephemerisMaxJD;
  propagationMode.textContent = usingEphemeris
    ? "Horizons ephemeris"
    : "Kepler approximation";
  propagationMode.dataset.mode = usingEphemeris ? "ephemeris" : "kepler";
}
export function updateDayCounter(days) {
  const day = Math.floor(days);
  if (!dayCounter || day === lastDisplayedDay) return;
  lastDisplayedDay = day;
  dayCounter.textContent = simulationEpochMs !== null
    ? dateFormatter.format(new Date(simulationEpochMs + day * 86400000))
    : `Day ${day}`;
  updatePropagationMode(days);
}

export function updateUIDisplay(simSpeed) {
  if (simSpeed === lastDisplayedSpeed) return;
  lastDisplayedSpeed = simSpeed;
  if (speedSpan) speedSpan.textContent = `${simSpeed.toFixed(1)}×`;
  if (speedRate) speedRate.textContent = CONSTANTS.formatSimulationRate(simSpeed);
}

export function cleanupTelemetry() {
  speedSpan = speedRate = dayCounter = epochLabel = frameLabel = null;
  propagationMode = ephemerisSource = ephemerisRange = null;
  ephemerisMinJD = ephemerisMaxJD = simulationEpochMs = null;
  lastDisplayedDay = lastDisplayedSpeed = null;
}
