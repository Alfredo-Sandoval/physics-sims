import { getPlanetPositionAU } from "../positions.js";
let planets = [];
self.onmessage = ({ data: message }) => {
  if (message.type === "INIT") {
    planets = message.data.planets;
    self.postMessage({ type: "INIT_DONE" });
  } else if (message.type === "UPDATE_POSITIONS_BUFFER") {
    const { simulatedDays, revision, orbitScaleFactor, outBuffer } = message.data;
    const positions = new Float64Array(outBuffer);
    for (let i = 0; i < planets.length; i++) {
      const p = getPlanetPositionAU(planets[i], simulatedDays);
      positions.set([p.x * orbitScaleFactor, p.z * orbitScaleFactor, p.y * orbitScaleFactor], i * 3);
    }
    self.postMessage({ type: "POSITIONS_UPDATED_BUFFER", data: { outBuffer, simulatedDays, revision } }, [outBuffer]);
  }
};
