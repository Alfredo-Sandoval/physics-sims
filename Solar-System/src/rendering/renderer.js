// Renderer factory: tries WebGPU when opted-in and available, otherwise falls back to WebGL.
import * as THREE from "three";
import * as SceneSetup from "./scene.js";
import { getViewportSize } from "../core/viewport.js";
import { debug as logDebug, info as logInfo, warn as logWarn, error as logError } from "../core/logger.js";

const WEBGPU_PARAM = "webgpu";
const WEBGPU_STORAGE_KEY = "sim:useWebGPU";

function readUrlFlag() {
  try {
    const usp = new URL(window.location.href).searchParams;
    const v = usp.get(WEBGPU_PARAM);
    if (v === null) return null;
    const lowered = v.toLowerCase();
    const enabled = !(lowered === "0" || lowered === "false" || lowered === "off");
    try {
      localStorage.setItem(WEBGPU_STORAGE_KEY, enabled ? "true" : "false");
    } catch {}
    return enabled;
  } catch {
    return null;
  }
}

function readStoredFlag() {
  try {
    const v = localStorage.getItem(WEBGPU_STORAGE_KEY);
    if (v === null) return null;
    return v === "true";
  } catch {
    return null;
  }
}

export function shouldPreferWebGPU() {
  const url = readUrlFlag();
  if (url !== null) return url;
  const stored = readStoredFlag();
  if (stored !== null) return stored;
  return false;
}

async function tryCreateWebGPURenderer() {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    logDebug("Renderer", "navigator.gpu not available; skipping WebGPU");
    return null;
  }

  try {
    const webgpuModule = await import("three/webgpu");
    const WebGPURenderer = webgpuModule?.WebGPURenderer;
    if (!WebGPURenderer) throw new Error("WebGPURenderer export missing");

    const { width, height } = getViewportSize();
    const renderer = new WebGPURenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    const pixelRatio = SceneSetup.getRecommendedPixelRatio();
    renderer.setPixelRatio(pixelRatio);
    renderer.userData = renderer.userData || {};
    renderer.userData.originalPixelRatio = pixelRatio;
    renderer.userData.maxPixelRatio = pixelRatio;
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = false; // Off by default; toggled via UI checkbox
    }

    if (typeof renderer.init === "function") {
      await renderer.init();
    }

    logInfo("Renderer", "WebGPU renderer initialized");
    return renderer;
  } catch (err) {
    logWarn("Renderer", "WebGPU init failed, falling back to WebGL", err);
    return null;
  }
}

export async function createRendererWithFallback() {
  const preferWebGPU = shouldPreferWebGPU();
  if (preferWebGPU) {
    const webgpu = await tryCreateWebGPURenderer();
    if (webgpu) {
      document.body.appendChild(webgpu.domElement);
      return { renderer: webgpu, type: "webgpu" };
    }
  }

  const webgl = SceneSetup.setupRenderer();
  return { renderer: webgl, type: "webgl" };
}
