# physics-sims

A small collection of interactive physics and astronomy visualizations. The
repo is currently browser-focused and centered on Three.js-based demos with
different levels of complexity, from a single-file experiment to larger
modular apps.

## Projects

### 1. General Relativity Demo (`general-relativity/`)

A standalone Three.js scene that visualizes spacetime curvature as a deforming
grid under a central mass and an orbiting body, now packaged as a more polished
mini demo with live controls and explanatory overlays.

Highlights:

- Deformable wireframe plus shaded curvature surface
- Real-time central and orbiting mass contributions
- Live controls for gravity strength, falloff, orbit radius, and orbit speed
- Interactive camera controls, keyboard shortcuts, and a telemetry panel
- Clear educational framing for what the visualization represents — and what it simplifies

Run it:

```bash
cd /Users/alif/Documents/GitHub/physics-sims
python3 -m http.server 8888
```

Open `http://localhost:8888/general-relativity/`

### 2. Solar System Simulation (`Solar-System/`)

A larger browser simulation of the Solar System with planets, moons, belts,
labels, UI controls, and worker-backed updates.

Highlights:

- Three.js scene with modular runtime code
- Rich camera and playback controls
- Data-driven planet and moon metadata
- Asteroid and Kuiper belt rendering
- Informational side panel plus focus/navigation tools

Run it:

```bash
cd /Users/alif/Documents/GitHub/physics-sims
python3 -m http.server 8888
```

Open `http://localhost:8888/Solar-System/`

See also: `Solar-System/README.md`

### 3. Gargantua Black Hole Renderer (`gargantua/`)

A stylized realtime black hole renderer inspired by _Interstellar_. This is
the active black-hole project in the repo; the older Python prototype has been
retired from the current project surface.

Highlights:

- Realtime fullscreen shader with cinematic accretion-disk styling
- Procedural starfield generation in-browser
- HUD controls for camera distance, elevation, orbit, disk radii, and spin
- Built as a small npm-managed web app with Vite and Three.js

Run it:

```bash
cd /Users/alif/Documents/GitHub/physics-sims/gargantua
npm install
npm run dev
```

Open `http://localhost:5173/`

For a production build:

```bash
npm run build
```

See also: `gargantua/README.md`

## Repo Notes

- There is no single top-level package or unified dev command yet; each demo
  has its own entrypoint and workflow.
- `general-relativity/` and `Solar-System/` are easiest to run from a
  simple static server at the repo root.
- `gargantua/` now uses npm instead of a vendored Three.js runtime.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for
the full text.

## Acknowledgments

- Planet textures sourced from NASA public domain imagery
- Three.js and its examples ecosystem for the rendering foundation
