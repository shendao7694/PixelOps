import {
  PVP_INPUT_PACKET_BYTES,
  createSnapshotDecodeState,
  decodeInputPacket,
  decodeSnapshotPacket,
  decodeThrowablePresentation,
  encodeInputPacket,
  encodeSnapshotPacket,
  throwablePresentationCode,
} from '../src/net/pvp-wire.js';
import { PVP_PROTOCOL, PVP_TICK_RATE } from '../src/net/protocol.js';
import { PvpClient } from '../src/net/pvp-client.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

function close(actual, expected, epsilon = 0.0002) {
  return Math.abs(actual - expected) <= epsilon;
}

console.log('\nPVP binary wire audit\n');

const input = {
  seq: 987654,
  moveX: -0.5,
  moveZ: 1,
  jump: true,
  crouch: false,
  slide: true,
  sprint: true,
  aim: false,
  trigger: true,
  reload: true,
  grenade: true,
  grenadePin: true,
  grenadeThrow: true,
  grenadeAim: true,
  meleeAttack: true,
  missileControl: true,
  missileBoost: true,
  interact: true,
  weapon: 'combat_knife',
  yaw: 2.345678,
  pitch: -0.456789,
};
const inputPacket = encodeInputPacket(input);
const decodedInput = decodeInputPacket(inputPacket);
check(`input packet is fixed at ${PVP_INPUT_PACKET_BYTES} bytes`,
  inputPacket.byteLength === PVP_INPUT_PACKET_BYTES,
  `${inputPacket.byteLength} bytes`);
check('input packet preserves controls, weapon and sequence',
  decodedInput.seq === input.seq
    && close(decodedInput.moveX, input.moveX, 1 / 127)
    && decodedInput.moveZ === input.moveZ
    && decodedInput.jump === input.jump
    && decodedInput.slide === input.slide
    && decodedInput.sprint === input.sprint
    && decodedInput.trigger === input.trigger
    && decodedInput.reload === input.reload
    && decodedInput.grenade === input.grenade
    && decodedInput.grenadePin === input.grenadePin
    && decodedInput.grenadeThrow === input.grenadeThrow
    && decodedInput.grenadeAim === input.grenadeAim
    && decodedInput.meleeAttack === input.meleeAttack
    && decodedInput.interact === input.interact
    && decodedInput.weapon === input.weapon
    && close(decodedInput.yaw, input.yaw)
    && close(decodedInput.pitch, input.pitch));
check('missile control routes the streamed look angles to the missile',
  decodedInput.missileControl === true
    && decodedInput.missileBoost === true
    && decodeInputPacket(encodeInputPacket({ ...input, missileControl: false }))
      .missileControl === false
    && decodeInputPacket(encodeInputPacket({
      ...input,
      trigger: false,
      missileBoost: false,
    })).missileBoost === false);
check('the appended machine-pistol weapon code round-trips through compact input',
  decodeInputPacket(encodeInputPacket({
    ...input,
    weapon: 'machine_pistol',
    missileControl: false,
    trigger: false,
  })).weapon === 'machine_pistol');
check('the appended Desert Eagle weapon code round-trips through compact input',
  decodeInputPacket(encodeInputPacket({
    ...input,
    weapon: 'desert_eagle',
    missileControl: false,
    trigger: false,
  })).weapon === 'desert_eagle');

