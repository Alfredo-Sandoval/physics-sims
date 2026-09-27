// Simple adaptive quality manager for the solar system demo.
// It watches frame time and nudges quality knobs (pixel ratio, belt worker
// cadence, shadow updates, UI cadence) to keep FPS usable on slower GPUs.

import { setBeltUpdateInterval } from "../simulation/beltWorkerClient.js";

export class PerformanceTuner {
  constructor(renderer, shadowManager) {
    this.renderer = renderer;
    this.shadowManager = shadowManager;

    this.maxPixelRatio = renderer?.getPixelRatio?.() ?? 1;
    this.currentPixelRatio = this.maxPixelRatio;
    this.minPixelRatio = 0.7;

    this.frameTimeMs = 1000 / 60;
    this.lastAdjust = performance.now ? performance.now() : Date.now();
    this.adjustCooldownMs = 500;

    this.lowFps = 48;
    this.veryLowFps = 34;
    this.highFps = 58;

    // A 30 Hz cap (battery saver, low-power mode) looks like a slow GPU. Each
    // downscale is checked after a trial; if FPS did not improve, quality is
    // restored and further downscaling waits, with the wait doubling each time.
    this.trialMs = 3000;
    this.trial = null;
    this.retryAt = 0;
    this.retryBackoffMs = 30000;

    this.uiIntervalMs = 33;
    this.beltIntervalMs = 36;
    this.shadowIntervalMs = shadowManager?.updateInterval ?? 100;

    setBeltUpdateInterval(this.beltIntervalMs);
    if (this.shadowManager?.setUpdateInterval) {
      this.shadowManager.setUpdateInterval(this.shadowIntervalMs);
    }
  }

  tick(deltaSeconds) {
    const now = performance.now ? performance.now() : Date.now();
    // Smooth frame duration directly; averaging reciprocal FPS overweights fast frames.
    if (deltaSeconds > 0) this.frameTimeMs += (deltaSeconds * 1000 - this.frameTimeMs) * 0.05;
    const avgFps = 1000 / this.frameTimeMs;

    if (now - this.lastAdjust < this.adjustCooldownMs) return this.uiIntervalMs;

    if (this.trial && now - this.trial.startedAt >= this.trialMs) {
      if (avgFps < this.trial.fps * 1.15) {
        this.restoreFullQuality();
        this.retryAt = now + this.retryBackoffMs;
        this.retryBackoffMs *= 2;
      }
      this.trial = null;
      this.lastAdjust = now;
      return this.uiIntervalMs;
    }

    const mayDownscale = !this.trial ? now >= this.retryAt : true;
    if (mayDownscale && avgFps < this.lowFps) {
      if (!this.trial) this.trial = { fps: avgFps, startedAt: now };
      if (avgFps < this.veryLowFps) this.applyAggressiveDownscale();
      else this.applyMildDownscale();
      this.lastAdjust = now;
    } else if (avgFps > this.highFps && (this.currentPixelRatio < this.maxPixelRatio - 0.01 || this.beltIntervalMs > 36 || this.shadowIntervalMs > 100 || this.uiIntervalMs > 33)) {
      this.applyUpscale();
      this.lastAdjust = now;
    }

    return this.uiIntervalMs;
  }

  applyMildDownscale() {
    this.setPixelRatio(Math.max(this.minPixelRatio, this.currentPixelRatio - 0.08));
    this.setBeltInterval(Math.min(90, this.beltIntervalMs + 12));
    this.setShadowInterval(Math.min(220, this.shadowIntervalMs + 40));
    this.setUiInterval(Math.min(72, this.uiIntervalMs + 10));
  }

  applyAggressiveDownscale() {
    this.setPixelRatio(this.minPixelRatio);
    this.setBeltInterval(Math.min(160, this.beltIntervalMs + 40));
    this.setShadowInterval(Math.min(300, this.shadowIntervalMs + 80));
    this.setUiInterval(96);
  }

  applyUpscale() {
    this.setPixelRatio(Math.min(this.maxPixelRatio, this.currentPixelRatio + 0.06));
    this.setBeltInterval(Math.max(36, this.beltIntervalMs - 10));
    this.setShadowInterval(Math.max(100, this.shadowIntervalMs - 30));
    this.setUiInterval(Math.max(33, this.uiIntervalMs - 8));
  }

  restoreFullQuality() {
    this.setPixelRatio(this.maxPixelRatio);
    this.setBeltInterval(36);
    this.setShadowInterval(100);
    this.setUiInterval(33);
  }

  // Browser zoom or a move to another display changes the device pixel ratio.
  setMaxPixelRatio(value) {
    if (!Number.isFinite(value) || value <= 0) return;
    const scale = this.currentPixelRatio / this.maxPixelRatio;
    this.maxPixelRatio = value;
    this.minPixelRatio = Math.min(0.7, value);
    this.currentPixelRatio = Number.NaN;
    this.setPixelRatio(value * scale);
  }

  setPixelRatio(value) {
    const next = Math.min(this.maxPixelRatio, Math.max(this.minPixelRatio, value));
    if (!this.renderer || Math.abs(next - this.currentPixelRatio) < 0.01) return;
    // NaN marks a forced reapply; restore to the new maximum if setPixelRatio throws.
    const fallback = Number.isFinite(this.currentPixelRatio) ? this.currentPixelRatio : this.maxPixelRatio;
    const previous = fallback;
    try {
      this.renderer.setPixelRatio(next);
      this.currentPixelRatio = next;
    } catch (error) {
      console.warn("[PerformanceTuner] Failed to apply renderer pixel ratio update", error);
      try {
        this.renderer.setPixelRatio(previous);
      } catch (restoreError) {
        console.warn("[PerformanceTuner] Failed to restore previous renderer pixel ratio", restoreError);
      }
    }
  }

  setBeltInterval(ms) {
    const clamped = Math.min(240, Math.max(16, ms));
    if (clamped === this.beltIntervalMs) return;
    this.beltIntervalMs = clamped;
    setBeltUpdateInterval(clamped);
  }

  setShadowInterval(ms) {
    const clamped = Math.min(400, Math.max(80, ms));
    if (clamped === this.shadowIntervalMs) return;
    this.shadowIntervalMs = clamped;
    if (this.shadowManager?.setUpdateInterval) {
      this.shadowManager.setUpdateInterval(clamped);
    }
  }

  setUiInterval(ms) {
    const clamped = Math.min(140, Math.max(28, ms));
    this.uiIntervalMs = clamped;
  }

  getUiIntervalMs() {
    return this.uiIntervalMs;
  }
}
