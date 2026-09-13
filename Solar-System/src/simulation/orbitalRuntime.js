const TWO_PI = Math.PI * 2;
const AU_KM = 149597870.7;

const SUPPORTED_PRECESSION_J2 = Object.freeze({
  Earth: 1.08262668e-3,
  Mars: 1.96045e-3,
  Jupiter: 1.4697e-2,
});

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
  const timestamp = Date.parse(isoText);
  if (!Number.isFinite(timestamp)) return null;
  return timestamp / 86400000 + 2440587.5;
}

function clampEccentricity(eccentricity) {
  if (!Number.isFinite(eccentricity)) return 0;
  return Math.max(0, Math.min(0.99, eccentricity));
}

function wrapAnglePositive(angleRad) {
  if (!Number.isFinite(angleRad)) return 0;
  const wrapped = angleRad % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
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
  const vectorFromArray = parseVectorArray(sample?.position);
  if (vectorFromArray) return vectorFromArray;

  const vectorFromObject = parseVectorObject(sample?.position, ["x", "y", "z"]);
  if (vectorFromObject) return vectorFromObject;

  const vectorFromUpperObject = parseVectorObject(sample?.position, ["X", "Y", "Z"]);
  if (vectorFromUpperObject) return vectorFromUpperObject;

  const x = firstFinite([toFiniteNumber(sample?.x), toFiniteNumber(sample?.X)]);
  const y = firstFinite([toFiniteNumber(sample?.y), toFiniteNumber(sample?.Y)]);
  const z = firstFinite([toFiniteNumber(sample?.z), toFiniteNumber(sample?.Z), 0]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

function readVelocityVector(sample) {
  const vectorFromArray = parseVectorArray(sample?.velocity);
  if (vectorFromArray) return vectorFromArray;

  const vectorFromObject = parseVectorObject(sample?.velocity, ["x", "y", "z"]);
  if (vectorFromObject) return vectorFromObject;

  const vectorFromUpperObject = parseVectorObject(sample?.velocity, ["X", "Y", "Z"]);
  if (vectorFromUpperObject) return vectorFromUpperObject;

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
    toFiniteNumber(sample?.dayOffset),
    toFiniteNumber(sample?.offsetDays),
    toFiniteNumber(sample?.time?.days),
  ]);
  if (Number.isFinite(relativeDays) && Number.isFinite(epochJD)) return epochJD + relativeDays;

  const sampleDate = firstNonEmptyString([sample?.dateUtc, sample?.date, sample?.isoDate]);
  if (sampleDate) {
    const sampleJD = parseIsoDateToJulian(sampleDate);
    if (Number.isFinite(sampleJD)) return sampleJD;
  }

  if (Number.isFinite(startJD) && Number.isFinite(stepDays)) {
    return startJD + index * stepDays;
  }
  return null;
}

function resolveEphemerisSource(cfg) {
  if (!cfg) return null;
  if (Array.isArray(cfg.ephemeris)) return { samples: cfg.ephemeris, meta: cfg.ephemerisMeta ?? cfg };

  if (cfg.ephemeris && typeof cfg.ephemeris === "object") {
    const nestedSamples = Array.isArray(cfg.ephemeris.samples)
      ? cfg.ephemeris.samples
      : Array.isArray(cfg.ephemeris.states)
        ? cfg.ephemeris.states
        : null;
    if (nestedSamples) return { samples: nestedSamples, meta: cfg.ephemeris };
  }

  return null;
}

