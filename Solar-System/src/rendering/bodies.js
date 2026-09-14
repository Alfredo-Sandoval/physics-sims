// --- Celestial Bodies Module ------------------------------------------
import * as THREE from "three";
import { initialMoonPhase } from "../simulation/positions.js";
import * as CONSTANTS from "../core/config.js";
import { createPlanetMaterial, createTextSprite } from "./materials.js";
import { createOrbitLine } from "./orbitLines.js";
import { loadTexture } from "./textures.js";
import { getMoonLocalPosition } from "../simulation/moonPosition.js";
import { eccentricAnomaly, trueAnomaly, radius } from "../simulation/kepler.js";
import { debug as logDebug, warn as logWarn } from "../core/logger.js";

/* ---------------------------------------------------------------------- */
/*                               Sun                                      */
/* ---------------------------------------------------------------------- */
function createSunGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 248, 220, 0.95)");
  gradient.addColorStop(0.22, "rgba(255, 214, 132, 0.78)");
  gradient.addColorStop(0.52, "rgba(255, 154, 64, 0.32)");
  gradient.addColorStop(1, "rgba(255, 120, 0, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSunGlowSprite() {
  const material = new THREE.SpriteMaterial({
    map: createSunGlowTexture(),
    color: 0xffd38a,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(CONSTANTS.SUN_GLOW_SPRITE_SCALE);
  sprite.renderOrder = 1;
  sprite.frustumCulled = false;
  sprite.userData = { isSunGlow: true };
  return sprite;
}

export function createSun(scene, loader) {
  const tex = loadTexture("sun.jpg", loader);
  const geom = new THREE.SphereGeometry(CONSTANTS.SUN_RADIUS, 64, 32);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: CONSTANTS.SUN_EMISSIVE_COLOR,
    emissiveIntensity: CONSTANTS.SUN_EMISSIVE_INTENSITY,
    emissiveMap: tex,
  });
  const sun = new THREE.Mesh(geom, mat);
  if (CONSTANTS.SUN_GLOW_ENABLED) {
    const glowSprite = createSunGlowSprite();
    sun.add(glowSprite);
    sun.userData = { ...(sun.userData || {}), glowSprite };
  }
  sun.userData = {
    ...(sun.userData || {}),
    isSelectable: true,
    name: "Sun",
    type: "star",
    config: {
      name: "Sun",
      actualRadius: CONSTANTS.SUN_RADIUS_KM / CONSTANTS.EARTH_RADIUS_KM,
      info: {
        Mass: "332,900 Earths",
        Composition: "Mostly hydrogen and helium",
        Temperature: "Photosphere ~5,500 C",
        Rotation: "25 days (equator), ~36 days (poles)",
        Diameter: `${(CONSTANTS.SUN_RADIUS_KM * 2).toLocaleString("en-US")} km (mean)`,
        Type: "G2 V",
        Age: "4.6 billion years",
      },
    },
    clickTarget: null,
  };
  sun.userData.clickTarget = sun;
  scene.add(sun);
  return { mesh: sun, config: sun.userData.config };
}

