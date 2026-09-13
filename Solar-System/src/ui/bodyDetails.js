import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { hasAnime, stopAnime } from "./animationLibrary.js";
import { getSelectedObject } from "../core/state.js";
import { clearElement, appendInfoRow, renderInfoSection, formatFiniteNumber,
  formatAstronomicalUnits, populateParagraphList, formatMeasurement } from "./dom.js";

let infoPanel, infoTitle, infoTypeBadge, infoDistance, infoSize, infoBodyType;
let infoPhysical, infoOrbital, infoCoolFacts, infoDetails, coolFactsSection;
let closeBodyDetails;
let infoPanelHideTimeoutId = null;
const currentDistanceTempVec = new THREE.Vector3();

export function initBodyDetails(onClose) {
  closeBodyDetails = onClose;
  infoPanel = document.getElementById("info");
  infoTitle = document.getElementById("info-title");
  infoTypeBadge = document.getElementById("info-type-badge");
  infoDistance = document.getElementById("info-distance");
  infoSize = document.getElementById("info-size");
  infoBodyType = document.getElementById("info-body-type");
  infoPhysical = document.getElementById("info-physical");
  infoOrbital = document.getElementById("info-orbital");
  infoCoolFacts = document.getElementById("info-cool-facts");
  infoDetails = document.getElementById("info-details");
  coolFactsSection = document.getElementById("cool-facts-section");
}

function getCurrentHeliocentricDistanceAU(obj) {
  if (!obj || obj.userData?.type !== "planet") return null;
  obj.getWorldPosition(currentDistanceTempVec);
  const distance = currentDistanceTempVec.length() / CONSTANTS.ORBIT_SCALE_FACTOR;
  return Number.isFinite(distance) ? distance : null;
}

function updatePlanetDistanceReadout(obj) {
  if (obj?.userData?.type !== "planet") return;
  const distanceText = formatAstronomicalUnits(getCurrentHeliocentricDistanceAU(obj));
  if (infoDistance && infoDistance.textContent !== distanceText) infoDistance.textContent = distanceText;
  const row = document.getElementById("info-current-distance");
  if (row && row.textContent !== distanceText) row.textContent = distanceText;
}

function clearInfoPanelHideTimer() {
  if (infoPanelHideTimeoutId === null) return;
  clearTimeout(infoPanelHideTimeoutId);
  infoPanelHideTimeoutId = null;
}

function scheduleInfoPanelHide() {
  clearInfoPanelHideTimer();
  infoPanelHideTimeoutId = setTimeout(() => {
    infoPanelHideTimeoutId = null;
    if (!infoPanel) return;
    infoPanel.style.display = "none";
    infoPanel.classList.remove("animating-out");
  }, 400);
}