const now = 1700000000000;
const ammo = {
  rifle: { mag: 27, reserve: 181 },
  smg: { mag: 32, reserve: 224 },
  shotgun: { mag: 7, reserve: 49 },
  sniper: { mag: 4, reserve: 31 },
  minigun: { mag: 1200, reserve: 0 },
  combat_knife: { mag: 0, reserve: 0 },
  laser_blade: { mag: 0, reserve: 0 },
  machine_pistol: { mag: 19, reserve: 120 },
  desert_eagle: { mag: 6, reserve: 35 },
};
const players = [
  {
    id: 'player-one01',
    name: 'ALPHA-1',
    team: 'blue',
    p: [1.125, 2.25, -3.5],
    v: [4.75, -0.125, 1.5],
    yaw: 1.25,
    pitch: -0.2,
    health: 72.25,
    maxHealth: 600,
    armor: 14.5,
    maxArmor: 215,
    alive: true,
    crouch: false,
    sprinting: true,
    sliding: false,
    grounded: true,
    aiming: true,
    invulnerable: true,
    juggernaut: true,
    weapon: 'rifle',
    throwableKind: 'incendiary',
    throwableState: 'aim',
    firing: 44,
    kills: 7,
    deaths: 3,
    score: 1250,
    respawnAt: 0,
  },
  {
    id: 'player-two02',
    name: 'KILO-2',
    team: 'red',
    p: [-12.25, 0.01, 21.75],
    v: [0, 0, 0],
    yaw: -2.5,
    pitch: 0.4,
    health: 0,
    maxHealth: 100,
    armor: 0,
    maxArmor: 65,
    alive: false,
    crouch: true,
    sprinting: false,
    sliding: true,
    grounded: false,
    aiming: false,
    invulnerable: false,
    juggernaut: false,
    weapon: 'sniper',
    throwableKind: 'molotov',
    throwableState: 'carry',
    firing: 8,
    kills: 2,
    deaths: 9,
    score: 400,
    respawnAt: now + 4321,
  },
];
const snapshot = {
  type: 'snapshot',
  protocol: PVP_PROTOCOL,
  tick: 123456,
  serverTime: now,
  room: { id: 'room-3', number: 3, players: 2, capacity: 12, round: 8 },
  match: {
    blueTickets: 42,
    redTickets: 37,
    maxTickets: 60,
    over: false,
    winner: null,
  },
  ack: 987654,
  you: {
    id: players[0].id,
    team: 'blue',
    readyActive: true,
    ammo,
    weapon: 'rifle',
    reloading: {
      weapon: 'rifle',
      startedAt: now - 625,
      endsAt: now + 1175,
    },
    kills: 7,
    deaths: 3,
    score: 1250,
    streak: 4,
    grenades: 1,
    voteKickCooldown: 73.25,
    streaks: {
      uav: 1,
      strike: 2,
      sentry: 1,
      cas: 3,
      firebomb: 2,
      attack_helicopter: 1,
      juggernaut: 1,
      railgun: 2,
      uavTime: 18.5,
      uavSweepSeq: 9,
      uavRevealTime: 0.4,
      sentryHp: 275.5,
    },
    uavMarks: [[3.5, 1.55, -8.25]],
  },
  players,
  voteKick: {
    id: 'vote-123',
    targetId: players[1].id,
    targetName: players[1].name,
    initiatorName: players[0].name,
    yes: 3,
    no: 1,
    required: 4,
    endsAt: now + 24500,
    yourVote: 'yes',
    canVote: false,
  },
  sentries: [{
    id: 'sentry-1',
    ownerId: players[0].id,
    team: 'blue',
    p: [5.25, 0, -4.75],
    yaw: 0.75,
    pitch: -0.15,
    health: 275.5,
    maxHealth: 350,
    targetId: players[1].id,
  }],
  uavDrones: [{
    id: 'uav-blue',
    team: 'blue',
    health: 500,
    maxHealth: 500,
  }, {
    id: 'uav-red',
    team: 'red',
    health: 123.45,
    maxHealth: 500,
  }],
  missiles: [{
    id: 'missile-1',
    ownerId: players[0].id,
    team: 'red',
    p: [12.5, 63.25, -7.75],
    yaw: 1.25,
    pitch: -0.875,
    diving: true,
  }],
  casRuns: [{
    id: 'cas-run-1',
    ownerId: players[0].id,
    team: 'blue',
    start: [-24.5, 18.25],
    end: [27.5, 18.25],
    startedAt: now - 875,
    seed: 0xdecafbad,
  }],
  firebombRuns: [{
    id: 'firebomb-run-1',
    ownerId: players[1].id,
    team: 'red',
    start: [-96, 14.5],
    end: [96, 14.5],
    startedAt: now - 1250,
  }],
  attackHelicopters: [{
    id: 'apache-1',
    ownerId: players[0].id,
    team: 'blue',
    call: [4.5, 0, -7.25],
    entryYaw: 2.25,
    startedAt: now - 5600,
    targetId: players[1].id,
    health: 637.4,
  }],
  airdrops: [{
    id: 'jug-drop-1',
    ownerId: players[0].id,
    team: 'blue',
    target: [8.25, 0, -14.5],
    yaw: 1.75,
    startedAt: now - 2400,
  }],
};

