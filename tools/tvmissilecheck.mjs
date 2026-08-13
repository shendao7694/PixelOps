import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import {
  TV_MISSILE_CRUISE_SPEED,
  TV_MISSILE_CONTROL_LOCK_SECONDS,
  TV_MISSILE_DIVE_HEIGHT,
  TV_MISSILE_DIVE_SPEED,
  TV_MISSILE_INITIAL_PITCH,
  TV_MISSILE_MIN_PITCH,
  TV_MISSILE_SPAWN_HEIGHT,
  applyTvMissileMouseSteering,
  advanceTvMissile,
  createTvMissile,
  steerTvMissile,
  syncTvMissileControlFrame,
  triggerTvMissileBoost,
  tvMissileCameraUp,
  tvMissileDirection,
} from '../src/game/tvmissile.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nTV missile flight audit\n');

const pipelineSource = await readFile(
  new URL('../src/render/pixelpipeline.js', import.meta.url),
  'utf8'
);
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
check('the warhead world feed is fully monochrome instead of colour-keying red surfaces',
  !pipelineSource.includes('float redness')
    && !pipelineSource.includes('redness *')
    && !mainSource.includes('applyTvMissileTint')
    && !mainSource.includes('tvMissileTinted'));

const spawned = createTvMissile({ groundY: 5, yaw: 0 });
check('the missile now spawns one hundred eighty metres above its ground reference',
  TV_MISSILE_SPAWN_HEIGHT === 180
    && Math.abs(spawned.position.y - 185) < 1e-6);

const launchLocked = createTvMissile({ groundY: 0, yaw: 0.35 });
const launchMouseMoved = applyTvMissileMouseSteering(
  launchLocked,
  500,
  -500,
  0.01,
  0.25
);
steerTvMissile(launchLocked, -2.4, -0.1, 0.25);
advanceTvMissile(launchLocked, 0.25, null, -1000);
check('the first half-second is a fixed downward launch corridor with no mouse steering',
  TV_MISSILE_CONTROL_LOCK_SECONDS === 0.5
    && !launchMouseMoved
    && Math.abs(launchLocked.yaw - 0.35) < 1e-9
    && Math.abs(launchLocked.pitch - TV_MISSILE_INITIAL_PITCH) < 1e-9
    && launchLocked.position.y < TV_MISSILE_SPAWN_HEIGHT);

const inputDriven = createTvMissile({ groundY: 0, yaw: 0 });
advanceTvMissile(inputDriven, TV_MISSILE_CONTROL_LOCK_SECONDS + 0.01, null, -1000);
const inputMoved = applyTvMissileMouseSteering(
  inputDriven,
  -12,
  5,
  0.0022,
  1 / 60
);
const heldYaw = inputDriven.yaw;
const heldPitch = inputDriven.pitch;
let movedWithoutInput = false;
for (let i = 0; i < 120; i++) {
  const moved = applyTvMissileMouseSteering(
    inputDriven,
    0,
    0,
    0.0022,
    1 / 60
  );
  advanceTvMissile(inputDriven, 1 / 60, null, -1000);
  movedWithoutInput ||= moved;
}
check('a stationary mouse holds the last heading instead of continuing to turn',
  inputMoved
    && !movedWithoutInput
    && heldYaw > 0
    && heldPitch < TV_MISSILE_INITIAL_PITCH
    && Math.abs(inputDriven.yaw - heldYaw) < 1e-9
    && Math.abs(inputDriven.pitch - heldPitch) < 1e-9,
  JSON.stringify({
    heldYaw,
    finalYaw: inputDriven.yaw,
    heldPitch,
    finalPitch: inputDriven.pitch,
  }));

const steep = createTvMissile({ groundY: 0, yaw: 0.4 });
steep.time = TV_MISSILE_CONTROL_LOCK_SECONDS;
steep.pitch = -1.18;
const steepBefore = tvMissileDirection(steep, new THREE.Vector3()).clone();
applyTvMissileMouseSteering(steep, 18, 0, 0.0022, 1 / 30);
const steepAfterHorizontal = tvMissileDirection(steep, new THREE.Vector3()).clone();
const horizontalTurn = steepBefore.angleTo(steepAfterHorizontal);
const beforeDown = steepAfterHorizontal.clone();
applyTvMissileMouseSteering(steep, 0, 18, 0.0022, 1 / 30);
const afterDown = tvMissileDirection(steep, new THREE.Vector3()).clone();
check('steep-dive controls keep world down as down and screen-left/right responsive',
  horizontalTurn > 0.02
    && Math.abs(steepAfterHorizontal.y - steepBefore.y) < 0.002
    && afterDown.y < beforeDown.y
    && steep.pitch >= TV_MISSILE_MIN_PITCH
    && Math.hypot(afterDown.x, afterDown.z) > 0.24,
  JSON.stringify({
    minimumPitch: TV_MISSILE_MIN_PITCH,
    horizontalTurn,
    before: steepBefore.toArray(),
    horizontal: steepAfterHorizontal.toArray(),
    down: afterDown.toArray(),
  }));

