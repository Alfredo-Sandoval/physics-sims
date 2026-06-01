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

export function onResize(handler) {
  window.addEventListener("resize", handler);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handler);
    window.visualViewport.addEventListener("scroll", handler);
  }
  return () => offResize(handler);
}

export function offResize(handler) {
  window.removeEventListener("resize", handler);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener("resize", handler);
    window.visualViewport.removeEventListener("scroll", handler);
  }
}

export function getComputedStyleSafe(element) {
  return window.getComputedStyle(element);
}
