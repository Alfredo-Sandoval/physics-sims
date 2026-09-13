import { getInterpolatedEphemerisPositionAU } from "../orbitalRuntime.js";

// Solar System Simulation Worker
// Handles orbital calculations and position updates in a separate thread.

const DEG2RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstFinite(values) {
  for (let i = 0; i < values.length; i += 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return null;
}

function parseIsoDateToJulian(isoText) {
  if (typeof isoText !== "string" || !isoText.trim()) return null;
  const timestamp = Date.parse(isoText);
  if (!Number.isFinite(timestamp)) return null;
  return timestamp / 86400000 + 2440587.5;
}

function clampEccentricity(eccentricity) {
  if (!Number.isFinite(eccentricity)) return 0;
  return Math.max(0, Math.min(0.99, eccentricity));
}

function resolveAngleRad(radCandidate, degreeCandidate) {
  const rad = toFiniteNumber(radCandidate);
  if (Number.isFinite(rad)) return rad;
  const deg = toFiniteNumber(degreeCandidate);
  return Number.isFinite(deg) ? deg * DEG2RAD : 0;
}

// Mean motion
function meanMotion(aAU, mu = 0.01720209895 ** 2) {
  return Math.sqrt(mu / (aAU * aAU * aAU));
}

// Solve Kepler's equation via Newton-Raphson
function eccentricAnomaly(M, e, tol = 1e-6) {
  e = clampEccentricity(e);
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i += 1) {
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const denominator = 1 - e * cosE;
    if (Math.abs(denominator) < 1e-10) break;

    const delta = E - e * sinE - M;
    E -= delta / denominator;
    if (Math.abs(delta) < tol) break;
  }
  return E;
}

// True anomaly
function trueAnomaly(E, e) {
  const denominator = 1 - e * Math.cos(E);
  if (Math.abs(denominator) < 1e-10) return E;

  const cosNu = (Math.cos(E) - e) / denominator;
  const sinNu = (Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E)) / denominator;
  return Math.atan2(sinNu, cosNu);
}

// Radius
function radius(a, e, nu) {
  return (a * (1 - e * e)) / (1 + e * Math.cos(nu));
}

// Main orbital state calculation
function getOrbitalState(tDays, elems) {
  const { a, e, w = 0, M0 = 0 } = elems;

  if (!Number.isFinite(a) || a <= 0) return { x: 0, y: 0, trueAnomaly: 0 };
  if (!Number.isFinite(e) || e < 0) return { x: 0, y: 0, trueAnomaly: 0 };
  if (!Number.isFinite(tDays)) return { x: 0, y: 0, trueAnomaly: 0 };

  const n = meanMotion(a);
  const M = (((M0 + n * tDays) % TWO_PI) + TWO_PI) % TWO_PI;

  const E = eccentricAnomaly(M, e);
  const nu = trueAnomaly(E, e);
  const r = radius(a, e, nu);

  let x = r * Math.cos(nu);
  let y = r * Math.sin(nu);

  if (w !== 0) {
    const cosw = Math.cos(w);
    const sinw = Math.sin(w);
    const xr = x * cosw - y * sinw;
    const yr = x * sinw + y * cosw;
    x = xr;
    y = yr;
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: a, y: 0, trueAnomaly: 0 };
  return { x, y, trueAnomaly: nu };
}

function resolveEpochJD(source, fallbackEpochJD = null) {
  return firstFinite([
    toFiniteNumber(source?.epochJD),
    toFiniteNumber(source?.kepler?.epochJD),
    parseIsoDateToJulian(source?.epochDateUtc),
    parseIsoDateToJulian(source?.kepler?.epochDateUtc),
    toFiniteNumber(source?.ephemeris?.epochJD),
    toFiniteNumber(source?.ephemerisMeta?.epochJD),
    toFiniteNumber(fallbackEpochJD),
  ]);
}