const nadir = createTvMissile({ groundY: 0, yaw: 0.4 });
nadir.time = TV_MISSILE_CONTROL_LOCK_SECONDS;
nadir.pitch = -Math.PI / 2 + 0.035;
syncTvMissileControlFrame(nadir);
const nadirDirections = [];
const nadirCameraUps = [];
const nadirCameraRights = [];
let nadirInputAccepted = true;
for (let i = 0; i < 8; i++) {
  nadirInputAccepted &&= applyTvMissileMouseSteering(
    nadir,
    0,
    18,
    0.0022,
    1 / 60
  );
  nadirDirections.push(tvMissileDirection(nadir, new THREE.Vector3()).clone());
  const up = tvMissileCameraUp(nadir, new THREE.Vector3()).clone();
  nadirCameraUps.push(up);
  nadirCameraRights.push(new THREE.Vector3()
    .crossVectors(nadirDirections.at(-1), up)
    .normalize());
}
const beforeNadirHorizontal = new THREE.Vector2(
  nadirDirections[0].x,
  nadirDirections[0].z
).normalize();
const afterNadirHorizontal = new THREE.Vector2(
  nadirDirections.at(-1).x,
  nadirDirections.at(-1).z
).normalize();
check('holding mouse-down crosses exact nadir instead of sticking or bouncing',
  nadirInputAccepted
    && TV_MISSILE_MIN_PITCH === -Math.PI / 2
    && beforeNadirHorizontal.dot(afterNadirHorizontal) < -0.9,
  JSON.stringify({
    directions: nadirDirections.map((direction) => direction.toArray()),
    finalYaw: nadir.yaw,
    finalPitch: nadir.pitch,
  }));

const launchAnchor = new THREE.Vector3(...nadir.controlUpAnchor);
const upAnchorDots = nadirCameraUps.map((up) => up.dot(launchAnchor));
const adjacentRightDots = nadirCameraRights.slice(1).map(
  (right, index) => right.dot(nadirCameraRights[index])
);
check('the warhead optic stays gyro-stabilised with no roll through nadir',
  upAnchorDots.every((dot) => dot > 0.98)
    && adjacentRightDots.every((dot) => dot > 0.995)
    && mainSource.includes('tvMissileCameraUp(state')
    && mainSource.includes('this.camera.lookAt(')
    && !mainSource.includes('state.controlPitch, state.controlYaw')
    && mainSource.includes('syncTvMissileControlFrame(local)'));

const manualBoost = createTvMissile({ groundY: 0, yaw: -0.2 });
manualBoost.time = TV_MISSILE_CONTROL_LOCK_SECONDS;
manualBoost.pitch = -0.42;
const manualPitch = manualBoost.pitch;
const boostStarted = triggerTvMissileBoost(manualBoost);
advanceTvMissile(manualBoost, 0.1, null, 0);
check('LMB terminal boost can ignite high above the automatic dive altitude',
  boostStarted
    && !triggerTvMissileBoost(manualBoost)
    && manualBoost.position.y > TV_MISSILE_DIVE_HEIGHT
    && manualBoost.diving
    && manualBoost.manualBoost
    && manualBoost.speed > TV_MISSILE_CRUISE_SPEED
    && manualBoost.speed < TV_MISSILE_DIVE_SPEED
    && Math.abs(manualBoost.pitch - manualPitch) < 1e-9,
  JSON.stringify(manualBoost));

const terminal = createTvMissile({ groundY: 0, yaw: 0 });
terminal.time = TV_MISSILE_CONTROL_LOCK_SECONDS;
terminal.position.set(0, TV_MISSILE_DIVE_HEIGHT - 1, 0);
terminal.pitch = -0.4;
steerTvMissile(terminal, Math.PI / 2, -0.22, 0.1);
const steeredYaw = terminal.yaw;
const steeredPitch = terminal.pitch;
const result = advanceTvMissile(terminal, 0.1, null, 0);
const direction = tvMissileDirection(terminal, new THREE.Vector3());
check('the final stage accelerates without forcing a vertical dive',
  result === 'flying'
    && terminal.diving
    && terminal.speed > TV_MISSILE_CRUISE_SPEED
    && terminal.speed < TV_MISSILE_DIVE_SPEED
    && Math.abs(terminal.pitch - steeredPitch) < 1e-9
    && Math.hypot(direction.x, direction.z) > 0.8,
  JSON.stringify({
    pitchBeforeAdvance: steeredPitch,
    pitchAfterAdvance: terminal.pitch,
    speed: terminal.speed,
    direction: direction.toArray(),
  }));

const terminalMouseMoved = applyTvMissileMouseSteering(
  terminal,
  12,
  12,
  0.01,
  0.1
);
const secondYaw = terminal.yaw;
const secondPitch = terminal.pitch;
advanceTvMissile(terminal, 0.1, null, 0);
check('mouse steering remains active after terminal acceleration begins',
  terminalMouseMoved
    && secondYaw < steeredYaw
    && secondPitch < steeredPitch
    && Math.abs(terminal.yaw - secondYaw) < 1e-9
    && Math.abs(terminal.pitch - secondPitch) < 1e-9);

console.log(failures ? `\n${failures} TV missile problem(s)\n` : '\nTV missile flight verified\n');
process.exit(failures ? 1 : 0);
