import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const solarDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const texturesDir = path.join(solarDir, "textures");
const htmlPath = path.join(solarDir, "index.html");
const dataPath = path.join(solarDir, "solarsystem_data.json");
const workerPath = path.join(solarDir, "simulation-worker.js");
const orbitalRuntimePath = path.join(solarDir, "orbitalRuntime.js");

const requiredDomIds = [
  "main",
  "loadingScreen",
  "errorOverlay",
  "menuContainer",
  "menuToggle",
  "controlSurface",
  "controls",
  "speedSlider",
  "speedValue",
  "speedRate",
  "togglePlaybackBtn",
  "resetSpeedBtn",
  "planetNavContainer",
  "planetNav",
  "moonNavContainer",
  "moonNav",
  "datePickerContainer",
  "datePicker",
  "datePickerHint",
  "additionalControls",
  "resetCameraBtn",
  "topDownBtn",
  "toggleOrbitsBtn",
  "toggleAsteroidBeltBtn",
  "highlightAsteroidBeltBtn",
  "togglePlanetLabelsBtn",
  "toggleMoonLabelsBtn",
  "toggleScaleModeBtn",
  "toggleFocusModeBtn",
  "planesCheckbox",
  "shadowsCheckbox",
  "info",
  "info-title",
  "info-type-badge",
  "info-distance",
  "info-size",
  "info-body-type",
  "info-physical",
  "info-orbital",
  "cool-facts-section",
  "info-cool-facts",
  "info-details",
  "simMetadata",
  "metadataDock",
  "modelAssumptions",
  "epochLabel",
  "frameLabel",
  "dayCounter",
  "propagationStatus",
  "propagationMode",
  "scaleIndicator",
  "ephemerisSource",
  "ephemerisRange",
];

const planetFields = {
  name: "string",
  actualRadius: "number",
  scaledRadius: "number",
  orbitRadiusAU: "number",
  baseOrbitSpeedFactor: "number",
  gravityStrength: "number",
  initialAngle: "number",
  rotationPeriod: "number",
  retrograde: "boolean",
  axialTilt: "number",
  atmosphere: "object",
  moons: "array",
  kepler: "object",
  info: "object",
  ephemeris: "object",
  textureUrl: "string",
};

const moonFields = {
  name: "string",
  actualRadius: "number",
  orbitRadiusKm: "number",
  orbitReference: "string",
  orbitalEccentricity: "number",
  orbitalInclinationDeg: "number",
  orbitalPeriod: "number",
  rotationPeriod: "number",
  retrograde: "boolean",
  textureUrl: "string",
};

const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function assertType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value && typeof value === "object" && !Array.isArray(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validateFields(owner, value, schema) {
  if (!assertType(value, "object")) {
    errors.push(`${owner} must be an object`);
    return;
  }

  for (const [field, type] of Object.entries(schema)) {
    check(Object.hasOwn(value, field), `${owner} is missing required field '${field}'`);
    if (Object.hasOwn(value, field)) {
      check(assertType(value[field], type), `${owner}.${field} must be ${type}`);
    }
  }
}

function extractDomIds(html) {
  return new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]));
}

function extractImportMap(html) {
  const match = html.match(/<script\b[^>]*\btype\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  check(match, "index.html must include a script[type=importmap]");
  if (!match) return {};

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    errors.push(`import map JSON does not parse: ${error.message}`);
    return {};
  }
}

