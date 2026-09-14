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
- **Time navigation** — jump immediately to a UTC date, step by one day, return
  to today, or reverse playback; date changes preserve pause/play state
- **Scale modes** — *Enhanced Visibility* enlarges bodies independently;
  *Relative Sizes* uses one common radius scale for the Sun, planets, and moons.
  Orbital spacing still uses a separate scale.
- **Focus mode** — dim the rest of the scene to highlight a selected body
- **Information panel** — three quick measurements, one observation, visible
  texture disclosures, and expandable facts in a fixed dock
- **Toggleable labels** — planet and moon labels for spatial navigation
- **Quiet overview** — a sparse, dim starfield, compact controls, neutral labels
  with selection emphasis, and moon paths shown only for the selected system
- **Repeatable time** — planet positions, moon phases, and spins derive from
  the date; illustrative moon phases and belt layouts are seeded consistently
- **Readable surface rotation** — fixed poles with illustrative surface spin:
  Earth turns about once every 20 seconds at 1×, and Mercury and Venus once
  per minute. Moon rotation remains tied to its orbital clock.
- **Inspection lighting** — a soft light from the viewing direction reveals
  the selected body's surface; labels sit outside the visible globe.
- **Adaptive detail** — distant bodies use simpler geometry; close inspection
  uses finer geometry and up to 2048px textures when the source supports it
- **Idle rendering** — paused scenes redraw for changes, then stop drawing

## Controls

- **Left-click and drag** — rotate the camera
- **Right-click and drag** — pan
- **Mouse wheel** — zoom in/out
- **Click a body or its label** — select it, open details, and frame it once;
  subsequent orbit, zoom, and pan gestures preserve your viewing offset while
  tracking the moving body. Dragging does not select a body.
- **Speed slider** — adjust simulation speed (with pause/play and reset)
- **"Go to" dropdowns** — focus a planet, then one of its moons
- **Forward / Reverse** — change time direction, including while paused
- **−1 day / Today / +1 day** — step or return to the present
- **Date picker** — jump to a date at noon UTC; a new input replaces the last
- **Back to previous view** — restore the prior body, camera position, and tracking
- **Follow selected body** — toggle tracking while retaining selection and camera offset
- **Toggle buttons** — orbit lines, asteroid belt, labels, scale mode,
  focus mode, shadows, and orbital planes
- **Inner system / Whole system** — return to the inner planets or fit all eight
  planetary orbits in view
- **Top-Down (Ecliptic)** — look from ecliptic north (prograde = CCW)
- **Keyboard** — Space pauses/resumes, 0–8 selects a body, R restores the inner
  view, and / or Ctrl/Cmd+K searches bodies and controls

## Technical details

- Built with Three.js (loaded from the unpkg CDN via an import map)
- Modular runtime split across focused ES modules (see below)
- Planet and moon data live in `data/solar-system.json`, with lightweight
  annotations for placeholder texture reuse
- Worker and main-thread planet updates use the same orbital solver
- Moon phases are illustrative, not measured epoch positions; precession uses
  physical radii independently of the display scale
- Orbit and belt updates use separate Web Workers under `src/simulation/workers/`
- Coordinate frame: J2000 ecliptic with +Y as north; prograde orbits appear
  counterclockwise when viewed from +Y

## Project structure

```text
Solar-System/
├── index.html              # markup, import map, file:// help
├── data/solar-system.json  # planet and moon catalog
├── textures/               # body texture assets
├── src/
│   ├── app/                # entry.js, startup/cleanup, one render loop
│   ├── core/               # shared state, configuration, events, viewport
│   ├── simulation/         # catalog loading, orbital math, body updates
│   │   └── workers/        # orbit and belt worker entry points
│   ├── rendering/          # scene, bodies, materials, textures, quality
│   │   └── belts/          # asteroid, Kuiper, and Trojan rendering
│   ├── navigation/         # pointer, keyboard, camera tracking
│   └── ui/                 # controls, labels, body details, telemetry, CSS
└── scripts/smoke.mjs       # data, asset, and module-boundary checks
```

`src/app/entry.js` starts the application. `application.js` owns setup and cleanup;
`renderLoop.js` coordinates each frame. Simulation modules do not import UI or
rendering modules. Keep feature-specific behavior with its owner instead of
adding to a shared utility file. All paths work directly over HTTP; no build step.

## Tests

Run `npm test` inside `Solar-System/` for data, assets, module paths,
dependency-cycle checks, and position comparisons against the bundled Horizons
samples across all eight planets.

A browser smoke test for this app lives in the repo's [tests/](../tests/)
directory. Serve the repo root and open
<http://localhost:8888/tests/index.test.html>; it boots the app in an iframe and
checks rendering, labels, navigation, relative sizes, camera tracking, readouts,
desktop/mobile layout, worker agreement, repeatable date changes, reverse time,
Back/Follow navigation, adaptive detail, idle drawing, and cleanup/restart.
Regression checks cover fixed spin axes, readable rotation, direct worker
comparison against Horizons, labels outside the globe, keyboard access, and
drawer resizing. The runner isolates and restores the saved drawer preference.

From the repository root, run `python3.12 tests/test_ephemeris_properties.py`
with Hypothesis installed (or `uv run --python 3.12 --with hypothesis
tests/test_ephemeris_properties.py`). These generated JSON tests exercise the
JavaScript parser's sample round trip and rejection of missing coordinates.

## Display policy

Planet poles remain fixed while surfaces turn around their local axes. Surface
spin is illustrative: physical periods are slowed 120× relative to orbital
time, with a maximum displayed period of 60 seconds at 1×. A uniform slowdown
without that limit was rejected because Mercury and Venus appeared stationary
for normal viewing sessions. Increasing the entire simulation speed was also
rejected because it makes orbital navigation harder. Date seeking and reverse
playback apply to the same deterministic surface clock.

Selection adds a white inspection light so albedo detail remains visible on
the night side. This is an educational viewing aid, not simulated solar lighting.

## Future improvements

- Realistic-distance toggle (true orbital spacing, not just body sizes)
- Additional moons for the outer planets
- Comet and spacecraft trajectories

## Credits

- Texture assets are included in the repo; some moon entries intentionally reuse
  placeholder textures until exact assets are added
- [Three.js](https://threejs.org/) for the rendering engine
- Developed by Alif

## License

See the repository [LICENSE](../LICENSE) for details.
