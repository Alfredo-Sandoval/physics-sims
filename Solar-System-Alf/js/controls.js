// --- Controls Module ---
import * as THREE from 'three';
import * as CONSTANTS from './constants.js';
import { findCelestialBodyByName } from './utils.js';
import { selectObject, deselectObject } from './ui.js';

// Mouse interaction variables
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let _lastHit = null; // Store the last hit object for debugging
let _lastIntersects = []; // Store last intersections for debugging

// Camera variables
let cameraTarget = null;
let isManualZoom = false;
let lastCameraDistance = 0;
const cameraOffset = new THREE.Vector3(); // For storing camera offset
const targetPosition = new THREE.Vector3(); // For storing target position

// Setup pointer events for object selection
export function setupPointerEvents(scene, camera, renderer, celestialBodies) {
    // Set up pointer move handler
    renderer.domElement.addEventListener('pointermove', (event) => {
        onPointerMove(event, camera);
    });

    // Set up click handler
    renderer.domElement.addEventListener('click', (event) => {
        onPointerClick(event, scene, camera, celestialBodies);
    });
    
    return { raycaster, pointer };
}

// Handle pointer movement for hover effects
function onPointerMove(event, camera) {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update raycaster with mouse position and camera
    raycaster.setFromCamera(pointer, camera);
    
    // Optional: Implement hover effects here if needed
}

// Handle pointer click for object selection
function onPointerClick(event, scene, camera, celestialBodies) {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update raycaster with mouse position and camera
    raycaster.setFromCamera(pointer, camera);
    
    // Find intersections with selectable objects
    const intersects = raycaster.intersectObjects(celestialBodies, true);
    _lastIntersects = intersects; // Store for debugging
    
    // Process the first intersection
    if (intersects.length > 0) {
        let hitObject = intersects[0].object;
        _lastHit = hitObject; // Store for debugging
        
        // Navigate to the proper parent/target if needed
        if (hitObject.userData && hitObject.userData.clickTarget) {
            hitObject = hitObject.userData.clickTarget;
        }
        
        // Select the object and follow with camera
        const result = selectObject(hitObject, true);
        cameraTarget = result.cameraTarget;
        isManualZoom = false; // Reset zoom flag when selecting via click
    } else {
        // If clicked on empty space, deselect current object
        deselectObject();
        cameraTarget = null;
    }
}

// Setup UI event listeners for controls
export function setupUIControls(planetConfigs, celestialBodies) {
    // 1. Speed Slider
    const speedSlider = document.getElementById('speedSlider');
    const speedValueSpan = document.getElementById('speedValue');
    
    if (speedSlider && speedValueSpan) {
        // Initialize display based on global speed
        simulationSpeed = window.simulationSpeed || 1.0;
        speedSlider.value = simulationSpeed;
        speedValueSpan.textContent = simulationSpeed.toFixed(1) + 'x';
        
        speedSlider.addEventListener('input', () => {
            window.simulationSpeed = parseFloat(speedSlider.value);
            speedValueSpan.textContent = window.simulationSpeed.toFixed(1) + 'x';
        });
    }
    
    // 2. Planet Navigation Dropdown
    const planetNavDropdown = document.getElementById('planetNav');
    if (planetNavDropdown) {
        planetNavDropdown.addEventListener('change', () => {
            const selectedValue = planetNavDropdown.value;
            if (!selectedValue) return;
            
            // Find the object by name
            const targetObj = findCelestialBodyByName(selectedValue, celestialBodies);
            if (targetObj) {
                // Set camera target AND select the object
                const result = selectObject(targetObj, true);
                cameraTarget = result.cameraTarget;
                
                // Reset manual zoom when selecting from dropdown
                isManualZoom = false;
            }
        });
    }
    
    // 3. Spacetime Mesh Toggle
    let isSpacetimeMeshVisible = false;
    let spacetimeMesh = null;
    const toggleMeshBtn = document.getElementById('toggleMeshBtn');
    if (toggleMeshBtn) {
        toggleMeshBtn.addEventListener('click', () => {
            isSpacetimeMeshVisible = !isSpacetimeMeshVisible;
            
            // Return status for main app to handle mesh creation/visibility
            return { isSpacetimeMeshVisible };
        });
    }
    
    // 4. Reset Camera Button
    const resetCameraBtn = document.getElementById('resetCameraBtn');
    if (resetCameraBtn) {
        resetCameraBtn.addEventListener('click', (camera, controls) => {
            // Reset to initial camera position
            camera.position.set(150, 100, 150);
            controls.target.set(0, 0, 0);
            controls.update();
            
            // Reset selection and following
            cameraTarget = null;
            deselectObject();
            isManualZoom = false;
        });
    }
    
    // 5. Toggle Orbit Lines
    let orbitLinesVisible = true;
    const toggleOrbitsBtn = document.getElementById('toggleOrbitsBtn');
    if (toggleOrbitsBtn) {
        toggleOrbitsBtn.addEventListener('click', (scene) => {
            orbitLinesVisible = !orbitLinesVisible;
            // Toggle visibility of all lines
            scene.traverse((object) => {
                if (object.isLine) {
                    object.visible = orbitLinesVisible;
                }
            });
            toggleOrbitsBtn.textContent = orbitLinesVisible ? 
                'Hide Orbit Lines' : 'Show Orbit Lines';
        });
    }
    
    // 6. Playback Controls
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            window.simulationSpeed = 0;
            if (speedSlider) speedSlider.value = 0;
            if (speedValueSpan) speedValueSpan.textContent = '0.0x';
        });
    }
    
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            window.simulationSpeed = 1.0;
            if (speedSlider) speedSlider.value = 1.0;
            if (speedValueSpan) speedValueSpan.textContent = '1.0x';
        });
    }
    
    const slowDownBtn = document.getElementById('slowDownBtn');
    if (slowDownBtn) {
        slowDownBtn.addEventListener('click', () => {
            window.simulationSpeed = Math.max(0.1, (window.simulationSpeed || 1.0) / 2);
            if (speedSlider) speedSlider.value = window.simulationSpeed;
            if (speedValueSpan) speedValueSpan.textContent = window.simulationSpeed.toFixed(1) + 'x';
        });
    }
    
    const speedUpBtn = document.getElementById('speedUpBtn');
    if (speedUpBtn) {
        speedUpBtn.addEventListener('click', () => {
            window.simulationSpeed = Math.min(5.0, (window.simulationSpeed || 1.0) * 2);
            if (speedSlider) speedSlider.value = window.simulationSpeed;
            if (speedValueSpan) speedValueSpan.textContent = window.simulationSpeed.toFixed(1) + 'x';
        });
    }
    
    // 7. Scale Toggle
    let isRealisticScale = false;
    const toggleScaleBtn = document.getElementById('toggleScaleBtn');
    const scaleIndicator = document.getElementById('scaleIndicator');
    if (toggleScaleBtn) {
        toggleScaleBtn.addEventListener('click', () => {
            isRealisticScale = !isRealisticScale;
            toggleScaleBtn.textContent = isRealisticScale ? 
                'Enhanced Visibility Scale' : 'Toggle Realistic Scale';
                
            // Update scale indicator
            if (scaleIndicator) {
                scaleIndicator.textContent = `Scale: ${isRealisticScale ? 'Realistic' : 'Enhanced Visibility'}`;
            }
            
            return { isRealisticScale };
        });
    }
    
    // 8. Detect manual zoom
}

