// PLAYLAND - a walled children's amusement park under the same real sky as
// BLACKSITE, 1.2x its floor area (interior 192 x 158 m, walls 8 m high).
//
// Nine hand-built zones, no two alike:
//   centre   - THE CASTLE: four-colour keep, high deck + twin slides
//   north    - ENTRANCE GATE: ticket booths under a rainbow arch
//   south    - CAROUSEL: striped canopy over a ridable platform
//   east     - SWING PARK: A-frame swings and the blue slide hill
//   west     - SAND COVE: timbered sand pit with castles and buckets
//   NE       - JUNGLE GYM: climbing frames with two deck platforms
//   SE       - TINY TOWN: candy-coloured playhouse maze
//   NW       - SWEET SHOP: awning storefront with a roof deck
//   SW       - BLOCK YARD: giant toy blocks stacked for climbing
// The open lawns between the zones carry the cover: playhouses, toy trains,
// ice-cream kiosks, picnic sets, crawl tunnels, crayons, mushrooms, letter
// cubes, hedge corners and spring riders.
// Second ring of attractions, all point-symmetric twins: ferris wheels over
// the NE/SW corners, zigzag funhouses anchoring NW/SE, pony pens, bumper-car
// arenas on the promenade, puppet theatres on the gate lanes, hedge mazes,
// hotdog stands, two more cottages, wrapped presents and topiary animals.
//
// Coordinates: -Z is north (OPFOR side), +X is east, Y is the *bottom* of a
// part. Fairness comes from point symmetry, not mirroring: rotate the map 180
// degrees and every strategic asset (deck heights, cover density, approach
// widths) has a twin - but no two structures look the same.
//
// Hard rules this file follows so nothing flickers or blocks:
//   - flat ground paints never share a top height where they overlap
//     (asphalt 0.04, lawns 0.02, rubber pads / stud plate 0.08)
//   - towers stop at the deck's underside; only their caps cross the deck
//   - stairs land flush against the deck they serve, into an aligned gap
//     in the parapet; slides never thread doorframes or dive under decks

const HX = 96, HZ = 79;        // interior half-extents (192 x 158)
const WALL_H = 8.0;            // floor to fence top
const WT = 1.0;                // outer wall thickness
const IT = 0.7;                // interior wall thickness
// Deck heights match BLACKSITE so jump / slide-jump timings carry over.
const PLAT = 5.4;              // castle deck (taller than BLACKSITE: landmark)
const DECK = 4.08;             // sweet shop roof
const MEZZ = 2.64;             // jungle gym platforms / tiny town roofs

// candy palette, always multiplying the light concrete / tile textures
const RED = 0xe05a4e, YEL = 0xf2b134, GRN = 0x4fa75a, BLU = 0x3f8fd2;
const PUR = 0x9a68c8, PNK = 0xf279b6, CREAM = 0xf5e6c8, MINT = 0x9fdcb8;
const SKY = 0x9fc8e8, LAWN = 0x7fbf5a, SANDY = 0xf0dcA0;

const parts = [];
const add = (...p) => parts.push(...p);
/** Place a piece and its 180-degree twin: fn(1) then fn(-1). */
const both = (fn) => { fn(1); fn(-1); };

/* ------------------------------------------------------------- shell */
// floor slab (its top face is y = 0, which every actor stands on)
add({ kind: 'slab', x: 0, y: -0.5, z: 0, w: HX * 2 + WT * 2, h: 0.5, d: HZ * 2 + WT * 2,
  mat: 'tile', tile: 2.5, walkway: true });

// park fence: cream brick wall with a mint cap, rainbow pilaster bays
add(
  { kind: 'wall', x: 0, y: 0, z: -(HZ + WT / 2), len: HX * 2 + WT * 2, h: WALL_H, thick: WT, mat: 'brick', axis: 'x', tile: 3, tint: CREAM },
  { kind: 'wall', x: 0, y: 0, z: HZ + WT / 2, len: HX * 2 + WT * 2, h: WALL_H, thick: WT, mat: 'brick', axis: 'x', tile: 3, tint: CREAM },
  { kind: 'wall', x: -(HX + WT / 2), y: 0, z: 0, len: HZ * 2, h: WALL_H, thick: WT, mat: 'brick', axis: 'z', tile: 3, tint: CREAM },
  { kind: 'wall', x: HX + WT / 2, y: 0, z: 0, len: HZ * 2, h: WALL_H, thick: WT, mat: 'brick', axis: 'z', tile: 3, tint: CREAM },
);
// mint coping band so the fence top reads at low resolution
add(
  { kind: 'box', x: 0, y: WALL_H, z: -(HZ + WT / 2), w: HX * 2 + WT * 2, h: 0.4, d: WT + 0.3, mat: 'concrete', tile: 2, tint: MINT, collide: false },
  { kind: 'box', x: 0, y: WALL_H, z: HZ + WT / 2, w: HX * 2 + WT * 2, h: 0.4, d: WT + 0.3, mat: 'concrete', tile: 2, tint: MINT, collide: false },
  { kind: 'box', x: -(HX + WT / 2), y: WALL_H, z: 0, w: WT + 0.3, h: 0.4, d: HZ * 2, mat: 'concrete', tile: 2, tint: MINT, collide: false },
  { kind: 'box', x: HX + WT / 2, y: WALL_H, z: 0, w: WT + 0.3, h: 0.4, d: HZ * 2, mat: 'concrete', tile: 2, tint: MINT, collide: false },
);
// skirting band and rainbow pilasters along every wall
const BAY_TINTS = [RED, YEL, GRN, BLU, PUR, PNK];
add(
  { kind: 'box', x: 0, y: 0, z: -(HZ - 0.15), w: HX * 2, h: 0.35, d: 0.3, mat: 'concrete', tile: 2, tint: PNK, collide: false },
  { kind: 'box', x: 0, y: 0, z: HZ - 0.15, w: HX * 2, h: 0.35, d: 0.3, mat: 'concrete', tile: 2, tint: PNK, collide: false },
  { kind: 'box', x: -(HX - 0.15), y: 0, z: 0, w: 0.3, h: 0.35, d: HZ * 2, mat: 'concrete', tile: 2, tint: PNK, collide: false },
  { kind: 'box', x: HX - 0.15, y: 0, z: 0, w: 0.3, h: 0.35, d: HZ * 2, mat: 'concrete', tile: 2, tint: PNK, collide: false },
);
for (let i = 0; i < 6; i++) {
  const px = -70 + i * 28;
  const t = BAY_TINTS[i];
  add(
    { kind: 'box', x: px, y: 0, z: -(HZ - 0.3), w: 1.4, h: WALL_H, d: 0.6, mat: 'concrete', tile: 2, tint: t },
    { kind: 'box', x: -px, y: 0, z: HZ - 0.3, w: 1.4, h: WALL_H, d: 0.6, mat: 'concrete', tile: 2, tint: BAY_TINTS[(i + 3) % 6] },
  );
}
for (let i = 0; i < 4; i++) {
  const pz = -52.5 + i * 35;
  add(
    { kind: 'box', x: -(HX - 0.3), y: 0, z: pz, w: 0.6, h: WALL_H, d: 1.4, mat: 'concrete', tile: 2, tint: BAY_TINTS[(i + 1) % 6] },
    { kind: 'box', x: HX - 0.3, y: 0, z: -pz, w: 0.6, h: WALL_H, d: 1.4, mat: 'concrete', tile: 2, tint: BAY_TINTS[(i + 4) % 6] },
  );
}
// hedge strips inside the fence: low green cover along the long walls
for (const pz of [-44, -8, 30]) {
  add(
    { kind: 'box', x: -(HX - 2.6), y: 0, z: pz, w: 1.6, h: 1.25, d: 18, mat: 'concrete', tile: 1.5, tint: GRN },
    { kind: 'box', x: HX - 2.6, y: 0, z: -pz + 8, w: 1.6, h: 1.25, d: 18, mat: 'concrete', tile: 1.5, tint: GRN },
  );
}

