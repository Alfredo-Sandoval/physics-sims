const INSTANCE_KEY = "__solarSystemLearningTools";
const STYLE_ID = "solar-system-learning-tools-style";

const PLANET_FALLBACKS = [
  "Sun",
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
];

const TOUR_STOPS = [
  {
    title: "Inner planets",
    body: "Start close to the Sun and compare the compact rocky worlds. Mercury, Venus, Earth, and Mars sit in the warm inner system where orbital periods are short.",
    selectPlanet: "Mercury",
    focusSelector: "#planetNav",
  },
  {
    title: "Earth and Moon",
    body: "Earth is the reference point for many measurements. Select the Moon here to show how a natural satellite shares a planet-centered neighborhood while following its own orbit.",
    selectPlanet: "Earth",
    selectMoon: "Moon",
    focusSelector: "#moonNav",
    ensureMoonLabels: true,
  },
  {
    title: "Mars and the belt",
    body: "Mars marks the outer edge of the rocky planet region. The asteroid belt begins the transition toward the giant planets and helps show how the system is organized by distance.",
    selectPlanet: "Mars",
    focusSelector: "#highlightAsteroidBeltBtn",
    showAsteroidBelt: true,
    highlightAsteroidBelt: true,
  },
  {
    title: "Jupiter",
    body: "Jupiter dominates the middle solar system. Its gravity shapes nearby small bodies, and its moon system works like a miniature solar system.",
    selectPlanet: "Jupiter",
    focusSelector: "#planetNav",
  },
  {
    title: "Saturn",
    body: "Saturn shows how rings and moons can make a giant planet into a full system of material, not just a single object.",
    selectPlanet: "Saturn",
    focusSelector: "#planetNav",
  },
  {
    title: "Outer planets",
    body: "Uranus and Neptune are distant ice giants. Their wide spacing makes the scale of the outer solar system easier to notice.",
    selectPlanet: "Neptune",
    focusSelector: "#topDownBtn",
    useTopDownView: true,
  },
  {
    title: "Scale lesson",
    body: "Relative mode uses one body-size scale, from the Sun to the smallest moon. Earth becomes tiny beside the Sun. Select any body to inspect it; orbital spacing still uses a separate scale.",
    selectPlanet: "Earth",
    focusSelector: "#toggleScaleModeBtn",
    setRelativeScale: true,
  },
];

function getDocument() {
  return typeof document === "undefined" ? null : document;
}

function getWindow() {
  return typeof window === "undefined" ? null : window;
}

function byId(id) {
  const doc = getDocument();
  return doc ? doc.getElementById(id) : null;
}

function createElement(tagName, options = {}) {
  const doc = getDocument();
  const element = doc.createElement(tagName);

  if (options.className) element.className = options.className;
  if (options.id) element.id = options.id;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.type) element.type = options.type;

  if (options.attributes) {
    Object.entries(options.attributes).forEach(([name, value]) => {
      if (value !== null && value !== undefined) {
        element.setAttribute(name, String(value));
      }
    });
  }

  return element;
}

