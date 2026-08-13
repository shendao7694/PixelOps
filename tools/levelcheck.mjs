// Structural audit of the arena: finds floating geometry, walls that seal off
// a room, decks you cannot step onto, and spawns that are inside something.
import { installDomStub } from './domstub.mjs';
installDomStub();

const THREE = await import('three');
const { buildTextures } = await import('../src/world/textures.js');
const { buildLevelFromParts } = await import('../src/world/levelbuild.js');
const { stockMap } = await import('../src/world/mapstore.js');
const { moveActor, positionFree, rampSurfaceAt } = await import('../src/core/collision.js');

const level = (() => { const m = stockMap(); return buildLevelFromParts(m.parts, buildTextures(), { env: m.env }); })();
const C = level.colliders.filter((c) => !c.isGround);
const problems = [];
const EPS = 0.02;

/* ---- 0. north bridge joints must not contain coplanar overlap ----------- */
// The two gate roofs and their bridge share one walking height. Any positive
// X/Z area shared by two of those 0.4 m slabs renders as Z-fighting, even
// though collision/navigation still appear valid.
const northDeckSlabs = C.filter((c) =>
  Math.abs(c.min.y - 3.68) < EPS
  && Math.abs(c.max.y - 4.08) < EPS
  && c.min.z < -24.3
  && c.max.z > -27.7);
for (let i = 0; i < northDeckSlabs.length; i++) {
  for (let j = i + 1; j < northDeckSlabs.length; j++) {
    const a = northDeckSlabs[i], b = northDeckSlabs[j];
    const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
    const overlapZ = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
    if (overlapX > EPS && overlapZ > EPS) {
      problems.push(`coplanar north bridge overlap ${overlapX.toFixed(2)}x${overlapZ.toFixed(2)}`);
    }
  }
}

/* ---- 1. unsupported geometry ------------------------------------------- */
// A raised box is sound if something carries it from below, or if it is tied
// into neighbouring structure at its own height (a door lintel spanning two
// wall segments is supported even though nothing sits directly beneath it).
const touches = (a, b, ax) => a.max[ax] > b.min[ax] - 0.05 && a.min[ax] < b.max[ax] + 0.05;
for (const c of C) {
  if (c.min.y <= 0.05) continue;
  const restsOn = C.some((o) => o !== c
    && Math.abs(o.max.y - c.min.y) <= 0.35
    && touches(o, c, 'x') && touches(o, c, 'z'));
  const tiedIn = C.some((o) => o !== c
    && o.min.y <= c.min.y + 0.35 && o.max.y >= c.min.y + 0.1
    && touches(o, c, 'x') && touches(o, c, 'z'));
  if (!restsOn && !tiedIn) {
    problems.push(`floating: box at (${c.min.x.toFixed(1)}, ${c.min.y.toFixed(2)}, ${c.min.z.toFixed(1)})`
      + ` size ${(c.max.x - c.min.x).toFixed(1)}x${(c.max.y - c.min.y).toFixed(1)}x${(c.max.z - c.min.z).toFixed(1)}`);
  }
}

/* ---- 2. spawns must be clear and land on the floor ---------------------- */
for (const team of ['blue', 'red']) {
  if (level.spawns[team].length !== 1) {
    problems.push(`team ${team} has ${level.spawns[team].length} spawn(s), expected exactly one`);
  }
  for (const p of level.spawns[team]) {
    if (!positionFree(level.colliders, p.x, p.y + 0.05, p.z, 0.36, 1.8)) {
      problems.push(`spawn ${team} (${p.x}, ${p.z}) is inside geometry`);
    }
    const expectedZ = (team === 'blue' ? 1 : -1) * (level.bounds.z - 0.5);
    if (Math.abs(p.x) > EPS || Math.abs(p.z - expectedZ) > EPS) {
      problems.push(`spawn ${team} (${p.x}, ${p.z}) is not at its rear-edge midpoint`);
    }
  }
}

