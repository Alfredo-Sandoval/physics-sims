// --- Starfield Module ---
import * as THREE from 'three';
import * as CONSTANTS from './constants.js';
import { createStarTexture } from './utils.js';

// Create the starfield with a large number of stars
export function createStarfield(scene) {
    const vertices = [];
    const colors = [];
    const sizes = [];
    const color = new THREE.Color();
    const starTexture = createStarTexture(); // Create the texture once

    // Generate main starfield
    for (let i = 0; i < CONSTANTS.STAR_COUNT; i++) {
        const vertex = new THREE.Vector3();
        // Distribute stars spherically
        const phi = Math.acos(-1 + (2 * i) / CONSTANTS.STAR_COUNT);
        const theta = Math.sqrt(CONSTANTS.STAR_COUNT * Math.PI) * phi;
        const radius = Math.cbrt(Math.random()) * CONSTANTS.STARFIELD_RADIUS; // Cube root for more uniform spatial distribution

        vertex.setFromSphericalCoords(radius, phi, theta);
        vertices.push(vertex.x, vertex.y, vertex.z);

        // Vary color slightly (brightness)
        const brightness = THREE.MathUtils.randFloat(0.8, 1.0); // Increased minimum brightness
        
        // Add a slight color tint for variety
        const colorHue = Math.random() > 0.7 ? THREE.MathUtils.randFloat(0.5, 0.7) : 0; // Some stars slightly blue/yellow
        const colorSat = Math.random() > 0.8 ? THREE.MathUtils.randFloat(0.1, 0.3) : 0; // Low saturation for color
        color.setHSL(colorHue, colorSat, brightness);
        
        colors.push(color.r, color.g, color.b);

        // Vary size - increase the size range for more visible stars
        sizes.push(CONSTANTS.STAR_BASE_SIZE * THREE.MathUtils.randFloat(
            CONSTANTS.STAR_MIN_SIZE_FACTOR, 
            CONSTANTS.STAR_MAX_SIZE_FACTOR * 1.5
        ));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        map: starTexture,
        size: CONSTANTS.STAR_BASE_SIZE * 2, // Double the base size
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        depthWrite: false, // Avoid stars hiding each other incorrectly
        blending: THREE.AdditiveBlending // Use additive blending for brighter stars
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
    
    // Add a second layer of fewer, brighter stars
    createBrightStars(scene, starTexture);
    
    return stars;
}

// Create a second layer of brighter stars
function createBrightStars(scene, starTexture) {
    const brightStarCount = CONSTANTS.STAR_COUNT / 10;
    const brightVertices = [];
    const brightColors = [];
    const brightSizes = [];
    const color = new THREE.Color();
    
    for (let i = 0; i < brightStarCount; i++) {
        const vertex = new THREE.Vector3();
        const phi = Math.acos(-1 + (2 * i) / brightStarCount);
        const theta = Math.sqrt(brightStarCount * Math.PI) * phi;
        const radius = Math.cbrt(Math.random()) * CONSTANTS.STARFIELD_RADIUS * 0.8; // Slightly closer

        vertex.setFromSphericalCoords(radius, phi, theta);
        brightVertices.push(vertex.x, vertex.y, vertex.z);

        // Brighter stars
        const brightness = THREE.MathUtils.randFloat(0.9, 1.0);
        color.setHSL(0, 0, brightness);
        brightColors.push(color.r, color.g, color.b);

        // Larger stars
        brightSizes.push(CONSTANTS.STAR_BASE_SIZE * THREE.MathUtils.randFloat(2, 3.5));
    }

    const brightGeometry = new THREE.BufferGeometry();
    brightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(brightVertices, 3));
    brightGeometry.setAttribute('color', new THREE.Float32BufferAttribute(brightColors, 3));
    brightGeometry.setAttribute('size', new THREE.Float32BufferAttribute(brightSizes, 1));

    const brightMaterial = new THREE.PointsMaterial({
        map: starTexture,
        size: CONSTANTS.STAR_BASE_SIZE * 3,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const brightStars = new THREE.Points(brightGeometry, brightMaterial);
    scene.add(brightStars);
    
    return brightStars;
}