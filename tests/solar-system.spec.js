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
  const app = await win.eval('import("/Solar-System/src/core/state.js")');
  const state = app.getState();
  assert(doc.getElementById("errorOverlay")?.style.display !== "block", "app has no initialization error overlay");

  const planetNav = doc.getElementById("planetNav");
  const moonNav = doc.getElementById("moonNav");
  const menuToggle = doc.getElementById("menuToggle");
  assert(planetNav, "planet dropdown exists");
  assert(moonNav, "moon dropdown exists");
  assert(menuToggle?.getAttribute("aria-controls") === "controlSurface", "menu toggle names its controlled surface");
  assert(menuToggle?.getAttribute("aria-expanded") === "true", "desktop menu exposes its expanded state");
  assert([...planetNav.options].some((option) => option.value === "Earth"), "planet dropdown includes Earth");
  assert(![...planetNav.options].some((option) => option.value === "Moon"), "planet dropdown does not mix moon entries");

  planetNav.value = "Earth";
  planetNav.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => doc.getElementById("info-title")?.textContent === "Earth", "Earth selection opens details");
  await waitFor(() => !moonNav.disabled, "moon dropdown enables for Earth");
  assert([...moonNav.options].some((option) => option.value === "Moon"), "moon dropdown includes the Moon");

  const earthDistance = doc.getElementById("info-distance")?.textContent?.trim();
  assert(/^\d+\.\d{4} AU$/.test(earthDistance), "current planet distance uses bounded display precision");
  const orbitalText = doc.getElementById("info-orbital")?.textContent || "";
  assert(orbitalText.includes("Current Distance from Sun"), "details identify current heliocentric distance");
  assert(orbitalText.includes("Semi-major Axis"), "details distinguish semi-major axis from current distance");
  assert(orbitalText.includes("Kepler Period Estimate"), "details label the derived period as an estimate");
  assert(!orbitalText.includes("0.9992127576906509"), "details do not expose raw computational precision");

  const infoRect = doc.getElementById("info").getBoundingClientRect();
  assert(infoRect.top >= 0 && infoRect.bottom <= win.innerHeight, "details panel stays within desktop viewport bounds");
  assert(!doc.getElementById("modelAssumptions").open, "model notes start collapsed");
  assert(!doc.getElementById("info-technical").open, "body measurements start collapsed");
  const metadataRect = doc.getElementById("metadataDock").getBoundingClientRect();
  assert(infoRect.top >= metadataRect.bottom, "body details do not overlap metadata");
  const detailText = doc.getElementById("info-details").textContent;
  assert(detailText.includes("Minimum temperature") && detailText.includes("°C"), "technical fields have readable labels and units");
  assert(!detailText.includes("surfaceTempMinC") && !detailText.includes("true"), "technical details do not expose raw schema values");
  assert(!/\d+\.\d{5}/.test(detailText), "technical facts use bounded precision");
  assert(
    doc.getElementById("speedRate")?.textContent.includes("simulated days/s"),
    "speed control explains the real-to-simulated time rate"
  );
  assert(
    doc.getElementById("propagationMode")?.dataset.mode === "ephemeris",
    "orbit model identifies active ephemeris interpolation"
  );
  assert(
    /valid [A-Z][a-z]{2} \d{4}–[A-Z][a-z]{2} \d{4}/.test(doc.getElementById("ephemerisRange")?.textContent || ""),
    "model notes expose the ephemeris validity range"
  );

  moonNav.value = "Moon";
  moonNav.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => doc.getElementById("info-title")?.textContent === "Moon", "Moon selection opens details");
  await wait(400);
  assert(doc.getElementById("info-distance").textContent === "384,400 km", "Moon orbit size survives live readout updates");
  assert(doc.getElementById("info-distance-label").textContent.includes("Earth"), "moon distance identifies its reference body");
  assert(doc.getElementById("info-orbital").textContent.includes("Semi-major axis"), "moon orbit size is identified as a parameter");
  assert(!doc.getElementById("info-texture-note").hidden && doc.getElementById("info-texture-note").textContent.includes("Callisto"), "Moon texture disclosure appears on the body card");

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

  app.setSimulationSpeed(0);
  const scaleButton = doc.getElementById("toggleScaleModeBtn");
  scaleButton.click();
  const bodyRadius = (body) => {
    const mesh = body.userData.planetMesh || body;
    return mesh.geometry.parameters.radius * mesh.scale.x;
  };
  const earth = state.celestialBodies.find((body) => body.userData.name === "Earth");
  const jupiter = state.celestialBodies.find((body) => body.userData.name === "Jupiter");
  const moon = state.celestialBodies.find((body) => body.userData.name === "Moon");
  const sun = state.sun;
  for (const body of [sun, jupiter, moon]) {
    assert(Math.abs(bodyRadius(body) / bodyRadius(earth) - body.userData.config.actualRadius) < 1e-6,
      `${body.userData.name} shares Earth's relative body-size scale`);
  }
  assert(bodyRadius(sun) > bodyRadius(jupiter), "Sun remains larger than Jupiter in relative mode");
  planetLabel.click();
  assert(planetNav.value === "Earth" && !moonNav.disabled, "label navigation synchronizes both dropdowns");
  await waitFor(() => !state.frameRequested, "camera finishes framing relative-size Earth");
  assert(state.camera.position.distanceTo(state.controls.target) < bodyRadius(earth) * 9, "relative-size Earth can be inspected closely");
  state.controls.dispatchEvent({ type: "start" });
  assert(state.followTarget === earth && !state.frameRequested, "manual navigation retains tracking without restarting camera framing");
  state.controls.dispatchEvent({ type: "end" });
  const offset = state.camera.position.clone().sub(state.controls.target);
  await wait(400);
  assert(state.camera.position.clone().sub(state.controls.target).distanceTo(offset) < 0.001, "camera preserves the user's viewing offset");

  doc.getElementById("topDownBtn").click();
  assert(Math.hypot(state.camera.position.x, state.camera.position.z) / state.camera.position.y < 1e-5,
    "top-down view looks from ecliptic north");
  assert(state.camera.up.z === -1 && state.controls.target.length() < 1e-6, "top-down view has a stable screen orientation and Sun-centered target");
  assert(state.followTarget === null, "view presets release body tracking");
  scaleButton.click();

  win.__solarSystemLearningTools.api.startTour();
  const tourRect = doc.querySelector(".learning-tools-tour").getBoundingClientRect();
  const tourInfoRect = doc.getElementById("info").getBoundingClientRect();
  assert(tourRect.top >= tourInfoRect.bottom, "tour and body card share space without overlap");
  win.__solarSystemLearningTools.api.endTour();

  const missingTextureNotes = await fetch("../Solar-System/data/solar-system.json")
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

  const mobileFrame = document.createElement("iframe");
  mobileFrame.title = "Solar System mobile app under test";
  mobileFrame.src = "../Solar-System/?worker=off";
  mobileFrame.style.width = "390px";
  mobileFrame.style.maxWidth = "none";
  mobileFrame.style.height = "844px";
  document.querySelector("main").appendChild(mobileFrame);

  const mobileWin = await waitFor(
    () => mobileFrame.contentWindow?.location?.pathname === "/Solar-System/" && mobileFrame.contentWindow,
    "loads mobile Solar System iframe"
  );
  const mobileDoc = mobileWin.document;
  await waitFor(() => mobileDoc.querySelector("canvas"), "renders the mobile canvas");
  await waitFor(() => mobileDoc.querySelectorAll(".planet-label").length >= 9, "creates mobile labels");

  const mobileMenu = mobileDoc.getElementById("menuContainer");
  const mobileToggle = mobileDoc.getElementById("menuToggle");
  assert(mobileMenu.classList.contains("collapsed"), "mobile controls start collapsed");
  assert(mobileToggle.getAttribute("aria-expanded") === "false", "mobile toggle exposes its collapsed state");
  await waitFor(() => {
    const toggleRect = mobileToggle.getBoundingClientRect();
    const toggleHit = mobileDoc.elementFromPoint(
      toggleRect.left + toggleRect.width / 2,
      toggleRect.top + toggleRect.height / 2
    );
    return toggleHit === mobileToggle;
  }, "mobile control opener is visible and hit-testable");
  assert(true, "mobile control opener is visible and hit-testable");

  mobileToggle.click();
  await waitFor(() => mobileToggle.getAttribute("aria-expanded") === "true", "mobile control drawer opens");
  assert(!mobileMenu.classList.contains("collapsed"), "mobile drawer removes its collapsed state");
  const mobileSurface = mobileDoc.getElementById("controlSurface");
  const mobileSurfaceRect = mobileSurface.getBoundingClientRect();
  assert(mobileSurfaceRect.bottom <= mobileWin.innerHeight, "mobile control surface stays within the viewport");
  assert(
    mobileWin.getComputedStyle(mobileSurface).overflowY === "auto",
    "mobile controls scroll inside the drawer without clipping its opener"
  );
  const mobilePlanetNav = mobileDoc.getElementById("planetNav");
  mobilePlanetNav.value = "Earth";
  mobilePlanetNav.dispatchEvent(new Event("change", { bubbles: true }));
  mobileToggle.click();
  const firstDistance = mobileDoc.getElementById("info-distance").textContent;
  await waitFor(() => mobileDoc.getElementById("info-distance").textContent !== firstDistance,
    "mobile planet distance remains live");
  const mobileInfo = mobileDoc.getElementById("info").getBoundingClientRect();
  const mobileMetadata = mobileDoc.getElementById("metadataDock").getBoundingClientRect();
  assert(mobileInfo.top >= mobileMetadata.bottom && mobileInfo.bottom <= mobileWin.innerHeight,
    "mobile body details stay clear of metadata and within the viewport");

  const mobileState = await mobileWin.eval('import("/Solar-System/src/core/state.js")');
  const fallbackEarth = mobileState.getPlanets().find((body) => body.userData.name === "Earth");
  const initialPosition = fallbackEarth.position.clone();
  await waitFor(() => fallbackEarth.position.distanceTo(initialPosition) > 0.01,
    "main-thread fallback advances planet positions");
  assert(true, "main-thread fallback advances planet positions");

  const application = await mobileWin.eval('import("/Solar-System/src/app/application.js")');
  application.cleanup();
  assert(!mobileDoc.querySelector("canvas") && !mobileDoc.querySelector(".planet-label"),
    "cleanup removes the renderer and generated labels");
  await wait(150);
  assert(mobileState.getSimulatedDays() === 0 && mobileState.getScene() === null,
    "cleanup stops frame updates and clears shared state");

  mobileWin.history.replaceState(null, "", "?worker=on");
  await application.init();
  assert(mobileDoc.querySelectorAll("canvas").length === 1 && mobileState.getPlanets().length === 8,
    "restart creates one renderer and one planet catalog");
  mobileDoc.getElementById("togglePlaybackBtn").click();
  assert(mobileState.getSimulationSpeed() === 0, "restart binds the playback button once");
  mobileWin.dispatchEvent(new mobileWin.KeyboardEvent("keydown", { key: " ", bubbles: true }));
  assert(mobileState.getSimulationSpeed() === 1, "restart binds keyboard playback once");
  const restartedEarth = mobileState.getPlanets().find((body) => body.userData.name === "Earth");
  await waitFor(() => restartedEarth.position.length() > 0, "restarted worker supplies planet positions");
  const restartedPosition = restartedEarth.position.clone();
  await waitFor(() => restartedEarth.position.distanceTo(restartedPosition) > 0.01,
    "restarted simulation continues moving");
  assert(true, "restarted simulation continues moving");

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
