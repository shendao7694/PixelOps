// A map is a flat list of "parts". Each part is a small JSON object that
// expands into one or more boxes. The game and the editor both build from this
// list, so what you place in the editor is exactly what you play.
//
// Every part kind declares its editable fields so the editor can build a
// property panel automatically - add a kind here and it shows up in the tool.

import * as THREE from '../../vendor/three.module.js';

/** Named materials, mapped onto the generated pixel textures. */
export const MATERIALS = {
  concrete: { tex: 'concrete', label: 'CONCRETE', surface: 'concrete' },
  concreteDark: { tex: 'concreteDark', label: 'CONCRETE DK', surface: 'concrete' },
  brick: { tex: 'brick', label: 'BRICK', surface: 'concrete' },
  asphalt: { tex: 'asphalt', label: 'ASPHALT', surface: 'concrete' },
  tile: { tex: 'tile', label: 'TILE', surface: 'concrete' },
  sand: { tex: 'sand', label: 'SAND', surface: 'sand' },
  metal: { tex: 'metal', label: 'METAL', surface: 'metal' },
  metalDark: { tex: 'metalDark', label: 'METAL DK', surface: 'metal' },
  roof: { tex: 'roof', label: 'ROOF', surface: 'metal' },
  crate: { tex: 'crate', label: 'CRATE', surface: 'wood' },
  wood: { tex: 'wood', label: 'WOOD', surface: 'wood' },
  sandbag: { tex: 'sandbag', label: 'SANDBAG', surface: 'sand' },
  hazard: { tex: 'hazard', label: 'HAZARD', surface: 'metal' },
  glass: { tex: 'glass', label: 'GLASS', surface: 'metal' },
  containerGreen: { tex: 'containerGreen', label: 'CTR GREEN', surface: 'metal' },
  containerRust: { tex: 'containerRust', label: 'CTR RUST', surface: 'metal' },
  containerBlue: { tex: 'containerBlue', label: 'CTR BLUE', surface: 'metal' },
};

export const MATERIAL_KEYS = Object.keys(MATERIALS);

/* ------------------------------------------------------------------ fields */
// n = number, b = bool, m = material, c = choice
const N = (key, label, min, max, step = 0.5) => ({ key, label, type: 'n', min, max, step });
const B = (key, label) => ({ key, label, type: 'b' });
const M = (key, label) => ({ key, label, type: 'm' });
const C = (key, label, options) => ({ key, label, type: 'c', options });

const POS = [N('x', 'X', -60, 60, 0.5), N('y', 'Y', -2, 30, 0.5), N('z', 'Z', -60, 60, 0.5)];
const AXIS = C('axis', 'AXIS', ['x', 'z']);

/* --------------------------------------------------------------- emit sink */

/**
 * Parts emit through this so the same code produces meshes for the game and
 * for the editor. `emit.box` matches the level Builder's signature.
 */
function emitBox(out, x, y, z, w, h, d, mat, opts) {
  if (w <= 0.001 || h <= 0.001 || d <= 0.001) return;
  out.push({ x, y, z, w, h, d, mat, opts: opts || {} });
}

/* ------------------------------------------------------------------ shapes */

function expandBox(p, out) {
  emitBox(out, p.x, p.y, p.z, p.w, p.h, p.d, p.mat, {
    tile: p.tile, collide: p.collide !== false, castShadow: p.shadow !== false,
    walkway: !!p.walkway, tint: p.tint,
  });
}

function expandWallDoor(p, out) {
  const len = p.len, h = p.h, thick = p.thick;
  const doorW = Math.min(p.doorW, len - 0.4);
  const doorH = Math.min(p.doorH, h);
  const side = (len - doorW) / 2;
  const half = doorW / 2 + side / 2;
  const o = { tile: p.tile, tint: p.tint };
  if (p.axis === 'x') {
    emitBox(out, p.x - half, p.y, p.z, side, h, thick, p.mat, o);
    emitBox(out, p.x + half, p.y, p.z, side, h, thick, p.mat, o);
    if (h > doorH) emitBox(out, p.x, p.y + doorH, p.z, doorW, h - doorH, thick, p.mat, o);
  } else {
    emitBox(out, p.x, p.y, p.z - half, thick, h, side, p.mat, o);
    emitBox(out, p.x, p.y, p.z + half, thick, h, side, p.mat, o);
    if (h > doorH) emitBox(out, p.x, p.y + doorH, p.z, thick, h - doorH, doorW, p.mat, o);
  }
}

