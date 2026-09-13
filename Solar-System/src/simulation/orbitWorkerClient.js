import * as THREE from "three";
import * as CONSTANTS from "../core/config.js";
import { getPlanets } from "../core/state.js";
import { getMoonLocalPosition } from "./moonPosition.js";
import { applyMoonJ2PrecessionStep, getPlanetRadiusForMoonPrecession } from "./orbitalRuntime.js";
import { info as logInfo, debug as logDebug, warn as logWarn, error as logError } from "../core/logger.js";

export function createOrbitWorkerClient({ simulationEpochJD, simulationEpochDateUtc }) {
  // Multithreading support
  let simulationWorker = null;
  let workerReady = false;
  // Typed-array position streaming (double-buffered)
  let posBuffers = [];
  let posAvailableBuffers = [];
  let posInFlight = false;
  let pendingRotationTime = 0;
  let lastPositionRequestDay = null;
  // Returned buffer waiting to be applied
  let pendingPositionBuffer = null;
  // Avoid flooding rotation requests
  let rotationInFlight = false;
  const workerMoonPosScratch = new THREE.Vector3();
  // Preference: allow enabling/disabling the worker via URL or localStorage
  function shouldUseWorker() {
    // URL param takes precedence: ?worker=on|off|true|false|1|0
    try {
      const usp = new URL(window.location.href).searchParams;
      const p = usp.get("worker");
      if (p !== null) {
        const v = String(p).toLowerCase();
        return !(v === "off" || v === "false" || v === "0");
      }
    } catch {}
    // Fallback to localStorage key 'sim:useWorker'
    try {
      const s = localStorage.getItem("sim:useWorker");
      if (s !== null) return s === "true";
    } catch {}
    // Default: enable worker
    return true;
  }

  function resetWorkerStreamingState() {
    pendingRotationTime = 0;
    lastPositionRequestDay = null;
    posBuffers = [];
    posAvailableBuffers = [];
    posInFlight = false;
    pendingPositionBuffer = null;
    rotationInFlight = false;
  }

  function failoverToMainThread(reason, error = null) {
    if (error) {
      logError("Worker", reason, error);
    } else {
      logWarn("Worker", reason);
    }

    workerReady = false;
    resetWorkerStreamingState();

    if (!simulationWorker) return;
    try {
      simulationWorker.terminate();
    } catch (terminateError) {
      logDebug("Worker", "worker terminate error during failover", terminateError);
    }
    simulationWorker = null;
  }

  function getWorkerOutBuffer(payload) {
    const nested = payload?.data?.outBuffer;
    if (nested instanceof ArrayBuffer) return nested;

    const topLevel = payload?.outBuffer;
    if (topLevel instanceof ArrayBuffer) return topLevel;

    return null;
  }

  // Apply position updates from worker to Three.js scene
  function applyWorkerPositionUpdates(updates) {
    const planets = getPlanets();
    if (!planets) return;
    if (pendingPositionBuffer) {
      // Fast path: typed array positions [x,y,z]*
      const arr = new Float32Array(pendingPositionBuffer);
      const n = Math.min(planets.length, Math.floor(arr.length / 3));
      for (let i = 0; i < n; i++) {
        const base = i * 3;
        planets[i].position.set(arr[base + 0], arr[base + 1], arr[base + 2]);
      }
      pendingPositionBuffer = null;
      return;
    }
    // Legacy object path
    if (!updates) return;
    planets.forEach((group, index) => {
      const update = updates[index];
      if (update && update.position) {
        group.position.set(update.position.x, update.position.y, update.position.z);
      }
    });
  }

  // Apply rotation updates from worker to Three.js scene
  function applyWorkerRotationUpdates(updates) {
    const planets = getPlanets();
    if (!updates || !planets) return;

    planets.forEach((group, index) => {
      const update = updates[index];
      if (!update) return;

      const ud = group.userData;
      const mesh = ud.planetMesh;
      const parentRadius = getPlanetRadiusForMoonPrecession(ud);

      // Planet rotation
      if (mesh?.isMesh) {
        mesh.rotation.y += update.rotation;

        // Cloud layer
        if (mesh.userData.cloudMesh?.isMesh) {
          mesh.userData.cloudMesh.rotation.y +=
            update.rotation * CONSTANTS.CLOUD_ROTATION_SPEED_MULTIPLIER;
        }
      }

      // Moon updates
      group.traverse((child) => {
        if (!child.isMesh || child.userData.type !== "moon") return;
        const mu = child.userData;
        const moonIndex = child.userData.moonIndex;

        if (update.moons && update.moons[moonIndex]) {
          const moonUpdate = update.moons[moonIndex];

          // Moon rotation
          child.rotation.y += moonUpdate.rotation;

          // Moon orbit
          const nextMeanAnomaly = (mu.currentMeanAnomaly ?? mu.currentAngle ?? 0) + moonUpdate.orbit;
          mu.currentMeanAnomaly = THREE.MathUtils.euclideanModulo(nextMeanAnomaly, 2 * Math.PI);
          mu.currentAngle = mu.currentMeanAnomaly;
          applyMoonJ2PrecessionStep(mu, ud?.name, parentRadius, moonUpdate.orbit);
          child.position.copy(
            getMoonLocalPosition(
              mu.currentMeanAnomaly,
              mu,
              group?.userData?.axialTilt ?? 0,
              workerMoonPosScratch
            )
          );
        }
      });
    });
  }

  // Send position update request to worker
  function requestPositionUpdates(planets, simulatedDays) {
    // A busy worker must not trigger the legacy path and clone the full ephemeris.
    if (!workerReady || !simulationWorker || posInFlight || lastPositionRequestDay === simulatedDays) return;

    // Prefer typed-array buffer to minimize per-frame cloning/GC
    if (!posInFlight) {
      const buffer = posAvailableBuffers.pop();
      if (buffer) {
        try {
          posInFlight = true;
          simulationWorker.postMessage(
            {
              type: "UPDATE_POSITIONS_BUFFER",
              data: {
                simulatedDays,
                orbitScaleFactor: CONSTANTS.ORBIT_SCALE_FACTOR,
                outBuffer: buffer,
              },
            },
            [buffer]
          );
          lastPositionRequestDay = simulatedDays;
        } catch (error) {
          posInFlight = false;
          failoverToMainThread(
            "Failed to send UPDATE_POSITIONS_BUFFER request; using main-thread mode",
            error
          );
        }
        return;
      }
    }

    // Fallback to legacy object-based path if buffers not ready yet
    const planetData = planets.map((group) => ({ config: group.userData.config }));
    try {
      simulationWorker.postMessage({
        type: "UPDATE_POSITIONS",
        data: { planets: planetData, simulatedDays, orbitScaleFactor: CONSTANTS.ORBIT_SCALE_FACTOR },
      });
    } catch (error) {
      failoverToMainThread("Failed to send UPDATE_POSITIONS request; using main-thread mode", error);
    }
  }

  // Send rotation update request to worker
  function requestRotationUpdates(planets, delta, simulationSpeed) {
    if (!workerReady || !simulationWorker) return;
    pendingRotationTime += delta * simulationSpeed;
    if (rotationInFlight || pendingRotationTime <= 0) return;

    const planetData = planets.map((group) => {
      const ud = group.userData;
      let moonMeshes = ud.__moonMeshes;

      if (!Array.isArray(moonMeshes)) {
        moonMeshes = [];
        group.traverse((child) => {
          if (!child?.isMesh || child.userData?.type !== "moon") return;
          moonMeshes.push(child);
        });
        ud.__moonMeshes = moonMeshes;
      }

      return {
        config: {
          calculatedRotationSpeed: ud.config.calculatedRotationSpeed,
          rotationDirection: ud.config.rotationDirection,
        },
        moons: moonMeshes.map((moon, index) => {
          moon.userData.moonIndex = index;
          const mu = moon.userData;
          const cfg = mu?.config;
          return {
            calculatedRotationSpeed: mu.rotationSpeed ?? cfg?.calculatedRotationSpeed,
            rotationDirection: mu.rotationDirection ?? cfg?.rotationDirection,
            calculatedOrbitSpeed: mu.orbitSpeed ?? cfg?.calculatedOrbitSpeed,
            orbitDirection: mu.orbitDirection ?? cfg?.orbitDirection,
          };
        }),
      };
    });

    rotationInFlight = true;
    try {
      simulationWorker.postMessage({
        type: "UPDATE_ROTATIONS",
        data: {
          planets: planetData,
          delta: pendingRotationTime,
          simulationSpeed: 1,
        },
      });
      pendingRotationTime = 0;
    } catch (error) {
      rotationInFlight = false;
      failoverToMainThread("Failed to send UPDATE_ROTATIONS request; using main-thread mode", error);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*                      Simulation Worker (Multithreading)                */
  /* ---------------------------------------------------------------------- */
  function initSimulationWorker() {
    if (!shouldUseWorker()) {
      workerReady = false;
      resetWorkerStreamingState();
      if (simulationWorker) {
        try {
          simulationWorker.terminate();
        } catch (err) {
          logDebug("Worker", "worker terminate error while disabling", err);
        }
        simulationWorker = null;
      }
      logInfo("Worker", "disabled by setting (URL/localStorage)");
      return;
    }
    try {
      simulationWorker = new Worker(new URL("./workers/orbitWorker.js", import.meta.url), {
        type: "module",
      });
      logInfo("Worker", "Simulation worker initialized");

      simulationWorker.onmessage = function (e) {
        try {
          const payload = e?.data;
          const type = payload?.type;
          const data = payload?.data;

          switch (type) {
            case "INIT_DONE":
              workerReady = true;
              logInfo("Worker", "INIT_DONE received");
              break;
            case "POSITIONS_UPDATED":
              applyWorkerPositionUpdates(data);
              break;
            case "POSITIONS_UPDATED_BUFFER": {
              // Support both payload shapes:
              // { type, data: { outBuffer } } and { type, outBuffer }.
              const outBuffer = getWorkerOutBuffer(payload);
              posInFlight = false;
              if (!outBuffer) {
                logWarn("Worker", "POSITIONS_UPDATED_BUFFER missing outBuffer; skipping frame");
                break;
              }
              pendingPositionBuffer = outBuffer;
              posAvailableBuffers.push(outBuffer);
              applyWorkerPositionUpdates(null);
              break;
            }
            case "ROTATIONS_UPDATED":
              rotationInFlight = false;
              applyWorkerRotationUpdates(data); // delta already accounted in worker
              break;
            default:
              logWarn("Worker", "Unknown message type:", type);
          }
        } catch (error) {
          failoverToMainThread("Worker message handling failed; switching to main-thread mode", error);
        }
      };

      simulationWorker.onerror = function (error) {
        failoverToMainThread("Worker error; switching to main-thread mode", error);
      };

      simulationWorker.onmessageerror = function (error) {
        failoverToMainThread("Worker message deserialization failed; switching to main-thread mode", error);
      };

      // workerReady flips true after we send INIT and receive INIT_DONE
    } catch (error) {
      failoverToMainThread("Failed to initialize simulation worker; using main-thread mode", error);
    }
  }

  // Send static orbital data to worker and allocate buffers
  function initWorkerPlanetData(planets) {
    if (!simulationWorker || !Array.isArray(planets)) return;
    const payload = planets.map((group) => {
      const cfg = group?.userData?.config || {};
      return {
        a: cfg.orbitRadiusAU,
        e: cfg.info?.orbitalEccentricity ?? 0,
        iDeg: cfg.kepler?.inclinationDeg ?? cfg.info?.orbitalInclinationDeg ?? 0,
        OmegaDeg: cfg.kepler?.longAscNodeDeg ?? 0,
        omegaDeg: cfg.kepler?.argPeriapsisDeg ?? 0,
        M0Deg: cfg.kepler?.meanAnomalyDeg ?? 0,
        epochJD: cfg.kepler?.epochJD ?? simulationEpochJD ?? null,
        epochDateUtc: cfg.kepler?.epochDateUtc ?? simulationEpochDateUtc ?? null,
        ephemeris: cfg.ephemeris ?? null,
        __configForLegacy: cfg,
      };
    });
    try {
      simulationWorker.postMessage({
        type: "INIT",
        data: {
          planets: payload,
          epochJD: simulationEpochJD ?? null,
          epochDateUtc: simulationEpochDateUtc ?? null,
        },
      });
    } catch (error) {
      failoverToMainThread("Failed to send INIT payload to worker; using main-thread mode", error);
      return;
    }

    // Double-buffer positions: [x,y,z] float32 per planet
    const count = planets.length;
    const bytes = count * 3 * 4;
    posBuffers = [new ArrayBuffer(bytes), new ArrayBuffer(bytes)];
    posAvailableBuffers = [...posBuffers];
    posInFlight = false;
  }

  return {
    get ready() { return workerReady; },
    initialize: initSimulationWorker,
    initializePlanets: initWorkerPlanetData,
    updatePositions: requestPositionUpdates,
    updateRotations: requestRotationUpdates,
    dispose() {
      simulationWorker?.terminate();
      simulationWorker = null;
      workerReady = false;
      resetWorkerStreamingState();
    },
  };
}