/* --------------------------------------------- ground paint: paths + lawns */
// Every flat layer gets its own height wherever layers overlap, so two top
// faces never share a plane (that shared plane is what flickers).
add(
  // promenade cross: the horizontal arm stops at the vertical one
  { kind: 'box', x: 0, y: 0, z: 0, w: 7, h: 0.04, d: HZ * 2 - 4, mat: 'asphalt', tile: 2, collide: false, castShadow: false },
  { kind: 'box', x: -48.75, y: 0, z: 0, w: 90.5, h: 0.04, d: 7, mat: 'asphalt', tile: 2, collide: false, castShadow: false },
  { kind: 'box', x: 48.75, y: 0, z: 0, w: 90.5, h: 0.04, d: 7, mat: 'asphalt', tile: 2, collide: false, castShadow: false },
);
for (const [lx, lz, w, d] of [
  [-46, -40, 34, 26], [46, 40, 34, 26],
  [-46, 40, 34, 26], [46, -40, 34, 26],
]) {
  add({ kind: 'box', x: lx, y: 0, z: lz, w, h: 0.02, d, mat: 'tile', tile: 2, tint: LAWN, collide: false, castShadow: false });
}
// coloured rubber pads under the busy play zones sit proudly over the asphalt
add(
  { kind: 'box', x: 58, y: 0, z: 0, w: 30, h: 0.08, d: 24, mat: 'tile', tile: 1.5, tint: SKY, collide: false, castShadow: false },
  { kind: 'box', x: -58, y: 0, z: 0, w: 30, h: 0.08, d: 24, mat: 'tile', tile: 1.5, tint: SANDY, collide: false, castShadow: false },
  { kind: 'box', x: 0, y: 0, z: 0, w: 40, h: 0.08, d: 32, mat: 'tile', tile: 1.5, tint: MINT, collide: false, castShadow: false },
);

/* ------------------------------------------- centre: THE CASTLE keep */
// Four candy towers carry a high crenellated deck. Towers stop at the deck's
// underside and only their caps cross it, so no two tinted faces ever share
// a plane. Two stairs climb north/south into aligned parapet gaps; two
// slides drop east/west from the deck edge - outside the curtain walls,
// never through a doorframe, never under the deck.
const TOWER = [
  [-14, -10, RED], [14, 10, BLU],
  [14, -10, YEL], [-14, 10, PUR],
];
for (const [tx, tz, tint] of TOWER) {
  add(
    { kind: 'box', x: tx, y: 0, z: tz, w: 5, h: PLAT - 0.4, d: 5, mat: 'concrete', tile: 2, tint },
    { kind: 'box', x: tx, y: PLAT, z: tz, w: 5.6, h: 0.5, d: 5.6, mat: 'concrete', tile: 2, tint },
  );
  // merlon teeth on the tower caps
  for (const [mx, mz] of [[-2.2, 0], [2.2, 0], [0, -2.2], [0, 2.2]]) {
    add({ kind: 'box', x: tx + mx, y: PLAT + 0.5, z: tz + mz, w: 1.1, h: 0.75, d: 1.1, mat: 'concrete', tile: 1.5, tint });
  }
}
// curtain walls between the towers, tall arch doors on all four faces
add(
  { kind: 'wallDoor', x: 0, y: 0, z: -10, len: 23, h: PLAT - 0.4, thick: 0.8, mat: 'tile', axis: 'x', doorW: 4.2, doorH: 3.2, tile: 2, tint: CREAM },
  { kind: 'wallDoor', x: 0, y: 0, z: 10, len: 23, h: PLAT - 0.4, thick: 0.8, mat: 'tile', axis: 'x', doorW: 4.2, doorH: 3.2, tile: 2, tint: CREAM },
  { kind: 'wallDoor', x: -14, y: 0, z: 0, len: 15, h: PLAT - 0.4, thick: 0.8, mat: 'tile', axis: 'z', doorW: 4.2, doorH: 3.2, tile: 2, tint: CREAM },
  { kind: 'wallDoor', x: 14, y: 0, z: 0, len: 15, h: PLAT - 0.4, thick: 0.8, mat: 'tile', axis: 'z', doorW: 4.2, doorH: 3.2, tile: 2, tint: CREAM },
);
// the deck itself, reached by stairs north/south and slid off east/west
add({ kind: 'slab', x: 0, y: PLAT - 0.4, z: 0, w: 33, h: 0.4, d: 25, mat: 'concrete', tile: 2.5, tint: CREAM, walkway: true });
// stairs: top tread ends flush with the deck edge, centred on its gap
both((s) => add(
  { kind: 'stairs', x: -5.5 * s, y: 0, z: -19.0 * s, steps: 10, rise: PLAT / 10, run: 0.65, width: 3.4, mat: 'concrete', axis: 'z', dir: s, tint: s > 0 ? RED : BLU },
  // slides: solid wedges outside the walls, top tread flush with the deck edge
  { kind: 'ramp', x: 28.5 * s, y: 0, z: 0, len: 12, h: PLAT - 0.4, width: 3.6, mat: 'concrete', axis: 'x', dir: -s, tile: 1.5, tint: s > 0 ? YEL : PUR },
));
// deck parapet: knee walls with a 4.2 m gap exactly where each stair lands;
// segments stop at the side parapets so corners never overlap
both((s) => add(
  { kind: 'box', x: -11.65 * s, y: PLAT, z: -12.1 * s, w: 8.1, h: 1.0, d: 0.8, mat: 'concrete', tile: 2, tint: s > 0 ? RED : BLU },
  { kind: 'box', x: 6.15 * s, y: PLAT, z: -12.1 * s, w: 19.1, h: 1.0, d: 0.8, mat: 'concrete', tile: 2, tint: s > 0 ? RED : BLU },
));
// east/west parapets leave a 4.4 m gap centred on each slide
add(
  { kind: 'box', x: 16.1, y: PLAT, z: 7.35, w: 0.8, h: 1.0, d: 10.3, mat: 'concrete', tile: 2, tint: YEL },
  { kind: 'box', x: 16.1, y: PLAT, z: -7.35, w: 0.8, h: 1.0, d: 10.3, mat: 'concrete', tile: 2, tint: YEL },
  { kind: 'box', x: -16.1, y: PLAT, z: 7.35, w: 0.8, h: 1.0, d: 10.3, mat: 'concrete', tile: 2, tint: PUR },
  { kind: 'box', x: -16.1, y: PLAT, z: -7.35, w: 0.8, h: 1.0, d: 10.3, mat: 'concrete', tile: 2, tint: PUR },
);
// central keep on the deck with a flag pole
add(
  { kind: 'box', x: 0, y: PLAT, z: 0, w: 6, h: 3.2, d: 6, mat: 'concrete', tile: 2, tint: PNK },
  { kind: 'box', x: 0, y: PLAT + 3.2, z: 0, w: 6.8, h: 0.5, d: 6.8, mat: 'concrete', tile: 2, tint: PNK },
  { kind: 'box', x: 0, y: PLAT + 3.7, z: 0, w: 0.24, h: 3.4, d: 0.24, mat: 'metalDark' },
  { kind: 'box', x: 0.9, y: PLAT + 5.9, z: 0, w: 1.6, h: 1.0, d: 0.12, mat: 'concrete', tile: 1, tint: RED },
);
// crawl-space pillars and tunnel cover under the deck (5 m of headroom now)
both((s) => add(
  { kind: 'box', x: -6 * s, y: 0, z: -4 * s, w: 2.2, h: PLAT - 0.4, d: 2.2, mat: 'concrete', tile: 2, tint: MINT },
  { kind: 'box', x: 4 * s, y: 0, z: 5 * s, w: 4.6, h: 1.4, d: 1.6, mat: 'concrete', tile: 2, tint: s > 0 ? BLU : RED },
));

