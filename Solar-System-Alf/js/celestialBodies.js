// --- Celestial Bodies Module ---
import * as THREE from 'three';
import * as CONSTANTS from './constants.js';
import { createPlanetMaterial, createOrbitLine } from './utils.js';

// Create the Sun object
export function createSun(scene, textureLoader) {
    // HARDCODED: Direct texture loading without relying on constants
    const sunTexture = textureLoader.load('sun.jpg');
    const sunGeometry = new THREE.SphereGeometry(CONSTANTS.SUN_RADIUS, 64, 32); // Higher detail sun

    // Use MeshStandardMaterial for realistic lighting and emission
    const sunMaterial = new THREE.MeshStandardMaterial({
        map: sunTexture,
        emissive: CONSTANTS.SUN_EMISSIVE_COLOR, // Make it glow
        emissiveIntensity: CONSTANTS.SUN_EMISSIVE_INTENSITY,
        emissiveMap: sunTexture, // Use texture for emission pattern
    });

    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.userData.isSelectable = true;
    sunMesh.userData.name = "Sun";
    sunMesh.userData.type = "star";
    sunMesh.userData.clickTarget = sunMesh; // Direct reference to itself
    sunMesh.name = "Sun"; // Set the actual mesh name for easier debugging

    // Define sun specific config directly (as it doesn't come from JSON)
    const sunConfig = {
        name: "Sun",
        info: {
            Mass: "333,000 Earths",
            Composition: "Hydrogen (73%), Helium (25%), other elements (2%)",
            Temperature: "5,500°C (surface), 15,000,000°C (core)",
            RotationPeriod: "25-35 days (varies by latitude)",
            // Calculate approximate diameter based on scaled Earth
            Diameter: `~${(CONSTANTS.SUN_RADIUS * 2 * (CONSTANTS.EARTH_RADIUS_KM / 4.2)).toLocaleString()} km`,
            Type: "G-type main-sequence star (G2V)",
            Age: "~4.6 billion years"
        },
        // No orbital/rotational data needed for simplified model
    };
    sunMesh.userData.config = sunConfig; // Link config info to mesh

    scene.add(sunMesh);
    return { mesh: sunMesh, config: sunConfig };
}