// Setup additional event listeners for detecting manual zoom
export function setupZoomDetection(renderer, controls) {
    // Mouse wheel events to detect manual zooming
    renderer.domElement.addEventListener('wheel', () => {
        isManualZoom = true;
    }, { passive: true });
    
    // When user drags, consider it manual control
    controls.addEventListener('start', () => {
        isManualZoom = true;
    });
}

// Update camera follow behavior
export function updateCameraFollow(camera, controls, delta, cameraTarget) {
    if (!cameraTarget) return;
    
    // Check if user has manually zoomed - if so, don't adjust the distance
    const currentDistance = camera.position.distanceTo(controls.target);
    if (Math.abs(currentDistance - lastCameraDistance) > 0.1) {
        isManualZoom = true; // User has manually changed zoom
    }
    lastCameraDistance = currentDistance;
    
    // Get target world position
    if (cameraTarget.getWorldPosition) {
        cameraTarget.getWorldPosition(targetPosition);
    } else {
        targetPosition.copy(cameraTarget.position);
    }
    
    // Smoothly move camera target (what we orbit around)
    controls.target.lerp(targetPosition, CONSTANTS.CAMERA_FOLLOW_LERP_FACTOR * delta * 10);
    
    // Calculate appropriate camera distance based on object size
    // Only adjust distance if not manually zoomed
    if (!isManualZoom) {
        let targetDistance;
        
        if (cameraTarget.userData.type === 'star') {
            targetDistance = CONSTANTS.SUN_RADIUS * 4;
        } else if (cameraTarget.userData.type === 'planet') {
            // For planets, scale distance by planet size
            const planetRadius = cameraTarget.userData.planetMesh?.geometry?.parameters?.radius || 5;
            targetDistance = planetRadius * 5; // 5x the planet radius
        } else if (cameraTarget.userData.type === 'moon') {
            // For moons, use a smaller multiplier
            const moonRadius = cameraTarget.geometry?.parameters?.radius || 1;
            targetDistance = moonRadius * 8; // 8x the moon radius
        } else {
            targetDistance = 20; // Default distance
        }
        
        // Calculate current offset vector
        cameraOffset.copy(camera.position).sub(controls.target);
        
        // Normalize and scale to target distance
        cameraOffset.normalize().multiplyScalar(targetDistance);
        
        // Smoothly move camera to target position + offset
        const newPosition = targetPosition.clone().add(cameraOffset);
        camera.position.lerp(newPosition, CONSTANTS.CAMERA_FOLLOW_LERP_FACTOR * delta * 5);
    }
    
    controls.update();
}

// Get the current camera target
export function getCameraTarget() {
    return cameraTarget;
}

// Set the camera target
export function setCameraTarget(target) {
    cameraTarget = target;

    console.log("Camera target set to:", target);
}