const HX = 80, HZ = 66;

const parts = [
  {
    "kind": "slab",
    "x": -70,
    "y": -1,
    "x": 0,
    "z": 1,
    "w": 160,
    "h": 1,
    "d": 132,
    "mat": "concrete"
  },
  // ========== Parkour 1 =========//
  {
    "kind": "stairs",
    "x": -70,
    "y": 0,
    "z": 40,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": -1
  },
  {
    "kind": "stairs",
    "x": -70,
    "y": 3.5,
    "z": 35.5,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": -1
  },
  {
    "kind": "slab",
    "x": -70,
    "y": 6.5,
    "z": 25,
    "w": 4,
    "h": 0.5,
    "d": 4,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -70,
    "y": 6.5,
    "z": 15,
    "w": 4,
    "h": 0.5,
    "d": 4,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -70,
    "y": 6.5,
    "z": 5,
    "w": 4,
    "h": 0.5,
    "d": 4,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -70,
    "y": 6.5,
    "z": -5,
    "w": 4,
    "h": 0.5,
    "d": 4,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -70,
    "y": 6.5,
    "z": -24,
    "w": 4,
    "h": 0.5,
    "d": 22.5,
    "mat": "concrete"
  },
  {
    "kind": "box",
    "x": -70,
    "y": 6.5,
    "z": -24,
    "w": 4,
    "h": 6.5,
    "d": 2,
    "mat": "crate"
  },
  // ========== Parkour 2 =========//
  {
    "kind": "stairs",
    "x": -50,
    "z": 40,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": -1
  },
  {
    "kind": "stairs",
    "x": -50,
    "y": 3.5,
    "z": 35.5,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": -1
  },
  {
    "kind": "slab",
    "x": -50,
    "y": 6.5,
    "z": -12,
    "w": 4,
    "h": 0.5,
    "d": 85,
    "mat": "concrete"
  },
  {
    "kind": "box",
    "x": -50,
    "y": 6.5,
    "z": 25,
    "w": 4,
    "h": 6.5,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": -50,
    "y": 6.5,
    "z": 5,
    "w": 4,
    "h": 6.5,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": -50,
    "y": 6.5,
    "z": -15,
    "w": 4,
    "h": 6.5,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": -50,
    "y": 6.5,
    "z": -35,
    "w": 4,
    "h": 6.5,
    "d": 4,
    "mat": "crate"
  },
  // ========== Parkour 3 =========//
  {
    "kind": "stairs",
    "x": -30,
    "z": 40,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": -1
  },
  {
    "kind": "stairs",
    "x": -30,
    "y": 3.5,
    "z": 35.5,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": -1
  },
  {
    "kind": "slab",
    "x": -30,
    "y": 6.5,
    "z": 25,
    "w": 4,
    "h": 0.5,
    "d": 4,
    "mat": "concrete"
  },
  {
    "kind": "box",
    "x": -29.5,
    "y": 7,
    "z": 18.5,
    "w": 2,
    "h": 16,
    "d": 2,
    "mat": "crate"
  },

  {
    "kind": "slab",
    "x": -27,
    "y": 8,
    "z": 18.5,
    "w": 3.5,
    "h": 0.5,
    "d": 1.5,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -29.5,
    "y": 9,
    "z": 16,
    "w": 1.5,
    "h": 0.5,
    "d": 3.5,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -31.5,
    "y": 10,
    "z": 18.5,
    "w": 4.5,
    "h": 0.5,
    "d": 1.5,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -29.5,
    "y": 11,
    "z": 21,
    "w": 1.5,
    "h": 0.5,
    "d": 3.5,
    "mat": "concrete"
  },

  {
    "kind": "slab",
    "x": -27,
    "y": 12,
    "z": 18.5,
    "w": 3.5,
    "h": 0.5,
    "d": 1.5,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -29.5,
    "y": 13,
    "z": 16,
    "w": 1.5,
    "h": 0.5,
    "d": 3.5,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -31.5,
    "y": 14,
    "z": 18.5,
    "w": 4.5,
    "h": 0.5,
    "d": 1.5,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -29.5,
    "y": 15,
    "z": 21,
    "w": 1.5,
    "h": 0.5,
    "d": 3.5,
    "mat": "concrete"
  },

  {
    "kind": "slab",
    "x": -27,
    "y": 16,
    "z": 18.5,
    "w": 3.5,
    "h": 0.5,
    "d": 1.5,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -29.5,
    "y": 17,
    "z": 16,
    "w": 1.5,
    "h": 0.5,
    "d": 3.5,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -31.5,
    "y": 18,
    "z": 18.5,
    "w": 4.5,
    "h": 0.5,
    "d": 1.5,
    "mat": "concrete"
  },
  {
    "kind": "slab",
    "x": -29.5,
    "y": 19,
    "z": 21,
    "w": 1.5,
    "h": 0.5,
    "d": 3.5,
    "mat": "concrete"
  },
];

export const PARKOUR = {
  name: 'PARKOUR',
  env: {
    indoor: false,
    bounds: { x: HX - 0.6, z: HZ - 0.6 },
    fog: { color: 0x87CEEB, near: 30, far: 150 },
    skyColor: 0x87CEEB,
  },
  parts,
};