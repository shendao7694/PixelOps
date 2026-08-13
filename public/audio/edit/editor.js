import { initState, state } from './core/state.js';
import { initScene, scene, camera } from './core/scene.js';
import { renderer, container, updateScene } from './core/renderer.js';
import { initControls, controls, transformControls } from './core/controls.js';
import { setupInteraction, setInteractionCamera, setInteractionControls } from './core/interaction.js';
import { updatePropertyPanel, updateOutput, setupUI, setUITransformControls } from './core/ui.js';

const countEl = document.getElementById('objectCount');

function init() {
  initState();
  initScene();
  initControls(camera, renderer);
  
  setUITransformControls(transformControls);
  setInteractionCamera(camera);
  setInteractionControls(transformControls, false);
  setupInteraction();
  setupUI();

  state.parts.push({ kind: 'slab', x: 0, y: -1, z: 0, w: 160, h: 1, d: 132, mat: 'concrete' });
  updateScene();
  
  if (state.sceneObjects.length > 0) {
    state.selectedGroup = state.sceneObjects[0];
    state.selectedPart = state.selectedGroup.userData.part;
    if (transformControls) {
      transformControls.attach(state.selectedGroup);
      transformControls.setMode('translate');
    }
    updatePropertyPanel(state.selectedPart);
    document.getElementById('deleteSelected').disabled = false;
  }
  
  countEl.textContent = `对象: ${state.parts.length}`;
  updateOutput();

  window.addEventListener('resize', resize);
  animate();
}

function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  if (transformControls) {
    transformControls.updateMatrixWorld();
  }
  renderer.render(scene, camera);
}

init();