function clearChildren(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getLabelTextForControl(control) {
  const doc = getDocument();
  if (!doc || !control?.id) return "";
  const label = doc.querySelector(`label[for="${control.id}"]`);
  return label?.textContent?.replace(/:/g, "").trim() || "";
}

function getSelectableOptions(select, kind) {
  if (!select) return [];

  return Array.from(select.options)
    .filter((option) => {
      const value = option.value || option.textContent || "";
      return normalizeText(value) !== "";
    })
    .map((option) => {
      const optgroup = option.closest("optgroup");
      const labelText = getLabelTextForControl(select);
      const currentPlanet = kind === "moon" ? byId("planetNav")?.value : "";
      return {
        kind,
        name: option.value || option.textContent.trim(),
        label: option.textContent.trim(),
        group: optgroup?.label || currentPlanet || labelText || (kind === "moon" ? "Moon" : "Body"),
        select,
      };
    });
}

function getBodyResults() {
  const planetNav = byId("planetNav");
  const moonNav = byId("moonNav");
  const planetResults = getSelectableOptions(planetNav, "planet");
  const moonResults = moonNav && !moonNav.disabled ? getSelectableOptions(moonNav, "moon") : [];

  if (planetResults.length > 0) {
    return [...planetResults, ...moonResults];
  }

  return PLANET_FALLBACKS.map((name) => ({
    kind: name === "Sun" ? "star" : "planet",
    name,
    label: name,
    group: name === "Sun" ? "Star" : "Planet",
    select: planetNav,
  }));
}

function dispatchSelect(select, name) {
  if (!select || !name) return false;

  const expected = normalizeText(name);
  const option = Array.from(select.options).find((candidate) => {
    return normalizeText(candidate.value) === expected || normalizeText(candidate.textContent) === expected;
  });

  if (!option) return false;

  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  if (typeof select.focus === "function") {
    select.focus({ preventScroll: true });
  }
  return true;
}

function clickButtonWhen(button, predicate) {
  if (!button || button.disabled) return false;
  if (typeof predicate === "function" && !predicate(button)) return false;
  button.click();
  return true;
}

function ensurePressed(button, pressed) {
  if (!button || button.disabled) return false;
  const current = button.getAttribute("aria-pressed") === "true";
  if (current === pressed) return false;
  button.click();
  return true;
}

function ensureCheckbox(checkbox, checked) {
  if (!checkbox || checkbox.disabled || checkbox.checked === checked) return false;
  checkbox.checked = checked;
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function injectStyles() {
  const doc = getDocument();
  if (!doc || byId(STYLE_ID)) return;

  const style = createElement("style", { id: STYLE_ID });
  style.textContent = `
.learning-tools-palette {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: start center;
  padding: max(7vh, 48px) 16px 16px;
  background: rgba(3, 7, 18, 0.62);
  color: #f2f7ff;
  font-family: "Chakra Petch", system-ui, sans-serif;
}
.learning-tools-palette[hidden] {
  display: none;
}
.learning-tools-dialog {
  width: min(620px, calc(100vw - 28px));
  overflow: hidden;
  border: 1px solid rgba(196, 215, 255, 0.26);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(23, 29, 49, 0.96), rgba(8, 12, 24, 0.96));
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.58), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px) saturate(1.2);
}
.learning-tools-search-header {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid rgba(196, 215, 255, 0.18);
}
.learning-tools-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.learning-tools-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0;
}
.learning-tools-kbd {
  border: 1px solid rgba(196, 215, 255, 0.26);
  border-radius: 7px;
  padding: 2px 7px;
  color: rgba(242, 247, 255, 0.78);
  background: rgba(255, 255, 255, 0.06);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.72rem;
}
.learning-tools-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(196, 215, 255, 0.28);
  border-radius: 12px;
  padding: 12px 13px;
  color: #f2f7ff;
  background: rgba(255, 255, 255, 0.08);
  font: 600 1rem "Chakra Petch", system-ui, sans-serif;
  letter-spacing: 0;
  outline: none;
}
.learning-tools-input:focus-visible {
  border-color: rgba(91, 188, 255, 0.7);
  box-shadow: 0 0 0 3px rgba(91, 188, 255, 0.18);
}
.learning-tools-results {
  max-height: min(54vh, 430px);
  margin: 0;
  padding: 8px;
  overflow: auto;
  list-style: none;
}
.learning-tools-result {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  border: 0;
  border-radius: 10px;
  padding: 10px 11px;
  color: #f2f7ff;
  background: transparent;
  text-align: left;
  font-family: "Chakra Petch", system-ui, sans-serif;
  cursor: pointer;
}
.learning-tools-result:hover,
.learning-tools-result[aria-selected="true"] {
  background: rgba(91, 188, 255, 0.16);
}
.learning-tools-result-name {
  font-size: 0.96rem;
  font-weight: 600;
}
.learning-tools-result-meta,
.learning-tools-empty {
  color: rgba(216, 227, 255, 0.68);
  font-size: 0.76rem;
}
.learning-tools-empty {
  padding: 18px 12px 20px;
}
.learning-tools-launcher,
.learning-tools-tour {
  position: fixed;
  z-index: 9000;
  font-family: "Chakra Petch", system-ui, sans-serif;
}
.learning-tools-launcher {
  right: 16px;
  bottom: 16px;
  border: 1px solid rgba(196, 215, 255, 0.28);
  border-radius: 12px;
  padding: 9px 12px;
  color: #f2f7ff;
  background: rgba(14, 20, 36, 0.86);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.38);
  cursor: pointer;
}
.learning-tools-launcher:hover,
.learning-tools-launcher:focus-visible {
  border-color: rgba(91, 188, 255, 0.62);
  outline: none;
}
.learning-tools-tour {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  pointer-events: auto;
  border: 1px solid rgba(196, 215, 255, 0.28);
  border-radius: 16px;
  color: #f2f7ff;
  background: linear-gradient(180deg, rgba(24, 30, 50, 0.95), rgba(8, 12, 24, 0.95));
  box-shadow: 0 22px 58px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px) saturate(1.18);
}
.learning-tools-tour[hidden] {
  display: none;
}
.learning-tools-tour-content {
  display: grid;
  gap: 10px;
  padding: 15px;
}
.learning-tools-tour-count {
  color: rgba(216, 227, 255, 0.68);
  font: 600 0.72rem "JetBrains Mono", ui-monospace, monospace;
}
.learning-tools-tour-title {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.2;
  letter-spacing: 0;
}
.learning-tools-tour-body {
  margin: 0;
  color: rgba(235, 242, 255, 0.82);
  font-size: 0.88rem;
  line-height: 1.45;
}
.learning-tools-tour-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 4px;
}
.learning-tools-button {
  border: 1px solid rgba(196, 215, 255, 0.24);
  border-radius: 10px;
  padding: 8px 10px;
  color: #f2f7ff;
  background: rgba(255, 255, 255, 0.07);
  font: 600 0.82rem "Chakra Petch", system-ui, sans-serif;
  cursor: pointer;
}
.learning-tools-button:hover,
.learning-tools-button:focus-visible {
  border-color: rgba(91, 188, 255, 0.62);
  outline: none;
}
.learning-tools-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
[data-learning-focus="true"] {
  outline: 2px solid rgba(91, 188, 255, 0.88) !important;
  outline-offset: 3px !important;
}
@media (max-width: 720px) {
  .learning-tools-launcher {
    right: 12px;
    bottom: 12px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .learning-tools-dialog,
  .learning-tools-tour,
  .learning-tools-launcher {
    transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
  }
  .learning-tools-result {
    transition: background 120ms ease;
  }
}
`;
  doc.head.appendChild(style);
}

function createTextBlock(className, text) {
  return createElement("span", { className, text });
}

function buildCommandPalette(api) {
  const doc = getDocument();
  const overlay = createElement("div", {
    className: "learning-tools-palette",
    attributes: {
      hidden: "",
      role: "presentation",
    },
  });

  const dialog = createElement("section", {
    className: "learning-tools-dialog",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "learningToolsPaletteTitle",
    },
  });

  const header = createElement("div", { className: "learning-tools-search-header" });
  const titleRow = createElement("div", { className: "learning-tools-title-row" });
  const title = createElement("h2", {
    id: "learningToolsPaletteTitle",
    className: "learning-tools-title",
    text: "Find a body",
  });
  const shortcut = createElement("span", { className: "learning-tools-kbd", text: "/ or Ctrl/Cmd K" });
  const input = createElement("input", {
    className: "learning-tools-input",
    attributes: {
      type: "search",
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      placeholder: "Search Sun, planets, and available moons",
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "aria-controls": "learningToolsResults",
    },
  });
  const results = createElement("ul", {
    id: "learningToolsResults",
    className: "learning-tools-results",
    attributes: { role: "listbox" },
  });

  titleRow.append(title, shortcut);
  header.append(titleRow, input);
  dialog.append(header, results);
  overlay.appendChild(dialog);
  doc.body.appendChild(overlay);

  return {
    overlay,
    dialog,
    input,
    results,
    selectedIndex: 0,
    renderedResults: [],
    api,
  };
}

function renderPaletteResults(state) {
  const query = normalizeText(state.input.value);
  const allResults = getBodyResults();
  const filtered = allResults.filter((result) => {
    if (!query) return true;
    return normalizeText(result.name).includes(query) || normalizeText(result.group).includes(query);
  });

  state.renderedResults = filtered;
  state.selectedIndex = Math.min(state.selectedIndex, Math.max(0, filtered.length - 1));
  clearChildren(state.results);

  if (filtered.length === 0) {
    const empty = createElement("li", {
      className: "learning-tools-empty",
      text: "No matching body is available in the current controls.",
    });
    state.results.appendChild(empty);
    return;
  }

  filtered.forEach((result, index) => {
    const item = createElement("li", { attributes: { role: "presentation" } });
    const button = createElement("button", {
      className: "learning-tools-result",
      type: "button",
      attributes: {
        role: "option",
        "aria-selected": String(index === state.selectedIndex),
      },
    });
    const name = createTextBlock("learning-tools-result-name", result.label || result.name);
    const meta = createTextBlock(
      "learning-tools-result-meta",
      result.kind === "moon" ? `Moon of ${result.group}` : result.group
    );

    button.append(name, meta);
    button.addEventListener("click", () => {
      choosePaletteResult(state, index);
    });
    item.appendChild(button);
    state.results.appendChild(item);
  });
}

function setPaletteSelectedIndex(state, index) {
  const count = state.renderedResults.length;
  if (count === 0) return;
  state.selectedIndex = (index + count) % count;
  Array.from(state.results.querySelectorAll("[role='option']")).forEach((option, optionIndex) => {
    option.setAttribute("aria-selected", String(optionIndex === state.selectedIndex));
    if (optionIndex === state.selectedIndex) {
      option.scrollIntoView({ block: "nearest" });
    }
  });
}

function choosePaletteResult(state, index = state.selectedIndex) {
  const result = state.renderedResults[index];
  if (!result) return false;

  const selected = dispatchSelect(result.select, result.name);
  if (selected) {
    state.api.closeCommandPalette();
  }
  return selected;
}

function isEditableShortcutTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, button, a[href], [role='textbox']"));
}