export function displayObjectInfo(obj) {
  if (!infoPanel) return; // Guard against missing element
  clearInfoPanelHideTimer();

  if (!obj?.userData?.config) {
    // Animate out if currently visible
    if (infoPanel.style.display !== "none" && !infoPanel.classList.contains("animating-out")) {
      infoPanel.classList.add("animating-out");
      infoPanel.classList.remove("show");
      scheduleInfoPanelHide();
    }
    return;
  }

  const ud = obj.userData;
  const cfg = ud.config;

  // Update title and badge
  infoTitle.textContent = ud.name || "Unknown";
  infoTypeBadge.textContent = ud.type || "Unknown";
  infoTypeBadge.className = `info-type-badge ${ud.type}`;

  const distanceLabel = document.getElementById("info-distance-label");
  const periodLabel = document.getElementById("info-period-label");
  const radius = cfg.actualRadius ?? cfg.actualRadiusEarthRadii;
  infoSize.textContent = formatMeasurement(
    Number.isFinite(radius) ? radius * CONSTANTS.EARTH_RADIUS_KM : null, "km", 0
  );
  if (ud.type === "star") {
    distanceLabel.textContent = "Reference position";
    infoDistance.textContent = "Sun-centered";
    periodLabel.textContent = "Rotation period";
    infoBodyType.textContent = "25–36 days";
    populateStarInfo(cfg);
  } else if (ud.type === "planet") {
    distanceLabel.textContent = "Current distance from Sun";
    infoDistance.textContent = formatAstronomicalUnits(getCurrentHeliocentricDistanceAU(obj));
    periodLabel.textContent = "Kepler year estimate";
    infoBodyType.textContent = formatMeasurement(cfg.info?.orbitalPeriod, "days");
    populatePlanetInfo(cfg, obj);
  } else if (ud.type === "moon") {
    distanceLabel.textContent = `Orbit size from ${ud.parentPlanetName}`;
    infoDistance.textContent = formatMeasurement(cfg.orbitRadiusKm, "km", 0);
    periodLabel.textContent = "Orbital period";
    infoBodyType.textContent = formatMeasurement(Math.abs(cfg.orbitalPeriod), "days");
    populateMoonInfo(ud);
  }

  const textureNote = document.getElementById("info-texture-note");
  textureNote.hidden = !cfg.textureNote;
  textureNote.textContent = cfg.textureNote ? `Illustrative texture. ${cfg.textureNote}` : "";
  document.getElementById("info-technical").open = false;
  document.getElementById("info-more-facts").open = false;
  const facts = cfg.coolFacts?.length ? cfg.coolFacts : [
    cfg.info?.composition || cfg.info?.Composition || cfg.composition,
  ].filter(Boolean);
  coolFactsSection.style.display = facts.length ? "block" : "none";
  populateParagraphList(infoCoolFacts, facts.slice(0, 1));
  document.getElementById("info-more-facts").hidden = facts.length < 2;
  populateParagraphList(document.getElementById("info-other-facts"), facts.slice(1));

  ensureCloseButton();

  // The shared dock keeps details clear of metadata and tour controls.
  infoPanel.style.display = "block";
  infoPanel.classList.remove("show");
  if (hasAnime()) {
    stopAnime(infoPanel); // Remove any existing animations on this element
  }

  infoPanel.scrollTop = 0;

  // Use CSS transition for smooth animation
  requestAnimationFrame(() => {
    infoPanel.classList.add("show");
    infoPanel.classList.remove("animating-out");
  });
}
function populateStarInfo(cfg) {
  const info = cfg?.info || {};
  renderInfoSection(infoPhysical, [
    { label: "Mass", value: info.Mass },
    { label: "Temperature", value: info.Temperature },
    { label: "Composition", value: info.Composition },
    { label: "Type", value: info.Type },
    { label: "Age", value: info.Age },
  ]);

  renderInfoSection(infoOrbital, [
    { label: "Position", value: "Center of Solar System" },
    { label: "Sidereal Rotation", value: info.Rotation },
  ]);

  populateDetailedData(info, { bodyType: "star", config: cfg });
}

function populatePlanetInfo(cfg, obj) {
  const actualR = Number.isFinite(cfg.actualRadius)
    ? cfg.actualRadius
    : Number.isFinite(cfg.actualRadiusEarthRadii)
      ? cfg.actualRadiusEarthRadii
      : null;
  const diameterKm = Number.isFinite(actualR)
    ? Math.round(actualR * 2 * CONSTANTS.EARTH_RADIUS_KM).toLocaleString()
    : null;
  const info = cfg?.info || {};

  renderInfoSection(infoPhysical, [
    {
      label: "Radius",
      value: Number.isFinite(actualR) ? `${actualR.toFixed(3)} Earth radii` : "—",
    },
    { label: "Diameter", value: diameterKm ? `${diameterKm} km` : "—" },
    { label: "Mass", value: formatMeasurement(info.massEarths, "× Earth", 3) },
    { label: "Density", value: formatMeasurement(info.densityGcm3, "g/cm³", 3) },
    {
      label: "Surface Gravity",
      value: formatMeasurement(cfg.gravityStrength, "g", 3),
    },
    {
      label: "Escape Velocity",
      value: formatMeasurement(info.escapeVelocityKms, "km/s"),
    },
  ]);

  renderInfoSection(infoOrbital, [
    {
      label: "Current Distance from Sun",
      value: formatAstronomicalUnits(getCurrentHeliocentricDistanceAU(obj)),
      valueId: "info-current-distance",
    },
    { label: "Semi-major Axis", value: formatAstronomicalUnits(cfg.orbitRadiusAU) },
    {
      label: "Kepler Period Estimate",
      value:
        info.orbitalPeriod !== undefined
          ? `${formatFiniteNumber(info.orbitalPeriod, 2)} days`
          : "—",
    },
    {
      label: "Mean Orbital Speed",
      value:
        info.meanOrbitalSpeedKms !== undefined
          ? `${formatFiniteNumber(info.meanOrbitalSpeedKms, 2)} km/s`
          : "—",
    },
    {
      label: "Orbital Eccentricity",
      value: formatFiniteNumber(info.orbitalEccentricity, 4),
    },
    {
      label: "Axial Tilt",
      value: cfg.axialTilt !== undefined ? `${formatFiniteNumber(cfg.axialTilt, 2)}°` : "—",
    },
    {
      label: "Sidereal Rotation Period",
      value:
        cfg.rotationPeriod !== undefined
          ? `${formatFiniteNumber(Math.abs(cfg.rotationPeriod), 2)} days${cfg.retrograde ? " (retrograde)" : ""}`
          : "—",
    },
  ]);

  populateDetailedData(info, { bodyType: "planet", config: cfg });
}

