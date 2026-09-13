import * as CONSTANTS from "../core/config.js";
import { getEphemerisRangeJD } from "./orbitalRuntime.js";
import { info as logInfo, debug as logDebug, warn as logWarn, error as logError } from "../core/logger.js";

export async function loadPlanetData() {
  logInfo("LoadData", "Starting JSON fetch...");
  const res = await fetch(new URL("../../data/solar-system.json", import.meta.url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  logDebug("LoadData", "JSON fetched, parsing...");
  const planetConfigs = await res.json();
  let simulationFrameLabel;
  logInfo("LoadData", `JSON parsed, got ${planetConfigs.length} planets`);

  const epochMeta = planetConfigs?.[0]?.kepler || {};
  const ephemerisMeta = planetConfigs?.[0]?.ephemeris || {};
  const simulationEpochJD = Number.isFinite(epochMeta.epochJD) ? epochMeta.epochJD : null;
  const simulationEpochDateUtc = epochMeta.epochDateUtc || null;
  const simulationEpochLabel = epochMeta.epochDate || epochMeta.epoch || null;
  const ephemerisRanges = planetConfigs
    .map((cfg) => getEphemerisRangeJD(cfg, simulationEpochJD))
    .filter(Boolean);
  const ephemerisMinJD = ephemerisRanges.length
    ? Math.max(...ephemerisRanges.map((range) => range.minJD))
    : null;
  const ephemerisMaxJD = ephemerisRanges.length
    ? Math.min(...ephemerisRanges.map((range) => range.maxJD))
    : null;
  const referenceFrame = epochMeta.referenceFrame || ephemerisMeta.frame || null;
  const referenceCenter = epochMeta.referenceCenter || ephemerisMeta.center || null;
  const referenceTimescale = epochMeta.timescale || ephemerisMeta.timescale || null;
  if (referenceFrame) {
    simulationFrameLabel = `${referenceFrame}${referenceCenter ? ` · ${referenceCenter}` : ""}${
      referenceTimescale ? ` (${referenceTimescale})` : ""
    }`;
  } else {
    simulationFrameLabel = null;
  }

  planetConfigs.forEach((cfg, index) => {
    try {
      logDebug("LoadData", `Processing planet ${index}: ${cfg.name}`);
      // Validate orbital data consistency from Horizons
      const issues = [];
      if (!Number.isFinite(cfg.orbitRadiusAU) || cfg.orbitRadiusAU <= 0) {
        issues.push("orbitRadiusAU");
      }
      if (!Number.isFinite(cfg.info?.orbitalEccentricity)) {
        issues.push("orbitalEccentricity");
      }
      const k = cfg.kepler || {};
      const requiredKepler = ["inclinationDeg", "longAscNodeDeg", "argPeriapsisDeg", "meanAnomalyDeg"];
      requiredKepler.forEach((key) => {
        if (!Number.isFinite(k[key])) issues.push(`kepler.${key}`);
      });
      if (Number.isFinite(simulationEpochJD) && Number.isFinite(k.epochJD)) {
        const drift = Math.abs(k.epochJD - simulationEpochJD);
        if (drift > 1e-6) issues.push("kepler.epochJD mismatch");
      }
      if (Number.isFinite(cfg.orbitRadiusAU) && Number.isFinite(cfg.info?.orbitalPeriod)) {
        const expectedPeriod = Math.sqrt(cfg.orbitRadiusAU ** 3) * 365.25;
        const relError = Math.abs(expectedPeriod - cfg.info.orbitalPeriod) / cfg.info.orbitalPeriod;
        if (relError > 0.01) issues.push("orbitalPeriod vs a mismatch");
      }
      if (issues.length) {
        logWarn("LoadData", `Orbit data warnings for ${cfg.name}: ${issues.join(", ")}`);
      }

      /* rotation speed --------------------------------------------------- */
      const P = Math.abs(cfg.rotationPeriod || 0);
      cfg.calculatedRotationSpeed = P
        ? (2 * Math.PI) / (P * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
        : 0;
      // Keep one spin convention: axial tilt encodes spin-axis orientation.
      // With this convention, direction should not be double-applied via signed periods.
      if (Number.isFinite(cfg.axialTilt)) {
        cfg.rotationDirection = 1;
      } else if (typeof cfg.retrograde === "boolean") {
        cfg.rotationDirection = cfg.retrograde ? -1 : 1;
      } else {
        cfg.rotationDirection = cfg.rotationPeriod >= 0 ? 1 : -1;
      }

      /* atmosphere colour parsing --------------------------------------- */
      if (cfg.atmosphere?.exists) {
        if (cfg.atmosphere.colorHex == null && typeof cfg.atmosphere.color === "string") {
          cfg.atmosphere.colorHex = cfg.atmosphere.color;
        }
        if (cfg.atmosphere.densityRelative == null && Number.isFinite(cfg.atmosphere.density)) {
          cfg.atmosphere.densityRelative = cfg.atmosphere.density;
        }
        const col = cfg.atmosphere.colorHex;
        if (typeof col === "string" && col.startsWith("#"))
          cfg.atmosphere.colorHex = parseInt(col.replace("#", "0x"), 16);
      } /* moons pre‑compute ------------------------------------------------ */
      cfg.moons?.forEach((m) => {
        // Normalize optional moon orbital-shape/orientation fields used by the renderer.
        const moonEccRaw = Number(m.orbitEccentricity ?? m.orbitalEccentricity ?? 0);
        m.orbitEccentricity = Math.max(0, Math.min(0.99, Number.isFinite(moonEccRaw) ? moonEccRaw : 0));

        const moonIncDeg = Number(m.orbitalInclinationDeg ?? m.inclinationDeg ?? 0);
        const moonNodeDeg = Number(m.longAscNodeDeg ?? m.ascendingNodeDeg ?? 0);
        const moonArgPeriDeg = Number(m.argPeriapsisDeg ?? m.argumentOfPeriapsisDeg ?? 0);
        m.orbitalInclinationDeg = Number.isFinite(moonIncDeg) ? moonIncDeg : 0;
        m.longAscNodeDeg = Number.isFinite(moonNodeDeg) ? moonNodeDeg : 0;
        m.argPeriapsisDeg = Number.isFinite(moonArgPeriDeg) ? moonArgPeriDeg : 0;
        m.orbitReference = m.orbitReference === "ecliptic" ? "ecliptic" : "equatorial";

        const Pm = Math.abs(m.orbitalPeriod || 0);
        m.calculatedOrbitSpeed = Pm
          ? (2 * Math.PI) / (Pm * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
          : 0;
        // Check retrograde flag first, then fall back to orbital period sign.
        if (typeof m.retrograde === "boolean") {
          m.orbitDirection = m.retrograde ? -1 : 1;
        } else {
          m.orbitDirection = m.orbitalPeriod >= 0 ? 1 : -1;
        }

        const Rm = Math.abs(m.rotationPeriod || 0);
        m.calculatedRotationSpeed = Rm
          ? (2 * Math.PI) / (Rm * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X)
          : 0;
        const isTidallyLocked = Pm > 0 && Rm > 0 && Math.abs(Pm - Rm) < 1e-6;
        if (typeof m.spinRetrograde === "boolean") {
          m.rotationDirection = m.spinRetrograde ? -1 : 1;
        } else if (isTidallyLocked) {
          // A tidally-locked moon should share the same inertial direction as its orbit.
          m.rotationDirection = m.orbitDirection;
        } else {
          m.rotationDirection = m.rotationPeriod >= 0 ? 1 : -1;
        }

        if (m.atmosphere?.exists) {
          if (m.atmosphere.colorHex == null && typeof m.atmosphere.color === "string") {
            m.atmosphere.colorHex = m.atmosphere.color;
          }
          if (m.atmosphere.densityRelative == null && Number.isFinite(m.atmosphere.density)) {
            m.atmosphere.densityRelative = m.atmosphere.density;
          }
          const col = m.atmosphere.colorHex;
          if (typeof col === "string" && col.startsWith("#"))
            m.atmosphere.colorHex = parseInt(col.replace("#", "0x"), 16);
        }
      });
      logDebug("LoadData", `Completed planet ${index}: ${cfg.name}`);
    } catch (err) {
      logError("LoadData", `Error processing planet ${index} (${cfg.name})`, err);
      throw err;
    }
  });
  return { planetConfigs, simulationEpochJD, simulationEpochDateUtc, simulationEpochLabel,
    simulationFrameLabel, ephemerisMinJD, ephemerisMaxJD };
}