function buildTourPanel(api) {
  const doc = getDocument();
  const launcher = createElement("button", {
    className: "learning-tools-launcher",
    type: "button",
    text: "Learn",
    attributes: { "aria-label": "Start guided solar system tour" },
  });

  const panel = createElement("aside", {
    className: "learning-tools-tour",
    attributes: {
      hidden: "",
      role: "region",
      "aria-live": "polite",
      "aria-labelledby": "learningToolsTourTitle",
    },
  });

  const content = createElement("div", { className: "learning-tools-tour-content" });
  const count = createElement("div", { className: "learning-tools-tour-count" });
  const title = createElement("h2", {
    id: "learningToolsTourTitle",
    className: "learning-tools-tour-title",
  });
  const body = createElement("p", { className: "learning-tools-tour-body" });
  const actions = createElement("div", {
    className: "learning-tools-tour-actions",
    attributes: { role: "group", "aria-label": "Guided tour controls" },
  });
  const closeButton = createElement("button", {
    className: "learning-tools-button",
    type: "button",
    text: "End",
  });
  const previousButton = createElement("button", {
    className: "learning-tools-button",
    type: "button",
    text: "Back",
  });
  const nextButton = createElement("button", {
    className: "learning-tools-button",
    type: "button",
    text: "Next",
  });

  actions.append(closeButton, previousButton, nextButton);
  content.append(count, title, body, actions);
  panel.appendChild(content);
  doc.body.appendChild(launcher);
  (byId("inspectionDock") || doc.body).appendChild(panel);

  launcher.addEventListener("click", () => api.startTour());
  closeButton.addEventListener("click", () => api.endTour());
  previousButton.addEventListener("click", () => api.previousTourStop());
  nextButton.addEventListener("click", () => api.nextTourStop());

  return {
    launcher,
    panel,
    count,
    title,
    body,
    closeButton,
    previousButton,
    nextButton,
  };
}

