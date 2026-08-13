// BLACKSITE - a walled open-air compound under real sky, two and a half times
// the floor area of the old facility (interior 160 x 132 m, walls 8 m high).
//
// Nine hand-built zones, no two alike:
//   centre   - THE CROWN command bunker (roof deck + comms mast)
//   north    - CHECKPOINT gate: two towers carrying a road bridge
//   south    - THE VIADUCT: a pipeline walkway on two pump houses
//   west     - CARGO HALL: tall warehouse, container maze + mezzanine
//   east     - MOTOR POOL: workshop with a vehicle ramp onto its roof
//   NW       - ARCHIVE VAULT: server aisles under a low roof
//   SE       - DISPATCH DOCK: loading bays with a raised apron
//   NE       - TANK FARM: fuel silos linked by a service catwalk
//   SW       - THE FOUNDRY: furnace blocks under a matching catwalk
//
// Coordinates: -Z is north (OPFOR side), +X is east, Y is the *bottom* of a
// part. Fairness comes from point symmetry, not mirroring: rotate the map
// 180 degrees and every strategic asset (deck heights, cover density,
// approach widths) has a twin - but no two structures look the same.

const HX = 80, HZ = 66;        // interior half-extents (160 x 132)
const WALL_H = 8.0;            // floor to ceiling
const WT = 1.0;                // outer wall thickness
const IT = 0.7;                // interior wall thickness
// Building storeys run 20% taller than a normal facility, so a slide-jump
// (head apex ~3.1 m) clears every interior ceiling.
const PLAT = 4.32;             // top of the command bunker
const DECK = 4.08;             // gate towers / motor pool / archive / dock
const HIGH = 5.52;             // top of the cargo hall
const MEZZ = 2.64;             // cargo hall mezzanine
const CAT = 3.3;               // industrial catwalk decks

const parts = [];
const add = (...p) => parts.push(...p);
/** Place a piece and its 180-degree twin: fn(1) then fn(-1). */
const both = (fn) => { fn(1); fn(-1); };

/* ------------------------------------------------------------- shell */
// floor slab (its top face is y = 0, which every actor stands on)
add({ kind: 'slab', x: 0, y: -0.5, z: 0, w: HX * 2 + WT * 2, h: 0.5, d: HZ * 2 + WT * 2,
  mat: 'tile', tile: 2.5, walkway: true });

// four outer walls
add(
  { kind: 'wall', x: 0, y: 0, z: -(HZ + WT / 2), len: HX * 2 + WT * 2, h: WALL_H, thick: WT, mat: 'concrete', axis: 'x', tile: 3 },
  { kind: 'wall', x: 0, y: 0, z: HZ + WT / 2, len: HX * 2 + WT * 2, h: WALL_H, thick: WT, mat: 'concrete', axis: 'x', tile: 3 },
  { kind: 'wall', x: -(HX + WT / 2), y: 0, z: 0, len: HZ * 2, h: WALL_H, thick: WT, mat: 'concrete', axis: 'z', tile: 3 },
  { kind: 'wall', x: HX + WT / 2, y: 0, z: 0, len: HZ * 2, h: WALL_H, thick: WT, mat: 'concrete', axis: 'z', tile: 3 },
);

// a skirting band so the wall/floor join reads clearly at low resolution
add(
  { kind: 'box', x: 0, y: 0, z: -(HZ - 0.15), w: HX * 2, h: 0.35, d: 0.3, mat: 'concreteDark', tile: 2, collide: false },
  { kind: 'box', x: 0, y: 0, z: HZ - 0.15, w: HX * 2, h: 0.35, d: 0.3, mat: 'concreteDark', tile: 2, collide: false },
  { kind: 'box', x: -(HX - 0.15), y: 0, z: 0, w: 0.3, h: 0.35, d: HZ * 2, mat: 'concreteDark', tile: 2, collide: false },
  { kind: 'box', x: HX - 0.15, y: 0, z: 0, w: 0.3, h: 0.35, d: HZ * 2, mat: 'concreteDark', tile: 2, collide: false },
);

