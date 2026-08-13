import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import * as THREE from 'three';
import { WebSocket } from 'ws';
import { installDomStub } from './domstub.mjs';
import { buildTextures } from '../src/world/textures.js';
import { ViewModel } from '../src/game/viewmodel.js';
import { Effects } from '../src/fx/effects.js';
import {
  LASER_CANNON_CHARGE_SECONDS,
  LASER_CANNON_ID,
  LASER_CANNON_SHOTS,
  laserCannonChargeInputValid,
} from '../src/game/laser-cannon.js';
import { WEAPON_DEFS } from '../src/game/weapons.js';
import { createDefaultLoadout } from '../src/game/loadout.js';
import { PVP_PROTOCOL } from '../src/net/protocol.js';
import {
  createSnapshotDecodeState,
  decodeSnapshotPacket,
} from '../src/net/pvp-wire.js';
import { buildServerLevel, rayWorld } from '../server/world.mjs';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

console.log('\nARC-7 laser-cannon audit\n');
installDomStub();

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
check('PVP keeps a predicted ARC-7 discharge latched until server acknowledgement',
  /pvpRailgunFireCommitUntil = performance\.now\(\) \+ 2500/.test(mainSource)
    && /message\.shooterId === this\.pvp\.playerId[\s\S]{0,180}message\.weapon === LASER_CANNON_ID[\s\S]{0,420}this\.pvpRailgunFireCommitUntil = 0/.test(mainSource)
    && /aim: railgunCommit \? true : cmd\.aim/.test(mainSource)
    && /trigger: railgunCommit \? true : pvpTrigger/.test(mainSource));
check('PVP does not send the predicted one-shot battery reload ahead of authority',
  /this\.pvpReloadQueued = vm\.def\.id === LASER_CANNON_ID && railgunCommit[\s\S]{0,60}\? false[\s\S]{0,30}: true/.test(mainSource)
    && /const reload = Boolean\(this\.pvpReloadQueued && !railgunCommit\)/.test(mainSource));
check('PVP activation uses the same one-shot stow/draw animation as PVE',
  /viewModel\.pendingWeapon !== LASER_CANNON_ID[\s\S]{0,520}viewModel\.equip\(LASER_CANNON_ID\);/.test(mainSource)
    && !/syncPvpLaserCannon\(own\)[\s\S]{0,700}viewModel\.equip\(LASER_CANNON_ID, true\)/.test(mainSource));

const effects = new Effects(new THREE.Scene(), buildTextures());
effects.laserCannonBeam(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 1, -40)
);
const [railHalo, railCore] = effects.tracers;
check('the ARC-7 beam is five times thicker, additive and held for one second before fading',
  railHalo.mesh.scale.x === 17
    && railCore.mesh.scale.x === 7.5
    && railHalo.hold === 1
    && railCore.hold === 1
    && railHalo.max > 1
    && railCore.max > 1
    && railHalo.mesh.material.blending === THREE.AdditiveBlending
    && (mainSource.match(/effects\.laserCannonBeam\(/g) || []).length === 3);

const def = WEAPON_DEFS[LASER_CANNON_ID];
check('the reward carries exactly eight one-round battery shots',
  def.mag === 1
    && def.reserve === LASER_CANNON_SHOTS - 1
    && def.reloadEachShot === true);
check('charge authority requires a settled optic and a held trigger',
  !laserCannonChargeInputValid({
    weaponId: LASER_CANNON_ID,
    trigger: true,
    aim: false,
    adsBlend: 1,
  })
    && !laserCannonChargeInputValid({
      weaponId: LASER_CANNON_ID,
      trigger: true,
      aim: true,
      adsBlend: 0.86,
    })
    && laserCannonChargeInputValid({
      weaponId: LASER_CANNON_ID,
      trigger: true,
      aim: true,
      adsBlend: 0.99,
    }));

const localRailAudio = {
  chargeProgress: [],
  discharges: 0,
  stopped: 0,
  updateRailgunCharge(progress) { this.chargeProgress.push(progress); },
  stopRailgunCharge() { this.stopped++; },
  shot(profile) { if (profile?.kind === 'railgun') this.discharges++; },
  reload() {},
  dryFire() {},
};
const vm = new ViewModel({
  textures: buildTextures(),
  audio: localRailAudio,
  settings: { fov: 80, viewBob: 1 },
  team: 'blue',
});
vm.equip(LASER_CANNON_ID, true);
let localShots = 0;
vm.onShoot = () => { localShots++; };
const updateVm = (overrides = {}) => vm.update(1 / 60, {
  trigger: false,
  aim: false,
  reload: false,
  sprinting: false,
  sliding: false,
  moveSpeed: 0,
  grounded: true,
  crouch: false,
  lookDx: 0,
  lookDy: 0,
  landImpact: 0,
  dead: false,
  canAct: true,
  ...overrides,
});

for (let frame = 0; frame < 150; frame++) {
  updateVm({ trigger: true, aim: false });
}
check('holding fire without ADS cannot discharge the cannon', localShots === 0);
updateVm();

for (let shot = 0; shot < LASER_CANNON_SHOTS; shot++) {
  const before = localShots;
  for (let frame = 0; frame < 150 && localShots === before; frame++) {
    updateVm({ trigger: true, aim: true });
  }
  const ammo = vm.ammo[LASER_CANNON_ID];
  check(`shot ${shot + 1} breaks ADS and empties the one-round chamber`,
    localShots === before + 1
      && vm.scoped === false
      && vm.adsBlend === 0
      && ammo.mag === 0,
    JSON.stringify({
      shots: localShots,
      scoped: vm.scoped,
      adsBlend: vm.adsBlend,
      ammo,
    }));
  if (shot < LASER_CANNON_SHOTS - 1) {
    const afterShot = localShots;
    for (let frame = 0; frame < 240; frame++) {
      updateVm({ trigger: true, aim: true });
    }
    check(`shot ${shot + 1} forces a full reload and requires trigger release`,
      localShots === afterShot
        && vm.reloading === false
        && ammo.mag === 1
        && ammo.reserve === LASER_CANNON_SHOTS - shot - 2);
    updateVm();
  }
}
check('the eighth discharge leaves no ammunition to refill',
  localShots === LASER_CANNON_SHOTS
    && vm.ammo[LASER_CANNON_ID].mag === 0
    && vm.ammo[LASER_CANNON_ID].reserve === 0);
check('the local viewmodel drives charge audio and one discharge per shot',
  localRailAudio.chargeProgress.some((progress) => progress > 0 && progress < 1)
    && localRailAudio.discharges === LASER_CANNON_SHOTS
    && localRailAudio.stopped > 0);

const PORT = 18329;
const HTTP = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}/pvp`;
const child = spawn(process.execPath, ['serve.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'test',
    PVP_TEST_AUTH_BYPASS: '1',
    PVP_TEST_START_LASER_CANNON_CHARGES: '1',
    PVP_TEST_START_UAV_CHARGES: '1',
    PVP_DISABLE_BAN_PERSISTENCE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverError = '';
child.stderr.on('data', (chunk) => { serverError += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${HTTP}/api/pvp/rooms`)).ok) return;
    } catch {}
    await wait(50);
  }
  throw new Error(`laser-cannon PVP server did not start: ${serverError}`);
}