/* ----------------------------------- north / south: GATE and CAROUSEL */
// Entrance gate: two ticket booths and a rainbow arch over the promenade.
both((s) => add(
  { kind: 'room', x: 10 * s, y: 0, z: -66, w: 6, d: 5, h: 3.4, thick: IT, mat: 'concrete',
    tile: 2, tint: s > 0 ? YEL : GRN, n: 'open', s: 'window', e: 'window', w_: 'door',
    doorW: 2.4, doorH: 2.6, sillH: 1.0, winH: 1.2, roof: true, roofMat: 'concrete' },
  { kind: 'box', x: 3.6 * s, y: 0, z: -71, w: 1.1, h: 6.4, d: 1.1, mat: 'concrete', tile: 2, tint: s > 0 ? RED : BLU },
));
// rainbow arch bands
for (let i = 0; i < 6; i++) {
  add({ kind: 'box', x: 0, y: 6.4 + i * 0.55, z: -71, w: 10.5 - i * 1.5, h: 0.55, d: 1.4,
    mat: 'concrete', tile: 1, tint: BAY_TINTS[i] });
}
add({ kind: 'ceilingLight', x: 0, y: 6.05, z: -71, w: 2.6, d: 0.5, range: 14, power: 10 });

// Carousel: a striped canopy over a walkable platform ring of horse poles.
add(
  { kind: 'slab', x: 0, y: 0, z: 62, w: 17, h: 0.55, d: 17, mat: 'tile', tile: 2, tint: CREAM, walkway: true },
  { kind: 'box', x: 0, y: 0.55, z: 62, w: 0.7, h: 4.4, d: 0.7, mat: 'metal', tile: 1.5, tint: YEL },
);
// canopy: layered octagon with alternating pink / cream stripes
for (let i = 0; i < 8; i++) {
  add({ kind: 'box', x: -8.55 + i * 2.44, y: 4.95, z: 62, w: 2.44, h: 0.5, d: 19 - Math.abs(3.5 - i) * 4.4,
    mat: 'tile', tile: 1.5, tint: i % 2 ? CREAM : PNK, walkway: true });
}
add({ kind: 'box', x: 0, y: 5.45, z: 62, w: 3.2, h: 0.5, d: 3.2, mat: 'tile', tile: 1.5, tint: RED });
// horse poles around the ring, alternating colours
const HORSE_TINTS = [RED, YEL, GRN, BLU, PUR, PNK];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  const px = Math.round(Math.cos(a) * 6.0 * 2) / 2;
  const pz = 62 + Math.round(Math.sin(a) * 6.0 * 2) / 2;
  add(
    { kind: 'box', x: px, y: 0.55, z: pz, w: 0.16, h: 4.4, d: 0.16, mat: 'metal', tile: 1 },
    { kind: 'box', x: px, y: 1.5, z: pz, w: 0.85, h: 0.75, d: 0.5, mat: 'concrete', tile: 1, tint: HORSE_TINTS[i] },
    { kind: 'box', x: px, y: 2.25, z: pz - 0.05, w: 0.35, h: 0.45, d: 0.6, mat: 'concrete', tile: 1, tint: HORSE_TINTS[i] },
  );
}
add(
  { kind: 'stairs', x: 0, y: 0, z: 52.1, steps: 2, rise: 0.28, run: 0.6, width: 4, mat: 'concrete', axis: 'z', dir: 1, tint: CREAM },
  { kind: 'ceilingLight', x: 0, y: 4.6, z: 62, w: 3.0, d: 0.6, range: 16, power: 11 },
);

/* --------------------------------- east / west: SWING PARK and SAND COVE */
// Swing park: three A-frame swings on the rubber pad, slide hill behind.
for (const sz of [-8, 0, 8]) {
  add(
    { kind: 'box', x: 52, y: 0, z: sz - 2.2, w: 0.35, h: 3.1, d: 0.35, mat: 'metal', tile: 1 },
    { kind: 'box', x: 52, y: 0, z: sz + 2.2, w: 0.35, h: 3.1, d: 0.35, mat: 'metal', tile: 1 },
    { kind: 'box', x: 52, y: 3.1, z: sz, w: 0.4, h: 0.3, d: 4.8, mat: 'metal', tile: 1 },
    // chains + seat, drawn only so shots pass through cleanly
    { kind: 'box', x: 52, y: 1.05, z: sz - 0.55, w: 0.07, h: 2.1, d: 0.07, mat: 'metalDark', collide: false, shadow: false },
    { kind: 'box', x: 52, y: 1.05, z: sz + 0.55, w: 0.07, h: 2.1, d: 0.07, mat: 'metalDark', collide: false, shadow: false },
    { kind: 'box', x: 52, y: 0.9, z: sz, w: 0.6, h: 0.14, d: 1.3, mat: 'concrete', tile: 1, tint: sz === 0 ? RED : YEL, collide: false },
  );
}
// Slide hill: two turf tiers. The blue slide is a solid wedge on the west
// flank; its treads deliberately sit a hand-width below the tier tops and
// off the tier faces, so no step edge ever shares a plane with the mound.
add(
  { kind: 'box', x: 66, y: 0, z: 0, w: 12, h: 1.5, d: 12, mat: 'concrete', tile: 2, tint: LAWN },
  { kind: 'box', x: 66, y: 1.5, z: 0, w: 8, h: 1.5, d: 8, mat: 'concrete', tile: 2, tint: LAWN },
  { kind: 'ramp', x: 53.3, y: 0, z: 0, len: 8.8, h: 2.9, width: 3.4, mat: 'concrete', axis: 'x', dir: 1, tile: 1.5, tint: BLU },
  { kind: 'stairs', x: 69.5, y: 0, z: 8.3, steps: 3, rise: 0.5, run: 0.62, width: 2.6, mat: 'concrete', axis: 'z', dir: -1, tint: YEL },
  { kind: 'stairs', x: 66, y: 1.5, z: 5.6, steps: 3, rise: 0.48, run: 0.62, width: 2.6, mat: 'concrete', axis: 'z', dir: -1, tint: YEL },
  // hilltop hut
  { kind: 'box', x: 66, y: 3.0, z: -1.4, w: 3.4, h: 2.3, d: 3.4, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: 66, y: 5.3, z: -1.4, w: 4.2, h: 0.5, d: 4.2, mat: 'concrete', tile: 1.5, tint: RED },
);
// Sand cove: timber frame, raised sand floor, castles and bucket barrels.
add({ kind: 'slab', x: -58, y: 0, z: 0, w: 26, h: 0.22, d: 20, mat: 'sand', tile: 1.5, walkway: true });
add(
  { kind: 'box', x: -58, y: 0, z: -10.2, w: 27, h: 0.5, d: 0.7, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -58, y: 0, z: 10.2, w: 27, h: 0.5, d: 0.7, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -71.2, y: 0, z: 0, w: 0.7, h: 0.5, d: 19.7, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -44.8, y: 0, z: 0, w: 0.7, h: 0.5, d: 19.7, mat: 'wood', tile: 1.5 },
);
both((s) => add(
  // stepped sandcastle
  { kind: 'box', x: -63 * s - (s < 0 ? 5 : 0), y: 0.22, z: 4 * s, w: 3.2, h: 1.1, d: 3.2, mat: 'sand', tile: 1 },
  { kind: 'box', x: -63 * s - (s < 0 ? 5 : 0), y: 1.32, z: 4 * s, w: 1.8, h: 0.8, d: 1.8, mat: 'sand', tile: 1 },
  { kind: 'box', x: -63 * s - (s < 0 ? 5 : 0), y: 2.12, z: 4 * s, w: 0.7, h: 0.6, d: 0.7, mat: 'sand', tile: 1 },
  { kind: 'barrel', x: -52 * s, y: 0.22, z: -5 * s, tint: s > 0 ? RED : BLU },
));
add(
  { kind: 'crateStack', x: -50, y: 0.22, z: 6, count: 2, size: 1.2, mat: 'crate' },
  { kind: 'box', x: -66, y: 0.22, z: -6.5, w: 2.6, h: 1.0, d: 1.2, mat: 'concrete', tile: 1.5, tint: GRN },
);

