// Simple adaptive quality manager for the solar system demo.
// It watches frame time and nudges quality knobs (pixel ratio, belt worker
// cadence, shadow updates, UI cadence) to keep FPS usable on slower GPUs.

import { setBeltUpdateInterval } from "./beltWorkerClient.js";

export class PerformanceTuner {
  constructor(renderer, shadowManager) {
    this.renderer = renderer;
    this.shadowManager = shadowManager;

    this.maxPixelRatio = renderer?.getPixelRatio?.() ?? 1;
    this.currentPixelRatio = this.maxPixelRatio;
    this.minPixelRatio = 0.7;

    this.samples = [];
    this.sampleWindowMs = 1500; // rolling window for FPS average
    this.lastAdjust = performance.now ? performance.now() : Date.now();
    this.adjustCooldownMs = 500;

    this.lowFps = 48;
    this.veryLowFps = 34;
    this.highFps = 58;

    this.uiIntervalMs = 33;
    this.beltIntervalMs = 36;
    this.shadowIntervalMs = shadowManager?.updateInterval ?? 100;

    setBeltUpdateInterval(this.beltIntervalMs);
    if (this.shadowManager?.setUpdateInterval) {
      this.shadowManager.setUpdateInterval(this.shadowIntervalMs);
    }
  }

  tick(deltaSeconds) {
    const fps = deltaSeconds > 0 ? 1 / deltaSeconds : 60;
    const now = performance.now ? performance.now() : Date.now();
    this.samples.push({ fps, t: now });
    while (this.samples.length && now - this.samples[0].t > this.sampleWindowMs) {
      this.samples.shift();
    }

    const avgFps =
      this.samples.reduce((sum, s) => sum + s.fps, 0) / (this.samples.length || 1);

    if (now - this.lastAdjust < this.adjustCooldownMs) return this.uiIntervalMs;

    if (avgFps < this.veryLowFps) {
      this.applyAggressiveDownscale();
      this.lastAdjust = now;
    } else if (avgFps < this.lowFps) {
      this.applyMildDownscale();
      this.lastAdjust = now;
    } else if (avgFps > this.highFps && this.currentPixelRatio < this.maxPixelRatio - 0.05) {
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
    this.setUiInterval(Math.max(40, this.uiIntervalMs - 8));
  }

  setPixelRatio(value) {
    const next = Math.min(this.maxPixelRatio, Math.max(this.minPixelRatio, value));
    if (!this.renderer || Math.abs(next - this.currentPixelRatio) < 0.01) return;
    const previous = this.currentPixelRatio;
    try {
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.currentPixelRatio = next;
    } catch (error) {
      console.warn("[PerformanceTuner] Failed to apply renderer pixel ratio update", error);
      try {
        this.renderer.setPixelRatio(previous);
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
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
