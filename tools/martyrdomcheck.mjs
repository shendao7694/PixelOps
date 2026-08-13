import * as THREE from 'three';
import {
  MARTYRDOM_DROP_HEIGHT,
  MARTYRDOM_SOURCE,
  createMartyrdomGrenade,
} from '../src/game/martyrdom.js';
import {
  PASSIVE_IDS,
  PASSIVE_TUNING,
  createDefaultLoadout,
  setLoadoutSlot,
} from '../src/game/loadout.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nMartyrdom passive audit\n');

const defaults = createDefaultLoadout();
const origin = new THREE.Vector3(4, 2, -7);
const inactive = createMartyrdomGrenade({
  id: 'inactive',
  ownerId: 'player',
  team: 'blue',
  position: origin,
  loadout: defaults,
  now: 10,
});
check('a player without Martyrdom drops no death grenade', inactive === null);

const loadout = setLoadoutSlot(defaults, 'passives', 0, PASSIVE_IDS.MARTYRDOM);
const pve = createMartyrdomGrenade({
  id: 'pve-death',
  ownerId: 'player',
  team: 'blue',
  position: origin,
  loadout,
  now: 10,
});
check('PVE creates a stationary frag at the exact death point',
  pve?.kind === 'frag'
    && pve.source === MARTYRDOM_SOURCE
    && pve.position.x === origin.x
    && pve.position.z === origin.z
    && pve.position.y === origin.y + MARTYRDOM_DROP_HEIGHT
    && pve.velocity.lengthSq() === 0
    && origin.y === 2,
  JSON.stringify(pve));
check('the local fuse is exactly 1.3 seconds',
  PASSIVE_TUNING.martyrdomFuseSeconds === 1.3
    && Math.abs(pve.detonateAt - 11.3) < 1e-9);

const pvp = createMartyrdomGrenade({
  id: 'pvp-death',
  ownerId: 'server-player',
  team: 'red',
  position: origin,
  loadout,
  now: 5000,
  timeUnitsPerSecond: 1000,
});
check('the authoritative server clock receives the same 1.3-second fuse',
  pvp.detonateAt === 6300
    && pvp.team === 'red'
    && pvp.impactFused === false);

if (failures) {
  console.error(`\n${failures} Martyrdom check(s) failed`);
  process.exit(1);
}
console.log('\nMartyrdom passive verified\n');