function clearTourFocus(instance) {
  if (instance.focusedControl) {
    instance.focusedControl.removeAttribute("data-learning-focus");
    instance.focusedControl = null;
  }
}

function focusTourControl(instance, selector) {
  const doc = getDocument();
  clearTourFocus(instance);
  if (!doc || !selector) return;

  const control = doc.querySelector(selector);
  if (!control) return;

  // Tour controls stay available inside the compact, collapsible control groups.
  for (let parent = control.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === "DETAILS") parent.open = true;
  }
  const menuToggle = byId("menuToggle");
  if (window.innerWidth > 768 && byId("menuContainer")?.contains(control) && menuToggle?.getAttribute("aria-expanded") === "false") {
    menuToggle.click();
  }
  control.setAttribute("data-learning-focus", "true");
  if (typeof control.scrollIntoView === "function") {
    control.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  instance.focusedControl = control;
}

function applyTourStop(instance, index) {
  const stop = TOUR_STOPS[index];
  if (!stop) return;

  const planetNav = byId("planetNav");
  const moonNav = byId("moonNav");

  if (stop.selectPlanet) {
    dispatchSelect(planetNav, stop.selectPlanet);
  }

  if (stop.selectMoon) {
    dispatchSelect(moonNav, stop.selectMoon);
  }

  if (stop.ensureMoonLabels) {
    ensurePressed(byId("toggleMoonLabelsBtn"), true);
  }

  if (stop.showAsteroidBelt) {
    clickButtonWhen(byId("toggleAsteroidBeltBtn"), (button) => {
      return normalizeText(button.textContent).includes("show asteroid belt");
    });
  }

  if (stop.highlightAsteroidBelt) {
    clickButtonWhen(byId("highlightAsteroidBeltBtn"), (button) => {
      return normalizeText(button.textContent).startsWith("highlight asteroid belt");
    });
  }

  if (stop.useTopDownView) {
    clickButtonWhen(byId("topDownBtn"));
  }

  if (stop.setRelativeScale) {
    ensurePressed(byId("toggleScaleModeBtn"), true);
  }

  if (stop.showOrbitalPlanes) {
    ensureCheckbox(byId("planesCheckbox"), true);
  }

  focusTourControl(instance, stop.focusSelector);
}

