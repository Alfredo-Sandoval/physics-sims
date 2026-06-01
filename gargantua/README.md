# Gargantua Black Hole

A standalone browser renderer for a stylized black hole inspired by
_Interstellar_. A fullscreen shader ray-marches the warped disk and lensed
starfield in realtime, with a HUD for the camera and disk.

This folder is intentionally **web-only**: an older Python prototype was retired
so the browser demo is the single active implementation. Part of the
[physics-sims](../README.md) collection.

## Quick start

With npm and Vite, for live reload and a production build:

```bash
cd gargantua
npm install
npm run dev      # http://localhost:5173/
```

For a production bundle:

```bash
npm run build    # output in dist/
```

It also runs **without a build step**: the page resolves Three.js through a CDN
import map, so serving the repo root statically works too:

```bash
cd ..            # repo root
python3 -m http.server 8888
```

Then open <http://localhost:8888/gargantua/>. An internet connection is needed
either way, while Three.js loads.

### npm scripts

| Script            | What it does                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Vite dev server with live reload          |
| `npm run build`   | Production bundle into `dist/`            |
| `npm run preview` | Serve the built bundle locally            |
| `npm run check`   | Node smoke checks (`scripts/smoke.mjs`)   |
| `npm test`        | `check` followed by `build`               |

## Controls

Open the gear button to reveal the HUD.

### Sliders

| Control | What it changes                          |
| ------- | ---------------------------------------- |
| Dist    | Camera distance from the black hole      |
| Elev    | Camera elevation angle                   |
| Orbit   | Orbit angle around the black hole        |
| Inner   | Inner radius of the accretion disk       |
| Outer   | Outer radius of the accretion disk       |
| Spin    | Black hole spin parameter                |

The **L / C / R** preset buttons snap the orbit to left, center, and right
views.

### Mouse, touch, and keyboard

- **Drag** (mouse or one finger) — orbit the camera
- **Scroll or pinch** — zoom
- **Space** — toggle disk motion
- **R** — reset the view
- **H** — show or hide the HUD
- **Esc** — close the HUD when it is open

The page starts in still mode so the renderer can idle between interactions, and
disk motion pauses automatically when the tab is hidden.

## What's inside

```text
gargantua/
├── index.html      # shell markup, HUD, and Three.js import map
├── main.mjs        # renderer bootstrap, app state, interaction wiring
├── shaders.mjs     # fullscreen black hole shader source
├── starfield.mjs   # procedural background texture generation
├── styles.css      # HUD and loading-card styling
├── scripts/
│   └── smoke.mjs   # static smoke checks run by npm run check
└── package.json    # dependencies and dev/build scripts
```

## Notes

- The shader is a stylized, Schwarzschild-inspired approximation rather than a
  full Kerr solution; the spin control is artistic, not physically exact.
- The starfield is generated procedurally in the browser, so the page does not
  depend on assets from sibling projects. Small or low-memory devices get a
  lighter starfield profile to reduce startup cost.
- Three.js is installed from npm for the Vite build, and resolved from the same
  CDN import map when the page is served statically.