// pilasters break the long outer walls into readable bays
for (const px of [-56, -28, 28, 56]) {
  add(
    { kind: 'box', x: px, y: 0, z: -(HZ - 0.3), w: 1.4, h: WALL_H, d: 0.6, mat: 'concreteDark', tile: 2 },
    { kind: 'box', x: px, y: 0, z: HZ - 0.3, w: 1.4, h: WALL_H, d: 0.6, mat: 'concreteDark', tile: 2 },
  );
}
for (const pz of [-30, 30]) {
  add(
    { kind: 'box', x: -(HX - 0.3), y: 0, z: pz, w: 0.6, h: WALL_H, d: 1.4, mat: 'concreteDark', tile: 2 },
    { kind: 'box', x: HX - 0.3, y: 0, z: pz, w: 0.6, h: WALL_H, d: 1.4, mat: 'concreteDark', tile: 2 },
  );
}

/* ------------------------------------------- centre: THE CROWN bunker */
// Doors on all four faces so it never becomes a trap. Its roof is the highest
// contested deck in the middle of the map, reached by two opposing stairs.
add({ kind: 'room', x: 0, y: 0, z: 0, w: 30, d: 22, h: PLAT - 0.4, thick: IT,
  mat: 'concreteDark', tile: 2.5, doorW: 4.0, doorH: 3.1, sillH: 1.1, winH: 1.3,
  n: 'door', s: 'door', e: 'door', w_: 'door',
  floor: false, roof: true, roofMat: 'concreteDark', parapet: false });

// interior: a raised dais with a glass core, ops consoles and wall lockers
add(
  { kind: 'box', x: 0, y: 0, z: 0, w: 4, h: 0.5, d: 4, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 0, y: 0.5, z: 0, w: 0.9, h: 2.0, d: 0.9, mat: 'glass', tile: 1 },
);
both((s) => add(
  { kind: 'box', x: -6 * s, y: 0, z: -4 * s, w: 5, h: 1.0, d: 1.4, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 13.5 * s, y: 0, z: -8.5 * s, w: 1.6, h: 2.2, d: 0.6, mat: 'metalDark', tile: 2 },
));

// two opposing stairs; 8 x 0.45 = 3.6, ending flush with the roof edge
both((s) => add({ kind: 'stairs', x: 9 * s, y: 0, z: -16.65 * s, steps: 8, rise: PLAT / 8, run: 0.6,
  width: 3.2, mat: 'metalDark', axis: 'z', dir: s }));

// knee walls around the roof, with a gap where each stair lands
both((s) => add(
  { kind: 'box', x: -4.225 * s, y: PLAT, z: -11.35 * s, w: 23.25, h: 1.0, d: 1.0, mat: 'concreteDark', tile: 2 },
  { kind: 'box', x: 13.225 * s, y: PLAT, z: -11.35 * s, w: 5.25, h: 1.0, d: 1.0, mat: 'concreteDark', tile: 2 },
  { kind: 'box', x: 15.35 * s, y: PLAT, z: 0, w: 1.0, h: 1.0, d: 23.7, mat: 'concreteDark', tile: 2 },
));

// comms mast + hard cover on the roof deck
add(
  { kind: 'box', x: 0, y: PLAT, z: 0, w: 1.4, h: 2.6, d: 1.4, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 0, y: PLAT + 2.6, z: 0, w: 0.25, h: 1.4, d: 0.25, mat: 'metalDark', tile: 1, collide: false },
  { kind: 'box', x: 0.55, y: PLAT + 2.3, z: 0, w: 0.9, h: 0.5, d: 0.15, mat: 'metal', tile: 1, collide: false },
);
both((s) => add({ kind: 'box', x: -6 * s, y: PLAT, z: 5 * s, w: 2.6, h: 1.1, d: 1.4, mat: 'concreteDark', tile: 2 }));

/* -------------------------------------------- north: CHECKPOINT gate */
// Two garrison towers carry a road bridge over the northern approach; the
// ground passage between them is chicaned with sandbags.
add({ kind: 'room', x: -12, y: 0, z: -26, w: 10, d: 10, h: DECK - 0.4, thick: IT,
  mat: 'concrete', tile: 2.5, doorW: 3.6, doorH: 2.9, sillH: 1.2, winH: 1.3,
  n: 'window', s: 'door', e: 'door', w_: 'wall',
  floor: false, roof: true, roofMat: 'concreteDark', parapet: false });
add({ kind: 'room', x: 12, y: 0, z: -26, w: 10, d: 10, h: DECK - 0.4, thick: IT,
  mat: 'concrete', tile: 2.5, doorW: 3.6, doorH: 2.9, sillH: 1.2, winH: 1.3,
  n: 'window', s: 'door', e: 'wall', w_: 'door',
  floor: false, roof: true, roofMat: 'concreteDark', parapet: false });

