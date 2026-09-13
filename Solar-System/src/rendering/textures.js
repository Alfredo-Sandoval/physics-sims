import * as THREE from "three";
import { MAX_TEXTURE_SIZE } from "../core/config.js";
import { emit } from "../core/events.js";

const textureCache = new Map();
let basePath = new URL("../../textures/", import.meta.url).toString();
let loader;
export function initTextureLoader(path = basePath) {
  basePath = path;
  loader = new THREE.TextureLoader(new THREE.LoadingManager(() => emit("render"))).setPath(basePath);
  return loader;
}
export function setTextureLoader(value) { loader = value; }
export function getTextureLoader() { return loader ?? initTextureLoader(); }

export function loadTexture(filename, textureLoader = getTextureLoader(), maxSize = MAX_TEXTURE_SIZE) {
  const key = `${filename}@${maxSize}`;
  if (textureCache.has(key)) return textureCache.get(key);
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const texture = textureLoader.load(filename, (loaded) => {
    const source = loaded.image;
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    loaded.userData.originalSize = Math.max(width, height);
    if (Math.max(width, height) > maxSize) {
      const scale = maxSize / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (context) { context.drawImage(source, 0, 0, canvas.width, canvas.height); loaded.image = canvas; }
    }
    loaded.colorSpace = THREE.SRGBColorSpace;
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
  texture.colorSpace = THREE.SRGBColorSpace;
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
