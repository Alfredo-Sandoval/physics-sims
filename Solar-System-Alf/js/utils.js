// --- Utility Functions ---
import * as THREE from 'three';

// Find celestial body by name in a list
export function findCelestialBodyByName(name, celestialBodies) {
    for (const body of celestialBodies) {
        if ((body.userData && body.userData.name === name) || body.name === name) {
            return body;
        }
    }
    return null;
}

// Create a star texture for the starfield
export function createStarTexture() {
    console.log("Creating star texture..."); // Add log
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    
    // Make the center brighter and more defined with a sharper falloff
    gradient.addColorStop(0, 'rgba(255,255,255,1.0)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(0.65, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true; // Ensure texture uploads
    return texture;
}

// Create a material for planets with proper texture mapping
export function createPlanetMaterial(textureUrl, textureLoader) {
    // HARDCODED DIRECT TEXTURE LOADING:
    // Instead of using the passed textureUrl, determine which texture to load based on the name in the URL
    let actualTexturePath = textureUrl;
    
    // Extract just the filename without path
    const fileName = textureUrl.split('/').pop();
    
    // Map the texture regardless of where it's coming from
    if (fileName.includes('sun')) {
        actualTexturePath = 'sun.jpg';
    } else if (fileName.includes('mercury')) {
        actualTexturePath = 'mercury.jpg';
    } else if (fileName.includes('venus')) {
        actualTexturePath = 'venus.jpg';
    } else if (fileName.includes('earth') && fileName.includes('clouds')) {
        actualTexturePath = 'earth_clouds.jpg';
    } else if (fileName.includes('earth') && fileName.includes('night')) {
        actualTexturePath = 'earth_night.jpg';
    } else if (fileName.includes('earth')) {
        actualTexturePath = 'earth.jpg';
    } else if (fileName.includes('moon')) {
        actualTexturePath = 'moon.jpg';
    } else if (fileName.includes('mars')) {
        actualTexturePath = 'mars.jpg';
    } else if (fileName.includes('jupiter')) {
        actualTexturePath = 'jupiter.jpg';
    } else if (fileName.includes('io')) {
        actualTexturePath = 'io.jpg';
    } else if (fileName.includes('europa')) {
        actualTexturePath = 'europa.jpg';
    } else if (fileName.includes('ganymede')) {
        actualTexturePath = 'ganymede.jpg';
    } else if (fileName.includes('callisto')) {
        actualTexturePath = 'callisto.jpg';
    } else if (fileName.includes('saturn_ring')) {
        actualTexturePath = 'saturn_ring.png';
    } else if (fileName.includes('saturn')) {
        actualTexturePath = 'saturn.jpg';
    } else if (fileName.includes('titan')) {
        actualTexturePath = 'titan.jpg';
    } else if (fileName.includes('uranus')) {
        actualTexturePath = 'uranus.jpg';
    } else if (fileName.includes('neptune')) {
        actualTexturePath = 'neptune.jpg';
    } else if (fileName.includes('triton')) {
        actualTexturePath = 'triton.jpg';
    }
    
    console.log(`Loading texture: ${textureUrl} -> ${actualTexturePath}`);
    
    const texture = textureLoader.load(
        actualTexturePath, 
        (loadedTexture) => {
            // Apply proper encoding and settings once loaded
            loadedTexture.colorSpace = THREE.SRGBColorSpace;
            loadedTexture.needsUpdate = true;
            console.log(`✓ Successfully loaded texture: ${actualTexturePath}`);
        },
        undefined, 
        (err) => console.error(`❌ Error loading texture: ${actualTexturePath}`, err)
    );
    
    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.7,
        metalness: 0.1,
    });
}

// Create an orbit line at specified radius
export function createOrbitLine(radius, color, segments, scene) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(
            radius * Math.cos(theta),
            0,
            radius * Math.sin(theta)
        ));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.4 // Slightly dimmer orbits
    });
    const line = new THREE.Line(geometry, material);
    scene.add(line); // Add directly to scene
    return line;
}