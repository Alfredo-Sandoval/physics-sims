// --- Celestial Bodies Module ------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";
import { createPlanetMaterial, createOrbitLine, loadTexture, createTextSprite, createAtmosphereMaterial, createStarTexture } from "./utils.js";

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
  // Add a subtle additive sprite glow for aesthetic corona
  const glowTex = createStarTexture();
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: CONSTANTS.SUN_EMISSIVE_COLOR,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(CONSTANTS.SUN_GLOW_SPRITE_SCALE);
  sun.add(glow);
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
    // Derive a display radius robustly across data variants
    const explicitScaled =
      (Number.isFinite(cfg.scaledRadiusDisplayUnits)
        ? cfg.scaledRadiusDisplayUnits
        : undefined) ??
      (Number.isFinite(cfg.scaledRadius) ? cfg.scaledRadius : undefined);
    const actualER = (Number.isFinite(cfg.actualRadiusEarthRadii)
      ? cfg.actualRadiusEarthRadii
      : Number.isFinite(cfg.actualRadius)
      ? cfg.actualRadius
      : undefined);
    const computedFromActual = Number.isFinite(actualER)
      ? actualER * CONSTANTS.EARTH_RADIUS_KM * CONSTANTS.PLANET_DISPLAY_SCALE_FACTOR
      : undefined;
    const dispRRaw = explicitScaled ?? computedFromActual ?? CONSTANTS.MIN_PLANET_RADIUS;
    const dispR = Math.max(CONSTANTS.MIN_PLANET_RADIUS, dispRRaw);

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

    // Optional name label
    if (CONSTANTS.SHOW_LABELS) {
      const label = createTextSprite(cfg.name, { font: '14px Arial' });
      label.position.set(0, dispR * 1.6, 0);
      label.renderOrder = 999;
      label.userData = { ...(label.userData || {}), isLabel: true };
      group.add(label);
    }

    // Debug logging
    console.log(
      `Created planet ${cfg.name}: radius=${dispR}, material=${mat.type}, geometry=${geom.type}, position will be set by animation`
    );
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
      const baseOpacity = (cfg.atmosphere.density ?? 0.3) * CONSTANTS.ATMOSPHERE_OPACITY_MULTIPLIER;
      const atmoMat = createAtmosphereMaterial(cfg.atmosphere.color ?? 0xffffff, baseOpacity);
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
    if (cfg.rings && cfg.rings.textureUrl) {
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

    /* Orbital plane (educational) ------------------------------------- */
    const planeOuter = orbitR; // already in scene units
    const planeInner = planeOuter * 0.96; // thin band around the orbit
    const planeGeom = new THREE.RingGeometry(planeInner, planeOuter * 1.04, 96, 1);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x4aa3ff,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
    });
    const plane = new THREE.Mesh(planeGeom, planeMat);
    // Orient using inclination i and ascending node Ω in a Y-up world: Ry(Ω) then Rx(i)
    const iRad = (cfg.kepler?.inclinationDeg ?? cfg.info?.orbitalInclinationDeg ?? 0) * THREE.MathUtils.DEG2RAD;
    const ORad = (cfg.kepler?.longAscNodeDeg ?? 0) * THREE.MathUtils.DEG2RAD;
    plane.setRotationFromEuler(new THREE.Euler(iRad, ORad, 0, 'YXZ'));
    plane.userData = { isOrbitalPlane: true, bodyName: cfg.name };
    scene.add(plane);

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

  // Create a single high-quality ring with better appearance
  const innerRadius = planetR * CONSTANTS.SATURN_RING_INNER_RADIUS_FACTOR;
  const outerRadius = planetR * CONSTANTS.SATURN_RING_OUTER_RADIUS_FACTOR;

  console.log("Ring radii: inner=" + innerRadius + ", outer=" + outerRadius);

  // Reduced geometry detail to prevent OOM issues (was 128, 32)
  const geom = new THREE.RingGeometry(innerRadius, outerRadius, 64, 16);

  // Revert to MeshStandardMaterial and add alphaTest
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: CONSTANTS.SATURN_RING_OPACITY,
    depthWrite: false,
    alphaTest: 0.5, // Add alphaTest to discard transparent pixels
  });

  const ring = new THREE.Mesh(geom, mat);
  ring.rotation.x = Math.PI / 2;
  ring.raycast = () => {}; // Disable raycasting for rings

  // Apply ring tilt from the new structure
  ring.rotation.z = (ringConfig.tiltDeg ?? 0) * THREE.MathUtils.DEG2RAD;

  group.add(ring);
  console.log("Ring added to " + cfg.name + " group, material:", mat);
}

/* ---------------------------------------------------------------------- */
/*                              Moons                                     */
/* ---------------------------------------------------------------------- */
function createMoonSystem(planetCfg, planetGroup, planetRadius, loader) {
  const moonGroup = new THREE.Group();
  moonGroup.userData.parentPlanetName = planetCfg.name;
  const moonBodies = [];

  planetCfg.moons.forEach((m) => {
    // Size moons proportionally to their actual size and parent planet
    const moonActualRadius = m.actualRadius || m.actualRadiusEarthRadii || 0.1;
    const baseMoonSize = moonActualRadius * CONSTANTS.MOON_DISPLAY_SCALE_FACTOR;
    // Scale relative to parent planet size for better visual balance
    const planetScale = Math.min(1.0, planetRadius / 10); // Larger planets = relatively smaller moons
    const moonR = Math.max(
      CONSTANTS.MIN_MOON_RADIUS,
      Math.min(baseMoonSize * planetScale, CONSTANTS.MAX_MOON_RADIUS)
    );

    // Calculate orbit radius relative to planet center
    const orbitR =
      planetRadius * 1.5 + // Base distance from planet surface
      (m.orbitRadiusKm / 1e5) * CONSTANTS.MOON_ORBIT_SCALE_FACTOR; // Scaled orbital distance

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
      const baseOpacityM = (m.atmosphere.densityRelative ?? 0.2) * CONSTANTS.MOON_ATMOSPHERE_OPACITY_MULTIPLIER;
      const matA = createAtmosphereMaterial(m.atmosphere.colorHex ?? 0xffffff, baseOpacityM);
      const a = new THREE.Mesh(g, matA);
      a.raycast = () => {};
      moon.add(a);
    }

    /* Self‑lights for tiny moons (optimized) ------------------------- */
    // Only add self-lighting for very small moons that need it
    if (moonR < CONSTANTS.MIN_MOON_RADIUS * 2) {
      const light1 = new THREE.PointLight(0xffffff, 0.5, moonR * 10);
      light1.castShadow = false; // Disable shadow casting for performance
      moon.add(light1);
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
      color: CONSTANTS.ORBIT_LINE_COLOR, // Use the constant directly
      transparent: true,
      opacity: 0.5, // Match planet orbit opacity
    });
    const moonOrbitLine = new THREE.LineLoop(moonOrbitGeom, moonOrbitMat);
    moonOrbitLine.rotation.x = Math.PI / 2; // Rotate to XZ plane
    moonOrbitLine.userData = { isOrbitLine: true, isMoonOrbit: true };
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
