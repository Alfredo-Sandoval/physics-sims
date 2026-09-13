import { selectObject, deselectObject } from "../ui/index.js";
import { findCelestialBodyByName } from "../core/state.js";
import { getSelectedObject, getCelestialBodies, getSimulationSpeed,
  updateFollowTarget, stopCameraFollow, setSelectedObject } from "../core/state.js";
import { applySimulationSpeed, getResumeSpeed, isPausedSpeed } from "../ui/playback.js";

const PLANET_KEYS = ["Sun", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
let keyboardShortcutHandler = null;
let shortcutsHelpVisible = false;

function isElementVisible(element) {
  if (!element || element.hidden) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function hasOpenModalOrDialog() {
  const selectors = [
    "dialog[open]",
    ".modal.show",
    ".modal[aria-hidden='false']",
    "[role='dialog'][aria-hidden='false']",
    "[role='dialog'][aria-modal='true']",
  ];
  for (const selector of selectors) {
    const candidates = document.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (candidate.id === "shortcutsHelp") continue;
      if (isElementVisible(candidate)) return true;
    }
  }
  return false;
}

function handleEscapeKeyAction() {
  if (shortcutsHelpVisible) {
    toggleShortcutsHelp();
    return;
  }

  if (hasOpenModalOrDialog()) return;

  const selected = getSelectedObject();
  if (selected) {
    deselectObject();
    setSelectedObject(null);
  }
  stopCameraFollow();
}

function shouldIgnoreShortcutEvent(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;

  const interactiveSelector = [
    "input",
    "textarea",
    "select",
    "button",
    "a[href]",
    "[contenteditable='true']",
    "[contenteditable='']",
    "[role='button']",
    "[role='textbox']",
  ].join(",");
  return Boolean(target.closest(interactiveSelector));
}

export function setupKeyboardShortcuts(scene) {
  if (keyboardShortcutHandler) {
    window.removeEventListener("keydown", keyboardShortcutHandler);
  }

  keyboardShortcutHandler = (e) => {
    if (shouldIgnoreShortcutEvent(e)) return;

    const selectable = getCelestialBodies() ?? [];

    const goToBody = (name) => {
      const obj = findCelestialBodyByName(name, selectable);
      if (obj) {
        selectObject(obj);
        setSelectedObject(obj);
        updateFollowTarget(obj);
        // Sync planet dropdown
        const planetNav = document.getElementById("planetNav");
        if (planetNav) planetNav.value = name;
      }
    };

    switch (e.key) {
      case " ":
        e.preventDefault();
        applySimulationSpeed(isPausedSpeed(getSimulationSpeed()) ? getResumeSpeed() : 0);
        break;
      case "+":
      case "=":
        e.preventDefault();
        applySimulationSpeed(Math.min(5.0, (getSimulationSpeed() || 1) * 2));
        break;
      case "-":
      case "_":
        e.preventDefault();
        applySimulationSpeed(Math.max(0.1, (getSimulationSpeed() || 1) / 2));
        break;
      case "0":
        goToBody("Sun");
        break;
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
        goToBody(PLANET_KEYS[parseInt(e.key)]);
        break;
      case "f":
      case "F":
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
        break;
      case "s":
      case "S": {
        e.preventDefault();
        const btn = document.getElementById("toggleScaleModeBtn");
        if (btn) btn.click();
        break;
      }
      case "v":
      case "V": {
        e.preventDefault();
        const btn = document.getElementById("toggleFocusModeBtn");
        if (btn) btn.click();
        break;
      }
      case "l":
      case "L": {
        const btn = document.getElementById("togglePlanetLabelsBtn");
        if (btn) btn.click();
        break;
      }
      case "m":
      case "M": {
        const btn = document.getElementById("toggleMoonLabelsBtn");
        if (btn) btn.click();
        break;
      }
      case "o":
      case "O": {
        const btn = document.getElementById("toggleOrbitsBtn");
        if (btn) btn.click();
        break;
      }
      case "r":
      case "R": {
        const btn = document.getElementById("resetCameraBtn");
        if (btn) btn.click();
        break;
      }
      case "?":
      case "h":
      case "H":
        toggleShortcutsHelp();
        break;
      case "Escape":
        handleEscapeKeyAction();
        break;
    }
  };

  window.addEventListener("keydown", keyboardShortcutHandler);
}

function toggleShortcutsHelp() {
  let panel = document.getElementById("shortcutsHelp");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "shortcutsHelp";
    panel.className = "shortcuts-help";
    const content = [
      ["Space", "Pause / Play"],
      ["+  /  -", "Speed up / Slow down"],
      ["0", "Go to Sun"],
      ["1 - 8", "Go to planet"],
      ["F", "Toggle fullscreen"],
      ["S", "Toggle scale mode"],
      ["V", "Toggle focus mode"],
      ["L", "Toggle planet labels"],
      ["M", "Toggle moon labels"],
      ["O", "Toggle orbits"],
      ["R", "Reset camera"],
      ["Esc", "Deselect / Close"],
      ["?  /  H", "This help"],
    ];
    const title = document.createElement("h4");
    title.textContent = "Keyboard Shortcuts";
    panel.appendChild(title);
    const table = document.createElement("div");
    table.className = "shortcuts-grid";
    content.forEach(([key, desc]) => {
      const kEl = document.createElement("kbd");
      kEl.textContent = key;
      const dEl = document.createElement("span");
      dEl.textContent = desc;
      table.appendChild(kEl);
      table.appendChild(dEl);
    });
    panel.appendChild(table);
    document.body.appendChild(panel);
  }
  shortcutsHelpVisible = !shortcutsHelpVisible;
  panel.style.display = shortcutsHelpVisible ? "block" : "none";
}

export function cleanupKeyboardShortcuts() {
  if (keyboardShortcutHandler) {
    window.removeEventListener("keydown", keyboardShortcutHandler);
    keyboardShortcutHandler = null;
  }
  const panel = document.getElementById("shortcutsHelp");
  if (panel?.parentElement) panel.parentElement.removeChild(panel);
  shortcutsHelpVisible = false;
}

// Camera targeting functions removed - using standard orbit controls