function renderTourPanel(instance) {
  const stop = TOUR_STOPS[instance.tourIndex];
  if (!stop) return;

  instance.tour.panel.hidden = false;
  instance.tour.launcher.setAttribute("aria-expanded", "true");
  instance.tour.count.textContent = `Stop ${instance.tourIndex + 1} of ${TOUR_STOPS.length}`;
  instance.tour.title.textContent = stop.title;
  instance.tour.body.textContent = stop.body;
  instance.tour.previousButton.disabled = instance.tourIndex === 0;
  instance.tour.nextButton.textContent = instance.tourIndex === TOUR_STOPS.length - 1 ? "Finish" : "Next";
  applyTourStop(instance, instance.tourIndex);
}

function initNow(options = {}) {
  const win = getWindow();
  const doc = getDocument();
  if (!win || !doc || !doc.body) return null;

  if (win[INSTANCE_KEY]?.api && !win[INSTANCE_KEY]?.pending) {
    return win[INSTANCE_KEY].api;
  }

  injectStyles();

  const instance = {
    commandPalette: null,
    tour: null,
    tourIndex: 0,
    tourActive: false,
    focusedControl: null,
    listeners: [],
    observer: null,
    options,
  };

  const api = {
    openCommandPalette(initialQuery = "") {
      const state = instance.commandPalette;
      if (!state) return false;
      state.input.value = initialQuery;
      state.overlay.hidden = false;
      state.input.setAttribute("aria-expanded", "true");
      state.selectedIndex = 0;
      renderPaletteResults(state);
      state.input.focus();
      return true;
    },

    closeCommandPalette() {
      const state = instance.commandPalette;
      if (!state) return false;
      state.overlay.hidden = true;
      state.input.setAttribute("aria-expanded", "false");
      return true;
    },

    refreshCommandPalette() {
      const state = instance.commandPalette;
      if (!state || state.overlay.hidden) return false;
      renderPaletteResults(state);
      return true;
    },

    startTour(startIndex = 0) {
      instance.tourActive = true;
      instance.tourIndex = Math.min(Math.max(Number(startIndex) || 0, 0), TOUR_STOPS.length - 1);
      renderTourPanel(instance);
      return true;
    },

    nextTourStop() {
      if (!instance.tourActive) return api.startTour(0);
      if (instance.tourIndex >= TOUR_STOPS.length - 1) {
        api.endTour();
        return false;
      }
      instance.tourIndex += 1;
      renderTourPanel(instance);
      return true;
    },

    previousTourStop() {
      if (!instance.tourActive || instance.tourIndex === 0) return false;
      instance.tourIndex -= 1;
      renderTourPanel(instance);
      return true;
    },

    endTour() {
      if (!instance.tour) return false;
      instance.tourActive = false;
      instance.tour.panel.hidden = true;
      instance.tour.launcher.setAttribute("aria-expanded", "false");
      clearTourFocus(instance);
      return true;
    },

    destroy() {
      api.endTour();
      api.closeCommandPalette();
      instance.listeners.forEach(({ target, type, handler, options: listenerOptions }) => {
        target.removeEventListener(type, handler, listenerOptions);
      });
      instance.listeners = [];
      if (instance.observer) {
        instance.observer.disconnect();
        instance.observer = null;
      }
      instance.commandPalette?.overlay.remove();
      instance.tour?.launcher.remove();
      instance.tour?.panel.remove();
      byId(STYLE_ID)?.remove();
      if (win[INSTANCE_KEY]?.api === api) {
        delete win[INSTANCE_KEY];
      }
      return true;
    },

    getTourStops() {
      return TOUR_STOPS.map((stop) => ({ title: stop.title, body: stop.body }));
    },
  };

  instance.commandPalette = buildCommandPalette(api);
  instance.tour = buildTourPanel(api);
  instance.commandPalette.api = api;

  const addListener = (target, type, handler, listenerOptions) => {
    target.addEventListener(type, handler, listenerOptions);
    instance.listeners.push({ target, type, handler, options: listenerOptions });
  };

  addListener(win, "keydown", (event) => {
    const paletteOpen = !instance.commandPalette.overlay.hidden;
    const shortcutPressed =
      event.key === "/" ||
      ((event.ctrlKey || event.metaKey) && normalizeText(event.key) === "k");

    if (paletteOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        api.closeCommandPalette();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setPaletteSelectedIndex(instance.commandPalette, instance.commandPalette.selectedIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setPaletteSelectedIndex(instance.commandPalette, instance.commandPalette.selectedIndex - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        choosePaletteResult(instance.commandPalette);
      }
      return;
    }

    if (!shortcutPressed || isEditableShortcutTarget(event.target)) return;
    event.preventDefault();
    api.openCommandPalette();
  });

  addListener(instance.commandPalette.input, "input", () => {
    instance.commandPalette.selectedIndex = 0;
    renderPaletteResults(instance.commandPalette);
  });

  addListener(instance.commandPalette.overlay, "click", (event) => {
    if (event.target === instance.commandPalette.overlay) {
      api.closeCommandPalette();
    }
  });

  ["planetNav", "moonNav"].forEach((id) => {
    const control = byId(id);
    if (control) {
      addListener(control, "change", () => api.refreshCommandPalette());
    }
  });

  const moonNav = byId("moonNav");
  if (moonNav && "MutationObserver" in win) {
    instance.observer = new MutationObserver(() => api.refreshCommandPalette());
    instance.observer.observe(moonNav, { childList: true, subtree: true, attributes: true });
  }

  win[INSTANCE_KEY] = { api, instance };
  return api;
}

export function initLearningTools(options = {}) {
  const doc = getDocument();
  const win = getWindow();
  if (!doc || !win) return null;

  if (doc.readyState === "loading") {
    if (win[INSTANCE_KEY]?.api) return win[INSTANCE_KEY].api;

    const pendingApi = {
      ready: new Promise((resolve) => {
        doc.addEventListener(
          "DOMContentLoaded",
          () => {
            resolve(initNow(options));
          },
          { once: true }
        );
      }),
    };
    win[INSTANCE_KEY] = { api: pendingApi, pending: true };
    return pendingApi;
  }

  return initNow(options);
}

export default initLearningTools;
