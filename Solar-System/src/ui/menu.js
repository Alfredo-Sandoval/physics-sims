import { error as logError } from "../core/logger.js";
let menuContainer, menuToggleBtn, menuToggleHandler;

export function initMenuToggle() {
  menuContainer = document.getElementById("menuContainer");
  menuToggleBtn = document.getElementById("menuToggle");

  if (!menuContainer || !menuToggleBtn) {
    logError("UI", "Menu elements not found!");
    return;
  }

  const syncMenuToggleState = (collapsed) => {
    menuToggleBtn.setAttribute("aria-expanded", String(!collapsed));
    menuToggleBtn.setAttribute("aria-label", collapsed ? "Open controls" : "Close controls");
  };

  const applyMenuState = (collapsed, persist = true) => {
    const surface = document.getElementById("controlSurface");
    if (collapsed && surface.contains(document.activeElement)) menuToggleBtn.focus();
    surface.inert = collapsed;
    menuContainer.classList.toggle("collapsed", collapsed);
    syncMenuToggleState(collapsed);
    if (persist) {
      try {
        localStorage.setItem("menuCollapsed", String(collapsed));
      } catch {}
    }
  };

  // Initial state from localStorage (guarded for privacy-restricted contexts)
  let initiallyCollapsed = window.matchMedia("(max-width: 768px)").matches;
  try {
    const saved = localStorage.getItem("menuCollapsed");
    if (saved !== null) initiallyCollapsed = saved === "true";
  } catch {}
  applyMenuState(initiallyCollapsed, false);

  // Click listener (remove old handler if re-init)
  if (menuToggleHandler) {
    menuToggleBtn.removeEventListener("click", menuToggleHandler);
  }
  menuToggleHandler = () => {
    if (!menuContainer) return;
    const isCurrentlyCollapsed = menuContainer.classList.contains("collapsed");
    applyMenuState(!isCurrentlyCollapsed);
  };
  menuToggleBtn.addEventListener("click", menuToggleHandler);
}

export function cleanupMenu() {
  menuToggleBtn?.removeEventListener("click", menuToggleHandler);
  menuToggleHandler = null;
  menuToggleBtn = null;
  menuContainer = null;
}
