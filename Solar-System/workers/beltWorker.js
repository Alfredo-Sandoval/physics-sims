// Web Worker: Computes orbital transforms for instanced asteroid/Kuiper belts.
// Receives initialization payloads describing each belt and returns matrices for GPU upload.

const belts = new Map();
const TWO_PI = Math.PI * 2;

function normalizeAngle(angleRadians) {
  const wrapped = angleRadians % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function handleInitBelt(message) {
  const { beltId, orbitScaleFactor, instances } = message;
  if (!Array.isArray(instances) || instances.length === 0) {
    belts.set(beltId, {
      orbitScaleFactor,
      count: 0,
      orbitalParams: new Float64Array(0),
      rotation: new Float32Array(0),
      rotationSpeed: new Float32Array(0),
      scale: new Float32Array(0),
    });
    return;
  }

  const count = instances.length;
  const orbitalParams = new Float64Array(count * 7);
  const rotation = new Float32Array(count * 3);
  const rotationSpeed = new Float32Array(count * 3);
  const scale = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const instance = instances[i];
    const op = instance.orbitalParams;
    const r = instance.rotation;
    const s = instance.scale;
    const rs = instance.rotationSpeed;

    const opIndex = i * 7;
    orbitalParams[opIndex + 0] = op.a;
    orbitalParams[opIndex + 1] = op.e;
    orbitalParams[opIndex + 2] = op.i;
    orbitalParams[opIndex + 3] = op.Omega;
    orbitalParams[opIndex + 4] = op.omega;
    orbitalParams[opIndex + 5] = op.M0;
    orbitalParams[opIndex + 6] = op.T;

    const rotIndex = i * 3;
    rotation[rotIndex + 0] = r[0];
    rotation[rotIndex + 1] = r[1];
    rotation[rotIndex + 2] = r[2];

    rotationSpeed[rotIndex + 0] = rs[0];
    rotationSpeed[rotIndex + 1] = rs[1];
    rotationSpeed[rotIndex + 2] = rs[2];

    scale[rotIndex + 0] = s[0];
    scale[rotIndex + 1] = s[1];
    scale[rotIndex + 2] = s[2];
  }

  belts.set(beltId, {
    orbitScaleFactor,
    count,
    orbitalParams,
    rotation,
    rotationSpeed,
    scale,
  });
}

function eulerToQuaternion(x, y, z) {
  const halfX = x * 0.5;
  const halfY = y * 0.5;
  const halfZ = z * 0.5;

  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);

  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

function composeMatrix(out, offset, px, py, pz, q, sx, sy, sz) {
  const x = q.x,
    y = q.y,
    z = q.z,
    w = q.w;

  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;

  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  const m11 = 1 - (yy + zz);
  const m12 = xy + wz;
  const m13 = xz - wy;
  const m21 = xy - wz;
  const m22 = 1 - (xx + zz);
  const m23 = yz + wx;
  const m31 = xz + wy;
  const m32 = yz - wx;
  const m33 = 1 - (xx + yy);

  out[offset + 0] = m11 * sx;
  out[offset + 1] = m12 * sx;
  out[offset + 2] = m13 * sx;
  out[offset + 3] = 0;

  out[offset + 4] = m21 * sy;
  out[offset + 5] = m22 * sy;
  out[offset + 6] = m23 * sy;
  out[offset + 7] = 0;

  out[offset + 8] = m31 * sz;
  out[offset + 9] = m32 * sz;
  out[offset + 10] = m33 * sz;
  out[offset + 11] = 0;

  out[offset + 12] = px;
  out[offset + 13] = py;
  out[offset + 14] = pz;
  out[offset + 15] = 1;
}

function handleUpdateBelt(message) {
  const { beltId, simulatedDays, deltaTime, matrixBuffer } = message;
  const belt = belts.get(beltId);
  if (!belt || belt.count === 0) {
    postMessage({ type: "updateResult", beltId, matrixBuffer });
    return;
  }

  const { orbitScaleFactor, count, orbitalParams, rotation, rotationSpeed, scale } = belt;

  const matrixArray = new Float32Array(matrixBuffer);

  for (let i = 0; i < count; i++) {
    const paramIndex = i * 7;
    const a = orbitalParams[paramIndex + 0];
    const e = orbitalParams[paramIndex + 1];
    const inc = orbitalParams[paramIndex + 2];
    const Omega = orbitalParams[paramIndex + 3];
    const omega = orbitalParams[paramIndex + 4];
    const M0 = orbitalParams[paramIndex + 5];
    const T = orbitalParams[paramIndex + 6];

    const n = TWO_PI / T;
    const M = normalizeAngle(M0 + n * simulatedDays);

    let E = M;
    for (let iter = 0; iter < 5; iter++) {
      E = M + e * Math.sin(E);
    }

    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const sqrtOneMinusESq = Math.sqrt(1 - e * e);

    const cosNu = (cosE - e) / (1 - e * cosE);
    const sinNu = (sqrtOneMinusESq * sinE) / (1 - e * cosE);

    const r = a * (1 - e * cosE);

    const xOrb = r * cosNu;
    const yOrb = r * sinNu;

    const cosOmega = Math.cos(omega);
    const sinOmega = Math.sin(omega);
    const xPeri = xOrb * cosOmega - yOrb * sinOmega;
    const yPeri = xOrb * sinOmega + yOrb * cosOmega;

    const cosInc = Math.cos(inc);
    const sinInc = Math.sin(inc);
    const zIncl = yPeri * sinInc;
    const yIncl = yPeri * cosInc;

    const cosBigOmega = Math.cos(Omega);
    const sinBigOmega = Math.sin(Omega);
    const xFinal = xPeri * cosBigOmega - yIncl * sinBigOmega;
    const zFinal = xPeri * sinBigOmega + yIncl * cosBigOmega;
    const yFinal = zIncl;

    const rotIndex = i * 3;
    const rx = rotation[rotIndex + 0] + rotationSpeed[rotIndex + 0] * deltaTime;
    const ry = rotation[rotIndex + 1] + rotationSpeed[rotIndex + 1] * deltaTime;
    const rz = rotation[rotIndex + 2] + rotationSpeed[rotIndex + 2] * deltaTime;

    rotation[rotIndex + 0] = rx;
    rotation[rotIndex + 1] = ry;
    rotation[rotIndex + 2] = rz;

    const quat = eulerToQuaternion(rx, ry, rz);

    const scaleIndex = rotIndex;
    const sx = scale[scaleIndex + 0];
    const sy = scale[scaleIndex + 1];
    const sz = scale[scaleIndex + 2];

    const px = xFinal * orbitScaleFactor;
    const py = yFinal * orbitScaleFactor;
    const pz = zFinal * orbitScaleFactor;

    composeMatrix(matrixArray, i * 16, px, py, pz, quat, sx, sy, sz);
  }

  postMessage({ type: "updateResult", beltId, matrixBuffer }, [matrixBuffer]);
}

self.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case "initBelt":
      handleInitBelt(message);
      break;
    case "updateBelt":
      handleUpdateBelt(message);
      break;
    case "removeBelt":
      belts.delete(message.beltId);
      break;
    default:
      // Ignore unknown messages
      break;
  }
};
