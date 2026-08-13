// RUINS - a war-torn Middle-Eastern city block under a dusty haze, same
// footprint class as PLAYLAND (interior 192 x 158 m, walls 8 m high).
//
// Where BLACKSITE is symmetric and PLAYLAND is point-symmetric, RUINS is
// deliberately NOT: a bombed district is chaotic, so every block is unique.
// PVE-only for now, so fairness comes from both spawns getting comparable
// cover density rather than mirrored geometry.
//
// The blocks, roughly north to south:
//   NW       - ROWHOUSE RUINS: five roofless homes, one with a half stair
//   N centre - BURNT TANK on the north avenue, craters and rebar
//   NE       - MOSQUE CORNER: domed prayer hall + climbable minaret
//   centre   - THE SPLIT FLATS: an apartment block torn in half, both
//              halves climbable (intact wing roof / collapsed-wing slab)
//   centre E - THE ARCADE: the big central ruin, shopping hall with a
//              collapsed SE corner, roof plates, entrance canopy, dry fountain
//   E centre - WORKSHOP + WATER TOWER: broken roof deck, blue tank
//   main st  - MARKET ROW: eight stalls under tattered awnings
//   S block  - CAFÉ / GARAGE / KIOSK / HOUSE RUIN: a built-up canyon
//              closing the market row's south side
//   N block  - BOMBED HOUSE + PLASTER HOUSE: alley-yard homes
//   SE       - COURTYARD VILLA: two storeys, outer stair to the roof
//   crossing - THE CHECKPOINT: sandbags, barriers, burnt cars, guard tower
//   W main   - BUS WRECK blocking the avenue
//   S        - THE MINISTRY: two standing wings, collapsed climbable middle
//
// Ground paints (tops staggered so overlapping flats never flicker):
//   sand lots 0.02 / asphalt streets 0.04 / sidewalks 0.06 /
//   crater scorch 0.055 on asphalt, 0.035 on sand
// Streets never overlap each other: every avenue is split into segments at
// each crossing so no two asphalt boxes share a top face.
//
// Hard rules this file follows (same as PLAYLAND):
//   - flat ground paints never share a top height where they overlap
//   - rubble chunks that touch each other differ in top height by >= 0.06
//   - stairs land 0.05-0.1 below the slab they serve (a lip, never coplanar)
//   - snapped floor slabs are held up by a wall or a column, never floating
//   - wires / awning cloth / scorch marks are thin collide:false dressing,
//     their ends always buried 0.05+ into the support so no faces coincide

const HX = 96, HZ = 79;        // interior half-extents (192 x 158)
const WALL_H = 8.0;
const WT = 1.0;

// dusty war palette, always multiplying the concrete / brick / sand textures
const TAN = 0xc4a97a, DTAN = 0xa8895c, PLAS = 0xd6cfc0, GREY = 0x8f8b84;
const DGREY = 0x6a675f, CHAR = 0x3b3835, RUST = 0x8a4a2e, OLIVE = 0x5d6647;
const BRICKT = 0x9a5f48, BLUE = 0x4a6d8c, YEL = 0xc9a227, REDT = 0x9a3d34;
const WHITE = 0xcdc7ba;

const parts = [];
const add = (...p) => parts.push(...p);

// deterministic pseudo-random for debris scatter (stable across builds)
let seed = 1407;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/* ------------------------------------------------------------- shell */
add({ kind: 'slab', x: 0, y: -0.5, z: 0, w: HX * 2 + WT * 2, h: 0.5, d: HZ * 2 + WT * 2,
  mat: 'tile', tile: 2.5, walkway: true });

// perimeter walls - battered city edge, still solid so nobody leaves the map
add(
  { kind: 'wall', x: 0, y: 0, z: -(HZ + WT / 2), len: HX * 2 + WT * 2, h: WALL_H, thick: WT, mat: 'concrete', axis: 'x', tile: 3 },
  { kind: 'wall', x: 0, y: 0, z: HZ + WT / 2, len: HX * 2 + WT * 2, h: WALL_H, thick: WT, mat: 'concrete', axis: 'x', tile: 3 },
  { kind: 'wall', x: -(HX + WT / 2), y: 0, z: 0, len: HZ * 2, h: WALL_H, thick: WT, mat: 'concrete', axis: 'z', tile: 3 },
  { kind: 'wall', x: HX + WT / 2, y: 0, z: 0, len: HZ * 2, h: WALL_H, thick: WT, mat: 'concrete', axis: 'z', tile: 3 },
);
// pockmarked dark patches on the perimeter, buried 5 cm into the wall faces
for (const [px, pz, w, h] of [
  [-60, -(HZ - 0.12), 5, 2.2], [-18, -(HZ - 0.12), 3.4, 1.6], [44, -(HZ - 0.12), 6, 3.0],
  [-34, HZ - 0.12, 4.4, 2.0], [30, HZ - 0.12, 3.0, 1.4], [72, HZ - 0.12, 5.2, 2.6],
]) {
  add({ kind: 'box', x: px, y: 0.4, z: pz, w, h, d: 0.3, mat: 'concreteDark', tile: 2, collide: false });
}
for (const [pz, px, d, h] of [
  [-44, -(HX - 0.12), 5, 2.4], [8, -(HX - 0.12), 3.6, 1.8], [40, -(HX - 0.12), 4.6, 2.8],
  [-20, HX - 0.12, 5.4, 2.2], [26, HX - 0.12, 3.2, 1.5], [-58, HX - 0.12, 4.0, 2.5],
]) {
  add({ kind: 'box', x: px, y: 0.4, z: pz, w: 0.3, h, d, mat: 'concreteDark', tile: 2, collide: false });
}

/* ------------------------------------------------- ground: streets */
// Main avenue runs E-W at z=12 (z 8..16). North avenue runs N-S at x=-14
// (x -17.5..-10.5). Back alley E-W at z=-34 (z -37..-31). East lane N-S at
// x=38 (x 35.25..40.75). Every street is SEGMENTED at crossings.
const ASPH = { mat: 'asphalt', tile: 3, collide: false };
// main avenue, split at the north avenue and the east lane
add(
  { kind: 'box', x: (-92 + -17.5) / 2, y: 0, z: 12, w: -17.5 - -92, h: 0.04, d: 8, ...ASPH },
  { kind: 'box', x: (-10.5 + 35.25) / 2, y: 0, z: 12, w: 35.25 - -10.5, h: 0.04, d: 8, ...ASPH },
  { kind: 'box', x: (40.75 + 92) / 2, y: 0, z: 12, w: 92 - 40.75, h: 0.04, d: 8, ...ASPH },
);
// north avenue, split at the back alley and main avenue
add(
  { kind: 'box', x: -14, y: 0, z: (-74 + -37) / 2, w: 7, h: 0.04, d: -37 - -74, ...ASPH },
  { kind: 'box', x: -14, y: 0, z: (-31 + 8) / 2, w: 7, h: 0.04, d: 8 - -31, ...ASPH },
  { kind: 'box', x: -14, y: 0, z: (16 + 74) / 2, w: 7, h: 0.04, d: 74 - 16, ...ASPH },
);
// back alley, split at the north avenue and east lane
add(
  { kind: 'box', x: (-88 + -17.5) / 2, y: 0, z: -34, w: -17.5 - -88, h: 0.04, d: 6, ...ASPH },
  { kind: 'box', x: (-10.5 + 35.25) / 2, y: 0, z: -34, w: 35.25 - -10.5, h: 0.04, d: 6, ...ASPH },
  { kind: 'box', x: (40.75 + 88) / 2, y: 0, z: -34, w: 88 - 40.75, h: 0.04, d: 6, ...ASPH },
);
// east lane, split at back alley and main avenue
add(
  { kind: 'box', x: 38, y: 0, z: (-70 + -37) / 2, w: 5.5, h: 0.04, d: -37 - -70, ...ASPH },
  { kind: 'box', x: 38, y: 0, z: (-31 + 8) / 2, w: 5.5, h: 0.04, d: 8 - -31, ...ASPH },
  { kind: 'box', x: 38, y: 0, z: (16 + 70) / 2, w: 5.5, h: 0.04, d: 70 - 16, ...ASPH },
);

// sidewalks along the main avenue (top 0.06), segmented at the two crossings
const SIDE = { mat: 'tile', tile: 2, collide: false };
for (const [x0, x1] of [[-92, -17.9], [-10.1, 34.9], [41.1, 92]]) {
  add(
    { kind: 'box', x: (x0 + x1) / 2, y: 0, z: 5.4, w: x1 - x0, h: 0.06, d: 2.6, ...SIDE },
    { kind: 'box', x: (x0 + x1) / 2, y: 0, z: 18.6, w: x1 - x0, h: 0.06, d: 2.6, ...SIDE },
  );
}