// The bridge ends butt against the expanded roof edges at x +/-6.15. The old
// 13 m deck overlapped both roofs by 0.35 m on the same top plane, making the
// renderer alternate between two surfaces (Z-fighting) at each joint.
add({ kind: 'slab', x: 0, y: DECK - 0.4, z: -26, w: 12.3, h: 0.4, d: 3.4, mat: 'metalDark', tile: 2, walkway: true });
add(
  { kind: 'railing', x: 0, y: DECK, z: -27.55, len: 12.4, h: 0.9, mat: 'metalDark', axis: 'x' },
  { kind: 'railing', x: 0, y: DECK, z: -24.45, len: 12.4, h: 0.9, mat: 'metalDark', axis: 'x' },
);

// tower roof access: a stair up each outer face
add(
  { kind: 'stairs', x: -22.65, y: 0, z: -26, steps: 8, rise: DECK / 8, run: 0.6, width: 3.0, mat: 'metalDark', axis: 'x', dir: 1 },
  { kind: 'stairs', x: 22.65, y: 0, z: -26, steps: 8, rise: DECK / 8, run: 0.6, width: 3.0, mat: 'metalDark', axis: 'x', dir: -1 },
);

// garrison clutter + the chicane
add(
  { kind: 'crateStack', x: -15, y: 0, z: -29, count: 1, size: 1.25, mat: 'crate' },
  { kind: 'barrel', x: 15, y: 0, z: -28.5, tint: 0x8a8f96 },
  { kind: 'crateStack', x: 14.5, y: 0, z: -23, count: 1, size: 1.2, mat: 'crate' },
  { kind: 'sandbag', x: -3.5, y: 0, z: -23.5, len: 4, h: 1.05, axis: 'x' },
  { kind: 'sandbag', x: 4, y: 0, z: -28.5, len: 4, h: 1.05, axis: 'x' },
);

/* --------------------------------------------- south: THE VIADUCT */
// The same crossing value as the checkpoint, built a different way: a
// pipeline walkway resting on two solid pump houses, stairs up each end.
both((s) => add({ kind: 'box', x: 9 * s, y: 0, z: 26, w: 6, h: DECK - 0.4, d: 6, mat: 'metal', tile: 2.6 }));
add({ kind: 'slab', x: 0, y: DECK - 0.4, z: 26, w: 13.0, h: 0.4, d: 3.4, mat: 'metalDark', tile: 2, walkway: true });
add(
  { kind: 'railing', x: 0, y: DECK, z: 24.45, len: 12.4, h: 0.9, mat: 'metalDark', axis: 'x' },
  { kind: 'railing', x: 0, y: DECK, z: 27.55, len: 12.4, h: 0.9, mat: 'metalDark', axis: 'x' },
);
add(
  { kind: 'stairs', x: -16.2, y: 0, z: 26, steps: 7, rise: (DECK - 0.4) / 7, run: 0.6, width: 3.0, mat: 'metalDark', axis: 'x', dir: 1 },
  { kind: 'stairs', x: 16.2, y: 0, z: 26, steps: 7, rise: (DECK - 0.4) / 7, run: 0.6, width: 3.0, mat: 'metalDark', axis: 'x', dir: -1 },
);
// hazard trim on the pump house faces + the matching chicane
both((s) => add({ kind: 'box', x: 9 * s, y: 0.9, z: 22.94, w: 5.2, h: 0.5, d: 0.14, mat: 'hazard', tile: 1.4, collide: false }));
add(
  { kind: 'sandbag', x: 3.5, y: 0, z: 23.5, len: 4, h: 1.05, axis: 'x' },
  { kind: 'sandbag', x: -4, y: 0, z: 28.5, len: 4, h: 1.05, axis: 'x' },
  { kind: 'barrel', x: -15, y: 0, z: 28.5, tint: 0x2f4f7a },
);

/* ----------------------------------------------- west: CARGO HALL */
// The tallest roof on the map. Inside: a container maze and a mezzanine
// along the back wall; outside: a long stair up the east face.
add({ kind: 'room', x: -52, y: 0, z: 0, w: 26, d: 34, h: HIGH - 0.4, thick: IT,
  mat: 'metal', tile: 3, doorW: 4.2, doorH: 3.8, sillH: 1.2, winH: 1.6,
  n: 'door', s: 'door', e: 'door', w_: 'window',
  floor: false, roof: true, roofMat: 'roof', parapet: false });

