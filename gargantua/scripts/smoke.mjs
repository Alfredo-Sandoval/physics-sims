import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

const files = {
    html: read("index.html"),
    css: read("styles.css"),
    main: read("main.mjs"),
    shaders: read("shaders.mjs"),
    starfield: read("starfield.mjs"),
};

const checks = [];

function check(name, condition) {
    checks.push({ name, passed: Boolean(condition) });
}

const htmlIds = new Set(
    Array.from(files.html.matchAll(/\bid="([^"]+)"/g), ([, id]) => id),
);
const mainDomIds = new Set(
    Array.from(files.main.matchAll(/document\.getElementById\("([^"]+)"\)/g), ([, id]) => id),
);

check(
    "main.mjs only references DOM ids present in index.html",
    Array.from(mainDomIds).every((id) => htmlIds.has(id)),
);
check(
    "HUD toggle has an accessible label",
    /id="hudToggle"[^>]*aria-label="Show controls"/.test(files.html),
);
check(
    "inclination presets expose descriptive labels",
    /data-incl="89.5"[^>]*aria-label="Set edge-on view"/.test(files.html) &&
        /data-incl="86.56"[^>]*aria-label="Recreate the Interstellar shot"/.test(files.html) &&
        /data-incl="12"[^>]*aria-label="Set top-down view"/.test(files.html),
);
check(
    "shader traces geodesics with frame dragging",
    files.shaders.includes("photonAcceleration") &&
        /const float FRAME_DRAG = 4\.0;/.test(files.shaders),
);
const traceShader = files.shaders.slice(
    files.shaders.indexOf("export const fragmentShader"),
    files.shaders.indexOf("export const bloomDownsampleShader"),
);
check(
    "every ray tracer uniform is supplied by main.mjs",
    traceShader.length > 0 && Array.from(traceShader.matchAll(/uniform \w+ (\w+);/g), ([, name]) => name)
        .every((name) => new RegExp(`\\b${name}: \\{ value:`).test(files.main)),
);
check(
    "stale hidden status line is removed",
    !files.html.includes("statusLine") &&
        !files.main.includes("tipbar") &&
        !files.main.includes("updateTipbar"),
);
check(
    "HUD has a short-viewport overflow fallback",
    /\.hud\s*\{[\s\S]*max-height:[^;]+;/.test(files.css) &&
        /\.hud__inner\s*\{[\s\S]*overflow-y:\s*auto;/.test(files.css),
);
check(
    "starfield adapts its texture profile",
    files.starfield.includes("getStarfieldProfile") &&
        files.starfield.includes("deviceMemory") &&
        files.starfield.includes("matchMedia"),
);

const failures = checks.filter((result) => !result.passed);

if (failures.length > 0) {
    console.error("Smoke checks failed:");
    for (const failure of failures) {
        console.error(`- ${failure.name}`);
    }
    process.exit(1);
}

console.log(`Smoke checks passed (${checks.length}/${checks.length}).`);