// dusty sand lots fill the blocks between streets (top 0.02, under everything)
const SAND = { mat: 'sand', tile: 3, collide: false };
add(
  // NW block (west of north avenue, north of back alley)
  { kind: 'box', x: (-92 + -17.5) / 2, y: 0, z: (-74 + -37) / 2, w: -17.5 - -92, h: 0.02, d: -37 - -74, ...SAND },
  // N centre block (between north avenue and east lane)
  { kind: 'box', x: (-10.5 + 35.25) / 2, y: 0, z: (-74 + -37) / 2, w: 35.25 - -10.5, h: 0.02, d: -37 - -74, ...SAND },
  // NE block (east of east lane)
  { kind: 'box', x: (40.75 + 92) / 2, y: 0, z: (-70 + -37) / 2, w: 92 - 40.75, h: 0.02, d: -37 - -70, ...SAND },
  // W mid block (west of north avenue, between alley and avenue)
  { kind: 'box', x: (-92 + -17.5) / 2, y: 0, z: (-31 + 4) / 2, w: -17.5 - -92, h: 0.02, d: 4 - -31, ...SAND },
  // centre mid block
  { kind: 'box', x: (-10.5 + 35.25) / 2, y: 0, z: (-31 + 4) / 2, w: 35.25 - -10.5, h: 0.02, d: 4 - -31, ...SAND },
  // E mid block
  { kind: 'box', x: (40.75 + 92) / 2, y: 0, z: (-31 + 4) / 2, w: 92 - 40.75, h: 0.02, d: 4 - -31, ...SAND },
  // SW block
  { kind: 'box', x: (-92 + -17.5) / 2, y: 0, z: (20 + 74) / 2, w: -17.5 - -92, h: 0.02, d: 74 - 20, ...SAND },
  // S centre block
  { kind: 'box', x: (-10.5 + 35.25) / 2, y: 0, z: (20 + 74) / 2, w: 35.25 - -10.5, h: 0.02, d: 74 - 20, ...SAND },
  // SE block
  { kind: 'box', x: (40.75 + 92) / 2, y: 0, z: (20 + 74) / 2, w: 92 - 40.75, h: 0.02, d: 74 - 20, ...SAND },
);
// market row pavement strip south of the avenue (top 0.06, meets sidewalks),
// segmented at both north-south streets so it never overlaps their asphalt
add(
  { kind: 'box', x: -29.95, y: 0, z: 24.6, w: 24.1, h: 0.06, d: 9.4, mat: 'tile', tile: 2, collide: false },
  { kind: 'box', x: 12.4, y: 0, z: 24.6, w: 45, h: 0.06, d: 9.4, mat: 'tile', tile: 2, collide: false },
);

/* ------------------------------------------------- craters + scorch */
// scorch discs sit 0.015 above their ground paint; sand rim chunks all get
// different heights so no two touching chunks share a top
function crater(cx, cz, ground, r, tintRing) {
  add(
    { kind: 'box', x: cx, y: ground, z: cz, w: r * 2, h: 0.015, d: r * 1.4, mat: 'asphalt', tile: 1.5, tint: CHAR, collide: false },
    { kind: 'box', x: cx + r * 0.2, y: ground + 0.015, z: cz + r * 0.15, w: r * 1.2, h: 0.015, d: r * 1.7, mat: 'asphalt', tile: 1.5, tint: CHAR, collide: false },
  );
  const rims = [[-r - 0.5, 0.4, 0.16], [r + 0.45, 0.3, 0.22], [0.2, -r - 0.45, 0.19], [-0.3, r + 0.5, 0.13]];
  for (const [ox, oz, h] of rims) {
    add({ kind: 'box', x: cx + ox, y: 0, z: cz + oz, w: 1.6, h, d: 1.3, mat: 'sand', tile: 1.5, tint: tintRing });
  }
}
crater(-58, 11.6, 0.04, 3.2, DTAN);
crater(27, 13.5, 0.04, 2.6, TAN);
crater(-14.5, -22, 0.04, 3.6, DTAN);      // tank kill zone
crater(38.2, -18, 0.04, 2.4, TAN);
crater(-46, -46, 0.02, 3.0, DTAN);        // rowhouse block
crater(70, 40, 0.02, 2.8, TAN);           // workshop block

/* --------------------------- centre: THE SPLIT FLATS (x -2, z -12) */
// Intact west wing: four storeys of plaster, roof accessible by an outer
// stair that ends 0.05 under the roof lip.
add({ kind: 'room', x: -9, y: 0, z: -12, w: 12, d: 12, h: 6, thick: 0.6, mat: 'concrete',
  tile: 2, tint: PLAS, n: 'window', s: 'door', e: 'window', w_: 'door',
  doorW: 2.6, doorH: 2.8, sillH: 1.0, winH: 1.4, roof: false, roofMat: 'concreteDark' });
// outer stair on the west wall climbs clear of the handmade roof plates; the
// plates leave a notch over the stair head so the last step (5.85) can top
// out straight onto the roof (6.4)
add(
  { kind: 'stairs', x: -13.6, y: 0, z: -6.8, steps: 13, rise: 0.45, run: 0.55, width: 2.2, mat: 'concrete', axis: 'z', dir: -1, tint: GREY },
  { kind: 'slab', x: -7.65, y: 6.0, z: -12, w: 9.3, h: 0.4, d: 12, mat: 'concreteDark', tile: 2, walkway: true },
  { kind: 'slab', x: -13.65, y: 6.0, z: -16.1, w: 2.7, h: 0.4, d: 3.8, mat: 'concreteDark', tile: 2, walkway: true },
);
// landing slab is held by the wing's west wall (buried 0.2 into it)
// Collapsed east wing: three snapped wall stubs + a rubble ramp up to a
// snapped floor slab (held by the middle stub wall).
add(
  { kind: 'wall', x: 4, y: 0, z: -16.4, len: 9, h: 2.2, thick: 0.6, mat: 'concrete', axis: 'x', tile: 2, },
  { kind: 'wall', x: 9.2, y: 0, z: -12, len: 8.4, h: 3.8, thick: 0.6, mat: 'brick', axis: 'z', tile: 2 },
  { kind: 'wall', x: 3.4, y: 0, z: -7.2, len: 6, h: 1.4, thick: 0.6, mat: 'concrete', axis: 'x', tile: 2 },
);
add({ kind: 'ramp', x: 12.5, y: 0, z: -11, len: 9, h: 2.8, width: 10, mat: 'concrete', axis: 'x', dir: -1, tint: GREY });
add({ kind: 'slab', x: 6.2, y: 2.85, z: -11, w: 5.6, h: 0.35, d: 8, mat: 'concrete', tile: 2, tint: GREY, walkway: true });
// snapped slab edge rebar + jagged broken edge chunks
add(
  { kind: 'box', x: 3.2, y: 3.2, z: -13.8, w: 0.12, h: 0.7, d: 0.12, mat: 'metalDark', collide: false },
  { kind: 'box', x: 3.2, y: 3.2, z: -10.4, w: 0.12, h: 0.5, d: 0.12, mat: 'metalDark', collide: false },
  { kind: 'box', x: 3.2, y: 3.2, z: -7.6, w: 0.12, h: 0.62, d: 0.12, mat: 'metalDark', collide: false },
);
// rubble chunks spilling off the collapsed wing (tops staggered)
add(
  { kind: 'box', x: 8, y: 0, z: -5.2, w: 1.8, h: 0.5, d: 1.4, mat: 'concrete', tile: 1.5, tint: GREY },
  { kind: 'box', x: 10.4, y: 0, z: -5.3, w: 1.3, h: 0.6, d: 1.1, mat: 'brick', tile: 1.5, tint: BRICKT },
  { kind: 'box', x: 6.2, y: 0, z: -3.9, w: 1.5, h: 0.38, d: 1.2, mat: 'concrete', tile: 1.5, tint: PLAS },
  { kind: 'box', x: 14.8, y: 0, z: -14.8, w: 2.0, h: 0.9, d: 1.6, mat: 'concrete', tile: 1.5, tint: DGREY },
  { kind: 'box', x: 13.2, y: 0, z: -4.3, w: 1.1, h: 0.26, d: 0.9, mat: 'sand', tile: 1.5, tint: TAN },
);
// wing interior: abandoned furniture + ceiling light
add(
  { kind: 'box', x: -11.5, y: 0, z: -14.5, w: 2.0, h: 0.9, d: 0.9, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -7.5, y: 0, z: -9.8, w: 0.9, h: 1.8, d: 0.5, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -11, y: 0, z: -9, w: 1.4, h: 0.45, d: 0.8, mat: 'concrete', tile: 1, tint: REDT },
);
add({ kind: 'ceilingLight', x: -9, y: 5.8, z: -12, w: 2.4, d: 1.0, range: 12, power: 9 });

