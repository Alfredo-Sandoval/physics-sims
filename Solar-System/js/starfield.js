// --- Starfield Module --------------------------------------------------
import * as THREE from "three";
import * as CONSTANTS from "./constants.js";
import { loadTexture } from "./utils.js";

/* ---------------------------------------------------------------------- */
/*          Public: createStarfield(scene, texture)                       */
/* ---------------------------------------------------------------------- */
/**
 * Adds a realistic Milky‑Way background to the scene and returns the mesh.
 * Uses a pre-loaded equirectangular texture for the sky-sphere.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Texture} texture  Pre-loaded environment map texture.
 * @returns {THREE.Mesh}  Sky‑sphere mesh
 */
export function createStarfield(scene, texture) {
  // MODIFIED: Accept pre-loaded texture
  // If you want procedural star particles instead, comment this line
  return createSkybox(scene, texture); // MODIFIED
}

/* ---------------------------------------------------------------------- */
/*                      Private helpers                                   */
/* ---------------------------------------------------------------------- */
function createSkybox(scene, texture) {
  // MODIFIED: Accept pre-loaded texture
  // *** Texture is now pre-loaded and passed in ***
  // const tex = loadTexture(
  //   "Moon_JPG_Collection/hipparcos star map.jpg",
  //   textureLoader
  // );
  // tex.mapping = THREE.EquirectangularReflectionMapping;

  const geom = new THREE.SphereGeometry(
    CONSTANTS.STARFIELD_RADIUS,
    64, // Increase segments for smoother sphere
    32
  );
  // Dim the starfield by setting the material color to a dark grey
  const mat = new THREE.MeshBasicMaterial({
    map: texture, // Use the pre-loaded texture
    side: THREE.BackSide,
    color: 0xaaaaaa, // Dim the texture slightly if needed
    fog: false, // Ensure fog doesn't affect the skybox
  });

  const sky = new THREE.Mesh(geom, mat);
  scene.add(sky);
  console.log("[Starfield] Skybox created using pre-loaded texture.");
  return sky;
}

/* ---------------------------------------------------------------------- */
/*      (Legacy) Procedural point‑cloud starfield (commented out)          */
/* ---------------------------------------------------------------------- */
/*
export function createStarfield(scene, textureLoader) {
  const verts=[], cols=[], sizes=[];
  const color = new THREE.Color();
  const starTex = createStarTexture();   // utils.js helper

  for(let i=0;i<CONSTANTS.STAR_COUNT;i++){
    // distribute on a sphere
    const φ = Math.acos(-1 + (2*i)/CONSTANTS.STAR_COUNT);
    const θ = Math.sqrt(CONSTANTS.STAR_COUNT*Math.PI)*φ;
    const r = Math.cbrt(Math.random()) * CONSTANTS.STARFIELD_RADIUS;
    verts.push(
      r*Math.cos(θ)*Math.sin(φ),
      r*Math.sin(θ)*Math.sin(φ),
      r*Math.cos(φ)
    );

    const br = THREE.MathUtils.randFloat(0.8,1);
    const hue = Math.random()>0.7 ? THREE.MathUtils.randFloat(0.55,0.7):0;
    const sat = Math.random()>0.8 ? THREE.MathUtils.randFloat(0.1,0.3):0;
    color.setHSL(hue,sat,br);
    cols.push(color.r,color.g,color.b);

    sizes.push(CONSTANTS.STAR_BASE_SIZE *
               THREE.MathUtils.randFloat(CONSTANTS.STAR_MIN_SIZE_FACTOR,
                                          CONSTANTS.STAR_MAX_SIZE_FACTOR*1.5));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(cols,3));
  g.setAttribute('size',     new THREE.Float32BufferAttribute(sizes,1));

  const m = new THREE.PointsMaterial({
    map: starTex, size: CONSTANTS.STAR_BASE_SIZE*2,
    sizeAttenuation:true, vertexColors:true,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
  });

  const stars = new THREE.Points(g,m);
  scene.add(stars);
  return stars;
}
*/