const state = createSnapshotDecodeState();
state.playerId = players[0].id;
const fullPacket = encodeSnapshotPacket(snapshot, {
  includeRoster: true,
  rosterVersion: 4,
});
const decoded = decodeSnapshotPacket(fullPacket, state);
check('full snapshot restores room, match and local authority',
  decoded.protocol === PVP_PROTOCOL
    && decoded.tick === snapshot.tick
    && decoded.serverTime === now
    && decoded.room.id === 'room-3'
    && decoded.room.round === 8
    && decoded.match.blueTickets === 42
    && decoded.ack === snapshot.ack
    && decoded.you.id === players[0].id
    && decoded.you.readyActive === true
    && decoded.you.ammo.rifle.mag === 27
    && decoded.you.ammo.machine_pistol.mag === 19
    && decoded.you.ammo.machine_pistol.reserve === 120
    && decoded.you.ammo.desert_eagle.mag === 6
    && decoded.you.ammo.desert_eagle.reserve === 35
    && decoded.you.reloading.startedAt === now - 625
    && decoded.you.reloading.endsAt === now + 1175
    && !Object.hasOwn(decoded.you, 'rank')
    && !Object.hasOwn(decoded.you, 'rankProgress')
    && decoded.you.grenades === 1
    && close(decoded.you.voteKickCooldown, 73.25));
const inactiveReadySnapshot = structuredClone(snapshot);
inactiveReadySnapshot.you.readyActive = false;
const inactiveReadyPacket = encodeSnapshotPacket(inactiveReadySnapshot, {
  includeRoster: true,
  rosterVersion: 4,
});
const inactiveReadyState = createSnapshotDecodeState();
inactiveReadyState.playerId = players[0].id;
const inactiveReadyDecoded = decodeSnapshotPacket(
  inactiveReadyPacket,
  inactiveReadyState
);
check('the spawn buff reuses a spare local-team bit at zero bandwidth cost',
  inactiveReadyPacket.byteLength === fullPacket.byteLength
    && inactiveReadyDecoded.you.team === 'blue'
    && inactiveReadyDecoded.you.readyActive === false);
check('full snapshot restores player flags, vitals and respawn timing',
  decoded.players.length === 2
    && decoded.players[0].name === 'ALPHA-1'
    && decoded.players[0].team === 'blue'
    && decoded.players[0].sprinting
    && decoded.players[0].aiming
    && decoded.players[0].invulnerable
    && decoded.players[0].juggernaut
    && close(decoded.players[0].health, 72.25)
    && decoded.players[0].maxHealth === 600
    && decoded.players[0].maxArmor === 215
    && decoded.players[1].name === 'KILO-2'
    && decoded.players[1].team === 'red'
    && !decoded.players[1].alive
    && !decoded.players[1].invulnerable
    && !decoded.players[1].juggernaut
    && decoded.players[1].maxArmor === 65
    && decoded.players[1].crouch
    && decoded.players[1].sliding
    && decoded.players[1].respawnAt === now + 4321);
check('player weapon byte preserves every third-person throwable kind and pose',
  decoded.players[0].weapon === 'rifle'
    && decoded.players[0].throwableKind === 'incendiary'
    && decoded.players[0].throwableState === 'aim'
    && decoded.players[1].weapon === 'sniper'
    && decoded.players[1].throwableKind === 'molotov'
    && decoded.players[1].throwableState === 'carry'
    && throwablePresentationCode('frag', 'carry') === 1
    && throwablePresentationCode('frag', 'aim') === 2
    && throwablePresentationCode('incendiary', 'carry') === 3
    && throwablePresentationCode('incendiary', 'aim') === 4
    && throwablePresentationCode('molotov', 'carry') === 5
    && throwablePresentationCode('molotov', 'aim') === 6
    && decodeThrowablePresentation(0).throwableState === 'none');
check('vote, UAV and sentry state survive the binary snapshot',
  decoded.voteKick?.id === 'vote-123'
    && decoded.voteKick?.yourVote === 'yes'
    && decoded.you.uavMarks.length === 1
    && decoded.you.streaks.cas === 3
    && decoded.you.streaks.firebomb === 2
    && decoded.you.streaks.attack_helicopter === 1
    && decoded.you.streaks.juggernaut === 1
    && decoded.you.streaks.railgun === 2
    && decoded.you.ammo.minigun.mag === 1200
    && close(decoded.you.uavMarks[0][2], -8.25)
    && decoded.sentries[0]?.targetId === players[1].id
    && close(decoded.sentries[0]?.health, 275.5)
    && decoded.uavDrones.length === 2
    && decoded.uavDrones[0].id === 'uav-blue'
    && decoded.uavDrones[0].health === 500
    && decoded.uavDrones[1].id === 'uav-red'
    && close(decoded.uavDrones[1].health, 123.45));
