import { Vector3 } from "three";

// Frame once on selection, then carry the user's camera offset with the body.
// OrbitControls owns all subsequent orbit, zoom, and pan gestures.
export class CameraFollowController {
  constructor() {
    this.target = null;
    this.requestId = -1;
    this.lastPosition = new Vector3();
    this.position = new Vector3();
    this.translation = new Vector3();
    this.direction = new Vector3();
    this.destination = new Vector3();
  }

  update(state, delta, reducedMotion = false) {
    const { camera, controls, followTarget: target } = state;
    if (!target || !camera || !controls) {
      this.target = null;
      return;
    }
    target.getWorldPosition(this.position);
    if (target === this.target) {
      this.translation.subVectors(this.position, this.lastPosition);
      camera.position.add(this.translation);
      controls.target.add(this.translation);
    }
    this.target = target;
    this.lastPosition.copy(this.position);

    if (!state.frameRequested) return;
    if (this.requestId !== state.followRequestId) {
      this.requestId = state.followRequestId;
      this.direction.subVectors(camera.position, this.position);
      if (this.direction.lengthSq() < 1e-12) this.direction.set(1, 0.4, 1);
      this.direction.normalize();
    }
    const distance = Math.max(state.followDistance, controls.minDistance * 1.2);
    this.destination.copy(this.position).addScaledVector(this.direction, distance);
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-8 * delta);
    camera.position.lerp(this.destination, alpha);
    controls.target.lerp(this.position, alpha);
    if (camera.position.distanceTo(this.destination) < distance * 0.002 &&
        controls.target.distanceTo(this.position) < distance * 0.002) {
      camera.position.copy(this.destination);
      controls.target.copy(this.position);
      state.frameRequested = false;
    }
  }
}