/* ---------------------------------------------------------------------- */
/*                        Planets & moons                                 */
/* ---------------------------------------------------------------------- */
export async function createPlanetsAndOrbits(scene, loader, configs) {
  if (!configs?.length) return { planets: [], celestialBodies: [] };

  const planets = [];
  const allBodies = [];
  const getPlanetSegments = (radius) => {
    if (!Number.isFinite(radius)) return CONSTANTS.PLANET_SEGMENTS;
    const target = Math.round(CONSTANTS.PLANET_SEGMENTS + radius * 1.2);
    return Math.min(
      CONSTANTS.PLANET_SEGMENTS_MAX,
      Math.max(CONSTANTS.PLANET_SEGMENTS, target)
    );
  };
  const getPlanetHeightSegments = (widthSegments) => Math.max(12, Math.floor(widthSegments / 2));

  for (const cfg of configs) {
    const orbitR = cfg.orbitRadiusAU * CONSTANTS.ORBIT_SCALE_FACTOR;
    // Derive a display radius robustly across data variants
    const explicitScaled =
      (Number.isFinite(cfg.scaledRadiusDisplayUnits) ? cfg.scaledRadiusDisplayUnits : undefined) ??
      (Number.isFinite(cfg.scaledRadius) ? cfg.scaledRadius : undefined);
    const actualER = Number.isFinite(cfg.actualRadiusEarthRadii)
      ? cfg.actualRadiusEarthRadii
      : Number.isFinite(cfg.actualRadius)
        ? cfg.actualRadius
        : undefined;
    const computedFromActual = Number.isFinite(actualER)
      ? actualER * CONSTANTS.EARTH_RADIUS_KM * CONSTANTS.PLANET_DISPLAY_SCALE_FACTOR
      : undefined;
    const dispRRaw = explicitScaled ?? computedFromActual ?? CONSTANTS.MIN_PLANET_RADIUS;
    const dispR = Math.max(CONSTANTS.MIN_PLANET_RADIUS, dispRRaw);
    const planetScaleProfile = createPlanetScaleProfile(actualER, dispR);

    /* Planet group (holds mesh and moons) ------------------------------ */
    const group = new THREE.Group();
    group.userData = {
      isSelectable: true,
      name: cfg.name,
      type: "planet",
      config: cfg,
      orbitRadius: orbitR,
      rotationDirection: cfg.rotationDirection,
      initialAngle: cfg.initialAngleRad ?? 0,
      currentAngle: cfg.initialAngleRad ?? 0,
      axialTilt: (cfg.axialTilt ?? 0) * THREE.MathUtils.DEG2RAD,
      displayRadius: planetScaleProfile.enhancedRadius,
      displayRadiusEnhanced: planetScaleProfile.enhancedRadius,
      displayRadiusRelative: planetScaleProfile.relativeRadius,
    };

    /* Planet mesh ------------------------------------------------------ */
    const planetSegments = CONSTANTS.ENABLE_LOD
      ? getPlanetSegments(dispR)
      : CONSTANTS.PLANET_SEGMENTS;
    const planetHeightSegments = getPlanetHeightSegments(planetSegments);
    const geom = new THREE.SphereGeometry(dispR, planetSegments, planetHeightSegments);
    const mat = createPlanetMaterial(cfg.textureUrl, loader);
    if (mat) {
      // Use a restrained environment response so planets keep some specular life.
      mat.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(geom, mat);
    // Only enable shadows for larger planets (performance optimization)
    const shouldHaveShadows = dispR > CONSTANTS.MIN_PLANET_RADIUS * 2;
    mesh.castShadow = shouldHaveShadows;
    mesh.receiveShadow = true; // All planets receive shadows
    // A fixed pole owns the tilt; only the surface rotates within that frame.
    const spinFrame = new THREE.Group();
    spinFrame.rotation.z = group.userData.axialTilt;
    group.add(spinFrame);
    // Set up click target to point to the selectable parent group
    mesh.userData.clickTarget = group;
    applyScaleModeProfile(mesh, planetScaleProfile);
    group.userData.planetMesh = mesh;
    spinFrame.add(mesh);
    mesh.name = cfg.name + "_mesh";

    // Optional sprite name label (disabled by default to avoid duplicates with UI labels)
    if (CONSTANTS.SHOW_SPRITE_LABELS) {
      const label = createTextSprite(cfg.name, { font: "14px Arial" });
      label.position.set(0, dispR * 1.6, 0);
      label.renderOrder = 999;
      label.userData = { ...(label.userData || {}), isLabel: true };
      group.add(label);
    }

    // Debug logging
    logDebug(
      "CelestialBodies",
      `Created planet ${cfg.name}: radius=${dispR}, material=${mat.type}, geometry=${geom.type}`
    );
    if (!mat.map && cfg.textureUrl) {
      logWarn("CelestialBodies", `Texture missing for ${cfg.name}: ${cfg.textureUrl}`);
    }

    /* Earth cloud layer ------------------------------------------------ */
    if (cfg.name === "Earth" && cfg.cloudTextureUrl) {
      const cloudGeom = new THREE.SphereGeometry(
        dispR * CONSTANTS.CLOUD_SCALE_FACTOR,
        planetSegments,
        planetHeightSegments
      );
      const cloudTex = loadTexture(cfg.cloudTextureUrl, loader);
      const cloudMat = new THREE.MeshPhongMaterial({
        map: cloudTex,
        transparent: true,
        opacity: CONSTANTS.CLOUD_OPACITY,
        depthWrite: false,
        shininess: 5,
        specular: 0x111111,
      });
      const clouds = new THREE.Mesh(cloudGeom, cloudMat);
      clouds.raycast = () => {};
      applyScaleModeProfile(clouds, planetScaleProfile);
      mesh.userData.cloudMesh = clouds;
      spinFrame.add(clouds);
    }

    /* Atmosphere shell ------------------------------------------------ */
    const atmosphereShell = createAtmosphereShell(cfg, dispR, planetSegments, planetHeightSegments);
    if (atmosphereShell) {
      applyScaleModeProfile(atmosphereShell, planetScaleProfile);
      mesh.userData.atmosphereMesh = atmosphereShell;
      spinFrame.add(atmosphereShell);
    }

    /* Rings ----------------------------------------------------------- */
    if (planetHasRings(cfg)) {
      await createRings(cfg, dispR, group, loader, planetScaleProfile);
    }

    /* Initial placement ------------------------------------------------ */
    group.position.set(
      orbitR * Math.cos(group.userData.initialAngle),
      0,
      orbitR * Math.sin(group.userData.initialAngle)
    );
    scene.add(group);
    planets.push(group);
    allBodies.push(group);

    /* Orbit line ------------------------------------------------------- */
    // Use the updated createOrbitLine which takes the config object
    createOrbitLine(
      cfg, // Pass the full config
      CONSTANTS.ORBIT_SCALE_FACTOR, // Pass the scale factor explicitly
      CONSTANTS.ORBIT_LINE_COLOR,
      CONSTANTS.ORBIT_SEGMENTS,
      scene
    );

    /* Orbital plane (educational) ------------------------------------- */
    const plane = createOrbitalPlaneBand(
      cfg,
      CONSTANTS.ORBIT_SCALE_FACTOR,
      CONSTANTS.ORBIT_SEGMENTS,
      0.96,
      1.04
    );
    if (plane) {
      scene.add(plane);
    }

    /* Moons ------------------------------------------------------------ */
    if (cfg.moons?.length) {
      const moonData = createMoonSystem(cfg, group, dispR, loader);
      allBodies.push(...moonData.moonBodies);
    }
  }

  return { planets, celestialBodies: allBodies };
}

/* ---------------------------------------------------------------------- */
/*                         Atmosphere shells                              */
/* ---------------------------------------------------------------------- */
function createAtmosphereShell(cfg, planetR, widthSegments, heightSegments) {
  const visual = resolveAtmosphereVisualConfig(cfg);
  if (!visual) return null;

  const atmosphereGeom = new THREE.SphereGeometry(
    planetR * visual.scaleFactor,
    widthSegments,
    heightSegments
  );
  const atmosphereColor = new THREE.Color(visual.colorHex);
  const emissive = atmosphereColor.clone().multiplyScalar(0.5 + visual.normalizedDensity * 0.35);
  const atmosphereMat = new THREE.MeshPhongMaterial({
    color: atmosphereColor,
    emissive,
    emissiveIntensity: visual.emissiveIntensity,
    transparent: true,
    opacity: visual.opacity,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    shininess: 0,
    specular: 0x000000,
    toneMapped: false,
  });

  const atmosphereMesh = new THREE.Mesh(atmosphereGeom, atmosphereMat);
  atmosphereMesh.renderOrder = 2;
  atmosphereMesh.raycast = () => {};
  atmosphereMesh.userData = {
    isAtmosphere: true,
    bodyName: cfg?.name,
    density: visual.density,
  };
  return atmosphereMesh;
}

function resolveAtmosphereVisualConfig(cfg) {
  const atmosphere = cfg?.atmosphere;
  if (!atmosphere?.exists) return null;

  const baseDensityRaw = readFiniteNumber(atmosphere?.densityRelative ?? atmosphere?.density);
  const tweak = CONSTANTS.PLANET_ATMOSPHERE_TWEAKS?.[cfg?.name] ?? null;
  const tweakDensity = Number.isFinite(tweak?.densityMultiplier) ? tweak.densityMultiplier : 1;
  const tweakScale = Number.isFinite(tweak?.scaleMultiplier) ? tweak.scaleMultiplier : 1;
  const tweakOpacity = Number.isFinite(tweak?.opacityMultiplier) ? tweak.opacityMultiplier : 1;
  const baseDensity = Number.isFinite(baseDensityRaw) ? baseDensityRaw : 0.22;
  const density = clampNumber(
    baseDensity * tweakDensity,
    CONSTANTS.ATMOSPHERE_MIN_DENSITY,
    CONSTANTS.ATMOSPHERE_MAX_DENSITY
  );
  const densityRange = CONSTANTS.ATMOSPHERE_MAX_DENSITY - CONSTANTS.ATMOSPHERE_MIN_DENSITY;
  const normalizedDensity = clampNumber(
    densityRange > 0 ? (density - CONSTANTS.ATMOSPHERE_MIN_DENSITY) / densityRange : 0,
    0,
    1
  );
  const scaleOffset =
    THREE.MathUtils.lerp(
      CONSTANTS.ATMOSPHERE_MIN_SCALE_OFFSET,
      CONSTANTS.ATMOSPHERE_MAX_SCALE_OFFSET,
      normalizedDensity
    ) * tweakScale;
  const opacity = clampNumber(
    (0.05 + normalizedDensity * 0.27) * tweakOpacity,
    CONSTANTS.ATMOSPHERE_MIN_OPACITY,
    CONSTANTS.ATMOSPHERE_MAX_OPACITY
  );

  return {
    colorHex: parseColorValue(atmosphere?.colorHex ?? atmosphere?.color, 0x8ea9ff),
    density,
    normalizedDensity,
    opacity,
    scaleFactor: 1 + scaleOffset,
    emissiveIntensity: THREE.MathUtils.lerp(
      CONSTANTS.ATMOSPHERE_BASE_EMISSIVE_INTENSITY,
      CONSTANTS.ATMOSPHERE_MAX_EMISSIVE_INTENSITY,
      normalizedDensity
    ),
  };
}

/* ---------------------------------------------------------------------- */
/*                            Rings                                       */
/* ---------------------------------------------------------------------- */
function planetHasRings(cfg) {
  if (!cfg || cfg?.rings?.exists === false) return false;
  if (cfg?.rings && typeof cfg.rings === "object") return true;
  if (CONSTANTS.PLANET_RING_PRESETS?.[cfg.name]) return true;
  const ringCount = readFiniteNumber(cfg?.info?.ringCount);
  return Number.isFinite(ringCount) && ringCount > 0;
}

async function createRings(cfg, planetR, group, loader, scaleProfile = null) {
  const visual = resolveRingVisualConfig(cfg);
  if (!visual) return;

  let texture = null;
  if (visual.textureUrl) {
    texture = loadTexture(visual.textureUrl, loader);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }

  const innerRadius = planetR * visual.innerRadiusFactor;
  const outerRadius = planetR * visual.outerRadiusFactor;
  const geom = createRingGeometry(innerRadius, outerRadius, visual.thetaSegments, visual.phiSegments);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    color: texture ? 0xffffff : visual.color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: visual.opacity,
    depthWrite: false,
    toneMapped: false,
  });
  mat.alphaTest = visual.alphaTest;

  const ring = new THREE.Mesh(geom, mat);
  ring.rotation.order = "ZXY";
  ring.rotation.x = -Math.PI / 2;
  ring.rotation.z = visual.tiltRad;
  ring.raycast = () => {};
  ring.userData = { isRing: true, bodyName: cfg?.name };
  applyScaleModeProfile(ring, scaleProfile);
  group.add(ring);
  logDebug("CelestialBodies", `Ring added for ${cfg?.name}`, visual);
}