// hand-built parapet with a gap where the roof stair lands (z 9.4..12.6)
add(
  { kind: 'box', x: -52, y: HIGH, z: -17.35, w: 27.7, h: 0.7, d: 1.0, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -52, y: HIGH, z: 17.35, w: 27.7, h: 0.7, d: 1.0, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -65.35, y: HIGH, z: 0, w: 1.0, h: 0.7, d: 33.7, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -38.65, y: HIGH, z: -3.725, w: 1.0, h: 0.7, d: 26.25, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -38.65, y: HIGH, z: 14.725, w: 1.0, h: 0.7, d: 4.25, mat: 'metalDark', tile: 2 },
);

// container maze + stock
add(
  { kind: 'container', x: -58, y: 0, z: -8, axis: 'z', mat: 'containerRust' },
  { kind: 'container', x: -47, y: 0, z: -2, axis: 'x', mat: 'containerGreen' },
  { kind: 'container', x: -55, y: 0, z: 6, axis: 'x', mat: 'containerBlue' },
  { kind: 'crateStack', x: -44, y: 0, z: 8, count: 3, size: 1.3, mat: 'crate' },
  { kind: 'crateStack', x: -49, y: 0, z: -12, count: 2, size: 1.3, mat: 'crate' },
  { kind: 'barrel', x: -44, y: 0, z: -12, tint: 0x3f6f4a },
  { kind: 'barrel', x: -42.8, y: 0, z: -10.8, tint: 0x3f6f4a },
);

// mezzanine along the west wall: two legs, a deck, a rail and its stair
add(
  { kind: 'box', x: -62.5, y: 0, z: -9, w: 0.6, h: MEZZ - 0.35, d: 0.6, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -62.5, y: 0, z: 9, w: 0.6, h: MEZZ - 0.35, d: 0.6, mat: 'metalDark', tile: 2 },
  { kind: 'slab', x: -62.5, y: MEZZ - 0.35, z: 0, w: 4, h: 0.35, d: 20, mat: 'metalDark', tile: 2, walkway: true },
  { kind: 'railing', x: -60.6, y: MEZZ, z: 0, len: 20, h: 0.9, mat: 'metalDark', axis: 'z' },
  { kind: 'stairs', x: -62.5, y: 0, z: 12.75, steps: 5, rise: MEZZ / 5, run: 0.55, width: 3.0, mat: 'metalDark', axis: 'z', dir: -1 },
);

// exterior stair up to the roof, clear of the east door
add({ kind: 'stairs', x: -32.15, y: 0, z: 11, steps: 10, rise: HIGH / 10, run: 0.6, width: 3.2, mat: 'metalDark', axis: 'x', dir: -1 });
add(
  { kind: 'box', x: -56, y: HIGH, z: -6, w: 2.2, h: 1.0, d: 2.2, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -47, y: HIGH, z: 7, w: 2.2, h: 1.0, d: 2.2, mat: 'metalDark', tile: 2 },
);

/* ----------------------------------------------- east: MOTOR POOL */
// A brick workshop with two vehicle lifts; the roof is reached by a long
// ramp instead of stairs - the only ramp on the map.
add({ kind: 'room', x: 52, y: 0, z: 0, w: 26, d: 30, h: DECK - 0.4, thick: IT,
  mat: 'brick', tile: 2.5, doorW: 4.2, doorH: 3.3, sillH: 1.2, winH: 1.4,
  n: 'window', s: 'door', e: 'window', w_: 'door',
  floor: false, roof: true, roofMat: 'roof', parapet: false });

add(
  { kind: 'box', x: 46, y: 0, z: -6, w: 4.4, h: 1.15, d: 2.6, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 58, y: 0, z: 4, w: 4.4, h: 1.15, d: 2.6, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 52, y: 0, z: -13.4, w: 8, h: 1.0, d: 1.2, mat: 'wood', tile: 2 },
  { kind: 'crateStack', x: 59, y: 0, z: -10, count: 2, size: 1.3, mat: 'crate' },
  { kind: 'barrel', x: 45, y: 0, z: 10, tint: 0xb04a2a },
  { kind: 'barrel', x: 46.6, y: 0, z: 11.2, tint: 0xb04a2a },
);

