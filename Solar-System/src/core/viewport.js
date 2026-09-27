export function getViewportSize() {
  const vv = window.visualViewport;
  if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
    return {
      width: Math.round(vv.width),
      height: Math.round(vv.height),
    };
  }

  const docEl = document.documentElement;
  return {
    width: window.innerWidth || docEl.clientWidth,
    height: window.innerHeight || docEl.clientHeight,
  };
}

const pixelRatioWatchers = new Map();

// Moving the window to a display with another pixel ratio fires no resize event.
function watchPixelRatio(handler) {
  if (typeof window.matchMedia !== "function") return;
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  const onChange = () => {
    handler();
    watchPixelRatio(handler);
  };
  pixelRatioWatchers.get(handler)?.();
  query.addEventListener?.("change", onChange, { once: true });
  pixelRatioWatchers.set(handler, () => query.removeEventListener?.("change", onChange));
}

export function onResize(handler) {
  window.addEventListener("resize", handler);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handler);
    window.visualViewport.addEventListener("scroll", handler);
  }
  watchPixelRatio(handler);
  return () => offResize(handler);
}

export function offResize(handler) {
  window.removeEventListener("resize", handler);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener("resize", handler);
    window.visualViewport.removeEventListener("scroll", handler);
  }
  pixelRatioWatchers.get(handler)?.();
  pixelRatioWatchers.delete(handler);
}

export function getComputedStyleSafe(element) {
  return window.getComputedStyle(element);
}
