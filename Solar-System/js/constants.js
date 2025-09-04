// File: Solar-System/js/constants.js
// --- Constants and Configuration ---
import * as THREE from "three";

/* Camera helpers ------------------------------------------------------- */
export const ORIGIN_VECTOR = new THREE.Vector3(0, 0, 0);
export const DEFAULT_CAMERA_DISTANCE = 150; // when nothing selected
export const PLANET_CAMERA_DISTANCE_MULTIPLIER = 8; // ≈ radius × 8
export const MOON_CAMERA_DISTANCE_MULTIPLIER = 4; // ≈ radius × 4
export const CAMERA_FOLLOW_LERP_FACTOR = 3; // higher = snappier

/* Basic sizes ---------------------------------------------------------- */
export const SUN_RADIUS = 25; // render‑unit radius of Sun
export const EARTH_RADIUS_KM = 6371; // physical radius for info display

/* Colours -------------------------------------------------------------- */
export const ORBIT_LINE_COLOR = 0x333333; // Made darker
export const SELECTED_HIGHLIGHT_COLOR = 0x00ffff;
export const SUN_EMISSIVE_COLOR = 0xffddaa;

/* Selection/Outline ---------------------------------------------------- */
export const OUTLINE_SCALE = 1.035; // Slightly thinner for cleaner rim

/* Scale factors -------------------------------------------------------- */
export const ORBIT_SCALE_FACTOR = 100; // AU → scene units (balanced for visibility)
export const MOON_ORBIT_SCALE_FACTOR = 0.0002; // km → scene units (tiny to keep moons close to planets)
export const PLANET_DISPLAY_SCALE_FACTOR = 2; // Fallback scaling for planets without scaledRadius
export const MOON_DISPLAY_SCALE_FACTOR = 1.5; // Moon scaling relative to planet size
export const MIN_PLANET_RADIUS = 1.0; // Minimum visual size for planets
export const MIN_MOON_RADIUS = 0.15; // Minimum visual size for moons
export const MAX_MOON_RADIUS = 2; // Maximum visual size for moons

export const ATMOSPHERE_SCALE_FACTOR = 1.05;
export const ATMOSPHERE_OPACITY_MULTIPLIER = 0.3;
export const MOON_ATMOSPHERE_SCALE_FACTOR = 1.05; // Much smaller atmosphere
export const MOON_ATMOSPHERE_OPACITY_MULTIPLIER = 0.1; // Much less visible

export const CLOUD_SCALE_FACTOR = 1.02;
export const CLOUD_OPACITY = 0.7;
export const CLOUD_ROTATION_SPEED_MULTIPLIER = 1.1;

/* Saturn rings (visual only) ------------------------------------------ */
export const SATURN_RING_INNER_RADIUS_FACTOR = 1.15;
export const SATURN_RING_OUTER_RADIUS_FACTOR = 2.2;
export const SATURN_RING_OPACITY = 1.0; // Make fully opaque for visibility

/* Material properties -------------------------------------------------- */
export const PLANET_ROUGHNESS = 0.9;
export const PLANET_METALNESS = 0.05;
export const MOON_ROUGHNESS = 0.95;
export const MOON_METALNESS = 0.02;
export const ASTEROID_ROUGHNESS_BROWN = 0.95;
export const ASTEROID_ROUGHNESS_GRAY = 0.9;
export const ASTEROID_ROUGHNESS_DARK = 0.98;
export const ASTEROID_METALNESS_BROWN = 0.02;
export const ASTEROID_METALNESS_GRAY = 0.05;
export const ASTEROID_METALNESS_DARK = 0.01;

/* Asteroid colors ------------------------------------------------------ */
export const ASTEROID_COLOR_BROWN = 0x8B7355;
export const ASTEROID_COLOR_GRAY = 0x696969;
export const ASTEROID_COLOR_DARK_BROWN = 0x654321;

/* Error handling and validation ---------------------------------------- */
export const NULL_GUARD = (obj, property) => obj && obj[property] !== undefined && obj[property] !== null;
export const SAFE_GET = (obj, path, defaultValue = null) => {
  try {
    return path.split('.').reduce((o, p) => o && o[p], obj) || defaultValue;
  } catch {
    return defaultValue;
  }
};

/* Asteroid Belt -------------------------------------------------------- */
export const ASTEROID_BELT_ENABLED = true;
export const ASTEROID_COUNT = 800; // Reduced from 1500 to prevent OOM issues
export const ASTEROID_BELT_INNER_RADIUS_AU = 2.2;
export const ASTEROID_BELT_OUTER_RADIUS_AU = 3.2;
export const ASTEROID_BELT_THICKNESS_AU = 0.15; // Reduced vertical spread
export const ASTEROID_MIN_SIZE = 0.1; // Much larger minimum for visibility
export const ASTEROID_MAX_SIZE = 0.4; // Much larger maximum for visibility
export const ASTEROID_COLOR = 0x998877; // More brownish rock color

/* Geometry detail ------------------------------------------------------ */
// Increase segments to smooth the selection rim without large perf cost
export const PLANET_SEGMENTS = 48; // Smoother spheres for outline silhouette
export const MOON_SEGMENTS = 16;
export const ORBIT_SEGMENTS = 64; // Reduced from 128 to prevent OOM
export const MOON_ORBIT_SEGMENTS = 32; // Reduced from 64 to prevent OOM

/* Star‑field ----------------------------------------------------------- */
export const STARFIELD_RADIUS = 5000;
export const STAR_COUNT = 8000; // Reduced from 20000 to prevent OOM
export const STAR_BASE_SIZE = 2.0;
export const STAR_MIN_SIZE_FACTOR = 0.5;
export const STAR_MAX_SIZE_FACTOR = 1.5;

/* Time scaling --------------------------------------------------------- */
export const BASE_ORBIT_SPEED_UNIT_TIME = 60; // sim‑sec per Earth‑year when baseOrbitSpeedFactor = 1
export const DAYS_PER_SIM_SECOND_AT_1X = 365.25 / BASE_ORBIT_SPEED_UNIT_TIME;

/* Lighting ------------------------------------------------------------- */
export const AMBIENT_LIGHT_INTENSITY = 0.3;
export const SUN_POINT_LIGHT_INTENSITY = 7;
export const SUN_POINT_LIGHT_DECAY = 0.8;
export const SUN_GLOW_LIGHT_INTENSITY = 3;
export const SUN_GLOW_LIGHT_DISTANCE = 300;
export const SUN_GLOW_LIGHT_DECAY = 1.0;
export const DIR_LIGHT_INTENSITY = 0.5;
export const HEMI_LIGHT_INTENSITY = 0.4;
export const SUN_EMISSIVE_INTENSITY = 1.5;

/* Moons visibility aids ----------------------------------------------- */
// Historically we added small PointLights to tiny moons to make them visible,
// but that incorrectly lights nearby planets. Keep it off by default.
export const MOON_POINT_LIGHT_FOR_VISIBILITY = false; // if true, tiny moons add a small PointLight
export const MOON_POINT_LIGHT_INTENSITY = 0.25; // dim if enabled
export const MOON_POINT_LIGHT_RANGE_MULTIPLIER = 6; // light distance = radius * this

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
      opacity: 0.6, // Slightly more visible wireframe
      depthWrite: false,
    }),
  };
}