// vehicle ramp onto the roof + a knee wall facing the centre
add({ kind: 'ramp', x: 57, y: 0, z: 22.65, len: 6.8, h: DECK, width: 3.4, mat: 'concreteDark', axis: 'z', dir: -1 });
add(
  { kind: 'box', x: 38.8, y: DECK, z: 0, w: 1.0, h: 0.9, d: 20, mat: 'concreteDark', tile: 2 },
  { kind: 'box', x: 47, y: DECK, z: -8, w: 1.8, h: 1.0, d: 1.8, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 58, y: DECK, z: 9, w: 1.8, h: 1.0, d: 1.8, mat: 'metalDark', tile: 2 },
);

/* --------------------------------------------- NW: ARCHIVE VAULT */
// Server aisles: tall racks that cut the room into shooting lanes.
add({ kind: 'room', x: -52, y: 0, z: -44, w: 20, d: 16, h: DECK - 0.4, thick: IT,
  mat: 'concreteDark', tile: 2.5, doorW: 3.6, doorH: 2.9, sillH: 1.2, winH: 1.3,
  n: 'window', s: 'door', e: 'door', w_: 'wall',
  floor: false, roof: true, roofMat: 'roof', parapet: false });

add(
  { kind: 'box', x: -58, y: 0, z: -44, w: 1.0, h: 2.3, d: 3.6, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -53.5, y: 0, z: -44, w: 1.0, h: 2.3, d: 3.6, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -49, y: 0, z: -44, w: 1.0, h: 2.3, d: 3.6, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -46, y: 0, z: -40, w: 3.6, h: 2.3, d: 1.0, mat: 'metalDark', tile: 2 },
);

add({ kind: 'stairs', x: -36.35, y: 0, z: -48, steps: 8, rise: DECK / 8, run: 0.6, width: 3.0, mat: 'metalDark', axis: 'x', dir: -1 });
add({ kind: 'crateStack', x: -47, y: DECK, z: -48, count: 2, size: 1.25, mat: 'crate' });

/* --------------------------------------------- SE: DISPATCH DOCK */
// Loading bays: a raised apron split around the west door, short ramps up,
// containers parked in the yard.
add({ kind: 'room', x: 52, y: 0, z: 44, w: 20, d: 16, h: DECK - 0.4, thick: IT,
  mat: 'concrete', tile: 2.5, doorW: 3.6, doorH: 2.9, sillH: 1.2, winH: 1.3,
  n: 'door', s: 'window', e: 'wall', w_: 'door',
  floor: false, roof: true, roofMat: 'roof', parapet: false });

add(
  { kind: 'slab', x: 39, y: 0, z: 38.75, w: 5, h: 1.1, d: 4.5, mat: 'concreteDark', tile: 2, walkway: true },
  { kind: 'slab', x: 39, y: 0, z: 49.25, w: 5, h: 1.1, d: 4.5, mat: 'concreteDark', tile: 2, walkway: true },
  { kind: 'ramp', x: 34.1, y: 0, z: 38.75, len: 2.4, h: 1.1, width: 3.2, mat: 'concreteDark', axis: 'x', dir: 1 },
  { kind: 'ramp', x: 34.1, y: 0, z: 49.25, len: 2.4, h: 1.1, width: 3.2, mat: 'concreteDark', axis: 'x', dir: 1 },
  { kind: 'crateStack', x: 38.5, y: 1.1, z: 49.5, count: 2, size: 1.2, mat: 'crate' },
);

add(
  { kind: 'crateStack', x: 47, y: 0, z: 40, count: 2, size: 1.3, mat: 'crate' },
  { kind: 'crateStack', x: 57, y: 0, z: 48, count: 3, size: 1.25, mat: 'crate' },
  { kind: 'box', x: 48, y: 0, z: 45, w: 1.6, h: 1.6, d: 2.4, mat: 'metalDark', tile: 2 },
  { kind: 'container', x: 30, y: 0, z: 48, axis: 'z', mat: 'containerGreen' },
  { kind: 'container', x: 33, y: 0, z: 33, axis: 'x', mat: 'containerRust' },
);

add({ kind: 'stairs', x: 57, y: 0, z: 30.35, steps: 8, rise: DECK / 8, run: 0.6, width: 3.0, mat: 'metalDark', axis: 'z', dir: 1 });