// Create planets and their orbits
export async function createPlanetsAndOrbits(scene, textureLoader, planetConfigs) {
    if (!planetConfigs || planetConfigs.length === 0) {
        console.warn("No planet configurations loaded. Skipping planet creation.");
        return { planets: [], celestialBodies: [] };
    }
    
    const planets = [];
    const celestialBodies = [];

    // Process planets in sequence to ensure properly loaded textures
    for (const config of planetConfigs) {
        const orbitRadius = config.orbitRadiusAU * CONSTANTS.ORBIT_SCALE_FACTOR;
        const displayRadius = config.scaledRadius; // Use pre-defined scaled size

        // --- Planet Group --- (Stores shared data like orbit)
        const planetGroup = new THREE.Group();
        planetGroup.userData = {
            isSelectable: true,
            name: config.name,
            type: 'planet',
            config: config, // Store reference to full config
            orbitRadius: orbitRadius,
            orbitSpeed: config.calculatedOrbitSpeed,
            rotationSpeed: config.calculatedRotationSpeed,
            rotationDirection: config.rotationDirection,
            initialAngle: config.initialAngle, // Assuming radians from JSON processing
            currentAngle: config.initialAngle,
            axialTilt: config.axialTilt ? config.axialTilt * (Math.PI / 180) : 0
        };

        // --- Planet Mesh --- (The visible planet)
        const planetGeometry = new THREE.SphereGeometry(
            displayRadius, 
            CONSTANTS.PLANET_SEGMENTS, 
            CONSTANTS.PLANET_SEGMENTS / 2
        );
        const planetMaterial = createPlanetMaterial(config.textureUrl, textureLoader);
        const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
        planetMesh.castShadow = true;
        planetMesh.receiveShadow = true;
        planetMesh.rotation.order = 'YXZ'; // Set rotation order for tilt
        planetMesh.rotation.z = planetGroup.userData.axialTilt; // Apply tilt
        planetGroup.userData.planetMesh = planetMesh; // Keep reference in group data
        planetGroup.userData.belongsTo = config.name;
        planetGroup.userData.clickTarget = planetGroup; // Reference to parent group
        planetMesh.name = `${config.name}_mesh`; // Naming for debugging
        planetGroup.add(planetMesh);

        // --- Atmosphere --- (If defined in config)
        if (config.atmosphere && config.atmosphere.exists) {
            const atmoGeometry = new THREE.SphereGeometry(
                displayRadius * CONSTANTS.ATMOSPHERE_SCALE_FACTOR, 
                CONSTANTS.PLANET_SEGMENTS, 
                CONSTANTS.PLANET_SEGMENTS / 2
            );
            const atmoMaterial = new THREE.MeshBasicMaterial({ // Basic glow
                color: config.atmosphere.color, // Use processed color number
                transparent: true,
                opacity: config.atmosphere.density * CONSTANTS.ATMOSPHERE_OPACITY_MULTIPLIER,
                side: THREE.BackSide // Render inside for glow effect
            });
            const atmosphereMesh = new THREE.Mesh(atmoGeometry, atmoMaterial);
            atmosphereMesh.raycast = () => {}; // Make non-raycastable
            atmosphereMesh.userData.belongsTo = config.name;
            atmosphereMesh.userData.clickTarget = planetGroup;
            atmosphereMesh.name = `${config.name}_atmosphere`;
            planetGroup.add(atmosphereMesh);
        }

        // --- Clouds --- (Specific to Earth config)
        if (config.name === "Earth" && config.cloudTextureUrl) {
            const cloudGeometry = new THREE.SphereGeometry(
                displayRadius * CONSTANTS.CLOUD_SCALE_FACTOR, 
                CONSTANTS.PLANET_SEGMENTS, 
                CONSTANTS.PLANET_SEGMENTS / 2
            );
            // HARDCODED: Direct texture loading
            const cloudTexture = textureLoader.load('earth_clouds.jpg');
            const cloudMaterial = new THREE.MeshStandardMaterial({
                map: cloudTexture,
                transparent: true,
                opacity: CONSTANTS.CLOUD_OPACITY,
                blending: THREE.AdditiveBlending, // Optional: brighter clouds where they overlap sun
                depthWrite: false // Render clouds without hiding planet below
            });
            const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloudMesh.raycast = () => {}; // Make non-raycastable
            cloudMesh.userData.belongsTo = config.name;
            cloudMesh.userData.clickTarget = planetGroup;
            cloudMesh.name = `${config.name}_clouds`;
            planetMesh.userData.cloudMesh = cloudMesh; // Attach to planet mesh for rotation
            planetGroup.add(cloudMesh);
        }

        // --- Rings --- (Specific to Saturn config)
        if (config.name === "Saturn") {
            await createRings(config, displayRadius, planetGroup, textureLoader);
        }

        // --- Initial Position --- (Place the group)
        const initialAngleRad = planetGroup.userData.initialAngle;
        planetGroup.position.set(
            orbitRadius * Math.cos(initialAngleRad),
            0,
            orbitRadius * Math.sin(initialAngleRad)
        );
        scene.add(planetGroup);

        // --- Orbit Line --- (Added directly to scene)
        createOrbitLine(orbitRadius, CONSTANTS.ORBIT_LINE_COLOR, CONSTANTS.ORBIT_SEGMENTS, scene);

        // --- Store Planet Data --- (For potential later use)
        planets.push({
            group: planetGroup,
            mesh: planetMesh,
            config: config, // Includes info, speeds etc.
            orbitRadius: orbitRadius,
            displayRadius: displayRadius
        });

        celestialBodies.push(planetGroup);

        // --- Moons --- (If defined in config)
        if (config.moons && config.moons.length > 0) {
            const moonData = createMoonSystem(config, planetGroup, displayRadius, textureLoader, scene);
            celestialBodies.push(...moonData.moonBodies);
        }
    }

    return { planets, celestialBodies };
}

