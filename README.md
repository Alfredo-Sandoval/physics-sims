# physics-sims

A collection of interactive physics simulations built using HTML, CSS, JavaScript, and Python. Web visualizations primarily leverage the Three.js library for 3D rendering.

## Simulations Included

### 1. General Relativity - Spacetime Deformation (`general-relativity.html`)

* **Description:** Simulates the warping of spacetime (represented by a grid) due to the presence of massive objects (a central "star" and an orbiting "planet").
* **Features:**
  * Deformable wireframe grid representing spacetime.
  * Central and orbiting masses influencing the grid deformation.
  * Adjustable parameters for gravity strength and falloff (within the code).
  * Interactive camera controls.
* **To Run:** Open `general-relativity.html` in your web browser.

### 2. Solar System Simulation (`Solar-System/`)

* **Description:** An interactive model of the Solar System, including the Sun, planets, major moons, and a realistic asteroid belt, with accurate textures and orbital data.
* **Features:**
  * Scaled models of planets and the Sun with realistic textures.
  * Accurate orbital mechanics with adjustable simulation speed.
  * Detailed visualization of planetary features:
    * Planet atmospheres with appropriate colors and densities.
    * Earth clouds with rotation.
    * Saturn's ring system.
  * Major moons for Jupiter, Saturn, and Neptune with proper orbits and rotations.
  * **Asteroid belt generated from real NASA/JPL asteroid orbital data** (see `mpcorb_extended.json`). #TODO
  * Interactive selection system - click on any celestial body to view detailed information.
  * Information panel showing physical properties, composition, and other planetary data.
  * Navigation dropdown to quickly focus the camera on specific planets, moons, or asteroids.
  * Dynamic camera controls with automatic focusing and smooth transitions.
  * Day counter tracking simulated time.
  * Beautiful starfield background with thousands of stars.
  * Enhanced lighting effects for realistic visualization.
* **Technical Details:**
  * Data-driven design with planetary and asteroid information loaded from JSON.
  * Optimized rendering with Three.js for smooth performance.
  * Responsive design that works across different screen sizes.
  * Scaling system that balances visual appeal with astronomical accuracy.
* **To Run:** Open `Solar-System/index.html` in your web browser.

### 3. Black Hole Simulation (Python) (`Black-hole-simulation-using-python/`)

* **Description:** A non‑spinning (Schwarzschild) black hole lensing simulator that distorts an equirectangular sky image by tracing photon geodesics. Includes an optional GUI for generating animations and saving precomputed matrices.
* **Upstream:** https://github.com/Python-simulation/Black-hole-simulation-using-python (mirrored with attribution in `SOURCE.txt`).
* **Dependencies:** `numpy`, `scipy`, `matplotlib`, `pillow` (see `requirements.txt`).
* **To Run:**
  - Create a virtual environment (recommended)
    - macOS/Linux: `python3 -m venv .venv && source .venv/bin/activate`
    - Windows (PowerShell): `py -m venv .venv; .\.venv\Scripts\Activate.ps1`
  - Install deps: `pip install -r requirements.txt`
  - Start: `python black_hole.py`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

* Planet textures sourced from NASA public domain imagery
* Three.js library and examples that provided inspiration for rendering techniques
