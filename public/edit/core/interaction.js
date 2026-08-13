import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './scene.js';
import { renderer } from './renderer.js';
import { TEMPLATES, createPartMesh, highlightPart } from './objects.js';
import { updatePropertyPanel, updateOutput } from './ui.js';
import { updateScene } from './renderer.js';

let camera;
let transformControls;
let isTransforming = false;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster2 = new THREE.Raycaster();

export function setInteractionCamera(cam) {
  camera = cam;
}

export function setInteractionControls(tc, it) {
  transformControls = tc;
  isTransforming = it;
}

export function getIntersects(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const meshes = [];
  state.sceneObjects.forEach(group => {
    group.traverse(child => {
      if (child.isMesh) meshes.push(child);
    });
  });
  return raycaster.intersectObjects(meshes, false);
}

export function getPartGroup(object) {
  let current = object;
  while (current.parent && !current.userData?.isPart) {
    current = current.parent;
  }
  return current.userData?.isPart ? current : null;
}

export function getGroundPos(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster2.setFromCamera(new THREE.Vector2(x, y), camera);
  const hit = new THREE.Vector3();
  raycaster2.ray.intersectPlane(plane, hit);
  if (hit) {
    return { x: Math.round(hit.x * 2) / 2, z: Math.round(hit.z * 2) / 2 };
  }
  return null;
}

export function setupInteraction() {
  renderer.domElement.addEventListener('click', (event) => {
    if (state.tool === 'select' && !isTransforming) {
      const hits = getIntersects(event);
      if (hits.length > 0) {
        const group = getPartGroup(hits[0].object);
        if (group) {
          state.selectedPart = group.userData.part;
          state.selectedGroup = group;
          highlightPart(group);
          if (transformControls) {
            transformControls.attach(group);
          }
          updatePropertyPanel(state.selectedPart);
          document.getElementById('deleteSelected').disabled = false;
          return;
        }
      }
      state.selectedPart = null;
      state.selectedGroup = null;
      if (transformControls) {
        transformControls.detach();
      }
      highlightPart(null);
      updatePropertyPanel(null);
      document.getElementById('deleteSelected').disabled = true;
    }
  });

  renderer.domElement.addEventListener('mousedown', (event) => {
    if (state.tool === 'select') return;
    if (event.button !== 0) return;
    const pos = getGroundPos(event);
    if (pos) {
      state.isDragging = true;
      state.dragStart = pos;
      state.dragCurrent = pos;
    }
  });

  renderer.domElement.addEventListener('mousemove', (event) => {
    if (state.isDragging && state.tool !== 'select') {
      const pos = getGroundPos(event);
      if (pos) {
        state.dragCurrent = pos;
        if (state.tempPreview) {
          scene.remove(state.tempPreview);
          state.tempPreview = null;
        }
        const t = TEMPLATES[state.tool];
        if (t) {
          const previewPart = { ...t, x: pos.x, z: pos.z };
          const group = createPartMesh(previewPart);
          group.traverse(child => {
            if (child.isMesh) {
              child.material = child.material.clone();
              child.material.transparent = true;
              child.material.opacity = 0.4;
            }
          });
          state.tempPreview = group;
          scene.add(group);
        }
      }
    }
  });

  renderer.domElement.addEventListener('mouseup', (event) => {
    if (state.isDragging && state.tool !== 'select') {
      if (state.tempPreview) {
        scene.remove(state.tempPreview);
        state.tempPreview = null;
      }
      const pos = state.dragCurrent || state.dragStart;
      if (pos) {
        const t = TEMPLATES[state.tool];
        if (t) {
          const part = { ...t, x: pos.x, z: pos.z };
          state.parts.push(part);
          updateScene();
          updateOutput();
          const newGroup = state.sceneObjects.find(g => g.userData.part === part);
          if (newGroup) {
            state.selectedPart = part;
            state.selectedGroup = newGroup;
            highlightPart(newGroup);
            if (transformControls) {
              transformControls.attach(newGroup);
            }
            updatePropertyPanel(part);
            document.getElementById('deleteSelected').disabled = false;
          }
        }
      }
      state.isDragging = false;
      state.dragStart = null;
      state.dragCurrent = null;
    }
  });

  renderer.domElement.addEventListener('mouseleave', () => {
    if (state.isDragging) {
      if (state.tempPreview) {
        scene.remove(state.tempPreview);
        state.tempPreview = null;
      }
      state.isDragging = false;
      state.dragStart = null;
      state.dragCurrent = null;
    }
  });
}