function resolveRingVisualConfig(cfg) {
  const preset = CONSTANTS.PLANET_RING_PRESETS?.[cfg?.name] ?? null;
  const ringConfig = cfg?.rings && typeof cfg.rings === "object" ? cfg.rings : {};
  if (!preset && Object.keys(ringConfig).length === 0) return null;

  const innerRaw = readFiniteNumber(
    ringConfig.innerRadiusFactor ?? ringConfig.innerFactor ?? preset?.innerRadiusFactor
  );
  const outerRaw = readFiniteNumber(
    ringConfig.outerRadiusFactor ?? ringConfig.outerFactor ?? preset?.outerRadiusFactor
  );
  const innerRadiusFactor = Math.max(
    CONSTANTS.RING_MIN_INNER_RADIUS_FACTOR,
    Number.isFinite(innerRaw) ? innerRaw : CONSTANTS.SATURN_RING_INNER_RADIUS_FACTOR
  );
  const outerRadiusFactor = Math.max(
    innerRadiusFactor + CONSTANTS.RING_MIN_WIDTH_FACTOR,
    Number.isFinite(outerRaw) ? outerRaw : CONSTANTS.SATURN_RING_OUTER_RADIUS_FACTOR
  );
  const opacityRaw = readFiniteNumber(ringConfig.opacity ?? preset?.opacity ?? CONSTANTS.SATURN_RING_OPACITY);
  const tiltDeg = readFiniteNumber(
    ringConfig.tiltDeg ?? ringConfig.ringTiltDeg ?? cfg?.ringTilt ?? preset?.tiltDeg ?? cfg?.axialTilt
  );
  const thetaRaw = readFiniteNumber(ringConfig.thetaSegments ?? preset?.thetaSegments);
  const phiRaw = readFiniteNumber(ringConfig.phiSegments ?? preset?.phiSegments);
  const alphaRaw = readFiniteNumber(ringConfig.alphaTest ?? preset?.alphaTest);

  return {
    innerRadiusFactor,
    outerRadiusFactor,
    opacity: clampNumber(
      Number.isFinite(opacityRaw) ? opacityRaw : CONSTANTS.SATURN_RING_OPACITY,
      CONSTANTS.RING_MIN_OPACITY,
      CONSTANTS.RING_MAX_OPACITY
    ),
    color: parseColorValue(ringConfig.colorHex ?? ringConfig.color ?? preset?.color, CONSTANTS.RING_DEFAULT_COLOR),
    textureUrl:
      typeof ringConfig.textureUrl === "string"
        ? ringConfig.textureUrl
        : typeof preset?.textureUrl === "string"
          ? preset.textureUrl
          : null,
    tiltRad: (Number.isFinite(tiltDeg) ? tiltDeg : 0) * THREE.MathUtils.DEG2RAD,
    thetaSegments: Math.max(48, Math.floor(Number.isFinite(thetaRaw) ? thetaRaw : 96)),
    phiSegments: Math.max(2, Math.floor(Number.isFinite(phiRaw) ? phiRaw : 4)),
    alphaTest: clampNumber(Number.isFinite(alphaRaw) ? alphaRaw : 0.02, 0, 0.2),
  };
}