/* ------------------------------------------------- NE: TANK FARM */
// Three fuel silos of different heights, a pump shed, and a catwalk on legs
// between the two big ones.
add(
  { kind: 'box', x: 46, y: 0, z: -50, w: 4.6, h: 5.0, d: 4.6, mat: 'metal', tile: 2.6 },
  { kind: 'box', x: 56, y: 0, z: -42, w: 4.6, h: 5.0, d: 4.6, mat: 'metal', tile: 2.6 },
  { kind: 'box', x: 62, y: 0, z: -54, w: 4.6, h: 4.0, d: 4.6, mat: 'metal', tile: 2.6 },
  { kind: 'box', x: 61.5, y: 0, z: -41, w: 3.0, h: 2.2, d: 3.0, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 46, y: 3.6, z: -50, w: 4.72, h: 0.4, d: 4.72, mat: 'hazard', tile: 1.4, collide: false },
  { kind: 'box', x: 56, y: 3.6, z: -42, w: 4.72, h: 0.4, d: 4.72, mat: 'hazard', tile: 1.4, collide: false },
);
add(
  { kind: 'box', x: 48, y: 0, z: -46, w: 0.6, h: CAT - 0.35, d: 0.6, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 54, y: 0, z: -46, w: 0.6, h: CAT - 0.35, d: 0.6, mat: 'metalDark', tile: 2 },
  { kind: 'slab', x: 51, y: CAT - 0.35, z: -46, w: 10, h: 0.35, d: 2.8, mat: 'metalDark', tile: 2, walkway: true },
  { kind: 'railing', x: 51, y: CAT, z: -47.3, len: 10, h: 0.9, mat: 'metalDark', axis: 'x' },
  { kind: 'railing', x: 51, y: CAT, z: -44.7, len: 10, h: 0.9, mat: 'metalDark', axis: 'x' },
  { kind: 'stairs', x: 42.15, y: 0, z: -46, steps: 7, rise: CAT / 7, run: 0.55, width: 2.8, mat: 'metalDark', axis: 'x', dir: 1 },
  { kind: 'stairs', x: 59.85, y: 0, z: -46, steps: 7, rise: CAT / 7, run: 0.55, width: 2.8, mat: 'metalDark', axis: 'x', dir: -1 },
);

/* ------------------------------------------------ SW: THE FOUNDRY */
// The tank farm's strategic twin, dressed as a furnace hall: three furnace
// blocks, glowing mouths, and the same catwalk arrangement rotated 180.
add(
  { kind: 'box', x: -46, y: 0, z: 50, w: 4.6, h: 4.4, d: 4.6, mat: 'concreteDark', tile: 2.6 },
  { kind: 'box', x: -56, y: 0, z: 42, w: 4.4, h: 4.4, d: 4.4, mat: 'concreteDark', tile: 2.6 },
  { kind: 'box', x: -62, y: 0, z: 54, w: 4.4, h: 4.0, d: 4.4, mat: 'concreteDark', tile: 2.6 },
  { kind: 'box', x: -46, y: 0.6, z: 47.62, w: 2.2, h: 1.4, d: 0.14, mat: 'hazard', tile: 1.4, collide: false },
  { kind: 'box', x: -56, y: 0.6, z: 44.26, w: 2.2, h: 1.4, d: 0.14, mat: 'hazard', tile: 1.4, collide: false },
  { kind: 'crateStack', x: -44, y: 0, z: 41, count: 2, size: 1.3, mat: 'crate' },
  { kind: 'barrel', x: -58, y: 0, z: 50, tint: 0xb04a2a },
  { kind: 'barrel', x: -59.5, y: 0, z: 48.5, tint: 0x8a8f96 },
);
add(
  { kind: 'box', x: -48, y: 0, z: 46, w: 0.6, h: CAT - 0.35, d: 0.6, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -54, y: 0, z: 46, w: 0.6, h: CAT - 0.35, d: 0.6, mat: 'metalDark', tile: 2 },
  { kind: 'slab', x: -51, y: CAT - 0.35, z: 46, w: 10, h: 0.35, d: 2.8, mat: 'metalDark', tile: 2, walkway: true },
  { kind: 'railing', x: -51, y: CAT, z: 47.3, len: 10, h: 0.9, mat: 'metalDark', axis: 'x' },
  { kind: 'railing', x: -51, y: CAT, z: 44.7, len: 10, h: 0.9, mat: 'metalDark', axis: 'x' },
  { kind: 'stairs', x: -42.15, y: 0, z: 46, steps: 7, rise: CAT / 7, run: 0.55, width: 2.8, mat: 'metalDark', axis: 'x', dir: -1 },
  { kind: 'stairs', x: -59.85, y: 0, z: 46, steps: 7, rise: CAT / 7, run: 0.55, width: 2.8, mat: 'metalDark', axis: 'x', dir: 1 },
);

