// --- Constants and Configuration ---
import * as THREE from "three";

/* Debugging ------------------------------------------------------------- */
export const DEBUG = false; // Set true to enable extra console output

/* Zoom behaviour -------------------------------------------------------- */
export const ZOOM = {
  DEFAULT_MIN_DISTANCE: 10,
  MIN_DISTANCE_BASE: 20,
  NEAR_SUN_FACTOR: 1.5,
  SELECTION_FACTOR: 1.2,
  MIN_SELECTION_DISTANCE: 0.0001,
  OUTWARD_EPSILON: 0.5,
  LERP_FACTOR: 0.3,
  IDLE_DELAY_MS: 800,
};

/* Camera helpers ------------------------------------------------------- */
export const ORIGIN_VECTOR = new THREE.Vector3(0, 0, 0);
export const DEFAULT_CAMERA_DISTANCE = 150; // when nothing selected
export const PLANET_CAMERA_DISTANCE_MULTIPLIER = 8; // ≈ radius × 8
export const MOON_CAMERA_DISTANCE_MULTIPLIER = 4; // ≈ radius × 4
export const CAMERA_FOLLOW_LERP_FACTOR = 10; // higher = snappier

/* Basic sizes ---------------------------------------------------------- */
export const SUN_RADIUS = 25; // render‑unit radius of Sun
export const SUN_RADIUS_KM = 695700; // Matches the mean diameter in the Sun's data card
export const EARTH_RADIUS_KM = 6378.1366; // JPL equatorial radius (km) for info display

/* Colours -------------------------------------------------------------- */
export const ORBIT_LINE_COLOR = 0x5d6f91; // Brighter slate-blue for clearer orbit readability
export const SELECTED_HIGHLIGHT_COLOR = 0x00ffff;
export const SUN_EMISSIVE_COLOR = 0xffddaa;

/* Selection/Outline ---------------------------------------------------- */
export const OUTLINE_SCALE = 1.12; // Keep selection outline outside atmosphere shells
export const SELECTION_OUTLINE_OPACITY = 0.35; // Keep selection visible without overpowering atmosphere

/* Scale factors -------------------------------------------------------- */
export const ORBIT_SCALE_FACTOR = 100; // AU → scene units (balanced for visibility)
export const MOON_ORBIT_SCALE_FACTOR = 0.5; // km → scene units (scaled for visual separation)
export const PLANET_DISPLAY_SCALE_FACTOR = 2; // Fallback scaling for planets without scaledRadius
export const MOON_DISPLAY_SCALE_FACTOR = 1.5; // Moon scaling relative to planet size
export const MIN_PLANET_RADIUS = 1.0; // Minimum visual size for planets
export const MIN_MOON_RADIUS = 0.15; // Minimum visual size for moons
export const MAX_MOON_RADIUS = 2; // Maximum visual size for moons
// One common body-size scale, anchored to the Sun. Orbital spacing is separate.
export const RELATIVE_SCALE_EARTH_RADIUS = SUN_RADIUS * EARTH_RADIUS_KM / SUN_RADIUS_KM;

export const CLOUD_SCALE_FACTOR = 1.02;
export const CLOUD_OPACITY = 0.7;
export const CLOUD_ROTATION_SPEED_MULTIPLIER = 1.1;
// Slow illustrative surface rotation relative to orbital time: Earth takes ~20 s at 1×.
export const PLANET_SPIN_SLOWDOWN = 120;
export const MAX_PLANET_SPIN_SECONDS_AT_1X = 60;

