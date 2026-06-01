import * as THREE from "three";

import { vertexShader, fragmentShader } from "./shaders.mjs";
import { createStarfieldTexture } from "./starfield.mjs";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const DEFAULTS = {
    cameraDistance: 18.0,
    cameraAngle: 82.0,
    cameraPhi: 0.0,
    diskInner: 3.8,
    diskOuter: 10.5,
    spin: 0.55,
    animationEnabled: !prefersReducedMotion.matches,
};
const LIMITS = {
    cameraDistanceMin: 8.0,
    cameraDistanceMax: 32.0,
    cameraAngleMin: 20.0,
    cameraAngleMax: 90.0,
    cameraPhiMin: -72.0,
    cameraPhiMax: 72.0,
};

const state = { ...DEFAULTS };
const ui = {
    loading: document.getElementById("loading"),
    loadingMessage: document.getElementById("loadingMessage"),
    hud: document.getElementById("hud"),
    ranges: {
        distance: document.getElementById("distance"),
        angle: document.getElementById("angle"),
        phi: document.getElementById("phi"),
        rin: document.getElementById("rin"),
        rout: document.getElementById("rout"),
        spin: document.getElementById("spin"),
    },
    values: {
        distance: document.getElementById("distVal"),
        angle: document.getElementById("angleVal"),
        phi: document.getElementById("phiVal"),
        rin: document.getElementById("rinVal"),
        rout: document.getElementById("routVal"),
        spin: document.getElementById("spinVal"),
    },
    viewPresets: Array.from(document.querySelectorAll("[data-view]")),
    hudToggle: document.getElementById("hudToggle"),
    hudClose: document.getElementById("hudClose"),
    toggleMotion: document.getElementById("toggleMotion"),
    resetView: document.getElementById("resetView"),
};

function getHudFocusables() {
    return Array.from(ui.hud.querySelectorAll("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])"));
}

let renderer;
let scene;
let camera;
let material;
let frameHandle = 0;
let lastFrameTime = 0;
const drawSize = new THREE.Vector2();
const activePointers = new Map();
const DRAG_THRESHOLD_PX = 6;
let pinchDistance = null;
let hudOpen = false;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function formatOrbitOffset(value) {
    const rounded = Math.round(value);
    if (rounded === 0) {
        return "0°";
    }
    return `${rounded > 0 ? "+" : ""}${rounded}°`;
}

function syncHud() {
    ui.hud.classList.toggle("is-open", hudOpen);
    ui.hud.setAttribute("aria-hidden", String(!hudOpen));
    ui.hud.toggleAttribute("inert", !hudOpen);
    ui.hudToggle.dataset.open = String(hudOpen);
    ui.hudToggle.setAttribute("aria-expanded", String(hudOpen));
    ui.hudToggle.setAttribute("aria-label", hudOpen ? "Hide controls" : "Show controls");
    ui.hudToggle.textContent = hudOpen ? "\u2715" : "\u2699";

    if (hudOpen) {
        const [firstFocusable] = getHudFocusables();
        window.requestAnimationFrame(() => {
            firstFocusable?.focus();
        });
        return;
    }

    if (document.activeElement instanceof HTMLElement && ui.hud.contains(document.activeElement)) {
        ui.hudToggle.focus();
    }
}

function toggleHud(forceState) {
    hudOpen = typeof forceState === "boolean" ? forceState : !hudOpen;
    syncHud();
}

function syncDistanceControl() {
    ui.ranges.distance.value = String(state.cameraDistance);
    ui.values.distance.textContent = state.cameraDistance.toFixed(1);
}

function syncAngleControl() {
    ui.ranges.angle.value = String(state.cameraAngle);
    ui.values.angle.textContent = `${state.cameraAngle.toFixed(1)}°`;
}

