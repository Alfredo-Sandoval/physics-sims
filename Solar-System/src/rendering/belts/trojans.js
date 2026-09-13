import { createRandom } from "../../core/random.js";
let random = createRandom("createJupiterTrojans");
import * as THREE from "three";
import * as CONSTANTS from "../../core/config.js";
import { info as logInfo, warn as logWarn } from "../../core/logger.js";

export function createJupiterTrojans(scene, planets, planetConfigs) {
  random = createRandom("createJupiterTrojans");
  // Find Jupiter
  const jupiterPlanet = planets.find((p) => p.userData.name === "Jupiter");
  if (!jupiterPlanet) {
    logWarn("JupiterTrojans", "Jupiter not found, skipping Trojans");
    return;
  }

  const jupiterConfig = planetConfigs.find((p) => p.name === "Jupiter");
  if (!jupiterConfig) {
    logWarn("JupiterTrojans", "Jupiter config not found, skipping Trojans");
    return;
  }

  // The entire trojansGroup rotates around Y to track Jupiter's orbital angle
  const trojansGroup = new THREE.Group();
  trojansGroup.name = "JupiterTrojans";
  trojansGroup.userData.jupiterPlanet = jupiterPlanet;
  scene.add(trojansGroup);

  const jupiterAU = jupiterConfig.orbitRadiusAU;
  const jupiterScalePos = jupiterAU * CONSTANTS.ORBIT_SCALE_FACTOR;

  const l4Angle = (CONSTANTS.JUPITER_L4_OFFSET_DEG * Math.PI) / 180;
  const l5Angle = (CONSTANTS.JUPITER_L5_OFFSET_DEG * Math.PI) / 180;

  const l4Count = Math.floor(CONSTANTS.JUPITER_TROJANS_COUNT / 2);
  const l5Count = CONSTANTS.JUPITER_TROJANS_COUNT - l4Count;

  const trojanMaterial = new THREE.MeshStandardMaterial({
    color: CONSTANTS.JUPITER_TROJAN_COLOR,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: false,
    side: THREE.FrontSide,
  });

  const geom = new THREE.IcosahedronGeometry(1, 0);

  // Use InstancedMesh for L4 and L5 groups (single draw call each)
  function createTrojansInstanced(centerAngle, count, pointName) {
    const inst = new THREE.InstancedMesh(geom, trojanMaterial, count);
    inst.name = `Jupiter${pointName}`;
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = CONSTANTS.ENABLE_FRUSTUM_CULLING;

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const angleSpread =
        (random() - 0.5) * 2 * ((CONSTANTS.JUPITER_TROJAN_SPREAD_DEG * Math.PI) / 180);
      const distanceSpread = (random() - 0.5) * 2;
      const inclination =
        (random() - 0.5) * 2 * ((CONSTANTS.JUPITER_TROJAN_INCLINATION_MAX_DEG * Math.PI) / 180);

      const angle = centerAngle + angleSpread;
      const distance = jupiterScalePos + distanceSpread * CONSTANTS.ORBIT_SCALE_FACTOR;

      pos.set(
        distance * Math.cos(angle),
        distance * Math.sin(inclination) * 0.1,
        distance * Math.sin(angle)
      );

      const size = random.range(
        CONSTANTS.JUPITER_TROJAN_SIZE_MIN,
        CONSTANTS.JUPITER_TROJAN_SIZE_MAX
      );
      scl.setScalar(size);

      quat.setFromEuler(new THREE.Euler(
        random() * Math.PI * 2,
        random() * Math.PI * 2,
        random() * Math.PI * 2
      ));

      matrix.compose(pos, quat, scl);
      inst.setMatrixAt(i, matrix);
    }

    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }

  trojansGroup.add(createTrojansInstanced(l4Angle, l4Count, "L4"));
  trojansGroup.add(createTrojansInstanced(l5Angle, l5Count, "L5"));

  logInfo("JupiterTrojans", `Created ${l4Count} L4 and ${l5Count} L5 Trojans (instanced)`);
}

// Update Jupiter Trojans to co-orbit with Jupiter (called per-frame)
export function updateJupiterTrojans(scene, planets) {
  const trojansGroup = scene.getObjectByName("JupiterTrojans");
  if (!trojansGroup) return;

  const jupiter = trojansGroup.userData.jupiterPlanet;
  if (!jupiter) return;

  // Compute Jupiter's current orbital angle from its position in the XZ plane
  const jx = jupiter.position.x;
  const jz = jupiter.position.z;
  const jupiterAngle = Math.atan2(jz, jx);

  // Rotate the entire Trojan group to match Jupiter's angular position
  trojansGroup.rotation.y = -jupiterAngle;
}