/* -------------------------------- NE: MOSQUE CORNER (x 64, z -52) */
// prayer hall: brick shell, white dome stacked in shrinking tiers
add({ kind: 'room', x: 64, y: 0, z: -50, w: 14, d: 10, h: 4.5, thick: 0.6, mat: 'brick',
  tile: 2, tint: DTAN, n: 'door', s: 'wall', e: 'window', w_: 'window',
  doorW: 3.0, doorH: 3.2, sillH: 1.1, winH: 1.3, roof: true, roofMat: 'concrete' });
add(
  { kind: 'box', x: 64, y: 4.9, z: -50, w: 8.4, h: 1.2, d: 8.4, mat: 'concrete', tile: 2, tint: WHITE },
  { kind: 'box', x: 64, y: 6.1, z: -50, w: 5.8, h: 1.0, d: 5.8, mat: 'concrete', tile: 2, tint: WHITE },
  { kind: 'box', x: 64, y: 7.1, z: -50, w: 3.2, h: 0.8, d: 3.2, mat: 'concrete', tile: 1.5, tint: WHITE },
  { kind: 'box', x: 64, y: 7.9, z: -50, w: 1.3, h: 0.5, d: 1.3, mat: 'metalDark', collide: false },
);
// minaret: square shaft, plinth, ring balcony slab the shaft passes through,
// reached by an outer stair on the west side (balcony is a sniper perch)
add(
  { kind: 'box', x: 52, y: 0, z: -60, w: 4.4, h: 1.1, d: 4.4, mat: 'concrete', tile: 2, tint: TAN },
  { kind: 'box', x: 52, y: 0, z: -60, w: 3.0, h: 13.5, d: 3.0, mat: 'concrete', tile: 2, tint: WHITE },
  { kind: 'box', x: 52, y: 13.5, z: -60, w: 2.2, h: 1.4, d: 2.2, mat: 'concrete', tile: 1.5, tint: DTAN },
  { kind: 'box', x: 52, y: 14.9, z: -60, w: 1.2, h: 0.7, d: 1.2, mat: 'metalDark', collide: false },
  { kind: 'slab', x: 52, y: 6.0, z: -60, w: 5.4, h: 0.4, d: 5.4, mat: 'concrete', tile: 1.5, tint: TAN, walkway: true },
  // broken balcony rail: two corners only
  { kind: 'railing', x: 52, y: 6.4, z: -62.55, len: 5.2, h: 0.9, mat: 'metalDark', axis: 'x' },
  { kind: 'railing', x: 54.55, y: 6.4, z: -61.2, len: 2.6, h: 0.9, mat: 'metalDark', axis: 'z' },
  { kind: 'stairs', x: 48.6, y: 0, z: -55.4, steps: 13, rise: 0.45, run: 0.55, width: 2.2, mat: 'concrete', axis: 'z', dir: -1, tint: GREY },
);
add({ kind: 'ceilingLight', x: 64, y: 4.05, z: -50, w: 2.6, d: 1.0, range: 12, power: 9 });
// ablution fountain + courtyard wall stubs
add(
  { kind: 'box', x: 60, y: 0, z: -41.5, w: 2.6, h: 0.75, d: 2.6, mat: 'concrete', tile: 1.5, tint: BLUE },
  { kind: 'box', x: 60, y: 0.75, z: -41.5, w: 1.8, h: 0.22, d: 1.8, mat: 'concrete', tile: 1, tint: WHITE },
  { kind: 'wall', x: 73, y: 0, z: -41, len: 7, h: 1.8, thick: 0.5, mat: 'brick', axis: 'x', tile: 2 },
  { kind: 'wall', x: 77, y: 0, z: -46.5, len: 5, h: 1.1, thick: 0.5, mat: 'brick', axis: 'z', tile: 2 },
);

/* -------------------------------- main street: MARKET ROW (z 24.6) */
// eight stalls: wood frame, plank counter, tattered striped cloth (dressing)
const STALL_TINTS = [REDT, BLUE, OLIVE, YEL, RUST, DTAN, GREY, BRICKT];
for (let i = 0; i < 8; i++) {
  const sx = -38 + i * 10, tint = STALL_TINTS[i];
  add(
    { kind: 'box', x: sx - 1.3, y: 0, z: 23.2, w: 0.25, h: 2.3, d: 0.25, mat: 'wood', tile: 1 },
    { kind: 'box', x: sx + 1.3, y: 0, z: 23.2, w: 0.25, h: 2.3, d: 0.25, mat: 'wood', tile: 1 },
    { kind: 'box', x: sx - 1.3, y: 0, z: 25.8, w: 0.25, h: 2.3, d: 0.25, mat: 'wood', tile: 1 },
    { kind: 'box', x: sx + 1.3, y: 0, z: 25.8, w: 0.25, h: 2.3, d: 0.25, mat: 'wood', tile: 1 },
    { kind: 'box', x: sx, y: 0, z: 24.4, w: 2.8, h: 0.9, d: 1.2, mat: 'wood', tile: 1.5 },
    // cloth is SOLID: you can duck under it but never clip through it
    { kind: 'box', x: sx - 0.72, y: 2.3, z: 24.5, w: 1.44, h: 0.14, d: 3.0, mat: 'tile', tile: 1, tint },
    { kind: 'box', x: sx + 0.72, y: 2.3, z: 24.5, w: 1.44, h: 0.14, d: 3.0, mat: 'tile', tile: 1, tint: WHITE },
  );
  // goods: crates, sacks, a scatter of bright produce boxes
  add(
    { kind: 'box', x: sx - 0.7, y: 0.9, z: 24.3, w: 0.6, h: 0.35, d: 0.6, mat: 'crate', tile: 1 },
    { kind: 'box', x: sx + 0.6, y: 0.9, z: 24.6, w: 0.5, h: 0.28, d: 0.5, mat: 'concrete', tile: 1, tint: i % 2 ? YEL : REDT, collide: false },
    { kind: 'box', x: sx + 1.9, y: 0, z: 25.2, w: 0.8, h: 0.55, d: 0.8, mat: 'sand', tile: 1, tint: DTAN },
  );
}
// pushcart + scales + a burnt stall at the east end
add(
  { kind: 'box', x: 45, y: 0.35, z: 24.8, w: 1.6, h: 0.5, d: 1.0, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: 44.3, y: 0, z: 25.4, w: 0.3, h: 0.35, d: 0.3, mat: 'metalDark' },
  { kind: 'box', x: 45.7, y: 0, z: 25.4, w: 0.3, h: 0.35, d: 0.3, mat: 'metalDark' },
  { kind: 'box', x: -46.5, y: 0, z: 24.5, w: 2.6, h: 0.85, d: 1.3, mat: 'wood', tile: 1.5, tint: CHAR },
  { kind: 'box', x: -46.5, y: 0.85, z: 24.5, w: 2.2, h: 0.3, d: 1.0, mat: 'concreteDark', tile: 1, tint: CHAR },
);

