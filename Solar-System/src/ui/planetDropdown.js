import { error as logError } from "../core/logger.js";

export function setupPlanetDropdown(planets, sunMesh) {
  const sel = document.getElementById("planetNav");
  if (!sel) {
    logError("UI", "planetNav dropdown missing");
    return;
  }

  // Wipe existing options safely
  sel.textContent = "";
  const defOpt = document.createElement("option");
  defOpt.value = "";
  defOpt.textContent = "Select Body..."; // Changed text
  defOpt.disabled = true;
  defOpt.selected = true;
  sel.appendChild(defOpt);

  // Sun
  if (sunMesh?.userData?.name) {
    const o = document.createElement("option");
    o.value = o.textContent = sunMesh.userData.name;
    sel.appendChild(o);
  }

  // Planets
  planets.forEach((g) => {
    if (g?.userData?.name) {
      const o = document.createElement("option");
      o.value = o.textContent = g.userData.name;
      sel.appendChild(o);
    }
  });

  // event handled in Controls.setupUIControls (for live select)
}
