import * as THREE from "three";
import { selectObject, deselectObject } from "../ui/index.js";
import { getSelectedObject, setSelectedObject, stopCameraFollow, cancelCameraFraming } from "../core/state.js";
let selectableObjectsRef = [];
let pointerRendererElement;
let pointerMoveHandler, pointerDownHandler, pointerUpHandler, pointerCancelHandler, clickHandler;
let controlsInstance;
const pointer = new THREE.Vector2();
const projected = new THREE.Vector3();
const worldCenter = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
raycaster.near = 0;
raycaster.far = 10000;

export function setupPointerEvents(scene, camera, renderer, selectable) {
  cleanupPointerListeners();

  selectableObjectsRef = Array.isArray(selectable) ? selectable : [];
  pointerRendererElement = renderer?.domElement ?? null;
  if (!pointerRendererElement) return;

  let press = null;
  const activePointers = new Set();
  pointerDownHandler = (event) => {
    activePointers.add(event.pointerId);
    if (activePointers.size !== 1 || !event.isPrimary || event.button !== 0) {
      press = null;
      return;
    }
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
  };
  pointerMoveHandler = (event) => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) {
      press.dragged = true;
    }
  };
  pointerUpHandler = (event) => {
    const isTap = press?.id === event.pointerId && !press.dragged;
    activePointers.delete(event.pointerId);
    press = null;
    if (isTap) clickHandler(event);
  };
  pointerCancelHandler = (event) => {
    activePointers.delete(event.pointerId);
    press = null;
  };
  pointerRendererElement.addEventListener("pointerdown", pointerDownHandler);
  pointerRendererElement.addEventListener("pointermove", pointerMoveHandler, { passive: true });
  pointerRendererElement.addEventListener("pointerup", pointerUpHandler);
  pointerRendererElement.addEventListener("pointercancel", pointerCancelHandler);

  clickHandler = (e) => {
    e.preventDefault();

    const rect = pointerRendererElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.far = camera.far;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(selectableObjectsRef, true);

    let tgt = null;
    for (const hit of hits) {
      const obj = hit.object;
      if (!obj.isMesh) continue;

      if (obj.userData?.clickTarget?.userData?.isSelectable) {
        tgt = obj.userData.clickTarget;
        break;
      }

      if (obj.userData?.isSelectable) {
        tgt = obj;
        break;
      }

      let parent = obj.parent;
      while (parent) {
        if (parent.userData?.isSelectable) {
          tgt = parent;
          break;
        }
        parent = parent.parent;
      }

      if (tgt) break;
    }

    if (!tgt) {
      let closest = Infinity;
      const tolerance = e.pointerType === "touch" ? 18 : 10;
      for (const body of selectableObjectsRef) {
        const mesh = body.userData.planetMesh ?? body;
        if (!mesh.isMesh || !mesh.visible) continue;
        mesh.getWorldPosition(worldCenter);
        projected.copy(worldCenter).project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        const x = (projected.x * 0.5 + 0.5) * rect.width + rect.left;
        const y = (-projected.y * 0.5 + 0.5) * rect.height + rect.top;
        const distance = Math.hypot(e.clientX - x, e.clientY - y);
        if (distance > tolerance || distance >= closest) continue;
        // Reject a candidate hidden behind another body by raycasting its center.
        raycaster.setFromCamera({ x: projected.x, y: projected.y }, camera);
        const blockers = raycaster.intersectObjects(selectableObjectsRef, true);
        const visibleHit = blockers.find((hit) => hit.object.isMesh);
        let owner = visibleHit?.object;
        while (owner && owner !== body && owner !== mesh) owner = owner.parent;
        if (visibleHit && !owner && visibleHit.object.userData.clickTarget !== body) continue;
        closest = distance; tgt = body;
      }
    }

    if (tgt) {
      selectObject(tgt);
    } else if (getSelectedObject()) {
      deselectObject();
      setSelectedObject(null);
      stopCameraFollow();
    }
  };

}

export function cleanupPointerListeners() {
  if (pointerRendererElement) {
    if (pointerMoveHandler) {
      pointerRendererElement.removeEventListener("pointermove", pointerMoveHandler);
    }
    if (pointerDownHandler) pointerRendererElement.removeEventListener("pointerdown", pointerDownHandler);
    if (pointerUpHandler) pointerRendererElement.removeEventListener("pointerup", pointerUpHandler);
    if (pointerCancelHandler) pointerRendererElement.removeEventListener("pointercancel", pointerCancelHandler);
  }
  pointerMoveHandler = null;
  pointerDownHandler = null;
  pointerUpHandler = null;
  pointerCancelHandler = null;
  clickHandler = null;
  pointerRendererElement = null;
  selectableObjectsRef = [];
}

export function setupZoomDetection(renderer, controls) {
  cleanupZoomDetectionListeners();
  if (!renderer?.domElement || !controls) return;
  controlsInstance = controls;
  controls.addEventListener("start", cancelCameraFraming);
}

export function cleanupZoomDetectionListeners() {
  controlsInstance?.removeEventListener("start", cancelCameraFraming);
  controlsInstance = null;
}