/* ------------------------- THE CHECKPOINT (x -14, z 12 crossing) */
// sandbag arcs guarding the crossing from NW and SE
add(
  { kind: 'sandbag', x: -20.5, y: 0, z: 5.6, len: 6.5, h: 1.05, axis: 'x' },
  { kind: 'sandbag', x: -23.4, y: 0, z: 8.6, len: 4.4, h: 0.85, axis: 'z' },
  { kind: 'sandbag', x: -7.6, y: 0, z: 18.4, len: 6.5, h: 1.05, axis: 'x' },
  { kind: 'sandbag', x: -4.9, y: 0, z: 15.2, len: 4.2, h: 0.9, axis: 'z' },
  { kind: 'sandbag', x: -18, y: 0, z: 19.6, len: 3.6, h: 0.75, axis: 'x' },
);
// hessian barriers staggered across both streets
add(
  { kind: 'box', x: -15.8, y: 0, z: 4.2, w: 2.1, h: 1.25, d: 0.5, mat: 'concrete', tile: 1.5, tint: TAN },
  { kind: 'box', x: -11.4, y: 0, z: 0.5, w: 2.1, h: 1.25, d: 0.5, mat: 'concrete', tile: 1.5, tint: TAN },
  { kind: 'box', x: -24, y: 0, z: 13.4, w: 0.5, h: 1.25, d: 2.1, mat: 'concrete', tile: 1.5, tint: TAN },
  { kind: 'box', x: -3.6, y: 0, z: 10.2, w: 0.5, h: 1.25, d: 2.1, mat: 'concrete', tile: 1.5, tint: TAN },
  { kind: 'box', x: -12.2, y: 0, z: 23, w: 2.1, h: 1.25, d: 0.5, mat: 'concrete', tile: 1.5, tint: TAN },
);
// burnt cars: body + cabin + wheels, charred
for (const [vx, vz, flip] of [[-21.5, 13.8, 0], [-7.4, 8.4, 1]]) {
  add(
    { kind: 'box', x: vx, y: 0.25, z: vz, w: 3.7, h: 0.75, d: 1.75, mat: 'metal', tile: 1.5, tint: CHAR },
    { kind: 'box', x: vx + (flip ? -0.3 : 0.3), y: 1.0, z: vz, w: 1.9, h: 0.5, d: 1.6, mat: 'metal', tile: 1, tint: DGREY },
    { kind: 'box', x: vx - 1.25, y: 0, z: vz - 0.75, w: 0.55, h: 0.5, d: 0.3, mat: 'metalDark' },
    { kind: 'box', x: vx + 1.25, y: 0, z: vz - 0.75, w: 0.55, h: 0.5, d: 0.3, mat: 'metalDark' },
    { kind: 'box', x: vx - 1.25, y: 0, z: vz + 0.75, w: 0.55, h: 0.5, d: 0.3, mat: 'metalDark' },
    { kind: 'box', x: vx + 1.25, y: 0, z: vz + 0.75, w: 0.55, h: 0.5, d: 0.3, mat: 'metalDark' },
  );
}
// tyre piles
for (const [tx, tz, n] of [[-25.8, 5.8, 3], [-5.2, 20.6, 4]]) {
  for (let i = 0; i < n; i++) {
    add({ kind: 'box', x: tx, y: i * 0.24, z: tz, w: 0.72, h: 0.24, d: 0.72, mat: 'metalDark', tile: 1 });
  }
}
// guard tower NW of the crossing: legs, deck, stair, sandbag parapet
add(
  { kind: 'box', x: -27.6, y: 0, z: 1.2, w: 0.4, h: 3.55, d: 0.4, mat: 'wood', tile: 1 },
  { kind: 'box', x: -23.2, y: 0, z: 1.2, w: 0.4, h: 3.55, d: 0.4, mat: 'wood', tile: 1 },
  { kind: 'box', x: -27.6, y: 0, z: 5.6, w: 0.4, h: 3.55, d: 0.4, mat: 'wood', tile: 1 },
  { kind: 'box', x: -23.2, y: 0, z: 5.6, w: 0.4, h: 3.55, d: 0.4, mat: 'wood', tile: 1 },
  { kind: 'slab', x: -25.4, y: 3.55, z: 3.4, w: 5.2, h: 0.3, d: 5.2, mat: 'wood', tile: 1.5, walkway: true },
  { kind: 'stairs', x: -25.4, y: 0, z: 10.4, steps: 8, rise: 0.43, run: 0.55, width: 1.6, mat: 'metalDark', axis: 'z', dir: -1 },
  // parapet only on the three sides the stair does NOT use (stair comes up
  // from the south edge, which stays open)
  { kind: 'sandbag', x: -25.4, y: 3.85, z: 1.3, len: 4.6, h: 0.55, axis: 'x' },
  { kind: 'sandbag', x: -27.5, y: 3.85, z: 3.4, len: 4.4, h: 0.55, axis: 'z' },
  { kind: 'sandbag', x: -23.15, y: 3.85, z: 3.6, len: 3.6, h: 0.55, axis: 'z' },
  // tin roof on two taller rear legs
  { kind: 'box', x: -27.6, y: 3.55, z: 1.4, w: 0.3, h: 2.3, d: 0.3, mat: 'wood', tile: 1 },
  { kind: 'box', x: -23.2, y: 3.55, z: 1.4, w: 0.3, h: 2.3, d: 0.3, mat: 'wood', tile: 1 },
  { kind: 'box', x: -25.4, y: 5.85, z: 3.2, w: 5.6, h: 0.18, d: 5.8, mat: 'roof', tile: 1.5, collide: false },
);

/* ------------------------------- W main: BUS WRECK (x -56, z 12) */
add(
  { kind: 'box', x: -56, y: 0.4, z: 12, w: 10.4, h: 1.5, d: 2.6, mat: 'metal', tile: 2, tint: RUST },
  { kind: 'box', x: -56, y: 1.9, z: 12, w: 10.4, h: 1.0, d: 2.6, mat: 'metal', tile: 2, tint: CHAR },
  // window band: dark glass strip sunk 5 cm into the hull sides
  { kind: 'box', x: -56, y: 1.35, z: 10.65, w: 9.6, h: 0.65, d: 0.2, mat: 'glass', tile: 1.5, collide: false },
  { kind: 'box', x: -56, y: 1.35, z: 13.35, w: 9.6, h: 0.65, d: 0.2, mat: 'glass', tile: 1.5, collide: false },
  // wheels + a fallen destination sign
  { kind: 'box', x: -59.4, y: 0, z: 10.8, w: 0.9, h: 0.8, d: 0.4, mat: 'metalDark' },
  { kind: 'box', x: -52.6, y: 0, z: 10.8, w: 0.9, h: 0.8, d: 0.4, mat: 'metalDark' },
  { kind: 'box', x: -59.4, y: 0, z: 13.2, w: 0.9, h: 0.8, d: 0.4, mat: 'metalDark' },
  { kind: 'box', x: -52.6, y: 0, z: 13.2, w: 0.9, h: 0.8, d: 0.4, mat: 'metalDark' },
  { kind: 'box', x: -50.2, y: 0, z: 14.6, w: 1.8, h: 1.1, d: 0.15, mat: 'metal', tile: 1, tint: YEL },
);

/* ------------------------------- NW: ROWHOUSE RUINS (x -70..-40) */
// five bombed homes, no two alike; interiors reachable, one half-stair
// House A: roofless shell, north face gone
add({ kind: 'room', x: -64, y: 0, z: -42, w: 9, d: 8, h: 3.2, thick: 0.5, mat: 'concrete',
  tile: 2, tint: PLAS, n: 'open', s: 'wall', e: 'window', w_: 'door',
  doorW: 2.2, doorH: 2.4, sillH: 0.9, winH: 1.2, roof: false });
add(
  { kind: 'wall', x: -64, y: 0, z: -40.2, len: 4.4, h: 1.6, thick: 0.4, mat: 'brick', axis: 'x', tile: 1.5 },
  { kind: 'box', x: -66.5, y: 0, z: -43.5, w: 1.5, h: 0.55, d: 1.1, mat: 'concrete', tile: 1, tint: GREY },
  { kind: 'box', x: -61.8, y: 0, z: -40.6, w: 1.1, h: 0.8, d: 0.9, mat: 'brick', tile: 1, tint: BRICKT },
  { kind: 'box', x: -63, y: 0, z: -44.8, w: 1.8, h: 0.32, d: 1.3, mat: 'sand', tile: 1.5, tint: TAN },
);
// House B: half-collapsed stair to a snapped landing (sniper nook)
add({ kind: 'room', x: -50, y: 0, z: -56, w: 8, d: 7, h: 2.6, thick: 0.5, mat: 'brick',
  tile: 2, tint: BRICKT, n: 'wall', s: 'open', e: 'door', w_: 'wall',
  doorW: 2.0, doorH: 2.2, roof: false });
