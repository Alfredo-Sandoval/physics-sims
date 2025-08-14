# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Physics simulations built with Three.js for 3D visualization and educational purposes. Two main simulations:
1. **Solar System Simulation** (`Solar-System/`) - Interactive planetary system with accurate orbital mechanics
2. **General Relativity Demo** (`general-relativity.html`) - Spacetime deformation visualization

## Development Commands

### Running the Simulations
```bash
# Requires a local web server due to ES6 modules and CORS
# Option 1: Python (if available)
python3 -m http.server 8000
# Then navigate to http://localhost:8000/Solar-System/ or http://localhost:8000/general-relativity.html

# Option 2: Node.js http-server (if installed)
npx http-server
```

### No Build Process
- Vanilla JavaScript with Three.js loaded from CDN
- No npm/yarn dependencies or build steps
- Direct editing of HTML/JS files

## Architecture

### Solar System Simulation (`Solar-System/`)

**Module Structure:**
- `main.js` - Entry point, initialization, global state management
- `sceneSetup.js` - Three.js scene, camera, renderer, controls initialization
- `celestialBodies.js` - Creates planets, moons, sun with textures and orbital groups
- `kepler.js` - Orbital mechanics calculations using Kepler's equations
- `animation.js` - Animation loop, position updates, time management
- `controls.js` - User interaction handling (camera, selection, speed control)
- `ui.js` - UI updates, info panel management, minimap
- `asteroidbelt.js` - Procedural asteroid belt generation
- `starfield.js` - Background star generation
- `utils.js` - Helper functions for celestial body search
- `constants.js` - Configuration values, scale factors, visual parameters

**Data Files:**
- `solarsystem_data.json` - Planetary data (orbital parameters, physical properties, moons)
- `textures/` - NASA-sourced planet/moon textures

**Key Patterns:**
- Global state exposed via `appState` object in main.js
- Three.js objects stored in groups for hierarchical transformations
- Kepler orbital equations for accurate positioning
- Scale factors balance visual appeal with astronomical accuracy

### General Relativity Demo (`general-relativity.html`)

Self-contained single file with:
- Deformable wireframe grid representing spacetime
- Central and orbiting masses causing grid deformation
- Real-time vertex manipulation based on gravitational wells
- OrbitControls for camera interaction

## Three.js Version & Dependencies

- Three.js v0.160.0 loaded from unpkg CDN
- OrbitControls addon for camera management
- anime.js v3.2.1 for UI animations (Solar System only)
- No local package dependencies

## Important Considerations

### Performance
- Asteroid belt limited to 2000 objects for performance
- Planet/moon detail levels optimized (PLANET_SEGMENTS = 32, MOON_SEGMENTS = 16)
- Texture loading with proper callbacks and error handling

### Cross-Origin Restrictions
- Must run via web server (not file://) due to ES6 modules
- Texture paths relative to HTML file location
- Import maps define Three.js module locations

### Scale Management
- Different scale factors for orbits vs display sizes
- Minimum visual sizes ensure small objects remain visible
- Moon scaling separate from planet scaling for proper visual hierarchy

### Coordinate Systems
- Solar System uses Three.js Y-up coordinate system
- Orbital calculations in 2D plane (inclination stored but not applied)
- Positions calculated via Kepler equations then scaled to scene units

## Common Tasks

### Adding a New Celestial Body
1. Add entry to `solarsystem_data.json` with orbital/physical parameters
2. Add texture to `textures/` directory
3. Update `celestialBodies.js` if special handling needed (rings, atmosphere)

### Modifying Visual Parameters
Edit constants in `constants.js`:
- Scale factors: `ORBIT_SCALE_FACTOR`, `PLANET_DISPLAY_SCALE_FACTOR`
- Visual sizes: `MIN_PLANET_RADIUS`, `MIN_MOON_RADIUS`
- Atmosphere/cloud parameters
- Lighting intensities

### Adjusting Orbital Mechanics
- Kepler parameters in `solarsystem_data.json` under each planet's `kepler` object
- Orbital speed via `baseOrbitSpeedFactor`
- Mean motion calculations in `kepler.js`

### UI Modifications
- HTML structure in `index.html` (menu, controls, info panel)
- UI logic in `ui.js` (updating displays, handling interactions)
- CSS styling inline in `index.html`

## Debugging Tips

- Browser console shows texture loading status
- `window.scene`, `window.camera`, `window.controls` available for console debugging
- Animation performance via `clock.getDelta()` in animation loop
- Orbital position verification through Kepler equation outputs

## Future Enhancements (from README)
- Realistic scale toggle
- Additional moons for outer planets
- Asteroid data from NASA/JPL (mpcorb_extended.json referenced but not implemented)
- Comet and spacecraft trajectories
- Educational guided tours