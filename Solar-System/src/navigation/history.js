import { getState, updateFollowTarget, stopCameraFollow, cancelCameraFraming } from "../core/state.js";
import { emit } from "../core/events.js";

const views = [];
export function rememberView() {
  const s = getState();
  if (!s.camera || !s.controls) return;
  views.push({
    position: s.camera.position.clone(), up: s.camera.up.clone(), target: s.controls.target.clone(),
    near: s.camera.near, minDistance: s.controls.minDistance,
    selected: s.selectedObject, followed: s.followTarget,
    bodyPosition: s.followTarget?.getWorldPosition(s.camera.position.clone()),
  });
  if (views.length > 20) views.shift();
  emit("history");
}
export function hasPreviousView() { return views.length > 0; }
export function restorePreviousView(select, deselect) {
  const view = views.pop();
  if (!view) return;
  if (view.selected) select(view.selected, false, { remember: false }); else deselect();
  const s = getState();
  const damping = s.controls.enableDamping;
  s.controls.enableDamping = false;
  s.controls.update();
  if (view.followed) {
    const movement = view.followed.getWorldPosition(view.position.clone()).sub(view.bodyPosition);
    view.position.add(movement); view.target.add(movement);
    updateFollowTarget(view.followed); cancelCameraFraming();
  } else stopCameraFollow();
  s.camera.position.copy(view.position); s.camera.up.copy(view.up);
  s.camera.near = view.near; s.camera.updateProjectionMatrix();
  s.controls.minDistance = view.minDistance;
  s.controls.target.copy(view.target); s.controls.update();
  s.controls.enableDamping = damping;
  emit("history"); emit("render");
}
export function clearViewHistory() { views.length = 0; emit("history"); }
