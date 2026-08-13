import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';
import { updatePropertyPanel, updateOutput } from './ui.js';
import { applyScaleToPart } from './objects.js';

let camera;
let renderer;
export let controls;
export let transformControls;
export let isTransforming = false;

export function initControls(cam, ren) {
  camera = cam;
  renderer = ren;
  
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minDistance = 5;
  controls.maxDistance = 200;
  controls.target.set(0, 5, 0);
  controls.zoomSpeed = 0.1;
  controls.dollySpeed = 0.1;

  const zoomStep = 0.5;
  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = Math.sign(event.deltaY);
    const direction = delta > 0 ? 1 : -1;
    const distance = camera.position.distanceTo(controls.target);
    const newDistance = Math.max(controls.minDistance, Math.min(controls.maxDistance, distance + direction * zoomStep));
    const ratio = newDistance / distance;
    camera.position.multiplyScalar(ratio);
    camera.updateProjectionMatrix();
    controls.update();
  }, { passive: false });

  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setSize(1.0);
  transformControls.setSpace('world');
  scene.add(transformControls);

  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
    isTransforming = event.value;
    if (!event.value && state.selectedPart) {
      updatePropertyPanel(state.selectedPart);
      updateOutput();
      if (state.transformMode === 'scale') {
        applyScaleToPart();
      }
      if (state.transformMode === 'translate') {
        const pos = state.selectedGroup.position;
        state.selectedPart.x = Math.round(pos.x * 2) / 2;
        state.selectedPart.y = Math.round(pos.y * 2) / 2;
        state.selectedPart.z = Math.round(pos.z * 2) / 2;
        updateOutput();
      }
      if (state.transformMode === 'rotate') {
        const euler = new THREE.Euler().setFromQuaternion(state.selectedGroup.quaternion);
        state.selectedPart.rotation = Math.round(euler.y * 180 / Math.PI);
        updateOutput();
      }
    }
  });

  transformControls.addEventListener('change', () => {
    renderer.render(scene, camera);
  });
}