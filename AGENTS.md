# Repository Guidelines

## Project Structure & Module Organization
- Root simulations: `general-relativity.html`, `Solar-System/`.
- Solar System modules: `Solar-System/js/` (e.g., `main.js`, `sceneSetup.js`, `controls.js`, `animation.js`, `celestialBodies.js`, `constants.js`, `utils.js`, `starfield.js`).
- Data & assets: `Solar-System/solarsystem_data.json`, `Solar-System/textures/`, `Solar-System/assets/`.
- Docs: root `README.md`, `Solar-System/README.md`.

## Build, Test, and Development Commands
- Run locally (no build step):
  - `python3 -m http.server 8000` (from repo root)
  - Open `http://localhost:8000/general-relativity.html`
  - Open `http://localhost:8000/Solar-System/index.html`
- Note: The Solar System sim fetches JSON and loads textures; use an HTTP server to avoid CORS errors.

## Coding Style & Naming Conventions
- JavaScript ES modules; prefer `const`/`let`, arrow functions where clear.
- Indentation: 2 spaces; include semicolons; single quotes or double quotes consistently per file.
- Filenames: lowerCamel or kebab-like words joined (e.g., `sceneSetup.js`, `celestialBodies.js`).
- Naming: camelCase for variables/functions, PascalCase for Three.js classes/constructors.
- Keep paths relative; avoid hard-coded absolute URLs except pinned CDN in `general-relativity.html`.

## Testing Guidelines
- No automated test runner in this repo. When adding tests:
  - Place simple browser tests under `tests/` as `*.spec.js` plus a `tests/index.test.html` harness.
  - Run via the local server and open `http://localhost:8000/tests/index.test.html`.
  - Validate console output and key interactions (scene init, UI controls, JSON load).

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject (≤72 chars), body for context.
  - Example: `Refactor controls and kepler calculations for stability`.
- PRs: include a clear description, before/after screenshots or short GIFs for UI/visual changes, and link related issues.
- Scope PRs narrowly (one feature/fix). Describe manual test steps (URLs used, what you verified).

## Security & Configuration Tips
- Keep textures small and optimized; do not commit large or proprietary assets.
- If upgrading Three.js (pinned in `general-relativity.html`), test both simulations for regressions.