// Create rings (like Saturn's)
async function createRings(planetConfig, planetRadius, planetGroup, textureLoader) {
    // Create a ring group to hold all ring elements
    const ringGroup = new THREE.Group();
    
    // HARDCODED APPROACH: Load the Saturn ring texture directly
    const ringTexture = textureLoader.load('saturn_ring.png');
    ringTexture.colorSpace = THREE.SRGBColorSpace;
    
    // Create multiple ring segments with different radii and colors for a more realistic appearance
    const ringSegments = [
        { inner: planetRadius * 1.2, outer: planetRadius * 1.4, color: 0xD4CEB9, opacity: 0.9 }, // Inner A ring
        { inner: planetRadius * 1.4, outer: planetRadius * 1.6, color: 0xDBD3BF, opacity: 0.85 }, // Middle A ring
        { inner: planetRadius * 1.6, outer: planetRadius * 1.9, color: 0xE2D9C5, opacity: 0.8 },  // Outer A ring
        { inner: planetRadius * 2.0, outer: planetRadius * 2.3, color: 0xD4CEB9, opacity: 0.7 },  // Inner B ring (with gap)
        { inner: planetRadius * 2.3, outer: planetRadius * 2.5, color: 0xCEC8B5, opacity: 0.6 }   // Outer B ring
    ];
    
    // Create each ring segment
    for (const segment of ringSegments) {
        const geometry = new THREE.RingGeometry(segment.inner, segment.outer, 128, 8);
        const material = new THREE.MeshBasicMaterial({
            color: segment.color,
            map: ringTexture, // Use the ring texture for all segments
            side: THREE.DoubleSide,
            transparent: true,
            opacity: segment.opacity,
            depthWrite: false
        });
        
        const ringMesh = new THREE.Mesh(geometry, material);
        ringMesh.rotation.x = Math.PI / 2; // Orient horizontally
        ringMesh.receiveShadow = true;
        ringMesh.castShadow = true;
        ringMesh.raycast = () => {}; // Make non-raycastable
        
        ringGroup.add(ringMesh);
    }
    
    // Apply tilt (use ringTilt from config if available, else planet's axial tilt)
    const ringTiltRad = (planetConfig.ringTilt ?? planetConfig.axialTilt ?? 0) * (Math.PI / 180);
    ringGroup.rotation.z = ringTiltRad;
    
    // Add a subtle point light to illuminate the rings 
    const ringLight = new THREE.PointLight(0xffffee, 0.4, planetRadius * 8);
    ringLight.position.set(0, -planetRadius * 2, 0);
    planetGroup.add(ringLight);
    
    planetGroup.add(ringGroup);
    return ringGroup;
}