/* ------------------------------------------------ midfield set pieces */
// A fallen gantry crane in the west hall: fight under the beam.
add(
  { kind: 'box', x: -30, y: 0, z: -8, w: 1.1, h: 3.2, d: 1.1, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -30, y: 0, z: 8, w: 1.1, h: 3.2, d: 1.1, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -30, y: 3.2, z: 0, w: 1.3, h: 0.6, d: 17.4, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: -30, y: 1.6, z: 2, w: 0.15, h: 1.6, d: 0.15, mat: 'metalDark', tile: 1, collide: false },
  { kind: 'box', x: -30, y: 1.2, z: 2, w: 0.5, h: 0.4, d: 0.5, mat: 'metal', tile: 1, collide: false },
  { kind: 'crateStack', x: -30, y: 0, z: 2.6, count: 1, size: 1.3, mat: 'crate' },
);
// ...and a conveyor gantry in the east hall: same silhouette value, different look
add(
  { kind: 'box', x: 30, y: 0, z: -8, w: 1.1, h: 3.0, d: 1.1, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 30, y: 0, z: 8, w: 1.1, h: 3.0, d: 1.1, mat: 'metalDark', tile: 2 },
  { kind: 'box', x: 30, y: 3.0, z: 0, w: 1.5, h: 0.5, d: 17.4, mat: 'metal', tile: 2 },
  { kind: 'box', x: 30, y: 0, z: 3, w: 1.2, h: 1.3, d: 1.2, mat: 'metal', tile: 2 },
);

// Two guard kiosks (south is concrete, north is a metal shack). They sit
// clear of the gate-tower stairs - at (±24, ±24) the north one used to run
// straight through the west tower's staircase.
add({ kind: 'room', x: 28, y: 0, z: 18, w: 6, d: 6, h: 2.76, thick: 0.6,
  mat: 'concrete', tile: 2, doorW: 3.6, doorH: 2.4, sillH: 1.0, winH: 0.9,
  n: 'door', s: 'door', e: 'wall', w_: 'wall', floor: false, roof: false, parapet: false });
add({ kind: 'box', x: 28, y: 2.76, z: 18, w: 7, h: 0.35, d: 7, mat: 'concreteDark', tile: 2 });
add({ kind: 'room', x: -28, y: 0, z: -18, w: 6, d: 6, h: 2.76, thick: 0.6,
  mat: 'metal', tile: 2, doorW: 3.6, doorH: 2.4, sillH: 1.0, winH: 0.9,
  n: 'door', s: 'door', e: 'wall', w_: 'wall', floor: false, roof: false, parapet: false });
add({ kind: 'box', x: -28, y: 2.76, z: -18, w: 7, h: 0.35, d: 7, mat: 'metalDark', tile: 2 });

// ruined brick walls flanking the bunker's side doors
both((s) => add(
  { kind: 'wall', x: -24 * s, y: 0, z: -2 * s, len: 8, h: 1.05, thick: 0.6, mat: 'brick', axis: 'z', tile: 2 },
  { kind: 'box', x: -24 * s, y: 0, z: -5.8 * s, w: 0.7, h: 2.3, d: 0.9, mat: 'brick', tile: 2 },
  { kind: 'box', x: -24 * s, y: 0, z: 1.8 * s, w: 0.7, h: 2.3, d: 0.9, mat: 'brick', tile: 2 },
));

// staggered jersey barriers NE and SW of the bunker
both((s) => add(
  { kind: 'box', x: 14 * s, y: 0, z: -16 * s, w: 2.4, h: 1.05, d: 0.9, mat: 'concreteDark', tile: 2 },
  { kind: 'box', x: 16.5 * s, y: 0, z: -14.5 * s, w: 2.4, h: 1.05, d: 0.9, mat: 'concreteDark', tile: 2 },
  { kind: 'box', x: 19 * s, y: 0, z: -13 * s, w: 2.4, h: 1.05, d: 0.9, mat: 'concreteDark', tile: 2 },
));