function createRingGeometry(innerRadius, outerRadius, thetaSegments, phiSegments) {
  const geom = new THREE.RingGeometry(innerRadius, outerRadius, thetaSegments, phiSegments);
  const positions = geom.attributes.position;
  const uv = geom.attributes.uv;
  const radialWidth = Math.max(outerRadius - innerRadius, 1e-6);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const radiusAtVertex = Math.sqrt(x * x + y * y);
    const radialT = (radiusAtVertex - innerRadius) / radialWidth;
    uv.setXY(i, radialT, 0.5);
  }

  uv.needsUpdate = true;
  return geom;
}

function parseColorValue(value, fallbackHex) {
  if (Number.isFinite(value)) return Number(value);
  if (typeof value !== "string") return fallbackHex;

  const normalized = value.trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(normalized)) {
    return Number.parseInt(normalized.replace("#", ""), 16);
  }
  if (/^0x[0-9a-f]{6}$/.test(normalized)) {
    return Number.parseInt(normalized.slice(2), 16);
  }
  return fallbackHex;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function createScaleProfile(enhancedRadius, relativeRadius) {
  const enhanced = Number.isFinite(enhancedRadius) && enhancedRadius > 0 ? enhancedRadius : 1;
  const relative = Number.isFinite(relativeRadius) && relativeRadius > 0 ? relativeRadius : enhanced;
  return {
    enhanced: 1,
    relative: relative / enhanced,
    enhancedRadius: enhanced,
    relativeRadius: relative,
  };
}

