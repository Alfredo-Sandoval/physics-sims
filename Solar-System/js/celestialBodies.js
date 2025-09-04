// --- Celestial Bodies Module ------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";
import { createPlanetMaterial, createOrbitLine, loadTexture } from "./utils.js";

/* ---------------------------------------------------------------------- */
/*                               Sun                                      */
/* ---------------------------------------------------------------------- */
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
  sun.userData = {
    isSelectable: true,
    name: "Sun",
    type: "star",
    config: {
      name: "Sun",
      info: {
        Mass: "333 000 Earths",
        Composition: "H 73%, He 25%, metals 2%",
        Temperature: "5 500 °C surface",
        Rotation: "~25 days equator",
        Diameter: "~" + (
          (CONSTANTS.SUN_RADIUS * 2 * CONSTANTS.EARTH_RADIUS_KM) /
          4.2
        ).toLocaleString() + " km",
        Type: "G2V main‑sequence",
        Age: "4.6 Gyr",
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

  for (const cfg of configs) {
    const orbitR = cfg.orbitRadiusAU * CONSTANTS.ORBIT_SCALE_FACTOR;
    // Use pre-scaled radius from JSON for balanced visual sizing
    const dispR = cfg.scaledRadius || 
      Math.max(CONSTANTS.MIN_PLANET_RADIUS, cfg.actualRadius * CONSTANTS.PLANET_DISPLAY_SCALE_FACTOR);

    /* Planet group (holds mesh, atmosphere, moons) --------------------- */
    const group = new THREE.Group();
    group.userData = {
      isSelectable: true,
      name: cfg.name,
      type: "planet",
      config: cfg,
      orbitRadius: orbitR,
      orbitSpeed: cfg.calculatedOrbitSpeed,
      rotationSpeed: cfg.calculatedRotationSpeed,
      rotationDirection: cfg.rotationDirection,
      initialAngle: cfg.initialAngleRad ?? 0,
      currentAngle: cfg.initialAngleRad ?? 0,
      axialTilt: (cfg.axialTilt ?? 0) * THREE.MathUtils.DEG2RAD,
    };

    /* Planet mesh ------------------------------------------------------ */
    const geom = new THREE.SphereGeometry(
      dispR,
      CONSTANTS.PLANET_SEGMENTS,
      CONSTANTS.PLANET_SEGMENTS / 2
    );
    const mat = createPlanetMaterial(cfg.textureUrl, loader);
    const mesh = new THREE.Mesh(geom, mat);
    // Only enable shadows for larger planets (performance optimization)
    const shouldHaveShadows = dispR > CONSTANTS.MIN_PLANET_RADIUS * 2;
    mesh.castShadow = shouldHaveShadows;
    mesh.receiveShadow = true; // All planets receive shadows
    mesh.rotation.order = "YXZ";
    mesh.rotation.z = group.userData.axialTilt;
    // Set up click target to point to the selectable parent group
    mesh.userData.clickTarget = group;
    group.userData.planetMesh = mesh;
    group.add(mesh);
    mesh.name = cfg.name + "_mesh";

    if (!mat.map && cfg.textureUrl) {
      console.warn("Texture missing for " + cfg.name + ": " + cfg.textureUrl);
    }

    /* Atmosphere ------------------------------------------------------- */
    if (cfg.atmosphere?.exists) {
      const atmoGeom = new THREE.SphereGeometry(
        dispR * CONSTANTS.ATMOSPHERE_SCALE_FACTOR,
        CONSTANTS.PLANET_SEGMENTS,
        CONSTANTS.PLANET_SEGMENTS / 2
      );
      const atmoMat = new THREE.MeshBasicMaterial({
        color: cfg.atmosphere.color ?? 0xffffff,
        transparent: true,
        // Significantly reduce opacity to make the outline less visible
        opacity:
          (cfg.atmosphere.density ?? 0.3) *
          CONSTANTS.ATMOSPHERE_OPACITY_MULTIPLIER *
          0.1, // Reduced multiplier
        side: THREE.FrontSide, // Changed from BackSide
      });
      const atmo = new THREE.Mesh(atmoGeom, atmoMat);
      atmo.raycast = () => {};
      group.add(atmo);
    }

    /* Earth cloud layer ------------------------------------------------ */
    if (cfg.name === "Earth" && cfg.cloudTextureUrl) {
      const cloudGeom = new THREE.SphereGeometry(
        dispR * CONSTANTS.CLOUD_SCALE_FACTOR,
        CONSTANTS.PLANET_SEGMENTS,
        CONSTANTS.PLANET_SEGMENTS / 2
      );
      const cloudTex = loadTexture(cfg.cloudTextureUrl, loader);
      const cloudMat = new THREE.MeshStandardMaterial({
        map: cloudTex,
        transparent: true,
        opacity: CONSTANTS.CLOUD_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const clouds = new THREE.Mesh(cloudGeom, cloudMat);
      clouds.raycast = () => {};
      mesh.userData.cloudMesh = clouds;
      group.add(clouds);
    }

    /* Rings ----------------------------------------------------------- */
    // Backward‑compat: honor legacy top‑level fields if present
    if (!cfg.rings && (cfg.ringTextureUrl || cfg.ringTilt !== undefined)) {
      cfg.rings = {
        textureUrl: cfg.ringTextureUrl,
        tiltDeg: cfg.ringTilt ?? 0,
      };
      console.log(`[Rings] Built rings object for ${cfg.name} from legacy fields.`);
    }

    if (cfg.rings && cfg.rings.textureUrl) {
      await createRings(cfg, dispR, group, loader);
    } else if (cfg.name === "Saturn") {
      // Absolute fallback for Saturn if config is somehow missing
      console.warn("[Rings] Saturn has no rings config; creating default.");
      cfg.rings = { textureUrl: "saturn_ring.png", tiltDeg: cfg.axialTilt ?? 26.7 };
      await createRings(cfg, dispR, group, loader);
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

    /* Moons ------------------------------------------------------------ */
    if (cfg.moons?.length) {
      const moonData = createMoonSystem(cfg, group, dispR, loader);
      allBodies.push(...moonData.moonBodies);
    }
  }

  return { planets, celestialBodies: allBodies };
}

/* ---------------------------------------------------------------------- */
/*                            Rings (Saturn)                              */
/* ---------------------------------------------------------------------- */
async function createRings(cfg, planetR, group, loader) {
  console.log("Creating rings for " + cfg.name + ", planet radius: " + planetR);

  // Use the rings object from the new JSON structure
  const ringConfig = cfg.rings;
  if (!ringConfig || !ringConfig.textureUrl) {
    console.log("No ring texture specified for " + cfg.name);
    return;
  }

  const tex = loadTexture(ringConfig.textureUrl, loader);
  // Improve sampling to avoid visible banding and edge bleed
  if (tex) {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = Math.max(4, (window?.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8));
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
  }

  // Create a single high-quality ring with better appearance
  const innerRadius = planetR * CONSTANTS.SATURN_RING_INNER_RADIUS_FACTOR;
  const outerRadius = planetR * CONSTANTS.SATURN_RING_OUTER_RADIUS_FACTOR;

  console.log("Ring radii: inner=" + innerRadius + ", outer=" + outerRadius);

  // Geometry: many slices around, multiple radial strips for better texture mapping
  // Significantly increased segments for smoother appearance
  const geom = new THREE.RingGeometry(innerRadius, outerRadius, 512, 8);
  if (geom.attributes?.uv) {
    const uvs = geom.attributes.uv;
    for (let i = 0; i < uvs.count; i++) {
      // Keep original U (radial coordinate 0..1) for proper ring texture mapping
      // Use V coordinate to sample different parts of the texture for variety
      const currentU = uvs.getX(i);
      // Map V coordinate to sample from middle portion of texture (0.3 to 0.7)
      uvs.setY(i, 0.3 + currentU * 0.4);
    }
    uvs.needsUpdate = true;
  }

  // Improved material setup for better visual quality (use lit material)
  const ringMat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    transparent: true,
    opacity: CONSTANTS.SATURN_RING_OPACITY * 0.85,
    depthWrite: false,          // proper blending with transparency
    depthTest: true,
    alphaTest: 0.1,             // cleaner edges from alpha texture
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,     // visible from above and below
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    metalness: 0.0,
    roughness: 0.9,
    emissive: 0x111111,         // slight self-illumination now takes effect
    emissiveIntensity: 0.02,
  });

  // Create single high-quality ring mesh
  const ringMesh = new THREE.Mesh(geom, ringMat);
  ringMesh.rotation.x = Math.PI / 2; // Orient ring in XZ plane
  ringMesh.raycast = () => {}; // Disable raycasting to prevent click interference

  // Apply ring tilt from the new structure
  const tiltRad = (ringConfig.tiltDeg ?? 0) * THREE.MathUtils.DEG2RAD;
  ringMesh.rotation.z = tiltRad;

  // Set appropriate render order to render after orbit lines but before UI
  ringMesh.renderOrder = 95;

  group.add(ringMesh);
  console.log("High-quality rings added to " + cfg.name + " with " + geom.parameters.thetaSegments + " segments");
}

/* ---------------------------------------------------------------------- */
/*                              Moons                                     */
/* ---------------------------------------------------------------------- */
function createMoonSystem(planetCfg, planetGroup, planetRadius, loader) {
  const moonGroup = new THREE.Group();
  moonGroup.userData.parentPlanetName = planetCfg.name;
  const moonBodies = [];

  // Compute per-planet orbit spread so moons don’t share the same track
  const moons = planetCfg.moons || [];
  const minKm = Math.min(...moons.map(mm => mm.orbitRadiusKm));
  const maxKm = Math.max(...moons.map(mm => mm.orbitRadiusKm));
  const rangeKm = Math.max(1, maxKm - minKm);

  planetCfg.moons.forEach((m, idx) => {
    // Size moons proportionally to their actual size and parent planet
    const moonActualRadius = m.actualRadius || m.actualRadiusEarthRadii || 0.1;
    const baseMoonSize = moonActualRadius * CONSTANTS.MOON_DISPLAY_SCALE_FACTOR;
    // Scale relative to parent planet size for better visual balance
    const planetScale = Math.min(1.0, planetRadius / 10); // Larger planets = relatively smaller moons
    const moonR = Math.max(
      CONSTANTS.MIN_MOON_RADIUS,
      Math.min(baseMoonSize * planetScale, CONSTANTS.MAX_MOON_RADIUS)
    );

    // Calculate orbit radius relative to planet center using relative spacing
    // so moons around small planets (e.g., Mars) don’t collapse onto one ring.
    const rel = (m.orbitRadiusKm - minKm) / rangeKm; // 0..1 per planet
    const base = planetRadius * 1.7;       // start just outside the planet
    const spread = planetRadius * 2.2;     // total spread for the system
    let orbitR = base + rel * spread;
    // Ensure a minimum clearance and slight per-index nudge to avoid overlaps
    const minClearance = planetRadius * 0.4 + moonR * 2.2;
    if (orbitR < planetRadius + minClearance) {
      orbitR = planetRadius + minClearance + rel * planetRadius * 0.2;
    }
    orbitR += idx * (planetRadius * 0.05); // tiny stagger

    const geom = new THREE.SphereGeometry(
      moonR,
      CONSTANTS.MOON_SEGMENTS,
      CONSTANTS.MOON_SEGMENTS / 2
    );

    // Load texture with proper error handling and path correction
    let tex = null;
    if (m.textureUrl) {
      // Check if texture is in Moon_JPG_Collection subdirectory
      const texturePath = m.textureUrl.includes('/') ? m.textureUrl : `Moon_JPG_Collection/${m.textureUrl}`;
      tex = loadTexture(texturePath, loader);
    }

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: tex ? 0xffffff : 0xcccccc, // Light grey if no texture
      roughness: CONSTANTS.MOON_ROUGHNESS,
      metalness: CONSTANTS.MOON_METALNESS,
      // Reduce emissive to let texture show through better
      emissive: 0x111111,
      emissiveIntensity: 0.1,
    });
    const moon = new THREE.Mesh(geom, mat);

    /* Moon atmosphere (e.g., Titan) ----------------------------------- */
    if (m.atmosphere?.exists) {
      const g = new THREE.SphereGeometry(
        moonR * CONSTANTS.MOON_ATMOSPHERE_SCALE_FACTOR,
        CONSTANTS.MOON_SEGMENTS,
        CONSTANTS.MOON_SEGMENTS / 2
      );
      const matA = new THREE.MeshBasicMaterial({
        color: m.atmosphere.colorHex ?? 0xffffff,
        transparent: true,
        opacity:
          (m.atmosphere.densityRelative ?? 0.2) *
          CONSTANTS.MOON_ATMOSPHERE_OPACITY_MULTIPLIER, // Removed the extra 1.5 multiplier
        side: THREE.BackSide,
      });
      const a = new THREE.Mesh(g, matA);
      a.raycast = () => {};
      moon.add(a);
    }

    /* Optional visibility PointLight (disabled by default) ----------- */
    if (
      CONSTANTS.MOON_POINT_LIGHT_FOR_VISIBILITY &&
      moonR < CONSTANTS.MIN_MOON_RADIUS * 2
    ) {
      const light = new THREE.PointLight(
        0xffffff,
        CONSTANTS.MOON_POINT_LIGHT_INTENSITY,
        moonR * CONSTANTS.MOON_POINT_LIGHT_RANGE_MULTIPLIER
      );
      light.castShadow = false;
      moon.add(light);
    }
    
    // Moons don't cast shadows but can receive them
    moon.castShadow = false;
    moon.receiveShadow = true;

    /* Position & userdata --------------------------------------------- */
    const θ0 = Math.random() * Math.PI * 2;
    moon.position.set(orbitR * Math.cos(θ0), 0, orbitR * Math.sin(θ0));

    moon.userData = {
      isSelectable: true,
      name: m.name,
      type: "moon",
      parentPlanetName: planetCfg.name,
      config: m,
      orbitRadius: orbitR,
      orbitSpeed: m.calculatedOrbitSpeed,
      orbitDirection: m.orbitDirection,
      rotationSpeed: m.calculatedRotationSpeed,
      rotationDirection: m.rotationDirection,
      initialAngle: θ0,
      currentAngle: θ0,
      displayInfo: {
        Size: (m.actualRadius * CONSTANTS.EARTH_RADIUS_KM).toFixed(
          0
        ) + " km radius",
        Orbit: m.orbitRadiusKm.toLocaleString() + " km from " + planetCfg.name,
        OrbitalPeriod: Math.abs(m.orbitalPeriod).toFixed(2) + " days" + (
          m.orbitalPeriod < 0 ? " (retrograde)" : ""
        ),
        RotationPeriod: Math.abs(m.rotationPeriod).toFixed(2) + " days" + (
          m.rotationPeriod === m.orbitalPeriod ? " (tidally locked)" : ""
        ),
        ParentPlanet: planetCfg.name,
        ...(m.info || {}),
      },
      clickTarget: moon,
    };
    moon.name = m.name;

    moonBodies.push(moon);

    /* Moon orbit line -------------------------------------------------- */
    // Moons still use circular orbits for simplicity in this sim
    const moonOrbitGeom = new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(
        0,
        0, // Center x, y
        orbitR,
        orbitR, // xRadius, yRadius (circular)
        0,
        2 * Math.PI, // Start angle, end angle
        false, // Clockwise
        0 // Rotation
      ).getPoints(CONSTANTS.MOON_ORBIT_SEGMENTS)
    );
    // Use the same color and transparency as planet orbits
    const moonOrbitMat = new THREE.LineBasicMaterial({
      color: CONSTANTS.ORBIT_LINE_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false, // never occlude rings/transparent surfaces
    });
    const moonOrbitLine = new THREE.LineLoop(moonOrbitGeom, moonOrbitMat);
    moonOrbitLine.rotation.x = Math.PI / 2; // Rotate to XZ plane
    moonOrbitLine.userData = { isOrbitLine: true, isMoonOrbit: true };
    moonOrbitLine.renderOrder = 0;
    moonGroup.add(moonOrbitLine);

    moonGroup.add(moon);
  });

  planetGroup.add(moonGroup);
  return { moonSystemGroup: moonGroup, moonBodies };
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
      object.material.forEach(material => {
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
  Object.keys(material).forEach(key => {
    const value = material[key];
    if (value && typeof value.dispose === 'function') {
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

  celestialBodies.forEach(body => {
    disposeObject(body);
  });
  
  celestialBodies.length = 0; // Clear the array
}
