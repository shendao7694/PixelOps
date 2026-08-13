import { state, $ } from './state.js';
import { scene } from './scene.js';
import { updateHighlightSize } from './objects.js';
import { updateScene } from './renderer.js';

let transformControls;

export function setUITransformControls(tc) {
  transformControls = tc;
}

export function updatePropertyPanel(part) {
  if (!part) {
    ['px','py','pz','pw','pd','ph'].forEach(id => {
      const el = $(id);
      if (el) el.value = '';
    });
    const pmat = document.getElementById('pmat');
    if (pmat) pmat.value = '';
    return;
  }
  const px = $('px');
  const py = $('py');
  const pz = $('pz');
  const pw = $('pw');
  const pd = $('pd');
  const ph = $('ph');
  if (px) px.value = part.x || 0;
  if (py) py.value = part.y || 0;
  if (pz) pz.value = part.z || 0;
  if (pw) pw.value = part.w || part.len || 2;
  if (pd) pd.value = part.d || part.thick || 2;
  if (ph) ph.value = part.h || 2;
  const pmat = document.getElementById('pmat');
  if (pmat) pmat.value = part.mat || '';
  const axis = document.getElementById('axis');
  if (axis && part.axis !== undefined) {
    axis.value = part.axis;
  }
  const rotation = document.getElementById('rotation');
  if (rotation && part.rotation !== undefined) {
    rotation.value = part.rotation || 0;
  }
}

export function updateOutput() {
  const data = state.parts.map(p => {
    const clean = { ...p };
    if (clean.x === 0) delete clean.x;
    if (clean.y === 0) delete clean.y;
    if (clean.z === 0) delete clean.z;
    if (clean.rotation === 0) delete clean.rotation;
    return clean;
  });
  const output = $('output');
  if (output) {
    output.value = JSON.stringify(data, null, 2);
  }
}

export function importFromJSON() {
  const output = $('output');
  if (!output) return;
  
  try {
    const data = JSON.parse(output.value);
    if (!Array.isArray(data)) {
      alert('JSON 格式错误：必须是数组');
      return;
    }
    
    if (data.length === 0) {
      alert('没有可导入的数据');
      return;
    }
    
    if (!confirm(`确定导入 ${data.length} 个物体？将清空当前场景。`)) return;
    
    state.parts = data;
    state.selectedPart = null;
    state.selectedGroup = null;
    if (transformControls) {
      transformControls.detach();
    }
    updateScene();
    import('./objects.js').then(module => {
      module.highlightPart(null);
    });
    updatePropertyPanel(null);
    document.getElementById('deleteSelected').disabled = true;
    document.getElementById('objectCount').textContent = `对象: ${state.parts.length}`;
    updateOutput();
    
  } catch (e) {
    alert('JSON 解析错误：' + e.message);
  }
}

