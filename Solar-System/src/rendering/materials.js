import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { loadTexture } from "./textures.js";

/* Text label sprite --------------------------------------------------- */
export function createTextSprite(text, options = {}) {
  const { font = "12px sans-serif", padding = 4, bg = "rgba(0,0,0,0.4)", fg = "#fff" } = options;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + padding * 2;
  const h = 20 + padding * 2;
  canvas.width = w;
  canvas.height = h;
  // redraw with correct size
  const ctx2 = canvas.getContext("2d");
  ctx2.font = font;
  ctx2.fillStyle = bg;
  ctx2.fillRect(0, 0, w, h);
  ctx2.fillStyle = fg;
  ctx2.textBaseline = "middle";
  ctx2.fillText(text, padding, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const scale = 12; // world units
  sprite.scale.set(scale, (scale * h) / w, 1);
  return sprite;
}

/* Planet material factory --------------------------------------------- */
export function createPlanetMaterial(filename, loader) {
  const texture = filename ? loadTexture(filename, loader) : null;
  const material = new THREE.MeshStandardMaterial({
    map: texture ?? undefined,
    color: texture ? 0xffffff : 0x888888, // grey placeholder if missing
    roughness: CONSTANTS.PLANET_ROUGHNESS,
    metalness: CONSTANTS.PLANET_METALNESS,
    envMapIntensity: CONSTANTS.PLANET_ENV_INTENSITY,
  });

  // Keep a slight emissive lift so darker albedo textures still read cleanly.
  if (texture) {
    material.emissiveMap = texture;
    material.emissive = new THREE.Color(0xffffff);
    material.emissiveIntensity = 0.08;
  }

  return material;
}