add(
  { kind: 'stairs', x: -52.4, y: 0, z: -53.4, steps: 5, rise: 0.44, run: 0.5, width: 1.5, mat: 'concrete', axis: 'z', dir: -1, tint: GREY },
  { kind: 'slab', x: -52.4, y: 2.35, z: -57.4, w: 3.2, h: 0.3, d: 2.6, mat: 'concrete', tile: 1.5, tint: GREY, walkway: true },
  { kind: 'box', x: -50.6, y: 0, z: -57.4, w: 0.5, h: 2.3, d: 0.5, mat: 'brick', tile: 1 },
  { kind: 'box', x: -48.4, y: 0, z: -54.2, w: 1.2, h: 0.62, d: 1.0, mat: 'concrete', tile: 1, tint: GREY },
);
// House C: only an L of broken walls left
add(
  { kind: 'wall', x: -73, y: 0, z: -16, len: 8, h: 2.8, thick: 0.5, mat: 'concrete', axis: 'x', tile: 2 },
  { kind: 'wall', x: -77, y: 0, z: -11.5, len: 6.5, h: 1.9, thick: 0.5, mat: 'concrete', axis: 'z', tile: 2 },
  { kind: 'box', x: -72.2, y: 0, z: -13.4, w: 1.7, h: 0.48, d: 1.3, mat: 'concrete', tile: 1, tint: PLAS },
  { kind: 'box', x: -69.8, y: 0, z: -15.2, w: 1.2, h: 0.7, d: 1.0, mat: 'brick', tile: 1, tint: BRICKT },
  { kind: 'box', x: -74.8, y: 0, z: -12.2, w: 1.4, h: 0.3, d: 1.1, mat: 'sand', tile: 1.5, tint: DTAN },
);
// House D: small two-room shell with a burnt interior
add({ kind: 'room', x: -46, y: 0, z: -8, w: 7, d: 6, h: 3.0, thick: 0.5, mat: 'concrete',
  tile: 2, tint: DTAN, n: 'door', s: 'wall', e: 'open', w_: 'wall',
  doorW: 2.0, doorH: 2.4, roof: false });
add(
  { kind: 'box', x: -47.6, y: 0, z: -8.6, w: 1.6, h: 0.85, d: 0.8, mat: 'wood', tile: 1, tint: CHAR },
  { kind: 'box', x: -44.4, y: 0, z: -6.6, w: 0.9, h: 0.5, d: 0.7, mat: 'wood', tile: 1, tint: CHAR },
  { kind: 'box', x: -48.9, y: 0, z: -5.9, w: 1.0, h: 0.42, d: 0.8, mat: 'concrete', tile: 1, tint: GREY },
);
// House E: gable stub against the west perimeter
add(
  { kind: 'wall', x: -84, y: 0, z: -52, len: 7, h: 3.6, thick: 0.5, mat: 'brick', axis: 'z', tile: 2 },
  { kind: 'wall', x: -80.4, y: 0, z: -55.2, len: 6.8, h: 2.2, thick: 0.5, mat: 'brick', axis: 'x', tile: 2 },
  { kind: 'wall', x: -80.4, y: 0, z: -49.4, len: 6.8, h: 1.5, thick: 0.5, mat: 'brick', axis: 'x', tile: 2 },
  { kind: 'box', x: -81.6, y: 0, z: -52.4, w: 2.2, h: 0.85, d: 1.7, mat: 'brick', tile: 1.5, tint: BRICKT },
  { kind: 'box', x: -78.6, y: 0, z: -51, w: 1.5, h: 0.4, d: 1.2, mat: 'concrete', tile: 1, tint: GREY },
);

/* --------------------------- E: WORKSHOP + WATER TOWER (x 56, z 32) */
add({ kind: 'room', x: 56, y: 0, z: 32, w: 16, d: 12, h: 5, thick: 0.6, mat: 'concrete',
  tile: 2.5, tint: GREY, n: 'open', s: 'window', e: 'door', w_: 'wall',
  doorW: 2.6, doorH: 3.0, sillH: 1.2, winH: 1.4, roof: false });
// mezzanine landing inside, stair from the floor
add(
  { kind: 'slab', x: 52.2, y: 2.85, z: 35.6, w: 7.2, h: 0.35, d: 4.4, mat: 'concreteDark', tile: 2, walkway: true },
  { kind: 'stairs', x: 52.2, y: 0, z: 31.9, steps: 6, rise: 0.463, run: 0.55, width: 2.4, mat: 'metalDark', axis: 'z', dir: 1 },
  { kind: 'box', x: 48.9, y: 0, z: 35.6, w: 0.45, h: 2.85, d: 0.45, mat: 'metalDark' },
);
// snapped roof plate jutting from the east wall top; its east edge stops
// flush with the outer stair's west face so the climb keeps full headroom,
// and the stair top (4.55) steps 0.4 up onto the plate (4.95)
add(
  { kind: 'slab', x: 61.8, y: 4.6, z: 28.6, w: 7.6, h: 0.35, d: 6.2, mat: 'concrete', tile: 2, tint: DGREY, walkway: true },
  { kind: 'stairs', x: 66.6, y: 0, z: 25.4, steps: 10, rise: 0.455, run: 0.55, width: 2.0, mat: 'concrete', axis: 'z', dir: 1, tint: GREY },
  { kind: 'box', x: 59.1, y: 0, z: 26.2, w: 0.4, h: 4.6, d: 0.4, mat: 'concrete', tile: 1, tint: GREY },
);
// machine husks inside
add(
  { kind: 'box', x: 61, y: 0, z: 35, w: 2.6, h: 1.6, d: 1.4, mat: 'metal', tile: 1.5, tint: OLIVE },
  { kind: 'box', x: 61, y: 1.6, z: 35, w: 1.8, h: 0.5, d: 1.0, mat: 'metalDark', tile: 1 },
  { kind: 'box', x: 58.4, y: 0, z: 28.4, w: 1.8, h: 1.1, d: 1.2, mat: 'metal', tile: 1.5, tint: RUST },
  { kind: 'barrel', x: 62.6, y: 0, z: 29.6 },
  { kind: 'barrel', x: 63.5, y: 0, z: 30.4, tint: 0x3f6f4a },
);
add({ kind: 'ceilingLight', x: 56, y: 4.5, z: 32, w: 3.0, d: 1.2, range: 14, power: 10 });
// water tower: four legs, cross braces, blue tank (decorative top)
add(
  { kind: 'box', x: 42.2, y: 0, z: 46.2, w: 0.35, h: 6.8, d: 0.35, mat: 'metalDark' },
  { kind: 'box', x: 47.8, y: 0, z: 46.2, w: 0.35, h: 6.8, d: 0.35, mat: 'metalDark' },
  { kind: 'box', x: 42.2, y: 0, z: 51.8, w: 0.35, h: 6.8, d: 0.35, mat: 'metalDark' },
  { kind: 'box', x: 47.8, y: 0, z: 51.8, w: 0.35, h: 6.8, d: 0.35, mat: 'metalDark' },
  { kind: 'box', x: 45, y: 3.3, z: 46.2, w: 5.6, h: 0.25, d: 0.3, mat: 'metalDark', collide: false },
  { kind: 'box', x: 45, y: 3.3, z: 51.8, w: 5.6, h: 0.25, d: 0.3, mat: 'metalDark', collide: false },
  { kind: 'box', x: 45, y: 6.8, z: 49, w: 4.6, h: 3.0, d: 4.6, mat: 'metal', tile: 2, tint: BLUE },
  { kind: 'box', x: 45, y: 9.8, z: 49, w: 3.6, h: 0.5, d: 3.6, mat: 'metalDark', tile: 1.5 },
  { kind: 'box', x: 45, y: 8.1, z: 49, w: 4.7, h: 0.35, d: 4.7, mat: 'metal', tile: 1.5, tint: RUST, collide: false },
);

/* ------------------------------- S: THE MINISTRY (x -8, z 56) */
// two standing wings with a collapsed, climbable middle
add({ kind: 'room', x: -26, y: 0, z: 58, w: 10, d: 10, h: 6.5, thick: 0.6, mat: 'concrete',
  tile: 2, tint: WHITE, n: 'window', s: 'window', e: 'wall', w_: 'door',
  doorW: 2.4, doorH: 2.8, sillH: 1.0, winH: 1.4, roof: true, roofMat: 'concreteDark' });
add({ kind: 'room', x: 10, y: 0, z: 58, w: 10, d: 10, h: 6.5, thick: 0.6, mat: 'concrete',
  tile: 2, tint: WHITE, n: 'window', s: 'window', e: 'door', w_: 'wall',
  doorW: 2.4, doorH: 2.8, sillH: 1.0, winH: 1.4, roof: true, roofMat: 'concreteDark' });