async function connect(index, loadout) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    const messages = [];
    const decodeState = createSnapshotDecodeState();
    let joined = null;
    const timer = setTimeout(() => reject(new Error('laser client timeout')), 5000);
    ws.on('message', (raw, binary) => {
      const message = binary
        ? decodeSnapshotPacket(raw, decodeState)
        : JSON.parse(raw.toString());
      messages.push(message);
      if (message.type === 'hello') {
        ws.send(JSON.stringify({
          type: 'join',
          protocol: PVP_PROTOCOL,
          roomId: 'room-1',
          name: `LASER-${index}`,
          clientId: String(index).padStart(32, '0'),
        }));
      } else if (message.type === 'joined') {
        joined = message;
        decodeState.playerId = message.id;
        ws.send(JSON.stringify({ type: 'deploy', loadout }));
      } else if (joined && message.type === 'snapshot'
        && message.players.find((player) => player.id === joined.id)?.alive) {
        clearTimeout(timer);
        resolve({ ws, messages, id: joined.id, team: joined.team });
      }
    });
    ws.on('error', reject);
  });
}

async function messageAfter(client, start, predicate, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (let i = start; i < client.messages.length; i++) {
      if (predicate(client.messages[i])) return client.messages[i];
    }
    await wait(10);
  }
  throw new Error(`laser message timeout; server=${serverError}`);
}