function expandWallWindows(p, out) {
  const { len, h, thick, sillH, winH } = p;
  const topH = h - sillH - winH;
  const o = { tile: p.tile, tint: p.tint };
  const bars = Math.max(0, Math.round(p.bars === undefined ? 3 : p.bars));
  if (p.axis === 'x') {
    emitBox(out, p.x, p.y, p.z, len, sillH, thick, p.mat, o);
    if (topH > 0.01) emitBox(out, p.x, p.y + sillH + winH, p.z, len, topH, thick, p.mat, o);
    for (let i = 1; i <= bars; i++) {
      const px = p.x - len / 2 + (len * i) / (bars + 1);
      emitBox(out, px, p.y + sillH, p.z, 0.35, winH, thick, p.mat, { tile: p.tile, collide: false });
    }
  } else {
    emitBox(out, p.x, p.y, p.z, thick, sillH, len, p.mat, o);
    if (topH > 0.01) emitBox(out, p.x, p.y + sillH + winH, p.z, thick, topH, len, p.mat, o);
    for (let i = 1; i <= bars; i++) {
      const pz = p.z - len / 2 + (len * i) / (bars + 1);
      emitBox(out, p.x, p.y + sillH, pz, thick, winH, 0.35, p.mat, { tile: p.tile, collide: false });
    }
  }
}

function expandWall(p, out) {
  const o = { tile: p.tile, walkway: !!p.walkway, tint: p.tint };
  if (p.axis === 'x') emitBox(out, p.x, p.y, p.z, p.len, p.h, p.thick, p.mat, o);
  else emitBox(out, p.x, p.y, p.z, p.thick, p.h, p.len, p.mat, o);
}

function expandSlab(p, out) {
  const o = { tile: p.tile, walkway: p.walkway !== false, surface: p.mat, tint: p.tint };
  if (!p.hole) {
    emitBox(out, p.x, p.y, p.z, p.w, p.h, p.d, p.mat, o);
    return;
  }
  const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2;
  const z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
  const hx0 = p.x + p.holeX - p.holeW / 2, hx1 = p.x + p.holeX + p.holeW / 2;
  const hz0 = p.z + p.holeZ - p.holeD / 2, hz1 = p.z + p.holeZ + p.holeD / 2;
  if (hz0 > z0) emitBox(out, p.x, p.y, (z0 + hz0) / 2, p.w, p.h, hz0 - z0, p.mat, o);
  if (z1 > hz1) emitBox(out, p.x, p.y, (hz1 + z1) / 2, p.w, p.h, z1 - hz1, p.mat, o);
  if (hx0 > x0) emitBox(out, (x0 + hx0) / 2, p.y, (hz0 + hz1) / 2, hx0 - x0, p.h, hz1 - hz0, p.mat, o);
  if (x1 > hx1) emitBox(out, (hx1 + x1) / 2, p.y, (hz0 + hz1) / 2, x1 - hx1, p.h, hz1 - hz0, p.mat, o);
}

