# Spacetime Curvature

A standalone Three.js scene that visualizes gravity as a deforming field
surface. A central mass and an orbiting body each warp a grid, the classic
"rubber sheet" picture of a gravity well, with live controls and a telemetry
readout.

Part of the [physics-sims](../README.md) collection.

## Run it

The demo loads Three.js from a CDN import map, so serve it over HTTP rather than
opening the file directly:

```bash
cd physics-sims
python3 -m http.server 8888
```

Open <http://localhost:8888/general-relativity/>. An internet connection is
needed the first time, while Three.js loads.

## Controls

Open the gear button (top-left) to reveal the HUD.

### Sliders

| Control | What it changes                                               |
| ------- | ------------------------------------------------------------- |
| Mass    | Depth of the central mass's well                              |
| Orb     | Mass of the orbiting body and the dimple it drags around      |
| Fall    | Falloff exponent — how quickly curvature fades with distance  |
| Rad     | Orbit radius of the moving body                               |
| Spd     | Orbital angular speed                                          |
| Time    | Overall time scale for the animation                          |

### Buttons

- **Pause / Play** — freeze or resume the orbit
- **Surf** — show or hide the shaded curvature surface
- **Grid** — show or hide the wireframe grid
- **Reset** — return the camera to its starting view
- **✕** — hide the HUD

### Mouse and keyboard

- **Left-drag** — orbit the camera
- **Right-drag** — pan
- **Scroll** — zoom
- **Space** — play / pause
- **W** — toggle the wireframe grid
- **H** — toggle the HUD

### Telemetry

The lower HUD row reports the orbiting body's current angle and height, the
depth of the central well, and an estimated frame rate.

## What it models (and what it doesn't)

The surface height at each grid point is a summed, softened inverse-power
potential from the central and orbiting masses; the `Fall` slider sets the
exponent. This is a **visualization aid**, not a solution of the Einstein field
equations:

- Heights are an artistic potential, not a metric or true geodesic embedding.
- The orbiting body moves on a fixed circular path; it does not respond
  dynamically to curvature.
- Units are arbitrary ("u"), chosen so the scene reads well on screen.

It is meant to build intuition for how mass shapes a gravity well, not to make
quantitative predictions.

## Files

```text
general-relativity/
├── index.html   # HUD markup and Three.js import map
├── main.mjs     # scene setup, curvature math, controls, animation loop
└── styles.css   # HUD and layout styling
```
