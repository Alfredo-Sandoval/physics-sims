import { error as logError } from "../core/logger.js";
let menuContainer, menuToggleBtn, menuToggleHandler;

export function initMenuToggle() {
  menuContainer = document.getElementById("menuContainer");
  menuToggleBtn = document.getElementById("menuToggle");

  if (!menuContainer || !menuToggleBtn) {
    logError("UI", "Menu elements not found!");
    return;
  }

  // Helper to compute collapsed translateX from actual menu width
  const getCollapsedX = () => {
    if (!menuContainer) return "-246px"; // fallback
    const w = menuContainer.getBoundingClientRect().width || menuContainer.offsetWidth || 246;
    return `-${Math.ceil(w)}px`;
  };

  const syncMenuToggleState = (collapsed) => {
    menuToggleBtn.setAttribute("aria-expanded", String(!collapsed));
    menuToggleBtn.setAttribute("aria-label", collapsed ? "Open controls" : "Close controls");
  };

  const applyMenuState = (collapsed, persist = true) => {
    menuContainer.classList.toggle("collapsed", collapsed);
    menuContainer.style.transform = collapsed ? `translateX(${getCollapsedX()})` : "translateX(0px)";
    syncMenuToggleState(collapsed);
    if (persist) {
      try {
        localStorage.setItem("menuCollapsed", String(collapsed));
      } catch {}
    }
  };

  // Initial state from localStorage (guarded for privacy-restricted contexts)
  let initiallyCollapsed = false;
  try {
    initiallyCollapsed = localStorage.getItem("menuCollapsed") === "true";
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