function syncOrbitControl() {
    ui.ranges.phi.value = String(state.cameraPhi);
    ui.values.phi.textContent = formatOrbitOffset(state.cameraPhi);

    ui.viewPresets.forEach((button) => {
        const target = parseFloat(button.dataset.view);
        const isActive = Math.abs(state.cameraPhi - target) < 1.5;
        button.dataset.active = String(isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function syncDiskControls() {
    ui.ranges.rin.value = String(state.diskInner);
    ui.ranges.rout.value = String(state.diskOuter);
    ui.ranges.spin.value = String(state.spin);

    ui.values.rin.textContent = state.diskInner.toFixed(1);
    ui.values.rout.textContent = state.diskOuter.toFixed(1);
    ui.values.spin.textContent = state.spin.toFixed(2);
}

function syncMotionControl() {
    ui.toggleMotion.dataset.active = String(state.animationEnabled);
    ui.toggleMotion.setAttribute("aria-pressed", String(state.animationEnabled));
    ui.toggleMotion.textContent = state.animationEnabled ? "Pause" : "Play";
}

function syncControls() {
    syncDistanceControl();
    syncAngleControl();
    syncOrbitControl();
    syncDiskControls();
    syncMotionControl();
}

function sanitizeDiskRadii(changedKey) {
    if (state.diskInner > state.diskOuter - 0.5) {
        if (changedKey === "diskInner") {
            state.diskOuter = clamp(state.diskInner + 0.5, 8.0, 25.0);
        } else {
            state.diskInner = clamp(state.diskOuter - 0.5, 1.5, 6.0);
        }
    }
}

function updatePixelRatio() {
    const deviceRatio = window.devicePixelRatio || 1;
    const cap = state.animationEnabled ? 1.35 : 1.65;
    renderer.setPixelRatio(Math.min(deviceRatio, cap));
}

function updateResolution() {
    renderer.getDrawingBufferSize(drawSize);
    material.uniforms.resolution.value.copy(drawSize);
}

function updateUniforms() {
    material.uniforms.cameraDistance.value = state.cameraDistance;
    material.uniforms.cameraAngle.value = state.cameraAngle;
    material.uniforms.cameraPhi.value = state.cameraPhi;
    material.uniforms.diskInner.value = state.diskInner;
    material.uniforms.diskOuter.value = state.diskOuter;
    material.uniforms.spin.value = state.spin;
    scheduleRender();
}

function rotateBy(deltaX, deltaY) {
    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);
    state.cameraPhi = clamp(
        state.cameraPhi + (deltaX / width) * 84.0,
        LIMITS.cameraPhiMin,
        LIMITS.cameraPhiMax,
    );
    state.cameraAngle = clamp(
        state.cameraAngle - (deltaY / height) * 70.0,
        LIMITS.cameraAngleMin,
        LIMITS.cameraAngleMax,
    );
    syncAngleControl();
    syncOrbitControl();
    updateUniforms();
}

function zoomBy(delta, mode = "wheel") {
    const zoomRate = mode === "pinch" ? 0.005 : 0.0015;
    const zoomFactor = Math.exp(delta * zoomRate);
    state.cameraDistance = clamp(
        state.cameraDistance * zoomFactor,
        LIMITS.cameraDistanceMin,
        LIMITS.cameraDistanceMax,
    );
    syncDistanceControl();
    updateUniforms();
}

function scheduleRender() {
    if (frameHandle !== 0) {
        return;
    }
    frameHandle = window.requestAnimationFrame(renderFrame);
}

function renderFrame(timestamp) {
    frameHandle = 0;
    if (!renderer || !material) {
        return;
    }

    if (lastFrameTime === 0) {
        lastFrameTime = timestamp;
    }

    const delta = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
    lastFrameTime = timestamp;

    if (state.animationEnabled && !document.hidden) {
        material.uniforms.time.value += delta;
    }

    renderer.render(scene, camera);

    if (state.animationEnabled && !document.hidden) {
        scheduleRender();
    }
}

function toggleMotion(forceState) {
    state.animationEnabled = typeof forceState === "boolean" ? forceState : !state.animationEnabled;
    updatePixelRatio();
    syncControls();
    lastFrameTime = 0;
    scheduleRender();
}

function resetView() {
    state.cameraDistance = DEFAULTS.cameraDistance;
    state.cameraAngle = DEFAULTS.cameraAngle;
    state.cameraPhi = DEFAULTS.cameraPhi;
    state.diskInner = DEFAULTS.diskInner;
    state.diskOuter = DEFAULTS.diskOuter;
    state.spin = DEFAULTS.spin;
    pinchDistance = null;
    activePointers.clear();
    renderer.domElement.style.cursor = "grab";
    syncControls();
    updateUniforms();
}

function bindControls() {
    ui.ranges.distance.addEventListener("input", (event) => {
        state.cameraDistance = clamp(
            parseFloat(event.target.value),
            LIMITS.cameraDistanceMin,
            LIMITS.cameraDistanceMax,
        );
        syncControls();
        updateUniforms();
    });

    ui.ranges.angle.addEventListener("input", (event) => {
        state.cameraAngle = clamp(
            parseFloat(event.target.value),
            LIMITS.cameraAngleMin,
            LIMITS.cameraAngleMax,
        );
        syncControls();
        updateUniforms();
    });

    ui.ranges.phi.addEventListener("input", (event) => {
        state.cameraPhi = clamp(
            parseFloat(event.target.value),
            LIMITS.cameraPhiMin,
            LIMITS.cameraPhiMax,
        );
        syncControls();
        updateUniforms();
    });

    ui.ranges.rin.addEventListener("input", (event) => {
        state.diskInner = parseFloat(event.target.value);
        sanitizeDiskRadii("diskInner");
        syncControls();
        updateUniforms();
    });

    ui.ranges.rout.addEventListener("input", (event) => {
        state.diskOuter = parseFloat(event.target.value);
        sanitizeDiskRadii("diskOuter");
        syncControls();
        updateUniforms();
    });

    ui.ranges.spin.addEventListener("input", (event) => {
        state.spin = parseFloat(event.target.value);
        syncControls();
        updateUniforms();
    });

    ui.toggleMotion.addEventListener("click", () => {
        toggleMotion();
    });

    ui.resetView.addEventListener("click", () => {
        resetView();
    });

    ui.hudToggle.addEventListener("click", () => {
        toggleHud();
    });

    ui.hudClose.addEventListener("click", () => {
        toggleHud(false);
    });

    ui.viewPresets.forEach((button) => {
        button.addEventListener("click", () => {
            state.cameraPhi = clamp(
                parseFloat(button.dataset.view),
                LIMITS.cameraPhiMin,
                LIMITS.cameraPhiMax,
            );
            syncOrbitControl();
            updateUniforms();
        });
    });
}

function currentPinchDistance() {
    const [a, b] = Array.from(activePointers.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function resetPointerOrigin(pointerId) {
    const pointer = activePointers.get(pointerId);
    if (!pointer) {
        return;
    }

    activePointers.set(pointerId, {
        ...pointer,
        startX: pointer.x,
        startY: pointer.y,
        isDragging: false,
    });
}

function bindViewportInteractions() {
    const canvas = renderer.domElement;
    canvas.style.cursor = "grab";

    const releasePointer = (pointerId) => {
        if (activePointers.has(pointerId)) {
            activePointers.delete(pointerId);
        }
        if (activePointers.size < 2) {
            pinchDistance = null;
        }
        if (activePointers.size === 1) {
            const [remainingPointerId] = activePointers.keys();
            resetPointerOrigin(remainingPointerId);
            canvas.style.cursor = "grab";
            return;
        }
        if (activePointers.size === 0) {
            canvas.style.cursor = "grab";
        }
    };

    canvas.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }

        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        activePointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
            isDragging: false,
        });
        if (activePointers.size === 2) {
            pinchDistance = currentPinchDistance();
            canvas.style.cursor = "grabbing";
        } else if (event.pointerType === "mouse") {
            canvas.style.cursor = "grab";
        }
    });

    canvas.addEventListener("pointermove", (event) => {
        const previous = activePointers.get(event.pointerId);
        if (!previous) {
            return;
        }

        if (event.pointerType === "mouse" && (event.buttons & 1) === 0) {
            releasePointer(event.pointerId);
            return;
        }

        const nextPointer = {
            ...previous,
            x: event.clientX,
            y: event.clientY,
        };
        activePointers.set(event.pointerId, nextPointer);

        if (activePointers.size === 1) {
            const distanceFromPress = Math.hypot(
                nextPointer.x - nextPointer.startX,
                nextPointer.y - nextPointer.startY,
            );

            if (!previous.isDragging && distanceFromPress < DRAG_THRESHOLD_PX) {
                return;
            }

            if (!previous.isDragging) {
                nextPointer.isDragging = true;
                activePointers.set(event.pointerId, nextPointer);
            }

            canvas.style.cursor = "grabbing";
            rotateBy(nextPointer.x - previous.x, nextPointer.y - previous.y);
            return;
        }

        if (activePointers.size === 2) {
            canvas.style.cursor = "grabbing";
            const nextDistance = currentPinchDistance();
            if (pinchDistance !== null) {
                const delta = pinchDistance - nextDistance;
                zoomBy(delta, "pinch");
            }
            pinchDistance = nextDistance;
        }
    });

    const endPointer = (event) => {
        releasePointer(event.pointerId);
    };

    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("lostpointercapture", endPointer);

    canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        zoomBy(event.deltaY, "wheel");
    }, { passive: false });
}

