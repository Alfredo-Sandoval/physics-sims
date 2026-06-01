# physics-sims

A small collection of interactive, browser-based physics and astronomy
visualizations built on [Three.js](https://threejs.org/). It ranges from a
single-file curvature experiment to a larger modular Solar System app and a
shader-driven black hole renderer.

A launcher at the repo root ties the demos together so you can browse them from
one page.

## The simulations

| #  | Simulation                                          | Focus              | How to run                         |
| -- | --------------------------------------------------- | ------------------ | ---------------------------------- |
| 01 | [Solar System](./Solar-System/)                     | Orbital mechanics  | Static server                      |
| 02 | [Spacetime Curvature](./general-relativity/)        | Curvature field    | Static server                      |
| 03 | [Gargantua Black Hole](./gargantua/)                | Realtime shader    | Static server, or Vite for dev     |

All three pull Three.js from the [unpkg](https://unpkg.com/) CDN through an
import map, so an **internet connection** is needed the first time each scene
loads.

## Quick start

Serve the repo root with any static HTTP server, then open the launcher and pick
a scene:

```bash
cd physics-sims
python3 -m http.server 8888
```

Open <http://localhost:8888/>. Every scene is also reachable directly at its own
path (for example `http://localhost:8888/Solar-System/`).

> A static server is required rather than opening the files directly: the demos
> use ES modules, `fetch` for JSON data, and import maps, which browsers block on
> the `file://` origin.

## Projects

### 1. Solar System (`Solar-System/`)

A modular 3D Solar System with planets, moons, asteroid and Kuiper belts,
clickable bodies, a date picker, and worker-backed orbital updates.

- Kepler-style orbital motion, data-driven from a JSON payload
- Camera follow, top-down ecliptic view, and focus mode
- Relative-size vs. enhanced-visibility scale modes
- Toggleable orbit lines, planet labels, and moon labels
- Information panel with facts about each body

See [Solar-System/README.md](./Solar-System/README.md) for controls and details.

### 2. Spacetime Curvature (`general-relativity/`)

A standalone Three.js scene that visualizes gravity as a deforming field
surface, with a central mass and an orbiting body that each warp the grid.

- Deformable wireframe plus a shaded curvature surface
- Live controls for mass, orbiting mass, falloff, orbit radius, and speed
- Telemetry readout (orbit angle, height, well depth, FPS)
- Keyboard shortcuts for play/pause, grid, and HUD

See [general-relativity/README.md](./general-relativity/README.md) for the full
control reference and a note on what the model simplifies.

### 3. Gargantua Black Hole (`gargantua/`)

A stylized realtime black hole renderer inspired by _Interstellar_, built as a
small npm + Vite app. It also runs straight from the static server above, since
it resolves Three.js through the same CDN import map.

- Fullscreen ray-marched shader with cinematic accretion-disk styling
- Procedural starfield generated in the browser (no external image assets)
- HUD for camera distance, elevation, orbit, disk radii, and spin

Run it with Vite for live reload and a production build:

```bash
cd physics-sims/gargantua
npm install
npm run dev      # http://localhost:5173/
npm run build    # production bundle in dist/
npm test         # smoke checks + build
```

See [gargantua/README.md](./gargantua/README.md) for the controls and project
layout.

## Tests

`tests/` holds an in-browser smoke test that boots the Solar System app inside an
iframe and checks rendering, labels, dropdown navigation, and accessibility
attributes. Run it through the same static server:

```bash
cd physics-sims
python3 -m http.server 8888
```

Open <http://localhost:8888/tests/index.test.html>. Results stream into the page,
and `document.body.dataset.testStatus` is set to `passed` or `failed` for
automation.

Gargantua has its own Node-based smoke check via `npm run check` (see above).

## Repo layout

```text
physics-sims/
├── index.html            # launcher page
├── launcher.css / .js    # launcher styling and animated previews
├── Solar-System/         # modular Solar System app (static)
├── general-relativity/   # spacetime curvature demo (static)
├── gargantua/            # black hole renderer (npm + Vite, or static)
└── tests/                # in-browser smoke test for the Solar System
```

## Notes

- There is no single top-level package or unified dev command. Each demo has its
  own entrypoint; the launcher just links them together.
- `Solar-System/` and `general-relativity/` are easiest to run from a static
  server at the repo root.
- `gargantua/` uses npm and Vite for development, and also works from the static
  server thanks to its CDN import map.

## License

MIT. See [LICENSE](LICENSE) for the full text.

## Acknowledgments

- [Three.js](https://threejs.org/) and its examples ecosystem for the rendering
  foundation
- Texture assets are included in the repo; some Solar System entries reuse
  documented placeholder maps until exact assets are added