function stripImportMaps(html) {
  return html.replace(/<script\b[^>]*\btype\s*=\s*["']importmap["'][^>]*>[\s\S]*?<\/script>/gi, "");
}

async function readSolarFiles(dir = solarDir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "textures" || entry.name === "node_modules") continue;

    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readSolarFiles(entryPath)));
    } else if (/\.(?:html|js|mjs)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function validateNoStaleThreeImports(filePath, source) {
  const relativePath = path.relative(solarDir, filePath);
  const content = relativePath === "index.html" ? stripImportMaps(source) : source;
  const disallowedPatterns = [
    {
      pattern: /["'`](?:\.\.?\/)*vendor\/[^"'`]*three[^"'`]*/i,
      reason: "local vendor three path",
    },
    {
      pattern: /(?:from|import\s*\()\s*["']https?:\/\/[^"']*three[^"']*["']/i,
      reason: "direct remote three import outside import map",
    },
    {
      pattern: /(?:from|import\s*\()\s*["'][^"']*three(?:\.module|\.webgpu)?\.js["']/i,
      reason: "direct three module file import outside import map",
    },
  ];

  for (const { pattern, reason } of disallowedPatterns) {
    check(!pattern.test(content), `${relativePath} contains stale ${reason}`);
  }
}

function normalizeTextureUrl(textureUrl) {
  if (typeof textureUrl !== "string" || textureUrl.trim() === "") return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(textureUrl) || textureUrl.startsWith("/")) return null;

  const normalized = path.posix.normalize(textureUrl);
  if (normalized.startsWith("../") || normalized === "..") return null;
  return normalized;
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function addTextureRef(refs, owner, textureUrl, textureNote, allowReuseWithoutNote = false) {
  if (typeof textureUrl !== "string" || textureUrl.trim() === "") return;
  refs.push({
    owner,
    textureUrl,
    textureNote,
    allowReuseWithoutNote,
  });
}

async function validateTextures(textureRefs) {
  const bodyTextureGroups = new Map();

  for (const ref of textureRefs) {
    const normalized = normalizeTextureUrl(ref.textureUrl);
    const hasNote = typeof ref.textureNote === "string" && ref.textureNote.trim().length > 0;
    check(normalized, `${ref.owner} textureUrl must be a relative path under textures: ${ref.textureUrl}`);

    if (!normalized) {
      check(hasNote, `${ref.owner} non-local textureUrl must include textureNote`);
      continue;
    }

    const absoluteTexturePath = path.join(texturesDir, normalized);
    const exists = await fileExists(absoluteTexturePath);
    check(exists || hasNote, `${ref.owner} texture '${normalized}' is missing and needs textureNote`);

    if (!ref.allowReuseWithoutNote) {
      const group = bodyTextureGroups.get(normalized) ?? [];
      group.push({ ...ref, normalized, hasNote });
      bodyTextureGroups.set(normalized, group);
    }
  }

  for (const [textureUrl, refs] of bodyTextureGroups) {
    if (refs.length < 2) continue;
    const unannotated = refs.filter((ref) => !ref.hasNote);
    check(
      unannotated.length <= 1,
      `texture '${textureUrl}' is reused by ${refs.map((ref) => ref.owner).join(", ")}; reused placeholders need textureNote`
    );
  }
}

async function main() {
  const html = await readFile(htmlPath, "utf8");
  const domIds = extractDomIds(html);
  for (const id of requiredDomIds) {
    check(domIds.has(id), `index.html is missing required DOM id '${id}'`);
  }

  const importMap = extractImportMap(html);
  check(importMap.imports?.three, "import map must include 'three'");
  check(importMap.imports?.["three/addons/"], "import map must include 'three/addons/'");
  check(
    /import\(["']\.\/learningTools\.js["']\)/.test(html),
    "index.html must initialize Solar-System/learningTools.js"
  );
  check(/aria-controls=["']controlSurface["']/.test(html), "menu toggle must identify its controlled surface");
  check(/Simulation date/.test(html), "metadata must distinguish the live simulation date");
  check(/NASA\/JPL Horizons/.test(html), "model notes must disclose the ephemeris source");

  const workerSource = await readFile(workerPath, "utf8");
  check(
    /import\s*\{\s*getInterpolatedEphemerisPositionAU\s*\}\s*from\s*["']\.\/orbitalRuntime\.js["']/.test(
      workerSource
    ),
    "simulation worker must use the shared ephemeris interpolator"
  );
  check(
    !/function\s+getInterpolatedEphemerisPositionAU\s*\(/.test(workerSource),
    "simulation worker must not duplicate the shared ephemeris interpolator"
  );

  const sourceFiles = await readSolarFiles();
  for (const sourcePath of sourceFiles) {
    validateNoStaleThreeImports(sourcePath, await readFile(sourcePath, "utf8"));
  }

  let planets;
  try {
    planets = JSON.parse(await readFile(dataPath, "utf8"));
  } catch (error) {
    errors.push(`solarsystem_data.json does not parse: ${error.message}`);
    planets = [];
  }

  check(Array.isArray(planets), "solarsystem_data.json must contain a top-level array");

  const bodyNames = new Set();
  const textureRefs = [];

  if (Array.isArray(planets)) {
    for (const [planetIndex, planet] of planets.entries()) {
      const planetName = typeof planet?.name === "string" ? planet.name : `planet[${planetIndex}]`;
      validateFields(planetName, planet, planetFields);

      check(!bodyNames.has(planetName), `duplicate body name '${planetName}'`);
      bodyNames.add(planetName);
      addTextureRef(textureRefs, planetName, planet?.textureUrl, planet?.textureNote);
      addTextureRef(
        textureRefs,
        `${planetName} cloud layer`,
        planet?.cloudTextureUrl,
        planet?.cloudTextureNote,
        true
      );

      if (planet?.rings?.textureUrl) {
        addTextureRef(
          textureRefs,
          `${planetName} rings`,
          planet.rings.textureUrl,
          planet.rings.textureNote,
          true
        );
      }

      for (const [moonIndex, moon] of (planet?.moons ?? []).entries()) {
        const moonName = typeof moon?.name === "string" ? moon.name : `${planetName}.moons[${moonIndex}]`;
        validateFields(moonName, moon, moonFields);

        check(!bodyNames.has(moonName), `duplicate body name '${moonName}'`);
        bodyNames.add(moonName);
        addTextureRef(textureRefs, moonName, moon?.textureUrl, moon?.textureNote);
      }
    }
  }

  if (Array.isArray(planets) && planets.length > 0) {
    const { getEphemerisRangeJD, getInterpolatedEphemerisPositionAU } = await import(
      pathToFileURL(orbitalRuntimePath)
    );
    const earth = planets.find((planet) => planet?.name === "Earth");
    const samples = earth?.ephemeris?.samples ?? [];
    const epochJD = earth?.kepler?.epochJD;
    const range = getEphemerisRangeJD(earth, epochJD);
    check(samples.length >= 2, "Earth ephemeris must contain interpolation samples");
    check(range?.minJD === samples[0]?.jd, "shared ephemeris range must start at the first sample");
    check(range?.maxJD === samples.at(-1)?.jd, "shared ephemeris range must end at the last sample");

    if (samples.length >= 2 && Number.isFinite(epochJD)) {
      const first = samples[0];
      const atFirst = getInterpolatedEphemerisPositionAU(earth, first.jd - epochJD, epochJD);
      const positionError = atFirst
        ? Math.max(
            Math.abs(atFirst.x - first.x),
            Math.abs(atFirst.y - first.y),
            Math.abs(atFirst.z - first.z)
          )
        : Infinity;
      check(positionError < 1e-12, "shared ephemeris interpolation must reproduce exact samples");
      check(
        getInterpolatedEphemerisPositionAU(earth, range.maxJD - epochJD + 1, epochJD) === null,
        "shared ephemeris interpolation must report dates outside its valid range"
      );
    }
  }

  await validateTextures(textureRefs);

  if (errors.length) {
    console.error(`Solar-System smoke failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("Solar-System smoke checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