function resolveKeplerElements(source) {
  const a = firstFinite([toFiniteNumber(source?.a), toFiniteNumber(source?.orbitRadiusAU)]);
  const e = clampEccentricity(
    firstFinite([
      toFiniteNumber(source?.e),
      toFiniteNumber(source?.orbitalEccentricity),
      toFiniteNumber(source?.info?.orbitalEccentricity),
      0,
    ])
  );

  const argPeriapsisRad = resolveAngleRad(
    firstFinite([toFiniteNumber(source?.argPeriapsisRad), toFiniteNumber(source?.wRad), toFiniteNumber(source?.w)]),
    firstFinite([
      toFiniteNumber(source?.omegaDeg),
      toFiniteNumber(source?.argPeriapsisDeg),
      toFiniteNumber(source?.kepler?.argPeriapsisDeg),
    ])
  );
  const meanAnomalyRad = resolveAngleRad(
    firstFinite([toFiniteNumber(source?.meanAnomalyRad), toFiniteNumber(source?.M0Rad), toFiniteNumber(source?.M0)]),
    firstFinite([toFiniteNumber(source?.M0Deg), toFiniteNumber(source?.kepler?.meanAnomalyDeg)])
  );
  const inclinationRad = resolveAngleRad(
    firstFinite([toFiniteNumber(source?.inclinationRad), toFiniteNumber(source?.iRad), toFiniteNumber(source?.i)]),
    firstFinite([
      toFiniteNumber(source?.iDeg),
      toFiniteNumber(source?.inclinationDeg),
      toFiniteNumber(source?.kepler?.inclinationDeg),
      toFiniteNumber(source?.info?.orbitalInclinationDeg),
    ])
  );
  const ascNodeRad = resolveAngleRad(
    firstFinite([
      toFiniteNumber(source?.ascendingNodeRad),
      toFiniteNumber(source?.OmegaRad),
      toFiniteNumber(source?.Omega),
    ]),
    firstFinite([
      toFiniteNumber(source?.OmegaDeg),
      toFiniteNumber(source?.longAscNodeDeg),
      toFiniteNumber(source?.kepler?.longAscNodeDeg),
    ])
  );

  return { a, e, argPeriapsisRad, meanAnomalyRad, inclinationRad, ascNodeRad };
}

function getKeplerEclipticPositionAU(simulatedDays, source) {
  const elements = resolveKeplerElements(source);

  const state = getOrbitalState(simulatedDays, {
    a: Number.isFinite(elements.a) ? elements.a : 0,
    e: elements.e,
    w: elements.argPeriapsisRad,
    M0: elements.meanAnomalyRad,
  });

  const radiusValue = Math.hypot(state.x, state.y);
  const argumentOfLatitude = Math.atan2(state.y, state.x);
  const cosu = Math.cos(argumentOfLatitude);
  const sinu = Math.sin(argumentOfLatitude);
  const cosO = Math.cos(elements.ascNodeRad);
  const sinO = Math.sin(elements.ascNodeRad);
  const cosi = Math.cos(elements.inclinationRad);
  const sini = Math.sin(elements.inclinationRad);

  return {
    x: radiusValue * (cosO * cosu - sinO * sinu * cosi),
    y: radiusValue * (sinO * cosu + cosO * sinu * cosi),
    z: radiusValue * (sinu * sini),
  };
}

function getPlanetEclipticPositionAU(simulatedDays, source, fallbackEpochJD = null) {
  const interpolated = getInterpolatedEphemerisPositionAU(source, simulatedDays, fallbackEpochJD);
  if (interpolated) return interpolated;
  return getKeplerEclipticPositionAU(simulatedDays, source);
}

function writeScenePosition(array, baseIndex, eclipticPositionAU, scale) {
  array[baseIndex + 0] = eclipticPositionAU.x * scale;
  array[baseIndex + 1] = eclipticPositionAU.z * scale;
  array[baseIndex + 2] = eclipticPositionAU.y * scale;
}

function prepareInitPlanet(source, fallbackEpochJD) {
  const epochJD = resolveEpochJD(source, fallbackEpochJD);
  return {
    a: toFiniteNumber(source?.a ?? source?.orbitRadiusAU) ?? 0,
    e: clampEccentricity(
      firstFinite([
        toFiniteNumber(source?.e),
        toFiniteNumber(source?.orbitalEccentricity),
        toFiniteNumber(source?.info?.orbitalEccentricity),
        0,
      ])
    ),
    argPeriapsisRad: resolveAngleRad(undefined, source?.omegaDeg ?? source?.argPeriapsisDeg),
    meanAnomalyRad: resolveAngleRad(undefined, source?.M0Deg ?? source?.meanAnomalyDeg),
    inclinationRad: resolveAngleRad(undefined, source?.iDeg ?? source?.inclinationDeg),
    ascendingNodeRad: resolveAngleRad(undefined, source?.OmegaDeg ?? source?.longAscNodeDeg),
    epochJD: Number.isFinite(epochJD) ? epochJD : null,
    ephemeris: source?.ephemeris ?? null,
  };
}

// Cache of planet orbital elements provided via INIT
let initPlanets = null;
let initEpochJD = null;

