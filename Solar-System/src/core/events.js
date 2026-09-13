// Minimal event bus for the solar system simulation.

import { warn as logWarn } from "./logger.js";

const listeners = new Map(); // eventName -> Set<callback>

export function on(eventName, callback) {
  if (!eventName || typeof callback !== "function") return () => {};
  const set = listeners.get(eventName) ?? new Set();
  set.add(callback);
  listeners.set(eventName, set);
  return () => off(eventName, callback);
}

export function off(eventName, callback) {
  const set = listeners.get(eventName);
  if (!set) return;
  set.delete(callback);
  if (set.size === 0) listeners.delete(eventName);
}

export function emit(eventName, payload) {
  const set = listeners.get(eventName);
  if (!set) return;
  for (const cb of [...set]) {
    try {
      cb(payload);
    } catch (err) {
      logWarn("EventBus", `listener for ${eventName} threw`, err);
    }
  }
}

export function clearListeners() {
  listeners.clear();
}