check('a live TV missile streams its authoritative pose to every client',
  decoded.missiles?.length === 1
    && decoded.missiles[0].ownerId === players[0].id
    && decoded.missiles[0].team === 'red'
    && close(decoded.missiles[0].p[1], 63.25)
    && close(decoded.missiles[0].yaw, 1.25)
    && close(decoded.missiles[0].pitch, -0.875)
    && decoded.missiles[0].diving === true);
check('an active A-10 run preserves its fixed attack plan and timing',
  decoded.casRuns?.length === 1
    && decoded.casRuns[0].ownerId === players[0].id
    && decoded.casRuns[0].team === 'blue'
    && close(decoded.casRuns[0].start[0], -24.5)
    && close(decoded.casRuns[0].end[0], 27.5)
    && decoded.casRuns[0].startedAt === now - 875
    && decoded.casRuns[0].seed === 0xdecafbad);
check('an active B-2 run preserves its map-spanning line and timing',
  decoded.firebombRuns?.length === 1
    && decoded.firebombRuns[0].ownerId === players[1].id
    && decoded.firebombRuns[0].team === 'red'
    && close(decoded.firebombRuns[0].start[0], -96)
    && close(decoded.firebombRuns[0].end[0], 96)
    && close(decoded.firebombRuns[0].start[1], 14.5)
    && decoded.firebombRuns[0].startedAt === now - 1250);
check('an Apache patrol preserves its call point, target and shared timing',
  decoded.attackHelicopters?.length === 1
    && decoded.attackHelicopters[0].ownerId === players[0].id
    && decoded.attackHelicopters[0].team === 'blue'
    && close(decoded.attackHelicopters[0].call[0], 4.5)
    && close(decoded.attackHelicopters[0].call[2], -7.25)
    && close(decoded.attackHelicopters[0].entryYaw, 2.25)
    && decoded.attackHelicopters[0].startedAt === now - 5600
    && decoded.attackHelicopters[0].targetId === players[1].id
    && close(decoded.attackHelicopters[0].health, 637.4)
    && decoded.attackHelicopters[0].maxHealth === 1100);
check('a Juggernaut drop preserves its owner, landing point and shared timing',
  decoded.airdrops?.length === 1
    && decoded.airdrops[0].id === 'jug-drop-1'
    && decoded.airdrops[0].ownerId === players[0].id
    && decoded.airdrops[0].team === 'blue'
    && close(decoded.airdrops[0].target[0], 8.25)
    && close(decoded.airdrops[0].target[2], -14.5)
    && close(decoded.airdrops[0].yaw, 1.75)
    && decoded.airdrops[0].startedAt === now - 2400);
const idleSky = encodeSnapshotPacket({ ...snapshot, missiles: [] }, { rosterVersion: 4 });
const noMissileField = encodeSnapshotPacket(
  { ...snapshot, missiles: undefined },
  { rosterVersion: 4 }
);
const liveSky = encodeSnapshotPacket(snapshot, { rosterVersion: 4 });
// The common case is an empty sky, and it must cost a single count byte. A
// flying missile is transient, so its record only has to stay small enough
// that one configured tick-rate stream stays inside its bandwidth budget.
const missileBytes = liveSky.byteLength - idleSky.byteLength;
check('an idle sky costs one count byte and a live missile stays cheap',
  noMissileField.byteLength === idleSky.byteLength
    && missileBytes <= 64
    && missileBytes * PVP_TICK_RATE * 8 < 32000,
  `one missile adds ${missileBytes} bytes (${missileBytes * PVP_TICK_RATE * 8} bit/s)`);
const idleUavAircraft = encodeSnapshotPacket(
  { ...snapshot, uavDrones: [] },
  { rosterVersion: 4 }
);
const noUavAircraftField = encodeSnapshotPacket(
  { ...snapshot, uavDrones: undefined },
  { rosterVersion: 4 }
);
const uavAircraftBytes = liveSky.byteLength - idleUavAircraft.byteLength;
check('two circling UAV aircraft add only a health word per team',
  noUavAircraftField.byteLength === idleUavAircraft.byteLength
    && uavAircraftBytes === 4
    && uavAircraftBytes * PVP_TICK_RATE * 8 < 2000,
  `two aircraft add ${uavAircraftBytes} bytes (${uavAircraftBytes * PVP_TICK_RATE * 8} bit/s)`);
const idleCas = encodeSnapshotPacket({ ...snapshot, casRuns: [] }, { rosterVersion: 4 });
const noCasField = encodeSnapshotPacket(
  { ...snapshot, casRuns: undefined },
  { rosterVersion: 4 }
);
const casBytes = liveSky.byteLength - idleCas.byteLength;
check('an idle CAS stream costs one count byte and one active run stays compact',
  noCasField.byteLength === idleCas.byteLength
    && casBytes <= 64
    && casBytes * PVP_TICK_RATE * 8 < 24000,
  `one A-10 run adds ${casBytes} bytes (${casBytes * PVP_TICK_RATE * 8} bit/s)`);
