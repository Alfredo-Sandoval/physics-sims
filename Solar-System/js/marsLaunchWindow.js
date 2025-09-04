// File: Solar-System/js/marsLaunchWindow.js
// Mars Launch Window Calculator
import * as CONSTANTS from "./constants.js";
import { getOrbitalState, meanMotion } from "./kepler.js";

export class MarsLaunchWindow {
  constructor() {
    this.synodicPeriod = 779.94; // Days between Mars oppositions
    this.launchWindowDuration = 30; // Days
    this.optimalLaunchAngle = 44; // Degrees (Hohmann transfer angle)
    this.lastUpdate = 0;
    this.updateInterval = 1000; // Update every second
    this.refineToleranceDays = 0.1;
    this.maxRefineSteps = 30;
    
    // Reference launch windows (real historical data)
    this.referenceLaunchWindows = [
      { year: 2020, month: 7, day: 30 }, // Perseverance
      { year: 2022, month: 9, day: 15 }, 
      { year: 2024, month: 10, day: 10 },
      { year: 2026, month: 11, day: 16 },
      { year: 2028, month: 12, day: 24 },
      { year: 2031, month: 1, day: 28 }
    ];
    
    this.initializeUI();
  }

  initializeUI() {
    // Get UI elements
    this.launchStatus = document.getElementById('launchStatus');
    this.nextLaunchDate = document.getElementById('nextLaunchDate');
    this.daysUntilLaunch = document.getElementById('daysUntilLaunch');
    this.windowDuration = document.getElementById('windowDuration');
    this.earthMarsAngle = document.getElementById('earthMarsAngle');
    this.jumpToLaunchBtn = document.getElementById('jumpToLaunchBtn');
    this.showTrajectoryBtn = document.getElementById('showTrajectoryBtn');

    // Set up event listeners
    if (this.jumpToLaunchBtn) {
      this.jumpToLaunchBtn.addEventListener('click', () => this.jumpToLaunchWindow());
    }
    
    if (this.showTrajectoryBtn) {
      this.showTrajectoryBtn.addEventListener('click', () => this.showTrajectory());
    }
  }

  calculateEarthMarsAngle(earthPosition, marsPosition) {
    // Calculate the angle between Earth and Mars as seen from the Sun
    const earthAngle = Math.atan2(earthPosition.z, earthPosition.x);
    const marsAngle = Math.atan2(marsPosition.z, marsPosition.x);
    
    let angleDiff = marsAngle - earthAngle;
    
    // Normalize to 0-360 degrees
    if (angleDiff < 0) angleDiff += 2 * Math.PI;
    
    return (angleDiff * 180 / Math.PI);
  }

  // Helpers ------------------------------------------------------------
  degWrap360(v) { return ((v % 360) + 360) % 360; }
  degWrap180(v) { let x = this.degWrap360(v); return x > 180 ? x - 360 : x; }
  rad2deg(r) { return r * 180 / Math.PI; }
  deg2rad(d) { return d * Math.PI / 180; }

  getKepler(name) {
    const pk = window.planetKepler || {};
    if (pk[name]) return pk[name];
    // Fallback constants (J2000-ish)
    if (name === 'Earth') return { a: 1.00000011, e: 0.01671022, ω: this.deg2rad(114.20783), M0: this.deg2rad(357.529109) };
    if (name === 'Mars')  return { a: 1.523679,   e: 0.0933941,  ω: this.deg2rad(286.537),    M0: this.deg2rad(19.373) };
    return { a: 1, e: 0, ω: 0, M0: 0 };
  }

  optimalPhaseAngleDeg(r1AU, r2AU) {
    // Phase angle φ* = 180° − n_M * T_transfer (circular Hohmann)
    const muAU = 0.01720209895 ** 2; // AU^3/day^2
    const aT = (r1AU + r2AU) / 2;
    const Tt = Math.PI * Math.sqrt(Math.max(1e-8, aT * aT * aT) / muAU); // days
    const aMars = this.getKepler('Mars').a;
    const nM = meanMotion(aMars); // rad/day
    const nMdeg = this.rad2deg(nM);
    const phi = 180 - (nMdeg * Tt);
    return this.degWrap360(phi);
  }