// collapsed middle: flank wall stubs + rubble ramp to a snapped slab bridge
add(
  { kind: 'wall', x: -18.4, y: 0, z: 60.4, len: 5.4, h: 3.4, thick: 0.6, mat: 'concrete', axis: 'x', tile: 2 },
  { kind: 'wall', x: 2.4, y: 0, z: 60.4, len: 5.4, h: 2.6, thick: 0.6, mat: 'concrete', axis: 'x', tile: 2 },
  { kind: 'wall', x: -16.2, y: 0, z: 51.8, len: 4.8, h: 4.2, thick: 0.6, mat: 'concrete', axis: 'x', tile: 2 },
  // the rubble ramp ends flush against the slab face, 5 cm below its
  // underside, reading as debris piled against the break - never cut by it
  { kind: 'ramp', x: -8, y: 0, z: 43.4, len: 9, h: 2.05, width: 8.4, mat: 'concrete', axis: 'z', dir: 1, tint: GREY },
  { kind: 'slab', x: -8, y: 2.1, z: 56.2, w: 8.4, h: 0.35, d: 7.6, mat: 'concrete', tile: 2, tint: GREY, walkway: true },
  { kind: 'box', x: -12.4, y: 0, z: 56.2, w: 0.5, h: 2.1, d: 0.5, mat: 'concrete', tile: 1, tint: GREY },
  { kind: 'box', x: -3.6, y: 0, z: 56.2, w: 0.5, h: 2.1, d: 0.5, mat: 'concrete', tile: 1, tint: GREY },
);
add(
  { kind: 'ceilingLight', x: -26, y: 6.0, z: 58, w: 2.4, d: 1.0, range: 11, power: 8 },
  { kind: 'ceilingLight', x: 10, y: 6.0, z: 58, w: 2.4, d: 1.0, range: 11, power: 8 },
);

/* ------------------------------- N centre: BURNT TANK (x -14, z -25) */
add(
  { kind: 'box', x: -14.6, y: 0, z: -25, w: 0.7, h: 0.85, d: 7.4, mat: 'metal', tile: 1.5, tint: CHAR },
  { kind: 'box', x: -13.4, y: 0, z: -25, w: 0.7, h: 0.85, d: 7.4, mat: 'metal', tile: 1.5, tint: CHAR },
  { kind: 'box', x: -14, y: 0.55, z: -25, w: 4.0, h: 0.95, d: 6.8, mat: 'metal', tile: 2, tint: OLIVE },
  { kind: 'box', x: -14, y: 1.5, z: -24.6, w: 2.5, h: 0.8, d: 3.0, mat: 'metal', tile: 1.5, tint: OLIVE },
  { kind: 'box', x: -14, y: 2.3, z: -24.6, w: 2.0, h: 0.25, d: 2.4, mat: 'metal', tile: 1, tint: CHAR, collide: false },
  // cannon barrel reaching north, tip drooping onto a rubble chunk
  { kind: 'box', x: -14, y: 1.85, z: -28.6, w: 0.28, h: 0.28, d: 5.4, mat: 'metalDark' },
  { kind: 'box', x: -14, y: 0, z: -31.9, w: 1.1, h: 1.9, d: 1.1, mat: 'concrete', tile: 1, tint: GREY },
);
// thrown tread links + scorch
add(
  { kind: 'box', x: -17.9, y: 0, z: -27.4, w: 1.3, h: 0.3, d: 0.8, mat: 'metalDark', tile: 1 },
  { kind: 'box', x: -10.8, y: 0, z: -22.2, w: 1.1, h: 0.34, d: 0.7, mat: 'metalDark', tile: 1 },
);

/* ------------------------- centre-east: THE ARCADE (x 26, z -17) */
// the map's big central ruin: a two-storey shopping hall whose roof is
// handmade plates (the SE corner has collapsed away, leaving a sky hole),
// plus a collapsed entrance canopy and a dry fountain out front
add({ kind: 'room', x: 26, y: 0, z: -17.5, w: 11, d: 9, h: 5.5, thick: 0.6, mat: 'concrete',
  tile: 2, tint: PLAS, n: 'window', s: 'door', e: 'window', w_: 'wall',
  doorW: 2.6, doorH: 2.8, sillH: 1.1, winH: 1.4, roof: false });
// roof plates: west half + NE corner; the notch over the SE corner is where
// the outer stair tops out (stair head 5.85, plates 5.9 -> 0.05 lip)
add(
  { kind: 'slab', x: 23.5, y: 5.5, z: -17.5, w: 6.2, h: 0.4, d: 10.2, mat: 'concreteDark', tile: 2, walkway: true },
  { kind: 'slab', x: 29.9, y: 5.5, z: -19.9, w: 5.4, h: 0.4, d: 5.8, mat: 'concreteDark', tile: 2, walkway: true },
  { kind: 'stairs', x: 32.5, y: 0, z: -9.4, steps: 13, rise: 0.45, run: 0.55, width: 2.0, mat: 'concrete', axis: 'z', dir: -1, tint: GREY },
);
// collapsed entrance canopy south of the hall: rubble ramp ends flush
// against the slab face, 5 cm below its underside (same pattern as the
// ministry bridge); stub wall + column hold the slab edges
add(
  { kind: 'slab', x: 26, y: 2.5, z: -10.4, w: 8, h: 0.35, d: 3.6, mat: 'concrete', tile: 2, tint: GREY, walkway: true },
  { kind: 'ramp', x: 26.5, y: 0, z: -1.6, len: 7, h: 2.45, width: 5, mat: 'concrete', axis: 'z', dir: -1, tint: GREY },
  { kind: 'wall', x: 22.5, y: 0, z: -12.4, len: 4, h: 2.5, thick: 0.6, mat: 'brick', axis: 'x', tile: 2 },
  { kind: 'box', x: 29.4, y: 0, z: -10.6, w: 0.5, h: 2.5, d: 0.5, mat: 'concrete', tile: 1, tint: GREY },
);
// dry fountain between the hall and the back alley
add(
  { kind: 'wall', x: 26, y: 0, z: -24.9, len: 4.4, h: 0.7, thick: 0.35, mat: 'concrete', axis: 'x', tile: 1.5, tint: WHITE },
  { kind: 'wall', x: 26, y: 0, z: -29.7, len: 4.4, h: 0.45, thick: 0.35, mat: 'concrete', axis: 'x', tile: 1.5, tint: WHITE }, // collapsed south rim: low enough to vault into the basin
  { kind: 'wall', x: 23.9, y: 0, z: -27.3, len: 4.4, h: 0.7, thick: 0.35, mat: 'concrete', axis: 'z', tile: 1.5, tint: WHITE },
  { kind: 'wall', x: 28.1, y: 0, z: -27.3, len: 4.4, h: 0.7, thick: 0.35, mat: 'concrete', axis: 'z', tile: 1.5, tint: WHITE },
  { kind: 'box', x: 26, y: 0, z: -27.3, w: 1.1, h: 1.5, d: 1.1, mat: 'concrete', tile: 1.5, tint: WHITE },
  { kind: 'box', x: 26, y: 1.5, z: -27.3, w: 1.5, h: 0.25, d: 1.5, mat: 'concrete', tile: 1, tint: PLAS },
);
// hall interior: abandoned shop fittings under the surviving roof half
add(
  { kind: 'box', x: 23, y: 0, z: -20.5, w: 3.0, h: 0.95, d: 0.8, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: 30.9, y: 0, z: -20.3, w: 0.6, h: 1.9, d: 2.4, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: 30.9, y: 0, z: -15.8, w: 0.6, h: 1.9, d: 2.4, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: 24.6, y: 0, z: -14.6, w: 2.2, h: 0.5, d: 0.9, mat: 'wood', tile: 1.5 },
);
add({ kind: 'ceilingLight', x: 24, y: 5.1, z: -18.5, w: 2.6, d: 1.0, range: 12, power: 9 });

/* ------------------------- south block infill (z 30..42, market canyon) */
// ruined café: roofless, a surviving plate covers the west half
add({ kind: 'room', x: -4, y: 0, z: 36, w: 9, d: 7, h: 3.2, thick: 0.6, mat: 'concrete',
  tile: 2, tint: PLAS, n: 'door', s: 'wall', e: 'window', w_: 'window',
  doorW: 2.4, doorH: 2.6, sillH: 1.0, winH: 1.2, roof: false });
add(
  { kind: 'slab', x: -6.2, y: 3.2, z: 36, w: 5.4, h: 0.35, d: 8.0, mat: 'concreteDark', tile: 2, walkway: true },
  { kind: 'box', x: -5.5, y: 0, z: 38, w: 2.6, h: 0.95, d: 0.8, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -2.2, y: 0, z: 34.6, w: 1.1, h: 0.75, d: 1.1, mat: 'wood', tile: 1 },
  { kind: 'box', x: -1.4, y: 0, z: 37.4, w: 1.0, h: 0.45, d: 1.0, mat: 'wood', tile: 1 },
);
// collapsed garage: open north face, burnt car hulk inside
add({ kind: 'room', x: 12, y: 0, z: 37, w: 8, d: 7, h: 3.4, thick: 0.6, mat: 'concrete',
  tile: 2, tint: GREY, n: 'open', s: 'wall', e: 'wall', w_: 'wall', roof: true });