function populateMoonInfo(ud) {
  const cfg = ud.config;
  const displayInfo = ud.displayInfo;

  renderInfoSection(infoPhysical, [
    { label: "Size", value: displayInfo?.Size },
    { label: "Parent Planet", value: displayInfo?.ParentPlanet },
    { label: "Composition", value: cfg?.composition || "Rocky body" },
  ]);

  renderInfoSection(infoOrbital, [
    { label: `Semi-major axis from ${ud.parentPlanetName}`, value: formatMeasurement(cfg.orbitRadiusKm, "km", 0) },
    { label: "Sidereal Orbital Period", value: displayInfo?.OrbitalPeriod },
    { label: "Sidereal Rotation Period", value: displayInfo?.RotationPeriod },
  ]);

  populateDetailedData(displayInfo, { bodyType: "moon", config: cfg });
}

function populateDetailedData(dataObj, context = null) {
  const fields = [
    ["composition", "Composition"],
    ["surfaceTempMinC", "Minimum temperature", "°C", 0],
    ["surfaceTempMaxC", "Maximum temperature", "°C", 0],
    ["orbitalInclinationDeg", "Orbital inclination", "°", 3],
    ["ringCount", "Ring groups (dataset)", "", 0],
    ["magnetosphere", "Intrinsic magnetosphere"],
    ["albedoGeometric", "Geometric albedo", "", 3],
  ];
  const rows = [];
  for (const [key, label, unit, digits] of fields) {
    const value = dataObj?.[key];
    if (value === null || value === undefined) continue;
    rows.push({ label, value: typeof value === "boolean" ? (value ? "Yes" : "No")
      : typeof value === "number" ? formatMeasurement(value, unit, digits).trim() : value });
  }
  if (context?.bodyType === "planet" && Number.isFinite(dataObj?.moonCount)) {
    rows.push({ label: "Known moons (dataset)", value: formatFiniteNumber(dataObj.moonCount, 0) });
    rows.push({ label: "Moons shown here", value: context.config.moons.length });
  }
  renderInfoSection(infoDetails, rows);
  document.getElementById("info-additional-section").hidden = rows.length === 0;
}

function ensureCloseButton() {
  if (infoPanel.querySelector(".info-close-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "×";
  btn.className = "info-close-btn";
  btn.setAttribute("aria-label", "Close body details");
  btn.title = "Close";
  btn.addEventListener("click", closeBodyDetails);
  infoPanel.appendChild(btn);
}

export function updateInfoFollow() {
  const selectedObject = getSelectedObject();
  if (selectedObject && infoPanel?.style.display !== "none") updatePlanetDistanceReadout(selectedObject);
}

export function cleanupBodyDetails() {
  clearInfoPanelHideTimer();
  infoPanel?.querySelector(".info-close-btn")?.remove();
  if (infoPanel) infoPanel.style.display = "none";
  closeBodyDetails = null;
}
