// --- Effects Module ---
import * as THREE from 'three';
import * as CONSTANTS from './constants.js';

// Create a spacetime mesh to visualize gravity wells
export function createSpacetimeMesh(scene) {
    // Create a parametric geometry for the space-time mesh
    const resolution = 100; // Resolution of the mesh
    const size = CONSTANTS.ORBIT_SCALE_FACTOR * 35; // Size of the mesh, covering most planets
    
    const geometry = new THREE.PlaneGeometry(size * 2, size * 2, resolution, resolution);
    
    // Create a custom shader material for the spacetime effect
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            sunPosition: { value: new THREE.Vector3(0, 0, 0) },
            planetPositions: { value: [] }, // Will fill in during render
            planetMasses: { value: [] }     // Will fill in during render
        },
        vertexShader: `
            uniform float time;
            uniform vec3 sunPosition;
            uniform vec3 planetPositions[8]; // For 8 planets
            uniform float planetMasses[8];
            
            varying vec2 vUv;
            varying float vElevation;
            
            float calculateSpacetimeDeformation(vec3 point, vec3 massPos, float mass) {
                float dist = distance(point, massPos);
                return mass / (1.0 + dist * dist * 0.01);
            }
            
            void main() {
                vUv = uv;
                
                // Base position
                vec3 pos = position;
                
                // Calculate deformation from sun (strongest)
                float sunDist = distance(pos, sunPosition);
                float sunDeformation = 200.0 / (1.0 + sunDist * 0.01);
                
                // Add deformation for each planet
                float totalDeformation = sunDeformation;
                for(int i = 0; i < 8; i++) {
                    totalDeformation += calculateSpacetimeDeformation(pos, planetPositions[i], planetMasses[i]);
                }
                
                // Apply deformation to Y coordinate
                pos.y = -totalDeformation;
                vElevation = totalDeformation;
                
                // Final position
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            
            varying vec2 vUv;
            varying float vElevation;
            
            void main() {
                float gridX = abs(fract(vUv.x * 20.0) - 0.5);
                float gridY = abs(fract(vUv.y * 20.0) - 0.5);
                float grid = min(gridX, gridY);
                
                // Map elevation to color
                vec3 baseColor = vec3(0.1, 0.3, 0.8); // Blue base
                vec3 deepColor = vec3(0.8, 0.1, 0.5); // Purple for deep areas
                
                // Normalize elevation for coloring
                float normalizedElevation = clamp(vElevation / 100.0, 0.0, 1.0);
                vec3 color = mix(baseColor, deepColor, normalizedElevation);
                
                // Add grid effect
                grid = 1.0 - smoothstep(0.02, 0.03, grid);
                color = mix(color, vec3(0.9, 0.9, 1.0), grid * 0.3);
                
                // Fade out at edges
                float edge = 1.0 - smoothstep(0.4, 0.5, distance(vUv, vec2(0.5, 0.5)));
                float alpha = edge * 0.5;
                
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    // Create mesh and add to scene
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2; // Rotate to XZ plane
    mesh.position.y = -10; // Slightly below the solar system
    mesh.visible = false; // Hidden by default
    scene.add(mesh);
    
    return mesh;
}

// Update spacetime mesh with planet positions
export function updateSpacetimeMesh(spacetimeMesh, planets) {
    if (!spacetimeMesh || !spacetimeMesh.visible) return;
    
    const planetPositions = [];
    const planetMasses = [];
    
    // Collect planet positions and masses
    planets.forEach(planet => {
        // Use world position
        const worldPos = new THREE.Vector3();
        planet.group.getWorldPosition(worldPos);
        planetPositions.push(worldPos.x, worldPos.y, worldPos.z);
        
        // Use gravity strength as mass indicator
        const mass = planet.config.gravityStrength * 50;
        planetMasses.push(mass);
    });
    
    // Pad arrays to match shader expectations (8 planets * 3 coordinates)
    while (planetPositions.length < 24) {
        planetPositions.push(0, 0, 0);
        planetMasses.push(0);
    }
    
    // Update shader uniforms
    spacetimeMesh.material.uniforms.time.value += 0.01;
    spacetimeMesh.material.uniforms.planetPositions.value = planetPositions;
    spacetimeMesh.material.uniforms.planetMasses.value = planetMasses;
}