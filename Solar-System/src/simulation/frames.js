import * as THREE from "three";

// Ecliptic J2000 (x toward the equinox, z toward ecliptic north) maps to the scene
// with +Y as ecliptic north. (x, y, z) → (x, z, −y) is a proper rotation, so prograde
// orbits and prograde spins both turn counterclockwise seen from +Y.
// The workers repeat this mapping inline because they avoid importing three.
export function eclipticToScene(x, y, z, out) {
  return out.set(x, z, -y);
}

const OBLIQUITY_J2000_RAD = 23.4392911 * THREE.MathUtils.DEG2RAD;
const ECLIPTIC_NORTH = new THREE.Vector3(0, 0, 1);
const EQUINOX = new THREE.Vector3(1, 0, 0);
const spinAxis = new THREE.Vector3();
const equinox = new THREE.Vector3();
const basisX = new THREE.Vector3();
const basisY = new THREE.Vector3();
const basisZ = new THREE.Vector3();
const basis = new THREE.Matrix4();

// The axis the surface turns counterclockwise around, in ecliptic coordinates.
// IAU poles are the north-side pole, so retrograde rotators spin about its opposite.
export function getSpinAxisEcliptic(cfg, out = new THREE.Vector3()) {
  const ra = Number(cfg?.pole?.raDeg) * THREE.MathUtils.DEG2RAD;
  const dec = Number(cfg?.pole?.decDeg) * THREE.MathUtils.DEG2RAD;
  if (Number.isFinite(ra) && Number.isFinite(dec)) {
    const xEq = Math.cos(dec) * Math.cos(ra);
    const yEq = Math.cos(dec) * Math.sin(ra);
    const zEq = Math.sin(dec);
    const cosE = Math.cos(OBLIQUITY_J2000_RAD);
    const sinE = Math.sin(OBLIQUITY_J2000_RAD);
    out.set(xEq, yEq * cosE + zEq * sinE, -yEq * sinE + zEq * cosE);
    return cfg.rotationPeriod < 0 ? out.negate() : out;
  }
  // Without a measured pole, lean the axis toward ecliptic longitude 90°, as Earth's does.
  const tilt = (Number(cfg?.axialTilt) || 0) * THREE.MathUtils.DEG2RAD;
  return out.set(0, Math.sin(tilt), Math.cos(tilt));
}

// Rotation from a body's local frame into the scene: local +Y is the spin axis and
// local +X points at the body's vernal equinox, where the ecliptic crosses its equator
// heading north. Equatorial (x, y, z) therefore maps to local space like the ecliptic does.
export function getSpinFrameQuaternion(cfg, out = new THREE.Quaternion()) {
  getSpinAxisEcliptic(cfg, spinAxis);
  equinox.crossVectors(spinAxis, ECLIPTIC_NORTH);
  if (equinox.lengthSq() < 1e-12) equinox.copy(EQUINOX);
  equinox.normalize();
  eclipticToScene(equinox.x, equinox.y, equinox.z, basisX);
  eclipticToScene(spinAxis.x, spinAxis.y, spinAxis.z, basisY);
  basisZ.crossVectors(basisX, basisY);
  return out.setFromRotationMatrix(basis.makeBasis(basisX, basisY, basisZ));
}