function createPlanetScaleProfile(actualRadiusEarthRadii, enhancedRadius) {
  const actual = Number.isFinite(actualRadiusEarthRadii) ? actualRadiusEarthRadii : null;
  const relativeRadius = Number.isFinite(actual)
    ? actual * CONSTANTS.RELATIVE_SCALE_EARTH_RADIUS
    : enhancedRadius;
  return createScaleProfile(enhancedRadius, relativeRadius);
}

function createMoonScaleProfile(actualRadiusEarthRadii, enhancedRadius) {
  const actual = Number.isFinite(actualRadiusEarthRadii) ? actualRadiusEarthRadii : null;
  const relativeRadius = Number.isFinite(actual)
    ? actual * CONSTANTS.RELATIVE_SCALE_EARTH_RADIUS
    : enhancedRadius;
  return createScaleProfile(enhancedRadius, relativeRadius);
}

function applyScaleModeProfile(object, profile) {
  if (!object || !profile) return;
  object.userData = {
    ...(object.userData || {}),
    scaleModeProfile: {
      enhanced: profile.enhanced,
      relative: profile.relative,
      enhancedRadius: profile.enhancedRadius,
      relativeRadius: profile.relativeRadius,
    },
  };
}

/* ---------------------------------------------------------------------- */
/*                              Moons                                     */
/* ---------------------------------------------------------------------- */
function readFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveRadiusEarthRadii(body) {
  const fromEarthRadii = readFiniteNumber(body?.actualRadiusEarthRadii);
  if (Number.isFinite(fromEarthRadii)) return fromEarthRadii;
  const fromLegacy = readFiniteNumber(body?.actualRadius);
  if (Number.isFinite(fromLegacy)) return fromLegacy;
  return null;
}