// Worker message handler
self.onmessage = function (e) {
  const { type, data } = e.data;

  switch (type) {
    case "INIT": {
      initEpochJD = firstFinite([
        toFiniteNumber(data?.epochJD),
        parseIsoDateToJulian(data?.epochDateUtc),
      ]);
      initPlanets = Array.isArray(data?.planets)
        ? data.planets.map((planet) => prepareInitPlanet(planet, initEpochJD))
        : null;
      if (!Number.isFinite(initEpochJD) && Array.isArray(initPlanets)) {
        initEpochJD = firstFinite(initPlanets.map((planet) => planet?.epochJD));
      }
      self.postMessage({ type: "INIT_DONE" });
      break;
    }
    case "UPDATE_POSITIONS_BUFFER": {
      const out = data?.outBuffer;
      if (!initPlanets || !out) {
        self.postMessage(
          { type: "POSITIONS_UPDATED_BUFFER", data: { outBuffer: out } },
          out ? [out] : []
        );
        break;
      }

      const arr = new Float32Array(out);
      const simulatedDays = toFiniteNumber(data?.simulatedDays) ?? 0;
      const scale = toFiniteNumber(data?.orbitScaleFactor) ?? 1;
      const n = Math.min(initPlanets.length, Math.floor(arr.length / 3));

      for (let i = 0; i < n; i += 1) {
        const position = getPlanetEclipticPositionAU(simulatedDays, initPlanets[i], initEpochJD);
        writeScenePosition(arr, i * 3, position, scale);
      }

      self.postMessage({ type: "POSITIONS_UPDATED_BUFFER", data: { outBuffer: out } }, [out]);
      break;
    }
    case "UPDATE_POSITIONS": {
      const result = updatePositions(data);
      self.postMessage({ type: "POSITIONS_UPDATED", data: result });
      break;
    }
    case "UPDATE_ROTATIONS": {
      const rotationResult = updateRotations(data);
      self.postMessage({ type: "ROTATIONS_UPDATED", data: rotationResult });
      break;
    }
    default:
      console.error("Unknown message type:", type);
  }
};

// Update planet positions
function updatePositions(data) {
  const planets = Array.isArray(data?.planets) ? data.planets : [];
  const simulatedDays = toFiniteNumber(data?.simulatedDays) ?? 0;
  const orbitScaleFactor = toFiniteNumber(data?.orbitScaleFactor) ?? 1;
  const updates = {};

  planets.forEach((planet, index) => {
    if (!planet?.config) return;

    const position = getPlanetEclipticPositionAU(simulatedDays, planet.config, initEpochJD);
    updates[index] = {
      position: {
        x: position.x * orbitScaleFactor,
        y: position.z * orbitScaleFactor,
        z: position.y * orbitScaleFactor,
      },
    };
  });

  return updates;
}

// Update rotations
function updateRotations(data) {
  const planets = Array.isArray(data?.planets) ? data.planets : [];
  const delta = toFiniteNumber(data?.delta) ?? 0;
  const simulationSpeed = toFiniteNumber(data?.simulationSpeed) ?? 1;
  const updates = {};
  // The main thread accumulates elapsed time while a previous update is in flight.
  const dt = Math.max(0, delta);
  const tf = dt * simulationSpeed;

  planets.forEach((planet, index) => {
    if (!planet?.config) return;

    const cfg = planet.config;
    const rotationSpeed = toFiniteNumber(cfg.calculatedRotationSpeed) ?? 0;
    const rotationDirection = toFiniteNumber(cfg.rotationDirection) ?? 1;
    const rotationUpdate = rotationSpeed * rotationDirection * tf;

    const moonUpdates = {};
    if (Array.isArray(planet.moons)) {
      planet.moons.forEach((moon, moonIndex) => {
        const moonRotationSpeed = toFiniteNumber(moon.calculatedRotationSpeed) ?? 0;
        const moonRotationDirection = toFiniteNumber(moon.rotationDirection) ?? 1;
        const moonOrbitSpeed = toFiniteNumber(moon.calculatedOrbitSpeed) ?? 0;
        const moonOrbitDirection = toFiniteNumber(moon.orbitDirection) ?? 1;

        moonUpdates[moonIndex] = {
          rotation: moonRotationSpeed * moonRotationDirection * tf,
          orbit: moonOrbitSpeed * moonOrbitDirection * tf,
        };
      });
    }

    updates[index] = {
      rotation: rotationUpdate,
      moons: moonUpdates,
    };
  });

  return updates;
}