const idleFirebomb = encodeSnapshotPacket(
  { ...snapshot, firebombRuns: [] },
  { rosterVersion: 4 }
);
const firebombBytes = liveSky.byteLength - idleFirebomb.byteLength;
check('one active B-2 pass remains a compact deterministic snapshot record',
  firebombBytes <= 64
    && firebombBytes * PVP_TICK_RATE * 8 < 24000,
  `one B-2 run adds ${firebombBytes} bytes (${firebombBytes * PVP_TICK_RATE * 8} bit/s)`);
const idleApache = encodeSnapshotPacket(
  { ...snapshot, attackHelicopters: [] },
  { rosterVersion: 4 }
);
const apacheBytes = liveSky.byteLength - idleApache.byteLength;
check('one Apache patrol remains compact while streaming its target id',
  apacheBytes <= 72
    && apacheBytes * PVP_TICK_RATE * 8 < 28000,
  `one Apache adds ${apacheBytes} bytes (${apacheBytes * PVP_TICK_RATE * 8} bit/s)`);
const idleAirdrop = encodeSnapshotPacket({ ...snapshot, airdrops: [] }, { rosterVersion: 4 });
const noAirdropField = encodeSnapshotPacket(
  { ...snapshot, airdrops: undefined },
  { rosterVersion: 4 }
);
const airdropBytes = liveSky.byteLength - idleAirdrop.byteLength;
check('an idle airdrop stream costs one count byte and one active drop stays compact',
  noAirdropField.byteLength === idleAirdrop.byteLength
    && airdropBytes <= 64
    && airdropBytes * PVP_TICK_RATE * 8 < 24000,
  `one airdrop adds ${airdropBytes} bytes (${airdropBytes * PVP_TICK_RATE * 8} bit/s)`);

let integratedSnapshot = null;
const integratedClient = new PvpClient({
  snapshot: (value) => { integratedSnapshot = value; },
});
integratedClient.handleMessage(JSON.stringify({
  type: 'joined',
  protocol: PVP_PROTOCOL,
  id: players[0].id,
  name: players[0].name,
  team: players[0].team,
  room: { id: 'room-3', number: 3, capacity: 12 },
}));
integratedClient.handleMessage(fullPacket);
check('browser PVP client accepts the binary authoritative snapshot',
  integratedClient.playerId === players[0].id
    && integratedSnapshot?.players?.[1]?.name === players[1].name
    && integratedSnapshot?.you?.id === players[0].id);

const nextSnapshot = structuredClone(snapshot);
nextSnapshot.tick++;
nextSnapshot.serverTime += 29;
nextSnapshot.players[0].p[0] = 1.375;
// Compact steady-state budget is measured in the normal idle sky; active
// A-10 overhead is checked independently above.
nextSnapshot.casRuns = [];
nextSnapshot.firebombRuns = [];
nextSnapshot.attackHelicopters = [];
nextSnapshot.airdrops = [];
const steadyPacket = encodeSnapshotPacket(nextSnapshot, {
  includeRoster: false,
  rosterVersion: 4,
});
const steady = decodeSnapshotPacket(steadyPacket, state);
check('steady snapshots reuse roster metadata and are compact',
  steady.players[0].id === players[0].id
    && close(steady.players[0].p[0], 1.375)
    && steadyPacket.byteLength < fullPacket.byteLength
    // The appended machine pistol contributes one mag/reserve pair (4 bytes).
    && steadyPacket.byteLength <= 416,
  `full ${fullPacket.byteLength} B, steady ${steadyPacket.byteLength} B`);

let rejectedMissingRoster = false;
try {
  decodeSnapshotPacket(steadyPacket, createSnapshotDecodeState());
} catch {
  rejectedMissingRoster = true;
}
check('snapshot without its roster baseline is rejected', rejectedMissingRoster);

let rejectedTruncated = false;
try {
  decodeSnapshotPacket(fullPacket.subarray(0, fullPacket.length - 1), createSnapshotDecodeState());
} catch {
  rejectedTruncated = true;
}
check('truncated binary snapshots are rejected', rejectedTruncated);

console.log(failures ? `\n${failures} PVP wire problem(s)\n` : '\nPVP binary wire verified\n');
process.exit(failures ? 1 : 0);
