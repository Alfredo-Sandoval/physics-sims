import { getState } from "../core/state.js";
import { emit } from "../core/events.js";
// Client wrapper around the belt worker. Handles registration and update scheduling
// for asteroid and Kuiper belt instanced meshes.

let worker = null;

const belts = new Map();
let beltUpdateIntervalMs = 16; // throttle belt updates (~60fps for smoothness)
const DEFAULT_BUFFER_COUNT = 2;

function ensureWorker() {
  if (worker) return;
  worker = new Worker(new URL("./workers/beltWorker.js", import.meta.url), { type: "module" });
  attachWorkerHandlers();
}

export function disposeBeltWorker() {
  worker?.terminate();
  worker = null;
  for (const state of belts.values()) clearTimeout(state.timer);
  belts.clear();
  beltUpdateIntervalMs = 16;
}

function logWorkerWarning(message, details) {
  if (details !== undefined) {
    console.warn(`[BeltWorkerClient] ${message}`, details);
    return;
  }
  console.warn(`[BeltWorkerClient] ${message}`);
}

function ensureRecoverableBuffer(state) {
  if (!state || state.availableBuffers.length > 0) return;
  state.availableBuffers.push(new ArrayBuffer(state.bufferLength));
}

function clearInFlightForAllBelts(reason, details) {
  belts.forEach((state) => {
    state.inFlight = false;
    ensureRecoverableBuffer(state);
  });
  logWorkerWarning(reason, details);
}

function postWorkerMessage(message, transferList, onFailure) {
  ensureWorker();
  try {
    if (Array.isArray(transferList) && transferList.length > 0) {
      worker.postMessage(message, transferList);
    } else {
      worker.postMessage(message);
    }
    return true;
  } catch (error) {
    if (typeof onFailure === "function") {
      onFailure(error);
    }
    return false;
  }
}

function attachWorkerHandlers() {
  worker.onmessage = (event) => {
    const { type, beltId, matrixBuffer, revision, simulatedDays } = event.data ?? {};
    if (type !== "updateResult" || !belts.has(beltId)) return;

    const state = belts.get(beltId);
    state.inFlight = false;

    if (!(matrixBuffer instanceof ArrayBuffer)) {
      ensureRecoverableBuffer(state);
      logWorkerWarning(`Received invalid matrix buffer for belt "${beltId}"`, event.data);
      return;
    }

    try {
      const matrixArray = new Float32Array(matrixBuffer);
      const current = getState();
      if (revision === current.timeRevision && (current.simulationSpeed !== 0 || simulatedDays === current.simulatedDays)) {
        state.onMatrices(matrixArray);
        emit("render");
      }
    } catch (error) {
      logWorkerWarning(`Failed to apply worker matrices for belt "${beltId}"`, error);
    } finally {
      state.availableBuffers.push(matrixBuffer);
      flushBeltUpdate(beltId);
    }
  };

  worker.onerror = (event) => {
    clearInFlightForAllBelts("Worker runtime error; cleared in-flight belt updates", event);
  };

  worker.onmessageerror = (event) => {
    clearInFlightForAllBelts("Worker message error; cleared in-flight belt updates", event);
  };
}

export function setBeltUpdateInterval(ms) {
  // Clamp to avoid extremely low or high values
  const clamped = Math.min(240, Math.max(16, ms));
  beltUpdateIntervalMs = clamped;
}

export function registerWorkerBelt({ beltId, orbitScaleFactor, instances, onMatrices }) {
  ensureWorker();
  if (belts.has(beltId)) return;

  const count = instances.length;
  const bufferLength = count * 16 * 4; // bytes
  const buffers = Array.from({ length: DEFAULT_BUFFER_COUNT }, () => new ArrayBuffer(bufferLength));

  belts.set(beltId, {
    availableBuffers: [...buffers],
    bufferLength,
    inFlight: false,
    lastSent: 0,
    onMatrices,
  });

  postWorkerMessage(
    {
      type: "initBelt",
      beltId,
      orbitScaleFactor,
      instances,
    },
    undefined,
    (error) => {
      belts.delete(beltId);
      logWorkerWarning(`Failed to initialize belt "${beltId}"`, error);
    }
  );
}

export function requestWorkerBeltUpdate(beltId, simulatedDays, deltaTime) {
  const state = belts.get(beltId);
  if (!state) return;
  state.pending = { simulatedDays, deltaTime, revision: getState().timeRevision };
  flushBeltUpdate(beltId);
}

function flushBeltUpdate(beltId) {
  const state = belts.get(beltId);
  if (!state?.pending || state.inFlight || !worker) return;
  clearTimeout(state.timer);
  const delay = beltUpdateIntervalMs - (performance.now() - state.lastSent);
  if (delay > 0 && getState().simulationSpeed !== 0) {
    state.timer = setTimeout(() => flushBeltUpdate(beltId), delay);
    return;
  }
  const buffer = state.availableBuffers.pop();
  if (!buffer) return;
  const pending = state.pending;
  state.pending = null;
  state.inFlight = true;
  state.lastSent = performance.now();
  postWorkerMessage({ type: "updateBelt", beltId, ...pending, matrixBuffer: buffer }, [buffer], (error) => {
    state.inFlight = false;
    state.availableBuffers.push(buffer);
    logWorkerWarning(`Failed to update belt "${beltId}"`, error);
  });
}

export function unregisterWorkerBelt(beltId) {
  if (!belts.has(beltId)) return;
  clearTimeout(belts.get(beltId)?.timer);
  belts.delete(beltId);
  if (!worker) return;
  postWorkerMessage(
    { type: "removeBelt", beltId },
    undefined,
    (error) => {
      logWorkerWarning(`Failed to unregister belt "${beltId}"`, error);
    }
  );
}
