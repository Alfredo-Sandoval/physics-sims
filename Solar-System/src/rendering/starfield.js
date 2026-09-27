// --- Starfield Module --------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { loadTexture } from "./textures.js";
import { debug as logDebug } from "../core/logger.js";

// NASA SVS Deep Star Maps 2020 (Gaia, Hipparcos/Tycho-2 and the Milky Way), tone-mapped
// to sRGB. The map is equatorial J2000 with RA 0h at the centre and RA rising leftward.
const SKY_TEXTURE = "starmap_2020_4k.jpg";
const SKY_TEXTURE_SIZE = 4096;
const OBLIQUITY_J2000_RAD = 23.4392911 * THREE.MathUtils.DEG2RAD;

/**
 * Adds the sky sphere. The render loop keeps it centred on the camera.
 *
 * @param {THREE.Scene} scene
 * @returns {THREE.Group} Starfield group containing the sky sphere.
 */
export function createStarfield(scene) {
  const starfield = new THREE.Group();
  starfield.name = "starfield";
  starfield.add(createSkySphere());
  scene.add(starfield);
  logDebug("Starfield", "Created sky sphere");
  return starfield;
}

// SphereGeometry puts u = 0.5 on local +X, the north pole on +Y, and u = 0.75 on −Z.
// So local (x, y, z) is equatorial (x, z, y), a reflection. Composing it with
// equatorial → ecliptic → scene gives the basis below; three.js flips face winding
// for the negative determinant, so the back faces still show from inside.
function createSkySphere() {
  const texture = loadTexture(SKY_TEXTURE, undefined, SKY_TEXTURE_SIZE);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geom = new THREE.SphereGeometry(CONSTANTS.STARFIELD_RADIUS, 64, 32);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    color: CONSTANTS.STARFIELD_SKY_COLOR,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(geom, mat);
  const cosE = Math.cos(OBLIQUITY_J2000_RAD);
  const sinE = Math.sin(OBLIQUITY_J2000_RAD);
  sky.quaternion.identity();
  sky.matrixAutoUpdate = false;
  sky.matrix.makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, cosE, -sinE),
    new THREE.Vector3(0, -sinE, -cosE)
  );
  sky.userData.isSky = true;
  return sky;
}
