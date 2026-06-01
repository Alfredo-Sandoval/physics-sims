import * as THREE from "./vendor/three/build/three.module.js";

let basePath = new URL("./textures/", import.meta.url).toString();
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
