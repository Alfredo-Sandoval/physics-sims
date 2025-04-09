// --- Animation Module ---
import * as THREE from 'three';
import * as CONSTANTS from './constants.js';
import { updateCameraFollow } from './controls.js';
import { updateDayCounter } from './ui.js';
import { updateSpacetimeMesh } from './effects.js';

// Add a flag for one-time logging and clock reset
let loggedUpdatePositions = false;
let isFirstCall = true;

// Update positions of planets and moons
export function updatePositions(planets, delta, simulationSpeed) {
    // IMPORTANT FIX: Use a minimum delta to ensure movement even if delta is 0
    const MIN_DELTA = 0.016; // ~60 FPS minimum
    if (delta < MIN_DELTA) delta = MIN_DELTA;
    
    // IMPORTANT FIX: Apply an additional speed multiplier to make movements more visible
    const SPEED_BOOST = 5.0; // Makes movements 5x faster than original values
    
    // Apply both the UI speed and the boost
    const timeFactor = delta * simulationSpeed * SPEED_BOOST;

    // Log values only once
    if (!loggedUpdatePositions) {
        console.log("***** [updatePositions] First Call Detailed Log *****");
        console.log(`  Original Delta: ${delta}`);
        console.log(`  Adjusted Delta: ${delta}`);
        console.log(`  Simulation Speed: ${simulationSpeed}`);
        console.log(`  Speed Boost: ${SPEED_BOOST}`);
        console.log(`  Time Factor: ${timeFactor}`);
        if (planets && planets.length > 0) {
            // Log first planet (Mercury)
            const firstPlanetUserData = planets[0].group?.userData;
            console.log(`  Mercury Orbit Speed: ${firstPlanetUserData?.orbitSpeed} (Type: ${typeof firstPlanetUserData?.orbitSpeed})`);
            console.log(`  Mercury Current Angle: ${firstPlanetUserData?.currentAngle}`);
            
            // Log Earth
            const earth = planets.find(p => p.config?.name === 'Earth');
            const earthUserData = earth?.group?.userData;
            console.log(`  Earth Orbit Speed: ${earthUserData?.orbitSpeed} (Type: ${typeof earthUserData?.orbitSpeed})`);
            console.log(`  Earth Current Angle: ${earthUserData?.currentAngle}`);

            // Log Moon
            const moonMesh = earth?.group?.getObjectByName('Moon'); // Find moon mesh by name
            if (moonMesh) {
                 console.log(`  Moon Orbit Speed: ${moonMesh.userData?.orbitSpeed} (Type: ${typeof moonMesh.userData?.orbitSpeed})`);
                 console.log(`  Moon Current Angle: ${moonMesh.userData?.currentAngle}`);
            } else {
                 console.log("  Moon mesh not found for logging.");
            }
        }
        loggedUpdatePositions = true; // Set flag so we don't log again
    }

    // Update Planets (Groups)
    planets.forEach(planetData => {
        const group = planetData.group;
        const userData = group.userData;
        
        // IMPROVED: Never skip planets (avoid return that would prevent movement)
        const effectiveSpeed = userData.orbitSpeed || 0.01; // Use a small default if undefined or zero

        userData.currentAngle += effectiveSpeed * timeFactor;
        group.position.set(
            userData.orbitRadius * Math.cos(userData.currentAngle),
            0,
            userData.orbitRadius * Math.sin(userData.currentAngle)
        );
    });

    // Update Moons (Meshes within Moon Systems)
    // Find all moon system groups
    const moonGroups = [];
    planets.forEach(planetData => {
        planetData.group.children.forEach(child => {
            if (child instanceof THREE.Group && child.userData.parentPlanetName) {
                moonGroups.push(child);
            }
        });
    });

    // Update each moon in each moon group
    moonGroups.forEach(moonGroup => {
        moonGroup.children.forEach(child => {
            // Identify moon meshes by checking for orbitSpeed in userData
            if (child.isMesh && child.userData.orbitSpeed) {
                const moonMesh = child;
                const userData = moonMesh.userData;

                // IMPROVED: Use a small default if undefined or zero
                const effectiveSpeed = userData.orbitSpeed || 0.01;
                const effectiveDirection = userData.orbitDirection || 1;

                userData.currentAngle += effectiveSpeed * effectiveDirection * timeFactor;
                moonMesh.position.set(
                    userData.orbitRadius * Math.cos(userData.currentAngle),
                    0,
                    userData.orbitRadius * Math.sin(userData.currentAngle)
                );
            }
        });
    });
}