/* Planetary rings (visual only) --------------------------------------- */
export const SATURN_RING_INNER_RADIUS_FACTOR = 1.15;
export const SATURN_RING_OUTER_RADIUS_FACTOR = 2.2;
export const SATURN_RING_OPACITY = 1.0; // Make fully opaque for visibility
export const RING_MIN_INNER_RADIUS_FACTOR = 1.02;
export const RING_MIN_WIDTH_FACTOR = 0.03;
export const RING_MIN_OPACITY = 0.08;
export const RING_MAX_OPACITY = 1.0;
export const RING_DEFAULT_COLOR = 0xe9e1d2;
export const PLANET_RING_PRESETS = Object.freeze({
  Saturn: Object.freeze({
    innerRadiusFactor: SATURN_RING_INNER_RADIUS_FACTOR,
    outerRadiusFactor: SATURN_RING_OUTER_RADIUS_FACTOR,
    opacity: SATURN_RING_OPACITY,
    textureUrl: "saturn_ring.png",
    tiltDeg: 26.7,
    color: 0xffffff,
    alphaTest: 0.05,
    thetaSegments: 128,
    phiSegments: 8,
  }),
  Jupiter: Object.freeze({
    innerRadiusFactor: 1.72,
    outerRadiusFactor: 1.87,
    opacity: 0.2,
    color: 0xd9ccbc,
    alphaTest: 0.02,
    thetaSegments: 96,
    phiSegments: 4,
  }),
  Uranus: Object.freeze({
    innerRadiusFactor: 1.66,
    outerRadiusFactor: 1.9,
    opacity: 0.28,
    color: 0xcde7df,
    alphaTest: 0.02,
    thetaSegments: 96,
    phiSegments: 5,
  }),
  Neptune: Object.freeze({
    innerRadiusFactor: 1.75,
    outerRadiusFactor: 2.03,
    opacity: 0.2,
    color: 0x8fa7e0,
    alphaTest: 0.02,
    thetaSegments: 96,
    phiSegments: 4,
  }),
});

/* Atmosphere shells ---------------------------------------------------- */
export const ATMOSPHERE_MIN_DENSITY = 0.02;
export const ATMOSPHERE_MAX_DENSITY = 1.2;
export const ATMOSPHERE_MIN_SCALE_OFFSET = 0.01;
export const ATMOSPHERE_MAX_SCALE_OFFSET = 0.09;
export const ATMOSPHERE_MIN_OPACITY = 0.04;
export const ATMOSPHERE_MAX_OPACITY = 0.45;
export const ATMOSPHERE_BASE_EMISSIVE_INTENSITY = 0.18;
export const ATMOSPHERE_MAX_EMISSIVE_INTENSITY = 0.72;
export const PLANET_ATMOSPHERE_TWEAKS = Object.freeze({
  Venus: Object.freeze({ densityMultiplier: 1.2, scaleMultiplier: 1.2, opacityMultiplier: 1.25 }),
  Earth: Object.freeze({ densityMultiplier: 1.0, scaleMultiplier: 1.0, opacityMultiplier: 1.0 }),
  Mars: Object.freeze({ densityMultiplier: 0.85, scaleMultiplier: 0.9, opacityMultiplier: 0.85 }),
  Jupiter: Object.freeze({ densityMultiplier: 1.1, scaleMultiplier: 1.05, opacityMultiplier: 1.1 }),
  Saturn: Object.freeze({ densityMultiplier: 1.08, scaleMultiplier: 1.1, opacityMultiplier: 1.08 }),
  Uranus: Object.freeze({ densityMultiplier: 1.05, scaleMultiplier: 1.02, opacityMultiplier: 1.0 }),
  Neptune: Object.freeze({ densityMultiplier: 1.08, scaleMultiplier: 1.04, opacityMultiplier: 1.05 }),
});

/* Material properties -------------------------------------------------- */
export const PLANET_ROUGHNESS = 0.82;
export const PLANET_METALNESS = 0.03;
export const MOON_ROUGHNESS = 0.95;
export const MOON_METALNESS = 0.02;
export const ASTEROID_ROUGHNESS_BROWN = 0.95;
export const ASTEROID_ROUGHNESS_GRAY = 0.9;
export const ASTEROID_ROUGHNESS_DARK = 0.98;
export const ASTEROID_METALNESS_BROWN = 0.02;
export const ASTEROID_METALNESS_GRAY = 0.05;
export const ASTEROID_METALNESS_DARK = 0.01;

/* Asteroid colors ------------------------------------------------------ */
export const ASTEROID_COLOR_BROWN = 0x8b7355;
export const ASTEROID_COLOR_GRAY = 0x696969;
export const ASTEROID_COLOR_DARK_BROWN = 0x654321;

/* Asteroid Belt -------------------------------------------------------- */
export const ASTEROID_BELT_ENABLED = true;
export const ASTEROID_COUNT = 200; // Restored with optimizations
export const ASTEROID_BELT_INNER_RADIUS_AU = 2.2;
export const ASTEROID_BELT_OUTER_RADIUS_AU = 3.2;
export const ASTEROID_BELT_THICKNESS_AU = 0.15; // Reduced vertical spread
export const ASTEROID_MIN_SIZE = 0.1; // Much larger minimum for visibility
export const ASTEROID_MAX_SIZE = 0.4; // Much larger maximum for visibility
export const ASTEROID_COLOR = 0x998877; // More brownish rock color

