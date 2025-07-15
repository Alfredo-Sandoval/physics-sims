// File: Solar-System/js/marsLaunchWindow.js
// Mars Launch Window Calculator
import * as CONSTANTS from "./constants.js";

export class MarsLaunchWindow {
  constructor() {
    this.synodicPeriod = 779.94; // Days between Mars oppositions
    this.launchWindowDuration = 30; // Days
    this.optimalLaunchAngle = 44; // Degrees (Hohmann transfer angle)
    this.lastUpdate = 0;
    this.updateInterval = 1000; // Update every second
    
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

  calculateLaunchWindow(currentSimulationDay) {
    // Calculate days since J2000 epoch
    const daysSinceEpoch = currentSimulationDay;
    
    // Find the next launch window
    const nextWindow = this.findNextLaunchWindow(daysSinceEpoch);
    
    return {
      nextLaunchDate: nextWindow.date,
      daysUntil: nextWindow.daysUntil,
      isOptimal: nextWindow.daysUntil <= 15 && nextWindow.daysUntil >= -15,
      isApproaching: nextWindow.daysUntil <= 60 && nextWindow.daysUntil > 15
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

    // Calculate Earth-Mars angle
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
      const daysText = launchWindow.daysUntil > 0 ? 
        `${launchWindow.daysUntil} days` : 
        `${Math.abs(launchWindow.daysUntil)} days ago`;
      this.daysUntilLaunch.textContent = daysText;
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