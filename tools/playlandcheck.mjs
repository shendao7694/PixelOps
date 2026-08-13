// Children's-playland map audit: the second arena must scale correctly,
// stay inside its own walls, keep the shared art direction (tinted parts),
// and remain fully navigable for bots.
import { installDomStub } from './domstub.mjs';
installDomStub();

const { buildTextures } = await import('../src/world/textures.js');
const { buildLevelFromParts, findPath } = await import('../src/world/levelbuild.js');
const { loadMap, MAP_REGISTRY, DEFAULT_MAP_ID, MAP_IDS } = await import('../src/world/mapstore.js');

const problems = [];

/* ---- registry ------------------------------------------------------------ */
if (MAP_IDS.length < 2) problems.push(`registry holds ${MAP_IDS.length} maps, expected at least 2`);
if (!MAP_REGISTRY.facility || !MAP_REGISTRY.playland) problems.push('facility or playland missing from registry');
if (DEFAULT_MAP_ID !== 'facility') problems.push('pvp default map drifted away from facility');

const textures = buildTextures();
const build = (id) => { const m = loadMap(id); return buildLevelFromParts(m.parts, textures, { env: m.env }); };
const base = build('facility');
const pl = build('playland');

/* ---- 1.2x scale ----------------------------------------------------------- */
const scaleX = pl.bounds.x / base.bounds.x;
const scaleZ = pl.bounds.z / base.bounds.z;
console.log(`\nplayland audit: bounds ${pl.bounds.x * 2}x${pl.bounds.z * 2} vs facility ${base.bounds.x * 2}x${base.bounds.z * 2}`);
if (Math.abs(scaleX - 1.2) > 0.02 || Math.abs(scaleZ - 1.2) > 0.02) {
  problems.push(`playland should be 1.2x the arena, got ${scaleX.toFixed(3)}x / ${scaleZ.toFixed(3)}x`);
}

/* ---- everything stays inside the perimeter -------------------------------- */
// The boundary itself (2m brick walls + their mint coping) legitimately sits
// outside the playable bounds; anything may reach the walls' outer face, but
// never beyond it.
const WALL_REACH = 2.7;
for (const c of pl.colliders) {
  if (Math.abs(c.min.x) > pl.bounds.x + WALL_REACH || Math.abs(c.max.x) > pl.bounds.x + WALL_REACH
    || Math.abs(c.min.z) > pl.bounds.z + WALL_REACH || Math.abs(c.max.z) > pl.bounds.z + WALL_REACH) {
    problems.push(`collider escapes the walls at (${c.min.x.toFixed(1)}, ${c.min.z.toFixed(1)})`);
    break;
  }
}

/* ---- shared art direction: colourful tinted parts ------------------------- */
const tinted = pl.solids.filter((s) => s.material.color && s.material.color.getHex() !== 0xffffff);
const hues = new Set(tinted.map((s) => s.material.color.getHex()));
console.log(`  tinted parts ${tinted.length} across ${hues.size} hues`);
if (tinted.length < 60) problems.push(`only ${tinted.length} tinted parts - the park lost its colours`);
if (hues.size < 6) problems.push(`only ${hues.size} distinct tints`);

/* ---- a tall landmark must exist -------------------------------------------- */
const top = Math.max(...pl.colliders.filter((c) => !c.isGround).map((c) => c.max.y));
if (top < 5.5) problems.push(`tallest structure is only ${top.toFixed(2)}m - no castle tower?`);

/* ---- spawns ---------------------------------------------------------------- */
// Same convention the facility map (and levelcheck) uses: one spawn per team
// at the rear-edge midpoint, half a metre inside the boundary.
for (const team of ['blue', 'red']) {
  if (!pl.spawns[team].length) problems.push(`team ${team} has no spawn`);
  for (const p of pl.spawns[team]) {
    const expectedZ = (team === 'blue' ? 1 : -1) * (pl.bounds.z - 0.5);
    if (Math.abs(p.x) > 0.02 || Math.abs(p.z - expectedZ) > 0.02) {
      problems.push(`spawn ${team} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) is not at its rear-edge midpoint`);
    }
  }
}

/* ---- navigation -------------------------------------------------------------- */
const g = pl.navGraph;
const seen = new Set([0]);
const queue = [0];
while (queue.length) {
  const c = queue.shift();
  for (const nb of g.edges[c]) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
}
const reachPct = (seen.size / g.nodes.length) * 100;
console.log(`  nav nodes ${g.nodes.length}, connected ${reachPct.toFixed(1)}%`);
if (reachPct < 90) problems.push(`nav graph fragmented: only ${reachPct.toFixed(1)}% connected`);

let ok = 0;
for (let i = 0; i < 60; i++) {
  const a = g.nodes[(i * 37) % g.nodes.length];
  const b = g.nodes[(i * 71 + 13) % g.nodes.length];
  if (findPath(g, a.x, a.z, b.x, b.z)) ok++;
}
console.log(`  random routes solved ${ok}/60`);
if (ok < 57) problems.push(`pathfinding failed ${60 - ok}/60 random routes`);

const bs = pl.spawns.blue[0], rs = pl.spawns.red[0];
if (!findPath(g, bs.x, bs.z, rs.x, rs.z)) problems.push('no route from blue spawn to red spawn');
for (const [label, x, z] of [['carousel', 0, -34], ['castle', 0, 26], ['candy shop', -52, 48]]) {
  if (!findPath(g, bs.x, bs.z, x, z)) problems.push(`no route from blue spawn to the ${label}`);
}

/* ---- report ------------------------------------------------------------------ */
console.log('');
if (problems.length) {
  for (const p of problems) console.log('  ! ' + p);
  console.log(`\n${problems.length} playland problem(s)\n`);
  process.exit(1);
} else {
  console.log('  playland ok\n');
}