function bindGlobalEvents() {
    window.addEventListener("resize", () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        updatePixelRatio();
        updateResolution();
        scheduleRender();
    });

    document.addEventListener("visibilitychange", () => {
        lastFrameTime = 0;
        if (!document.hidden && state.animationEnabled) {
            scheduleRender();
        }
    });

    window.addEventListener("keydown", (event) => {
        const target = event.target;
        const isInteractive = target instanceof HTMLElement &&
            (target.tagName === "INPUT" || target.tagName === "BUTTON");
        if (isInteractive) {
            return;
        }

        if (event.code === "Space") {
            event.preventDefault();
            toggleMotion();
        }

        if (event.key === "r" || event.key === "R") {
            event.preventDefault();
            resetView();
        }

        if (event.key === "h" || event.key === "H") {
            event.preventDefault();
            toggleHud();
        }

        if (event.key === "Escape" && hudOpen) {
            event.preventDefault();
            toggleHud(false);
        }
    });

    if (typeof prefersReducedMotion.addEventListener === "function") {
        prefersReducedMotion.addEventListener("change", (event) => {
            if (event.matches && state.animationEnabled) {
                toggleMotion(false);
            }
        });
    }
}

async function init() {
    ui.loadingMessage.textContent = "Initializing renderer.";

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(window.innerWidth, window.innerHeight);
    updatePixelRatio();
    document.getElementById("viewport").appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geometry = new THREE.PlaneGeometry(2, 2);
    material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            time: { value: 0 },
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            cameraDistance: { value: state.cameraDistance },
            cameraAngle: { value: state.cameraAngle },
            cameraPhi: { value: state.cameraPhi },
            diskInner: { value: state.diskInner },
            diskOuter: { value: state.diskOuter },
            spin: { value: state.spin },
            starfield: { value: createStarfieldTexture() },
        },
    });

    scene.add(new THREE.Mesh(geometry, material));
    updateResolution();
    bindControls();
    bindViewportInteractions();
    bindGlobalEvents();
    syncControls();
    syncHud();

    ui.loading.style.display = "none";
    scheduleRender();
}

init().catch((error) => {
    console.error("Failed to initialize:", error);
    ui.loading.classList.add("is-error");
    ui.loadingMessage.textContent = error instanceof Error ? error.message : String(error);
});
