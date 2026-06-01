# Interstellar Black Hole

Standalone browser renderer for a stylized black hole inspired by
_Interstellar_. This folder is now intentionally **web-only**: the older
Python prototype has been retired so the browser demo is the single active
implementation.

## Quick Start

Install dependencies and start the local dev server from inside `gargantua/`.

```bash
cd /Users/alif/Documents/GitHub/physics-sims/gargantua
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

For a production bundle:

```bash
npm run build
```

For the local static smoke checks and production build:

```bash
npm test
```

## Controls

- Drag with a mouse or one finger to orbit
- Scroll or pinch to zoom
- `Space` toggles disk motion
- `R` resets the view
- `H` shows or hides the controls

## What’s Inside

- `index.html` - shell markup and module entrypoint
- `styles.css` - HUD and loading-card styling
- `main.mjs` - renderer bootstrap, app state, and interaction wiring
- `shaders.mjs` - fullscreen black hole shader source
- `starfield.mjs` - procedural background texture generation
- `package.json` - npm dependencies and dev/build scripts

## Notes

- The shader is still a stylized Schwarzschild-inspired approximation rather
  than a full Kerr solution.
- The starfield is generated procedurally in the browser, so the page no
  longer depends on assets from sibling projects. Small and low-memory devices
  use a lighter starfield profile to reduce startup cost.
- The page starts in still mode so the renderer can idle between interactions;
  disk motion pauses automatically when the tab is hidden too.
- Three.js is now installed from npm and resolved by Vite instead of being
  vendored into the repo.
