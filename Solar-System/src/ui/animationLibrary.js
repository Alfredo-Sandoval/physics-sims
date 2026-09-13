const EASING_ALIASES = new Map([
  ["easeOutQuad", "outQuad"],
  ["easeInOutSine", "inOutSine"],
]);

function getAnimeApi() {
  return globalThis.anime;
}

function asArray(targets) {
  if (targets == null) return [];
  if (Array.isArray(targets)) return targets;
  if (typeof NodeList !== "undefined" && targets instanceof NodeList) {
    return Array.from(targets);
  }
  return [targets];
}

function finalValue(value) {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

function applyWithoutLibrary(parameters) {
  parameters.begin?.();
  for (const target of asArray(parameters.targets)) {
    if (!target) continue;
    if ("opacity" in parameters && target.style) {
      target.style.opacity = String(finalValue(parameters.opacity));
    }
    if ("translateX" in parameters && target.style) {
      target.style.transform = `translateX(${finalValue(parameters.translateX)})`;
    }
    for (const key of ["x", "y", "z"]) {
      if (key in parameters && target && typeof target === "object") {
        target[key] = finalValue(parameters[key]);
      }
    }
  }
  parameters.complete?.();
  return null;
}

export function hasAnime() {
  const api = getAnimeApi();
  return typeof api === "function" || typeof api?.animate === "function";
}

export function stopAnime(target) {
  if (!target) return;
  const api = getAnimeApi();
  if (typeof api?.remove === "function") {
    api.remove(target);
  }
}

export function runAnime(parameters) {
  const api = getAnimeApi();
  if (typeof api === "function") {
    return api(parameters);
  }
  if (typeof api?.animate !== "function") {
    return applyWithoutLibrary(parameters);
  }

  const { targets, easing, begin, complete, direction, ...rest } = parameters;
  const v4Parameters = { ...rest };
  if (easing) {
    v4Parameters.ease = EASING_ALIASES.get(easing) ?? easing;
  }
  if (begin) {
    v4Parameters.onBegin = begin;
  }
  if (complete) {
    v4Parameters.onComplete = complete;
  }
  if (direction === "alternate") {
    v4Parameters.alternate = true;
  }

  return api.animate(targets, v4Parameters);
}
