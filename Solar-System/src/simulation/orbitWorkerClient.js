import { ORBIT_SCALE_FACTOR } from "../core/config.js";
import { getPlanets, getState } from "../core/state.js";
import { emit } from "../core/events.js";

export function createOrbitWorkerClient() {
  let worker = null, ready = false, inFlight = false, lastDay = null, lastRevision = -1;
  let buffers = [];
  function dispose() {
    worker?.terminate(); worker = null; ready = false; inFlight = false;
    buffers = []; lastDay = null; lastRevision = -1;
  }
  function fail(error) {
    console.warn("[OrbitWorker] Using main-thread orbital updates", error);
    dispose(); emit("render");
  }
  return {
    get ready() { return ready; },
    initialize() {
      let preference = null;
      try { preference = new URL(location.href).searchParams.get("worker") ?? localStorage.getItem("sim:useWorker"); } catch {}
      if (["off", "false", "0"].includes(preference)) return;
      try {
        worker = new Worker(new URL("./workers/orbitWorker.js", import.meta.url), { type: "module" });
        worker.onerror = fail;
        worker.onmessageerror = fail;
        worker.onmessage = ({ data: message }) => {
          if (message.type === "INIT_DONE") { ready = true; emit("render"); return; }
          const { outBuffer, revision, simulatedDays } = message.data;
          inFlight = false;
          if (!(outBuffer instanceof ArrayBuffer)) { fail("Missing position buffer"); return; }
          buffers.push(outBuffer);
          const state = getState();
          if (revision !== state.timeRevision || (state.simulationSpeed === 0 && simulatedDays !== state.simulatedDays)) return;
          const positions = new Float64Array(outBuffer);
          getPlanets().forEach((planet, i) => planet.position.fromArray(positions, i * 3));
          emit("render");
        };
      } catch (error) { fail(error); }
    },
    initializePlanets(planets) {
      if (!worker) return;
      buffers = [new ArrayBuffer(planets.length * 3 * 8), new ArrayBuffer(planets.length * 3 * 8)];
      try { worker.postMessage({ type: "INIT", data: { planets: planets.map((body) => body.userData.config) } }); }
      catch (error) { fail(error); }
    },
    updatePositions(planets, simulatedDays) {
      const revision = getState().timeRevision;
      if (!ready || inFlight || (lastDay === simulatedDays && lastRevision === revision)) return;
      const outBuffer = buffers.pop();
      if (!outBuffer) return;
      try {
        inFlight = true; lastDay = simulatedDays; lastRevision = revision;
        worker.postMessage({ type: "UPDATE_POSITIONS_BUFFER", data: { simulatedDays, revision, orbitScaleFactor: ORBIT_SCALE_FACTOR, outBuffer } }, [outBuffer]);
      } catch (error) { fail(error); }
    },
    dispose,
  };
}
