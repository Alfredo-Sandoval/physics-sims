export async function checkRotation(win, { assert, nextDraw, app, state, config }) {
  const THREE = await win.eval('import("three")');
  const pole = (mesh) => new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  await nextDraw(() => app.seekToDays(0));
  const poles = state.planets.map((body) => pole(body.userData.planetMesh));
  for (const seconds of [0.1, 1, 5]) {
    await nextDraw(() => app.seekToDays(seconds * config.DAYS_PER_SIM_SECOND_AT_1X));
    for (const [index, body] of state.planets.entries()) {
      const mesh = body.userData.planetMesh;
      assert(pole(mesh).distanceTo(poles[index]) < 1e-10,
        `${body.userData.name}'s pole stays fixed while its surface rotates (${seconds}s)`);
      if (seconds === 1) {
        // At most one minute per displayed turn; catch the old 19/80-minute rotations.
        assert(mesh.rotation.y >= 2 * Math.PI / 60 - 1e-10 && mesh.rotation.y < Math.PI,
          `${body.userData.name} has visible, readable surface motion at 1×`);
      }
    }
    const earth = state.planets.find((body) => body.userData.name === "Earth");
    assert(earth.userData.planetMesh.rotation.y > seconds * 2 * Math.PI / 21 &&
      earth.userData.planetMesh.rotation.y < seconds * 2 * Math.PI / 19,
      `Earth's surface takes about 20 seconds per turn at 1× (${seconds}s)`);
  }
}

// Checks orbits and spins against each other, so a mirrored scene or a mis-aimed pole fails.
export async function checkOrientation(win, { assert, nextDraw, app, state }) {
  const THREE = await win.eval('import("three")');
  const epoch = Date.parse(state.planets[0].userData.config.kepler.epochDateUtc);
  const daysAt = (iso) => (Date.parse(iso) - epoch) / 86400000;
  const world = (object) => object.getWorldPosition(new THREE.Vector3());
  const turn = (object) => object.getWorldQuaternion(new THREE.Quaternion());
  const longitude = (v) => Math.atan2(-v.z, v.x);
  const degreesBetween = (a, b) => a.angleTo(b) * 180 / Math.PI;
  // Axis about which the body turned positively between two orientations.
  const spinAxis = (before, after) => {
    const delta = after.clone().multiply(before.clone().invert());
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
    return new THREE.Vector3(delta.x, delta.y, delta.z).normalize();
  };
  const sample = async (days, read) => { await nextDraw(() => app.seekToDays(days)); return read(); };

  const start = daysAt("2026-03-01T00:00:00Z");
  const before = await sample(start, () => state.planets.map((body) => [world(body), turn(body.userData.planetMesh)]));
  const after = await sample(start + 1, () => state.planets.map((body) => [world(body), turn(body.userData.planetMesh)]));
  for (const [index, body] of state.planets.entries()) {
    const orbitNormal = before[index][0].clone().cross(after[index][0]).normalize();
    const axis = spinAxis(before[index][1], after[index][1]);
    assert(orbitNormal.y > 0.95, `${body.userData.name} orbits counterclockwise seen from ecliptic north`);
    assert(Math.abs(degreesBetween(orbitNormal, axis) - body.userData.config.axialTilt) < 0.6,
      `${body.userData.name}'s spin sits at its axial tilt from its own orbit, including retrograde spins`);
  }

  const earth = state.planets.find((body) => body.userData.name === "Earth");
  for (const [iso, sign, season] of [["2026-06-21T08:00:00Z", 1, "June"], ["2026-12-21T20:00:00Z", -1, "December"]]) {
    const lean = await sample(daysAt(iso), () => {
      const toSun = world(earth).negate().normalize();
      return new THREE.Vector3(0, 1, 0).applyQuaternion(turn(earth.userData.planetMesh)).dot(toSun);
    });
    assert(Math.abs(lean - sign * Math.sin(23.44 * Math.PI / 180)) < 0.01,
      `Earth's north pole leans ${sign > 0 ? "toward" : "away from"} the Sun at the ${season} solstice`);
  }

  for (const name of ["Moon", "Triton"]) {
    const moon = state.moons.find((body) => body.userData.name === name);
    const planet = state.planets.find((body) => body.userData.name === moon.userData.parentPlanetName);
    const period = Math.abs(moon.userData.config.orbitalPeriod);
    const facing = [];
    for (let step = 0; step < 4; step++) {
      facing.push(await sample(start + step * period / 4, () =>
        world(planet).sub(world(moon)).applyQuaternion(turn(moon).invert()).normalize()));
    }
    const drift = Math.max(...facing.map((dir) => degreesBetween(dir, facing[0])));
    assert(drift < 15, `${name} keeps one face toward ${planet.userData.name} (drift ${drift.toFixed(1)}°)`);
    if (name === "Triton") {
      const relative = async (days) => sample(days, () => world(moon).sub(world(planet)));
      const orbitNormal = (await relative(start)).cross(await relative(start + period / 8)).normalize();
      const neptunePole = new THREE.Vector3(0, 1, 0).applyQuaternion(turn(planet.userData.planetMesh));
      assert(orbitNormal.dot(neptunePole) < -0.8, "Triton orbits against Neptune's spin");
    }
  }

  // Mean lunations from the Meeus series; true phases differ by under a day (~12°).
  const moon = state.moons.find((body) => body.userData.name === "Moon");
  for (const [iso, expected, phase] of [["2026-09-11T16:37:00Z", 0, "new"], ["2026-09-26T11:00:00Z", 180, "full"]]) {
    const elongation = await sample(daysAt(iso), () => {
      const toMoon = world(moon).sub(world(earth));
      return THREE.MathUtils.euclideanModulo((longitude(toMoon) - longitude(world(earth).negate())) * 180 / Math.PI, 360);
    });
    const miss = Math.abs(THREE.MathUtils.euclideanModulo(elongation - expected + 180, 360) - 180);
    assert(miss < 10, `the Moon is ${phase} on its ${iso.slice(0, 10)} lunation (off by ${miss.toFixed(1)}°)`);
  }

  const trojans = await sample(start, () => {
    const jupiter = state.planets.find((body) => body.userData.name === "Jupiter");
    const lead = state.scene.getObjectByName("JupiterL4");
    const centroid = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < lead.count; i++) {
      lead.getMatrixAt(i, matrix);
      centroid.add(new THREE.Vector3().setFromMatrixPosition(matrix.premultiply(lead.matrixWorld)));
    }
    return THREE.MathUtils.euclideanModulo((longitude(centroid) - longitude(world(jupiter))) * 180 / Math.PI + 180, 360) - 180;
  });
  assert(Math.abs(trojans - 60) < 10, `the L4 Trojans lead Jupiter by about 60° (${trojans.toFixed(1)}°)`);
}

