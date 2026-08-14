const HX = 80, HZ = 66;

const parts = [
  {
    "kind": "wall",
    "x": -30,
    "z": -30.5,
    "len": 55.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "wall",
    "x": 30,
    "z": 30,
    "len": 53.5,
    "h": 4,
    "thick": 0.6,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "slab",
    "z": -11,
    "y": -0.7,
    "w": 159.5,
    "h": 0.5,
    "d": 155.5,
    "mat": "concrete"
  },
  {
    "kind": "wall",
    "x": 36,
    "z": -3.5,
    "len": 12,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": -36,
    "z": 4.5,
    "len": 12,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": -42,
    "z": -23.5,
    "len": 56.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "wall",
    "x": -36.5,
    "z": -40.5,
    "len": 23,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "wall",
    "x": -36.5,
    "z": -13.5,
    "len": 23,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "stairs",
    "x": -38,
    "y": -2,
    "z": -43,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": 1,
    "thick": 1
  },
  {
    "kind": "stairs",
    "x": -41,
    "y": -2,
    "z": -43,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": 1
  },
  {
    "kind": "box",
    "x": -32,
    "z": -47,
    "w": 3,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": -35.5,
    "z": -23,
    "w": 2,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "barrel",
    "x": -35.5,
    "y": 2,
    "z": -23,
    "tint": 11553322
  },
  {
    "kind": "stairs",
    "x": -30.5,
    "y": -1.5,
    "z": -52.5,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": 1
  },
  {
    "kind": "wall",
    "x": 42.5,
    "z": 22,
    "len": 55.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "wall",
    "x": 36.5,
    "z": 41,
    "len": 18,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "stairs",
    "x": 38,
    "y": -2,
    "z": 37,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": 1
  },
  {
    "kind": "stairs",
    "x": 41,
    "y": -2,
    "z": 37,
    "steps": 8,
    "rise": 0.45,
    "run": 0.6,
    "width": 3,
    "mat": "metalDark",
    "axis": "z",
    "dir": 1
  },
  {
    "kind": "box",
    "x": 39.5,
    "y": -0.5,
    "z": 24.5,
    "w": 5.5,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": 42,
    "y": 0.5,
    "z": 24,
    "w": 2,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "barrel",
    "x": 37.5,
    "y": 1.5,
    "z": 24,
    "tint": 11553322
  },
  {
    "kind": "barrel",
    "x": 39.5,
    "y": 1.5,
    "z": 24.5,
    "tint": 11553322
  },
  {
    "kind": "barrel",
    "x": 41,
    "z": 24.5,
    "tint": 11553322
  },
  {
    "kind": "wall",
    "x": 36.5,
    "z": 10.5,
    "len": 14.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "box",
    "x": 40,
    "y": 2.5,
    "z": 24.5,
    "w": 6,
    "h": 1,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "wall",
    "x": -30,
    "z": 12.5,
    "len": 16,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "wall",
    "x": -1,
    "z": 20.5,
    "len": 61.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "z": 12,
    "len": 16.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": 20.5,
    "z": -31.5,
    "len": 25,
    "h": 4,
    "thick": 0.6,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "wall",
    "z": 1,
    "len": 17,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": 30,
    "z": -24,
    "len": 41,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "wall",
    "x": -8.5,
    "z": 6.5,
    "len": 11.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "wall",
    "x": 8.5,
    "z": 6.5,
    "len": 11.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "box",
    "x": -31,
    "z": -2,
    "w": 2,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": 30.5,
    "z": -2.5,
    "w": 2,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "wall",
    "x": -16.5,
    "z": -11.5,
    "len": 27,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": 19,
    "z": -11.5,
    "len": 33.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": -20.5,
    "z": -31.5,
    "len": 25,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "box",
    "z": -2,
    "w": 5.5,
    "h": 2,
    "d": 4,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": -19.5,
    "z": -2.5,
    "w": 4,
    "h": 3,
    "d": 5.5,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": 20,
    "z": -2.5,
    "w": 4.5,
    "h": 3,
    "d": 6,
    "mat": "crate"
  },
  {
    "kind": "sandbag",
    "x": -14.5,
    "z": 15.5,
    "len": 4,
    "h": 1,
    "axis": "x",
    "thick": 2
  },
  {
    "kind": "sandbag",
    "x": -17.5,
    "z": 16,
    "len": 4,
    "h": 1,
    "axis": "x",
    "thick": 2
  },
  {
    "kind": "sandbag",
    "x": -20.5,
    "z": 16,
    "len": 4,
    "h": 1,
    "axis": "x",
    "thick": 2
  },
  {
    "kind": "sandbag",
    "x": -24,
    "z": 15.5,
    "len": 4,
    "h": 1.05,
    "axis": "x"
  },
  {
    "kind": "sandbag",
    "x": 25.5,
    "z": 16,
    "len": 4,
    "h": 1,
    "axis": "x",
    "thick": 2
  },
  {
    "kind": "sandbag",
    "x": 22.5,
    "z": 16.5,
    "len": 4,
    "h": 1,
    "axis": "x",
    "thick": 2
  },
  {
    "kind": "sandbag",
    "x": 18.5,
    "z": 16.5,
    "len": 4,
    "h": 1,
    "axis": "x",
    "thick": 2
  },
  {
    "kind": "sandbag",
    "x": 14.5,
    "z": 16,
    "len": 4,
    "h": 1.05,
    "axis": "x"
  },
  {
    "kind": "barrel",
    "x": -27,
    "z": 13.5,
    "tint": 11553322
  },
  {
    "kind": "barrel",
    "x": -27,
    "z": 12,
    "tint": 11553322
  },
  {
    "kind": "barrel",
    "x": 28,
    "z": 15,
    "tint": 11553322
  },
  {
    "kind": "barrel",
    "x": -27,
    "z": 10.5,
    "tint": 11553322
  },
  {
    "kind": "barrel",
    "x": 27.5,
    "z": 13.5,
    "tint": 11553322
  },
  {
    "kind": "barrel",
    "x": -27.5,
    "z": 9.5,
    "tint": 11553322
  },
  {
    "kind": "barrel",
    "x": 27.5,
    "z": 12,
    "tint": 11553322
  },
  {
    "kind": "barrel",
    "x": 27.5,
    "z": 10,
    "tint": 11553322
  },
  {
    "kind": "wall",
    "z": -19,
    "len": 15,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "crateStack",
    "x": 11.5,
    "z": -37,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -13.5,
    "z": -37.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": 11.5,
    "z": -35.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -13.5,
    "z": -36,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": 11.5,
    "z": -33.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -13.5,
    "z": -34.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": 11.5,
    "z": -32,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -13.5,
    "z": -33,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": 11.5,
    "z": -30.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -13.5,
    "z": -31,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": 11.5,
    "z": -29,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -13.5,
    "z": -29.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": 11.5,
    "z": -27.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -13.5,
    "z": -28,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": 11.5,
    "z": -26,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -13.5,
    "z": -26.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": 11,
    "z": -24.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -12.5,
    "z": -24.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "barrel",
    "x": -2,
    "z": -28,
    "tint": 11553322
  },
  {
    "kind": "crateStack",
    "x": -0.5,
    "z": -28,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": -1.5,
    "z": -30,
    "w": 2,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": -5,
    "z": -38.5,
    "w": 2,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -3.5,
    "z": -38.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": -2,
    "z": -38.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": 3,
    "z": -38.5,
    "w": 2,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "z": -38.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "crateStack",
    "x": 1.5,
    "z": -38.5,
    "count": 2,
    "size": 1.25,
    "mat": "crate"
  },
  {
    "kind": "box",
    "x": 31,
    "z": 4.5,
    "w": 2,
    "h": 2,
    "d": 2,
    "mat": "crate"
  },
  {
    "kind": "wall",
    "z": -44.5,
    "len": 60.5,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": 51,
    "z": 57,
    "len": 43,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": 59,
    "z": 49.5,
    "len": 33,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": 72.5,
    "z": 54,
    "len": 8,
    "h": 4,
    "thick": 0.6,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "wall",
    "x": -56,
    "z": -52,
    "len": 29,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": -50.5,
    "z": -58.5,
    "len": 42,
    "h": 4,
    "thick": 0.5,
    "mat": "concrete",
    "axis": "x"
  },
  {
    "kind": "wall",
    "x": -70.5,
    "z": -55,
    "len": 8,
    "h": 4,
    "thick": 0.6,
    "mat": "concrete",
    "axis": "z"
  },
  {
    "kind": "slab",
    "x": -0.5,
    "y": 3.5,
    "w": 159,
    "h": 0.5,
    "d": 118,
    "mat": "concrete"
  }
];

export const SPACE_PRESIDENT = {
  name: 'SPACE-PRESIDENT',
  env: {
    indoor: false,
    bounds: { x: HX - 0.6, z: HZ - 0.6 },
    fog: { color: 0x87CEEB, near: 30, far: 150 },
    skyColor: 0x87CEEB,
    spawnPoint: {
        blue: [{x: -66 ,y: 0.8,z: -55}],
        red: [{x: 69 ,y: 0.8,z: 54}]
    },
  },
  parts,
};
