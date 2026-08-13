import * as THREE from 'three';

export const COLORS = {
  concrete: 0x8a8f96,
  concreteDark: 0x5a6068,
  metal: 0x889098,
  metalDark: 0x4a5058,
  brick: 0x8a5a4a,
  crate: 0x8a7a5a,
  wood: 0x8a7a4a,
  glass: 0x88ccdd,
  roof: 0x5a6068,
  hazard: 0xffaa00,
  containerRust: 0x8a5a3a,
  containerGreen: 0x3a7a4a,
  containerBlue: 0x3a5a8a,
  tile: 0x6a7278,
};

export const TEMPLATES = {
  box: { kind: 'box', x: 0, y: 0, z: 0, w: 2, h: 2, d: 2, mat: 'crate' },
  slab: { kind: 'slab', x: 0, y: 0, z: 0, w: 4, h: 0.5, d: 4, mat: 'concrete' },
  wall: { kind: 'wall', x: 0, y: 0, z: 0, len: 8, h: 4, thick: 0.6, mat: 'concrete', axis: 'x' },
  stairs: { kind: 'stairs', x: 0, y: 0, z: 0, steps: 8, rise: 0.45, run: 0.6, width: 3, mat: 'metalDark', axis: 'z', dir: 1 },
  sandbag: { kind: 'sandbag', x: 0, y: 0, z: 0, len: 4, h: 1.05, axis: 'x' },
  crate: { kind: 'crateStack', x: 0, y: 0, z: 0, count: 2, size: 1.25, mat: 'crate' },
  barrel: { kind: 'barrel', x: 0, y: 0, z: 0, tint: 0xb04a2a },
};