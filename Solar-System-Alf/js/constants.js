// --- Constants and Configuration ---
import * as THREE from 'three';

// Basic sizes
export const SUN_RADIUS = 25;  // Sun radius
export const EARTH_RADIUS_KM = 6371; // For info display

// Colors
export const ORBIT_LINE_COLOR = 0x444444;
export const SELECTED_HIGHLIGHT_COLOR = 0x00ffff;
export const SUN_EMISSIVE_COLOR = 0xffddaa;

// Scale factors
export const ORBIT_SCALE_FACTOR = 120; // Base orbital scale factor
export const MOON_ORBIT_SCALE = 5; // Scale factor for moon orbits
export const MOON_SIZE_SCALE = 1.2; // Moon size scale (reduced from 2.5, was 0.8 originally)

// Materials and effects - defined as a function to avoid premature THREE usage
export function createMaterials() {
    return {
        HIGHLIGHT_MATERIAL: new THREE.MeshBasicMaterial({ 
            color: SELECTED_HIGHLIGHT_COLOR, 
            wireframe: true 
        }),
        OUTLINE_MATERIAL: new THREE.MeshBasicMaterial({ 
            color: SELECTED_HIGHLIGHT_COLOR, 
            side: THREE.BackSide 
        })
    };
}

// Object scaling
export const OUTLINE_SCALE = 1.06; // How much larger the outline mesh is
export const MOON_ORBIT_SCALE_FACTOR = MOON_ORBIT_SCALE; // Use previous constant
export const MOON_SIZE_SCALE_FACTOR = MOON_SIZE_SCALE; // Use previous constant
export const MIN_MOON_RADIUS = 0.5; // Smallest visual size for a moon
export const ATMOSPHERE_SCALE_FACTOR = 1.05; // How much larger atmosphere mesh is than planet
export const ATMOSPHERE_OPACITY_MULTIPLIER = 0.3;
export const MOON_ATMOSPHERE_SCALE_FACTOR = 1.1;
export const MOON_ATMOSPHERE_OPACITY_MULTIPLIER = 0.4;
export const CLOUD_SCALE_FACTOR = 1.02; // How much larger cloud mesh is than planet
export const CLOUD_OPACITY = 0.7;
export const CLOUD_ROTATION_SPEED_MULTIPLIER = 1.1; // Clouds rotate slightly faster

// Saturn ring specifics
export const SATURN_RING_INNER_RADIUS_FACTOR = 1.2;
export const SATURN_RING_OUTER_RADIUS_FACTOR = 2.5;
export const SATURN_RING_OPACITY = 0.9;
export const SATURN_RING_INNER_GAP = 1.4; // Gap between inner ring and planet
export const SATURN_RING_OUTER_GAP = 2.2; // Gap between rings

// Geometry detail levels
export const PLANET_SEGMENTS = 32; // Geometry detail for planets
export const MOON_SEGMENTS = 16;   // Geometry detail for moons
export const ORBIT_SEGMENTS = 128; // Geometry detail for orbit lines
export const MOON_ORBIT_SEGMENTS = 64; // Geometry detail for moon orbit lines

// Starfield
export const STARFIELD_RADIUS = 5000; // Increased from 3000
export const STAR_COUNT = 20000;  // Increased from 15000
export const STAR_BASE_SIZE = 2.0;   // Increased from 1.5
export const STAR_MIN_SIZE_FACTOR = 0.5;
export const STAR_MAX_SIZE_FACTOR = 1.5;
export const STAR_MIN_COLOR_FACTOR = 0.7; // Multiplier for brightness (0.7 to 1.0)

// Physics & Time
export const BASE_ORBIT_SPEED_UNIT_TIME = 60; // Sim seconds representing 1 Earth year for baseOrbitSpeedFactor=1
export const DAYS_PER_SIM_SECOND_AT_1X = 365.25 / BASE_ORBIT_SPEED_UNIT_TIME; // How many sim days pass per real second at 1x speed
export const CAMERA_FOLLOW_LERP_FACTOR = 3; // How fast the camera follows its target

// Lighting
export const AMBIENT_LIGHT_INTENSITY = 0.3; // Increased from 0.15
export const SUN_POINT_LIGHT_INTENSITY = 7; // Increased from 5
export const SUN_POINT_LIGHT_DECAY = 0.8; // Reduced decay for farther reach
export const SUN_GLOW_LIGHT_INTENSITY = 3; // Increased from 2
export const SUN_GLOW_LIGHT_DISTANCE = 300; // Increased from 200
export const SUN_GLOW_LIGHT_DECAY = 1.0; // Reduced decay for farther reach
export const DIR_LIGHT_INTENSITY = 0.5; // Increased from 0.3
export const HEMI_LIGHT_INTENSITY = 0.4; // Increased from 0.2
export const SUN_EMISSIVE_INTENSITY = 1.5; // Make the sun mesh glow

// Materials
export const PLANET_ROUGHNESS = 0.7;
export const PLANET_METALNESS = 0.1;

// Texture URLs
export const TEXTURE_URLS = {
  sun: './textures/sun.jpg',
  mercury: './textures/mercury.jpg',
  venus: './textures/venus.jpg',
  earth: './textures/earth.jpg',
  earth_clouds: './textures/earth_clouds.jpg',
  earth_night: './textures/earth_night.jpg',
  moon: './textures/moon.jpg',
  mars: './textures/mars.jpg',
  jupiter: './textures/jupiter.jpg',
  io: './textures/io.jpg',
  europa: './textures/europa.jpg',
  ganymede: './textures/ganymede.jpg',
  callisto: './textures/callisto.jpg',
  saturn: './textures/saturn.jpg',
  saturn_ring: './textures/saturn_ring.png',
  titan: './textures/titan.jpg',
  uranus: './textures/uranus.jpg',
  neptune: './textures/neptune.jpg',
  triton: './textures/triton.jpg'
};