export async function checkKeyboard(win, { assert, waitFor, app, playback, state }) {
  const doc = win.document;
  const press = (key, target = doc.body) =>
    target.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  const selectedName = () => app.getSelectedObject()?.userData.name ?? null;

  playback.applySimulationSpeed(-1);
  press("-");
  assert(app.getSimulationSpeed() === -0.5, "slowing reverse playback keeps it in reverse");
  playback.applySimulationSpeed(0);
  press("+");
  assert(app.getSimulationSpeed() === 0 && playback.getResumeSpeed() === -1,
    "speeding up while paused stays paused and keeps the direction");

  const pause = doc.getElementById("togglePlaybackBtn");
  pause.focus();
  press("3", pause);
  assert(selectedName() === "Earth", "number shortcuts work while a button has focus");
  const heading = doc.getElementById("controls-view-heading");
  heading.focus();
  press(" ", heading);
  assert(app.getSimulationSpeed() === 0, "Space on a focused section heading leaves playback alone");

  press("Escape");
  assert(selectedName() === null, "Escape deselects the selected body");

  pause.focus();
  press("/", pause);
  await waitFor(() => doc.activeElement?.closest("[role='dialog']"), "search palette opens");
  press("Enter", doc.activeElement);
  assert(selectedName() === "Sun", "the search palette's first result is a body, not a placeholder");
  assert(doc.activeElement === pause, "the search palette returns focus where it opened");
  press("Escape");
  assert(selectedName() === null && state.planets.length > 0, "Escape still deselects after using the palette");

  press("8");
  doc.getElementById("topDownBtn").click();
  assert(selectedName() === "Neptune", "Top-Down keeps the selected body, as the outer-planets tour stop needs");
  const neptune = state.planets.find((body) => body.userData.name === "Neptune");
  const THREE = await win.eval('import("three")');
  const onScreen = neptune.getWorldPosition(new THREE.Vector3()).project(state.camera);
  assert(Math.abs(onScreen.x) < 1 && Math.abs(onScreen.y) < 1, "Top-Down frames the selected body");
  press("Escape");
}

