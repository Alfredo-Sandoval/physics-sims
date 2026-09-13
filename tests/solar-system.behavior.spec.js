export async function runBehaviorChecks(win, { assert, wait, waitFor }) {
  const doc = win.document;
  const app = await win.eval('import("/Solar-System/src/core/state.js")');
  const ui = await win.eval('import("/Solar-System/src/ui/index.js")');
  const playback = await win.eval('import("/Solar-System/src/ui/playback.js")');
  const solver = await win.eval('import("/Solar-System/src/simulation/positions.js")');
  const config = await win.eval('import("/Solar-System/src/core/config.js")');
  const state = app.getState();
  const renderer = state.renderer;
  const earth = state.planets.find((body) => body.userData.name === "Earth");
  const moon = state.moons.find((body) => body.userData.name === "Moon");
  const epoch = Date.parse(earth.userData.config.kepler.epochDateUtc);
  const input = doc.getElementById("datePicker");
  const setDate = (value) => {
    input.value = value;
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
  };
  const nextDraw = async (action) => {
    const before = renderer.userData.drawState.frames;
    action();
    await waitFor(() => renderer.userData.drawState.frames > before, "requested change draws a frame");
  };
  const snapshot = () => state.celestialBodies.filter((body) => ["planet", "moon"].includes(body.userData.type))
    .flatMap((body) => [...body.position.toArray(), ...(body.userData.planetMesh ?? body).quaternion.toArray()]);

  playback.applySimulationSpeed(0);
  // Exercise the rendered surface at the orbital clock's actual 1× rate.
  await nextDraw(() => app.seekToDays(0));
  for (const seconds of [0.1, 1]) {
    await nextDraw(() => app.seekToDays(seconds * config.DAYS_PER_SIM_SECOND_AT_1X));
    const angle = earth.userData.planetMesh.rotation.y;
    assert(angle > seconds * 2 * Math.PI / 21 && angle < seconds * 2 * Math.PI / 19,
      `Earth's displayed spin takes about 20 seconds per turn at 1× (${seconds}s sample)`);
  }
  await nextDraw(() => { setDate("2025-03-15"); setDate("2026-06-20"); });
  const expectedDays = (Date.parse("2026-06-20T12:00:00Z") - epoch) / 86400000;
  assert(Math.abs(app.getSimulatedDays() - expectedDays) < 1e-9, "rapid date changes keep the latest target");
  const first = snapshot();
  await nextDraw(() => setDate("2010-01-01"));
  await nextDraw(() => setDate("2026-06-20"));
  const second = snapshot();
  assert(first.every((value, i) => Math.abs(value - second[i]) < 1e-8), "revisiting a date restores planet and moon positions and spins");
  const moonBefore = moon.position.clone();
  await nextDraw(() => doc.getElementById("stepForwardDayBtn").click());
  assert(Math.abs(app.getSimulatedDays() - expectedDays - 1) < 1e-9 && app.getSimulationSpeed() === 0,
    "day stepping advances one day and preserves pause");
  assert(moon.position.distanceTo(moonBefore) > 0.01, "day stepping advances the Moon's orbital phase");
  await nextDraw(() => doc.getElementById("stepBackDayBtn").click());
  assert(moon.position.distanceTo(moonBefore) < 1e-8, "backward day stepping restores the Moon");
  await nextDraw(() => app.seekToDays((Date.parse("2026-06-20T02:00:00Z") - epoch) / 86400000));
  assert(doc.getElementById("dayCounter").textContent === "20 Jun 2026", "live date follows UTC midnight rather than the epoch's time of day");
  await nextDraw(() => doc.getElementById("todayBtn").click());
  assert(Math.abs(app.getSimulatedDays() - (Date.now() - epoch) / 86400000) < 0.0001 && app.getSimulationSpeed() === 0,
    "Today returns to the current time without resuming playback");

  doc.getElementById("reversePlaybackBtn").click();
  assert(app.getSimulationSpeed() === 0, "changing playback direction preserves pause");
  doc.getElementById("togglePlaybackBtn").click();
  const reverseStart = app.getSimulatedDays();
  await waitFor(() => app.getSimulatedDays() < reverseStart - 0.01, "reverse playback runs backward");
  assert(doc.getElementById("speedRate").textContent.startsWith("Reverse"), "reverse playback is explained beside its rate");
  doc.getElementById("togglePlaybackBtn").click();
  doc.getElementById("togglePlaybackBtn").click();
  assert(app.getSimulationSpeed() < 0, "resume retains reverse direction");
  playback.applySimulationSpeed(0);

  // Compare actual worker output with the same main-thread solver, including outside ephemeris coverage.
  const worker = new win.Worker("/Solar-System/src/simulation/workers/orbitWorker.js", { type: "module" });
  const receive = () => new Promise((resolve, reject) => { worker.onmessage = (event) => resolve(event.data); worker.onerror = reject; });
  let response = receive();
  worker.postMessage({ type: "INIT", data: { planets: [earth.userData.config] } });
  await response;
  for (const days of [expectedDays, -50000]) {
    response = receive();
    const outBuffer = new win.ArrayBuffer(24);
    worker.postMessage({ type: "UPDATE_POSITIONS_BUFFER", data: { simulatedDays: days, revision: 0, orbitScaleFactor: 100, outBuffer } }, [outBuffer]);
    const data = (await response).data;
    const actual = new win.Float64Array(data.outBuffer);
    const expected = solver.getPlanetPositionAU(earth.userData.config, days);
    assert(Math.max(Math.abs(actual[0] - expected.x * 100), Math.abs(actual[1] - expected.z * 100), Math.abs(actual[2] - expected.y * 100)) < 1e-9,
      `worker and main-thread positions agree at day ${days}`);
  }
  worker.terminate();

  const belts = await win.eval('import("/Solar-System/src/simulation/beltWorkerClient.js")');
  const samples = [];
  const testBeltId = "date-race-test";
  belts.registerWorkerBelt({ beltId: testBeltId, orbitScaleFactor: 100,
    instances: [{ orbitalParams: { a: 1, e: 0, i: 0, Omega: 0, omega: 0, M0: 0, T: 4 },
      rotation: [0, 0, 0], rotationSpeed: [0, 0, 0], scale: [1, 1, 1] }],
    onMatrices: (matrix) => samples.push([...matrix]),
  });
  app.seekToDays(0);
  belts.requestWorkerBeltUpdate(testBeltId, 0, 0);
  app.seekToDays(1);
  belts.requestWorkerBeltUpdate(testBeltId, 1, 0);
  await waitFor(() => samples.length > 0, "latest queued belt date arrives");
  assert(samples.length === 1 && Math.abs(samples[0][12]) < 1e-6 && Math.abs(samples[0][14] - 100) < 1e-6,
    "stale belt responses are discarded and the latest date is applied");
  app.seekToDays(0);
  belts.requestWorkerBeltUpdate(testBeltId, 0, 0);
  await waitFor(() => samples.length > 1, "backward belt date arrives");
  assert(Math.abs(samples[1][12] - 100) < 1e-6 && Math.abs(samples[1][14]) < 1e-6,
    "belt positions return to the earlier date");
  belts.unregisterWorkerBelt(testBeltId);

  const moonPaths = [];
  state.scene.traverse((object) => { if (object.userData.isMoonOrbit) moonPaths.push(object); });
  ui.selectObject(earth);
  await waitFor(() => !state.frameRequested, "Earth framing settles");
  assert(moonPaths.some((path) => path.visible) && moonPaths.every((path) =>
    path.visible === (path.userData.parentPlanetName === "Earth")), "selecting Earth shows only Earth's moon paths");
  assert(doc.querySelector('.planet-label[data-planet="Earth"]').getAttribute("aria-pressed") === "true",
    "the selected body's label exposes its selected state");
  doc.getElementById("toggleOrbitsBtn").click();
  ui.selectObject(moon);
  assert(moonPaths.every((path) => !path.visible), "hidden orbits stay hidden when selecting a moon");
  doc.getElementById("toggleOrbitsBtn").click();
  assert(moonPaths.some((path) => path.visible) && moonPaths.every((path) =>
    path.visible === (path.userData.parentPlanetName === "Earth")), "selecting a moon retains its planet's orbit context");
  ui.selectObject(earth);
  await waitFor(() => !state.frameRequested, "Earth framing settles again");
  state.camera.position.lerp(state.controls.target, 0.6);
  state.controls.update();
  await waitFor(() => earth.userData.planetMesh.userData.detailLevel === "high", "zooming in increases geometry detail");
  assert(true, "close inspection uses detailed geometry");
  if (earth.userData.planetMesh.material.map.userData.originalSize > 1024) {
    await waitFor(() => earth.userData.planetMesh.material.map.userData.maxSize === 2048,
      "close inspection promotes the texture");
    assert(true, "close inspection uses a sharper source texture");
  }
  const cameraBefore = state.camera.position.clone();
  const targetBefore = state.controls.target.clone();
  doc.getElementById("trackBodyBtn").click();
  assert(!state.followTarget && state.selectedObject === earth, "tracking can stop without clearing the selected body");
  doc.getElementById("trackBodyBtn").click();
  assert(state.followTarget === earth && !state.frameRequested, "tracking resumes without reframing the camera");
  ui.selectObject(moon);
  await waitFor(() => !state.frameRequested, "Moon framing settles");
  doc.getElementById("backViewBtn").click();
  assert(state.selectedObject === earth && state.followTarget === earth, "Back restores the prior selected and followed body");
  assert(state.camera.position.distanceTo(cameraBefore) < 1e-7 && state.controls.target.distanceTo(targetBefore) < 1e-7,
    "Back restores the prior camera position and target");
  doc.getElementById("wholeSystemBtn").click();
  await waitFor(() => earth.userData.planetMesh.userData.detailLevel === "low", "distant Earth uses reduced geometry");
  assert(true, "zooming out reduces geometry detail");
  assert(moonPaths.every((path) => !path.visible), "the system overview hides moon paths");

  await wait(900);
  const idleStart = renderer.userData.drawState.frames;
  await wait(700);
  assert(renderer.userData.drawState.frames === idleStart, "settled pause draws zero extra frames");
  await nextDraw(() => doc.getElementById("toggleOrbitsBtn").click());
  assert(app.getSimulationSpeed() === 0, "a paused layer change redraws without advancing time");

  const labels = [...doc.querySelectorAll(".planet-label")].filter((element) => win.getComputedStyle(element).display !== "none");
  const rectangles = labels.map((element) => element.getBoundingClientRect());
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  assert(rectangles.every((rect, i) => rectangles.slice(i + 1).every((other) => !overlaps(rect, other))),
    "visible label text boxes do not overlap");
  const reserved = ["controlSurface", "metadataDock"].map((id) => doc.getElementById(id).getBoundingClientRect());
  assert(rectangles.every((rect) => reserved.every((panel) => !overlaps(rect, panel))), "labels stay clear of control and metadata panels");

  // Aim just outside a two-pixel planet: its visual size stays unchanged.
  app.stopCameraFollow(); ui.deselectObject();
  const center = earth.getWorldPosition(state.camera.position.clone());
  const mesh = earth.userData.planetMesh;
  const physicalDisplayRadius = mesh.geometry.parameters.radius * mesh.scale.x;
  const pixelsPerUnit = renderer.domElement.clientHeight / (2 * Math.tan(state.camera.fov * Math.PI / 360));
  const distance = physicalDisplayRadius * pixelsPerUnit / 2;
  state.camera.position.sub(center).normalize().multiplyScalar(distance).add(center);
  state.controls.target.copy(center); state.controls.update();
  state.camera.updateMatrixWorld();
  const point = center.clone().project(state.camera);
  const canvasRect = renderer.domElement.getBoundingClientRect();
  const clickX = canvasRect.left + (point.x * 0.5 + 0.5) * canvasRect.width + 8;
  const clickY = canvasRect.top + (-point.y * 0.5 + 0.5) * canvasRect.height;
  const pointerOptions = { pointerId: 7, isPrimary: true, pointerType: "mouse", button: 0, clientX: clickX, clientY: clickY, bubbles: true };
  const controlsEnabled = state.controls.enabled;
  state.controls.enabled = false;
  try {
    renderer.domElement.dispatchEvent(new win.PointerEvent("pointerdown", pointerOptions));
    renderer.domElement.dispatchEvent(new win.PointerEvent("pointerup", pointerOptions));
  } finally { state.controls.enabled = controlsEnabled; }
  assert(state.selectedObject === earth, "tiny planets accept a nearby click without enlarging their rendered size");
  doc.getElementById("wholeSystemBtn").click();

}