/* ---------------------------------- NE / SW: JUNGLE GYM and BLOCK YARD */
// Jungle gym: two deck platforms laced together by climbing frames.
add(
  { kind: 'slab', x: 56, y: MEZZ - 0.35, z: -46, w: 6, h: 0.35, d: 6, mat: 'metal', tile: 1.5, tint: YEL, walkway: true },
  { kind: 'slab', x: 68, y: MEZZ - 0.35, z: -54, w: 6, h: 0.35, d: 6, mat: 'metal', tile: 1.5, tint: BLU, walkway: true },
  // bridge rungs between the decks: solid catwalk with rail caps
  { kind: 'slab', x: 62, y: MEZZ - 0.35, z: -50, w: 8.4, h: 0.3, d: 2.2, mat: 'metal', tile: 1.5, tint: RED, walkway: true },
);
// chunky corner columns carry each deck so the frames read from the ground
for (const [cx, cz] of [[53.6, -43.6], [58.4, -43.6], [53.6, -48.4], [58.4, -48.4],
  [65.6, -51.6], [70.4, -51.6], [65.6, -56.4], [70.4, -56.4]]) {
  add({ kind: 'box', x: cx, y: 0, z: cz, w: 0.5, h: MEZZ - 0.35, d: 0.5, mat: 'concrete', tile: 1.5, tint: GRN });
}
// frame posts and top rails
for (const [fx, fz] of [[53, -43], [59, -43], [53, -49], [59, -49], [65, -51], [71, -51], [65, -57], [71, -57]]) {
  add({ kind: 'box', x: fx, y: 0, z: fz, w: 0.3, h: MEZZ + 0.9, d: 0.3, mat: 'metal', tile: 1, tint: GRN });
}
add(
  { kind: 'railing', x: 56, y: MEZZ, z: -43.2, len: 6, h: 0.95, mat: 'metal', axis: 'x' },
  { kind: 'railing', x: 68, y: MEZZ, z: -56.8, len: 6, h: 0.95, mat: 'metal', axis: 'x' },
  { kind: 'stairs', x: 56, y: 0, z: -38.7, steps: 6, rise: (MEZZ - 0.35) / 6, run: 0.62, width: 3, mat: 'metal', axis: 'z', dir: -1, tint: YEL },
  { kind: 'stairs', x: 68, y: 0, z: -61.3, steps: 6, rise: (MEZZ - 0.35) / 6, run: 0.62, width: 3, mat: 'metal', axis: 'z', dir: 1, tint: BLU },
  // monkey-bar ladder between the frames: draw-only rungs over a solid beam
  { kind: 'box', x: 62, y: MEZZ + 0.75, z: -50, w: 8.4, h: 0.18, d: 0.3, mat: 'metal', tile: 1, tint: PUR, collide: false },
);
// Block yard: giant toy bricks, some stacked into climbable cover.
both((s) => add(
  { kind: 'box', x: -52 * s, y: 0, z: 44 * s, w: 3.6, h: 2.4, d: 1.8, mat: 'concrete', tile: 1.5, tint: s > 0 ? RED : BLU },
  { kind: 'box', x: -58 * s, y: 0, z: 50 * s, w: 1.8, h: 1.2, d: 1.8, mat: 'concrete', tile: 1.5, tint: s > 0 ? YEL : GRN },
  { kind: 'box', x: -58 * s, y: 1.2, z: 50 * s, w: 1.8, h: 1.2, d: 1.8, mat: 'concrete', tile: 1.5, tint: s > 0 ? GRN : YEL },
  { kind: 'box', x: -64 * s, y: 0, z: 42 * s, w: 2.4, h: 3.4, d: 2.4, mat: 'concrete', tile: 1.5, tint: s > 0 ? PUR : PNK },
  { kind: 'crateStack', x: -48 * s, y: 0, z: 52 * s, count: 3, size: 1.15, mat: 'crate' },
));
// studded plate so the yard reads as one giant building mat
add({ kind: 'box', x: -56, y: 0, z: 48, w: 26, h: 0.08, d: 22, mat: 'tile', tile: 1, tint: GRN, collide: false, castShadow: false });

/* ---------------------------------- NW / SE: SWEET SHOP and TINY TOWN */
// Sweet shop: striped awning storefront, counter hall and a roof deck.
// The roof parapet is custom (not the room template's ring) so it can leave
// a gap exactly where the west stairs land.
add({ kind: 'room', x: -56, y: 0, z: -48, w: 16, d: 10, h: DECK - 0.4, thick: IT,
  mat: 'tile', tile: 2, tint: CREAM,
  n: 'window', s: 'door', e: 'door', w_: 'window',
  doorW: 3.4, doorH: 2.8, sillH: 1.0, winH: 1.3,
  roof: true, roofMat: 'concrete' });