/* ---- 3. navigation data must exist and be standable --------------------- */
// An empty waypoint list is a silent killer: the bots simply stand still, and
// nothing else in the game complains about it.
if (level.waypoints.length < 20) {
  problems.push(`only ${level.waypoints.length} patrol waypoints generated - bots will not roam`);
}
if (level.coverPoints.length < 8) {
  problems.push(`only ${level.coverPoints.length} cover points generated - bots cannot take cover`);
}
for (const [label, list] of [['waypoint', level.waypoints], ['cover', level.coverPoints]]) {
  for (const p of list) {
    if (!positionFree(level.colliders, p.x, p.y + 0.05, p.z, 0.36, 1.8)) {
      problems.push(`${label} (${p.x}, ${p.z}) is inside geometry`);
    }
  }
}

/* ---- 3b. stairs must not run through solid structure --------------------- */
// A stair's collision ramp (ghost boxes) overlapping a wall means the stair
// was placed into a building - it looks broken and the slope dead-ends.
for (const s of C) {
  if (!s.ghost) continue;
  for (const o of C) {
    if (o.ghost || o === s) continue;
    if (o.max.y - o.min.y < 1.2) continue;      // brushing low cover is fine
    const ox = Math.min(s.max.x, o.max.x) - Math.max(s.min.x, o.min.x);
    const oy = Math.min(s.max.y, o.max.y) - Math.max(s.min.y, o.min.y);
    const oz = Math.min(s.max.z, o.max.z) - Math.max(s.min.z, o.min.z);
    if (ox > 0.06 && oy > 0.06 && oz > 0.06) {
      problems.push(`stair intersects structure at (${((s.min.x + s.max.x) / 2).toFixed(1)}, `
        + `${((s.min.z + s.max.z) / 2).toFixed(1)}) overlap ${ox.toFixed(2)}x${oy.toFixed(2)}x${oz.toFixed(2)}`);
      break;
    }
  }
}

/* ---- 4. walkable-surface reachability ----------------------------------- */
// Flood fill from a courtyard spawn using the same movement rules the game
// uses, then report any raised deck no one can ever stand on.
const STEP = 0.55;
const R = 0.36, H = 1.8;
// Grid must be fine enough that one move up a staircase is a legal step:
// run 0.5 / rise 0.445, so 0.4 of travel climbs 0.36 < STEP.
const GRID = 0.4;
const key = (x, z, y) => `${Math.round(x / GRID)},${Math.round(z / GRID)},${Math.round(y / 0.4)}`;

// The arena is big enough that a linear scan per cell would take minutes, so
// colliders are bucketed into a coarse grid first.
const CELL = 4;
const buckets = new Map();
const bkey = (ix, iz) => ix * 100003 + iz;
for (const c of C) {
  for (let ix = Math.floor(c.min.x / CELL); ix <= Math.floor(c.max.x / CELL); ix++) {
    for (let iz = Math.floor(c.min.z / CELL); iz <= Math.floor(c.max.z / CELL); iz++) {
      const k = bkey(ix, iz);
      let list = buckets.get(k);
      if (!list) buckets.set(k, (list = []));
      list.push(c);
    }
  }
}

/** Every collider whose bucket the actor's footprint touches. */
function near(x, z, r) {
  const out = [];
  for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
    for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
      const list = buckets.get(bkey(ix, iz));
      if (list) out.push(...list);
    }
  }
  return out;
}

function groundHeightAt(x, z, fromY) {
  let best = 0;
  for (const c of near(x, z, R)) {
    if (c.ramp) {
      const y = rampSurfaceAt(c, x, z, R);
      if (y !== null && y <= fromY + STEP + 0.01 && y > best) best = y;
      continue;
    }
    if (x + R <= c.min.x || x - R >= c.max.x || z + R <= c.min.z || z - R >= c.max.z) continue;
    if (c.max.y <= fromY + STEP + 0.01 && c.max.y > best) best = c.max.y;
  }
  return best;
}

/** positionFree(), restricted to the colliders that can possibly matter. */
function freeAt(x, y, z) {
  for (const c of near(x, z, R)) {
    if (c.ramp) {
      const surface = rampSurfaceAt(c, x, z, R);
      if (surface !== null && y < surface - 1e-4 && y + H > c.min.y + 1e-4) return false;
      continue;
    }
    if (x + R <= c.min.x || x - R >= c.max.x || z + R <= c.min.z || z - R >= c.max.z) continue;
    if (y < c.max.y - 1e-4 && y + H > c.min.y + 1e-4) return false;
  }
  return true;
}

