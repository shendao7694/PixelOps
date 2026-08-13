import { installDomStub } from './domstub.mjs';

installDomStub();

const THREE = await import('three');
const { buildTextures } = await import('../src/world/textures.js');
const {
  GRENADE_THIRD_PERSON_THROW_SECONDS,
} = await import('../src/game/grenade.js');
const { RemotePlayer } = await import('../src/game/remoteplayer.js');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

function snapshot(overrides = {}) {
  return {
    id: 'throwable-player',
    name: 'THROWER',
    team: 'red',
    p: [0, 0, 0],
    v: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    alive: true,
    health: 100,
    armor: 50,
    kills: 0,
    deaths: 0,
    score: 0,
    invulnerable: false,
    juggernaut: false,
    crouch: false,
    sprinting: false,
    sliding: false,
    grounded: true,
    aiming: false,
    weapon: 'rifle',
    firing: 0,
    throwableKind: 'frag',
    throwableState: 'none',
    ...overrides,
  };
}

function advance(remote, seconds) {
  const frames = Math.ceil(seconds * 60);
  for (let frame = 0; frame < frames; frame++) remote.update(1 / 60);
  remote.rig.root.updateMatrixWorld(true);
}

function worldPosition(object) {
  return object.getWorldPosition(new THREE.Vector3());
}

console.log('\nThird-person throwable presentation audit\n');

const scene = new THREE.Scene();
const remote = new RemotePlayer(
  scene,
  buildTextures(),
  snapshot({ throwableState: 'carry' }),
  'red'
);
advance(remote, 0.5);

check('switching to a throwable hides the primary weapon',
  remote.weapon.visible === false && remote.throwable?.visible === true);
check('the held frag is parented to the right hand exactly once',
  remote.throwable?.parent === remote.rig.armR.hand
    && remote.rig.armR.hand.children.filter(
      (child) => child.name.startsWith('third-person-throwable-')
    ).length === 1);

const carryHand = worldPosition(remote.rig.armR.hand);
remote.applySnapshot(snapshot({
  throwableKind: 'frag',
  throwableState: 'aim',
}));
advance(remote, 0.5);
const aimHand = worldPosition(remote.rig.armR.hand);
check('RMB aiming raises the throwing hand beside the head',
  aimHand.y > carryHand.y + 0.20
    && aimHand.z > carryHand.z + 0.08,
  JSON.stringify({ carry: carryHand.toArray(), aim: aimHand.toArray() }));

for (const kind of ['frag', 'incendiary', 'molotov']) {
  remote.applySnapshot(snapshot({
    throwableKind: kind,
    throwableState: 'carry',
  }));
  advance(remote, 0.08);
  check(`third person renders the selected ${kind} model`,
    remote.throwableModelKind === kind
      && remote.throwable?.name === `third-person-throwable-${kind}`
      && remote.throwable.visible
      && !remote.weapon.visible);
}

remote.applySnapshot(snapshot({
  throwableKind: 'molotov',
  throwableState: 'aim',
}));
advance(remote, 0.35);
const throwStart = worldPosition(remote.rig.armR.hand);
remote.playThrowableThrow('molotov');
remote.applySnapshot(snapshot({
  throwableKind: 'molotov',
  throwableState: 'none',
}));
advance(remote, GRENADE_THIRD_PERSON_THROW_SECONDS * 0.30);
const releaseHand = worldPosition(remote.rig.armR.hand);
check('release hides the hand model while the world projectile takes over',
  remote.throwable?.visible === false
    && remote.weapon.visible === false
    && remote.throwableThrowT > 0);
check('the throw animation drives the hand forward from the charged pose',
  releaseHand.z < throwStart.z - 0.18,
  JSON.stringify({ start: throwStart.toArray(), release: releaseHand.toArray() }));

advance(remote, GRENADE_THIRD_PERSON_THROW_SECONDS);
check('the primary weapon returns only after the throw follow-through',
  remote.throwableThrowT === 0
    && remote.weapon.visible === true
    && remote.throwable?.visible === false);

remote.dispose();

if (failures) {
  console.error(`\n${failures} third-person throwable check(s) failed`);
  process.exit(1);
}
console.log('\nThird-person throwable presentation verified\n');