export async function checkRendering(win, { assert, waitFor, nextDraw, app, playback, state, config }) {
  const belts = [];
  state.scene.traverse((object) => { if (object.isInstancedMesh && object.instanceColor) belts.push(object); });
  const tint = belts[0] && [0, 1, 2].map((channel) => belts[0].instanceColor.array[channel]);
  assert(belts.length > 0 && belts.every((mesh) => !mesh.material.vertexColors) &&
    tint[0] === tint[1] && tint[1] === tint[2], "belt rocks keep their material color, lightly jittered, not black");
  assert(state.renderer.capabilities.precision === "highp" || !state.renderer.capabilities.isWebGL2,
    "the renderer keeps high precision for distant lighting");
  const light = state.scene.children.find((child) => child.isPointLight && child.castShadow);
  const neptune = state.planets.find((body) => body.userData.name === "Neptune");
  assert(light.shadow.camera.far > neptune.position.length(), "point-light shadows reach Neptune");

  const sun = state.scene.children.find((child) => child.userData?.name === "Sun");
  const mercury = state.planets.find((body) => body.userData.name === "Mercury");
  const perihelion = mercury.userData.config.orbitRadiusAU * (1 - mercury.userData.config.info.orbitalEccentricity) *
    config.ORBIT_SCALE_FACTOR;
  assert(perihelion - config.SUN_RADIUS * sun.scale.x > 10, "Mercury clears the enhanced-visibility Sun");

  await nextDraw(() => state.controls.dispatchEvent({ type: "change" }));
  const sky = state.scene.getObjectByName("starfield");
  assert(sky.position.distanceTo(state.camera.position) < 1e-9, "the sky stays centred on the camera");
  assert(state.controls.maxDistance + 50 * config.ORBIT_SCALE_FACTOR <= state.camera.far,
    "the farthest zoom keeps the Kuiper belt inside the far plane");

  // A throttled belt request must leave the date pending so a later paused frame retries.
  const { updateAsteroidBelt } = await win.eval('import("/Solar-System/src/rendering/belts/asteroidBelt.js")');
  const asteroidBelt = app.getAsteroidBelt();
  const wasVisible = asteroidBelt.visible;
  const savedCamera = state.camera.position.clone();
  asteroidBelt.visible = true;
  state.camera.position.set(0, 200, 200);
  updateAsteroidBelt(asteroidBelt, 0, false);
  asteroidBelt.userData.lastUpdateMs = win.performance.now();
  assert(updateAsteroidBelt(asteroidBelt, 0, true) === false, "a throttled belt update reports its date as pending");
  await nextDraw(() => app.seekToDays(app.getSimulatedDays() + 3));
  await waitFor(() => asteroidBelt.userData.lastRenderedDay === app.getSimulatedDays(),
    "a paused belt catches up to the paused date");
  assert(true, "pausing never leaves the asteroid belt on an older date");
  state.camera.position.copy(savedCamera);
  asteroidBelt.visible = wasVisible;

  const { PerformanceTuner } = await win.eval('import("/Solar-System/src/rendering/quality.js")');
  let ratio = 2;
  const tuner = new PerformanceTuner({ getPixelRatio: () => ratio, setPixelRatio: (value) => { ratio = value; } });
  const realNow = win.performance.now.bind(win.performance);
  let clock = realNow();
  win.performance.now = () => clock;
  try {
    for (let frame = 0; frame < 400; frame++) { clock += 1000 / 30; tuner.tick(1 / 30); }
  } finally {
    win.performance.now = realNow;
  }
  assert(ratio === 2, "a 30 Hz display cap does not leave quality stuck at its minimum");
  tuner.setMaxPixelRatio(1);
  assert(ratio === 1, "a device-pixel-ratio change resizes the drawing buffer");
}

export async function checkMenu(win, { assert, waitFor }) {
  const doc = win.document;
  const toggle = doc.getElementById("menuToggle");
  const surface = doc.getElementById("controlSurface");
  toggle.focus(); toggle.click();
  doc.getElementById("speedSlider").focus();
  assert(doc.activeElement === toggle, "collapsed controls cannot steal keyboard focus");
  const frame = win.frameElement;
  const originalWidth = frame.style.width;
  frame.style.width = "390px";
  await waitFor(() => win.innerWidth === 390, "phone viewport applies");
  toggle.click(); toggle.click();
  frame.style.width = "1000px";
  await waitFor(() => win.innerWidth === 1000, "desktop viewport applies");
  await waitFor(() => {
    const r = toggle.getBoundingClientRect();
    return r.left >= 0 && r.right <= win.innerWidth &&
      doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === toggle;
  }, "collapsed control opener remains visible and clickable after phone-to-desktop resize");
  assert(true, "control opener survives resizing across the phone breakpoint");
  toggle.click();
  doc.getElementById("speedSlider").focus();
  assert(surface.contains(doc.activeElement), "reopened controls accept keyboard focus");
  frame.style.width = originalWidth;
}

export async function checkInspectionLabel(win, body, state, { assert, waitFor }) {
  const mesh = body.userData.planetMesh;
  const center = body.getWorldPosition(state.camera.position.clone());
  const depth = -center.clone().applyMatrix4(state.camera.matrixWorldInverse).z;
  const radius = mesh.geometry.parameters.radius * mesh.scale.x / depth * win.innerHeight /
    (2 * Math.tan(state.camera.fov * Math.PI / 360));
  center.project(state.camera);
  const x = (center.x + 1) * win.innerWidth / 2, y = (1 - center.y) * win.innerHeight / 2;
  const label = win.document.querySelector(`.planet-label[data-planet="${body.userData.name}"]`);
  await waitFor(() => {
    const r = label.getBoundingClientRect();
    return win.getComputedStyle(label).display !== "none" &&
      (r.right < x - radius || r.left > x + radius || r.bottom < y - radius || r.top > y + radius);
  }, "selected planet label settles outside its visible surface");
  assert(true, "the selected planet's label stays outside its visible surface");
}