// sandbag redoubts guarding the corner approaches
both((s) => add(
  { kind: 'sandbag', x: -20 * s, y: 0, z: -32.5 * s, len: 5, h: 1.05, axis: 'x' },
  { kind: 'sandbag', x: -22.8 * s, y: 0, z: -34.3 * s, len: 4, h: 1.05, axis: 'z' },
  { kind: 'sandbag', x: -17.2 * s, y: 0, z: -34.3 * s, len: 4, h: 1.05, axis: 'z' },
));

// supply clusters in the side halls
both((s) => add(
  { kind: 'crateStack', x: -34 * s, y: 0, z: 20 * s, count: 2, size: 1.3, mat: 'crate' },
  { kind: 'barrel', x: -31 * s, y: 0, z: 22 * s, tint: 0x3f6f4a },
  { kind: 'sandbag', x: -35.5 * s, y: 0, z: 23.5 * s, len: 4, h: 1.05, axis: 'z' },
));

// With the sky open there is nothing left to hold up, so the old structural
// columns are gone; low cover stands in for them where the halls felt bare.
both((s) => add(
  { kind: 'box', x: 24 * s, y: 0, z: -10 * s, w: 2.2, h: 1.05, d: 1.1, mat: 'concreteDark', tile: 2 },
  { kind: 'crateStack', x: -8 * s, y: 0, z: -46 * s, count: 2, size: 1.25, mat: 'crate' },
));

// the back lanes behind the big halls get their own scatter
add(
  { kind: 'container', x: -71, y: 0, z: -20, axis: 'z', mat: 'containerRust' },
  { kind: 'barrel', x: -74, y: 0, z: 14, tint: 0x8a8f96 },
  { kind: 'barrel', x: -72.8, y: 0, z: 15.2, tint: 0x2f4f7a },
  { kind: 'sandbag', x: -70, y: 0, z: 30, len: 4, h: 1.05, axis: 'x' },
  { kind: 'container', x: 71, y: 0, z: 20, axis: 'z', mat: 'containerBlue' },
  { kind: 'barrel', x: 74, y: 0, z: -14, tint: 0x8a8f96 },
  { kind: 'barrel', x: 72.8, y: 0, z: -15.2, tint: 0xb04a2a },
  { kind: 'sandbag', x: 70, y: 0, z: -30, len: 4, h: 1.05, axis: 'x' },
);

// spawn-yard cover: light, spaced, never a fort
both((s) => add(
  { kind: 'crateStack', x: -14 * s, y: 0, z: 58 * s, count: 2, size: 1.3, mat: 'crate' },
  { kind: 'sandbag', x: 18 * s, y: 0, z: 60 * s, len: 5, h: 1.05, axis: 'x' },
  { kind: 'barrel', x: -30 * s, y: 0, z: 56 * s, tint: 0x3f6f4a },
  { kind: 'box', x: 36 * s, y: 0, z: 58 * s, w: 2.4, h: 1.05, d: 1.1, mat: 'concreteDark', tile: 2 },
));

/* ------------------------------------------------------- lighting */
// The compound is open to the sky, so the sun does the heavy lifting;
// fixtures only live under roofs, which the sun cannot reach.
both((s) => add({ kind: 'ceilingLight', x: 7 * s, y: 2.5, z: -5 * s, w: 3.0, d: 0.6, range: 18, power: 12 }));
add(
  { kind: 'ceilingLight', x: -52, y: HIGH - 1.3, z: -7, w: 4.0, d: 0.7, range: 20, power: 14 },
  { kind: 'ceilingLight', x: -52, y: HIGH - 1.3, z: 7, w: 4.0, d: 0.7, range: 20, power: 14 },
  { kind: 'ceilingLight', x: 52, y: DECK - 1.05, z: -7, w: 4.0, d: 0.7, range: 18, power: 12 },
  { kind: 'ceilingLight', x: 52, y: DECK - 1.05, z: 7, w: 4.0, d: 0.7, range: 18, power: 12 },
  { kind: 'ceilingLight', x: -52, y: DECK - 1.05, z: -44, w: 3.0, d: 0.6, range: 15, power: 10 },
  { kind: 'ceilingLight', x: 52, y: DECK - 1.05, z: 44, w: 3.0, d: 0.6, range: 15, power: 10 },
);

export const FACILITY = {
  name: 'BLACKSITE',
  env: {
    indoor: false,
    bounds: { x: HX - 0.6, z: HZ - 0.6 },
    fog: { color: 0x9db4c6, near: 70, far: 280 },
  },
  parts,
};
