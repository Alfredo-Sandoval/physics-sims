// Centralized state management for the solar system simulation.
import { emit } from "./events.js";

import {
  ZOOM,
  SUN_RADIUS,
  PLANET_CAMERA_DISTANCE_MULTIPLIER,
  MOON_CAMERA_DISTANCE_MULTIPLIER,
} from "./config.js";

const state = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  clock: null,
  planets: [],
  celestialBodies: [],
  moons: [],
  sun: null,
  asteroidBelt: null,
  simulationSpeed: 1,
  simulatedDays: 0,
  timeRevision: 0,
  followTarget: null,
  followDistance: 50,
  followRequestId: 0,
  frameRequested: false,
  selectedObject: null,
};

export const getState = () => state;

export const getScene = () => state.scene;
export const getCamera = () => state.camera;
export const getRenderer = () => state.renderer;
export const getControls = () => state.controls;
export const getClock = () => state.clock;
export const getPlanets = () => state.planets;
export const getCelestialBodies = () => state.celestialBodies;
export const getMoons = () => state.moons;
export const getSun = () => state.sun;
export const getAsteroidBelt = () => state.asteroidBelt;
export const getSimulationSpeed = () => state.simulationSpeed;
export const getSimulatedDays = () => state.simulatedDays;
export const getFollowTarget = () => state.followTarget;
export const getFollowDistance = () => state.followDistance;
export const getSelectedObject = () => state.selectedObject;

export const setScene = (scene) => {
  state.scene = scene;
};

export const setCamera = (camera) => {
  state.camera = camera;
};

export const setRenderer = (renderer) => {
  state.renderer = renderer;
};

export const setControls = (controls) => {
  state.controls = controls;
};

export const setClock = (clock) => {
  state.clock = clock;
};

export const setPlanets = (planets) => {
  state.planets = Array.isArray(planets) ? planets : [];
};

export const setCelestialBodies = (bodies) => {
  state.celestialBodies = Array.isArray(bodies) ? bodies : [];
};

export const setMoons = (moons) => {
  state.moons = Array.isArray(moons) ? moons : [];
};

export const setSun = (sun) => {
  state.sun = sun ?? null;
};

export const setAsteroidBelt = (belt) => {
  state.asteroidBelt = belt ?? null;
};

export const setSimulationSpeed = (speed) => {
  if (Number.isFinite(speed)) {
    if (state.simulationSpeed === speed) return;
    state.simulationSpeed = speed;
    state.timeRevision += 1;
    emit("render");
  }
};

export const setSimulatedDays = (days) => {
  if (Number.isFinite(days)) {
    if (state.simulatedDays === days) return;
    state.simulatedDays = days;
    emit("render");
  }
};

export function seekToDays(days) {
  if (!Number.isFinite(days)) return;
  state.timeRevision += 1;
  setSimulatedDays(days);
  emit("render");
}

export const updateFollowTarget = (target, distance) => {
  state.followTarget = target ?? null;
  state.followRequestId += 1;
  state.frameRequested = Boolean(target);
  emit("render");
  emit("tracking");

  const sel = target ?? state.selectedObject;
  let radius = 0;
  if (sel) {
    const mesh = sel?.userData?.planetMesh ?? sel;
    const baseRadius =
      mesh?.geometry?.parameters?.radius ??
      sel?.geometry?.parameters?.radius ??
      sel?.userData?.displayRadius ??
      0;
    const sx = Math.abs(mesh?.scale?.x ?? 1);
    const sy = Math.abs(mesh?.scale?.y ?? sx);
    const sz = Math.abs(mesh?.scale?.z ?? sx);
    const scale = Math.max(sx, sy, sz);
    radius = baseRadius * scale;
  }

  if (distance === undefined && sel) {
    const type = sel?.userData?.type;
    if (type === "planet" || type === "star") {
      distance = radius > 0 ? radius * PLANET_CAMERA_DISTANCE_MULTIPLIER : state.followDistance;
    } else if (type === "moon") {
      distance = radius > 0 ? radius * MOON_CAMERA_DISTANCE_MULTIPLIER : state.followDistance;
    }
  }

  if (Number.isFinite(distance)) {
    state.followDistance = distance;
  }

  // Keep even the smallest relative-size moons in front of the near plane.
  if (state.camera && radius > 0) {
    state.camera.near = Math.min(0.1, radius / 20);
    state.camera.updateProjectionMatrix();
  }

  // Adjust OrbitControls minDistance once, based on the newly selected body.
  // This avoids per-frame clamping that can fight the user’s scroll wheel.
  const controls = state.controls;
  if (controls) {
    const selectionFloor =
      radius > 0
        ? Math.max(ZOOM.MIN_SELECTION_DISTANCE, radius * ZOOM.SELECTION_FACTOR)
        : ZOOM.DEFAULT_MIN_DISTANCE;
    controls.minDistance = selectionFloor;
  }
};

export const stopCameraFollow = () => {
  state.followTarget = null;
  state.frameRequested = false;
  emit("render");
  emit("tracking");

  if (!state.selectedObject && state.controls) {
    state.controls.minDistance = Math.max(
      ZOOM.MIN_DISTANCE_BASE,
      SUN_RADIUS * ZOOM.NEAR_SUN_FACTOR
    );
  }
};

export const cancelCameraFraming = () => {
  state.frameRequested = false;
};

export const setSelectedObject = (obj) => {
  state.selectedObject = obj ?? null;
  emit("render");
};

export const resetState = () => {
  state.scene = null;
  state.camera = null;
  state.renderer = null;
  state.controls = null;
  state.clock = null;
  state.planets = [];
  state.celestialBodies = [];
  state.moons = [];
  state.sun = null;
  state.asteroidBelt = null;
  state.simulationSpeed = 1;
  state.simulatedDays = 0;
  state.timeRevision = 0;
  state.followTarget = null;
  state.followDistance = 50;
  state.followRequestId = 0;
  state.frameRequested = false;
  state.selectedObject = null;
};

/* Look‑up helper ------------------------------------------------------- */
export function findCelestialBodyByName(name, list) {
  if (!name || !Array.isArray(list)) return null;
  for (const obj of list) {
    if (obj.userData?.name === name) return obj;
    if (obj.name === name) return obj; // fallback
  }
  return null;
}