function createMoonSystem(planetCfg, planetGroup, planetRadius, loader) {
  const moonGroup = new THREE.Group();
  moonGroup.userData.parentPlanetName = planetCfg.name;
  const moonBodies = [];
  const planetAxialTiltRad = planetGroup?.userData?.axialTilt ?? 0;
  const baseOrbitRadius =
    Number.isFinite(planetRadius) && planetRadius > 0
      ? planetRadius * 1.5
      : CONSTANTS.MIN_MOON_RADIUS * 5;

  planetCfg.moons.forEach((m) => {
    // Size moons proportionally to their actual size and parent planet
    const radiusEarthRadii = resolveRadiusEarthRadii(m);
    const moonActualRadius = Number.isFinite(radiusEarthRadii) ? radiusEarthRadii : 0.1;
    const baseMoonSize = moonActualRadius * CONSTANTS.MOON_DISPLAY_SCALE_FACTOR;
    // Scale relative to parent planet size for better visual balance
    const planetScale =
      Number.isFinite(planetRadius) && planetRadius > 0 ? Math.min(1.0, planetRadius / 10) : 1.0;
    const moonSizeRaw = baseMoonSize * planetScale;
    const moonR = Math.max(
      CONSTANTS.MIN_MOON_RADIUS,
      Math.min(Number.isFinite(moonSizeRaw) ? moonSizeRaw : CONSTANTS.MIN_MOON_RADIUS, CONSTANTS.MAX_MOON_RADIUS)
    );

    // Calculate orbit radius relative to planet center
    const orbitRadiusKm = readFiniteNumber(m.orbitRadiusKm);
    const scaledOrbitOffset = Number.isFinite(orbitRadiusKm)
      ? (orbitRadiusKm / 1e5) * CONSTANTS.MOON_ORBIT_SCALE_FACTOR
      : 0;
    const orbitR = baseOrbitRadius + (Number.isFinite(scaledOrbitOffset) ? scaledOrbitOffset : 0);

    const moonSegments = CONSTANTS.ENABLE_LOD
      ? CONSTANTS.MOON_SEGMENTS
      : Math.max(6, Math.floor(CONSTANTS.MOON_SEGMENTS * 0.7));
    const geom = new THREE.SphereGeometry(moonR, moonSegments, Math.max(4, Math.floor(moonSegments / 2)));

    // Load texture with proper error handling and path correction
    let tex = null;
    if (m.textureUrl) {
      // Check if texture is in Moon_JPG_Collection subdirectory
      const texturePath = m.textureUrl.includes("/")
        ? m.textureUrl
        : `Moon_JPG_Collection/${m.textureUrl}`;
      tex = loadTexture(texturePath, loader);
    }

    const mat = new THREE.MeshPhongMaterial({
      map: tex,
      color: tex ? 0xffffff : 0xcccccc, // Light grey if no texture
      shininess: 0,
      specular: 0x000000,
    });

    // If texture exists, use it as emissive map with low intensity for 10% brightness boost
    if (tex) {
      mat.emissiveMap = tex;
      mat.emissive = new THREE.Color(0xffffff);
      mat.emissiveIntensity = 0.08; // Subtle boost that preserves texture details
    }
    mat.needsUpdate = true;
    const moon = new THREE.Mesh(geom, mat);

    // Moons don't cast shadows but can receive them
    moon.castShadow = false;
    moon.receiveShadow = true;

    /* Orbit parameters ------------------------------------------------ */
    const orbitEccRaw = Number(m.orbitEccentricity ?? m.orbitalEccentricity ?? 0);
    const orbitEccentricity = Math.max(0, Math.min(0.99, Number.isFinite(orbitEccRaw) ? orbitEccRaw : 0));
    const orbitInclinationDeg = Number.isFinite(m.orbitalInclinationDeg)
      ? m.orbitalInclinationDeg
      : Number.isFinite(m.inclinationDeg)
        ? m.inclinationDeg
        : 0;
    const orbitAscNodeDeg = Number.isFinite(m.longAscNodeDeg)
      ? m.longAscNodeDeg
      : Number.isFinite(m.ascendingNodeDeg)
        ? m.ascendingNodeDeg
        : 0;
    const orbitArgPeriDeg = Number.isFinite(m.argPeriapsisDeg)
      ? m.argPeriapsisDeg
      : Number.isFinite(m.argumentOfPeriapsisDeg)
        ? m.argumentOfPeriapsisDeg
        : 0;
    const orbitReference = m.orbitReference === "ecliptic" ? "ecliptic" : "equatorial";
    const orbitSpec = {
      orbitSemiMajor: orbitR,
      orbitRadius: orbitR,
      orbitEccentricity,
      orbitInclinationRad: orbitInclinationDeg * THREE.MathUtils.DEG2RAD,
      orbitAscendingNodeRad: orbitAscNodeDeg * THREE.MathUtils.DEG2RAD,
      orbitArgPeriapsisRad: orbitArgPeriDeg * THREE.MathUtils.DEG2RAD,
      orbitReference,
    };

    /* Position & userdata --------------------------------------------- */
    const M0 = initialMoonPhase(m);
    moon.position.copy(getMoonLocalPosition(M0, orbitSpec, planetAxialTiltRad));
    const orbitalPeriodRaw = readFiniteNumber(m.orbitalPeriod ?? m.orbitalPeriodDays);
    const rotationPeriodRaw = readFiniteNumber(m.rotationPeriod ?? m.rotationPeriodDays);
    const orbitalPeriod = Number.isFinite(orbitalPeriodRaw) ? orbitalPeriodRaw : 0;
    const rotationPeriod = Number.isFinite(rotationPeriodRaw) ? rotationPeriodRaw : 0;
    const orbitDirection = readFiniteNumber(m.orbitDirection) ?? 1;
    const rotationDirection = readFiniteNumber(m.rotationDirection) ?? 1;
    const radiusKm = Number.isFinite(radiusEarthRadii) ? radiusEarthRadii * CONSTANTS.EARTH_RADIUS_KM : null;
    const moonScaleProfile = createMoonScaleProfile(radiusEarthRadii, moonR);
    const isTidallyLocked =
      Number.isFinite(rotationPeriodRaw) &&
      Number.isFinite(orbitalPeriodRaw) &&
      Math.abs(Math.abs(rotationPeriod) - Math.abs(orbitalPeriod)) < 1e-6;

    moon.userData = {
      isSelectable: true,
      name: m.name,
      type: "moon",
      parentPlanetName: planetCfg.name,
      config: m,
      orbitRadius: orbitR,
      orbitDirection: m.orbitDirection,
      rotationDirection: m.rotationDirection,
      orbitSemiMajor: orbitSpec.orbitSemiMajor,
      orbitEccentricity: orbitSpec.orbitEccentricity,
      orbitInclinationRad: orbitSpec.orbitInclinationRad,
      orbitAscendingNodeRad: orbitSpec.orbitAscendingNodeRad,
      orbitArgPeriapsisRad: orbitSpec.orbitArgPeriapsisRad,
      orbitReference: orbitSpec.orbitReference,
      initialAngle: M0,
      currentAngle: M0,
      initialMeanAnomaly: M0,
      currentMeanAnomaly: M0,
      displayRadius: moonScaleProfile.enhancedRadius,
      displayRadiusEnhanced: moonScaleProfile.enhancedRadius,
      displayRadiusRelative: moonScaleProfile.relativeRadius,
      displayInfo: {
        Size: Number.isFinite(radiusKm) ? `${radiusKm.toFixed(0)} km radius` : "—",
        Orbit: Number.isFinite(orbitRadiusKm)
          ? `${orbitRadiusKm.toLocaleString()} km from ${planetCfg.name}`
          : `Orbiting ${planetCfg.name}`,
        OrbitalPeriod:
          Math.abs(orbitalPeriod).toFixed(2) +
          " days" +
          (orbitDirection < 0 ? " (retrograde)" : ""),
        RotationPeriod:
          Math.abs(rotationPeriod).toFixed(2) +
          " days" +
          (rotationDirection < 0 ? " (retrograde)" : "") +
          (isTidallyLocked ? " (tidally locked)" : ""),
        ParentPlanet: planetCfg.name,
        ...(m.info || {}),
      },
      clickTarget: moon,
    };
    applyScaleModeProfile(moon, moonScaleProfile);
    moon.name = m.name;

    moonBodies.push(moon);

    /* Moon orbit line -------------------------------------------------- */
    const moonOrbitPoints = [];
    for (let k = 0; k < CONSTANTS.MOON_ORBIT_SEGMENTS; k++) {
      const Mk = (k / CONSTANTS.MOON_ORBIT_SEGMENTS) * 2 * Math.PI;
      moonOrbitPoints.push(getMoonLocalPosition(Mk, orbitSpec, planetAxialTiltRad));
    }
    const moonOrbitGeom = new THREE.BufferGeometry().setFromPoints(moonOrbitPoints);
    // Moon paths are contextual guides, shown when their planet is selected.
    const moonOrbitMat = new THREE.LineBasicMaterial({
      color: CONSTANTS.ORBIT_LINE_COLOR, // Match planet orbit styling
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      toneMapped: false,
    });
    const moonOrbitLine = new THREE.LineLoop(moonOrbitGeom, moonOrbitMat);
    moonOrbitLine.visible = false;
    moonOrbitLine.renderOrder = 1; // Draw above the planet mesh for clarity
    moonOrbitLine.userData = {
      isOrbitLine: true,
      isMoonOrbit: true,
      parentPlanetName: planetCfg.name,
    };
    moonGroup.add(moonOrbitLine);

    moonGroup.add(moon);
  });

  planetGroup.add(moonGroup);
  return { moonSystemGroup: moonGroup, moonBodies };
}