// Update rotations of celestial bodies
export function updateRotations(planets, delta, simulationSpeed) {
    // IMPORTANT FIX: Use a minimum delta and boost rotations too
    const MIN_DELTA = 0.016;
    if (delta < MIN_DELTA) delta = MIN_DELTA;
    
    const ROTATION_BOOST = 2.0; // Less boost for rotations
    const timeFactor = delta * simulationSpeed * ROTATION_BOOST;

    // Rotate Planets (Meshes)
    planets.forEach(planetData => {
        const planetMesh = planetData.mesh;
        const userData = planetData.group.userData; // Get speeds from group data

        // IMPROVED: Use a small default rotation speed
        const effectiveSpeed = userData.rotationSpeed || 0.01;
        const effectiveDirection = userData.rotationDirection || 1;
        
        planetMesh.rotateY(effectiveSpeed * effectiveDirection * timeFactor);

        // Rotate Clouds
        if (planetMesh.userData.cloudMesh) {
            planetMesh.userData.cloudMesh.rotateY(
                effectiveSpeed * effectiveDirection * timeFactor * CONSTANTS.CLOUD_ROTATION_SPEED_MULTIPLIER
            );
        }
    });

    // Find and rotate moons
    planets.forEach(planetData => {
        planetData.group.traverse((child) => {
            // Check for moon meshes
            if (child.isMesh && child.userData.type === 'moon') {
                const moonMesh = child;
                const moonUserData = moonMesh.userData;
                
                // IMPROVED: Use a small default rotation speed
                const effectiveSpeed = moonUserData.rotationSpeed || 0.01;
                const effectiveDirection = moonUserData.rotationDirection || 1;
                
                moonMesh.rotateY(effectiveSpeed * effectiveDirection * timeFactor);
            }
        });
    });
}

// Update simulation time counter
export function updateSimulation(delta, simulationSpeed, simulatedDays) {
    // IMPROVED: Use adjusted delta for time calculation too
    const MIN_DELTA = 0.016;
    if (delta < MIN_DELTA) delta = MIN_DELTA;
    
    // Update simulated days count
    const newDays = simulatedDays + (delta * simulationSpeed * CONSTANTS.DAYS_PER_SIM_SECOND_AT_1X);
    
    // Update UI
    updateDayCounter(Math.floor(newDays));
    
    return newDays;
}

// Main animation loop
export function createAnimationLoop(renderer, scene, camera, controls, clock, planets, cameraTarget, spacetimeMesh) {
    let simulatedDays = 0;
    
    function animate() {
        requestAnimationFrame(animate);
        
        const delta = clock.getDelta();
        const simulationSpeed = 1.0; // This should be passed from outside, hardcoded for now
        
        // Update positions based on orbit speeds
        updatePositions(planets, delta, simulationSpeed);
        
        // Update rotations based on rotation speeds
        updateRotations(planets, delta, simulationSpeed);
        
        // Update simulated time counter
        simulatedDays = updateSimulation(delta, simulationSpeed, simulatedDays);
        
        // Update camera if following an object
        if (cameraTarget) {
            updateCameraFollow(camera, controls, delta, cameraTarget);
        }
        
        // Update spacetime mesh if active
        updateSpacetimeMesh(spacetimeMesh, planets);
        
        // Render the main scene
        renderer.render(scene, camera);
    }
    
    return animate;
}

// Main scene update function - called each frame from main.js
export function updateScene(currentSimulationSpeed) {
    // IMPORTANT FIX: Reset the THREE.Clock on first call to fix delta=0 issue
    if (isFirstCall && window.clock) {
        window.clock.start(); // Reset the clock
        console.log("***** CLOCK RESET ON FIRST CALL *****");
        isFirstCall = false;
    }
    
    console.log("###### Entered updateScene ######");
    
    // Access global variables from main
    const delta = window.clock?.getDelta() || 0.016; // Use minimum if not available
    const planets = window.planets || [];
    
    // Use the passed simulation speed with a minimum
    const simulationSpeed = (currentSimulationSpeed === undefined || currentSimulationSpeed <= 0) ? 
                            1.0 : currentSimulationSpeed;
    
    console.log(`[updateScene] PRE-CALL updatePositions. Delta: ${delta}, SimSpeed: ${simulationSpeed}`);
    
    try {
        // Update positions based on orbit speeds
        updatePositions(planets, delta, simulationSpeed);
    } catch (error) {
        console.error("!!!!!! ERROR DURING updatePositions CALL !!!!!!", error);
    }
    
    console.log(`[updateScene] POST-CALL updatePositions.`);
    
    // Update rotations based on rotation speeds
    updateRotations(planets, delta, simulationSpeed);
    
    // Update simulated time counter and update window reference
    const currentDays = typeof window.simulatedDays === 'number' ? window.simulatedDays : 0;
    const newDays = updateSimulation(delta, simulationSpeed, currentDays);
    
    // Explicitly update the global variable
    window.simulatedDays = newDays;
    
    // Update spacetime mesh if active
    if (window.spacetimeMesh) {
        updateSpacetimeMesh(window.spacetimeMesh, planets);
    }
}