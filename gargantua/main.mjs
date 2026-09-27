import * as THREE from "three";

import { vertexShader, fragmentShader, displayFragmentShader, bloomDownsampleShader } from "./shaders.mjs";
import { createStarfieldTexture } from "./starfield.mjs";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
// The default view recreates the Gargantua shot from Interstellar, using the
// geometry published by the film's effects team (James et al. 2015, CQG 32
// 065001, figures 15a and 16): camera at 74.1 M = 37.05 rs and 86.56 degrees,
// spin 0.6, and a uniform 4500 K disk with no Doppler or gravitational shift.
// The disk radii are fitted by eye to those figures.
const FILM_LOOK = {
    cameraDistance: 37.05,
    cameraAngle: 86.56,
    cameraPhi: 0.0,
    diskInner: 2.2,
    diskOuter: 13.5,
    spin: 0.6,
    realism: 0.0,
    diskTemperature: 4500,
    fieldOfView: 19,
    glow: 0.85,
    cinema: true,
};
const DEFAULTS = {
    ...FILM_LOOK,
    animationEnabled: !prefersReducedMotion.matches,
};
const LIMITS = {
    cameraDistanceMin: 5.0,
    cameraDistanceMax: 250.0,
    cameraAngleMin: 3.0,
    cameraAngleMax: 177.0,
    diskInnerMin: 0.6,
    diskInnerMax: 6.0,
    diskOuterMin: 6.0,
    diskOuterMax: 25.0,
    diskGapMin: 1.0,
};
const RENDER = {
    // Supersampling below 1.5x device pixels costs a lot and shows little.
    maxPixelRatio: 1.5,
    // Jittered samples averaged while the view is still.
    maxSamples: 24,
    // How long after the last input the view counts as settled.
    settleMs: 180,
    minMotionScale: 0.35,
    // Frame times that make the motion resolution step down or back up.
    slowFrameMs: 26,
    fastFrameMs: 18,
    scaleAdjustMs: 450,
    // While the disk animates, each new jittered frame is blended into the
    // last ones with at least this weight: anti-aliasing plus a little motion
    // blur along the orbit.
    motionBlend: 0.3,
    // Glow is built from this many successively halved copies of the frame,
    // starting at a quarter of the trace resolution.
    bloomLevels: 7,
    bloomThreshold: 0.2,
    // Letterbox ratio of the film's widescreen frames, used on screens at
    // least this wide.
    cinemaAspect: 2.39,
    cinemaMinScreenAspect: 1.3,
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
        realism: document.getElementById("realism"),
        temp: document.getElementById("temp"),
        fov: document.getElementById("fov"),
        glow: document.getElementById("glow"),
    },
    values: {
        distance: document.getElementById("distVal"),
        angle: document.getElementById("angleVal"),
        phi: document.getElementById("phiVal"),
        rin: document.getElementById("rinVal"),
        rout: document.getElementById("routVal"),
        spin: document.getElementById("spinVal"),
        realism: document.getElementById("realismVal"),
        temp: document.getElementById("tempVal"),
        fov: document.getElementById("fovVal"),
        glow: document.getElementById("glowVal"),
    },
    readout: document.getElementById("readout"),
    viewPresets: Array.from(document.querySelectorAll("[data-incl]")),
    hudToggle: document.getElementById("hudToggle"),
    hudClose: document.getElementById("hudClose"),
    toggleMotion: document.getElementById("toggleMotion"),
    toggleCinema: document.getElementById("toggleCinema"),
    resetView: document.getElementById("resetView"),
};

function getHudFocusables() {
    return Array.from(ui.hud.querySelectorAll("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])"));
}

let renderer;
let camera;
let traceScene;
let traceMaterial;
let displayScene;
let displayMaterial;
let targets = [];
let bloomTargets = [];
let bloomScene;
let bloomMaterial;
let currentTarget = 0;
let sampleCount = 0;
let maxSamples = RENDER.maxSamples;
let motionScale = 0.75;
let activeScale = 0;
let frameTimeAverage = 0;
let lastScaleAdjust = 0;
let lastInteraction = 0;
let frameHandle = 0;
let lastFrameTime = 0;
const traceSize = new THREE.Vector2();
const drawSize = new THREE.Vector2();
const activePointers = new Map();
const DRAG_THRESHOLD_PX = 6;
let pinchDistance = null;
let hudOpen = false;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function wrapDegrees(value) {
    return ((value + 180) % 360 + 360) % 360 - 180;
}

