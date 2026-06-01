# Solar System Simulation

An interactive 3D solar system simulation with approximate orbital mechanics,
texture-mapped bodies, and educational controls.

## Features

- **Planet Rendering**: Planets use included texture maps, with atmospheres and cloud layers where configured
- **Approximate Orbital Motion**: Planets use Kepler-style orbital parameters, while moons use simplified paths and configured rotation periods
- **Interactive Controls**:
  - Speed adjustment (pause, play, speed up/slow down)
  - Camera controls (follow planets/moons, reset view)
  - Toggle orbit lines visibility
  - Planet/moon selection via dropdown or direct click
- **Educational Information**: Detailed information panel with facts about each celestial body
- **Labels**: Toggleable planet and moon labels help with spatial navigation
- **Time Tracking**: Day counter shows progression of simulation time
- **Performance Optimized**: Smooth rendering even with detailed planet/moon systems
- **Responsive Design**: Adapts to different screen sizes

## Controls

- **Left-click and drag**: Rotate camera
- **Right-click and drag**: Pan camera
- **Mouse wheel**: Zoom in/out
- **Click on celestial body**: Select and display information
- **Speed slider**: Adjust simulation speed
- **"Go to" dropdowns**: Select a planet or moon to focus on
- **Toggle buttons**: Control visibility of orbit lines
- **Reset Camera**: Return to initial view
- **Top-Down (Ecliptic)**: Standardized north-up view (prograde = CCW)

## Technical Details

- Built with Three.js for 3D rendering
- Planet and moon data stored in JSON format, with lightweight annotations for placeholder texture reuse
- Dynamic scaling system to represent relative sizes of celestial bodies
- Physical parameters and orbital elements are data-driven from the JSON payload
- Coordinate frame: J2000 ecliptic with +Y as north; prograde orbits appear counterclockwise when viewed from +Y

## Development

This project is part of a broader collection of physics simulations. Contributions and feedback are welcome!

### Local run

Serve the repo root with a static HTTP server so JSON, module imports, and
textures load without browser file-origin restrictions:

```bash
cd physics-sims
python3 -m http.server 8888
```

Open `http://localhost:8888/Solar-System/`.

### Future Improvements

- Realistic scale toggle to show actual planetary sizes and distances
- Additional moons for outer planets
- Comet and spacecraft trajectories
- Educational guided tours of interesting features

## Credits

- Texture assets are included in the repo; some moon entries intentionally reuse placeholder textures until exact assets are added
- Three.js for 3D rendering engine
- Developed by Alif

## License

See LICENSE file for details.
