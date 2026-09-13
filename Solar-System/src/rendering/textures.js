import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { error as logError, warn as logWarn } from "../core/logger.js";

const textureCache = new Map();

let basePath = new URL("../../textures/", import.meta.url).toString();
let loader = null;

export function initTextureLoader(path = basePath) {
  basePath = path;
  loader = new THREE.TextureLoader();
  loader.setPath(basePath);
  return loader;
}

export function setTextureLoader(customLoader) {
  loader = customLoader ?? null;
}

export function getTextureLoader() {
  if (!loader) {
    initTextureLoader(basePath);
  }
  return loader;
}

/* Centralised texture loader ------------------------------------------ */
/**
 * Loads a texture with correct colour‑space, caching, and error handling.
 * Assumes textureLoader.setPath('../../textures/') has already been called.
 *
 * @param {string} filename  The filename within the textures folder.
 * @param {THREE.TextureLoader} loader  Shared THREE.TextureLoader instance.
 * @returns {THREE.Texture}  (asynchronously filled)
 */
export function loadTexture(filename, loader = getTextureLoader()) {
  if (!filename || !loader) {
    logError("Texture", "loadTexture: missing filename or loader");
    return new THREE.Texture(); // placeholder
  }

  // Check cache first
  if (textureCache.has(filename)) {
    return textureCache.get(filename);
  }

  const tex = loader.load(
    filename,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      try {
        const maxSize = CONSTANTS.MAX_TEXTURE_SIZE;
        if (CONSTANTS.ENABLE_TEXTURE_COMPRESSION && Number.isFinite(maxSize) && maxSize > 0) {
          const img = t.image;
          const w =
            img?.naturalWidth ??
            img?.videoWidth ??
            img?.width ??
            (Number.isFinite(img?.width) ? img.width : 0);
          const h =
            img?.naturalHeight ??
            img?.videoHeight ??
            img?.height ??
            (Number.isFinite(img?.height) ? img.height : 0);
          const largest = Math.max(w || 0, h || 0);
          if (largest > maxSize && w > 0 && h > 0) {
            const scale = maxSize / largest;
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              t.image = canvas;
            }
          }
        }
      } catch (err) {
        logWarn("Texture", `Downscale skipped for ${filename}`, err);
      }
      t.needsUpdate = true;
    },
    undefined,
    (err) => {
      logError("Texture", `loadTexture failed for ${filename}`, err);
      // Create a simple colored texture as fallback and assign to the same texture object
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#666666";
        ctx.fillRect(0, 0, 64, 64);
        tex.image = canvas;
      } else {
        logWarn("Texture", `2D canvas context unavailable for ${filename}; using 1x1 fallback.`);
        tex.image = { data: new Uint8Array([102, 102, 102, 255]), width: 1, height: 1 };
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
    }
  );

  // Cache the texture
  textureCache.set(filename, tex);
  return tex;
}

/**
 * Clear texture cache (useful for cleanup)
 */
export function clearTextureCache() {
  // Dispose textures before clearing to avoid leaking GPU memory
  try {
    for (const tex of textureCache.values()) {
      try {
        tex.dispose?.();
      } catch {}
      // If tex.image is a Canvas or ImageBitmap, no dispose needed; guard anyway
      try {
        tex.image?.close?.();
      } catch {}
    }
  } finally {
    textureCache.clear();
  }
}