// awning stripes over the south door
for (let i = 0; i < 6; i++) {
  add({ kind: 'box', x: -62.5 + i * 2.6, y: 3.1, z: -41.2, w: 2.6, h: 0.35, d: 2.6,
    mat: 'tile', tile: 1, tint: i % 2 ? CREAM : RED, collide: false });
}
add(
  { kind: 'box', x: -59.5, y: 0, z: -45.5, w: 6, h: 1.05, d: 1.4, mat: 'wood', tile: 1.5 },       // counter
  { kind: 'box', x: -49.5, y: 0, z: -50.5, w: 1.6, h: 2.2, d: 0.8, mat: 'concrete', tile: 1.5, tint: PNK }, // shelf
  { kind: 'box', x: -49.5, y: 0, z: -46.5, w: 1.6, h: 2.2, d: 0.8, mat: 'concrete', tile: 1.5, tint: MINT }, // shelf
  // west stairs: top tread overlaps the roof edge by a hand's width, landing
  // inside the parapet gap; rise stops a shade under the roof so the tread
  // and roof tops never share a plane
  { kind: 'stairs', x: -66.2, y: 0, z: -53.8, steps: 8, rise: 0.5, run: 0.6, width: 3, mat: 'concrete', axis: 'z', dir: 1, tint: SKY },
  { kind: 'ceilingLight', x: -56, y: DECK - 1.0, z: -48, w: 3.0, d: 0.6, range: 15, power: 10 },
);
// roof knee walls; the west pair leaves a 4 m gap over the stair landing
add(
  { kind: 'box', x: -56, y: DECK, z: -53.65, w: 17.7, h: 0.7, d: 0.4, mat: 'concrete', tile: 2, tint: RED },
  { kind: 'box', x: -56, y: DECK, z: -42.35, w: 17.7, h: 0.7, d: 0.4, mat: 'concrete', tile: 2, tint: RED },
  { kind: 'box', x: -47.35, y: DECK, z: -48, w: 0.4, h: 0.7, d: 11.7, mat: 'concrete', tile: 2, tint: RED },
  { kind: 'box', x: -64.65, y: DECK, z: -52.675, w: 0.4, h: 0.7, d: 2.35, mat: 'concrete', tile: 2, tint: RED },
  { kind: 'box', x: -64.65, y: DECK, z: -44.825, w: 0.4, h: 0.7, d: 5.35, mat: 'concrete', tile: 2, tint: RED },
);
// Tiny town: four candy playhouses forming a lane maze.
const HOUSES = [
  [50, 42, RED, 'door'], [60, 50, YEL, 'window'],
  [50, 56, GRN, 'door'], [64, 42, PUR, 'window'],
];
for (const [hx, hz, tint, face] of HOUSES) {
  add({ kind: 'room', x: hx, y: 0, z: hz, w: 6, d: 5, h: 3.0, thick: 0.5, mat: 'concrete',
    tile: 1.5, tint, n: 'open', s: 'open', e: face === 'door' ? 'door' : 'window', w_: face === 'door' ? 'window' : 'door',
    doorW: 2.2, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' });
}
add(
  { kind: 'wall', x: 57, y: 0, z: 39.4, len: 10, h: 1.3, thick: 0.5, mat: 'concrete', axis: 'x', tile: 1.5, tint: CREAM },
  { kind: 'wall', x: 55, y: 0, z: 53.4, len: 8, h: 1.3, thick: 0.5, mat: 'concrete', axis: 'x', tile: 1.5, tint: CREAM },
  { kind: 'box', x: 47.5, y: 0, z: 49, w: 1.2, h: 1.1, d: 5, mat: 'concrete', tile: 1.5, tint: PNK },
  // roof ramp against the purple house's east flank: the tread before last
  // already stands within stepping range of the roof, so the climb reads as
  // one continuous run
  { kind: 'ramp', x: 72.9, y: 0, z: 42, len: 5.5, h: 3.1, width: 2.8, mat: 'concrete', axis: 'x', dir: -1, tile: 1.5, tint: BLU },
);

/* -------------------------------------- lawn cover: houses, trains, toys */
// Four cottage playhouses anchor the empty mid-field corners.
add(
  { kind: 'room', x: -30, y: 0, z: -42, w: 6, d: 5, h: 3.0, thick: 0.5, mat: 'concrete',
    tile: 1.5, tint: RED, n: 'wall', s: 'door', e: 'window', w_: 'wall',
    doorW: 2.2, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' },
  { kind: 'room', x: 30, y: 0, z: 42, w: 6, d: 5, h: 3.0, thick: 0.5, mat: 'concrete',
    tile: 1.5, tint: BLU, n: 'door', s: 'wall', e: 'wall', w_: 'window',
    doorW: 2.2, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' },
  { kind: 'room', x: 30, y: 0, z: -42, w: 6, d: 5, h: 3.0, thick: 0.5, mat: 'concrete',
    tile: 1.5, tint: GRN, n: 'wall', s: 'door', e: 'wall', w_: 'window',
    doorW: 2.2, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' },
  { kind: 'room', x: -30, y: 0, z: 42, w: 6, d: 5, h: 3.0, thick: 0.5, mat: 'concrete',
    tile: 1.5, tint: YEL, n: 'door', s: 'wall', e: 'window', w_: 'wall',
    doorW: 2.2, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' },
);
// Toy trains parked on the SW / NE lawns: locomotive + two wagons. Bodies
// stay knee-high and buffer blocks bridge the gaps, so the whole consist
// climbs as cover: ground -> buffer -> wagon -> locomotive.
both((s) => add(
  { kind: 'box', x: -52 * s, y: 0, z: 30 * s, w: 3.0, h: 1.05, d: 1.6, mat: 'concrete', tile: 1.5, tint: s > 0 ? RED : PUR },
  { kind: 'box', x: -53 * s, y: 1.05, z: 30 * s, w: 1.2, h: 1.0, d: 1.4, mat: 'concrete', tile: 1.5, tint: s > 0 ? RED : PUR },
  { kind: 'box', x: -50.9 * s, y: 1.05, z: 30 * s, w: 0.35, h: 0.7, d: 0.35, mat: 'metalDark' },
  { kind: 'box', x: -55.8 * s, y: 0, z: 30 * s, w: 2.6, h: 1.05, d: 1.5, mat: 'concrete', tile: 1.5, tint: s > 0 ? YEL : PNK },
  { kind: 'box', x: -59 * s, y: 0, z: 30 * s, w: 2.6, h: 1.05, d: 1.5, mat: 'concrete', tile: 1.5, tint: s > 0 ? GRN : BLU },
  { kind: 'box', x: -49.9 * s, y: 0, z: 30 * s, w: 0.5, h: 0.5, d: 0.5, mat: 'metalDark' },
  { kind: 'box', x: -54.1 * s, y: 0, z: 30 * s, w: 0.5, h: 0.5, d: 0.5, mat: 'metalDark' },
  { kind: 'box', x: -57.4 * s, y: 0, z: 30 * s, w: 0.5, h: 0.5, d: 0.5, mat: 'metalDark' },
  { kind: 'box', x: -60.8 * s, y: 0, z: 30 * s, w: 0.5, h: 0.5, d: 0.5, mat: 'metalDark' },
));
// Picnic corner on the NW / SE lawns: table, benches, a parasol.
both((s) => add(
  { kind: 'box', x: -38 * s, y: 0.72, z: -32 * s, w: 2.0, h: 0.12, d: 1.0, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -38.75 * s, y: 0, z: -32 * s, w: 0.15, h: 0.72, d: 0.8, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -37.25 * s, y: 0, z: -32 * s, w: 0.15, h: 0.72, d: 0.8, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -38 * s, y: 0, z: -32.85 * s, w: 1.8, h: 0.4, d: 0.35, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -38 * s, y: 0, z: -31.15 * s, w: 1.8, h: 0.4, d: 0.35, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -36.4 * s, y: 0, z: -32 * s, w: 0.12, h: 2.4, d: 0.12, mat: 'metalDark' },
  { kind: 'box', x: -36.4 * s, y: 2.1, z: -32 * s, w: 2.2, h: 0.35, d: 2.2, mat: 'concrete', tile: 1, tint: s > 0 ? PNK : BLU },
));
// Ice-cream kiosks facing the lawns, striped awning over the counter.
add(
  { kind: 'room', x: 38, y: 0, z: -34, w: 5, d: 3.5, h: 2.8, thick: 0.4, mat: 'concrete',
    tile: 1.5, tint: CREAM, n: 'window', s: 'open', e: 'door', w_: 'wall',
    doorW: 2.0, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' },
  { kind: 'room', x: -38, y: 0, z: 34, w: 5, d: 3.5, h: 2.8, thick: 0.4, mat: 'concrete',
    tile: 1.5, tint: CREAM, n: 'open', s: 'window', e: 'wall', w_: 'door',
    doorW: 2.0, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' },
);
for (let i = 0; i < 3; i++) {
  add(
    { kind: 'box', x: 36.6 + i * 1.7, y: 2.6, z: -31.6, w: 1.7, h: 0.3, d: 1.4, mat: 'tile', tile: 1, tint: i % 2 ? CREAM : RED, collide: false },
    { kind: 'box', x: -36.6 - i * 1.7, y: 2.6, z: 31.6, w: 1.7, h: 0.3, d: 1.4, mat: 'tile', tile: 1, tint: i % 2 ? CREAM : BLU, collide: false },
  );
}
add(
  { kind: 'box', x: 38, y: 0, z: -32.9, w: 3.4, h: 1.0, d: 0.8, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: -38, y: 0, z: 32.9, w: 3.4, h: 1.0, d: 0.8, mat: 'wood', tile: 1.5 },
);
// Rainbow crawl tunnels: standing-height arches across the castle approaches.
both((s) => add(
  { kind: 'box', x: (22 - 1.1) * s, y: 0, z: -20 * s, w: 0.4, h: 1.9, d: 3.0, mat: 'concrete', tile: 1.5, tint: s > 0 ? RED : BLU },
  { kind: 'box', x: (22 + 1.1) * s, y: 0, z: -20 * s, w: 0.4, h: 1.9, d: 3.0, mat: 'concrete', tile: 1.5, tint: s > 0 ? RED : BLU },
  { kind: 'box', x: 22 * s, y: 1.9, z: -20 * s, w: 3.0, h: 0.4, d: 3.0, mat: 'concrete', tile: 1.5, tint: s > 0 ? YEL : GRN },
));
// Giant crayons stuck point-up into the ground.
both((s) => {
  const CRAYONS = [[15.6, 29.6, 2.2, RED], [16.8, 30.4, 1.8, YEL], [15.9, 31.0, 2.6, GRN]];
  const TWIN = [BLU, PUR, PNK];
  CRAYONS.forEach(([cx, cz, h, tint], i) => add(
    { kind: 'box', x: cx * s, y: 0, z: -cz * s, w: 0.5, h, d: 0.5, mat: 'concrete', tile: 1, tint: s > 0 ? tint : TWIN[i] },
    { kind: 'box', x: cx * s, y: h, z: -cz * s, w: 0.3, h: 0.45, d: 0.3, mat: 'concrete', tile: 1, tint: CREAM },
  ));
});
// Mushroom stools scattered on the lawns.
for (const [mx, mz, tint, twin] of [[44, 30, RED, BLU], [47, 33, YEL, GRN]]) {
  for (const s of [1, -1]) {
    add(
      { kind: 'box', x: mx * s, y: 0, z: -mz * s, w: 0.45, h: 0.6, d: 0.45, mat: 'concrete', tile: 1, tint: CREAM },
      { kind: 'box', x: mx * s, y: 0.6, z: -mz * s, w: 1.2, h: 0.4, d: 1.2, mat: 'concrete', tile: 1, tint: s > 0 ? tint : twin },
    );
  }
}
// Letter cubes, some stacked.
add(
  { kind: 'box', x: 36, y: 0, z: -14, w: 1.5, h: 1.5, d: 1.5, mat: 'concrete', tile: 1.5, tint: RED },
  { kind: 'box', x: -36, y: 0, z: 14, w: 1.5, h: 1.5, d: 1.5, mat: 'concrete', tile: 1.5, tint: BLU },
  { kind: 'box', x: 40, y: 0, z: 12, w: 1.5, h: 1.5, d: 1.5, mat: 'concrete', tile: 1.5, tint: YEL },
  { kind: 'box', x: 40.3, y: 1.5, z: 12.2, w: 1.3, h: 1.3, d: 1.3, mat: 'concrete', tile: 1.5, tint: GRN },
  { kind: 'box', x: -40, y: 0, z: -12, w: 1.5, h: 1.5, d: 1.5, mat: 'concrete', tile: 1.5, tint: PUR },
  { kind: 'box', x: -40.3, y: 1.5, z: -12.2, w: 1.3, h: 1.3, d: 1.3, mat: 'concrete', tile: 1.5, tint: PNK },
  { kind: 'box', x: 12, y: 0, z: -52, w: 1.5, h: 1.5, d: 1.5, mat: 'concrete', tile: 1.5, tint: GRN },
  { kind: 'box', x: -12, y: 0, z: 52, w: 1.5, h: 1.5, d: 1.5, mat: 'concrete', tile: 1.5, tint: YEL },
);
// L-shaped hedge corners breaking the mid north / south sightlines.
both((s) => add(
  { kind: 'box', x: 20 * s, y: 0, z: -53 * s, w: 6, h: 1.25, d: 1.2, mat: 'concrete', tile: 1.5, tint: GRN },
  { kind: 'box', x: 17.6 * s, y: 0, z: -55.4 * s, w: 1.2, h: 1.25, d: 6, mat: 'concrete', tile: 1.5, tint: GRN },
));
// Spring riders: a metal spring under a bright animal shell.
both((s) => add(
  { kind: 'box', x: 14 * s, y: 0, z: -36 * s, w: 0.18, h: 0.5, d: 0.18, mat: 'metalDark' },
  { kind: 'box', x: 14 * s, y: 0.5, z: -36 * s, w: 0.9, h: 0.6, d: 0.45, mat: 'concrete', tile: 1, tint: s > 0 ? RED : YEL },
));

/* --------------------------- attractions: wheels, pens, arenas, stages */
// Ferris wheels over the NE / SW corners. The wheel is draw-only dressing
// (like the balloon spheres); the platform, A-frame pylons and queue rails
// are the actual cover.
for (const s of [1, -1]) {
  const cx = 82 * s, cz = -64 * s;
  add(
    { kind: 'box', x: cx, y: 0, z: cz, w: 10, h: 0.3, d: 6, mat: 'tile', tile: 2, tint: s > 0 ? SKY : PNK, walkway: true },
    { kind: 'box', x: cx - 2.8, y: 0, z: cz, w: 0.5, h: 7.5, d: 0.5, mat: 'metalDark' },
    { kind: 'box', x: cx + 2.8, y: 0, z: cz, w: 0.5, h: 7.5, d: 0.5, mat: 'metalDark' },
    { kind: 'box', x: cx, y: 7.5, z: cz, w: 6.2, h: 0.5, d: 0.6, mat: 'metalDark' },
    { kind: 'box', x: cx, y: 0.3, z: cz - 2.2, w: 6, h: 0.8, d: 0.3, mat: 'wood', tile: 1.5 },
    { kind: 'box', x: cx, y: 0.3, z: cz + 2.2, w: 6, h: 0.8, d: 0.3, mat: 'wood', tile: 1.5 },
  );
  // chunky pixel wheel: hub, cross spokes, eight rim pods, four gondolas
  const wy = 8.4;
  add(
    { kind: 'box', x: cx, y: wy - 0.4, z: cz, w: 0.8, h: 0.8, d: 0.8, mat: 'metalDark', collide: false },
    { kind: 'box', x: cx, y: wy - 5.2, z: cz, w: 0.3, h: 10.4, d: 0.3, mat: 'metalDark', collide: false },
    { kind: 'box', x: cx, y: wy - 0.15, z: cz, w: 10.4, h: 0.3, d: 0.3, mat: 'metalDark', collide: false },
  );
  const PODS = [[5.2, 0], [-5.2, 0], [0, 5.2], [0, -5.2], [3.7, 3.7], [-3.7, -3.7], [3.7, -3.7], [-3.7, 3.7]];
  PODS.forEach(([px, py], i) => {
    add({ kind: 'box', x: cx + px, y: wy + py - 0.45, z: cz, w: 0.9, h: 0.9, d: 0.9,
      mat: 'concrete', tile: 1, tint: BAY_TINTS[i % 6], collide: false });
  });
  [[3.7, 3.7, RED], [-3.7, -3.7, YEL], [3.7, -3.7, GRN], [-3.7, 3.7, BLU]].forEach(([px, py, tint]) => {
    add({ kind: 'box', x: cx + px, y: wy + py - 1.75, z: cz, w: 1.1, h: 0.9, d: 0.9,
      mat: 'concrete', tile: 1, tint, collide: false });
  });
}
// Funhouses: big zigzag halls anchoring the NW / SE corners.
for (const s of [1, -1]) {
  const cx = -60 * s, cz = -66 * s;
  const tint = s > 0 ? PNK : MINT;
  add(
    { kind: 'room', x: cx, y: 0, z: cz, w: 14, d: 10, h: 4.5, thick: 0.6, mat: 'concrete',
      tile: 2, tint, n: 'door', s: 'door', e: 'window', w_: 'window',
      doorW: 3.0, doorH: 3.4, sillH: 1.1, winH: 1.3, roof: true, roofMat: 'concrete' },
    // interior zigzag: two offset walls force an S-path between the doors
    { kind: 'box', x: cx - 2, y: 0, z: cz, w: 0.4, h: 4.5, d: 6, mat: 'concrete', tile: 2, tint },
    { kind: 'box', x: cx + 3.5, y: 0, z: cz + (s > 0 ? 2 : -2), w: 0.4, h: 4.5, d: 5, mat: 'concrete', tile: 2, tint },
  );
  // striped canopies over both doors
  for (let i = 0; i < 4; i++) {
    add({ kind: 'box', x: cx - 2.6 + i * 1.75, y: 3.6, z: cz - 5.9, w: 1.75, h: 0.3, d: 1.4,
      mat: 'tile', tile: 1, tint: i % 2 ? CREAM : tint, collide: false });
    add({ kind: 'box', x: cx - 2.6 + i * 1.75, y: 3.6, z: cz + 5.9, w: 1.75, h: 0.3, d: 1.4,
      mat: 'tile', tile: 1, tint: i % 2 ? tint : CREAM, collide: false });
  }
}
// Pony pens on the SE / NW corners: wooden rails, blocky ponies, hay bales.
for (const s of [1, -1]) {
  const cx = 78 * s, cz = 62 * s;
  add(
    { kind: 'wall', x: cx, y: 0, z: cz - 4.5, len: 12, h: 1.1, thick: 0.3, mat: 'wood', axis: 'x', tile: 1.5 },
    { kind: 'wall', x: cx, y: 0, z: cz + 4.5, len: 12, h: 1.1, thick: 0.3, mat: 'wood', axis: 'x', tile: 1.5 },
    { kind: 'wall', x: cx + 6, y: 0, z: cz, len: 9, h: 1.1, thick: 0.3, mat: 'wood', axis: 'z', tile: 1.5 },
    // west side leaves a 2 m gate
    { kind: 'wall', x: cx - 6, y: 0, z: cz - 2.75, len: 3.5, h: 1.1, thick: 0.3, mat: 'wood', axis: 'z', tile: 1.5 },
    { kind: 'wall', x: cx - 6, y: 0, z: cz + 2.75, len: 3.5, h: 1.1, thick: 0.3, mat: 'wood', axis: 'z', tile: 1.5 },
  );
  const PONIES = [[cx - 2, cz - 2, 1, s > 0 ? CREAM : PUR], [cx + 2, cz + 1.5, -1, s > 0 ? PNK : CREAM]];
  for (const [px, pz, face, tint] of PONIES) {
    add(
      { kind: 'box', x: px, y: 0.5, z: pz, w: 1.6, h: 0.7, d: 0.7, mat: 'concrete', tile: 1, tint },
      { kind: 'box', x: px + face * 1.0, y: 1.0, z: pz, w: 0.45, h: 0.5, d: 0.45, mat: 'concrete', tile: 1, tint },
    );
    for (const [lx, lz] of [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]]) {
      add({ kind: 'box', x: px + lx, y: 0, z: pz + lz, w: 0.16, h: 0.5, d: 0.16, mat: 'metalDark' });
    }
  }
  add(
    { kind: 'box', x: cx + 3.5 * s, y: 0, z: cz - 3 * s, w: 1.0, h: 0.7, d: 1.0, mat: 'concrete', tile: 1, tint: YEL },
    { kind: 'box', x: cx + 4.2 * s, y: 0, z: cz - 2.2 * s, w: 1.0, h: 0.7, d: 1.0, mat: 'concrete', tile: 1, tint: YEL },
  );
}
// Bumper car arenas straddling the promenade north and south of the castle.
for (const s of [1, -1]) {
  const cz = 40 * s;
  add(
    // platform apron extends 0.5 m past the rails on every side so no rail
    // face is ever coplanar with the platform edge
    { kind: 'box', x: 0, y: 0, z: cz, w: 17, h: 0.15, d: 13, mat: 'tile', tile: 2, tint: s > 0 ? SKY : PUR, walkway: true },
    { kind: 'wall', x: 0, y: 0, z: cz - 5.8, len: 16, h: 0.8, thick: 0.4, mat: 'wood', axis: 'x', tile: 1.5 },
    { kind: 'wall', x: 0, y: 0, z: cz + 5.8, len: 16, h: 0.8, thick: 0.4, mat: 'wood', axis: 'x', tile: 1.5 },
    // east and west rails leave 3 m entrances
    { kind: 'wall', x: 7.8, y: 0, z: cz - 3.9, len: 3.8, h: 0.8, thick: 0.4, mat: 'wood', axis: 'z', tile: 1.5 },
    { kind: 'wall', x: 7.8, y: 0, z: cz + 3.9, len: 3.8, h: 0.8, thick: 0.4, mat: 'wood', axis: 'z', tile: 1.5 },
    { kind: 'wall', x: -7.8, y: 0, z: cz - 3.9, len: 3.8, h: 0.8, thick: 0.4, mat: 'wood', axis: 'z', tile: 1.5 },
    { kind: 'wall', x: -7.8, y: 0, z: cz + 3.9, len: 3.8, h: 0.8, thick: 0.4, mat: 'wood', axis: 'z', tile: 1.5 },
  );
  const CARS = s > 0 ? [RED, YEL, BLU, GRN] : [PNK, PUR, CREAM, MINT];
  [[-3, -2], [3, -2], [-3, 2], [3, 2]].forEach(([ox, oz], i) => {
    add(
      { kind: 'box', x: ox, y: 0.15, z: cz + oz, w: 1.4, h: 0.5, d: 1.0, mat: 'concrete', tile: 1, tint: CARS[i] },
      { kind: 'box', x: ox, y: 0.65, z: cz + oz - 0.4, w: 0.9, h: 0.45, d: 0.18, mat: 'concrete', tile: 1, tint: CARS[i] },
    );
  });
}
// Puppet theatres facing the castle from the gate lanes.
for (const s of [1, -1]) {
  const cx = -14 * s, cz = -52 * s;
  add(
    { kind: 'box', x: cx, y: 0, z: cz, w: 6, h: 0.6, d: 3.5, mat: 'wood', tile: 1.5, walkway: true },
    // front step: 0.28 up, then 0.32 onto the deck — climbable
    { kind: 'box', x: cx, y: 0, z: cz - 2.05 * s, w: 2.4, h: 0.28, d: 0.7, mat: 'wood', tile: 1.5, walkway: true },
    // backdrop stands on the ground 5 cm behind the base, never interpenetrating it
    { kind: 'box', x: cx, y: 0, z: cz + 2.05 * s, w: 6, h: 3.2, d: 0.5, mat: 'concrete', tile: 1.5, tint: RED },
    // window pillars sit on the base, 5 cm inside its edge so no faces are coplanar
    { kind: 'box', x: cx - 2.7, y: 0.6, z: cz + 1.4 * s, w: 0.6, h: 2.6, d: 0.6, mat: 'concrete', tile: 1, tint: RED },
    { kind: 'box', x: cx + 2.7, y: 0.6, z: cz + 1.4 * s, w: 0.6, h: 2.6, d: 0.6, mat: 'concrete', tile: 1, tint: RED },
    { kind: 'box', x: cx - 2.9, y: 0, z: cz - 1.55 * s, w: 0.3, h: 3.2, d: 0.3, mat: 'wood', tile: 1 },
    { kind: 'box', x: cx + 2.9, y: 0, z: cz - 1.55 * s, w: 0.3, h: 3.2, d: 0.3, mat: 'wood', tile: 1 },
    { kind: 'box', x: cx, y: 3.2, z: cz + 0.15 * s, w: 7, h: 0.4, d: 4.0, mat: 'concrete', tile: 1.5, tint: CREAM },
  );
}
// Hedge mazes filling the east / west back lanes.
for (const s of [1, -1]) {
  const cx = 78 * s, cz = -20 * s;
  add(
    { kind: 'box', x: cx - 1 * s, y: 0, z: cz - 4.5 * s, w: 8, h: 1.35, d: 1.2, mat: 'concrete', tile: 1.5, tint: GRN },
    // corner joint kisses the first wall edge-to-edge, never overlapping it
    { kind: 'box', x: cx + 2 * s, y: 0, z: cz + 0.05 * s, w: 1.2, h: 1.35, d: 7.9, mat: 'concrete', tile: 1.5, tint: GRN },
    { kind: 'box', x: cx - 3 * s, y: 0, z: cz + 4.5 * s, w: 8, h: 1.35, d: 1.2, mat: 'concrete', tile: 1.5, tint: GRN },
  );
}
// Hotdog stands on the back lanes, counters facing the play areas.
for (const s of [1, -1]) {
  const cx = -82 * s, cz = -24 * s;
  const tint = s > 0 ? YEL : MINT;
  add(
    { kind: 'room', x: cx, y: 0, z: cz, w: 5, d: 4, h: 3.0, thick: 0.4, mat: 'concrete',
      tile: 1.5, tint, n: 'window', s: 'wall', e: s > 0 ? 'door' : 'wall', w_: s > 0 ? 'wall' : 'door',
      doorW: 2.0, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' },
    // serving counter under the window, clear of the door passage
    { kind: 'box', x: cx, y: 0, z: cz - 1.2 * s, w: 3.0, h: 1.0, d: 0.8, mat: 'wood', tile: 1.5 },
  );
  // awning stripes hang just outside the door face and stop 5 cm below the
  // wall top, so neither their sides nor their tops are coplanar with the room
  for (let i = 0; i < 3; i++) {
    add({ kind: 'box', x: cx + 3.2 * s, y: 2.65, z: cz - 1.7 + i * 1.7, w: 1.3, h: 0.3, d: 1.7,
      mat: 'tile', tile: 1, tint: i % 2 ? CREAM : tint, collide: false });
  }
}
// Two more cottages watching the east / west pads.
add(
  { kind: 'room', x: 58, y: 0, z: -24, w: 6, d: 5, h: 3.0, thick: 0.5, mat: 'concrete',
    tile: 1.5, tint: MINT, n: 'window', s: 'wall', e: 'wall', w_: 'door',
    doorW: 2.2, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' },
  { kind: 'room', x: -58, y: 0, z: 24, w: 6, d: 5, h: 3.0, thick: 0.5, mat: 'concrete',
    tile: 1.5, tint: PNK, n: 'wall', s: 'window', e: 'door', w_: 'wall',
    doorW: 2.2, doorH: 2.4, sillH: 0.9, winH: 1.1, roof: true, roofMat: 'concrete' },
);
// Wrapped presents: solid gift box, ribbon cross and a bow on top.
const GIFTS = [
  [46, -20, 1.8, RED, YEL], [-46, 20, 1.8, BLU, CREAM],
  [24, -44, 1.5, GRN, CREAM], [-24, 44, 1.5, PUR, YEL],
];
for (const [gx, gz, size, tint, ribbon] of GIFTS) {
  add(
    { kind: 'box', x: gx, y: 0, z: gz, w: size, h: size, d: size, mat: 'concrete', tile: 1.5, tint },
    // ribbon arms never cross: the z-running ribbon is split around the
    // x-running one, everything at one height, bow stacked on top
    { kind: 'box', x: gx, y: size, z: gz, w: size + 0.1, h: 0.14, d: 0.45, mat: 'concrete', tile: 1, tint: ribbon },
    { kind: 'box', x: gx, y: size, z: gz - 0.225 - (size - 0.35) / 4, w: 0.45, h: 0.14, d: (size - 0.35) / 2, mat: 'concrete', tile: 1, tint: ribbon },
    { kind: 'box', x: gx, y: size, z: gz + 0.225 + (size - 0.35) / 4, w: 0.45, h: 0.14, d: (size - 0.35) / 2, mat: 'concrete', tile: 1, tint: ribbon },
    { kind: 'box', x: gx, y: size + 0.14, z: gz, w: 0.5, h: 0.35, d: 0.5, mat: 'concrete', tile: 1, tint: ribbon },
  );
}
// Topiary animals guarding the castle approaches.
const TOPIARIES = [
  [20, 6, 1, 0], [-20, -6, -1, 0], [8, 20, 0, 1], [-8, -20, 0, -1],
];
for (const [tx, tz, fx, fz] of TOPIARIES) {
  add(
    { kind: 'box', x: tx, y: 0, z: tz, w: 1.6, h: 1.0, d: 1.0, mat: 'concrete', tile: 1.5, tint: GRN },
    { kind: 'box', x: tx + fx * 1.05, y: 0.5, z: tz + fz * 1.05, w: 0.7, h: 0.7, d: 0.7, mat: 'concrete', tile: 1, tint: GRN },
  );
}

/* ------------------------------------------------------- park furniture */
// benches along the promenade cross
both((s) => add(
  { kind: 'box', x: 5.5 * s, y: 0, z: -24 * s, w: 0.7, h: 0.55, d: 3.2, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: 6.1 * s, y: 0.55, z: -24 * s, w: 0.25, h: 0.7, d: 3.2, mat: 'wood', tile: 1.5 },
));
// more benches facing the east/west promenade
both((s) => add(
  { kind: 'box', x: 30 * s, y: 0, z: 5.6 * s, w: 3.2, h: 0.55, d: 0.7, mat: 'wood', tile: 1.5 },
  { kind: 'box', x: 30 * s, y: 0.55, z: 6.15 * s, w: 3.2, h: 0.7, d: 0.25, mat: 'wood', tile: 1.5 },
));
// balloon posts: bright spheres-on-sticks reading as fairground dressing
const BALLOONS = [
  [-24, -30, RED], [24, 30, YEL], [-30, 24, BLU], [30, -24, GRN],
];
for (const [bx, bz, tint] of BALLOONS) {
  add(
    { kind: 'box', x: bx, y: 0, z: bz, w: 0.12, h: 3.6, d: 0.12, mat: 'metalDark' },
    { kind: 'box', x: bx, y: 3.6, z: bz, w: 0.9, h: 0.9, d: 0.9, mat: 'concrete', tile: 1, tint, collide: false },
  );
}
// lamps on the main junctions
for (const [lx, lz] of [[-3.6, -30], [3.6, 30], [-40, 3.6], [40, -3.6]]) {
  add({ kind: 'lamp', x: lx, y: 0, z: lz, h: 6.2 });
}
// spawn-yard cover: light, spaced, never a fort
both((s) => add(
  { kind: 'box', x: -16 * s, y: 0, z: 68 * s, w: 2.4, h: 1.3, d: 1.8, mat: 'concrete', tile: 1.5, tint: s > 0 ? YEL : BLU },
  { kind: 'crateStack', x: 20 * s, y: 0, z: 70 * s, count: 2, size: 1.25, mat: 'crate' },
  { kind: 'box', x: 34 * s, y: 0, z: 66 * s, w: 1.8, h: 1.2, d: 1.8, mat: 'concrete', tile: 1.5, tint: s > 0 ? GRN : PNK },
));

/* ------------------------------------------------------- lighting */
// open to the sky like BLACKSITE; fixtures only live under roofs and canopies
add(
  { kind: 'ceilingLight', x: 0, y: PLAT - 1.0, z: 0, w: 3.4, d: 0.6, range: 16, power: 11 },
  { kind: 'ceilingLight', x: 62, y: MEZZ - 0.9, z: -50, w: 2.6, d: 0.5, range: 12, power: 8 },
  // roofed attraction interiors: funhouses, hotdog stands, cottages
  { kind: 'ceilingLight', x: -60, y: 4.1, z: -66, w: 3.0, d: 1.2, range: 13, power: 9 },
  { kind: 'ceilingLight', x: 60, y: 4.1, z: 66, w: 3.0, d: 1.2, range: 13, power: 9 },
  { kind: 'ceilingLight', x: -82, y: 2.62, z: -24, w: 1.4, d: 0.8, range: 7, power: 6 },
  { kind: 'ceilingLight', x: 82, y: 2.62, z: 24, w: 1.4, d: 0.8, range: 7, power: 6 },
  { kind: 'ceilingLight', x: 58, y: 2.62, z: -24, w: 1.6, d: 0.9, range: 8, power: 7 },
  { kind: 'ceilingLight', x: -58, y: 2.62, z: 24, w: 1.6, d: 0.9, range: 8, power: 7 },
);

export const PLAYLAND = {
  name: 'PLAYLAND',
  env: {
    indoor: false,
    bounds: { x: HX - 0.6, z: HZ - 0.6 },
    fog: { color: 0x9db4c6, near: 70, far: 280 },
  },
  parts,
};