add(
  { kind: 'box', x: 10.8, y: 0, z: 35.9, w: 0.5, h: 0.5, d: 0.3, mat: 'metalDark' },
  { kind: 'box', x: 13.2, y: 0, z: 35.9, w: 0.5, h: 0.5, d: 0.3, mat: 'metalDark' },
  { kind: 'box', x: 10.8, y: 0, z: 38.1, w: 0.5, h: 0.5, d: 0.3, mat: 'metalDark' },
  { kind: 'box', x: 13.2, y: 0, z: 38.1, w: 0.5, h: 0.5, d: 0.3, mat: 'metalDark' },
  { kind: 'box', x: 12, y: 0.4, z: 37, w: 3.6, h: 0.7, d: 1.7, mat: 'metal', tile: 1.5, tint: CHAR },
  { kind: 'box', x: 12, y: 1.1, z: 37.2, w: 1.9, h: 0.55, d: 1.5, mat: 'metal', tile: 1, tint: CHAR },
);
// shattered kiosk + a garden wall stub closing the lane to the avenue
add({ kind: 'room', x: -22, y: 0, z: 35, w: 3.6, d: 3.2, h: 2.6, thick: 0.5, mat: 'brick',
  tile: 1.5, tint: BRICKT, n: 'door', s: 'wall', e: 'wall', w_: 'wall',
  doorW: 1.6, doorH: 2.2, roof: true, roofMat: 'concreteDark' });
add({ kind: 'wall', x: 5, y: 0, z: 30.6, len: 5, h: 1.2, thick: 0.4, mat: 'brick', axis: 'x', tile: 1.5 });
add({ kind: 'wall', x: -26, y: 0, z: 30.8, len: 4.5, h: 1.5, thick: 0.4, mat: 'brick', axis: 'x', tile: 1.5 });
// west house ruin on the south block
add({ kind: 'room', x: -52, y: 0, z: 36, w: 10, d: 8, h: 4.2, thick: 0.6, mat: 'concrete',
  tile: 2, tint: PLAS, n: 'window', s: 'wall', e: 'door', w_: 'window',
  doorW: 2.4, doorH: 2.8, sillH: 1.1, winH: 1.3, roof: false });
add(
  { kind: 'box', x: -54.5, y: 0, z: 38, w: 1.8, h: 0.7, d: 1.4, mat: 'brick', tile: 1.5, tint: BRICKT },
  { kind: 'box', x: -50, y: 0, z: 34, w: 1.4, h: 0.5, d: 1.1, mat: 'concrete', tile: 1.5, tint: PLAS },
  { kind: 'box', x: -49.4, y: 0, z: 38.6, w: 1.1, h: 1.6, d: 0.5, mat: 'wood', tile: 1.5 },
);

/* ------------------------- north block infill (z -44..-58, alley yards) */
// bombed brick house east of the north avenue
add({ kind: 'room', x: 20, y: 0, z: -50, w: 11, d: 9, h: 4.6, thick: 0.6, mat: 'brick',
  tile: 2, tint: BRICKT, n: 'wall', s: 'door', e: 'window', w_: 'window',
  doorW: 2.6, doorH: 2.8, sillH: 1.1, winH: 1.4, roof: false });
add(
  { kind: 'box', x: 18, y: 0, z: -51.5, w: 2.0, h: 0.8, d: 1.6, mat: 'brick', tile: 1.5, tint: BRICKT },
  { kind: 'box', x: 22.4, y: 0, z: -48.6, w: 1.6, h: 0.55, d: 1.3, mat: 'concrete', tile: 1.5, tint: GREY },
  { kind: 'box', x: 21.5, y: 0, z: -52.6, w: 4.0, h: 0.24, d: 0.34, mat: 'wood', tile: 1 },
  { kind: 'box', x: 16.6, y: 0, z: -48.4, w: 3.2, h: 0.2, d: 0.3, mat: 'wood', tile: 1 },
);
// plaster house west of the avenue, roof intact (no access)
add({ kind: 'room', x: -30, y: 0, z: -52, w: 9, d: 8, h: 4.0, thick: 0.6, mat: 'concrete',
  tile: 2, tint: PLAS, n: 'wall', s: 'door', e: 'window', w_: 'wall',
  doorW: 2.4, doorH: 2.8, sillH: 1.1, winH: 1.3, roof: true, roofMat: 'concreteDark' });
add({ kind: 'box', x: -31.8, y: 0, z: -53.4, w: 1.6, h: 0.75, d: 1.2, mat: 'wood', tile: 1.5 });

/* ------------------------- SE: COURTYARD VILLA (x 56, z -14) */
// two-storey villa east of the east lane; outer stair on the south face
// tops out exactly at the roof plate's overhang edge (4.95 -> 4.9)
add({ kind: 'room', x: 56, y: 0, z: -14, w: 12, d: 9, h: 4.5, thick: 0.6, mat: 'concrete',
  tile: 2, tint: PLAS, n: 'window', s: 'window', e: 'wall', w_: 'door',
  doorW: 2.6, doorH: 2.8, sillH: 1.1, winH: 1.4, roof: true, roofMat: 'concreteDark' });
add({ kind: 'stairs', x: 58, y: 0, z: -2.65, steps: 11, rise: 0.45, run: 0.55, width: 2.0, mat: 'concrete', axis: 'z', dir: -1, tint: GREY });
// courtyard walls + junk
add(
  { kind: 'wall', x: 52, y: 0, z: -21.6, len: 7, h: 1.6, thick: 0.4, mat: 'brick', axis: 'x', tile: 1.5 },
  { kind: 'wall', x: 48.75, y: 0, z: -19.2, len: 5.2, h: 1.1, thick: 0.4, mat: 'brick', axis: 'z', tile: 1.5 },
  { kind: 'barrel', x: 51.4, y: 0, z: -19.8, tint: 0x2f4f7a },
  { kind: 'box', x: 59.8, y: 0, z: -12.4, w: 1.6, h: 0.85, d: 1.2, mat: 'wood', tile: 1.5 },
);

/* --------------------------------- containers near the east lane */
add(
  { kind: 'container', x: 66, y: 0, z: -8, mat: 'containerRust', axis: 'z' },
  { kind: 'container', x: 73.5, y: 0, z: -4.5, mat: 'containerGreen', axis: 'x' },
  { kind: 'container', x: -70, y: 0, z: 30, mat: 'containerBlue', axis: 'x' },
);

/* ----------------------- scattered rubble piles (hand-placed) */
// every pile: chunky cover, tops staggered, never coplanar with neighbours
const PILES = [
  // [x, z, mat, tint, w, h, d] triples forming a climbable heap
  [-34, -20, [[0, 0, 2.2, 1.0, 1.8, 'concrete', GREY], [1.6, 0.8, 1.5, 0.55, 1.3, 'brick', BRICKT], [-1.4, 1.2, 1.2, 0.38, 1.0, 'sand', TAN]]],
  [18.5, -25.5, [[0, 0, 2.6, 1.0, 2.0, 'concrete', DGREY], [-1.8, 1.1, 1.6, 0.5, 1.4, 'concrete', GREY], [1.9, -1.3, 1.3, 0.45, 1.1, 'sand', DTAN]]],
  [-56, 40, [[0, 0, 2.4, 0.95, 1.9, 'brick', BRICKT], [1.7, -1.2, 1.5, 0.6, 1.2, 'concrete', PLAS], [-1.6, 1.3, 1.2, 0.35, 1.0, 'sand', TAN]]],
  [24, 44, [[0, 0, 2.8, 1.4, 2.2, 'concrete', GREY], [-2.0, 1.4, 1.7, 0.75, 1.5, 'brick', BRICKT], [2.1, 1.6, 1.3, 0.5, 1.1, 'sand', DTAN]]],
  [80, 8, [[0, 0, 2.2, 1.1, 1.7, 'concrete', PLAS], [1.5, 1.2, 1.4, 0.62, 1.2, 'concrete', GREY], [-1.5, -1.1, 1.2, 0.4, 1.0, 'sand', TAN]]],
  [-80, -62, [[0, 0, 2.5, 1.3, 2.0, 'brick', BRICKT], [1.8, 1.5, 1.6, 0.8, 1.4, 'concrete', GREY], [-1.7, -1.4, 1.3, 0.52, 1.1, 'sand', DTAN]]],
  [8, -62, [[0, 0, 2.3, 1.05, 1.8, 'concrete', GREY], [-1.6, -1.2, 1.5, 0.58, 1.3, 'brick', BRICKT], [1.6, 1.4, 1.2, 0.36, 1.0, 'sand', TAN]]],
  [58, -24, [[0, 0, 2.6, 1.2, 2.1, 'concrete', DGREY], [1.9, 1.0, 1.6, 0.66, 1.4, 'concrete', PLAS], [-1.8, 1.5, 1.3, 0.44, 1.1, 'sand', DTAN]]],
  [-34, 58, [[0, 0, 2.4, 1.15, 1.9, 'concrete', GREY], [1.7, -1.3, 1.5, 0.64, 1.3, 'brick', BRICKT], [-1.5, 1.2, 1.2, 0.42, 1.0, 'sand', TAN]]],
  [86, 56, [[0, 0, 2.2, 0.9, 1.7, 'brick', BRICKT], [-1.5, -1.0, 1.4, 0.56, 1.2, 'concrete', PLAS], [1.4, 1.3, 1.1, 0.34, 0.9, 'sand', DTAN]]],
];
for (const [px, pz, chunks] of PILES) {
  for (const [ox, oz, w, h, d, mat, tint] of chunks) {
    add({ kind: 'box', x: px + ox, y: 0, z: pz + oz, w, h, d, mat, tile: 1.5, tint });
  }
}

