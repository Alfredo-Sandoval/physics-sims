import { debug as logDebug, warn as logWarn } from "../core/logger.js";

export function createFrameTimer() {
  let running = false;
  let lastMs = 0;

  return {
    start() {
      running = true;
      lastMs = performance.now();
    },
    getDelta() {
      const now = performance.now();
      if (!running) {
        running = true;
        lastMs = now;
        return 0;
      }
      const delta = Math.max(0, (now - lastMs) / 1000);
      lastMs = now;
      return delta;
    },
  };
}
let lastMemoryCheck = 0;
export const MEMORY_CHECK_INTERVAL = 5000; // Check every 5 seconds

/**
 * Monitor memory usage (if available)
 */
export function checkMemoryUsage() {
  const now = performance.now();
  if (now - lastMemoryCheck < MEMORY_CHECK_INTERVAL) return;
  lastMemoryCheck = now;

  // performance.memory is Chrome-only; guard to avoid noise on other browsers
  const memInfo = /** @type {any} */ (performance).memory;
  if (memInfo) {
    const used = Math.round(memInfo.usedJSHeapSize / 1048576);
    const total = Math.round(memInfo.totalJSHeapSize / 1048576);
    const limit = Math.round(memInfo.jsHeapSizeLimit / 1048576);

    logDebug("Memory", `Usage ${used}MB / ${total}MB (limit: ${limit}MB)`);

    if (used > limit * 0.8) {
      logWarn("Memory", "High usage detected; consider reducing quality settings");
    }
  }
}