/* Kuiper Belt ---------------------------------------------------------- */
export const KUIPER_BELT_ENABLED = true;
export const KUIPER_COUNT = 150; // Restored with optimizations
export const KUIPER_BELT_INNER_RADIUS_AU = 30; // Just beyond Neptune
export const KUIPER_BELT_OUTER_RADIUS_AU = 50; // Classical Kuiper Belt
export const KUIPER_BELT_THICKNESS_AU = 2.0; // More spread out
export const KUIPER_MIN_SIZE = 0.08; // Smaller, more distant
export const KUIPER_MAX_SIZE = 0.3; // Smaller, more distant
export const KUIPER_COLOR_ICE = 0xe6f3ff; // Blue-white icy appearance
export const KUIPER_COLOR_ROCK = 0xcccccc; // Gray rocky appearance
export const KUIPER_VISUAL_SCALE = 12; // Artificial scale-up so distant objects stay visible

/* Jupiter Trojans ------------------------------------------------------- */
export const JUPITER_TROJANS_ENABLED = true;
export const JUPITER_TROJANS_COUNT = 150; // Restored with optimizations
export const JUPITER_L4_OFFSET_DEG = 60; // L4 point (ahead of Jupiter)
export const JUPITER_L5_OFFSET_DEG = -60; // L5 point (behind Jupiter)
export const JUPITER_TROJAN_SPREAD_DEG = 10; // Spread around Lagrange points
export const JUPITER_TROJAN_INCLINATION_MAX_DEG = 15; // Maximum inclination
export const JUPITER_TROJAN_SIZE_MIN = 0.05;
export const JUPITER_TROJAN_SIZE_MAX = 0.2;
export const JUPITER_TROJAN_COLOR = 0x8b7355; // Brownish like C-type asteroids

/* Geometry detail ------------------------------------------------------ */
export const PLANET_SEGMENTS = 24; // Base segments for adaptive planet detail
export const PLANET_SEGMENTS_MAX = 64; // Upper bound for large planets
export const MOON_SEGMENTS = 18; // Smoother moon silhouettes without a large perf cost
export const ORBIT_SEGMENTS = 48; // Balanced for quality and performance
export const MOON_ORBIT_SEGMENTS = 24; // Balanced for quality and performance

/* Performance optimizations -------------------------------------------- */
export const ENABLE_LOD = true; // Level of Detail system
export const ENABLE_FRUSTUM_CULLING = true; // Only render visible objects
export const MAX_TEXTURE_SIZE = 1024; // Preserve more detail when zooming in

/* Star‑field ----------------------------------------------------------- */
export const STARFIELD_RADIUS = 5000;
export const STAR_COUNT = 1200;
export const STAR_BASE_SIZE = 1.6;
export const STARFIELD_SKY_COLOR = 0x252a33;
export const STAR_MIN_SIZE_FACTOR = 0.5;
export const STAR_MAX_SIZE_FACTOR = 1.5;
export const STARFIELD_TINT_COLOR = 0xbfd3ff;
export const STARFIELD_TINT_STRENGTH = 0.2;
export const STARFIELD_LAYER_CONFIGS = Object.freeze([
  Object.freeze({
    share: 0.62,
    minRadiusFactor: 0.9,
    maxRadiusFactor: 1.0,
    sizeFactor: 0.75,
    opacity: 0.16,
    saturation: 0.2,
    lightnessMin: 0.58,
    lightnessMax: 0.88,
  }),
  Object.freeze({
    share: 0.28,
    minRadiusFactor: 0.75,
    maxRadiusFactor: 0.9,
    sizeFactor: 1.1,
    opacity: 0.28,
    saturation: 0.24,
    lightnessMin: 0.62,
    lightnessMax: 0.94,
  }),
  Object.freeze({
    share: 0.1,
    minRadiusFactor: 0.56,
    maxRadiusFactor: 0.75,
    sizeFactor: 1.45,
    opacity: 0.48,
    saturation: 0.3,
    lightnessMin: 0.66,
    lightnessMax: 0.98,
  }),
]);

