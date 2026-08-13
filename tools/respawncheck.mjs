import assert from 'node:assert/strict';
import { automaticRespawnReady } from '../src/game/respawn.js';

console.log('\nRespawn policy checks\n');

const corpse = { settled: 1 };

assert.equal(automaticRespawnReady({
  alive: false,
  deathAnimation: corpse,
  remaining: 0,
}), true);
console.log('  ok   an expired killed player automatically respawns');

assert.equal(automaticRespawnReady({
  alive: false,
  deathAnimation: corpse,
  remaining: 0,
  loadoutRequested: true,
}), false);
console.log('  ok   pressing Enter suppresses automatic respawn for loadout selection');

assert.equal(automaticRespawnReady({
  alive: false,
  deathAnimation: null,
  remaining: 0,
}), false);
console.log('  ok   a first-time undeployed room member never auto-spawns');

assert.equal(automaticRespawnReady({
  alive: false,
  deathAnimation: corpse,
  remaining: 0.01,
}), false);
assert.equal(automaticRespawnReady({
  alive: true,
  deathAnimation: corpse,
  remaining: -1,
}), false);
console.log('  ok   living players and active reinforcement timers cannot retrigger spawn');

console.log('\nRespawn policy verified\n');
