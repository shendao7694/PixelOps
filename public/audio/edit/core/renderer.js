import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';
import { createPartMesh, highlightPart } from './objects.js';

const canvas = document.getElementById('canvas3d');
export const container = canvas.parentElement;

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let transformControls;

export function setTransformControls(tc) {
  transformControls = tc;
}

export function updateScene() {
  if (transformControls) {
    transformControls.detach();
  }
  state.sceneObjects.forEach(obj => {
    scene.remove(obj);
    obj.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  });
  state.sceneObjects = [];
  state.parts.forEach((part) => {
    const group = createPartMesh(part);
    scene.add(group);
    state.sceneObjects.push(group);
  });
  if (state.selectedPart) {
    const group = state.sceneObjects.find(g => g.userData.part === state.selectedPart);
    if (group) {
      state.selectedGroup = group;
      highlightPart(group);
      if (transformControls) {
        transformControls.attach(group);
        transformControls.updateMatrixWorld(true);
      }
    } else {
      state.selectedPart = null;
      state.selectedGroup = null;
    }
  }
  document.getElementById('objectCount').textContent = `对象: ${state.parts.length}`;
}