function expandStairs(p, out) {
  const steps = Math.max(1, Math.round(p.steps));
  const rise = p.rise, run = p.run, dir = p.dir < 0 ? -1 : 1;
  // What you SEE is a staircase (draw-only boxes)...
  for (let i = 0; i < steps; i++) {
    const h = rise * (i + 1);
    const o = { collide: false, stairVisual: true, tile: p.tile, tint: p.tint };
    if (p.axis === 'z') emitBox(out, p.x, p.y, p.z + dir * (i * run + run / 2), p.width, h, run, p.mat, o);
    else emitBox(out, p.x + dir * (i * run + run / 2), p.y, p.z, run, h, p.width, p.mat, o);
  }
  // ...but what you CLIMB is one mathematically continuous invisible ramp.
  // Keeping this as a single descriptor (instead of dozens of micro-boxes)
  // gives the browser and authoritative server exactly the same foot height.
  const total = rise * steps;
  const len = run * steps;
  // Begin one tread before the visible first riser. The plane then touches
  // every tread's upper leading edge instead of cutting through the boxes;
  // the final tread is a short flat landing at full height.
  const rampStart = (p.axis === 'z' ? p.z : p.x) - dir * run;
  const collisionLen = len + run;
  const o = {
    ghost: true,
    surface: 'metal',
    walkway: true,
    ramp: {
      axis: p.axis,
      dir,
      start: rampStart,
      length: len,
      rise: total,
    },
  };
  if (p.axis === 'z') {
    emitBox(out, p.x, p.y, p.z + dir * (len - run) / 2,
      p.width, total, collisionLen, p.mat, o);
  } else {
    emitBox(out, p.x + dir * (len - run) / 2, p.y, p.z,
      collisionLen, total, p.width, p.mat, o);
  }
}

/** Ramp version of stairs, for vehicles-style slopes; still box steps. */
function expandRamp(p, out) {
  const steps = Math.max(2, Math.round(p.len / 0.4));
  const run = p.len / steps;
  const rise = p.h / steps;
  const dir = p.dir < 0 ? -1 : 1;
  for (let i = 0; i < steps; i++) {
    const h = rise * (i + 1);
    const o = { surface: 'metal', walkway: i === steps - 1, tile: p.tile, tint: p.tint };
    if (p.axis === 'z') emitBox(out, p.x, p.y, p.z + dir * (i * run + run / 2), p.width, h, run, p.mat, o);
    else emitBox(out, p.x + dir * (i * run + run / 2), p.y, p.z, run, h, p.width, p.mat, o);
  }
}

function expandContainer(p, out) {
  const w = p.axis === 'z' ? 2.5 : 6.1;
  const d = p.axis === 'z' ? 6.1 : 2.5;
  emitBox(out, p.x, p.y, p.z, w, 2.6, d, p.mat, { surface: 'metal', tile: 2.6 });
  const cw = p.axis === 'z' ? 0.35 : 0.4;
  const cd = p.axis === 'z' ? 0.4 : 0.35;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      emitBox(out, p.x + sx * (w / 2 - cw / 2), p.y, p.z + sz * (d / 2 - cd / 2), cw, 2.62, cd,
        'metalDark', { collide: false, surface: 'metal' });
    }
  }
}

function expandCrateStack(p, out) {
  const n = Math.max(1, Math.round(p.count));
  for (let i = 0; i < n; i++) {
    const s = p.size - i * 0.12;
    emitBox(out, p.x, p.y + i * p.size * 0.96, p.z, s, p.size * 0.96, s, p.mat, { surface: 'wood' });
  }
}

function expandSandbag(p, out) {
  if (p.axis === 'x') emitBox(out, p.x, p.y, p.z, p.len, p.h, 0.9, 'sandbag', { surface: 'sand' });
  else emitBox(out, p.x, p.y, p.z, 0.9, p.h, p.len, 'sandbag', { surface: 'sand' });
}

function expandBarrel(p, out) {
  emitBox(out, p.x, p.y, p.z, 0.84, 1.15, 0.84, 'metal', { surface: 'metal', cyl: true, tint: p.tint });
}

function expandLamp(p, out) {
  emitBox(out, p.x, p.y, p.z, 0.28, p.h, 0.28, 'metalDark', { surface: 'metal' });
  emitBox(out, p.x, p.y + p.h - 0.2, p.z, 1.4, 0.25, 0.5, 'metalDark', { collide: false, surface: 'metal' });
  emitBox(out, p.x + 0.45, p.y + p.h - 0.34, p.z, 0.9, 0.18, 0.4, 'metalDark',
    { collide: false, lamp: true });
}