const clients = [];
try {
  await waitForServer();
  const ownerLoadout = createDefaultLoadout();
  ownerLoadout.streaks = [LASER_CANNON_ID, 'uav', 'strike'];
  const targetLoadout = createDefaultLoadout();
  const owner = await connect(101, ownerLoadout);
  const target = await connect(102, targetLoadout);
  const teammate = await connect(103, targetLoadout);
  clients.push(owner, target, teammate);
  check('laser-cannon voice audit has one friendly and one enemy listener',
    owner.team === teammate.team && owner.team !== target.team);

  let start = owner.messages.length;
  const teammateVoiceStart = teammate.messages.length;
  const enemyVoiceStart = target.messages.length;
  owner.ws.send(JSON.stringify({ type: 'ability', ability: LASER_CANNON_ID }));
  const equipped = await messageAfter(
    owner,
    start,
    (message) => message.type === 'snapshot'
      && message.players.find((player) => player.id === owner.id)
        ?.weapon === LASER_CANNON_ID
  );
  check('PVP authority spends the charge and forces the scorestreak weapon',
    equipped.you.streaks.railgun === 0
      && equipped.you.ammo.railgun.mag === 1
      && equipped.you.ammo.railgun.reserve === 7);
  const ownerVoice = await messageAfter(
    owner,
    start,
    (message) => message.type === 'operator_voice'
      && message.action === 'laser_cannon'
  );
  const teammateVoice = await messageAfter(
    teammate,
    teammateVoiceStart,
    (message) => message.type === 'operator_voice'
      && message.action === 'laser_cannon'
  );
  await wait(100);
  check('drawing ARC-7 sends one team-wide character callout with the caller name',
    ownerVoice.actorId === owner.id
      && teammateVoice.actorId === owner.id
      && teammateVoice.name === 'LASER-101'
      && teammateVoice.teamWide === true
      && !target.messages.slice(enemyVoiceStart).some((message) =>
        message.type === 'operator_voice' && message.action === 'laser_cannon'));

  owner.ws.send(JSON.stringify({
    type: 'input',
    seq: 1,
    weapon: 'machine_pistol',
    grenade: true,
    aim: false,
    trigger: false,
    yaw: 0,
    pitch: 0,
  }));
  owner.ws.send(JSON.stringify({ type: 'ability', ability: 'uav' }));
  await wait(300);
  const locked = [...owner.messages].reverse()
    .find((message) => message.type === 'snapshot');
  check('active ARC-7 blocks weapon swaps, grenades and other scorestreaks',
    locked.players.find((player) => player.id === owner.id)
      ?.weapon === LASER_CANNON_ID
      && locked.you.grenades === 2
      && locked.you.streaks.uav === 1);

  owner.ws.send(JSON.stringify({
    type: 'input',
    seq: 2,
    weapon: LASER_CANNON_ID,
    aim: false,
    trigger: false,
    yaw: 0,
    pitch: 0,
  }));
  await wait(100);
  const firingBefore = locked.players.find((player) => player.id === owner.id)
    ?.firing || 0;
  owner.ws.send(JSON.stringify({
    type: 'input',
    seq: 3,
    weapon: LASER_CANNON_ID,
    aim: false,
    trigger: true,
    yaw: 0,
    pitch: 0,
  }));
  await wait((LASER_CANNON_CHARGE_SECONDS + 0.25) * 1000);
  let snapshot = [...owner.messages].reverse()
    .find((message) => message.type === 'snapshot');
  check('PVP authority rejects a full unscoped trigger hold',
    snapshot.you.ammo.railgun.mag === 1
      && snapshot.players.find((player) => player.id === owner.id)
        ?.firing === firingBefore);

  owner.ws.send(JSON.stringify({
    type: 'input',
    seq: 4,
    weapon: LASER_CANNON_ID,
    aim: false,
    trigger: false,
    yaw: 0,
    pitch: 0,
  }));
  await wait(1800);
  snapshot = [...owner.messages].reverse()
    .find((message) => message.type === 'snapshot');
  const ownerState = snapshot.players.find((player) => player.id === owner.id);
  const targetState = snapshot.players.find((player) => player.id === target.id);
  const origin = new THREE.Vector3(...ownerState.p)
    .add(new THREE.Vector3(0, 1.62, 0));
  const targetPoint = new THREE.Vector3(...targetState.p)
    .add(new THREE.Vector3(0, 1.25, 0));
  const direction = targetPoint.clone().sub(origin);
  const distance = direction.length();
  direction.multiplyScalar(1 / distance);
  const yaw = Math.atan2(-direction.x, -direction.z);
  const pitch = Math.asin(direction.y);
  const wall = rayWorld(buildServerLevel(), origin, direction, distance - 0.2);

  start = owner.messages.length;
  owner.ws.send(JSON.stringify({
    type: 'input',
    seq: 5,
    weapon: LASER_CANNON_ID,
    aim: true,
    trigger: true,
    yaw,
    pitch,
  }));
  const fired = await messageAfter(
    owner,
    start,
    (message) => message.type === 'snapshot'
      && message.you.reloading?.weapon === LASER_CANNON_ID,
    3000
  );
  const damagedTarget = fired.players.find((player) => player.id === target.id);
  const firingOwner = fired.players.find((player) => player.id === owner.id);
  check('the authoritative shot damages an enemy through a real wall',
    Boolean(wall)
      && (damagedTarget.armor < 50 || damagedTarget.health < 100),
    JSON.stringify({ wall: Boolean(wall), target: damagedTarget }));
  check('one PVP shot forcibly drops ADS and begins the battery reload',
    firingOwner.aiming === false
      && fired.you.ammo.railgun.mag === 0
      && fired.you.ammo.railgun.reserve === 7
      && fired.you.reloading?.weapon === LASER_CANNON_ID);
} finally {
  for (const client of clients) client.ws.close();
  child.kill('SIGTERM');
  await wait(100);
}

if (failures) {
  console.error(`\n${failures} laser-cannon check(s) failed\n`);
  process.exit(1);
}
console.log('\nARC-7 laser cannon verified\n');
