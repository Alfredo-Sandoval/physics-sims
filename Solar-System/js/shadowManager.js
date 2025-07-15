// File: Solar-System/js/shadowManager.js
// Shadow Manager - Optimized shadow updates for better performance
export class ShadowManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.updateInterval = 100; // Update shadows every 100ms instead of every frame
    this.lastUpdate = 0;
    this.needsUpdate = true;
  }

  // Call this instead of automatic shadow updates
  update(timestamp) {
    if (timestamp - this.lastUpdate > this.updateInterval || this.needsUpdate) {
      this.renderer.shadowMap.needsUpdate = true;
      this.lastUpdate = timestamp;
      this.needsUpdate = false;
    }
  }

  // Call when camera moves significantly or objects change
  requestUpdate() {
    this.needsUpdate = true;
  }

  // Adjust update frequency based on performance
  setUpdateInterval(interval) {
    this.updateInterval = interval;
  }
}