/* ---------------------------------------------------------------------- */
/*                         Orbital plane helper                           */
/* ---------------------------------------------------------------------- */
function createOrbitalPlaneBand(cfg, scaleFactor, segments, innerScale = 0.96, outerScale = 1.04) {
  const semiMajor = readFiniteNumber(cfg?.orbitRadiusAU);
  const segmentCount = Number.isFinite(segments) ? Math.floor(segments) : 0;
  const scale = readFiniteNumber(scaleFactor);
  if (!Number.isFinite(semiMajor) || semiMajor <= 0 || segmentCount < 3 || !Number.isFinite(scale)) {
    return null;
  }

  const eccentricityRaw = readFiniteNumber(cfg?.info?.orbitalEccentricity);
  const eccentricity = Math.max(0, Math.min(0.99, Number.isFinite(eccentricityRaw) ? eccentricityRaw : 0));
  const inclinationDeg = readFiniteNumber(cfg?.kepler?.inclinationDeg ?? cfg?.info?.orbitalInclinationDeg);
  const ascNodeDeg = readFiniteNumber(cfg?.kepler?.longAscNodeDeg);
  const argPeriDeg = readFiniteNumber(cfg?.kepler?.argPeriapsisDeg);
  const inclination = (Number.isFinite(inclinationDeg) ? inclinationDeg : 0) * THREE.MathUtils.DEG2RAD;
  const ascNode = (Number.isFinite(ascNodeDeg) ? ascNodeDeg : 0) * THREE.MathUtils.DEG2RAD;
  const argPeri = (Number.isFinite(argPeriDeg) ? argPeriDeg : 0) * THREE.MathUtils.DEG2RAD;
  const innerBandScale = Number.isFinite(innerScale) ? innerScale : 0.96;
  const outerBandScale = Number.isFinite(outerScale) ? outerScale : 1.04;

  const vertexCount = (segmentCount + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(segmentCount * 6);

  const cosΩ = Math.cos(ascNode);
  const sinΩ = Math.sin(ascNode);
  const cosi = Math.cos(inclination);
  const sini = Math.sin(inclination);

  const tmp = new THREE.Vector3();
  let posIndex = 0;

  for (let k = 0; k <= segmentCount; k++) {
    const M = (k / segmentCount) * Math.PI * 2;
    const E = eccentricAnomaly(M, eccentricity);
    const nu = trueAnomaly(E, eccentricity);
    const r = radius(semiMajor, eccentricity, nu);
    if (!Number.isFinite(E) || !Number.isFinite(nu) || !Number.isFinite(r)) {
      return null;
    }

    // Position in orbital plane (argument of latitude u = ν + ω)
    const u = nu + argPeri;
    const cosu = Math.cos(u);
    const sinu = Math.sin(u);

    // Convert to J2000 ecliptic coordinates, then map to scene (Y = ecliptic north)
    const x_ecl = r * (cosΩ * cosu - sinΩ * sinu * cosi);
    const y_ecl = r * (sinΩ * cosu + cosΩ * sinu * cosi);
    const z_ecl = r * (sinu * sini);
    if (!Number.isFinite(x_ecl) || !Number.isFinite(y_ecl) || !Number.isFinite(z_ecl)) {
      return null;
    }

    tmp.set(x_ecl, z_ecl, y_ecl).multiplyScalar(scale);

    const inner = tmp.clone().multiplyScalar(innerBandScale);
    const outer = tmp.clone().multiplyScalar(outerBandScale);
    if (
      !Number.isFinite(inner.x) ||
      !Number.isFinite(inner.y) ||
      !Number.isFinite(inner.z) ||
      !Number.isFinite(outer.x) ||
      !Number.isFinite(outer.y) ||
      !Number.isFinite(outer.z)
    ) {
      return null;
    }

    positions[posIndex++] = inner.x;
    positions[posIndex++] = inner.y;
    positions[posIndex++] = inner.z;
    positions[posIndex++] = outer.x;
    positions[posIndex++] = outer.y;
    positions[posIndex++] = outer.z;
  }

  let idx = 0;
  for (let k = 0; k < segmentCount; k++) {
    const i0 = k * 2;
    const i1 = i0 + 1;
    const i2 = i0 + 2;
    const i3 = i0 + 3;
    indices[idx++] = i0;
    indices[idx++] = i2;
    indices[idx++] = i1;
    indices[idx++] = i2;
    indices[idx++] = i3;
    indices[idx++] = i1;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    color: 0x4aa3ff,
    transparent: true,
    opacity: 0.045,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData = { isOrbitalPlane: true, bodyName: cfg.name };
  return mesh;
}

/* ---------------------------------------------------------------------- */
/*                      Memory Management / Cleanup                       */
/* ---------------------------------------------------------------------- */

/**
 * Dispose of a Three.js object and its children recursively
 * @param {THREE.Object3D} object - The object to dispose
 */
export function disposeObject(object) {
  if (!object) return;

  // Recursively dispose children first
  if (object.children && object.children.length > 0) {
    for (let i = object.children.length - 1; i >= 0; i--) {
      disposeObject(object.children[i]);
    }
  }

  // Dispose geometry
  if (object.geometry) {
    object.geometry.dispose();
  }

  // Dispose material(s)
  if (object.material) {
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        disposeMaterial(material);
      });
    } else {
      disposeMaterial(object.material);
    }
  }

  // Remove from parent if it has one
  if (object.parent) {
    object.parent.remove(object);
  }
}

/**
 * Dispose of a Three.js material and its textures
 * @param {THREE.Material} material - The material to dispose
 */
function disposeMaterial(material) {
  if (!material) return;

  // Dispose all texture properties
  Object.keys(material).forEach((key) => {
    const value = material[key];
    if (value && typeof value.dispose === "function") {
      value.dispose();
    }
  });

  // Dispose the material itself
  material.dispose();
}

/**
 * Clean up celestial bodies to prevent memory leaks
 * @param {Array} celestialBodies - Array of celestial body objects
 */
export function cleanupCelestialBodies(celestialBodies) {
  if (!celestialBodies || !Array.isArray(celestialBodies)) return;

  celestialBodies.forEach((body) => {
    disposeObject(body);
  });

  celestialBodies.length = 0; // Clear the array
}
