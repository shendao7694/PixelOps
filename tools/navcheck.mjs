// AI navigation audit. Bots standing still is a silent failure - nothing else
// in the game errors when the nav graph is empty or fragmented, so check it.
import { installDomStub } from './domstub.mjs';
installDomStub();

const { buildTextures } = await import('../src/world/textures.js');
const { buildLevelFromParts, findPath } = await import('../src/world/levelbuild.js');
const { stockMap } = await import('../src/world/mapstore.js');
const { Bot } = await import('../src/game/bot.js');

const textures = buildTextures();
const map = stockMap();
const level = buildLevelFromParts(map.parts, textures, { env: map.env });
const g = level.navGraph;
const problems = [];

console.log(`\nnav audit: ${map.name}\n`);

/* ---- 1. the graph must be connected -------------------------------------- */
const seen = new Set([0]);
const queue = [0];
while (queue.length) {
  const c = queue.shift();
  for (const nb of g.edges[c]) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
}
const reachPct = (seen.size / g.nodes.length) * 100;
console.log(`  nodes ${g.nodes.length}, largest connected component ${seen.size} (${reachPct.toFixed(1)}%)`);
if (g.nodes.length < 100) problems.push(`nav graph has only ${g.nodes.length} nodes`);
if (reachPct < 90) problems.push(`nav graph is fragmented: only ${reachPct.toFixed(1)}% of nodes interconnect`);

/* ---- 2. paths must exist between random pairs ---------------------------- */
let ok = 0;
for (let i = 0; i < 60; i++) {
  const a = g.nodes[(i * 37) % g.nodes.length];
  const b = g.nodes[(i * 71 + 13) % g.nodes.length];
  if (findPath(g, a.x, a.z, b.x, b.z)) ok++;
}
console.log(`  random routes solved ${ok}/60`);
if (ok < 57) problems.push(`pathfinding failed ${60 - ok}/60 random routes`);

/* ---- 3. bots must actually cover ground --------------------------------- */
const bots = [];
for (let i = 0; i < 8; i++) {
  const team = i % 2 ? 'blue' : 'red';
  const b = new Bot({ team, level, textures, index: i });
  b.spawn(level.spawns[team][i % level.spawns[team].length].clone());
  bots.push(b);
}
const world = { time: 0, findTarget: () => null, botShoot: () => {} };
const visited = bots.map(() => new Set());
let stuckFrames = 0;
const FRAMES = 60 * 60;
for (let s = 0; s < FRAMES; s++) {
  world.time = s / 60;
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    const before = b.position.clone();
    b.update(1 / 60, world);
    visited[i].add(`${Math.round(b.position.x / 4)},${Math.round(b.position.z / 4)}`);
    if (s > 60 && before.distanceTo(b.position) < 0.005) stuckFrames++;
  }
}
const coverage = visited.map((v) => v.size);
const worst = Math.min(...coverage);
const stuckPct = (stuckFrames / (FRAMES * bots.length)) * 100;
console.log(`  60s patrol: coverage per bot ${worst}-${Math.max(...coverage)} cells, `
  + `idle frames ${stuckPct.toFixed(1)}%`);
if (worst < 10) problems.push(`a bot only reached ${worst} map cells in 60s - it is stuck`);
if (stuckPct > 8) problems.push(`bots spend ${stuckPct.toFixed(1)}% of frames not moving`);

/* ---- report -------------------------------------------------------------- */
console.log('');
if (problems.length) {
  for (const p of problems) console.log('  ! ' + p);
  console.log(`\n${problems.length} navigation problem(s)\n`);
  process.exit(1);
} else {
  console.log('  navigation ok\n');
}
