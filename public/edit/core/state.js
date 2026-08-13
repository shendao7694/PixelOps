export const $ = id => document.getElementById(id);

export const state = {
  parts: [],
  selectedPart: null,
  selectedGroup: null,
  tool: 'select',
  sceneObjects: [],
  isDragging: false,
  dragStart: null,
  dragCurrent: null,
  tempPreview: null,
  transformMode: 'translate',
};

export function initState() {
  state.parts = [];
  state.selectedPart = null;
  state.selectedGroup = null;
  state.tool = 'select';
  state.sceneObjects = [];
  state.isDragging = false;
  state.dragStart = null;
  state.dragCurrent = null;
  state.tempPreview = null;
  state.transformMode = 'translate';
}