/* Orbit visual hierarchy ---------------------------------------------- */
export const ORBIT_MAX_VISUAL_DISTANCE_AU = 30.5;
export const ORBIT_OPACITY_NEAR = 0.52;
export const ORBIT_OPACITY_FAR = 0.12;
export const ORBIT_DISTANCE_COLOR_BLEND = 0.62;
export const ORBIT_INNER_TINT = 0xffd59a;
export const ORBIT_GAS_GIANT_TINT = 0xf5ddac;
export const ORBIT_ICE_GIANT_TINT = 0x96c3ff;

/* Time scaling --------------------------------------------------------- */
export const BASE_ORBIT_SPEED_UNIT_TIME = 60; // sim‑sec per Earth‑year when baseOrbitSpeedFactor = 1
export const DAYS_PER_SIM_SECOND_AT_1X = 365.25 / BASE_ORBIT_SPEED_UNIT_TIME;
export const EPHEMERIS_SOURCE_NAME = "NASA/JPL Horizons";

export function formatSimulationRate(simulationSpeed) {
  const speed = Number(simulationSpeed);
  if (!Number.isFinite(speed) || speed === 0) return "Paused";

  const daysPerSecond = Math.abs(speed) * DAYS_PER_SIM_SECOND_AT_1X;
  const yearsPerMinute = (daysPerSecond * 60) / 365.25;
  const daysText = daysPerSecond < 1 ? daysPerSecond.toFixed(2) : daysPerSecond.toFixed(1);
  const yearsText = Number.isInteger(yearsPerMinute)
    ? yearsPerMinute.toFixed(0)
    : yearsPerMinute.toFixed(1);
  const yearUnit = Math.abs(yearsPerMinute - 1) < 1e-9 ? "year" : "years";
  return `${speed < 0 ? "Reverse · " : ""}${daysText} simulated days/s · ${yearsText} Earth ${yearUnit}/min`;
}

/* Lighting ------------------------------------------------------------- */
export const AMBIENT_LIGHT_INTENSITY = 0.06;
export const SUN_POINT_LIGHT_INTENSITY = 7;
export const SUN_POINT_LIGHT_DECAY = 0.8;
export const SUN_GLOW_LIGHT_INTENSITY = 3;
export const SUN_GLOW_LIGHT_DISTANCE = 300;
export const SUN_GLOW_LIGHT_DECAY = 1.0;
export const DIR_LIGHT_INTENSITY = 0.5;
export const HEMI_LIGHT_INTENSITY = 0.06;
export const HEMI_LIGHT_SKY_COLOR = 0x0d1f33;
export const HEMI_LIGHT_GROUND_COLOR = 0x030303;
export const SUN_EMISSIVE_INTENSITY = 1.2;

export const PLANET_ENV_INTENSITY = 0.18;
export const MOON_ENV_INTENSITY = 0.55;
export const BOUNCE_LIGHT_INTENSITY = 0.08;
export const INSPECTION_LIGHT_INTENSITY = 1.8;

/* Tone mapping --------------------------------------------------------- */
export const TONE_MAPPING_EXPOSURE_MIN = 0.7;
export const TONE_MAPPING_EXPOSURE_MAX = 1.6;

/* Visual flair --------------------------------------------------------- */
// Keep a soft corona around the Sun so it reads like a star, not a matte sphere
export const SUN_GLOW_ENABLED = true;
export const SUN_GLOW_SPRITE_SCALE = 120; // restrained corona around the 50-unit diameter
export const SHOW_LABELS = true; // UI/HTML labels (managed by ui.js)
export const SHOW_SPRITE_LABELS = false; // 3D sprite labels (disable to avoid doubles)

/* Feature flags -------------------------------------------------------- */
// Hide Mars-specific prototype features (launch window panel, trajectory demo)
export const MARS_FEATURES_ENABLED = false;

/* Material defaults ---------------------------------------------------- */

/* Utility to create highlight / outline materials --------------------- */
export function createMaterials() {
  return {
    HIGHLIGHT_MATERIAL: new THREE.MeshBasicMaterial({
      color: SELECTED_HIGHLIGHT_COLOR,
      wireframe: true,
    }),
    OUTLINE_MATERIAL: new THREE.MeshBasicMaterial({
      color: SELECTED_HIGHLIGHT_COLOR,
      wireframe: true, // Use wireframe for proper outline effect
      transparent: true,
      opacity: SELECTION_OUTLINE_OPACITY,
      depthWrite: false,
    }),
  };
}
