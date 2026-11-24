import * as THREE from "three";
import { MAX_TEXTURE_SIZE } from "../core/config.js";
import { emit } from "../core/events.js";
import { ORIGINAL_TEXTURE_SIZES } from "./textureSizes.js";

const textureCache = new Map();
// Bodies render at MAX_TEXTURE_SIZE, so they load WebP copies already scaled to it
// (built by scripts/build_textures.py) instead of downloading and shrinking 2048 px
// originals. Larger requests, the sky and close inspection, load the original file.
const SCALED_COPY_DIR = `${MAX_TEXTURE_SIZE}/`;
function sourcePath(filename, maxSize) {
  if (maxSize !== MAX_TEXTURE_SIZE || !ORIGINAL_TEXTURE_SIZES[filename]) return filename;
  return SCALED_COPY_DIR + filename.replace(/\.[^./]+$/, ".webp");
}
let basePath = new URL("../../textures/", import.meta.url).toString();
let loader;
export function initTextureLoader(path = basePath) {
  basePath = path;
  loader = new THREE.TextureLoader(new THREE.LoadingManager(() => emit("render"))).setPath(basePath);
  return loader;
}
export function setTextureLoader(value) { loader = value; }
export function getTextureLoader() { return loader ?? initTextureLoader(); }

/**
 * Load a texture once per (filename, maxSize, colorSpace), downscaling it to maxSize.
 * Color maps use sRGB; pass THREE.NoColorSpace for data maps such as alphaMap.
 */
export function loadTexture(
  filename,
  textureLoader = getTextureLoader(),
  maxSize = MAX_TEXTURE_SIZE,
  colorSpace = THREE.SRGBColorSpace
) {
  const key = `${filename}@${maxSize}@${colorSpace}`;
  if (textureCache.has(key)) return textureCache.get(key);
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const texture = textureLoader.load(sourcePath(filename, maxSize), (loaded) => {
    const source = loaded.image;
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    // Close inspection compares this with the copy to decide whether the original is sharper.
    loaded.userData.originalSize = Math.max(...(ORIGINAL_TEXTURE_SIZES[filename] ?? [width, height]));
    if (Math.max(width, height) > maxSize) {
      const scale = maxSize / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (context) { context.drawImage(source, 0, 0, canvas.width, canvas.height); loaded.image = canvas; }
    }
    loaded.colorSpace = colorSpace;
    loaded.needsUpdate = true;
    resolveReady(loaded);
    emit("render");
  }, undefined, (error) => {
    console.warn(`[Texture] Could not load ${filename}`, error);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (context) { context.fillStyle = "#666"; context.fillRect(0, 0, 1, 1); }
    texture.image = canvas; texture.needsUpdate = true;
    resolveReady(texture); emit("render");
  });
  texture.colorSpace = colorSpace;
  texture.userData = { filename, maxSize, key, ready };
  textureCache.set(key, texture);
  return texture;
}

export function releaseTexture(texture) {
  if (!texture) return;
  textureCache.delete(texture.userData.key);
  texture.dispose();
}
export function clearTextureCache() {
  for (const texture of textureCache.values()) texture.dispose();
  textureCache.clear();
}