function expandPipes(p, out) {
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 0.42;
    const o = { collide: false, surface: 'metal' };
    if (p.axis === 'x') emitBox(out, p.x, p.y + off * 0.6 + 0.3, p.z + off, p.len, 0.32, 0.32, 'metalDark', o);
    else emitBox(out, p.x + off, p.y + off * 0.6 + 0.3, p.z, 0.32, 0.32, p.len, 'metalDark', o);
  }
}

function expandRailing(p, out) {
  const o = { collide: false, tile: 1, tint: p.tint };
  if (p.axis === 'x') {
    emitBox(out, p.x, p.y + p.h - 0.12, p.z, p.len, 0.12, 0.14, p.mat, o);
    emitBox(out, p.x, p.y + p.h * 0.45, p.z, p.len, 0.08, 0.10, p.mat, o);
    const posts = Math.max(2, Math.round(p.len / 1.6));
    for (let i = 0; i <= posts; i++) {
      emitBox(out, p.x - p.len / 2 + (p.len * i) / posts, p.y, p.z, 0.10, p.h, 0.14, p.mat, o);
    }
  } else {
    emitBox(out, p.x, p.y + p.h - 0.12, p.z, 0.14, 0.12, p.len, p.mat, o);
    emitBox(out, p.x, p.y + p.h * 0.45, p.z, 0.10, 0.08, p.len, p.mat, o);
    const posts = Math.max(2, Math.round(p.len / 1.6));
    for (let i = 0; i <= posts; i++) {
      emitBox(out, p.x, p.y, p.z - p.len / 2 + (p.len * i) / posts, 0.14, p.h, 0.10, p.mat, o);
    }
  }
}

/**
 * A complete room: four walls with a chosen opening on each side, plus an
 * optional floor slab and roof. This is the workhorse building template.
 */
function expandRoom(p, out) {
  const { x, y, z, w, d, h, thick, mat } = p;
  // NB: the west side is keyed `w_` because `w` is already the room's width.
  const sides = [
    { key: 'n', axis: 'x', cx: x, cz: z - d / 2, len: w },
    { key: 's', axis: 'x', cx: x, cz: z + d / 2, len: w },
    { key: 'w_', axis: 'z', cx: x - w / 2, cz: z, len: d },
    { key: 'e', axis: 'z', cx: x + w / 2, cz: z, len: d },
  ];
  if (p.floor) {
    emitBox(out, x, y - 0.3, z, w + thick, 0.3, d + thick, p.floorMat || 'concreteDark',
      { tile: 3, walkway: true });
  }
  for (const s of sides) {
    const mode = p[s.key] || 'wall';
    if (mode === 'open') continue;
    const base = { x: s.cx, y, z: s.cz, len: s.len, h, thick, mat, axis: s.axis, tile: p.tile, tint: p.tint };
    if (mode === 'door') expandWallDoor({ ...base, doorW: p.doorW, doorH: p.doorH }, out);
    else if (mode === 'window') expandWallWindows({ ...base, sillH: p.sillH, winH: p.winH, bars: 3 }, out);
    else expandWall({ ...base }, out);
  }
  if (p.roof) {
    emitBox(out, x, y + h, z, w + thick + 1.0, 0.4, d + thick + 1.0, p.roofMat || 'roof',
      { tile: 3, walkway: true, surface: 'metal' });
    if (p.parapet) {
      const rw = w + thick + 1.0, rd = d + thick + 1.0;
      emitBox(out, x, y + h + 0.4, z - rd / 2 + 0.2, rw, 0.7, 0.4, 'metalDark', { tile: 2 });
      emitBox(out, x, y + h + 0.4, z + rd / 2 - 0.2, rw, 0.7, 0.4, 'metalDark', { tile: 2 });
      emitBox(out, x - rw / 2 + 0.2, y + h + 0.4, z, 0.4, 0.7, rd, 'metalDark', { tile: 2 });
      emitBox(out, x + rw / 2 - 0.2, y + h + 0.4, z, 0.4, 0.7, rd, 'metalDark', { tile: 2 });
    }
  }
}

