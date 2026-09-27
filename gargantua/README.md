# Gargantua Black Hole

A standalone browser renderer for a spinning black hole that recreates the
Gargantua shot from _Interstellar_. A fullscreen shader traces a light ray backward from the camera
for every pixel, bending it through curved spacetime, so the lensed disk,
photon ring, shadow, and warped starfield come out of the physics rather than
being painted on.

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

Distances are in Schwarzschild radii (r<sub>s</sub>).

| Control | What it changes                                                       |
| ------- | --------------------------------------------------------------------- |
| Dist    | Camera distance from the black hole                                   |
| Incl    | Viewing inclination: 0° looks down the spin axis, 90° is edge-on      |
| Orbit   | Camera azimuth around the spin axis (turns the background sky)        |
| Inner   | Inner disk radius; it cannot go inside the ISCO for the current spin  |
| Outer   | Outer disk radius                                                     |
| Spin    | Dimensionless Kerr spin, 0 to 0.998                                   |
| Real    | 0 matches the film: no Doppler or gravitational shift, evenly lit disk; 1 is physical |
| Temp    | Peak disk temperature, which sets its blackbody color                 |
| FOV     | Vertical field of view; the film look uses a long, narrow lens        |
| Glow    | Bloom plus broad veiling flare, the soft glow of IMAX lenses          |
| Cinema  | 2.39:1 letterbox (landscape screens only), vignette, and film grain   |

The page opens on the film's Gargantua shot, rebuilt from the geometry the
film's effects team published (James, von Tunzelmann, Franklin & Thorne 2015,
_Class. Quantum Grav._ 32 065001, figures 15a and 16): camera at 74.1 M
(37.05 r<sub>s</sub>) and 86.56° inclination, spin 0.6, and a uniform 4500 K
disk with no Doppler or gravitational shift. The lensed far side of the disk
wraps above and below the shadow while the near side cuts across it as a thin
band. Glow imitates the IMAX "veiling flare" the paper describes, and Cinema mode
frames the shot in the film's widescreen letterbox. **Film** returns to that shot, and **Edge / Top** snap the inclination. The readout in the HUD
shows the horizon and ISCO radii for the current spin, plus the render
resolution and how many anti-aliasing samples have accumulated.

### Mouse, touch, and keyboard

- **Drag** (mouse or one finger) — orbit the camera and change inclination
- **Scroll or pinch** — zoom
- **Space** — toggle disk motion
- **R** — return to the film shot
- **C** — toggle Cinema mode
- **H** — show or hide the HUD
- **Esc** — close the HUD when it is open

While the disk is moving or the view is being dragged, the renderer drops its
resolution as far as needed to hold a steady frame rate. While the disk plays,
each jittered frame is blended into the previous ones, which anti-aliases it and
adds a little motion blur along the orbit. Once the view is still, it renders at
full resolution and averages 24 jittered samples, then idles. Disk strands finer
than a pixel fade to their average brightness, so zoomed-out and edge-on views
stay clean instead of breaking into speckle. Disk motion pauses automatically when the tab is
hidden, and starts paused when the system asks for reduced motion.

## What's inside

```text
gargantua/
├── index.html      # shell markup, HUD, and Three.js import map
├── main.mjs        # renderer bootstrap, app state, interaction wiring
├── shaders.mjs     # geodesic ray tracer and display shaders
├── starfield.mjs   # procedural background texture generation
├── styles.css      # HUD and loading-card styling
├── scripts/
│   └── smoke.mjs   # static smoke checks run by npm run check
└── package.json    # dependencies and dev/build scripts
```

## Notes

- Light rays follow exact Schwarzschild null geodesics (integrated with RK4 in
  Cartesian form), plus a weak-field frame-dragging term for spin. That term was
  fitted against exact Kerr equatorial photon orbits and matches the shadow edges
  to within about 2% for spin up to 0.9; it is less accurate at extreme spin and
  away from the equatorial plane. It is not a full Kerr solution.
- The disk is geometrically thin and marginally optically thick, like the film's.
  Its opacity along a ray grows as the ray grazes it, so the thin outer wisps
  glow edge-on but barely show face-on. Its texture is fine strands in the
  co-rotating frame. Orbital speed, redshift, and ISCO use the exact Kerr
  circular-orbit formulas. At Real 1 its temperature follows a Novikov–Thorne
  profile, colored as a blackbody, with brightness scaling as g⁴ with the
  redshift factor g.
- Lowering **Real** fades out the redshift, flattens the temperature to a single
  value, and applies a salmon grade that stands in for the film stock's color
  response. At 0 it matches the film, which left out Doppler beaming so the image
  would read clearly.
- The starfield is generated procedurally in the browser, so the page does not
  depend on assets from sibling projects. Small or low-memory devices get a
  lighter starfield profile to reduce startup cost.
- Three.js is installed from npm for the Vite build, and resolved from the same
  CDN import map when the page is served statically.
