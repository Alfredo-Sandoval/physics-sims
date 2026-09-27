import { selectObject, deselectObject } from "../ui/index.js";
import { findCelestialBodyByName } from "../core/state.js";
import { getSelectedObject, getCelestialBodies, getSimulationSpeed,
  updateFollowTarget, stopCameraFollow, setSelectedObject } from "../core/state.js";
import { applySimulationSpeed, getResumeSpeed, isPausedSpeed, scaleSimulationSpeed } from "../ui/playback.js";
import { targetOwnsKey } from "./shortcutTargets.js";

const PLANET_KEYS = ["Sun", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
let keyboardShortcutHandler = null;
let shortcutsHelpVisible = false;

// A dialog inside a hidden wrapper keeps its own display, so check the rendered result.
function isElementVisible(element) {
  if (!element || element.closest("[hidden]")) return false;
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({ visibilityProperty: true });
  }
  return element.getClientRects().length > 0;
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
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return true;
  return targetOwnsKey(event);
}

export function setupKeyboardShortcuts(scene) {
  if (keyboardShortcutHandler) {
    window.removeEventListener("keydown", keyboardShortcutHandler);
  }

  keyboardShortcutHandler = (e) => {
    if (shouldIgnoreShortcutEvent(e)) return;
    // Holding a toggle key would flicker it; only speed changes may auto-repeat.
    if (e.repeat && !["+", "=", "-", "_"].includes(e.key)) return;

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
        scaleSimulationSpeed(2);
        break;
      case "-":
      case "_":
        e.preventDefault();
        scaleSimulationSpeed(0.5);
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
          document.documentElement.requestFullscreen?.()?.catch?.(() => {});
        } else {
          document.exitFullscreen?.()?.catch?.(() => {});
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
      ["/  or  Ctrl+K", "Search bodies"],
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
