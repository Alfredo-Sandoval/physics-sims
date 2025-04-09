// --- UI Module ---
import * as THREE from 'three';
import * as CONSTANTS from './constants.js';

// DOM element references
let infoPanel, infoName, infoOrbit, infoSize, infoDetailsContainer;
let speedValueSpan, dayCounter, debugInfoElement;
let selectedObject = null;
let originalMaterials = new Map(); // Map<Mesh, Material>
let activeOutlines = new Map(); // Map<Object3D, Mesh> Keep track of active outline meshes
let materials; // Will store materials from constants
let menuContainer, menuToggleBtn; // Add menu references

// Initialize UI elements
export function initUI() {
    // Get references to DOM elements
    infoPanel = document.getElementById('info');
    infoName = document.getElementById('info-name');
    infoOrbit = document.getElementById('info-orbit');
    infoSize = document.getElementById('info-size');
    infoDetailsContainer = document.getElementById('info-details');
    speedValueSpan = document.getElementById('speedValue');
    dayCounter = document.getElementById('dayCounter');
    
    // Get materials from constants
    materials = CONSTANTS.createMaterials();
    
    // Create debug overlay
    createDebugOverlay();
    
    // Initialize menu toggle functionality
    initMenuToggle();
    
    return {
        infoPanel,
        infoName,
        infoOrbit,
        infoSize,
        infoDetailsContainer,
        speedValueSpan,
        dayCounter,
        debugInfoElement
    };
}

// Initialize the collapsible menu
function initMenuToggle() {
    menuContainer = document.getElementById('menuContainer');
    menuToggleBtn = document.getElementById('menuToggle');
    
    // Check if saved state exists in localStorage
    const isCollapsed = localStorage.getItem('menuCollapsed') === 'true';
    
    if (isCollapsed) {
        menuContainer.classList.add('collapsed');
        menuToggleBtn.textContent = '▶';
    } else {
        menuToggleBtn.textContent = '◀';
    }
    
    // Add click event listener to toggle button
    menuToggleBtn.addEventListener('click', () => {
        const isCurrentlyCollapsed = menuContainer.classList.toggle('collapsed');
        menuToggleBtn.textContent = isCurrentlyCollapsed ? '▶' : '◀';
        localStorage.setItem('menuCollapsed', isCurrentlyCollapsed);
    });
}

// Display object info in the info panel
export function displayObjectInfo(object) {
    // Ensure object and its necessary data exist
    if (!object || !object.userData || !object.userData.config) {
        infoPanel.style.display = 'none';
        return;
    }

    const userData = object.userData;
    const config = userData.config; // Config from planet/moon/sun data
    const name = userData.name || 'Unknown';
    const type = userData.type; // 'planet', 'moon', 'star'

    // --- Update Static DOM Elements --- (Name, Orbit, Size)
    infoName.textContent = name;

    let orbitText = '';
    let sizeText = '';
    let infoSource = null; // The object containing key-value pairs for details

    if (type === 'star') {
        infoSource = config.info;
        orbitText = "Center of Solar System";
        sizeText = infoSource.Diameter || `${CONSTANTS.SUN_RADIUS * 2} units`;
    } else if (type === 'planet') {
        infoSource = config.info;
        orbitText = `${config.orbitRadiusAU} AU`;
        sizeText = `${config.actualRadius.toFixed(3)} Earth radii (${(config.actualRadius * CONSTANTS.EARTH_RADIUS_KM).toLocaleString()} km)`;
    } else if (type === 'moon') {
        infoSource = userData.displayInfo || {}; // Use the pre-processed display info
        orbitText = infoSource.Orbit || `${userData.orbitRadius.toFixed(2)} units`;
        sizeText = infoSource.Size || `${userData.config.actualRadius.toFixed(3)} Earth radii`;
    }

    infoOrbit.textContent = orbitText;
    infoSize.textContent = sizeText;

    // --- Update Details Section --- (Dynamic properties)
    // Clear previous details
    infoDetailsContainer.innerHTML = '';

    // Add all info properties except those already shown
    if (infoSource) {
        Object.entries(infoSource).forEach(([key, value]) => {
            // Skip if redundant with already shown fields
            if (key.toLowerCase().includes('orbit') || key.toLowerCase().includes('size') || 
                key.toLowerCase() === 'name' || key.toLowerCase() === 'diameter') {
                return;
            }
            
            const detail = document.createElement('p');
            detail.innerHTML = `<strong>${key}:</strong> ${value}`;
            infoDetailsContainer.appendChild(detail);
        });
    }

    infoPanel.style.display = 'block';
}

