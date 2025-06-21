// --- Celestial Bodies Module ------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";
import { createPlanetMaterial, createOrbitLine, loadTexture } from "./utils.js";

/* --------------------------------------------        color: cfg.atmosphere.colorHex ?? 0xffffff        RotationPeriod: `${Math.abs(m.rotationPeriodDays).toFixed(2)} days${
          m.rotationPeriodDays === m.orbitalPeriodDays ? " (tidally locked)" : ""        transparent: true,
        opacity:
          (cfg.atmosphere.densityRelative ?? 0.3) *---------------------- */
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
        Diameter: `~${(
          (CONSTANTS.SUN_RADIUS * 2 * CONSTANTS.EARTH_RADIUS_KM) /
          4.2
        ).toLocaleString()} km`,
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
    // Use normal scaling with reasonable minimum size
    const dispR = Math.max(
      cfg.scaledRadiusDisplayUnits,
      CONSTANTS.MIN_PLANET_RADIUS
    );

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
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.rotation.order = "YXZ";
    mesh.rotation.z = group.userData.axialTilt;
    // Set up click target to point to the selectable parent group
    mesh.userData.clickTarget = group;
    group.userData.planetMesh = mesh;
    group.add(mesh);
    mesh.name = `${cfg.name}_mesh`;

    // Debug logging
    console.log(
      `Created planet ${cfg.name}: radius=${dispR}, material=${mat.type}, geometry=${geom.type}, position will be set by animation`
    );
    if (!mat.map && cfg.textureUrl) {
      console.warn(`Texture missing for ${cfg.name}: ${cfg.textureUrl}`);
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
  console.log(`Creating rings for ${cfg.name}, planet radius: ${planetR}`);

  // Use the rings object from the new JSON structure
  const ringConfig = cfg.rings;
  if (!ringConfig || !ringConfig.textureUrl) {
    console.log(`No ring texture specified for ${cfg.name}`);
    return;
  }

  const tex = loadTexture(ringConfig.textureUrl, loader);

  // Create a single high-quality ring with better appearance
  const innerRadius = planetR * CONSTANTS.SATURN_RING_INNER_RADIUS_FACTOR;
  const outerRadius = planetR * CONSTANTS.SATURN_RING_OUTER_RADIUS_FACTOR;

  console.log(`Ring radii: inner=${innerRadius}, outer=${outerRadius}`);

  // Much higher quality geometry
  const geom = new THREE.RingGeometry(innerRadius, outerRadius, 128, 32);

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
  console.log(`Ring added to ${cfg.name} group, material:`, mat);
}

/* ---------------------------------------------------------------------- */
/*                              Moons                                     */
/* ---------------------------------------------------------------------- */
function createMoonSystem(planetCfg, planetGroup, planetRadius, loader) {
  const moonGroup = new THREE.Group();
  moonGroup.userData.parentPlanetName = planetCfg.name;
  const moonBodies = [];

  planetCfg.moons.forEach((m) => {
    // --- Reasonable Moon Scaling for Better Visibility ---
    // Scale based on actual radius with modest visibility enhancement
    const scaledRadiusFromActual =
      m.actualRadiusEarthRadii *
      CONSTANTS.EARTH_RADIUS_KM *
      CONSTANTS.MOON_DISPLAY_SCALE_FACTOR;
    // Apply reasonable minimum size and very moderate scaling
    const moonR = Math.max(
      CONSTANTS.MIN_MOON_RADIUS, // Small minimum size
      scaledRadiusFromActual * 3 // 3x size multiplier for visibility (since base scale is much smaller)
    );
    // --- End Moon Scaling ---

    // Calculate orbit radius relative to planet center
    const orbitR =
      planetRadius * 1.5 + // Base distance from planet surface
      (m.orbitRadiusKm / 1e5) * CONSTANTS.MOON_ORBIT_SCALE_FACTOR; // Scaled orbital distance

    const geom = new THREE.SphereGeometry(
      moonR,
      CONSTANTS.MOON_SEGMENTS,
      CONSTANTS.MOON_SEGMENTS / 2
    );

    // Only load texture if textureUrl exists
    const tex = m.textureUrl
      ? loadTexture(m.textureUrl.toLowerCase(), loader)
      : null;

    const mat = new THREE.MeshStandardMaterial({
      map: tex ? tex : null, // Explicitly set to null if no texture
      color: tex ? 0xffffff : 0xaaaaaa, // Use white if texture, grey otherwise
      roughness: 0.9, // Explicitly set higher roughness for less gloss
      metalness: 0.05, // Explicitly set lower metalness for a rocky look
      // Keep emissive properties but don't map if no texture
      emissive: 0x333333,
      emissiveIntensity: 0.4,
      emissiveMap: tex ? tex : null, // Explicitly set to null if no texture
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
      console.log(
        `Added atmosphere to ${m.name} with color ${m.atmosphere.colorHex} and opacity ${matA.opacity}`
      );
    }

    /* Self‑lights for tiny moons -------------------------------------- */
    const light1 = new THREE.PointLight(0xffffff, 1, moonR * 15);
    const light2 = new THREE.PointLight(0xffffee, 0.5, moonR * 10);
    light2.position.set(moonR * 3, 0, 0);
    moon.add(light1);
    moon.add(light2);

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
        Size: `${(m.actualRadiusEarthRadii * CONSTANTS.EARTH_RADIUS_KM).toFixed(
          0
        )} km radius`,
        Orbit: `${m.orbitRadiusKm.toLocaleString()} km from ${planetCfg.name}`,
        OrbitalPeriod: `${Math.abs(m.orbitalPeriodDays).toFixed(2)} days${
          m.orbitalPeriodDays < 0 ? " (retrograde)" : ""
        }`,
        RotationPeriod: `${Math.abs(m.rotationPeriod).toFixed(2)} days${
          m.rotationPeriod === m.orbitalPeriod ? " (tidally locked)" : ""
        }`,
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