export function exportAll() {
  const data = state.parts.map(p => {
    const clean = { ...p };
    if (clean.x === 0) delete clean.x;
    if (clean.y === 0) delete clean.y;
    if (clean.z === 0) delete clean.z;
    if (clean.rotation === 0) delete clean.rotation;
    return clean;
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'map.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function setupUI() {
  document.querySelectorAll('#tools button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tools button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const newTool = btn.dataset.tool;
      if (newTool === 'select') {
        state.tool = 'select';
        document.querySelector('#viewport canvas').style.cursor = 'default';
        if (state.selectedGroup && transformControls) {
          transformControls.attach(state.selectedGroup);
          transformControls.updateMatrixWorld(true);
        }
      } else {
        state.tool = newTool;
        document.querySelector('#viewport canvas').style.cursor = 'crosshair';
        if (transformControls) {
          transformControls.detach();
        }
      }
    });
  });

  document.querySelectorAll('#modes button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#modes button').forEach(b => b.classList.remove('mode-active'));
      btn.classList.add('mode-active');
      state.transformMode = btn.dataset.mode;
      if (transformControls) {
        transformControls.setMode(state.transformMode);
        transformControls.updateMatrixWorld(true);
      }
    });
  });

  const axisEl = document.getElementById('axis');
  if (axisEl) {
    axisEl.addEventListener('change', () => {
      if (!state.selectedPart) return;
      state.selectedPart.axis = axisEl.value;
      import('./objects.js').then(module => {
        module.rebuildSelected();
      });
      updateOutput();
    });
  }

  const rotationEl = document.getElementById('rotation');
  if (rotationEl) {
    rotationEl.addEventListener('change', () => {
      if (!state.selectedPart) return;
      state.selectedPart.rotation = parseInt(rotationEl.value) || 0;
      if (state.selectedGroup) {
        state.selectedGroup.rotation.y = state.selectedPart.rotation * Math.PI / 180;
      }
      updateOutput();
    });
  }

  const pmatEl = document.getElementById('pmat');
  if (pmatEl) {
    pmatEl.addEventListener('change', () => {
      if (!state.selectedPart) return;
      state.selectedPart.mat = pmatEl.value;
      import('./objects.js').then(module => {
        module.rebuildSelected();
      });
      updateOutput();
    });
  }

  const deleteBtn = document.getElementById('deleteSelected');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!state.selectedPart) return;
      const idx = state.parts.indexOf(state.selectedPart);
      if (idx > -1) {
        state.parts.splice(idx, 1);
        const oldGroup = state.selectedGroup;
        if (oldGroup) {
          scene.remove(oldGroup);
          state.sceneObjects = state.sceneObjects.filter(g => g !== oldGroup);
          oldGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        }
        state.selectedPart = null;
        state.selectedGroup = null;
        if (transformControls) {
          transformControls.detach();
        }
        import('./objects.js').then(module => {
          module.highlightPart(null);
        });
        updatePropertyPanel(null);
        deleteBtn.disabled = true;
        document.getElementById('objectCount').textContent = `对象: ${state.parts.length}`;
        updateOutput();
      }
    });
  }

  const clearBtn = document.getElementById('clearAll');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (state.parts.length === 0) return;
      if (!confirm('确定清空所有物体？')) return;
      state.parts = [];
      state.selectedPart = null;
      state.selectedGroup = null;
      if (transformControls) {
        transformControls.detach();
      }
      updateScene();
      import('./objects.js').then(module => {
        module.highlightPart(null);
      });
      updatePropertyPanel(null);
      if (deleteBtn) deleteBtn.disabled = true;
      updateOutput();
    });
  }

  ['px', 'py', 'pz', 'pw', 'pd', 'ph'].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener('change', () => {
        if (!state.selectedPart) return;
        const val = parseFloat(el.value);
        if (isNaN(val) || val < 0) return;
        const key = id === 'px' ? 'x' : id === 'py' ? 'y' : id === 'pz' ? 'z' :
                    id === 'pw' ? (state.selectedPart.w !== undefined ? 'w' : 'len') :
                    id === 'pd' ? (state.selectedPart.d !== undefined ? 'd' : 'thick') : 'h';
        state.selectedPart[key] = val;
        if (id === 'px' || id === 'py' || id === 'pz') {
          if (state.selectedGroup) {
            state.selectedGroup.position.set(
              state.selectedPart.x || 0,
              state.selectedPart.y || 0,
              state.selectedPart.z || 0
            );
            updateHighlightSize(state.selectedGroup);
            if (transformControls) {
              transformControls.updateMatrixWorld(true);
            }
          }
        } else {
          import('./objects.js').then(module => {
            module.rebuildSelected();
          });
        }
        updateOutput();
      });
    }
  });

  const importBtn = document.getElementById('importBtn');
  if (importBtn) {
    importBtn.addEventListener('click', importFromJSON);
  }

  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportAll);
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      importFromJSON();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT') {
      const deleteBtn = document.getElementById('deleteSelected');
      if (deleteBtn) deleteBtn.click();
    }
    if (e.key === 'Escape') {
      state.selectedPart = null;
      state.selectedGroup = null;
      if (transformControls) {
        transformControls.detach();
      }
      import('./objects.js').then(module => {
        module.highlightPart(null);
      });
      updatePropertyPanel(null);
      const deleteBtn = document.getElementById('deleteSelected');
      if (deleteBtn) deleteBtn.disabled = true;
    }
    if (e.key === '1') {
      const btn = document.querySelector('[data-mode="translate"]');
      if (btn) btn.click();
    }
    if (e.key === '2') {
      const btn = document.querySelector('[data-mode="scale"]');
      if (btn) btn.click();
    }
    if (e.key === '3') {
      const btn = document.querySelector('[data-mode="rotate"]');
      if (btn) btn.click();
    }
  });
}