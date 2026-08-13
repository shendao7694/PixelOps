import {
  PVP_MAP_OPTIONS,
  isPvpMapOption,
  mapVoteCounts,
  resolveMapVote,
} from '../src/net/map-vote.js';
import {
  PVP_MAP_VOTE_DURATION_MS,
  PVP_MATCH_SCORE_LIMIT,
  PVP_ROOM_COUNT,
} from '../src/net/protocol.js';
import { WEAPON_DEFS } from '../src/game/weapons.js';

let failures = 0;
function check(name, condition) {
  if (condition) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}`); }
}

console.log('\nMap vote, scoring and recoil audit\n');
check('PVP has exactly three rooms', PVP_ROOM_COUNT === 3);
check('matches end at 75 team kills', PVP_MATCH_SCORE_LIMIT === 75);
check('map voting lasts exactly ten seconds', PVP_MAP_VOTE_DURATION_MS === 10_000);
check('all three shipped maps are offered once',
  PVP_MAP_OPTIONS.length === 3
  && new Set(PVP_MAP_OPTIONS.map(({ id }) => id)).size === 3
  && PVP_MAP_OPTIONS.every(({ id }) => isPvpMapOption(id)));

const votes = new Map([
  ['a', 'facility'], ['b', 'playland'], ['c', 'playland'], ['d', 'ruins'],
]);
check('live counts include every map',
  JSON.stringify(mapVoteCounts(votes))
    === JSON.stringify({ facility: 1, playland: 2, ruins: 1 }));
check('the highest vote wins', resolveMapVote(votes, () => 0).mapId === 'playland');
const tied = resolveMapVote(new Map([['a', 'facility'], ['b', 'ruins']]), () => 0.99);
check('ties are resolved through the supplied random draw',
  tied.tied.length === 2 && tied.mapId === 'ruins');

check('railgun deals a fixed 300 with no falloff',
  WEAPON_DEFS.railgun.damage === 300 && WEAPON_DEFS.railgun.minDamage === 1);
check('all requested firearms have upward aim recoil',
  ['rifle', 'smg', 'shotgun', 'sniper', 'machine_pistol', 'desert_eagle', 'railgun']
    .every((id) => WEAPON_DEFS[id].aimKickUp > 0));
check('recoil classes preserve the requested relative strengths',
  WEAPON_DEFS.smg.aimKickUp < WEAPON_DEFS.rifle.aimKickUp
  && WEAPON_DEFS.machine_pistol.aimKickUp < WEAPON_DEFS.rifle.aimKickUp
  && WEAPON_DEFS.shotgun.aimKickUp > WEAPON_DEFS.rifle.aimKickUp
  && WEAPON_DEFS.sniper.aimKickUp > WEAPON_DEFS.rifle.aimKickUp
  && WEAPON_DEFS.desert_eagle.aimKickUp > WEAPON_DEFS.rifle.aimKickUp
  && WEAPON_DEFS.railgun.aimKickUp > WEAPON_DEFS.sniper.aimKickUp);

if (failures) {
  console.error(`\n${failures} map-vote/scoring check(s) failed\n`);
  process.exit(1);
}
console.log('\nMap vote, scoring and recoil audit passed\n');