// Create moons for a planet
function createMoonSystem(planetConfig, planetGroup, planetRadius, textureLoader, scene) {
    const moonSystemGroup = new THREE.Group(); // Group for all moons/orbits of this planet
    moonSystemGroup.userData.parentPlanetName = planetConfig.name; // Identify group
    
    const moonBodies = []; // List of moon bodies to be added to selectable objects

    planetConfig.moons.forEach(moonConfig => {
        // Calculate orbit radius relative to planet display size + scaled distance
        const orbitRadius = planetRadius * 1.5 + (moonConfig.orbitRadiusKm / 100000) * CONSTANTS.MOON_ORBIT_SCALE_FACTOR;

        // Calculate moon display radius relative to planet display size
        let moonRadius = planetRadius * (moonConfig.actualRadius * CONSTANTS.MOON_SIZE_SCALE_FACTOR);
        moonRadius = Math.max(moonRadius, CONSTANTS.MIN_MOON_RADIUS); // Ensure minimum size

        // --- Moon Mesh ---
        const moonGeometry = new THREE.SphereGeometry(moonRadius, CONSTANTS.MOON_SEGMENTS, CONSTANTS.MOON_SEGMENTS / 2);
        
        // HARDCODED: Load the appropriate moon texture based on name
        let moonTexturePath = 'moon.jpg'; // Default to Earth's moon
        if (moonConfig.name === 'Io') {
            moonTexturePath = 'io.jpg';
        } else if (moonConfig.name === 'Europa') {
            moonTexturePath = 'europa.jpg';
        } else if (moonConfig.name === 'Ganymede') {
            moonTexturePath = 'ganymede.jpg';
        } else if (moonConfig.name === 'Callisto') {
            moonTexturePath = 'callisto.jpg';
        } else if (moonConfig.name === 'Titan') {
            moonTexturePath = 'titan.jpg';
        } else if (moonConfig.name === 'Triton') {
            moonTexturePath = 'triton.jpg';
        }
        
        console.log(`Loading moon texture for ${moonConfig.name}: ${moonTexturePath}`);
        const moonTexture = textureLoader.load(moonTexturePath);
        
        // Create a much brighter material with self-illumination
        const moonMaterial = new THREE.MeshStandardMaterial({
            map: moonTexture,
            roughness: 0.3, // Smoother surface to reflect more light
            metalness: 0.1,
            emissive: 0x333333, // Add significant self-illumination
            emissiveIntensity: 0.4, // Strong self-glow
            emissiveMap: moonTexture // Use same texture for emission
        });
        
        const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        moonMesh.castShadow = true;
        moonMesh.receiveShadow = true;

        // --- Moon Atmosphere (e.g., Titan) ---
        if (moonConfig.atmosphere && moonConfig.atmosphere.exists) {
            const atmoGeometry = new THREE.SphereGeometry(
                moonRadius * CONSTANTS.MOON_ATMOSPHERE_SCALE_FACTOR, 
                CONSTANTS.MOON_SEGMENTS, 
                CONSTANTS.MOON_SEGMENTS / 2
            );
            const atmoMaterial = new THREE.MeshBasicMaterial({
                color: moonConfig.atmosphere.color,
                transparent: true,
                opacity: moonConfig.atmosphere.density * CONSTANTS.MOON_ATMOSPHERE_OPACITY_MULTIPLIER * 1.5, // Increased opacity
                side: THREE.BackSide
            });
            const moonAtmosphereMesh = new THREE.Mesh(atmoGeometry, atmoMaterial);
            moonAtmosphereMesh.raycast = () => {}; // Make non-raycastable
            moonMesh.add(moonAtmosphereMesh); // Add atmosphere as child of moon mesh
        }

        // --- Add multiple lights around each moon for better visibility ---
        // Main moon light - fairly bright
        const moonLight = new THREE.PointLight(0xffffff, 1.0, moonRadius * 15);
        moonLight.position.set(0, 0, 0);
        moonMesh.add(moonLight);
        
        // Second light for better exposure - positioned slightly offset
        const moonLight2 = new THREE.PointLight(0xffffee, 0.5, moonRadius * 10);
        moonLight2.position.set(moonRadius * 3, 0, 0);
        moonMesh.add(moonLight2);

        // --- Moon Positioning & Data ---
        const initialAngle = Math.random() * Math.PI * 2; // Random start
        moonMesh.position.set(
            orbitRadius * Math.cos(initialAngle),
            0,
            orbitRadius * Math.sin(initialAngle)
        );

        // Store data in MESH userData
        moonMesh.userData = {
            isSelectable: true,
            name: moonConfig.name,
            type: 'moon',
            parentPlanetName: planetConfig.name,
            config: moonConfig,
            orbitRadius: orbitRadius,
            orbitSpeed: moonConfig.calculatedOrbitSpeed,
            orbitDirection: moonConfig.orbitDirection,
            rotationSpeed: moonConfig.calculatedRotationSpeed,
            rotationDirection: moonConfig.rotationDirection,
            initialAngle: initialAngle,
            currentAngle: initialAngle,
            displayInfo: {
                Size: `${(moonConfig.actualRadius * CONSTANTS.EARTH_RADIUS_KM).toFixed(0)} km radius`,
                Orbit: `${moonConfig.orbitRadiusKm.toLocaleString()} km from ${planetConfig.name}`,
                OrbitalPeriod: `${Math.abs(moonConfig.orbitalPeriod).toFixed(2)} days ${moonConfig.orbitalPeriod < 0 ? '(retrograde)' : ''}`,
                RotationPeriod: `${Math.abs(moonConfig.rotationPeriod).toFixed(2)} days ${moonConfig.rotationPeriod === moonConfig.orbitalPeriod ? '(tidally locked)' : ''}`, // Basic check for tidal lock
                ParentPlanet: planetConfig.name,
                // Include details from moonConfig.info if it exists
                ...(moonConfig.info || {})
            },
            belongsTo: moonConfig.name,
            clickTarget: moonMesh // Self-reference
        };
        
        // Also set object name for easier debugging
        moonMesh.name = moonConfig.name;
        
        moonBodies.push(moonMesh);
        
        // --- Moon Orbit Line --- (Relative to planet center)
        const moonOrbitLine = createOrbitLine(
            orbitRadius, 
            CONSTANTS.ORBIT_LINE_COLOR * 0.8, 
            CONSTANTS.MOON_ORBIT_SEGMENTS,
            moonSystemGroup // Add to moon system group instead of scene
        );
        
        // Ensure non-raycastable
        if (moonOrbitLine) { // Check if line was created
             moonOrbitLine.raycast = () => {};
        }

        // Add moon mesh to the system group
        moonSystemGroup.add(moonMesh);
    });

    // Add the whole system (all moons/orbits for this planet) to the planet's group
    planetGroup.add(moonSystemGroup);
    
    return { 
        moonSystemGroup, 
        moonBodies 
    };
}