  phaseAngleDegAt(simDay) {
    const e = this.getKepler('Earth');
    const m = this.getKepler('Mars');
    const Es = getOrbitalState(simDay, e);
    const Ms = getOrbitalState(simDay, m);
    const le = this.rad2deg(Math.atan2(Es.y, Es.x));
    const lm = this.rad2deg(Math.atan2(Ms.y, Ms.x));
    return this.degWrap360(lm - le);
  }

  radiusAUAt(simDay, name) {
    const k = this.getKepler(name);
    const s = getOrbitalState(simDay, k);
    return Math.hypot(s.x, s.y);
  }

  predictNextLaunchDay(currentDay) {
    // Initial guess using mean motions
    const e = this.getKepler('Earth');
    const m = this.getKepler('Mars');
    const nEdeg = this.rad2deg(meanMotion(e.a)); // deg/day
    const nMdeg = this.rad2deg(meanMotion(m.a));
    const rel = nMdeg - nEdeg; // deg/day (negative)

    const r1 = this.radiusAUAt(currentDay, 'Earth');
    const r2 = this.radiusAUAt(currentDay, 'Mars');
    const phiStar = this.optimalPhaseAngleDeg(r1, r2);
    const phiNow = this.phaseAngleDegAt(currentDay);
    let dt0 = this.degWrap360(phiStar - phiNow) / (rel === 0 ? -0.524 : rel); // guard
    if (!Number.isFinite(dt0) || dt0 < 0) dt0 = 0;

    // Refine with bisection on f(t) = wrap180(phase(t) - phi*)
    const f = (t) => this.degWrap180(this.phaseAngleDegAt(currentDay + t) - phiStar);
    let lo = Math.max(0, dt0 - 120), hi = dt0 + 120;
    let flo = f(lo), fhi = f(hi);

    // If no sign change, expand search up to ~2 years
    let expand = 0;
    while (flo * fhi > 0 && expand < 6) {
      lo = Math.max(0, lo - 60);
      hi = hi + 60;
      flo = f(lo); fhi = f(hi);
      expand++;
    }

    if (flo * fhi > 0) {
      // Fallback to synodic period stepping
      return this.findNextLaunchWindow(currentDay).simulationDay;
    }

    let a = lo, b = hi, fa = flo, fb = fhi;
    for (let i = 0; i < this.maxRefineSteps; i++) {
      const mid = 0.5 * (a + b);
      const fm = f(mid);
      if (Math.abs(fm) < 1e-3 || Math.abs(b - a) < this.refineToleranceDays) {
        return currentDay + mid;
      }
      if (fa * fm <= 0) {
        b = mid; fb = fm;
      } else {
        a = mid; fa = fm;
      }
    }
    return currentDay + 0.5 * (a + b);
  }

  calculateLaunchWindow(currentSimulationDay) {
    // Predict using angle-based solver; fall back to simple method
    const dayNow = currentSimulationDay;
    let nextDay = this.predictNextLaunchDay(dayNow);

    // Optional snap to known windows within ±20 days
    try {
      const target = this.referenceLaunchWindows
        .map(d => this.dateToSimulationDay(new Date(d.year, d.month - 1, d.day)))
        .reduce((best, d) => {
          const diff = Math.abs(d - nextDay);
          return diff < (best?.diff ?? Infinity) ? { day: d, diff } : best;
        }, null);
      if (target && target.diff <= 20) nextDay = target.day;
    } catch {}

    const daysUntil = Math.round(nextDay - dayNow);
    const nextDate = this.simulationDayToDate(nextDay);

    return {
      nextLaunchDate: nextDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      daysUntil,
      isOptimal: daysUntil <= 15 && daysUntil >= -15,
      isApproaching: daysUntil <= 60 && daysUntil > 15,
      simulationDay: nextDay
    };
  }

