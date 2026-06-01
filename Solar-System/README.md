# Solar System Simulation

An interactive 3D Solar System with approximate orbital mechanics,
texture-mapped bodies, asteroid and Kuiper belts, and educational controls.

Part of the [physics-sims](../README.md) collection.

## Run it

The app uses ES modules, fetches its data as JSON, and loads Three.js from a CDN
import map, so it must be served over HTTP rather than opened directly:

```bash
cd physics-sims
python3 -m http.server 8888
```

Open <http://localhost:8888/Solar-System/>. An internet connection is needed the
first time, while Three.js loads.

## Features

- **Planets and moons** — texture-mapped bodies, with atmospheres and cloud
  layers where configured
- **Approximate orbital motion** — planets follow Kepler-style orbital
  parameters; moons use simplified paths and configured rotation periods
- **Asteroid and Kuiper belts** — rendered as point fields, with a worker
  handling the heavy position updates
- **Date picker** — jump the simulation to a chosen calendar date
- **Scale modes** — switch between *Enhanced Visibility* (bodies enlarged so
  they read on screen) and *Relative Sizes*
- **Focus mode** — dim the rest of the scene to highlight a selected body
- **Information panel** — facts about each celestial body
- **Toggleable labels** — planet and moon labels for spatial navigation
- **Time tracking** — a day counter and epoch label show simulation time

## Controls

- **Left-click and drag** — rotate the camera
- **Right-click and drag** — pan
- **Mouse wheel** — zoom in/out
- **Click a body** — select it and open its details
- **Speed slider** — adjust simulation speed (with pause/play and reset)
- **"Go to" dropdowns** — focus a planet, then one of its moons
- **Date picker** — set the simulation date
- **Toggle buttons** — orbit lines, asteroid belt, labels, scale mode,
  focus mode, shadows, and orbital planes
- **Reset Camera** — return to the initial view
- **Top-Down (Ecliptic)** — standardized north-up view (prograde = CCW)

## Technical details

- Built with Three.js (loaded from the unpkg CDN via an import map)
- Modular runtime split across focused ES modules (see below)
- Planet and moon data live in `solarsystem_data.json`, with lightweight
  annotations for placeholder texture reuse
- Belt position updates run in a Web Worker (`simulation-worker.js`) to keep the
  main thread responsive
- Coordinate frame: J2000 ecliptic with +Y as north; prograde orbits appear
  counterclockwise when viewed from +Y

## Project structure

```text
Solar-System/
├── index.html              # markup, import map, control layout
├── main.js                 # app bootstrap and render loop
├── solarsystem_data.json   # planet/moon/belt data (source of truth)
├── celestialBodies.js      # body and orbit construction
├── kepler.js               # orbital element math
├── orbitalRuntime.js       # per-frame orbital state
├── simulation-worker.js    # off-thread belt updates
├── asteroidbelt.js         # main asteroid belt
├── kuiperbelt.js           # Kuiper belt
├── ui.js / controls.js     # HUD, panels, and input handling
├── sceneSetup.js           # camera, lights, renderer wiring
├── starfield.js            # background star field
├── textures/               # body texture maps
└── styles.css              # styling
```

## Tests

A browser smoke test for this app lives in the repo's [tests/](../tests/)
directory. Serve the repo root and open
<http://localhost:8888/tests/index.test.html>; it boots the app in an iframe and
checks rendering, labels, dropdown navigation, and accessibility attributes.

## Future improvements

- Realistic-distance toggle (true orbital spacing, not just body sizes)
- Additional moons for the outer planets
- Comet and spacecraft trajectories
- Guided tours of interesting features

## Credits

- Texture assets are included in the repo; some moon entries intentionally reuse
  placeholder textures until exact assets are added
- [Three.js](https://threejs.org/) for the rendering engine
- Developed by Alif

## License

See the repository [LICENSE](../LICENSE) for details.
