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
  for (const body of state.planets) {
    const axis = pole(body.userData.planetMesh);
    const tilt = body.userData.config.axialTilt * Math.PI / 180;
    assert(Math.abs(axis.x + Math.sin(tilt)) < 1e-10 && Math.abs(axis.y - Math.cos(tilt)) < 1e-10,
      `${body.userData.name} retains its configured axial tilt, including retrograde poles`);
  }
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