  findNextLaunchWindow(currentDay) {
    // Reference: July 30, 2020 was a launch window
    const referenceDate = new Date(2020, 6, 30); // July 30, 2020
    const referenceDay = this.dateToSimulationDay(referenceDate);
    
    // Calculate how many synodic periods have passed
    const daysSinceReference = currentDay - referenceDay;
    const synodicPeriodsPassed = Math.floor(daysSinceReference / this.synodicPeriod);
    
    // Find the next window
    const nextWindowDay = referenceDay + (synodicPeriodsPassed + 1) * this.synodicPeriod;
    const daysUntil = nextWindowDay - currentDay;
    
    // Convert back to date
    const nextWindowDate = this.simulationDayToDate(nextWindowDay);
    
    return {
      date: nextWindowDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }),
      daysUntil: Math.round(daysUntil),
      simulationDay: nextWindowDay
    };
  }

  dateToSimulationDay(date) {
    // Convert real date to simulation day (days since J2000)
    const j2000 = new Date(2000, 0, 1, 12, 0, 0); // J2000 epoch
    return (date - j2000) / (1000 * 60 * 60 * 24);
  }

  simulationDayToDate(simulationDay) {
    // Convert simulation day back to real date
    const j2000 = new Date(2000, 0, 1, 12, 0, 0);
    return new Date(j2000.getTime() + simulationDay * 24 * 60 * 60 * 1000);
  }

  update(currentSimulationDay, earthPosition, marsPosition) {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) return;
    this.lastUpdate = now;

    // Calculate Earth-Mars angle from live scene
    const earthMarsAngle = this.calculateEarthMarsAngle(earthPosition, marsPosition);
    
    // Calculate launch window
    const launchWindow = this.calculateLaunchWindow(currentSimulationDay);
    
    // Update UI
    this.updateUI(launchWindow, earthMarsAngle);
  }

  updateUI(launchWindow, earthMarsAngle) {
    if (!this.launchStatus) return;

    // Update angle display
    if (this.earthMarsAngle) {
      this.earthMarsAngle.textContent = `${earthMarsAngle.toFixed(1)}°`;
    }

    // Update launch window info
    if (this.nextLaunchDate) {
      this.nextLaunchDate.textContent = launchWindow.nextLaunchDate;
    }

    if (this.daysUntilLaunch) {
      let daysText = `${launchWindow.daysUntil} days`;
      if (launchWindow.daysUntil === 0) daysText = 'TODAY';
      else if (launchWindow.daysUntil < 0) daysText = `${Math.abs(launchWindow.daysUntil)} days ago`;
      this.daysUntilLaunch.textContent = daysText;
    }

    if (this.windowDuration) {
      this.windowDuration.textContent = `~${this.launchWindowDuration} days`;
    }

    // Update status
    this.launchStatus.className = 'launch-status';
    if (launchWindow.isOptimal) {
      this.launchStatus.classList.add('optimal');
      this.launchStatus.textContent = 'OPTIMAL';
    } else if (launchWindow.isApproaching) {
      this.launchStatus.classList.add('approaching');
      this.launchStatus.textContent = 'APPROACHING';
    } else {
      this.launchStatus.textContent = 'WAITING';
    }
  }

  jumpToLaunchWindow() {
    // This will be called by the main application
    const event = new CustomEvent('jumpToLaunchWindow', {
      detail: { message: 'Jump to next Mars launch window' }
    });
    window.dispatchEvent(event);
  }

  showTrajectory() {
    // This will be called by the main application
    const event = new CustomEvent('showMarsTrajectory', {
      detail: { message: 'Show Mars transfer trajectory' }
    });
    window.dispatchEvent(event);
  }

  // Get the optimal launch angle for Hohmann transfer
  getOptimalLaunchAngle() {
    return this.optimalLaunchAngle;
  }

  // Check if current time is within launch window
  isWithinLaunchWindow(currentSimulationDay) {
    const launchWindow = this.calculateLaunchWindow(currentSimulationDay);
    return Math.abs(launchWindow.daysUntil) <= this.launchWindowDuration / 2;
  }
}