/** Perimeter wall enclosing the whole arena. */
function expandPerimeter(p, out) {
  const H = p.h, T = p.thick, R = p.radius;
  for (const s of [-1, 1]) {
    emitBox(out, 0, p.y, s * R, R * 2 + T, H, T, p.mat, { tile: 3 });
    emitBox(out, s * R, p.y, 0, T, H, R * 2 + T, p.mat, { tile: 3 });
    emitBox(out, 0, p.y + H, s * R, R * 2 + T, 0.35, T + 0.1, 'hazard', { collide: false, tile: 1.4 });
    emitBox(out, s * R, p.y + H, 0, T + 0.1, 0.35, R * 2 + T, 'hazard', { collide: false, tile: 1.4 });
  }
}

/* ------------------------------------------------------------- definitions */

export const PART_KINDS = {
  box: {
    label: 'BOX',
    group: 'shape',
    expand: expandBox,
    defaults: { x: 0, y: 0, z: 0, w: 2, h: 2, d: 2, mat: 'concrete', tile: 2, collide: true, shadow: true, walkway: false },
    fields: [...POS, N('w', 'WIDTH', 0.2, 80), N('h', 'HEIGHT', 0.2, 30), N('d', 'DEPTH', 0.2, 80),
      M('mat', 'MATERIAL'), N('tile', 'TEX SCALE', 0.5, 8, 0.5), B('collide', 'SOLID'), B('walkway', 'WALKWAY'),
      C('tint', 'COLOUR', [0xffffff, 0xe05a4e, 0xf2b134, 0x4fa75a, 0x3f8fd2, 0x9a68c8, 0xf279b6])],
    size: (p) => [p.w, p.h, p.d],
  },
  wall: {
    label: 'WALL',
    group: 'build',
    expand: expandWall,
    defaults: { x: 0, y: 0, z: 0, len: 8, h: 3.5, thick: 0.6, mat: 'concrete', axis: 'x', tile: 2.5 },
    fields: [...POS, N('len', 'LENGTH', 0.5, 80), N('h', 'HEIGHT', 0.5, 20), N('thick', 'THICK', 0.2, 4, 0.1),
      AXIS, M('mat', 'MATERIAL'), N('tile', 'TEX SCALE', 0.5, 8, 0.5)],
    size: (p) => (p.axis === 'x' ? [p.len, p.h, p.thick] : [p.thick, p.h, p.len]),
  },
  wallDoor: {
    label: 'WALL + DOOR',
    group: 'build',
    expand: expandWallDoor,
    defaults: { x: 0, y: 0, z: 0, len: 10, h: 4, thick: 0.6, mat: 'concrete', axis: 'x', doorW: 3.2, doorH: 2.6, tile: 2.5 },
    fields: [...POS, N('len', 'LENGTH', 1, 80), N('h', 'HEIGHT', 1, 20), N('thick', 'THICK', 0.2, 4, 0.1),
      N('doorW', 'DOOR W', 0.8, 12, 0.2), N('doorH', 'DOOR H', 1.6, 8, 0.1),
      AXIS, M('mat', 'MATERIAL'), N('tile', 'TEX SCALE', 0.5, 8, 0.5)],
    size: (p) => (p.axis === 'x' ? [p.len, p.h, p.thick] : [p.thick, p.h, p.len]),
  },
  wallWindows: {
    label: 'WALL + WINDOWS',
    group: 'build',
    expand: expandWallWindows,
    defaults: { x: 0, y: 0, z: 0, len: 10, h: 3.5, thick: 0.6, mat: 'concrete', axis: 'x', sillH: 1.1, winH: 1.3, bars: 3, tile: 2.5 },
    fields: [...POS, N('len', 'LENGTH', 1, 80), N('h', 'HEIGHT', 1, 20), N('thick', 'THICK', 0.2, 4, 0.1),
      N('sillH', 'SILL H', 0.2, 6, 0.1), N('winH', 'WINDOW H', 0.3, 6, 0.1), N('bars', 'MULLIONS', 0, 8, 1),
      AXIS, M('mat', 'MATERIAL'), N('tile', 'TEX SCALE', 0.5, 8, 0.5)],
    size: (p) => (p.axis === 'x' ? [p.len, p.h, p.thick] : [p.thick, p.h, p.len]),
  },
  room: {
    label: 'ROOM / BUILDING',
    group: 'build',
    expand: expandRoom,
    defaults: {
      x: 0, y: 0, z: 0, w: 12, d: 10, h: 4, thick: 0.6, mat: 'concrete', tile: 2.5,
      n: 'door', s: 'door', e: 'window', w_: 'window',
      doorW: 3.2, doorH: 2.6, sillH: 1.1, winH: 1.3,
      floor: false, roof: true, parapet: false, roofMat: 'roof', floorMat: 'concreteDark',
    },
    fields: [...POS, N('w', 'WIDTH', 2, 60), N('d', 'DEPTH', 2, 60), N('h', 'HEIGHT', 1.5, 20),
      N('thick', 'THICK', 0.2, 4, 0.1),
      C('n', 'NORTH', ['wall', 'door', 'window', 'open']),
      C('s', 'SOUTH', ['wall', 'door', 'window', 'open']),
      C('w_', 'WEST', ['wall', 'door', 'window', 'open']),
      C('e', 'EAST', ['wall', 'door', 'window', 'open']),
      N('doorW', 'DOOR W', 0.8, 12, 0.2), N('doorH', 'DOOR H', 1.6, 8, 0.1),
      N('sillH', 'SILL H', 0.2, 6, 0.1), N('winH', 'WINDOW H', 0.3, 6, 0.1),
      B('floor', 'FLOOR'), B('roof', 'ROOF'), B('parapet', 'PARAPET'),
      M('mat', 'WALL MAT'), M('roofMat', 'ROOF MAT'), N('tile', 'TEX SCALE', 0.5, 8, 0.5)],
    size: (p) => [p.w, p.h + (p.roof ? 0.4 : 0), p.d],
  },
  slab: {
    label: 'FLOOR / SLAB',
    group: 'build',
    expand: expandSlab,
    defaults: {
      x: 0, y: 4, z: 0, w: 12, h: 0.4, d: 10, mat: 'concreteDark', tile: 3, walkway: true,
      hole: false, holeX: 0, holeZ: 0, holeW: 3, holeD: 4,
    },
    fields: [...POS, N('w', 'WIDTH', 0.5, 80), N('h', 'THICK', 0.1, 3, 0.05), N('d', 'DEPTH', 0.5, 80),
      B('hole', 'STAIRWELL HOLE'), N('holeX', 'HOLE X', -30, 30), N('holeZ', 'HOLE Z', -30, 30),
      N('holeW', 'HOLE W', 0.5, 20), N('holeD', 'HOLE D', 0.5, 20),
      M('mat', 'MATERIAL'), N('tile', 'TEX SCALE', 0.5, 8, 0.5)],
    size: (p) => [p.w, p.h, p.d],
  },
  stairs: {
    label: 'STAIRS',
    group: 'build',
    expand: expandStairs,
    defaults: { x: 0, y: 0, z: 0, steps: 10, rise: 0.445, run: 0.5, width: 3, mat: 'metalDark', axis: 'z', dir: 1, tile: 2 },
    fields: [...POS, N('steps', 'STEPS', 1, 40, 1), N('rise', 'RISE', 0.1, 0.55, 0.005),
      N('run', 'RUN', 0.2, 1.5, 0.05), N('width', 'WIDTH', 0.5, 12, 0.1),
      AXIS, C('dir', 'DIRECTION', [1, -1]), M('mat', 'MATERIAL')],
    size: (p) => (p.axis === 'z'
      ? [p.width, p.rise * p.steps, p.run * p.steps]
      : [p.run * p.steps, p.rise * p.steps, p.width]),
    anchor: (p) => (p.axis === 'z'
      ? [0, 0, (p.dir < 0 ? -1 : 1) * p.run * p.steps / 2]
      : [(p.dir < 0 ? -1 : 1) * p.run * p.steps / 2, 0, 0]),
  },
  ramp: {
    label: 'RAMP',
    group: 'build',
    expand: expandRamp,
    defaults: { x: 0, y: 0, z: 0, len: 5, h: 2.5, width: 3, mat: 'concreteDark', axis: 'z', dir: 1, tile: 2 },
    fields: [...POS, N('len', 'LENGTH', 1, 30), N('h', 'RISE', 0.3, 15, 0.1), N('width', 'WIDTH', 0.5, 12, 0.1),
      AXIS, C('dir', 'DIRECTION', [1, -1]), M('mat', 'MATERIAL')],
    size: (p) => (p.axis === 'z' ? [p.width, p.h, p.len] : [p.len, p.h, p.width]),
    anchor: (p) => (p.axis === 'z'
      ? [0, 0, (p.dir < 0 ? -1 : 1) * p.len / 2]
      : [(p.dir < 0 ? -1 : 1) * p.len / 2, 0, 0]),
  },
  railing: {
    label: 'RAILING',
    group: 'build',
    expand: expandRailing,
    defaults: { x: 0, y: 0, z: 0, len: 6, h: 1.0, mat: 'metalDark', axis: 'x' },
    fields: [...POS, N('len', 'LENGTH', 0.5, 40), N('h', 'HEIGHT', 0.3, 3, 0.1), AXIS, M('mat', 'MATERIAL')],
    size: (p) => (p.axis === 'x' ? [p.len, p.h, 0.14] : [0.14, p.h, p.len]),
  },
  container: {
    label: 'CONTAINER',
    group: 'prop',
    expand: expandContainer,
    defaults: { x: 0, y: 0, z: 0, mat: 'containerGreen', axis: 'x' },
    fields: [...POS, AXIS, M('mat', 'MATERIAL')],
    size: (p) => (p.axis === 'z' ? [2.5, 2.6, 6.1] : [6.1, 2.6, 2.5]),
  },
  crateStack: {
    label: 'CRATE STACK',
    group: 'prop',
    expand: expandCrateStack,
    defaults: { x: 0, y: 0, z: 0, count: 2, size: 1.25, mat: 'crate' },
    fields: [...POS, N('count', 'COUNT', 1, 8, 1), N('size', 'SIZE', 0.4, 3, 0.05), M('mat', 'MATERIAL')],
    size: (p) => [p.size, p.size * 0.96 * p.count, p.size],
  },
  sandbag: {
    label: 'SANDBAG WALL',
    group: 'prop',
    expand: expandSandbag,
    defaults: { x: 0, y: 0, z: 0, len: 6, h: 1.05, axis: 'x' },
    fields: [...POS, N('len', 'LENGTH', 1, 30), N('h', 'HEIGHT', 0.4, 3, 0.05), AXIS],
    size: (p) => (p.axis === 'x' ? [p.len, p.h, 0.9] : [0.9, p.h, p.len]),
  },
  barrel: {
    label: 'BARREL',
    group: 'prop',
    expand: expandBarrel,
    defaults: { x: 0, y: 0, z: 0, tint: 0xb04a2a },
    fields: [...POS, C('tint', 'COLOUR', [0xb04a2a, 0x3f6f4a, 0x8a8f96, 0x2f4f7a])],
    size: () => [0.84, 1.15, 0.84],
  },
  lamp: {
    label: 'LAMP POST',
    group: 'prop',
    expand: expandLamp,
    defaults: { x: 0, y: 0, z: 0, h: 6.2 },
    fields: [...POS, N('h', 'HEIGHT', 2, 14, 0.2)],
    size: (p) => [0.28, p.h, 0.28],
  },
  pipes: {
    label: 'PIPES',
    group: 'prop',
    expand: expandPipes,
    defaults: { x: 0, y: 2.4, z: 0, len: 16, axis: 'x' },
    fields: [...POS, N('len', 'LENGTH', 1, 60), AXIS],
    size: (p) => (p.axis === 'x' ? [p.len, 1.2, 1.2] : [1.2, 1.2, p.len]),
  },
  ceilingLight: {
    label: 'CEILING LIGHT',
    group: 'prop',
    expand: (p, out) => {
      emitBox(out, p.x, p.y, p.z, p.w, 0.12, p.d, 'metalDark', { collide: false, surface: 'metal' });
      emitBox(out, p.x, p.y - 0.10, p.z, p.w - 0.3, 0.10, p.d - 0.3, 'metalDark',
        { collide: false, lamp: true, range: p.range, power: p.power });
    },
    defaults: { x: 0, y: 5.8, z: 0, w: 2.4, d: 0.5, range: 16, power: 14 },
    fields: [...POS, N('w', 'WIDTH', 0.4, 8, 0.2), N('d', 'DEPTH', 0.2, 8, 0.1),
      N('range', 'RANGE', 4, 40), N('power', 'BRIGHTNESS', 1, 60)],
    size: (p) => [p.w, 0.22, p.d],
  },
  perimeter: {
    label: 'PERIMETER WALL',
    group: 'terrain',
    expand: expandPerimeter,
    defaults: { x: 0, y: 0, z: 0, radius: 38, h: 9, thick: 1.6, mat: 'concrete' },
    fields: [N('y', 'Y', -2, 10, 0.5), N('radius', 'RADIUS', 10, 60), N('h', 'HEIGHT', 2, 20),
      N('thick', 'THICK', 0.5, 5, 0.1), M('mat', 'MATERIAL')],
    size: (p) => [p.radius * 2, p.h, p.radius * 2],
    unique: true,
  },
  ground: {
    label: 'GROUND',
    group: 'terrain',
    expand: (p, out) => {
      emitBox(out, 0, p.y - 2, 0, p.size, 2, p.size, p.mat, { collide: false, castShadow: false, tile: 4, ground: true });
    },
    defaults: { x: 0, y: 0, z: 0, size: 84, mat: 'sand' },
    fields: [N('y', 'Y', -4, 4, 0.5), N('size', 'SIZE', 20, 200, 2), M('mat', 'MATERIAL')],
    size: (p) => [p.size, 2, p.size],
    unique: true,
  },
};

