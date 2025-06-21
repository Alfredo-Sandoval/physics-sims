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
export const OUTLINE_SCALE = 1.05; // Scale factor for selection outline

/* Scale factors -------------------------------------------------------- */
export const ORBIT_SCALE_FACTOR = 120; // AU → scene units
export const MOON_ORBIT_SCALE_FACTOR = 5; // km → scene units (relative to planet)
export const PLANET_DISPLAY_SCALE_FACTOR = 0.0005; // Earth radii -> scene units
export const MOON_DISPLAY_SCALE_FACTOR = 0.0001; // Earth radii -> scene units (much smaller for proper spacing)
export const MIN_PLANET_RADIUS = 1.5; // Minimum visual size for planets (reduced from 3.0)
export const MIN_MOON_RADIUS = 0.08; // Minimum visual size for moons (much smaller)

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

/* Asteroid Belt -------------------------------------------------------- */
export const ASTEROID_BELT_ENABLED = true;
export const ASTEROID_COUNT = 2000; // Reduced for better performance
export const ASTEROID_BELT_INNER_RADIUS_AU = 2.2;
export const ASTEROID_BELT_OUTER_RADIUS_AU = 3.2;
export const ASTEROID_BELT_THICKNESS_AU = 0.15; // Reduced vertical spread
export const ASTEROID_MIN_SIZE = 0.02; // Slightly larger minimum
export const ASTEROID_MAX_SIZE = 0.12; // Slightly larger maximum
export const ASTEROID_COLOR = 0x998877; // More brownish rock color

/* Geometry detail ------------------------------------------------------ */
export const PLANET_SEGMENTS = 32;
export const MOON_SEGMENTS = 16;
export const ORBIT_SEGMENTS = 128;
export const MOON_ORBIT_SEGMENTS = 64;

/* Star‑field ----------------------------------------------------------- */
export const STARFIELD_RADIUS = 5000;
export const STAR_COUNT = 20000;
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

/* Material defaults ---------------------------------------------------- */
export const PLANET_ROUGHNESS = 0.7;
export const PLANET_METALNESS = 0.1;

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