/* ------------------------- debris scatter (seeded, deterministic) */
// small shards everywhere; half are dressing-only so nav stays clean
const NO_GO = [
  // keep streets, crossings and building footprints walkable
  [-96, 96, 7, 17],      // main avenue
  [-18.5, -9.5, -79, 79],// north avenue
  [-96, 96, -37.5, -30.5], // back alley
  [34.5, 41.5, -79, 79],   // east lane
  [-16, 18, -19, -2],     // split flats + rubble ramp
  [54, 76, -66, -42],    // mosque
  [-44, 48, 18.5, 29],   // market row + pavement lip
  [-30, -2, -2, 24],     // checkpoint + guard tower
  [-63, -49, 8, 16],     // bus
  [-70, -40, -62, -2],   // rowhouses
  [44, 68, 22, 42],      // workshop
  [40, 52, 44, 56],      // water tower
  [-34, 18, 44, 68],     // ministry
  [-20, -8, -32, -18],   // tank
  [18.5, 34.5, -31, -0.5], // arcade + fountain + canopy + stair
  [-10.5, 2.5, 30.5, 41.5], // café
  [2, 18, 29.8, 42],     // garage + garden wall
  [-29, -18, 29.8, 38.5], // kiosk + garden wall
  [-59, -45, 30.5, 41.5], // south house ruin
  [13, 27, -56.5, -43.5], // bombed house
  [-36.5, -23.5, -58, -46], // plaster house
  [48, 64, -21, -1],     // villa + outer stair
];
const inside = (x, z, r) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3];
const DEBRIS_MATS = [['concrete', GREY], ['concrete', PLAS], ['brick', BRICKT], ['wood', 0xffffff], ['sand', DTAN]];
let placed = 0;
for (let tries = 0; tries < 900 && placed < 110; tries++) {
  const x = Math.round((rnd() * 178 - 89) * 2) / 2;
  const z = Math.round((rnd() * 146 - 73) * 2) / 2;
  if (NO_GO.some((r) => inside(x, z, r))) continue;
  const [mat, tint] = DEBRIS_MATS[Math.floor(rnd() * DEBRIS_MATS.length)];
  const w = 0.4 + Math.floor(rnd() * 4) * 0.2;
  const h = 0.16 + Math.floor(rnd() * 5) * 0.11;   // 0.16 .. 0.60, never 0.02/0.04/0.06
  const d = 0.4 + Math.floor(rnd() * 4) * 0.2;
  add({ kind: 'box', x, y: 0, z, w, h, d, mat, tile: 1, tint, collide: placed % 3 !== 2 });
  placed++;
}

/* ------------------- sand drifts leaning on the perimeter walls */
const DRIFTS = [
  [-70, -77.2, 4.2, 0.62, 1.8], [-38, -77.4, 3.0, 0.45, 1.5], [10, -77.2, 5.0, 0.7, 2.0],
  [58, -77.4, 3.6, 0.52, 1.6], [-52, 77.2, 4.4, 0.66, 1.9], [-6, 77.4, 3.2, 0.48, 1.4],
  [44, 77.2, 4.8, 0.74, 2.1], [82, 77.4, 3.4, 0.5, 1.5],
];
for (const [dx, dz, w, h, d] of DRIFTS) {
  add({ kind: 'box', x: dx, y: 0, z: dz, w, h, d, mat: 'sand', tile: 2, tint: TAN });
}
const DRIFTS_X = [
  [-94.2, -50, 1.8, 0.58, 4.0], [-94.4, 6, 1.5, 0.42, 3.2], [-94.2, 48, 2.0, 0.64, 4.4],
  [94.2, -28, 1.7, 0.54, 3.6], [94.4, 20, 1.9, 0.68, 4.2], [94.2, 60, 1.6, 0.46, 3.0],
];
for (const [dx, dz, d, h, w] of DRIFTS_X) {
  add({ kind: 'box', x: dx, y: 0, z: dz, w: d, h, d: w, mat: 'sand', tile: 2, tint: TAN });
}

/* --------------------- overhead wires + lamps + road furniture */
// sagging power lines crossing the streets between pole pairs; thin
// dressing boxes whose ends sink into the pole shafts
const WIRES = [
  // [x, y, z, axis, span] - line centred at (x,z), poles at both ends
  [-14, 5.6, -33, 'x', 9.2],
  [-40, 6.2, 12, 'z', 9.6],
  [30, 5.9, 12, 'z', 9.6],
  [-14, 5.7, 30, 'x', 9.2],
  [38, 5.4, -34, 'z', 7.0],
];
for (const [wx, wy, wz, axis, span] of WIRES) {
  add({ kind: 'box', x: wx, y: wy, z: wz, w: axis === 'x' ? span : 0.07, h: 0.07,
    d: axis === 'x' ? 0.07 : span, mat: 'metalDark', collide: false });
}
// pole pairs carrying those lines (shafts swallow the wire ends)
const POLES = [
  [-18.4, -33], [-9.6, -33],
  [-40, 7.4], [-40, 16.6],
  [30, 7.4], [30, 16.6],
  [-18.4, 30], [-9.6, 30],
  [38, -30.7], [38, -37.3],
];
for (const [px, pz] of POLES) {
  add(
    { kind: 'box', x: px, y: 0, z: pz, w: 0.22, h: 6.6, d: 0.22, mat: 'wood', tile: 1 },
    { kind: 'box', x: px, y: 5.9, z: pz, w: 1.6, h: 0.14, d: 0.14, mat: 'wood', tile: 1, collide: false },
  );
}
// a few surviving street lamps
for (const [lx, lz] of [[-30, 6.4], [16, 17.6], [58, 6.4], [-36, -30.8], [60, -30.8]]) {
  add({ kind: 'lamp', x: lx, y: 0, z: lz, h: 6.2 });
}
// road signs + barriers for flavour
add(
  { kind: 'box', x: -9.8, y: 0, z: 18.2, w: 0.16, h: 2.6, d: 0.16, mat: 'metalDark' },
  { kind: 'box', x: -9.8, y: 2.2, z: 18.2, w: 1.0, h: 0.7, d: 0.08, mat: 'hazard', tile: 1, collide: false },
  { kind: 'barrel', x: 12.4, y: 0, z: 6.8 },
  { kind: 'barrel', x: 13.3, y: 0, z: 7.6, tint: 0x2f4f7a },
  { kind: 'barrel', x: -44, y: 0, z: 17.4, tint: 0x3f6f4a },
  { kind: 'crateStack', x: 30.6, y: 0, z: 21.8, count: 2, size: 1.1, mat: 'crate' },
  { kind: 'crateStack', x: -30.8, y: 0, z: -32.6, count: 3, size: 1.0, mat: 'crate' },
  { kind: 'crateStack', x: 80.2, y: 0, z: -30.4, count: 2, size: 1.2, mat: 'crate' },
);

/* ------------------------------------------------------- the map */
export const RUINS = {
  name: 'RUINS',
  env: {
    indoor: false,
    bounds: { x: HX - 0.6, z: HZ - 0.6 },
    fog: { color: 0xc4ad86, near: 55, far: 250 },
  },
  parts,
};
