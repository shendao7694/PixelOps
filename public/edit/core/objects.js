import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './scene.js';
import { COLORS, TEMPLATES } from './utils.js';
import { transformControls } from './controls.js';
import { updateOutput } from './ui.js';
import { updateScene } from './renderer.js';

export { TEMPLATES } from './utils.js';

export function createPartMesh(part) {
  const group = new THREE.Group();
  const kind = part.kind;
  let color = COLORS[part.mat] || 0x888888;
  let totalHeight = 0;

  switch (kind) {
    case 'box': {
      const geo = new THREE.BoxGeometry(part.w, part.h, part.d);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, part.h/2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      totalHeight = part.h;
      break;
    }
    case 'slab': {
      const geo = new THREE.BoxGeometry(part.w, part.h, part.d);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, part.h/2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      totalHeight = part.h;
      break;
    }
    case 'wall': {
      const len = part.len || 8;
      const h = part.h || 4;
      const thick = part.thick || 0.6;
      const geo = new THREE.BoxGeometry(part.axis === 'x' ? len : thick, h, part.axis === 'z' ? len : thick);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, h/2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      totalHeight = h;
      break;
    }
    case 'stairs': {
      const steps = part.steps || 8;
      const rise = part.rise || 0.45;
      const run = part.run || 0.6;
      const width = part.width || 3;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 });
      for (let i = 0; i < steps; i++) {
        const g = new THREE.BoxGeometry(width, rise * 0.9, run * 0.95);
        const m = new THREE.Mesh(g, mat);
        const depth = i * run + run/2;
        const height = i * rise + rise/2;
        if (part.axis === 'z') {
          m.position.set(0, height, part.dir === 1 ? -depth : depth);
        } else {
          m.position.set(part.dir === 1 ? depth : -depth, height, 0);
        }
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      }
      totalHeight = steps * rise;
      break;
    }
    case 'sandbag': {
      const len = part.len || 4;
      const h = part.h || 1.05;
      const geo = new THREE.BoxGeometry(part.axis === 'x' ? len : 1.2, h, part.axis === 'z' ? len : 1.2);
      const mat = new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 0.9, metalness: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, h/2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      totalHeight = h;
      break;
    }
    case 'crateStack': {
      const count = part.count || 2;
      const size = part.size || 1.25;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
      for (let i = 0; i < count; i++) {
        const g = new THREE.BoxGeometry(size * 0.9, size * 0.8, size * 0.9);
        const m = new THREE.Mesh(g, mat);
        m.position.set(0, i * size * 0.8 + size * 0.4, 0);
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      }
      totalHeight = count * size * 0.8;
      break;
    }
    case 'barrel': {
      const tint = part.tint || 0xb04a2a;
      const geo = new THREE.CylinderGeometry(0.6, 0.6, 0.9, 12);
      const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6, metalness: 0.3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.45, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      totalHeight = 0.9;
      break;
    }
    default: {
      const geo = new THREE.BoxGeometry(2, 2, 2);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.5 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 1, 0);
      group.add(mesh);
      totalHeight = 2;
    }
  }

  group.position.set(part.x || 0, part.y || 0, part.z || 0);
  if (part.rotation) {
    group.rotation.y = part.rotation * Math.PI / 180;
  }
  group.userData.part = part;
  group.userData.isPart = true;
  group.userData.totalHeight = totalHeight;
  group.userData.origSize = {
    w: part.w || part.len || 2,
    h: part.h || totalHeight || 2,
    d: part.d || part.thick || 2,
  };

  const highlightGroup = new THREE.Group();
  const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x7de08a, transparent: true, opacity: 0 });
  const edge = new THREE.LineSegments(edgeGeo, edgeMat);
  highlightGroup.add(edge);
  highlightGroup.userData.isHighlightContainer = true;
  highlightGroup.visible = false;
  group.add(highlightGroup);

  updateHighlightSize(group);
  return group;
}

export function updateHighlightSize(group) {
  const highlightGroup = group.children.find(c => c.userData?.isHighlightContainer);
  if (!highlightGroup) return;
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const edge = highlightGroup.children[0];
  if (edge && edge.isLineSegments) {
    const newGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.3, size.y + 0.3, size.z + 0.3));
    edge.geometry.dispose();
    edge.geometry = newGeo;
    highlightGroup.position.copy(center);
  }
}

export function rebuildSelected() {
  if (!state.selectedPart || !state.selectedGroup) return;
  const idx = state.parts.indexOf(state.selectedPart);
  if (idx === -1) return;
  const oldGroup = state.selectedGroup;
  const pos = oldGroup.position.clone();
  const rot = oldGroup.rotation.y;
  const newGroup = createPartMesh(state.selectedPart);
  newGroup.position.copy(pos);
  newGroup.rotation.y = rot;
  scene.remove(oldGroup);
  state.sceneObjects = state.sceneObjects.filter(g => g !== oldGroup);
  oldGroup.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
  state.sceneObjects.push(newGroup);
  scene.add(newGroup);
  state.selectedGroup = newGroup;
  state.selectedGroup.userData.part = state.selectedPart;
  transformControls.detach();
  transformControls.attach(state.selectedGroup);
  highlightPart(state.selectedGroup);
  updateHighlightSize(state.selectedGroup);
}

export function highlightPart(group) {
  state.sceneObjects.forEach(obj => {
    obj.children.forEach(child => {
      if (child.userData?.isHighlightContainer) {
        child.visible = false;
      }
    });
  });
  if (group) {
    group.children.forEach(child => {
      if (child.userData?.isHighlightContainer) {
        child.visible = true;
        updateHighlightSize(group);
      }
    });
  }
}

export function applyScaleToPart() {
  if (!state.selectedGroup || !state.selectedPart) return;
  const scale = state.selectedGroup.scale;
  const orig = state.selectedGroup.userData.origSize;
  if (!orig) return;
  
  if (state.selectedPart.w !== undefined) {
    state.selectedPart.w = Math.round(orig.w * scale.x * 2) / 2;
    state.selectedPart.h = Math.round(orig.h * scale.y * 2) / 2;
    state.selectedPart.d = Math.round(orig.d * scale.z * 2) / 2;
  } else if (state.selectedPart.len !== undefined) {
    state.selectedPart.len = Math.round(orig.w * scale.x * 2) / 2;
    state.selectedPart.h = Math.round(orig.h * scale.y * 2) / 2;
    state.selectedPart.thick = Math.round(orig.d * scale.z * 2) / 2;
  }
  
  state.selectedGroup.scale.set(1, 1, 1);
  state.selectedGroup.userData.origSize = {
    w: state.selectedPart.w || state.selectedPart.len || 2,
    h: state.selectedPart.h || 2,
    d: state.selectedPart.d || state.selectedPart.thick || 2,
  };
  rebuildSelected();
  updateOutput();
}