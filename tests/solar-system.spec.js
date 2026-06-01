const logEl = document.getElementById("testLog");
const lines = [];

function log(message) {
  lines.push(message);
  logEl.textContent = lines.join("\n");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  log(`PASS ${message}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, message, timeoutMs = 20000) {
  const start = performance.now();
  let lastError;
  while (performance.now() - start < timeoutMs) {
    try {
      const value = check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}

function visible(win, element) {
  return element && win.getComputedStyle(element).display !== "none";
}

async function runSolarSystemSmoke() {
  log("Loading Solar System app...");

  const frame = document.createElement("iframe");
  frame.title = "Solar System app under test";
  frame.src = "../Solar-System/";
  document.querySelector("main").appendChild(frame);

  const win = await waitFor(
    () => frame.contentWindow?.location?.pathname === "/Solar-System/" && frame.contentWindow,
    "loads Solar System iframe"
  );
  const doc = win.document;

  await waitFor(() => doc.querySelector("canvas"), "renders a canvas");
  await waitFor(() => doc.querySelectorAll(".planet-label").length >= 9, "creates labels");
  assert(doc.getElementById("errorOverlay")?.style.display !== "block", "app has no initialization error overlay");

  const planetNav = doc.getElementById("planetNav");
  const moonNav = doc.getElementById("moonNav");
  assert(planetNav, "planet dropdown exists");
  assert(moonNav, "moon dropdown exists");
  assert([...planetNav.options].some((option) => option.value === "Earth"), "planet dropdown includes Earth");
  assert(![...planetNav.options].some((option) => option.value === "Moon"), "planet dropdown does not mix moon entries");

  planetNav.value = "Earth";
  planetNav.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => !moonNav.disabled, "moon dropdown enables for Earth");
  assert([...moonNav.options].some((option) => option.value === "Moon"), "moon dropdown includes the Moon");

  moonNav.value = "Moon";
  moonNav.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => doc.getElementById("info-title")?.textContent === "Moon", "Moon selection opens details");

  const planetLabel = await waitFor(
    () => doc.querySelector('.planet-label[data-planet="Earth"]'),
    "finds a planet label"
  );
  assert(planetLabel.tagName === "BUTTON", "planet labels are keyboard-focusable buttons");
  assert(planetLabel.getAttribute("aria-label") === "Focus Earth", "planet label has an accessible name");

  const planetLabelBtn = doc.getElementById("togglePlanetLabelsBtn");
  const moonLabelBtn = doc.getElementById("toggleMoonLabelsBtn");
  assert(planetLabelBtn?.getAttribute("aria-pressed") === "true", "planet label toggle starts pressed");
  assert(moonLabelBtn?.getAttribute("aria-pressed") === "false", "moon label toggle starts unpressed");

  planetLabelBtn.click();
  await wait(300);
  assert(planetLabelBtn.getAttribute("aria-pressed") === "false", "planet label toggle updates aria-pressed");
  assert(!visible(win, planetLabel), "planet label toggle hides labels");

  planetLabelBtn.click();
  await waitFor(() => planetLabelBtn.getAttribute("aria-pressed") === "true", "planet label toggle restores aria-pressed");

  moonLabelBtn.click();
  await waitFor(() => moonLabelBtn.getAttribute("aria-pressed") === "true", "moon label toggle updates aria-pressed");
  const moonLabel = await waitFor(
    () => [...doc.querySelectorAll(".planet-label.moon")].find((label) => label.textContent.includes("Moon")),
    "finds Moon label"
  );
  await waitFor(() => visible(win, moonLabel), "moon label toggle shows selected Moon label");

  const closeButton = doc.querySelector(".info-close-btn");
  assert(closeButton?.getAttribute("aria-label") === "Close body details", "details close button has an accessible name");

  const missingTextureNotes = await fetch("../Solar-System/solarsystem_data.json")
    .then((res) => res.json())
    .then((data) => {
      const notes = [];
      data.forEach((planet) => {
        (planet.moons || []).forEach((moon) => {
          if (moon.textureNote) notes.push(`${moon.name}: ${moon.textureNote}`);
        });
      });
      return notes;
    });
  assert(missingTextureNotes.some((note) => note.startsWith("Moon:")), "placeholder texture note exists for Moon");
  assert(missingTextureNotes.some((note) => note.startsWith("Titan:")), "placeholder texture note exists for Titan");
  assert(missingTextureNotes.some((note) => note.startsWith("Triton:")), "placeholder texture note exists for Triton");
}

runSolarSystemSmoke()
  .then(() => {
    log("DONE all browser checks passed");
    document.body.dataset.testStatus = "passed";
  })
  .catch((error) => {
    log(`FAIL ${error.stack || error.message}`);
    document.body.dataset.testStatus = "failed";
    throw error;
  });
