import { readFile } from "node:fs/promises";
import { getPlanetPositionAU } from "../src/simulation/positions.js";
import { getInterpolatedEphemerisPositionAU } from "../src/simulation/orbitalRuntime.js";

const planets = JSON.parse(await readFile(new URL("../data/solar-system.json", import.meta.url), "utf8"));
let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  checks++;
}

for (const config of planets) {
  const samples = config.ephemeris.samples;
  // Stored Horizons samples are the oracle, independent of either runtime solver.
  for (const index of [0, 65, 173, 365, 620, samples.length - 1]) {
    const sample = samples[index];
    const days = sample.jd - config.kepler.epochJD;
    const actual = getPlanetPositionAU(config, days);
    assert(Math.hypot(actual.x - sample.x, actual.y - sample.y, actual.z - sample.z) < 1e-12,
      `${config.name} must use the recorded Horizons position at sample ${index}`);
  }
  for (const jd of [samples[0].jd - 1, samples.at(-1).jd + 1]) {
    const days = jd - config.kepler.epochJD;
    assert(getInterpolatedEphemerisPositionAU(config, days) === null,
      `${config.name} must identify dates outside its ephemeris coverage`);
    const position = getPlanetPositionAU(config, days);
    assert([position.x, position.y, position.z].every(Number.isFinite),
      `${config.name} must still propagate outside its ephemeris coverage`);
  }
}
console.log(`Ephemeris contracts passed (${checks} checks across ${planets.length} planets)`);