export const PART_GROUPS = [
  { key: 'build', label: 'STRUCTURES' },
  { key: 'shape', label: 'SHAPES' },
  { key: 'prop', label: 'PROPS' },
  { key: 'terrain', label: 'TERRAIN' },
];

let nextId = 1;
export function makePart(kind, overrides = {}) {
  const def = PART_KINDS[kind];
  if (!def) throw new Error('unknown part kind: ' + kind);
  return { id: nextId++, kind, ...def.defaults, ...overrides };
}

export function resetPartIds(parts) {
  let max = 0;
  for (const p of parts) if (p.id > max) max = p.id;
  nextId = max + 1;
}

/** Expand one part into raw boxes. */
export function expandPart(part) {
  const def = PART_KINDS[part.kind];
  if (!def) return [];
  const out = [];
  def.expand(part, out);
  return out;
}

/** Bounding size of a part, used for the editor ghost and for snapping. */
export function partSize(part) {
  const def = PART_KINDS[part.kind];
  if (!def || !def.size) return [1, 1, 1];
  const s = def.size(part);
  return [Math.max(0.1, s[0]), Math.max(0.1, s[1]), Math.max(0.1, s[2])];
}

/** Offset from the part origin to the centre of its bounding box. */
export function partAnchor(part) {
  const def = PART_KINDS[part.kind];
  return def && def.anchor ? def.anchor(part) : [0, 0, 0];
}

export function partBounds(part, target = new THREE.Box3()) {
  const [w, h, d] = partSize(part);
  const [ax, ay, az] = partAnchor(part);
  target.min.set(part.x + ax - w / 2, part.y + ay, part.z + az - d / 2);
  target.max.set(part.x + ax + w / 2, part.y + ay + h, part.z + az + d / 2);
  return target;
}
