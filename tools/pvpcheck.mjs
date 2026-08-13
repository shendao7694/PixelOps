import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { WebSocket } from 'ws';
import * as THREE from 'three';
import {
  PVP_PROTOCOL,
  PVP_ROOM_CAPACITY,
  PVP_ROOM_COUNT,
  PVP_SPAWN_PROTECTION_MS,
  PVP_TICK_RATE,
} from '../src/net/protocol.js';
import {
  buildServerLevel,
  pickServerSpawn,
  rayWorld,
  serverTeamSpawns,
} from '../server/world.mjs';
import { uavDronePose } from '../src/game/uav.js';
import {
  createSnapshotDecodeState,
  decodeSnapshotPacket,
} from '../src/net/pvp-wire.js';
import {
  PASSIVE_IDS,
  PASSIVE_TUNING,
  createDefaultLoadout,
} from '../src/game/loadout.js';
import { MOLOTOV_DURATION_SECONDS } from '../src/game/incendiary.js';
import { GRENADE_FUSE_SECONDS } from '../src/game/grenade.js';
import {
  AIRDROP_IMPACT_SECONDS,
  JUGGERNAUT_MAX_ARMOR,
  JUGGERNAUT_MAX_HEALTH,
} from '../src/game/juggernaut.js';

const PORT = 18323;
const HTTP = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}/pvp`;
const child = spawn(process.execPath, ['serve.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'test',
    PVP_TEST_AUTH_BYPASS: '1',
    PVP_TEST_START_UAV_CHARGES: '1',
    PVP_TEST_START_STRIKE_CHARGES: '1',
    PVP_TEST_START_CAS_CHARGES: '1',
    PVP_TEST_START_FIREBOMB_CHARGES: '1',
    PVP_TEST_START_ATTACK_HELICOPTER_CHARGES: '1',
    PVP_TEST_START_SENTRY_CHARGES: '1',
    PVP_TEST_START_JUGGERNAUT_CHARGES: '1',
    PVP_TEST_SENTRY_LIFETIME_MS: '220',
    PVP_TEST_UAV_HEALTH: '10',
    PVP_DISABLE_BAN_PERSISTENCE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverError = '';
child.stderr.on('data', (chunk) => { serverError += chunk.toString(); });

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? '\n       ' + detail : ''));
  }
}

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`${HTTP}/api/pvp/rooms`);
      if (response.ok) return response.json();
    } catch {}
    await wait(50);
  }
  throw new Error('PVP server did not start: ' + serverError);
}

function testClientId(index) {
  return Math.max(1, Number(index) || 1).toString(16).padStart(32, '0');
}

function testLoadout(index) {
  const loadout = createDefaultLoadout();
  if (Number(index) === 1) loadout.passives = [PASSIVE_IDS.MARTYRDOM];
  else if (Number(index) === 5) {
    loadout.passives = [PASSIVE_IDS.READY_FOR_ACTION];
  }
  // Client two owns the sentry lifetime probe. Everyone else keeps CAS so the
  // A-10 authority probe remains available while all clients retain UAV.
  loadout.streaks = Number(index) === 11
    ? ['firebomb', 'uav', 'cas']
    : Number(index) === 12
      ? ['attack_helicopter', 'uav', 'cas']
      : Number(index) === 2
    ? ['uav', 'sentry', 'cas']
    : Number(index) === 3
      ? ['uav', 'cas', 'juggernaut']
      : ['uav', 'strike', 'cas'];
  return loadout;
}

function connectAndJoin(index, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    const messages = [];
    const decodeState = createSnapshotDecodeState();
    const loadout = options.loadout || testLoadout(index);
    let joinedMessage = null;
    const decode = (raw, isBinary) => {
      if (isBinary) return decodeSnapshotPacket(raw, decodeState);
      const message = JSON.parse(raw.toString());
      if (message.type === 'joined') decodeState.playerId = message.id;
      return message;
    };
    const timer = setTimeout(() => reject(new Error(
      `join timeout ${index}; messages=${messages.map((message) => message.type).join(',')}; server=${serverError}`
    )), 4000);
    ws.on('message', (raw, isBinary) => {
      const message = decode(raw, isBinary);
      messages.push(message);
      if (message.type === 'hello') {
        ws.send(JSON.stringify({
          type: 'join',
          protocol: options.protocol ?? PVP_PROTOCOL,
          roomId: options.roomId || 'room-1',
          name: options.name || `TEST-${String(index).padStart(2, '0')}`,
          clientId: options.clientId || testClientId(index),
        }));
      } else if (message.type === 'join_error') {
        clearTimeout(timer);
        resolve({ ws, messages, result: message, decode });
      } else if (message.type === 'joined') {
        if (options.autoDeploy === false) {
          clearTimeout(timer);
          resolve({ ws, messages, result: message, decode, loadout });
          return;
        }
        joinedMessage = message;
        ws.send(JSON.stringify({ type: 'deploy', loadout }));
      } else if (joinedMessage && message.type === 'snapshot'
        && message.players?.find((player) => player.id === joinedMessage.id)?.alive === true) {
        clearTimeout(timer);
        resolve({
          ws,
          messages,
          decode,
          loadout,
          result: {
            ...joinedMessage,
            initialSnapshot: joinedMessage.snapshot,
            snapshot: message,
          },
        });
      }
    });
    ws.on('error', reject);
  });
}

async function waitForMessage(client, predicate, startAt = 0, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let i = startAt; i < client.messages.length; i++) {
      if (predicate(client.messages[i])) return client.messages[i];
    }
    await wait(10);
  }
  throw new Error('message timeout');
}

async function waitForStreakActivation(client, reward, startAt = 0) {
  return waitForMessage(
    client,
    (message) => message.type === 'streak_activated' && message.reward === reward,
    startAt
  );
}

console.log('\nPVP authoritative server audit\n');
const clients = [];
try {
  const status = await waitForServer();
  check('server advertises exactly three rooms', status.roomCount === PVP_ROOM_COUNT);
  check(`server tick rate is ${PVP_TICK_RATE} Hz`, status.tickRate === PVP_TICK_RATE);
  check('room capacity is 12', status.capacityPerRoom === PVP_ROOM_CAPACITY);
  const hiddenBanFile = await fetch(`${HTTP}/.runtime/pvp-bans.json`);
  const hiddenBanFileCase = await fetch(`${HTTP}/.RUNTIME/pvp-bans.json`);
  check('persistent vote-kick ban data is never served as a static file',
    hiddenBanFile.status === 404 && hiddenBanFileCase.status === 404);
  const localRegion = await fetch(`${HTTP}/api/pvp/region`).then((response) => response.json());
  check('private/local PVP region checks fail open without an external lookup',
    localRegion.country === null && localRegion.outsideChina === false,
    JSON.stringify(localRegion));

  const outdated = await connectAndJoin(89, {
    roomId: 'room-3',
    protocol: PVP_PROTOCOL - 1,
    autoDeploy: false,
  });
  check('an outdated client is rejected instead of silently desynchronizing inputs',
    outdated.result.type === 'join_error'
      && outdated.result.code === 'PROTOCOL_MISMATCH'
      && outdated.result.protocol === PVP_PROTOCOL);
  outdated.ws.close();

  const undeployed = await connectAndJoin(90, {
    roomId: 'room-3',
    name: 'LOADOUT-WAIT',
    autoDeploy: false,
  });
  await wait(150);
  const idleStatus = await fetch(`${HTTP}/api/pvp/rooms`).then((response) => response.json());
  const idleSnapshot = undeployed.messages.findLast((message) => message.type === 'snapshot');
  check('an undeployed room member can remain on the loadout screen without crashing authority',
    idleStatus.rooms?.find((room) => room.id === 'room-3')?.players === 1
      && idleSnapshot?.players?.find((player) => player.id === undeployed.result.id)?.alive === false);
  undeployed.ws.close();

  for (let i = 1; i <= PVP_ROOM_CAPACITY + 1; i++) {
    clients.push(await connectAndJoin(i));
  }
  const joined = clients.filter((c) => c.result.type === 'joined');
  const rejected = clients.filter((c) => c.result.type === 'join_error');
  const spawnLevel = buildServerLevel();
  const teamSpawns = Object.fromEntries(['blue', 'red'].map((team) => [
    team,
    serverTeamSpawns(spawnLevel, team),
  ]));
  check('first twelve players join immediately', joined.length === 12,
    `joined ${joined.length}`);
  check('thirteenth player is rejected from the full room',
    rejected.length === 1 && rejected[0].result.code === 'ROOM_FULL');
  check('join response reserves a team slot without spawning before loadout confirmation',
    joined.every((c) => c.result.initialSnapshot?.players
      ?.some((p) => p.id === c.result.id && p.alive === false)));
  check('a validated deployment creates the authoritative player actor',
    joined.every((c) => c.result.snapshot?.players
      ?.some((p) => p.id === c.result.id && p.alive === true)));
  check(`new spawns receive ${PVP_SPAWN_PROTECTION_MS / 1000} seconds of authoritative protection`,
    joined.every((c) => c.result.snapshot?.players
      ?.find((p) => p.id === c.result.id)?.invulnerable === true));
  check('each team uses exactly one rear-edge midpoint spawn',
    ['blue', 'red'].every((team) => {
      if (teamSpawns[team].length !== 1) return false;
      const spawn = teamSpawns[team][0];
      const expectedZ = (team === 'blue' ? 1 : -1) * (spawnLevel.bounds.z - 0.5);
      if (Math.abs(spawn.x) > 0.02 || Math.abs(spawn.z - expectedZ) > 0.02) {
        return false;
      }
      for (let i = 0; i < 100; i++) {
        const picked = pickServerSpawn(spawnLevel, team);
        if (spawn.distanceTo(picked) >= 2.7) return false;
      }
      return true;
    }));
  const spawnSightlinesBlocked = teamSpawns.blue.every((blueSpawn) =>
    teamSpawns.red.every((redSpawn) => {
      const origin = blueSpawn.clone().add(new THREE.Vector3(0, 1.6, 0));
      const target = redSpawn.clone().add(new THREE.Vector3(0, 1.6, 0));
      const direction = target.clone().sub(origin);
      const distance = direction.length();
      direction.multiplyScalar(1 / distance);
      return Boolean(rayWorld(spawnLevel, origin, direction, distance - 0.2));
    }));
  check('rear-centre spawn anchors cannot directly sight each other',
    spawnSightlinesBlocked,
    JSON.stringify({
      blue: teamSpawns.blue.map((spawn) => spawn.toArray()),
      red: teamSpawns.red.map((spawn) => spawn.toArray()),
    }));
  check('joined players are placed in their own single spawn zone',
    joined.every((c) => {
      const own = c.result.snapshot?.players?.find((p) => p.id === c.result.id);
      return own && teamSpawns[c.result.team].some((spawn) =>
        Math.hypot(spawn.x - own.p[0], spawn.z - own.p[2]) < 2.7);
    }));
  const joinedSpawnPositions = Object.fromEntries(['blue', 'red'].map((team) => [
    team,
    joined
      .filter((c) => c.result.team === team)
      .map((c) => c.result.snapshot?.players?.find((p) => p.id === c.result.id)?.p)
      .filter(Boolean),
  ]));
  check('players sharing the single spawn receive separate non-overlapping slots',
    ['blue', 'red'].every((team) =>
      joinedSpawnPositions[team].every((position, index) =>
        joinedSpawnPositions[team].slice(index + 1).every((other) =>
          Math.hypot(position[0] - other[0], position[2] - other[2]) >= 0.85))),
    JSON.stringify(joinedSpawnPositions));
  check('UAV snapshots expose authoritative sweep state',
    joined.every((c) => Number.isFinite(c.result.snapshot?.you?.streaks?.uavSweepSeq)
      && Number.isFinite(c.result.snapshot?.you?.streaks?.uavRevealTime)));
  check('vote-kick snapshot state and cooldown are server-owned',
    joined.every((c) => c.result.snapshot?.voteKick === null
      && Number.isFinite(c.result.snapshot?.you?.voteKickCooldown)));
  check('every new life starts with two authoritative grenades',
    joined.every((c) => c.result.snapshot?.you?.grenades === 2));
  const throwableActor = joined[7];
  const throwableObserver = joined[8];
  let throwableStart = throwableObserver.messages.length;
  throwableActor.ws.send(JSON.stringify({
    type: 'input',
    seq: 6500,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: true,
    grenadeAim: false,
    aim: false,
    trigger: false,
  }));
  const throwableCarry = await waitForMessage(
    throwableObserver,
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === throwableActor.result.id)
        ?.throwableState === 'carry',
    throwableStart
  );
  throwableStart = throwableObserver.messages.length;
  throwableActor.ws.send(JSON.stringify({
    type: 'input',
    seq: 6501,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: true,
    grenadeAim: true,
    aim: false,
    trigger: false,
  }));
  const throwableAim = await waitForMessage(
    throwableObserver,
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === throwableActor.result.id)
        ?.throwableState === 'aim',
    throwableStart
  );
  throwableStart = throwableObserver.messages.length;
  throwableActor.ws.send(JSON.stringify({
    type: 'input',
    seq: 6502,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: false,
    grenadeAim: false,
    aim: false,
    trigger: false,
  }));
  const throwableStowed = await waitForMessage(
    throwableObserver,
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === throwableActor.result.id)
        ?.throwableState === 'none',
    throwableStart
  );
  check('remote snapshots expose carry, RMB charge and stow without extra packet bytes',
    throwableCarry.players.find((player) => player.id === throwableActor.result.id)
      ?.throwableKind === 'frag'
      && throwableAim.players.find((player) => player.id === throwableActor.result.id)
        ?.throwableKind === 'frag'
      && throwableStowed.players.find((player) => player.id === throwableActor.result.id)
        ?.throwableState === 'none');
  const readyClient = joined[4];
  const readyStart = readyClient.messages.length;
  const readyFiringBefore = readyClient.result.snapshot.players
    ?.find((player) => player.id === readyClient.result.id)?.firing || 0;
  readyClient.ws.send(JSON.stringify({
    type: 'input',
    seq: 8100,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 1.2,
    weapon: 'rifle',
    trigger: true,
  }));
  const readyFired = await waitForMessage(
    readyClient,
    (message) => message.type === 'snapshot'
      && message.you?.readyActive === true
      && message.players?.find((player) => player.id === readyClient.result.id)
        ?.firing > readyFiringBefore,
    readyStart
  );
  readyClient.ws.send(JSON.stringify({
    type: 'input',
    seq: 8101,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 1.2,
    weapon: 'rifle',
    trigger: false,
  }));
  check('Ready for Action keeps authoritative ammunition full while shots fire',
    readyFired.you.ammo?.rifle?.mag === 30
      && readyFired.you.reloading === null
      && readyFired.you.readyActive === true,
    JSON.stringify({
      ammo: readyFired.you.ammo?.rifle,
      readyActive: readyFired.you.readyActive,
    }));
  check('close air support starts as a server-owned test charge',
    joined.every((c) => c.result.snapshot?.you?.streaks?.cas === 1));
  check('new air-support test charges exist only in selected loadout slots',
    joined[10].result.snapshot?.you?.streaks?.firebomb === 1
      && joined[10].result.snapshot?.you?.streaks?.attack_helicopter === 0
      && joined[11].result.snapshot?.you?.streaks?.firebomb === 0
      && joined[11].result.snapshot?.you?.streaks?.attack_helicopter === 1);
  const juggernautOwner = joined[2];
  check('Juggernaut starts as a server-owned charge only for a selected slot',
    juggernautOwner.result.snapshot?.you?.streaks?.juggernaut === 1
      && joined.filter((client) => client !== juggernautOwner)
        .every((client) => client.result.snapshot?.you?.streaks?.juggernaut === 0));
  const blue = joined.filter((c) => c.result.team === 'blue').length;
  const red = joined.filter((c) => c.result.team === 'red').length;
  check('teams auto-balance six versus six', blue === 6 && red === 6,
    `blue ${blue}, red ${red}`);

  const restricted = joined[9];
  restricted.ws.send(JSON.stringify({
    type: 'input',
    seq: 7000,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'sniper',
  }));
  restricted.ws.send(JSON.stringify({ type: 'ability', ability: 'sentry' }));
  await wait(520);
  const restrictedSnapshot = [...restricted.messages].reverse()
    .find((message) => message.type === 'snapshot');
  check('authority rejects weapons and streaks that are not in the deployed kit',
    restrictedSnapshot?.players
      ?.find((player) => player.id === restricted.result.id)?.weapon === 'rifle'
      && restrictedSnapshot?.you?.streaks?.sentry === 0
      && !restrictedSnapshot?.sentries?.some((sentry) => sentry.ownerId === restricted.result.id),
    JSON.stringify({
      weapon: restrictedSnapshot?.players
        ?.find((player) => player.id === restricted.result.id)?.weapon,
      streaks: restrictedSnapshot?.you?.streaks,
    }));

  const machinePistolLoadout = createDefaultLoadout();
  machinePistolLoadout.secondary = 'machine_pistol';
  const sidearmClient = await connectAndJoin(40, {
    roomId: 'room-2',
    name: 'SIDEARM',
    loadout: machinePistolLoadout,
  });
  clients.push(sidearmClient);
  const sidearmStart = sidearmClient.messages.length;
  sidearmClient.ws.send(JSON.stringify({
    type: 'input',
    seq: 1,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'machine_pistol',
    trigger: false,
  }));
  const sidearmEquipped = await waitForMessage(
    sidearmClient,
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === sidearmClient.result.id)
        ?.weapon === 'machine_pistol',
    sidearmStart
  );
  const sidearmMag = sidearmEquipped.you?.ammo?.machine_pistol?.mag;
  sidearmClient.ws.send(JSON.stringify({
    type: 'input',
    seq: 2,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 1.2,
    weapon: 'machine_pistol',
    trigger: true,
  }));
  await wait(220);
  sidearmClient.ws.send(JSON.stringify({
    type: 'input',
    seq: 3,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 1.2,
    weapon: 'machine_pistol',
    trigger: false,
  }));
  const sidearmFired = await waitForMessage(
    sidearmClient,
    (message) => message.type === 'snapshot'
      && message.you?.ammo?.machine_pistol?.mag < sidearmMag,
    sidearmStart
  );
  check('a selected machine pistol equips and consumes authoritative secondary ammo',
    sidearmMag === 20
      && sidearmFired.you.ammo.machine_pistol.mag >= 1
      && sidearmFired.you.ammo.machine_pistol.mag < sidearmMag,
    JSON.stringify({
      weapon: sidearmFired.players?.find((player) =>
        player.id === sidearmClient.result.id)?.weapon,
      ammo: sidearmFired.you?.ammo?.machine_pistol,
    }));

  const deagleLoadout = createDefaultLoadout();
  deagleLoadout.secondary = 'desert_eagle';
  const deagleClient = await connectAndJoin(41, {
    roomId: 'room-2',
    name: 'DEAGLE',
    loadout: deagleLoadout,
  });
  clients.push(deagleClient);
  const deagleStart = deagleClient.messages.length;
  deagleClient.ws.send(JSON.stringify({
    type: 'input',
    seq: 1,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 1.2,
    weapon: 'desert_eagle',
    trigger: false,
  }));
  const deagleEquipped = await waitForMessage(
    deagleClient,
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === deagleClient.result.id)
        ?.weapon === 'desert_eagle',
    deagleStart
  );
  const deagleMag = deagleEquipped.you?.ammo?.desert_eagle?.mag;
  // The visible weapon swaps at the midpoint; let the remaining draw finish
  // before testing the edge-triggered semi-automatic shot.
  await wait(260);
  deagleClient.ws.send(JSON.stringify({
    type: 'input',
    seq: 2,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 1.2,
    weapon: 'desert_eagle',
    trigger: true,
  }));
  const deagleFired = await waitForMessage(
    deagleClient,
    (message) => message.type === 'snapshot'
      && message.you?.ammo?.desert_eagle?.mag < deagleMag,
    deagleStart
  );
  deagleClient.ws.send(JSON.stringify({
    type: 'input',
    seq: 3,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 1.2,
    weapon: 'desert_eagle',
    trigger: false,
  }));
  check('a selected seven-round Desert Eagle equips and fires authoritatively',
    deagleMag === 7 && deagleFired.you.ammo.desert_eagle.mag === 6,
    JSON.stringify(deagleFired.you?.ammo?.desert_eagle));

  /* ---- Juggernaut: server-owned call, timed drop and stationary claim ---- */
  const juggernautStart = juggernautOwner.messages.length;
  juggernautOwner.ws.send(JSON.stringify({ type: 'ability', ability: 'juggernaut' }));
  const airdropEvent = await waitForMessage(
    juggernautOwner,
    (message) => message.type === 'juggernaut_airdrop'
      && message.ownerId === juggernautOwner.result.id,
    juggernautStart
  );
  const juggernautActivation = await waitForStreakActivation(
    juggernautOwner,
    'juggernaut',
    juggernautStart
  );
  check('accepted Juggernaut calls identify their contributor',
    juggernautActivation.ownerId === juggernautOwner.result.id
      && juggernautActivation.name === juggernautOwner.result.name
      && juggernautActivation.team === juggernautOwner.result.team,
    JSON.stringify(juggernautActivation));
  const airdropSnapshot = await waitForMessage(
    juggernautOwner,
    (message) => message.type === 'snapshot'
      && message.airdrops?.some((drop) => drop.id === airdropEvent.id),
    juggernautStart
  );
  const callerAtDrop = airdropSnapshot.players
    .find((player) => player.id === juggernautOwner.result.id);
  const streamedDrop = airdropSnapshot.airdrops
    .find((drop) => drop.id === airdropEvent.id);
  check('the server fixes the unassisted drop to the radio call position',
    streamedDrop
      && callerAtDrop
      && Math.hypot(
        streamedDrop.target[0] - callerAtDrop.p[0],
        streamedDrop.target[2] - callerAtDrop.p[2]
      ) < 0.08
      && airdropSnapshot.you.streaks.juggernaut === 0);

  await wait(Math.ceil(AIRDROP_IMPACT_SECONDS * 1000) + 120);
  let claimSeq = 8100;
  const claimUntil = Date.now() + 720;
  while (Date.now() < claimUntil) {
    juggernautOwner.ws.send(JSON.stringify({
      type: 'input',
      seq: claimSeq++,
      moveX: 0,
      moveZ: 0,
      jump: false,
      crouch: false,
      slide: false,
      sprint: false,
      aim: false,
      trigger: false,
      reload: false,
      grenade: false,
      interact: true,
      weapon: 'rifle',
      yaw: callerAtDrop.yaw,
      pitch: callerAtDrop.pitch,
    }));
    await wait(45);
  }
  const transformed = await waitForMessage(
    juggernautOwner,
    (message) => message.type === 'snapshot'
      && message.players?.some((player) =>
        player.id === juggernautOwner.result.id
          && player.juggernaut
          && player.weapon === 'minigun')
      && !message.airdrops?.some((drop) => drop.id === airdropEvent.id),
    juggernautStart,
    3000
  );
  const transformedActor = transformed.players
    .find((player) => player.id === juggernautOwner.result.id);
  check('a stationary half-second claim equips the authoritative heavy suit and M134',
    transformedActor?.health === JUGGERNAUT_MAX_HEALTH
      && transformedActor?.armor === JUGGERNAUT_MAX_ARMOR
      && transformedActor?.juggernaut === true
      && transformedActor?.weapon === 'minigun'
      && transformed.you.ammo?.minigun?.mag === 1200
      && transformed.you.ammo?.minigun?.reserve === 0);

  const heavySprintStart = juggernautOwner.messages.length;
  for (let i = 0; i < 8; i++) {
    juggernautOwner.ws.send(JSON.stringify({
      type: 'input',
      seq: claimSeq++,
      moveX: 0,
      moveZ: -1,
      jump: false,
      crouch: false,
      slide: false,
      sprint: true,
      aim: false,
      trigger: false,
      reload: false,
      grenade: false,
      interact: false,
      weapon: 'minigun',
      yaw: transformedActor.yaw,
      pitch: transformedActor.pitch,
    }));
    await wait(35);
  }
  const heavySprintSnapshot = await waitForMessage(
    juggernautOwner,
    (message) => message.type === 'snapshot'
      && message.players?.some((player) =>
        player.id === juggernautOwner.result.id
          && player.juggernaut
          && player.sprinting),
    heavySprintStart,
    3000
  );
  const heavySprinter = heavySprintSnapshot.players
    .find((player) => player.id === juggernautOwner.result.id);
  check('the authoritative Juggernaut accepts Shift-sprint while carrying the M134',
    heavySprinter?.juggernaut === true
      && heavySprinter?.sprinting === true
      && heavySprinter?.weapon === 'minigun');

  const heavySlideStart = juggernautOwner.messages.length;
  juggernautOwner.ws.send(JSON.stringify({
    type: 'input',
    seq: claimSeq++,
    moveX: 0,
    moveZ: -1,
    jump: false,
    crouch: false,
    slide: true,
    sprint: true,
    aim: false,
    trigger: false,
    reload: false,
    grenade: false,
    interact: false,
    weapon: 'minigun',
    yaw: heavySprinter.yaw,
    pitch: heavySprinter.pitch,
  }));
  await wait(180);
  const heavySlideSnapshot = [...juggernautOwner.messages]
    .slice(heavySlideStart)
    .reverse()
    .find((message) => message.type === 'snapshot');
  const heavySlider = heavySlideSnapshot?.players
    ?.find((player) => player.id === juggernautOwner.result.id);
  check('the authoritative Juggernaut rejects slide input while sprinting',
    heavySlider?.juggernaut === true && heavySlider?.sliding === false);

  juggernautOwner.ws.send(JSON.stringify({
    type: 'input',
    seq: claimSeq++,
    moveX: 0,
    moveZ: 0,
    jump: false,
    crouch: false,
    slide: false,
    sprint: false,
    aim: false,
    trigger: false,
    reload: false,
    grenade: false,
    interact: false,
    weapon: 'minigun',
    yaw: heavySprinter.yaw,
    pitch: heavySprinter.pitch,
  }));
  await wait(120);

  const warmupStart = juggernautOwner.messages.length;
  const warmupBefore = [...juggernautOwner.messages].reverse()
    .find((message) => message.type === 'snapshot');
  const warmupMag = warmupBefore?.you?.ammo?.minigun?.mag;
  juggernautOwner.ws.send(JSON.stringify({
    type: 'input',
    seq: claimSeq++,
    moveX: 0,
    moveZ: 0,
    jump: false,
    crouch: false,
    slide: false,
    sprint: false,
    aim: false,
    trigger: true,
    reload: false,
    grenade: false,
    interact: false,
    weapon: 'minigun',
    yaw: heavySprinter.yaw,
    pitch: heavySprinter.pitch,
  }));
  await wait(360);
  const earlyWarmup = [...juggernautOwner.messages]
    .slice(warmupStart)
    .reverse()
    .find((message) => message.type === 'snapshot');
  check('server authority consumes no M134 ammunition during the first 0.5 seconds',
    warmupMag === 1200 && earlyWarmup?.you?.ammo?.minigun?.mag === warmupMag,
    `${warmupMag} -> ${earlyWarmup?.you?.ammo?.minigun?.mag}`);
  const warmupFired = await waitForMessage(
    juggernautOwner,
    (message) => message.type === 'snapshot'
      && message.you?.ammo?.minigun?.mag < warmupMag,
    warmupStart,
    1800
  );
  check('server authority starts the 1080 RPM M134 after continuous warm-up',
    warmupFired.you.ammo.minigun.mag < warmupMag
      && warmupFired.you.ammo.minigun.reserve === 0);
  juggernautOwner.ws.send(JSON.stringify({
    type: 'input',
    seq: claimSeq++,
    moveX: 0,
    moveZ: 0,
    jump: false,
    crouch: false,
    slide: false,
    sprint: false,
    aim: false,
    trigger: false,
    reload: false,
    grenade: false,
    interact: false,
    weapon: 'minigun',
    yaw: heavySprinter.yaw,
    pitch: heavySprinter.pitch,
  }));

  const sentryOwner = joined[1];
  const sentryStart = sentryOwner.messages.length;
  sentryOwner.ws.send(JSON.stringify({ type: 'ability', ability: 'sentry' }));
  const sentryDeploy = await waitForMessage(
    sentryOwner,
    (message) => message.type === 'sentry_deploy' && message.ownerId === sentryOwner.result.id,
    sentryStart
  );
  const sentryActivation = await waitForStreakActivation(
    sentryOwner,
    'sentry',
    sentryStart
  );
  check('accepted sentry deployments identify their contributor',
    sentryActivation.ownerId === sentryOwner.result.id
      && sentryActivation.name === sentryOwner.result.name
      && sentryActivation.team === sentryOwner.result.team,
    JSON.stringify(sentryActivation));
  const liveSentrySnapshot = await waitForMessage(
    sentryOwner,
    (message) => message.type === 'snapshot'
      && message.sentries?.some((sentry) => sentry.id === sentryDeploy.id),
    sentryStart
  );
  const timedSentry = liveSentrySnapshot.sentries.find((sentry) => sentry.id === sentryDeploy.id);
  const sentryTimeout = await waitForMessage(
    sentryOwner,
    (message) => message.type === 'sentry_destroyed'
      && message.id === sentryDeploy.id
      && message.reason === 'timeout',
    sentryStart
  );
  const clearedSentrySnapshot = await waitForMessage(
    sentryOwner,
    (message) => message.type === 'snapshot'
      && !message.sentries?.some((sentry) => sentry.id === sentryDeploy.id),
    sentryStart
  );
  check('a full-health sentry self-destructs when its authoritative lifetime expires',
    timedSentry?.health === timedSentry?.maxHealth
      && sentryTimeout.reason === 'timeout'
      && !clearedSentrySnapshot.sentries.some((sentry) => sentry.id === sentryDeploy.id));

  const uavOwner = joined[0];
  const uavTeammate = joined.find((client) =>
    client !== uavOwner && client.result.team === uavOwner.result.team);
  const uavEnemy = joined.find((client) => client.result.team !== uavOwner.result.team);
  const ownerUavStart = uavOwner.messages.length;
  const teammateUavStart = uavTeammate.messages.length;
  const enemyUavStart = uavEnemy.messages.length;
  uavOwner.ws.send(JSON.stringify({ type: 'ability', ability: 'uav' }));
  const ownerUavEvent = await waitForMessage(
    uavOwner,
    (message) => message.type === 'ability' && message.ability === 'uav',
    ownerUavStart
  );
  const teammateUavEvent = await waitForMessage(
    uavTeammate,
    (message) => message.type === 'ability' && message.ability === 'uav',
    teammateUavStart
  );
  const ownerUavActivation = await waitForStreakActivation(
    uavOwner,
    'uav',
    ownerUavStart
  );
  const teammateUavActivation = await waitForStreakActivation(
    uavTeammate,
    'uav',
    teammateUavStart
  );
  const ownerUavVoice = await waitForMessage(
    uavOwner,
    (message) => message.type === 'streak_voice'
      && message.cue === 'uav_inbound',
    ownerUavStart
  );
  const teammateUavVoice = await waitForMessage(
    uavTeammate,
    (message) => message.type === 'streak_voice'
      && message.cue === 'uav_inbound',
    teammateUavStart
  );
  const enemyUavVoice = await waitForMessage(
    uavEnemy,
    (message) => message.type === 'streak_voice'
      && message.cue === 'enemy_uav_inbound',
    enemyUavStart
  );
  const teammateUavSnapshot = await waitForMessage(
    uavTeammate,
    (message) => message.type === 'snapshot' && message.you?.streaks?.uavTime > 0,
    teammateUavStart
  );
  const enemySeesAircraft = await waitForMessage(
    uavEnemy,
    (message) => message.type === 'snapshot'
      && message.uavDrones?.some((drone) => drone.team === uavOwner.result.team),
    enemyUavStart
  );
  await wait(80);
  check('UAV activation event names the owner for the whole team',
    ownerUavEvent.ownerId === uavOwner.result.id
      && teammateUavEvent.ownerId === uavOwner.result.id
      && teammateUavEvent.name === uavOwner.result.name,
    JSON.stringify(teammateUavEvent));
  check('the contribution banner event reaches the caller and teammates only',
    ownerUavActivation.ownerId === uavOwner.result.id
      && teammateUavActivation.ownerId === uavOwner.result.id
      && teammateUavActivation.name === uavOwner.result.name
      && teammateUavActivation.team === uavOwner.result.team
      && !uavEnemy.messages.slice(enemyUavStart).some((message) =>
        message.type === 'streak_activated'),
    JSON.stringify(teammateUavActivation));
  check('UAV is shared with teammates but hidden from the opposing team',
    teammateUavSnapshot.you.streaks.uavTime > 0
      && !uavEnemy.messages.slice(enemyUavStart)
        .some((message) => message.type === 'ability' && message.ability === 'uav')
      && !uavEnemy.messages.slice(enemyUavStart)
        .some((message) => message.type === 'snapshot' && message.you?.streaks?.uavTime > 0));
  check('UAV radio is shared with the whole team but never the opposing team',
    ownerUavVoice.seed === teammateUavVoice.seed
      && !uavEnemy.messages.slice(enemyUavStart).some((message) =>
        message.type === 'streak_voice' && message.cue === 'uav_inbound'));
  check('the opposing team receives only the squad-leader enemy-UAV warning',
    Number.isInteger(enemyUavVoice.seed)
      && !uavOwner.messages.slice(ownerUavStart).some((message) =>
        message.type === 'streak_voice' && message.cue === 'enemy_uav_inbound')
      && !uavTeammate.messages.slice(teammateUavStart).some((message) =>
        message.type === 'streak_voice' && message.cue === 'enemy_uav_inbound'));
  check('the opposing team sees the shootable aircraft without receiving UAV radar data',
    enemySeesAircraft.uavDrones.length === 1
      && enemySeesAircraft.you.streaks.uavTime === 0
      && enemySeesAircraft.uavDrones[0].maxHealth === 500);

  const duplicateUavStart = uavTeammate.messages.length;
  uavTeammate.ws.send(JSON.stringify({ type: 'ability', ability: 'uav' }));
  const duplicateUavSnapshot = await waitForMessage(
    uavTeammate,
    (message) => message.type === 'snapshot'
      && message.uavDrones?.filter((drone) => drone.team === uavOwner.result.team).length === 1,
    duplicateUavStart
  );
  check('a team cannot stack a second UAV while its first aircraft is active',
    duplicateUavSnapshot.you.streaks.uav === 1
      && duplicateUavSnapshot.uavDrones
        .filter((drone) => drone.team === uavOwner.result.team).length === 1
      && !uavTeammate.messages.slice(duplicateUavStart).some((message) =>
        message.type === 'streak_activated' && message.reward === 'uav'));

  const enemyActivationStart = uavEnemy.messages.length;
  uavEnemy.ws.send(JSON.stringify({ type: 'ability', ability: 'uav' }));
  const twoAircraftSnapshot = await waitForMessage(
    uavEnemy,
    (message) => message.type === 'snapshot'
      && message.uavDrones?.length === 2
      && message.you?.streaks?.uavTime > 0,
    enemyActivationStart
  );
  check('one active UAV per team permits exactly two aircraft in the room',
    twoAircraftSnapshot.uavDrones.length === 2
      && new Set(twoAircraftSnapshot.uavDrones.map((drone) => drone.team)).size === 2);

  const enemyOwn = twoAircraftSnapshot.players
    .find((state) => state.id === uavEnemy.result.id);
  const targetTeam = uavOwner.result.team;
  const dronePose = uavDronePose(targetTeam, twoAircraftSnapshot.serverTime);
  const eye = [
    enemyOwn.p[0],
    enemyOwn.p[1] + 1.62,
    enemyOwn.p[2],
  ];
  const toDrone = [
    dronePose.x - eye[0],
    dronePose.y - eye[1],
    dronePose.z - eye[2],
  ];
  const horizontal = Math.hypot(toDrone[0], toDrone[2]);
  const droneYaw = Math.atan2(-toDrone[0], -toDrone[2]);
  const dronePitch = Math.atan2(toDrone[1], horizontal);
  const shootUavStart = uavEnemy.messages.length;
  uavEnemy.ws.send(JSON.stringify({
    type: 'input',
    seq: 9000,
    moveX: 0,
    moveZ: 0,
    yaw: droneYaw,
    pitch: dronePitch,
    aim: true,
    trigger: true,
    weapon: 'rifle',
  }));
  const destroyedAircraft = await waitForMessage(
    uavEnemy,
    (message) => message.type === 'uav_destroyed' && message.team === targetTeam,
    shootUavStart
  );
  const aircraftFeedback = await waitForMessage(
    uavEnemy,
    (message) => message.type === 'feedback' && message.uavDestroyed === true,
    shootUavStart
  );
  uavEnemy.ws.send(JSON.stringify({
    type: 'input',
    seq: 9001,
    moveX: 0,
    moveZ: 0,
    yaw: droneYaw,
    pitch: dronePitch,
    trigger: false,
    weapon: 'rifle',
  }));
  const endedTeamUav = await waitForMessage(
    uavTeammate,
    (message) => message.type === 'snapshot'
      && message.you?.streaks?.uavTime === 0
      && !message.uavDrones?.some((drone) => drone.team === targetTeam),
    duplicateUavStart
  );
  check('enemy fire receives a hit marker, shows no health-bar target and ends UAV early',
    destroyedAircraft.killerId === uavEnemy.result.id
      && aircraftFeedback.killed === 0
      && aircraftFeedback.targets?.length === 0
      && endedTeamUav.you.streaks.uavTime === 0,
    JSON.stringify({ destroyedAircraft, aircraftFeedback }));

  const heavyAbilityStart = juggernautOwner.messages.length;
  juggernautOwner.ws.send(JSON.stringify({
    type: 'ability',
    ability: 'cas',
    start: [-24, 4],
    end: [-14, 4],
  }));
  await wait(180);
  const heavyAbilityMessages = juggernautOwner.messages.slice(heavyAbilityStart);
  const heavyAbilitySnapshot = [...heavyAbilityMessages]
    .reverse()
    .find((message) => message.type === 'snapshot');
  check('the authoritative Juggernaut cannot activate a carried killstreak',
    !heavyAbilityMessages.some((message) => message.type === 'cas_run')
      && heavyAbilitySnapshot?.you?.streaks?.cas === 1);

  /* ---- close air support: fixed plan, delayed deterministic gun run ---- */
  // Use a normal soldier: the transformed third client deliberately retains
  // its charge but authority now rejects all Juggernaut killstreak requests.
  const casOperator = joined[3];
  const casStart = casOperator.messages.length;
  casOperator.ws.send(JSON.stringify({
    type: 'ability',
    ability: 'cas',
    start: [-24, 4],
    // Deliberately only ten metres away: authority must preserve this short
    // run now that only the maximum distance is constrained.
    end: [-14, 4],
  }));
  const casEvent = await waitForMessage(
    casOperator,
    (message) => message.type === 'cas_run',
    casStart
  );
  const casActivation = await waitForStreakActivation(casOperator, 'cas', casStart);
  check('accepted A-10 calls identify their contributor',
    casActivation.ownerId === casOperator.result.id
      && casActivation.name === casOperator.result.name
      && casActivation.team === casOperator.result.team,
    JSON.stringify(casActivation));
  const casSnapshot = await waitForMessage(
    casOperator,
    (message) => message.type === 'snapshot' && message.casRuns?.length === 1,
    casStart
  );
  const casInboundVoice = await waitForMessage(
    casOperator,
    (message) => message.type === 'streak_voice'
      && message.cue === 'cas_inbound',
    casStart
  );
  const casPlan = casSnapshot.casRuns[0];
  const casLength = Math.hypot(
    casPlan.end[0] - casPlan.start[0],
    casPlan.end[1] - casPlan.start[1]
  );
  check('PVP authority preserves a short run instead of enforcing a minimum distance',
    casEvent.ownerId === casOperator.result.id
      && Math.abs(casLength - 10) < 0.05
      && casPlan.seed === casEvent.seed,
    JSON.stringify({ casEvent, casPlan, casLength }));
  check('tasking the A-10 spends exactly one authoritative charge',
    casSnapshot.you?.streaks?.cas === 0,
    JSON.stringify(casSnapshot.you?.streaks));
  check('A-10 inbound radio is delivered only to its operator after acceptance',
    Number.isInteger(casInboundVoice.seed)
      && joined.filter((client) => client !== casOperator).every((client) =>
        !client.messages.some((message) =>
          message.type === 'streak_voice' && message.cue === 'cas_inbound')));

  /* ---- B-2 firebomb pass: server-normalized path and delayed impacts ---- */
  const firebombOperator = joined[10];
  const firebombStart = firebombOperator.messages.length;
  firebombOperator.ws.send(JSON.stringify({
    type: 'ability',
    ability: 'firebomb',
    // Only this vertical line coordinate is accepted by authority.
    z: 11.5,
    start: [9999, 9999],
    end: [-9999, -9999],
  }));
  const firebombEvent = await waitForMessage(
    firebombOperator,
    (message) => message.type === 'firebomb_run',
    firebombStart
  );
  const firebombActivation = await waitForStreakActivation(
    firebombOperator,
    'firebomb',
    firebombStart
  );
  check('accepted incendiary airstrikes identify their contributor',
    firebombActivation.ownerId === firebombOperator.result.id
      && firebombActivation.name === firebombOperator.result.name
      && firebombActivation.team === firebombOperator.result.team,
    JSON.stringify(firebombActivation));
  const firebombSnapshot = await waitForMessage(
    firebombOperator,
    (message) => message.type === 'snapshot'
      && message.firebombRuns?.some((run) => run.id === firebombEvent.id),
    firebombStart
  );
  const firebombInboundVoice = await waitForMessage(
    firebombOperator,
    (message) => message.type === 'streak_voice'
      && message.cue === 'firebomb_inbound',
    firebombStart
  );
  const firebombPlan = firebombSnapshot.firebombRuns.find(
    (run) => run.id === firebombEvent.id
  );
  check('PVP authority ignores forged endpoints and spans the exact map width',
    Math.abs(firebombPlan.start[0] + spawnLevel.bounds.x) < 0.05
      && Math.abs(firebombPlan.end[0] - spawnLevel.bounds.x) < 0.05
      && Math.abs(firebombPlan.start[1] - 11.5) < 0.05
      && Math.abs(firebombPlan.end[1] - 11.5) < 0.05,
    JSON.stringify(firebombPlan));
  check('tasking the B-2 spends exactly one authoritative charge',
    firebombSnapshot.you?.streaks?.firebomb === 0,
    JSON.stringify(firebombSnapshot.you?.streaks));
  check('incendiary airstrike radio is private to the requesting operator',
    Number.isInteger(firebombInboundVoice.seed)
      && joined.filter((client) => client !== firebombOperator).every((client) =>
        !client.messages.some((message) =>
          message.type === 'streak_voice' && message.cue === 'firebomb_inbound')));
  const firstFirebombImpact = await waitForMessage(
    firebombOperator,
    (message) => message.type === 'firebomb_impact'
      && message.runId === firebombEvent.id
      && message.index === 0,
    firebombStart,
    6000
  );
  const liveFirebombZone = await waitForMessage(
    firebombOperator,
    (message) => message.type === 'incendiary_zone'
      && message.id === firstFirebombImpact.zoneId
      && message.kind === 'firebomb',
    firebombStart
  );
  check('the delayed first bomb creates a server-owned persistent fire zone',
    typeof firstFirebombImpact.zoneId === 'string'
      && firstFirebombImpact.expiresAt > firstFirebombImpact.explodedAt
      && liveFirebombZone.expiresAt === firstFirebombImpact.expiresAt);

  /* ---- attack helicopter: call point, 1100 HP and ten-shot burst ---- */
  const helicopterOperator = joined[11];
  const helicopterStart = helicopterOperator.messages.length;
  helicopterOperator.ws.send(JSON.stringify({
    type: 'ability',
    ability: 'attack_helicopter',
    call: [9999, 9999, 9999],
  }));
  const helicopterEvent = await waitForMessage(
    helicopterOperator,
    (message) => message.type === 'attack_helicopter_call',
    helicopterStart
  );
  const helicopterActivation = await waitForStreakActivation(
    helicopterOperator,
    'attack_helicopter',
    helicopterStart
  );
  check('accepted attack-helicopter calls identify their contributor',
    helicopterActivation.ownerId === helicopterOperator.result.id
      && helicopterActivation.name === helicopterOperator.result.name
      && helicopterActivation.team === helicopterOperator.result.team,
    JSON.stringify(helicopterActivation));
  const helicopterSnapshot = await waitForMessage(
    helicopterOperator,
    (message) => message.type === 'snapshot'
      && message.attackHelicopters?.some((heli) => heli.id === helicopterEvent.id),
    helicopterStart
  );
  const helicopterState = helicopterSnapshot.attackHelicopters.find(
    (heli) => heli.id === helicopterEvent.id
  );
  const helicopterCaller = helicopterSnapshot.players.find(
    (player) => player.id === helicopterOperator.result.id
  );
  check('authority anchors the Apache to the caller instead of client coordinates',
    Math.hypot(
      helicopterState.call[0] - helicopterCaller.p[0],
      helicopterState.call[2] - helicopterCaller.p[2]
    ) < 0.25
      && helicopterState.health === 1100
      && helicopterState.maxHealth === 1100
      && helicopterSnapshot.you?.streaks?.attack_helicopter === 0,
    JSON.stringify({ helicopterState, caller: helicopterCaller.p }));
  check('the accepted Apache call carries one owner-side radio seed',
    Number.isInteger(helicopterEvent.voiceSeed));
  await waitForMessage(
    helicopterOperator,
    () => helicopterOperator.messages.slice(helicopterStart)
      .filter((message) => message.type === 'attack_helicopter_fire'
        && message.id === helicopterEvent.id).length >= 10,
    helicopterStart,
    11000
  );
  const helicopterBurst = helicopterOperator.messages.slice(helicopterStart)
    .filter((message) => message.type === 'attack_helicopter_fire'
      && message.id === helicopterEvent.id)
    .slice(0, 10);
  check('the first authoritative Apache burst contains ten guaranteed hits',
    helicopterBurst.length === 10
      && helicopterBurst.every((shot) =>
        shot.hit === true
        && typeof shot.targetId === 'string'
        && Array.isArray(shot.origin)
        && Array.isArray(shot.target)),
    JSON.stringify(helicopterBurst));
  const casOutcomeVoice = await waitForMessage(
    casOperator,
    (message) => message.type === 'streak_voice'
      && (message.cue === 'cas_hit' || message.cue === 'cas_miss'),
    casStart,
    1500
  );
  check('A-10 reports hit or miss 0.2 seconds after its authoritative gun run',
    Number.isInteger(casOutcomeVoice.seed)
      && joined.filter((client) => client !== casOperator).every((client) =>
        !client.messages.some((message) =>
          message.type === 'streak_voice'
            && (message.cue === 'cas_hit' || message.cue === 'cas_miss'))));

  /* ---- TV missile: the server, not the client, decides where it lands ---- */
  // Deliberately not joined[0]: the firing/reload probe below reuses that
  // socket and restarts its input sequence at 1, which the server's replay
  // guard would reject after this test advances the counter.
  const missileOperator = joined[3];
  const missileStart = missileOperator.messages.length;
  const missileEnemy = joined.find((client) =>
    client.result.team !== missileOperator.result.team);
  const missileEnemyStart = missileEnemy.messages.length;
  missileOperator.ws.send(JSON.stringify({ type: 'ability', ability: 'strike' }));
  const missileLaunch = await waitForMessage(
    missileOperator,
    (message) => message.type === 'strike_launch',
    missileStart
  );
  const missileActivation = await waitForStreakActivation(
    missileOperator,
    'strike',
    missileStart
  );
  check('accepted TV-missile launches identify their contributor',
    missileActivation.ownerId === missileOperator.result.id
      && missileActivation.name === missileOperator.result.name
      && missileActivation.team === missileOperator.result.team,
    JSON.stringify(missileActivation));
  const enemyMissileVoice = await waitForMessage(
    missileEnemy,
    (message) => message.type === 'streak_voice'
      && message.cue === 'enemy_tv_missile_inbound',
    missileEnemyStart
  );
  const firstMissileSnapshot = await waitForMessage(
    missileOperator,
    (message) => message.type === 'snapshot' && message.missiles?.length === 1,
    missileStart
  );
  const spawned = firstMissileSnapshot.missiles[0];
  check('the missile spawns high over the middle of the map, not at a chosen point',
    missileLaunch.ownerId === missileOperator.result.id
      && Math.hypot(spawned.p[0], spawned.p[2]) < 2
      && spawned.p[1] > 100,
    JSON.stringify(spawned));

  let missileSeq = 5000;
  missileOperator.ws.send(JSON.stringify({
    type: 'input',
    seq: missileSeq,
    moveX: 0,
    moveZ: 0,
    // Deliberately malicious transition-frame look values: authority must
    // retain the fixed downward launch corridor.
    yaw: spawned.yaw + 2.4,
    pitch: -0.08,
    weapon: 'rifle',
    missileControl: true,
    missileBoost: true,
  }));
  const boostedSnapshot = await waitForMessage(
    missileOperator,
    (message) => message.type === 'snapshot'
      && message.missiles?.[0]?.diving === true,
    missileStart
  );
  check('the server accepts one early terminal-boost request while the missile is still high',
    boostedSnapshot.missiles[0].p[1] > 80
      && boostedSnapshot.missiles[0].diving === true
      && Math.abs(boostedSnapshot.missiles[0].yaw - spawned.yaw) < 0.01
      && Math.abs(boostedSnapshot.missiles[0].pitch - spawned.pitch) < 0.01,
    JSON.stringify(boostedSnapshot.missiles[0]));

  // The camera transition deliberately owns the first half-second. Steering
  // packets sent during it are ignored by both client and server.
  await wait(550);

  // Emulate continuous mouse motion with a fresh requested heading in every
  // packet while ALSO lying about position. Repeating one final heading must
  // not create residual steering after the mouse stops.
  for (let i = 0; i < 24; i++) {
    const progress = (i + 1) / 24;
    missileOperator.ws.send(JSON.stringify({
      type: 'input',
      seq: ++missileSeq,
      moveX: 0,
      moveZ: 0,
      yaw: spawned.yaw + progress * 1.1,
      pitch: spawned.pitch + progress * 0.2,
      weapon: 'rifle',
      missileControl: true,
      p: [999, 999, 999],
    }));
    await wait(12);
  }
  const steeredSnapshot = await waitForMessage(
    missileOperator,
    (message) => message.type === 'snapshot' && message.missiles?.length === 1,
    missileOperator.messages.length - 1
  );
  const steered = steeredSnapshot.missiles[0];
  check('streamed steering turns the missile and its altitude keeps falling',
    Math.abs(steered.yaw - spawned.yaw) > 0.05
      && steered.p[1] < spawned.p[1],
    JSON.stringify({ spawned, steered }));
  check('a client that asserts its own missile position is ignored',
    Math.hypot(steered.p[0], steered.p[2]) < 200 && steered.p[1] < 200,
    JSON.stringify(steered));

  const operatorFrozen = steeredSnapshot.players
    .find((p) => p.id === missileOperator.result.id);
  check('the operator body stays put and remains a target while flying',
    operatorFrozen && operatorFrozen.alive
      && Math.max(...operatorFrozen.p.map(Math.abs)) < 200,
    JSON.stringify(operatorFrozen));

  const chargeSnapshot = steeredSnapshot;
  check('launching the missile spends exactly one strike charge',
    chargeSnapshot.you?.streaks?.strike === 0,
    JSON.stringify(chargeSnapshot.you?.streaks));
  check('only the opposing team receives the squad-leader missile warning',
    Number.isInteger(enemyMissileVoice.seed)
      && joined.filter((client) =>
        client.result.team === missileOperator.result.team).every((client) =>
        !client.messages.some((message) =>
          message.type === 'streak_voice'
            && message.cue === 'enemy_tv_missile_inbound')));

  // Give the final in-flight input time to reach one server tick, then compare
  // two later snapshots while no new mouse heading is sent.
  await wait(120);
  const settledSnapshot = await waitForMessage(
    missileOperator,
    (message) => message.type === 'snapshot' && message.missiles?.length === 1,
    missileOperator.messages.length - 1
  );
  await wait(260);
  const heldSnapshot = await waitForMessage(
    missileOperator,
    (message) => message.type === 'snapshot' && message.missiles?.length === 1,
    missileOperator.messages.length - 1
  );
  const settledMissile = settledSnapshot.missiles[0];
  const heldMissile = heldSnapshot.missiles[0];
  check('the authoritative missile stops turning when mouse input stops',
    Math.abs(heldMissile.yaw - settledMissile.yaw) < 0.01
      && Math.abs(heldMissile.pitch - settledMissile.pitch) < 0.01,
    JSON.stringify({ settled: settledMissile, held: heldMissile }));

  // Stop steering entirely: the missile must still come down on its own.
  const impact = await waitForMessage(
    missileOperator,
    (message) => message.type === 'strike_impact',
    missileOperator.messages.length - 1,
    20000
  );
  check('an unsteered missile still dives and resolves on the ground',
    impact.ownerId === missileOperator.result.id
      && Number.isFinite(impact.x) && Number.isFinite(impact.z),
    JSON.stringify(impact));
  const clearedSnapshot = await waitForMessage(
    missileOperator,
    (message) => message.type === 'snapshot' && (message.missiles?.length || 0) === 0,
    missileOperator.messages.length - 1
  );
  check('the missile leaves the snapshot stream once it detonates',
    (clearedSnapshot.missiles?.length || 0) === 0);

  const chatSender = joined[0];
  const chatReceiver = joined[1];
  const otherRoom = await connectAndJoin(20, { roomId: 'room-2', name: 'OTHER-ROOM' });
  clients.push(otherRoom);
  const receiverChatStart = chatReceiver.messages.length;
  const otherRoomChatStart = otherRoom.messages.length;
  chatSender.ws.send(JSON.stringify({
    type: 'chat',
    text: '  你好\u0000   SQUAD READY  ',
  }));
  const chat = await waitForMessage(
    chatReceiver,
    (message) => message.type === 'chat',
    receiverChatStart
  );
  await wait(80);
  check('room chat broadcasts sanitized Unicode with authoritative identity',
    chat.playerId === chatSender.result.id
      && chat.name === chatSender.result.name
      && chat.team === chatSender.result.team
      && chat.text === '你好 SQUAD READY',
    JSON.stringify(chat));
  check('room chat never leaks into a different room',
    !otherRoom.messages.slice(otherRoomChatStart).some((message) => message.type === 'chat'));

  const chatRateStart = chatSender.messages.length;
  chatSender.ws.send(JSON.stringify({ type: 'chat', text: 'TOO FAST' }));
  const chatRateLimit = await waitForMessage(
    chatSender,
    (message) => message.type === 'chat_error',
    chatRateStart
  );
  check('server throttles room-chat spam',
    chatRateLimit.code === 'RATE_LIMIT' && chatRateLimit.retryAfter >= 1,
    JSON.stringify(chatRateLimit));

  const probe = joined[0];
  const voiceTeammate = joined.find((client) =>
    client !== probe && client.result.team === probe.result.team);
  const voiceEnemy = joined.find((client) =>
    client.result.team !== probe.result.team);
  let snapshots = 0;
  let lastOwn = null;
  let lastSnapshot = null;
  const reloadCycleStarts = new Set();
  probe.ws.on('message', (raw, isBinary) => {
    const message = probe.decode(raw, isBinary);
    if (message.type !== 'snapshot') return;
    snapshots++;
    lastSnapshot = message;
    lastOwn = message.players.find((p) => p.id === probe.result.id);
    if (message.you?.reloading) reloadCycleStarts.add(message.you.reloading.startedAt);
  });
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 1,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    p: [999999, 999999, 999999],
    health: 999999,
    ammo: 999999,
  }));
  await wait(1080);
  const expectedSnapshots = PVP_TICK_RATE * 1.08;
  check(`snapshots arrive at the configured ${PVP_TICK_RATE} Hz cadence`,
    snapshots >= Math.floor(expectedSnapshots - 4)
      && snapshots <= Math.ceil(expectedSnapshots + 4),
    `received ${snapshots}`);
  check('client-supplied position and stats are ignored',
    lastOwn && Math.max(...lastOwn.p.map(Math.abs)) < 200
      && lastOwn.health <= 100,
    JSON.stringify(lastOwn));

  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 2,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    trigger: true,
  }));
  await wait(130);
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 3,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    trigger: false,
  }));
  await wait(100);
  const preReloadMag = lastSnapshot?.you?.ammo?.rifle?.mag;
  check('authoritative firing consumes server ammo',
    Number.isFinite(preReloadMag) && preReloadMag < 30,
    `rifle mag ${preReloadMag}`);

  const reloadVoiceStart = probe.messages.length;
  const teammateReloadVoiceStart = voiceTeammate.messages.length;
  const enemyReloadVoiceStart = voiceEnemy.messages.length;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 4,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    reload: true,
    trigger: false,
  }));
  const ownReloadVoice = await waitForMessage(
    probe,
    (message) => message.type === 'operator_voice'
      && message.actorId === probe.result.id
      && message.action === 'reload',
    reloadVoiceStart
  );
  const teammateReloadVoice = await waitForMessage(
    voiceTeammate,
    (message) => message.type === 'operator_voice'
      && message.actorId === probe.result.id
      && message.action === 'reload',
    teammateReloadVoiceStart
  );
  await wait(80);
  check('an accepted reload broadcasts one seeded operator callout to the squad',
    ownReloadVoice.name === probe.result.name
      && ownReloadVoice.team === probe.result.team
      && ownReloadVoice.seed === teammateReloadVoice.seed
      && Array.isArray(ownReloadVoice.p)
      && ownReloadVoice.p.length === 3,
    JSON.stringify(ownReloadVoice));
  check('enemy players never receive squad operator callouts',
    !voiceEnemy.messages.slice(enemyReloadVoiceStart).some((message) =>
      message.type === 'operator_voice' && message.actorId === probe.result.id));
  await wait(140);
  const firingBeforeBlockedTrigger = lastOwn?.firing;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 5,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    trigger: true,
  }));
  await wait(320);
  check('magazine reload uses one stable server cycle',
    reloadCycleStarts.size === 1 && lastSnapshot?.you?.reloading?.weapon === 'rifle',
    `cycles ${[...reloadCycleStarts].join(', ')}`);
  check('holding fire during magazine reload cannot shoot',
    lastOwn?.firing === firingBeforeBlockedTrigger
      && lastSnapshot?.you?.ammo?.rifle?.mag === preReloadMag,
    `firing ${firingBeforeBlockedTrigger} -> ${lastOwn?.firing}, mag ${lastSnapshot?.you?.ammo?.rifle?.mag}`);
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 6,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    trigger: false,
  }));
  await wait(2050);
  check('authoritative reload completes once and fills the magazine',
    !lastSnapshot?.you?.reloading && lastSnapshot?.you?.ammo?.rifle?.mag === 30,
    JSON.stringify(lastSnapshot?.you?.reloading || lastSnapshot?.you?.ammo?.rifle));
  check('spawn protection expires after three seconds',
    lastOwn?.invulnerable === false,
    JSON.stringify({ invulnerable: lastOwn?.invulnerable }));

  const cadenceStart = lastOwn?.firing || 0;
  const cadenceMag = lastSnapshot?.you?.ammo?.rifle?.mag;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 7,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 1.25,
    weapon: 'rifle',
    trigger: true,
  }));
  await wait(1000);
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 8,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 1.25,
    weapon: 'rifle',
    trigger: false,
  }));
  await wait(180);
  const cadenceShots = (lastOwn?.firing || 0) - cadenceStart;
  check(`${PVP_TICK_RATE} Hz authoritative automatic fire keeps the configured cadence`,
    cadenceShots >= 11 && cadenceShots <= 13
      && cadenceMag - lastSnapshot?.you?.ammo?.rifle?.mag === cadenceShots,
    `shots ${cadenceShots}, mag ${cadenceMag} -> ${lastSnapshot?.you?.ammo?.rifle?.mag}`);
  const releasedFiring = lastOwn?.firing;
  const releasedMag = lastSnapshot?.you?.ammo?.rifle?.mag;
  await wait(220);
  check('releasing the trigger cannot consume a hidden post-reload round',
    lastOwn?.firing === releasedFiring
      && lastSnapshot?.you?.ammo?.rifle?.mag === releasedMag,
    `firing ${releasedFiring} -> ${lastOwn?.firing}, mag ${releasedMag} -> ${lastSnapshot?.you?.ammo?.rifle?.mag}`);

  const jumpBaseY = lastOwn?.p?.[1] ?? 0;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 9,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    jump: true,
  }));
  // Release before the next server tick. The edge must remain queued.
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 10,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    jump: false,
  }));
  await wait(90);
  check('a short jump tap is buffered across authoritative ticks',
    (lastOwn?.p?.[1] ?? jumpBaseY) > jumpBaseY + 0.08 && lastOwn?.grounded === false,
    `y ${jumpBaseY} -> ${lastOwn?.p?.[1]}, grounded ${lastOwn?.grounded}`);

  const grenadeCookStart = probe.messages.length;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 11,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: true,
    grenadePin: true,
    aim: false,
    trigger: false,
  }));
  // A neutral packet arriving before the simulation tick used to erase the
  // one-frame pin request. The authority must buffer it on receipt.
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 12,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: false,
    aim: false,
    trigger: false,
  }));
  const pin = await waitForMessage(
    probe,
    (message) => message.type === 'grenade_pin',
    grenadeCookStart
  );
  const cookedCount = await waitForMessage(
    probe,
    (message) => message.type === 'snapshot' && message.you?.grenades === 1,
    grenadeCookStart
  );
  const cookedExplosion = await waitForMessage(
    probe,
    (message) => message.type === 'grenade_explode',
    grenadeCookStart,
    6000
  );
  const selfKilled = await waitForMessage(
    probe,
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === probe.result.id)?.alive === false,
    grenadeCookStart
  );
  check('a quick pin command survives a newer neutral input and starts a five-second fuse',
    pin.remaining === 1
      && cookedCount.you.grenades === 1
      && Math.abs(pin.fuseAt - cookedExplosion.explodedAt) <= 150,
    JSON.stringify({ pin, explosion: cookedExplosion }));
  check('a grenade cooked in hand can damage and kill its owner',
    selfKilled.players.find((player) => player.id === probe.result.id)?.health === 0);

  const martyrdomThrow = await waitForMessage(
    probe,
    (message) => message.type === 'grenade_throw'
      && message.ownerId === probe.result.id
      && message.source === 'martyrdom',
    grenadeCookStart
  );
  const martyrdomExplosion = await waitForMessage(
    probe,
    (message) => message.type === 'grenade_explode'
      && message.id === martyrdomThrow.id,
    grenadeCookStart,
    2500
  );
  const martyrdomRestSyncs = probe.messages
    .slice(grenadeCookStart)
    .filter((message) => message.type === 'grenade_sync'
      && message.id === martyrdomThrow.id);
  check('Martyrdom drops one server-authoritative frag without consuming inventory',
    martyrdomThrow.kind === 'frag'
      && martyrdomThrow.remaining === 1
      && martyrdomThrow.thrownAt === martyrdomThrow.droppedAt
      && Array.isArray(martyrdomThrow.p)
      && Array.isArray(martyrdomThrow.v)
      && martyrdomThrow.v.every((value) => Number(value) === 0),
    JSON.stringify(martyrdomThrow));
  check('the Martyrdom grenade explodes after the requested 1.3-second delay',
    martyrdomThrow.detonateAt - martyrdomThrow.droppedAt
        === PASSIVE_TUNING.martyrdomFuseSeconds * 1000
      && martyrdomExplosion.explodedAt >= martyrdomThrow.detonateAt
      && martyrdomExplosion.explodedAt - martyrdomThrow.detonateAt <= 80,
    JSON.stringify({ martyrdomThrow, martyrdomExplosion }));
  check('PVP sends one final grenade rest point without in-flight bounce corrections',
    martyrdomRestSyncs.length === 1
      && martyrdomRestSyncs[0].resting === true
      && martyrdomRestSyncs[0].v.every((value) => Number(value) === 0),
    JSON.stringify(martyrdomRestSyncs));

  const autoRespawnStart = probe.messages.length;
  const automaticRespawn = await waitForMessage(
    probe,
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === probe.result.id)?.alive === true
      && message.you?.grenades === 2,
    autoRespawnStart,
    6000
  );
  check('an expired death timer automatically respawns with the current loadout',
    automaticRespawn.players.find((player) => player.id === probe.result.id)?.alive === true
      && automaticRespawn.you.grenades === 2);

  const manualDeathStart = probe.messages.length;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 13,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: true,
    grenadePin: true,
    aim: false,
    trigger: false,
  }));
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 14,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: false,
    aim: false,
    trigger: false,
  }));
  await waitForMessage(
    probe,
    (message) => message.type === 'grenade_explode'
      && message.ownerId === probe.result.id,
    manualDeathStart,
    6000
  );
  const manualDeath = await waitForMessage(
    probe,
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === probe.result.id)?.alive === false,
    manualDeathStart,
    6000
  );
  const loadoutRequestStart = probe.messages.length;
  probe.ws.send(JSON.stringify({ type: 'respawn_loadout' }));
  const loadoutRequest = await waitForMessage(
    probe,
    (message) => message.type === 'respawn_loadout_ok',
    loadoutRequestStart
  );
  check('pressing Enter can reserve the next spawn for manual loadout selection',
    loadoutRequest.respawnAt >= manualDeath.serverTime);
  await wait(4700);
  const eligibleDead = [...probe.messages].reverse().find(
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === probe.result.id)?.alive === false
      && message.serverTime - manualDeath.serverTime >= 4200
  );
  check('a manual loadout request suppresses the default automatic respawn',
    eligibleDead?.players?.find((player) => player.id === probe.result.id)?.alive === false);
  probe.loadout = {
    ...probe.loadout,
    grenade: 'molotov',
    melee: 'laser_blade',
    passives: [PASSIVE_IDS.READY_FOR_ACTION],
  };
  const redeployStart = probe.messages.length;
  probe.ws.send(JSON.stringify({ type: 'deploy', loadout: probe.loadout }));
  const grenadeRespawn = await waitForMessage(
    probe,
    (message) => message.type === 'snapshot'
      && message.players?.find((player) => player.id === probe.result.id)?.alive === true
      && message.you?.grenades === 2,
    redeployStart,
    3000
  );
  check('confirmed loadout deployment restores the per-life grenade count',
    grenadeRespawn.you.grenades === 2
      && grenadeRespawn.you.readyActive === true
      && PASSIVE_TUNING.readyForActionDurationSeconds === 10);

  const quickThrowStart = probe.messages.length;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 15,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: true,
    grenadeThrow: true,
    aim: false,
    trigger: false,
  }));
  // Reproduce the real intermittent race: a release/neutral packet reaches
  // handleInput before the next authoritative tick.
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 16,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: false,
    aim: false,
    trigger: false,
  }));
  const quickThrow = await waitForMessage(
    probe,
    (message) => message.type === 'grenade_throw'
      && message.ownerId === probe.result.id,
    quickThrowStart
  );
  const quickThrowVoice = await waitForMessage(
    probe,
    (message) => message.type === 'operator_voice'
      && message.actorId === probe.result.id
      && message.action === 'molotov',
    quickThrowStart
  );
  check('a quick PVP throw survives a newer neutral packet and creates a visible projectile',
    quickThrow.remaining === 1
      && quickThrow.kind === 'molotov'
      && Number.isFinite(quickThrow.thrownAt)
      && quickThrow.detonateAt - quickThrow.thrownAt === GRENADE_FUSE_SECONDS * 1000
      && Array.isArray(quickThrow.p)
      && Array.isArray(quickThrow.v)
      && quickThrow.v.some((value) => Math.abs(Number(value) || 0) > 1),
    JSON.stringify(quickThrow));
  check('Molotov throws use the separate authoritative Molotov voice group',
    Number.isInteger(quickThrowVoice.seed)
      && quickThrowVoice.team === probe.result.team,
    JSON.stringify(quickThrowVoice));
  const molotovExplosion = await waitForMessage(
    probe,
    (message) => message.type === 'grenade_explode'
      && message.id === quickThrow.id
      && message.kind === 'molotov',
    quickThrowStart,
    2400
  );
  const molotovZone = await waitForMessage(
    probe,
    (message) => message.type === 'incendiary_zone'
      && message.id === quickThrow.id
      && message.kind === 'molotov',
    quickThrowStart,
    2200
  );
  check('the authoritative Molotov shatters on contact into an 8.75-second fire field',
    molotovExplosion.detonateAt === undefined
      && quickThrow.detonateAt - molotovExplosion.explodedAt > 2500
      && molotovExplosion.expiresAt - molotovExplosion.explodedAt
        === MOLOTOV_DURATION_SECONDS * 1000
      && molotovZone.expiresAt === molotovExplosion.expiresAt
      && molotovZone.ownerId === probe.result.id
      && Array.isArray(molotovZone.p),
    JSON.stringify({ molotovExplosion, molotovZone }));

  const initiator = joined[0];
  const target = joined[11];
  const initiatorStart = initiator.messages.length;
  initiator.ws.send(JSON.stringify({
    type: 'vote_kick_start',
    targetId: target.result.id,
  }));
  const started = await waitForMessage(
    initiator,
    (message) => message.type === 'vote_kick_started',
    initiatorStart
  );
  const initialVote = await waitForMessage(
    initiator,
    (message) => message.type === 'snapshot'
      && message.voteKick?.id === started.id
      && message.voteKick.yes === 1,
    initiatorStart
  );
  check('initiator automatically votes yes and strict majority is seven of twelve',
    initialVote.voteKick?.yourVote === 'yes'
      && initialVote.voteKick?.canVote === false
      && initialVote.voteKick?.required === 7,
    JSON.stringify(initialVote.voteKick));

  const targetVoteStart = target.messages.length;
  target.ws.send(JSON.stringify({ type: 'vote_kick_vote', vote: 'yes' }));
  const targetRejected = await waitForMessage(
    target,
    (message) => message.type === 'vote_kick_error',
    targetVoteStart
  );
  check('the target player cannot vote',
    targetRejected.code === 'NOT_ELIGIBLE',
    JSON.stringify(targetRejected));

  for (let i = 1; i <= 5; i++) {
    joined[i].ws.send(JSON.stringify({ type: 'vote_kick_vote', vote: 'yes' }));
  }
  const sixYes = await waitForMessage(
    initiator,
    (message) => message.type === 'snapshot'
      && message.voteKick?.id === started.id
      && message.voteKick.yes === 6,
    initiator.messages.length
  );
  check('six of twelve is not enough to kick', sixYes.voteKick?.required === 7);
  check('target remains connected below the majority threshold',
    !target.messages.some((message) => message.type === 'kicked'));

  const targetKickStart = target.messages.length;
  joined[6].ws.send(JSON.stringify({ type: 'vote_kick_vote', vote: 'yes' }));
  const kicked = await waitForMessage(
    target,
    (message) => message.type === 'kicked',
    targetKickStart
  );
  check('seventh yes vote kicks the target for six hours',
    kicked.reason === 'VOTE_KICK'
      && kicked.banUntil - Date.now() > 6 * 60 * 60 * 1000 - 5000,
    JSON.stringify(kicked));

  const cooldownStart = initiator.messages.length;
  initiator.ws.send(JSON.stringify({
    type: 'vote_kick_start',
    targetId: joined[10].result.id,
  }));
  const cooldown = await waitForMessage(
    initiator,
    (message) => message.type === 'vote_kick_error',
    cooldownStart
  );
  check('initiator cannot start another vote during the two-minute cooldown',
    cooldown.code === 'COOLDOWN' && cooldown.retryAfter > 110,
    JSON.stringify(cooldown));

  const bannedReconnect = await connectAndJoin(99, {
    clientId: testClientId(12),
    name: 'TEST-12',
  });
  clients.push(bannedReconnect);
  check('kicked browser identity cannot re-enter the room',
    bannedReconnect.result.type === 'join_error'
      && bannedReconnect.result.code === 'BANNED'
      && bannedReconnect.result.retryAfter > 21590,
    JSON.stringify(bannedReconnect.result));

  const roomAfterKick = await fetch(`${HTTP}/api/pvp/rooms`).then((response) => response.json());
  check('authoritative room population drops after the kick',
    roomAfterKick.rooms[0]?.players === 11,
    JSON.stringify(roomAfterKick.rooms[0]));

  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 17,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'laser_blade',
    trigger: false,
  }));
  await wait(500);
  const knifeFiringStart = lastOwn?.firing || 0;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 18,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'laser_blade',
    meleeAttack: true,
    trigger: false,
  }));
  await wait(160);
  check('the authority equips the selected laser blade and accepts one buffered swing',
    lastOwn?.weapon === 'laser_blade'
      && lastOwn?.firing === knifeFiringStart + 1
      && lastSnapshot?.you?.ammo?.laser_blade?.mag === 0
      && lastSnapshot?.you?.ammo?.laser_blade?.reserve === 0,
    JSON.stringify({
      weapon: lastOwn?.weapon,
      firing: [knifeFiringStart, lastOwn?.firing],
      ammo: lastSnapshot?.you?.ammo?.laser_blade,
    }));
  await wait(600);
  const sprintKnifeFiringStart = lastOwn?.firing || 0;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 19,
    moveX: 0,
    moveZ: -1,
    sprint: true,
    yaw: 0,
    pitch: 0,
    weapon: 'laser_blade',
    meleeAttack: true,
    trigger: false,
  }));
  await wait(180);
  check('a sprinting player can execute the first queued knife attack without losing the click',
    lastOwn?.weapon === 'laser_blade'
      && lastOwn?.sprinting === true
      && lastOwn?.firing === sprintKnifeFiringStart + 1,
    JSON.stringify({
      weapon: lastOwn?.weapon,
      sprinting: lastOwn?.sprinting,
      firing: [sprintKnifeFiringStart, lastOwn?.firing],
    }));
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 20,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    trigger: false,
  }));
  await wait(460);

  const directThrowStart = probe.messages.length;
  probe.ws.send(JSON.stringify({
    type: 'input',
    seq: 21,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    grenade: true,
    aim: false,
    trigger: true,
  }));
  const directThrow = await waitForMessage(
    probe,
    (message) => message.type === 'grenade_throw' && message.ownerId === probe.result.id,
    directThrowStart
  );
  check('left mouse throws immediately without a prior cook',
    directThrow.remaining === 0
      && Number.isFinite(directThrow.thrownAt)
      && directThrow.detonateAt - directThrow.thrownAt === GRENADE_FUSE_SECONDS * 1000
      && directThrow.detonateAt - Date.now() > 4500
      && directThrow.detonateAt - Date.now() <= 5100,
    JSON.stringify(directThrow));
} finally {
  for (const client of clients) client.ws.close();
  child.kill('SIGTERM');
  await wait(80);
}

if (failures) {
  console.log(`\n${failures} PVP check(s) failed\n`);
  process.exit(1);
}
console.log('\nPVP server authoritative, room limits verified\n');