const start = level.spawns.blue[0];
const seen = new Set();
const queue = [[start.x, start.z, 0]];
seen.add(key(start.x, start.z, 0));
let visited = 0;
let head = 0;
while (head < queue.length && visited < 400000) {
  const [x, z, y] = queue[head++];
  visited++;
  for (const [dx, dz] of [[GRID, 0], [-GRID, 0], [0, GRID], [0, -GRID]]) {
    const nx = x + dx, nz = z + dz;
    if (Math.abs(nx) > level.bounds.x || Math.abs(nz) > level.bounds.z) continue;
    const ny = groundHeightAt(nx, nz, y);
    if (ny - y > STEP + 0.01) continue;              // too tall to step up
    if (!freeAt(nx, ny + 0.02, nz)) continue;
    const k = key(nx, nz, ny);
    if (seen.has(k)) continue;
    seen.add(k);
    queue.push([nx, nz, ny]);
  }
}

// Named landmarks that must be reachable on foot, at the right height.
// Every room has to be enterable and the centre platform has to be climbable,
// otherwise the map has sealed itself off somewhere.
const landmarks = [
  ['command bunker interior', 0, 0, 0],
  ['bunker roof deck', 0, 0, 4.32],
  ['north gate passage', 0, -26, 0],
  ['north gate bridge', 0, -26, 4.08],
  ['gate tower west interior', -12, -26, 0],
  ['gate tower east roof', 12, -26, 4.08],
  ['viaduct passage', 0, 26, 0],
  ['viaduct deck', 0, 26, 4.08],
  ['cargo hall interior', -52, 0, 0],
  ['cargo mezzanine', -62.5, 0, 2.64],
  ['cargo hall roof', -52, 0, 5.52],
  ['motor pool interior', 52, 0, 0],
  ['motor pool roof', 52, 0, 4.08],
  ['archive vault interior', -52, -44, 0],
  ['archive vault roof', -52, -44, 4.08],
  ['dispatch dock interior', 52, 44, 0],
  ['dispatch dock roof', 52, 44, 4.08],
  ['dock apron', 39, 38.75, 1.1],
  ['tank farm catwalk', 51, -46, 3.3],
  ['foundry catwalk', -51, 46, 3.3],
  ['guard post north', -28, -18, 0],
  ['south kiosk', 28, 18, 0],
  ['west back lane', -72, 0, 0],
  ['east back lane', 72, 0, 0],
  ['north spawn yard', 8, -58, 0],
  ['south spawn yard', -8, 58, 0],
  ['far corner NW', -74, -62, 0],
  ['far corner SE', 74, 62, 0],
];
const cells = [...seen].map((k) => k.split(',').map(Number));
for (const [name, lx, lz, ly] of landmarks) {
  const hit = cells.some(([gx, gz, gy]) =>
    Math.abs(gx * GRID - lx) < 2.4 && Math.abs(gz * GRID - lz) < 2.4 && Math.abs(gy * 0.4 - ly) < 0.45);
  if (!hit) problems.push(`unreachable on foot: ${name} (${lx}, ${lz}) at height ${ly}`);
}

// Every surface the level author tagged as a walkway must be stood on. Roofs
// of solid blocks, parapets and window sills are deliberately not tagged.
for (const c of C) {
  if (!c.walkway || c.max.y < 0.5) continue;
  const reached = cells.some(([gx, gz, gy]) => {
    const x = gx * GRID, z = gz * GRID, y = gy * 0.4;
    return Math.abs(y - c.max.y) < 0.45
      && x > c.min.x - 0.5 && x < c.max.x + 0.5 && z > c.min.z - 0.5 && z < c.max.z + 0.5;
  });
  if (!reached) {
    problems.push(`walkway never reached: top y=${c.max.y.toFixed(2)} at`
      + ` (${((c.min.x + c.max.x) / 2).toFixed(1)}, ${((c.min.z + c.max.z) / 2).toFixed(1)})`);
  }
}

/* ---- report ------------------------------------------------------------- */
console.log(`\nlevel audit: ${C.length} colliders, ${seen.size} walkable cells reached\n`);
if (problems.length) {
  const shown = problems.slice(0, 40);
  for (const p of shown) console.log('  ! ' + p);
  if (problems.length > shown.length) console.log(`  ... and ${problems.length - shown.length} more`);
  console.log(`\n${problems.length} structural problem(s)\n`);
  process.exit(1);
} else {
  console.log('  no structural problems found\n');
}