// Select an object and highlight it
export function selectObject(object, followWithCamera = false) {
    // Deselect current object first
    deselectObject();
    
    // Store the newly selected object
    selectedObject = object;
    
    // Add highlight effect to the selected object
    if (object) {
        // If the object is a group (like a planet group), highlight the main mesh
        const targetMesh = object.userData.planetMesh || object;
        
        if (targetMesh.isMesh) {
            // Store original material for later restoration
            originalMaterials.set(targetMesh, targetMesh.material);
            
            // Create outline mesh
            const outlineGeometry = targetMesh.geometry.clone();
            const outlineMesh = new THREE.Mesh(
                outlineGeometry, 
                materials.OUTLINE_MATERIAL
            );
            
            // Scale it slightly larger than the original
            outlineMesh.scale.multiplyScalar(CONSTANTS.OUTLINE_SCALE);
            outlineMesh.position.copy(targetMesh.position);
            outlineMesh.rotation.copy(targetMesh.rotation);
            
            // Add to same parent as the target
            targetMesh.parent.add(outlineMesh);
            
            // Store reference to the outline mesh
            activeOutlines.set(object, outlineMesh);
        }
        
        // Show info in the panel
        displayObjectInfo(object);
        
        // Set as camera target if requested
        if (followWithCamera) {
            return { cameraTarget: object };
        }
    }
    
    return { cameraTarget: null };
}

// Deselect the current object
export function deselectObject() {
    if (selectedObject) {
        // Remove highlight effect
        const outlineMesh = activeOutlines.get(selectedObject);
        if (outlineMesh) {
            outlineMesh.parent.remove(outlineMesh);
            activeOutlines.delete(selectedObject);
        }
        
        // Restore original material if needed
        const targetMesh = selectedObject.userData.planetMesh || selectedObject;
        if (targetMesh.isMesh && originalMaterials.has(targetMesh)) {
            targetMesh.material = originalMaterials.get(targetMesh);
            originalMaterials.delete(targetMesh);
        }
        
        // Hide info panel
        if (infoPanel) {
            infoPanel.style.display = 'none';
        }
        
        selectedObject = null;
    }
}

// Create debug overlay UI
export function createDebugOverlay() {
    // Create debug info element
    debugInfoElement = document.createElement('div');
    debugInfoElement.style.position = 'absolute';
    debugInfoElement.style.bottom = '200px';
    debugInfoElement.style.right = '10px';
    debugInfoElement.style.color = 'white';
    debugInfoElement.style.fontFamily = 'monospace';
    debugInfoElement.style.fontSize = '10px';
    debugInfoElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
    debugInfoElement.style.padding = '5px';
    debugInfoElement.style.borderRadius = '3px';
    debugInfoElement.style.maxWidth = '300px';
    debugInfoElement.style.maxHeight = '200px';
    debugInfoElement.style.overflow = 'auto';
    debugInfoElement.style.zIndex = '1000';
    debugInfoElement.style.display = 'none'; // Hidden by default
    document.body.appendChild(debugInfoElement);
    
    // Create a button to toggle debug info
    const debugToggleBtn = document.createElement('button');
    debugToggleBtn.textContent = 'Debug';
    debugToggleBtn.style.position = 'absolute';
    debugToggleBtn.style.bottom = '10px';
    debugToggleBtn.style.right = '200px';
    debugToggleBtn.style.padding = '4px 8px';
    debugToggleBtn.style.backgroundColor = 'rgba(0,0,0,0.7)';
    debugToggleBtn.style.color = 'white';
    debugToggleBtn.style.border = '1px solid #444';
    debugToggleBtn.style.borderRadius = '3px';
    debugToggleBtn.style.cursor = 'pointer';
    debugToggleBtn.style.fontSize = '10px';
    debugToggleBtn.addEventListener('click', () => {
        debugInfoElement.style.display = debugInfoElement.style.display === 'none' ? 'block' : 'none';
    });
    document.body.appendChild(debugToggleBtn);
}

// Update day counter (kept separate for direct updates from animation module)
export function updateDayCounter(days) {
    if (dayCounter) {
        dayCounter.textContent = `Days: ${Math.floor(days)}`;
    }
}

// Update general UI display elements (like speed indicator)
export function updateUIDisplay(simulationSpeed) {
    // Update speed value if it exists
    if (speedValueSpan) {
        speedValueSpan.textContent = `${simulationSpeed.toFixed(1)}x`;
    }
    // Add other UI updates here if needed later
}

// Update debug info display with message
export function updateDebugInfo(msg) {
    if (debugInfoElement) {
        debugInfoElement.innerHTML = msg;
        debugInfoElement.style.display = 'block'; // Show on update
    }
}

// Export references for use in other modules
export function getUIReferences() {
    return {
        infoPanel,
        infoName,
        infoOrbit,
        infoSize,
        infoDetailsContainer,
        speedValueSpan,
        dayCounter,
        debugInfoElement,
        selectedObject
    };
}