function resolveEpochJD(cfg, epochJDOverride = null) {
  return firstFinite([
    toFiniteNumber(epochJDOverride),
    toFiniteNumber(cfg?.kepler?.epochJD),
    toFiniteNumber(cfg?.epochJD),
    toFiniteNumber(cfg?.ephemeris?.epochJD),
    toFiniteNumber(cfg?.ephemerisMeta?.epochJD),
  ]);
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

  const velocityVector = readVelocityVector(sample);
  const velocityUnit = firstNonEmptyString([
    sample?.velocityUnit,
    sample?.speedUnit,
    sample?.units?.velocity,
    meta?.velocityUnit,
    meta?.speedUnit,
    meta?.units?.velocity,
  ]);

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

  if (velocityVector) {
    const velFactor = resolveVelocityFactor(velocityUnit, velocityVector);
    normalized.vx = velocityVector[0] * velFactor;
    normalized.vy = velocityVector[1] * velFactor;
    normalized.vz = velocityVector[2] * velFactor;
    normalized.hasVelocity = [normalized.vx, normalized.vy, normalized.vz].every((n) => Number.isFinite(n));
  }

  return [normalized.x, normalized.y, normalized.z].every((n) => Number.isFinite(n)) ? normalized : null;
}

function buildEphemerisCache(cfg, epochJD) {
  const source = resolveEphemerisSource(cfg);
  if (!source?.samples || source.samples.length < 2) return null;

  const { samples, meta } = source;
  const startJD = firstFinite([
    toFiniteNumber(meta?.startJD),
    toFiniteNumber(meta?.startJd),
    toFiniteNumber(meta?.epochJD),
    toFiniteNumber(cfg?.ephemerisStartJD),
  ]);
  const stepDays = firstFinite([
    toFiniteNumber(meta?.stepDays),
    toFiniteNumber(meta?.deltaDays),
    toFiniteNumber(meta?.dtDays),
    toFiniteNumber(cfg?.ephemerisStepDays),
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

function getCachedEphemeris(cfg, epochJD) {
  if (!cfg || !Number.isFinite(epochJD)) return null;

  const cached = cfg.__ephemerisCache;
  if (
    cached &&
    cfg.__ephemerisRef === cfg.ephemeris &&
    Number.isFinite(cfg.__ephemerisEpochJD) &&
    Math.abs(cfg.__ephemerisEpochJD - epochJD) < 1e-9
  ) {
    return cached;
  }

  const rebuilt = buildEphemerisCache(cfg, epochJD);
  cfg.__ephemerisRef = cfg.ephemeris;
  cfg.__ephemerisEpochJD = epochJD;
  cfg.__ephemerisCache = rebuilt;
  return rebuilt;
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

  const { samples } = cache;
  const lowerIndex = findLowerSampleIndex(samples, targetJD);
  const a = samples[lowerIndex];
  const b = samples[lowerIndex + 1];
  if (!a || !b) return null;

  const dt = b.jd - a.jd;
  if (!Number.isFinite(dt) || Math.abs(dt) < 1e-12) {
    return { x: a.x, y: a.y, z: a.z };
  }

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

export function getInterpolatedEphemerisPositionAU(cfg, simulatedDays, epochJDOverride = null) {
  if (!Number.isFinite(simulatedDays)) return null;

  const epochJD = resolveEpochJD(cfg, epochJDOverride);
  if (!Number.isFinite(epochJD)) return null;

  const cache = getCachedEphemeris(cfg, epochJD);
  if (!cache) return null;

  const targetJD = epochJD + simulatedDays;
  return interpolateFromCache(cache, targetJD);
}

export function getEphemerisRangeJD(cfg, epochJDOverride = null) {
  const epochJD = resolveEpochJD(cfg, epochJDOverride);
  if (!Number.isFinite(epochJD)) return null;
  const cache = getCachedEphemeris(cfg, epochJD);
  if (!cache || !Number.isFinite(cache.minJD) || !Number.isFinite(cache.maxJD)) return null;
  return { minJD: cache.minJD, maxJD: cache.maxJD };
}

export function getPlanetRadiusForMoonPrecession(planetUserData) {
  const cfg = planetUserData?.config;
  const radius = cfg?.actualRadiusEarthRadii ?? cfg?.actualRadius;
  return Number.isFinite(radius) ? radius * 6378.1366 : null;
}

function buildMoonPrecessionState(moonUserData, parentPlanetName, parentRadiusKm) {
  const j2 = SUPPORTED_PRECESSION_J2[parentPlanetName];
  if (!Number.isFinite(j2) || j2 <= 0) return { enabled: false, nodeCoeff: 0, periCoeff: 0 };

  const semiMajor = firstFinite([
    toFiniteNumber(moonUserData?.config?.orbitRadiusKm),
  ]);
  const inclination = firstFinite([
    toFiniteNumber(moonUserData?.orbitInclinationRad),
    toFiniteNumber(moonUserData?.config?.orbitalInclinationDeg) != null
      ? toFiniteNumber(moonUserData?.config?.orbitalInclinationDeg) * (Math.PI / 180)
      : null,
    0,
  ]);
  const eccentricity = clampEccentricity(
    firstFinite([
      toFiniteNumber(moonUserData?.orbitEccentricity),
      toFiniteNumber(moonUserData?.config?.orbitEccentricity),
      toFiniteNumber(moonUserData?.config?.orbitalEccentricity),
      0,
    ])
  );

  if (!Number.isFinite(semiMajor) || semiMajor <= 0 || !Number.isFinite(parentRadiusKm)) {
    return { enabled: false, nodeCoeff: 0, periCoeff: 0 };
  }

  const radiusRatioSq = (parentRadiusKm / semiMajor) ** 2;
  const denom = Math.max(1e-8, (1 - eccentricity * eccentricity) ** 2);
  const cosI = Math.cos(inclination);
  const cosISq = cosI * cosI;

  const nodeCoeff = (-1.5 * j2 * radiusRatioSq * cosI) / denom;
  const periCoeff = (0.75 * j2 * radiusRatioSq * (5 * cosISq - 1)) / denom;

  if (!Number.isFinite(nodeCoeff) || !Number.isFinite(periCoeff)) {
    return { enabled: false, nodeCoeff: 0, periCoeff: 0 };
  }
  return { enabled: true, nodeCoeff, periCoeff };
}

function ensureMoonPrecessionState(moonUserData, parentPlanetName, parentRadiusKm) {
  if (!moonUserData) return null;

  const state = moonUserData.__moonPrecession;
  const radiusKey = Number.isFinite(parentRadiusKm)
    ? Number(parentRadiusKm.toFixed(6))
    : null;

  if (state && state.parentPlanetName === parentPlanetName && state.radiusKey === radiusKey) {
    return state;
  }

  const baseNode = firstFinite([toFiniteNumber(moonUserData.orbitAscendingNodeRad), 0]);
  const basePeri = firstFinite([toFiniteNumber(moonUserData.orbitArgPeriapsisRad), 0]);
  const coeffs = buildMoonPrecessionState(moonUserData, parentPlanetName, parentRadiusKm);

  moonUserData.__moonPrecessionNodeOffset = 0;
  moonUserData.__moonPrecessionArgOffset = 0;
  moonUserData.orbitAscendingNodeRad = baseNode;
  moonUserData.orbitArgPeriapsisRad = basePeri;

  const nextState = {
    parentPlanetName,
    radiusKey,
    baseNode,
    basePeri,
    enabled: coeffs.enabled,
    nodeCoeff: coeffs.nodeCoeff,
    periCoeff: coeffs.periCoeff,
  };
  moonUserData.__moonPrecession = nextState;
  return nextState;
}

export function applyMoonJ2PrecessionAtTime(moonUserData, parentName, parentRadiusKm, days) {
  const state = ensureMoonPrecessionState(moonUserData, parentName, parentRadiusKm);
  if (!state?.enabled) return;
  const period = Math.abs(moonUserData.config?.orbitalPeriod);
  if (!Number.isFinite(period) || period === 0) return;
  const elapsedAngle = days / period * 2 * Math.PI * (moonUserData.orbitDirection ?? 1);
  moonUserData.orbitAscendingNodeRad = wrapAnglePositive(state.baseNode + elapsedAngle * state.nodeCoeff);
  moonUserData.orbitArgPeriapsisRad = wrapAnglePositive(state.basePeri + elapsedAngle * state.periCoeff);
}