// Radius of the innermost stable circular orbit for a prograde Kerr disk
// (Bardeen, Press & Teukolsky 1972), in Schwarzschild radii.
function iscoRadius(spin) {
    const cbrt = Math.cbrt;
    const z1 = 1 + cbrt(1 - spin * spin) * (cbrt(1 + spin) + cbrt(1 - spin));
    const z2 = Math.sqrt(3 * spin * spin + z1 * z1);
    return 0.5 * (3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2)));
}

function horizonRadius(spin) {
    return 0.5 * (1 + Math.sqrt(1 - spin * spin));
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
    ui.hudToggle.textContent = hudOpen ? "✕" : "⚙";

    if (hudOpen) {
        syncReadout();
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

    ui.viewPresets.forEach((button) => {
        const target = parseFloat(button.dataset.incl);
        const isActive = Math.abs(state.cameraAngle - target) < 0.75;
        button.dataset.active = String(isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function syncOrbitControl() {
    ui.ranges.phi.value = String(state.cameraPhi);
    ui.values.phi.textContent = formatOrbitOffset(state.cameraPhi);
}

function syncDiskControls() {
    ui.ranges.rin.value = String(state.diskInner);
    ui.ranges.rout.value = String(state.diskOuter);
    ui.ranges.spin.value = String(state.spin);
    ui.ranges.realism.value = String(state.realism);
    ui.ranges.temp.value = String(state.diskTemperature);
    ui.ranges.fov.value = String(state.fieldOfView);
    ui.ranges.glow.value = String(state.glow);

    ui.values.rin.textContent = state.diskInner.toFixed(2);
    ui.values.rout.textContent = state.diskOuter.toFixed(1);
    ui.values.spin.textContent = state.spin.toFixed(2);
    ui.values.realism.textContent = state.realism.toFixed(2);
    ui.values.temp.textContent = `${Math.round(state.diskTemperature)}K`;
    ui.values.fov.textContent = `${Math.round(state.fieldOfView)}°`;
    ui.values.glow.textContent = state.glow.toFixed(2);
}

function syncMotionControl() {
    ui.toggleMotion.dataset.active = String(state.animationEnabled);
    ui.toggleMotion.setAttribute("aria-pressed", String(state.animationEnabled));
    ui.toggleMotion.textContent = state.animationEnabled ? "Pause" : "Play";
}

function syncReadout() {
    if (!hudOpen) {
        return;
    }
    const isco = iscoRadius(state.spin);
    const horizon = horizonRadius(state.spin);
    const resolution = Math.round(activeScale * 100);
    ui.readout.textContent =
        `horizon ${horizon.toFixed(2)} · isco ${isco.toFixed(2)} rs\n` +
        `render ${resolution}% · ${Math.min(sampleCount, maxSamples)}/${maxSamples} samples`;
}

function syncCinemaControl() {
    ui.toggleCinema.dataset.active = String(state.cinema);
    ui.toggleCinema.setAttribute("aria-pressed", String(state.cinema));
}

// Letterboxing only makes sense on landscape screens; on a phone held upright
// the 2.39:1 strip would be a sliver.
function updateFrameAspect() {
    const screenAspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const aspect = state.cinema && screenAspect >= RENDER.cinemaMinScreenAspect ? RENDER.cinemaAspect : 0;
    traceMaterial.uniforms.frameAspect.value = aspect;
    displayMaterial.uniforms.frameAspect.value = aspect;
}

function syncControls() {
    syncDistanceControl();
    syncAngleControl();
    syncOrbitControl();
    syncDiskControls();
    syncMotionControl();
    syncCinemaControl();
    syncReadout();
}

// The disk cannot extend inside the ISCO, and must stay wider than a sliver.
function sanitizeDiskRadii(changedKey) {
    const innerMin = Math.max(LIMITS.diskInnerMin, iscoRadius(state.spin));
    state.diskInner = clamp(state.diskInner, innerMin, LIMITS.diskInnerMax);
    if (state.diskInner > state.diskOuter - LIMITS.diskGapMin) {
        if (changedKey === "diskOuter") {
            state.diskInner = clamp(state.diskOuter - LIMITS.diskGapMin, innerMin, LIMITS.diskInnerMax);
        } else {
            state.diskOuter = clamp(state.diskInner + LIMITS.diskGapMin, LIMITS.diskOuterMin, LIMITS.diskOuterMax);
        }
    }
}

function createTarget(type) {
    return new THREE.WebGLRenderTarget(1, 1, {
        type,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
    });
}

// Sizes the ray-traced buffers to a fraction of the canvas. Returns true when
// the size changed, which discards any accumulated samples.
function resizeTargets(scale) {
    const ratio = Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio) * scale;
    const width = Math.max(1, Math.round(window.innerWidth * ratio));
    const height = Math.max(1, Math.round(window.innerHeight * ratio));
    if (width === traceSize.x && height === traceSize.y) {
        return false;
    }
    traceSize.set(width, height);
    targets.forEach((target) => target.setSize(width, height));
    traceMaterial.uniforms.resolution.value.copy(traceSize);

    const displayUniforms = displayMaterial.uniforms;
    bloomTargets.forEach((target, level) => {
        const divisor = 4 * 2 ** level;
        const levelWidth = Math.max(1, Math.round(width / divisor));
        const levelHeight = Math.max(1, Math.round(height / divisor));
        target.setSize(levelWidth, levelHeight);
        displayUniforms[`bloom${level}`].value = target.texture;
        displayUniforms[`bloomTexel${level}`].value.set(1 / levelWidth, 1 / levelHeight);
    });
    return true;
}

function updateDisplaySize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.getDrawingBufferSize(drawSize);
    displayMaterial.uniforms.resolution.value.copy(drawSize);
}

function updateUniforms() {
    const uniforms = traceMaterial.uniforms;
    uniforms.cameraDistance.value = state.cameraDistance;
    uniforms.cameraAngle.value = state.cameraAngle;
    uniforms.cameraPhi.value = state.cameraPhi;
    uniforms.diskInner.value = state.diskInner;
    uniforms.diskOuter.value = state.diskOuter;
    uniforms.spin.value = state.spin;
    uniforms.realism.value = state.realism;
    uniforms.diskTemperature.value = state.diskTemperature;
    uniforms.fieldOfView.value = state.fieldOfView;
    displayMaterial.uniforms.bloomStrength.value = state.glow;
    updateFrameAspect();
    invalidate();
}

// Any change to the view restarts accumulation and drops to the motion
// resolution until input settles.
function invalidate() {
    sampleCount = 0;
    lastInteraction = performance.now();
    scheduleRender();
}

function rotateBy(deltaX, deltaY) {
    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);
    state.cameraPhi = wrapDegrees(state.cameraPhi - (deltaX / width) * 180.0);
    state.cameraAngle = clamp(
        state.cameraAngle - (deltaY / height) * 90.0,
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

// Low-discrepancy subpixel offsets for the accumulated samples.
function halton(index, base) {
    let result = 0;
    let fraction = 1 / base;
    let i = index;
    while (i > 0) {
        result += fraction * (i % base);
        i = Math.floor(i / base);
        fraction /= base;
    }
    return result;
}

// Steps the motion resolution toward a steady frame rate. Only frames that
// follow directly on another frame are timed.
function adaptMotionScale(frameMs, timestamp) {
    if (frameMs <= 0 || frameMs > 100) {
        return;
    }
    frameTimeAverage = frameTimeAverage === 0 ? frameMs : frameTimeAverage * 0.85 + frameMs * 0.15;
    if (timestamp - lastScaleAdjust < RENDER.scaleAdjustMs) {
        return;
    }
    let nextScale = motionScale;
    if (frameTimeAverage > RENDER.slowFrameMs) {
        nextScale = Math.max(RENDER.minMotionScale, motionScale * 0.85);
    } else if (frameTimeAverage < RENDER.fastFrameMs) {
        nextScale = Math.min(1, motionScale * 1.1);
    }
    nextScale = Math.round(nextScale * 20) / 20;
    if (nextScale !== motionScale) {
        motionScale = nextScale;
        lastScaleAdjust = timestamp;
    }
}

function renderFrame(timestamp) {
    frameHandle = 0;
    if (!renderer || !traceMaterial) {
        return;
    }

    const frameMs = lastFrameTime === 0 ? 0 : timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    const animating = state.animationEnabled && !document.hidden;
    if (animating) {
        traceMaterial.uniforms.time.value += Math.min(frameMs / 1000, 0.05);
        displayMaterial.uniforms.grainSeed.value = (displayMaterial.uniforms.grainSeed.value + 17.3) % 1024;
    }

    const moving = animating || performance.now() - lastInteraction < RENDER.settleMs;
    if (moving) {
        adaptMotionScale(frameMs, timestamp);
    }
    activeScale = moving ? motionScale : 1;
    if (resizeTargets(activeScale)) {
        sampleCount = 0;
    }

    const uniforms = traceMaterial.uniforms;
    const jitterIndex = sampleCount % 32;
    if (jitterIndex === 0) {
        uniforms.jitter.value.set(0, 0);
    } else {
        uniforms.jitter.value.set(halton(jitterIndex, 2) - 0.5, halton(jitterIndex, 3) - 0.5);
    }
    uniforms.blendWeight.value = animating
        ? Math.max(1 / (sampleCount + 1), RENDER.motionBlend)
        : 1 / (sampleCount + 1);
    uniforms.previousFrame.value = targets[1 - currentTarget].texture;

    renderer.setRenderTarget(targets[currentTarget]);
    renderer.render(traceScene, camera);
    if (state.glow > 0) {
        renderBloom(targets[currentTarget]);
    }
    renderer.setRenderTarget(null);
    displayMaterial.uniforms.frame.value = targets[currentTarget].texture;
    renderer.render(displayScene, camera);

    currentTarget = 1 - currentTarget;
    sampleCount += 1;
    syncReadout();

    if (moving || sampleCount < maxSamples) {
        scheduleRender();
    } else {
        lastFrameTime = 0;
    }
}

// Downsamples the frame through the bloom chain, keeping only bright pixels
// at the first level.
function renderBloom(frameTarget) {
    const uniforms = bloomMaterial.uniforms;
    let source = frameTarget;
    bloomTargets.forEach((target, level) => {
        uniforms.source.value = source.texture;
        uniforms.sourceTexel.value.set(1 / source.width, 1 / source.height);
        uniforms.resolution.value.set(target.width, target.height);
        uniforms.threshold.value = level === 0 ? RENDER.bloomThreshold : 0;
        renderer.setRenderTarget(target);
        renderer.render(bloomScene, camera);
        source = target;
    });
}

function toggleCinema() {
    state.cinema = !state.cinema;
    syncCinemaControl();
    updateUniforms();
}

function toggleMotion(forceState) {
    state.animationEnabled = typeof forceState === "boolean" ? forceState : !state.animationEnabled;
    syncControls();
    lastFrameTime = 0;
    invalidate();
}

function resetView() {
    Object.assign(state, FILM_LOOK);
    pinchDistance = null;
    activePointers.clear();
    renderer.domElement.style.cursor = "grab";
    syncControls();
    updateUniforms();
}

function bindRange(range, apply) {
    range.addEventListener("input", (event) => {
        apply(parseFloat(event.target.value));
        syncControls();
        updateUniforms();
    });
}

function bindControls() {
    bindRange(ui.ranges.distance, (value) => {
        state.cameraDistance = clamp(value, LIMITS.cameraDistanceMin, LIMITS.cameraDistanceMax);
    });
    bindRange(ui.ranges.angle, (value) => {
        state.cameraAngle = clamp(value, LIMITS.cameraAngleMin, LIMITS.cameraAngleMax);
    });
    bindRange(ui.ranges.phi, (value) => {
        state.cameraPhi = wrapDegrees(value);
    });
    bindRange(ui.ranges.rin, (value) => {
        state.diskInner = value;
        sanitizeDiskRadii("diskInner");
    });
    bindRange(ui.ranges.rout, (value) => {
        state.diskOuter = value;
        sanitizeDiskRadii("diskOuter");
    });
    bindRange(ui.ranges.spin, (value) => {
        state.spin = clamp(value, 0, 0.998);
        sanitizeDiskRadii("spin");
    });
    bindRange(ui.ranges.realism, (value) => {
        state.realism = clamp(value, 0, 1);
    });
    bindRange(ui.ranges.temp, (value) => {
        state.diskTemperature = value;
    });
    bindRange(ui.ranges.fov, (value) => {
        state.fieldOfView = clamp(value, 10, 90);
    });
    bindRange(ui.ranges.glow, (value) => {
        state.glow = clamp(value, 0, 2);
    });

    ui.toggleMotion.addEventListener("click", () => {
        toggleMotion();
    });

    ui.toggleCinema.addEventListener("click", () => {
        toggleCinema();
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
            if (button.dataset.look === "film") {
                resetView();
                return;
            }
            state.cameraAngle = clamp(
                parseFloat(button.dataset.incl),
                LIMITS.cameraAngleMin,
                LIMITS.cameraAngleMax,
            );
            syncAngleControl();
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
        updateDisplaySize();
        updateFrameAspect();
        invalidate();
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

        if (event.key === "c" || event.key === "C") {
            event.preventDefault();
            toggleCinema();
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
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById("viewport").appendChild(renderer.domElement);

    // Averaging many samples in 8 bits bands visibly, so fall back to a
    // short accumulation when float color buffers are unavailable.
    const floatTargets = renderer.extensions.has("EXT_color_buffer_float") ||
        renderer.extensions.has("EXT_color_buffer_half_float");
    maxSamples = floatTargets ? RENDER.maxSamples : 6;
    const targetType = floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType;
    targets = [createTarget(targetType), createTarget(targetType)];
    bloomTargets = Array.from({ length: RENDER.bloomLevels }, () => createTarget(targetType));

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    traceMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            time: { value: 0 },
            resolution: { value: new THREE.Vector2(1, 1) },
            jitter: { value: new THREE.Vector2() },
            frameAspect: { value: 0 },
            cameraDistance: { value: state.cameraDistance },
            cameraAngle: { value: state.cameraAngle },
            cameraPhi: { value: state.cameraPhi },
            diskInner: { value: state.diskInner },
            diskOuter: { value: state.diskOuter },
            spin: { value: state.spin },
            realism: { value: state.realism },
            diskTemperature: { value: state.diskTemperature },
            fieldOfView: { value: state.fieldOfView },
            starfield: { value: createStarfieldTexture() },
            previousFrame: { value: null },
            blendWeight: { value: 1 },
        },
        depthTest: false,
        depthWrite: false,
    });
    traceScene = new THREE.Scene();
    traceScene.add(new THREE.Mesh(geometry, traceMaterial));

    displayMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: displayFragmentShader,
        uniforms: {
            frame: { value: null },
            resolution: { value: new THREE.Vector2(1, 1) },
            bloomStrength: { value: state.glow },
            frameAspect: { value: 0 },
            grainSeed: { value: 0 },
            ...Object.fromEntries(Array.from({ length: RENDER.bloomLevels }, (_, level) => [
                [`bloom${level}`, { value: null }],
                [`bloomTexel${level}`, { value: new THREE.Vector2(1, 1) }],
            ]).flat()),
        },
        depthTest: false,
        depthWrite: false,
    });
    displayScene = new THREE.Scene();
    displayScene.add(new THREE.Mesh(geometry, displayMaterial));

    bloomMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: bloomDownsampleShader,
        uniforms: {
            source: { value: null },
            sourceTexel: { value: new THREE.Vector2(1, 1) },
            resolution: { value: new THREE.Vector2(1, 1) },
            threshold: { value: RENDER.bloomThreshold },
        },
        depthTest: false,
        depthWrite: false,
    });
    bloomScene = new THREE.Scene();
    bloomScene.add(new THREE.Mesh(geometry, bloomMaterial));

    updateDisplaySize();
    updateFrameAspect();
    bindControls();
    bindViewportInteractions();
    bindGlobalEvents();
    syncControls();
    syncHud();

    ui.loading.style.display = "none";
    invalidate();
}

init().catch((error) => {
    console.error("Failed to initialize:", error);
    ui.loading.classList.add("is-error");
    ui.loadingMessage.textContent = error instanceof Error ? error.message : String(error);
});
