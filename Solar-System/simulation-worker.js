// Solar System Simulation Worker
// Handles orbital calculations and position updates in a separate thread.

const DEG2RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const AU_KM = 149597870.7;

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

function firstNonEmptyString(values) {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (typeof value === "string" && value.trim()) return value.trim();
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

function parseVectorObject(value, keys) {
  if (!value || typeof value !== "object") return null;
  const vector = [
    toFiniteNumber(value[keys[0]]),
    toFiniteNumber(value[keys[1]]),
    toFiniteNumber(value[keys[2]]),
  ];
  return vector.every((n) => Number.isFinite(n)) ? vector : null;
}

function parseVectorArray(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const vector = [toFiniteNumber(value[0]), toFiniteNumber(value[1]), toFiniteNumber(value[2])];
  return vector.every((n) => Number.isFinite(n)) ? vector : null;
}

function readPositionVector(sample) {
  const fromArray = parseVectorArray(sample?.position);
  if (fromArray) return fromArray;

  const fromObject = parseVectorObject(sample?.position, ["x", "y", "z"]);
  if (fromObject) return fromObject;

  const fromUpperObject = parseVectorObject(sample?.position, ["X", "Y", "Z"]);
  if (fromUpperObject) return fromUpperObject;

  const x = firstFinite([toFiniteNumber(sample?.x), toFiniteNumber(sample?.X)]);
  const y = firstFinite([toFiniteNumber(sample?.y), toFiniteNumber(sample?.Y)]);
  const z = firstFinite([toFiniteNumber(sample?.z), toFiniteNumber(sample?.Z), 0]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

function readVelocityVector(sample) {
  const fromArray = parseVectorArray(sample?.velocity);
  if (fromArray) return fromArray;

  const fromObject = parseVectorObject(sample?.velocity, ["x", "y", "z"]);
  if (fromObject) return fromObject;

  const fromUpperObject = parseVectorObject(sample?.velocity, ["X", "Y", "Z"]);
  if (fromUpperObject) return fromUpperObject;

  const vx = firstFinite([toFiniteNumber(sample?.vx), toFiniteNumber(sample?.vX)]);
  const vy = firstFinite([toFiniteNumber(sample?.vy), toFiniteNumber(sample?.vY)]);
  const vz = firstFinite([toFiniteNumber(sample?.vz), toFiniteNumber(sample?.vZ)]);
  if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) return null;
  return [vx, vy, vz];
}

function resolveDistanceFactor(unitHint, vector) {
  if (typeof unitHint === "string") {
    const unit = unitHint.toLowerCase();
    if (unit.includes("au")) return 1;
    if (unit.includes("km")) return 1 / AU_KM;
  }

  const maxMagnitude = Math.max(Math.abs(vector[0]), Math.abs(vector[1]), Math.abs(vector[2]));
  return maxMagnitude > 1000 ? 1 / AU_KM : 1;
}

function resolveVelocityFactor(unitHint, vector) {
  if (typeof unitHint === "string") {
    const unit = unitHint.toLowerCase();
    if (unit.includes("au/day") || unit.includes("au/d")) return 1;
    if (unit.includes("au/s")) return 86400;
    if (unit.includes("km/s")) return 86400 / AU_KM;
    if (unit.includes("km/day") || unit.includes("km/d")) return 1 / AU_KM;
  }

  const maxMagnitude = Math.max(Math.abs(vector[0]), Math.abs(vector[1]), Math.abs(vector[2]));
  return maxMagnitude > 1 ? 86400 / AU_KM : 1;
}

function resolveEphemerisSource(source) {
  if (!source) return null;
  if (Array.isArray(source.ephemeris)) return { samples: source.ephemeris, meta: source.ephemerisMeta ?? source };

  if (source.ephemeris && typeof source.ephemeris === "object") {
    const nested = Array.isArray(source.ephemeris.samples)
      ? source.ephemeris.samples
      : Array.isArray(source.ephemeris.states)
        ? source.ephemeris.states
        : null;
    if (nested) return { samples: nested, meta: source.ephemeris };
  }

  return null;
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

function resolveSampleTimeJD(sample, epochJD, index, startJD, stepDays) {
  const explicitJD = firstFinite([
    toFiniteNumber(sample?.jd),
    toFiniteNumber(sample?.JD),
    toFiniteNumber(sample?.epochJD),
    toFiniteNumber(sample?.tdbJD),
    toFiniteNumber(sample?.JDTDB),
    toFiniteNumber(sample?.timeJD),
    toFiniteNumber(sample?.time?.jd),
  ]);
  if (Number.isFinite(explicitJD)) return explicitJD;

  const relativeDays = firstFinite([
    toFiniteNumber(sample?.tDays),
    toFiniteNumber(sample?.dtDays),
    toFiniteNumber(sample?.offsetDays),
    toFiniteNumber(sample?.dayOffset),
    toFiniteNumber(sample?.time?.days),
  ]);
  if (Number.isFinite(relativeDays) && Number.isFinite(epochJD)) return epochJD + relativeDays;

  const dateHint = firstNonEmptyString([sample?.dateUtc, sample?.date, sample?.isoDate]);
  const parsedDateJD = parseIsoDateToJulian(dateHint);
  if (Number.isFinite(parsedDateJD)) return parsedDateJD;

  if (Number.isFinite(startJD) && Number.isFinite(stepDays)) {
    return startJD + index * stepDays;
  }
  return null;
}

function normalizeEphemerisSample(sample, meta, epochJD, index, startJD, stepDays) {
  const timeJD = resolveSampleTimeJD(sample, epochJD, index, startJD, stepDays);
  if (!Number.isFinite(timeJD)) return null;

  const position = readPositionVector(sample);
  if (!position) return null;

  const positionUnit = firstNonEmptyString([
    sample?.positionUnit,
    sample?.distanceUnit,
    sample?.units?.position,
    sample?.units,
    meta?.positionUnit,
    meta?.distanceUnit,
    meta?.units?.position,
    meta?.units,
  ]);
  const posFactor = resolveDistanceFactor(positionUnit, position);

  const normalized = {
    jd: timeJD,
    x: position[0] * posFactor,
    y: position[1] * posFactor,
    z: position[2] * posFactor,
    hasVelocity: false,
    vx: 0,
    vy: 0,
    vz: 0,
  };

  const velocity = readVelocityVector(sample);
  if (!velocity) return normalized;

  const velocityUnit = firstNonEmptyString([
    sample?.velocityUnit,
    sample?.speedUnit,
    sample?.units?.velocity,
    meta?.velocityUnit,
    meta?.speedUnit,
    meta?.units?.velocity,
  ]);
  const velFactor = resolveVelocityFactor(velocityUnit, velocity);
  normalized.vx = velocity[0] * velFactor;
  normalized.vy = velocity[1] * velFactor;
  normalized.vz = velocity[2] * velFactor;
  normalized.hasVelocity = [normalized.vx, normalized.vy, normalized.vz].every((n) => Number.isFinite(n));
  return normalized;
}

function buildEphemerisCache(source, epochJD) {
  const resolvedSource = resolveEphemerisSource(source);
  if (!resolvedSource?.samples || resolvedSource.samples.length < 2) return null;

  const { samples, meta } = resolvedSource;
  const startJD = firstFinite([
    toFiniteNumber(meta?.startJD),
    toFiniteNumber(meta?.startJd),
    toFiniteNumber(meta?.epochJD),
    toFiniteNumber(source?.ephemerisStartJD),
  ]);
  const stepDays = firstFinite([
    toFiniteNumber(meta?.stepDays),
    toFiniteNumber(meta?.deltaDays),
    toFiniteNumber(meta?.dtDays),
    toFiniteNumber(source?.ephemerisStepDays),
  ]);

  const normalized = [];
  for (let i = 0; i < samples.length; i += 1) {
    const parsed = normalizeEphemerisSample(samples[i], meta, epochJD, i, startJD, stepDays);
    if (parsed) normalized.push(parsed);
  }
  if (normalized.length < 2) return null;

  normalized.sort((a, b) => a.jd - b.jd);
  const hasVelocity = normalized.every((sample) => sample.hasVelocity);

  return {
    samples: normalized,
    minJD: normalized[0].jd,
    maxJD: normalized[normalized.length - 1].jd,
    hasVelocity,
  };
}

function findLowerSampleIndex(samples, targetJD) {
  let lo = 0;
  let hi = samples.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].jd <= targetJD) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return Math.max(0, Math.min(samples.length - 2, lo - 1));
}

function interpolateLinear(a, b, t) {
  return a + (b - a) * t;
}

function interpolateHermite(p0, p1, v0, v1, dt, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * dt * v0 + h01 * p1 + h11 * dt * v1;
}

function interpolateFromCache(cache, targetJD) {
  if (!cache || !Number.isFinite(targetJD)) return null;
  if (targetJD < cache.minJD || targetJD > cache.maxJD) return null;

  const lowerIndex = findLowerSampleIndex(cache.samples, targetJD);
  const a = cache.samples[lowerIndex];
  const b = cache.samples[lowerIndex + 1];
  if (!a || !b) return null;

  const dt = b.jd - a.jd;
  if (!Number.isFinite(dt) || Math.abs(dt) < 1e-12) return { x: a.x, y: a.y, z: a.z };

  const t = (targetJD - a.jd) / dt;
  if (Math.abs(t) < 1e-12) return { x: a.x, y: a.y, z: a.z };
  if (Math.abs(1 - t) < 1e-12) return { x: b.x, y: b.y, z: b.z };

  if (a.hasVelocity && b.hasVelocity) {
    return {
      x: interpolateHermite(a.x, b.x, a.vx, b.vx, dt, t),
      y: interpolateHermite(a.y, b.y, a.vy, b.vy, dt, t),
      z: interpolateHermite(a.z, b.z, a.vz, b.vz, dt, t),
    };
  }

  return {
    x: interpolateLinear(a.x, b.x, t),
    y: interpolateLinear(a.y, b.y, t),
    z: interpolateLinear(a.z, b.z, t),
  };
}

function getInterpolatedEphemerisPositionAU(source, simulatedDays, fallbackEpochJD = null) {
  if (!Number.isFinite(simulatedDays)) return null;

  const epochJD = resolveEpochJD(source, fallbackEpochJD);
  if (!Number.isFinite(epochJD)) return null;

  const cache = source?.ephemerisCache ?? buildEphemerisCache(source, epochJD);
  if (!cache) return null;

  const targetJD = epochJD + simulatedDays;
  return interpolateFromCache(cache, targetJD);
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
    ephemerisCache: Number.isFinite(epochJD) ? buildEphemerisCache(source, epochJD) : null,
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
  const dt = Math.max(0.001, Math.min(delta, 0.1));
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
