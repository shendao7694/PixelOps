// Deterministic client-prediction audit. It compares the removed "lerp toward
// every arriving snapshot" behavior with timestamp-matched reconciliation
// while snapshots carry 120 ms round-trip latency.
import * as THREE from 'three';
import { Player } from '../src/game/player.js';
import {
  absorbViewCorrection,
  decayViewCorrection,
  movementCorrection,
  samplePoseHistory,
} from '../src/net/pvp-sync.js';
import {
  PVP_MOVEMENT_SUBSTEPS,
  PVP_TICK_RATE,
} from '../src/net/protocol.js';

const CLIENT_DT = 1 / 60;
const SERVER_TICK = 1 / PVP_TICK_RATE;
const SERVER_SUBSTEP = SERVER_TICK / PVP_MOVEMENT_SUBSTEPS;
const ONE_WAY_LATENCY = 0.060;
const DURATION = 4.5;
const settings = { fov: 80, sensitivity: 1, viewBob: 1 };

function makeLevel() {
  const colliders = [
    {
      min: new THREE.Vector3(-20, -1, -4),
      max: new THREE.Vector3(60, 0, 4),
      isGround: true,
    },
  ];
  colliders.push({
    min: new THREE.Vector3(3, 0, -2),
    max: new THREE.Vector3(10.2, 1.5, 2),
    ramp: {
      axis: 'x',
      dir: 1,
      start: 3,
      length: 7.2,
      rise: 1.5,
      baseY: 0,
    },
  });
  return { colliders, bounds: { x: 60, z: 4 } };
}

function makePlayer(level) {
  const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 600);
  const player = new Player({ camera, level, settings, audio: null });
  player.respawn(new THREE.Vector3(0, 0, 0));
  player.yaw = -Math.PI / 2;
  player.grounded = true;
  return player;
}

function command() {
  return {
    move: { x: 0, z: -1 },
    jump: false,
    crouch: false,
    slide: false,
    sprint: true,
    aim: false,
    aimBlend: 0,
    speedMult: 1,
  };
}

const level = makeLevel();
const server = makePlayer(level);
const legacy = makePlayer(level);
const predicted = makePlayer(level);
const history = [];
const snapshots = [];
let nextServerTick = SERVER_TICK;
let legacyCorrection = 0;
let predictedCorrection = 0;
let legacyVerticalCorrection = 0;
let predictedVerticalCorrection = 0;
const viewCorrection = { x: 0, y: 0, z: 0 };
let maxInstantViewJolt = 0;

for (let time = CLIENT_DT; time <= DURATION + 1e-6; time += CLIENT_DT) {
  legacy.update(CLIENT_DT, command());
  for (let i = 0; i < PVP_MOVEMENT_SUBSTEPS; i++) {
    predicted.update(CLIENT_DT / PVP_MOVEMENT_SUBSTEPS, command());
  }
  decayViewCorrection(viewCorrection, CLIENT_DT);
  history.push({
    at: time * 1000,
    p: [predicted.position.x, predicted.position.y, predicted.position.z],
    v: [predicted.velocity.x, predicted.velocity.y, predicted.velocity.z],
    grounded: predicted.grounded,
  });

  while (nextServerTick <= time + 1e-8) {
    for (let i = 0; i < PVP_MOVEMENT_SUBSTEPS; i++) {
      server.update(SERVER_SUBSTEP, command());
    }
    snapshots.push({
      at: nextServerTick * 1000,
      deliverAt: nextServerTick + ONE_WAY_LATENCY,
      p: [server.position.x, server.position.y, server.position.z],
      v: [server.velocity.x, server.velocity.y, server.velocity.z],
      grounded: server.grounded,
    });
    nextServerTick += SERVER_TICK;
  }

  while (snapshots.length && snapshots[0].deliverAt <= time + 1e-8) {
    const snapshot = snapshots.shift();

    const legacyBefore = legacy.position.clone();
    const authoritative = new THREE.Vector3(...snapshot.p);
    const authoritativeVelocity = new THREE.Vector3(...snapshot.v);
    const error = legacy.position.distanceTo(authoritative);
    if (error > 2.25) legacy.position.copy(authoritative);
    else legacy.position.lerp(authoritative, 0.22);
    legacy.velocity.lerp(authoritativeVelocity, 0.18);
    const legacyDelta = legacy.position.clone().sub(legacyBefore);
    legacyCorrection += legacyDelta.length();
    legacyVerticalCorrection += Math.abs(legacyDelta.y);

    const pose = samplePoseHistory(history, snapshot.at);
    if (pose) {
      const viewBefore = {
        x: predicted.position.x + viewCorrection.x,
        y: predicted.position.y + viewCorrection.y,
        z: predicted.position.z + viewCorrection.z,
      };
      const correction = movementCorrection(snapshot.p, pose, {
        stepHeight: predicted.stepHeight,
        serverGrounded: snapshot.grounded,
        clientGrounded: predicted.grounded,
      });
      predicted.position.x += correction.x;
      predicted.position.y += correction.y;
      predicted.position.z += correction.z;
      const magnitude = Math.hypot(correction.x, correction.y, correction.z);
      predictedCorrection += magnitude;
      predictedVerticalCorrection += Math.abs(correction.y);
      absorbViewCorrection(viewCorrection, correction);
      maxInstantViewJolt = Math.max(maxInstantViewJolt, Math.hypot(
        predicted.position.x + viewCorrection.x - viewBefore.x,
        predicted.position.y + viewCorrection.y - viewBefore.y,
        predicted.position.z + viewCorrection.z - viewBefore.z
      ));
      for (const entry of history) {
        if (entry.at + 0.5 < snapshot.at) continue;
        entry.p[0] += correction.x;
        entry.p[1] += correction.y;
        entry.p[2] += correction.z;
      }
    }
  }
}

console.log('\nPVP movement prediction audit (120 ms RTT)\n');
console.log(`  legacy correction travel: ${legacyCorrection.toFixed(3)} m`);
console.log(`  matched-time correction:  ${predictedCorrection.toFixed(3)} m`);
console.log(`  legacy vertical jolts:     ${legacyVerticalCorrection.toFixed(3)} m`);
console.log(`  matched vertical jolts:    ${predictedVerticalCorrection.toFixed(3)} m`);
console.log(`  first-person instant jolt: ${maxInstantViewJolt.toFixed(6)} m`);

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name);
  }
}

check('snapshot latency no longer creates continuous pullback',
  predictedCorrection < legacyCorrection * 0.35);
check('stair phase no longer creates vertical correction jolts',
  predictedVerticalCorrection < legacyVerticalCorrection * 0.35);
check('predicted client keeps responsive forward travel',
  predicted.position.x > legacy.position.x + 0.35);
check('routine reconciliation has no instantaneous first-person camera snap',
  maxInstantViewJolt < 0.000001);

if (failures) {
  console.log(`\n${failures} movement prediction check(s) failed\n`);
  process.exit(1);
}
console.log('\nPVP movement prediction smooth under simulated latency\n');
