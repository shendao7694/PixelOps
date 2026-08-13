import * as THREE from 'three';
import {
  FIREBOMB_ALTITUDE,
  FIREBOMB_BLAST_RADIUS,
  FIREBOMB_BOMB_COUNT,
  FIREBOMB_CALL_DELAY_SECONDS,
  FIREBOMB_CRUISE_SPEED,
  FIREBOMB_FALL_SECONDS,
  FIREBOMB_RELEASE_WINDOW_SECONDS,
  firebombDamage,
  firebombFallingBombPose,
  firebombFlightPose,
  firebombImpactPoint,
  firebombImpactTime,
  firebombRunSeconds,
  normalizeFirebombPlan,
} from '../src/game/firebomb-airstrike.js';
import {
  AIRSTRIKE_INCENDIARY_DURATION_SECONDS,
  AIRSTRIKE_INCENDIARY_KIND,
  AIRSTRIKE_INCENDIARY_TICK_DAMAGE,
  INCENDIARY_DURATION_SECONDS,
  INCENDIARY_RADIUS,
  INCENDIARY_TICK_DAMAGE,
  incendiaryDuration,
  incendiaryRadius,
  incendiaryTickDamage,
} from '../src/game/incendiary.js';
import { GRENADE_BLAST_RADIUS } from '../src/game/grenade.js';
import {
  FIREBOMB_FIELD_DRAW_CALLS,
  FIREBOMB_FIELD_FLAME_CLUSTERS_PER_ZONE,
  FIREBOMB_FIELD_FLAMES_PER_CLUSTER,
  FirebombFieldRenderer,
} from '../src/game/firebomb-field-renderer.js';
import { createFirebombBombBatch } from '../src/game/air-support-view.js';
import { Effects } from '../src/fx/effects.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

function close(actual, expected, epsilon = 1e-9) {
  return Math.abs(actual - expected) <= epsilon;
}

console.log('\nB-2 incendiary airstrike audit\n');

const bounds = { x: 96, z: 64 };
const plan = normalizeFirebombPlan(90, bounds);
check('the operator controls only a clamped left-to-right horizontal line',
  plan.start.x === -96
    && plan.end.x === 96
    && plan.start.z === 62
    && plan.end.z === 62
    && plan.direction.x === 1
    && plan.direction.z === 0);

const first = firebombImpactPoint(plan, 0);
const last = firebombImpactPoint(plan, FIREBOMB_BOMB_COUNT - 1);
const spacing = plan.length / FIREBOMB_BOMB_COUNT;
check('twelve bombs are evenly centred along the complete path',
  FIREBOMB_BOMB_COUNT === 12
    && close(first.x, plan.start.x + spacing * 0.5)
    && close(last.x, plan.end.x - spacing * 0.5)
    && first.z === plan.start.z
    && last.z === plan.end.z);

const approachSeconds = 145 / FIREBOMB_CRUISE_SPEED;
const runSeconds = firebombRunSeconds(plan);
const midAge = FIREBOMB_CALL_DELAY_SECONDS + approachSeconds + runSeconds * 0.5;
const flight = firebombFlightPose(plan, midAge);
check('the B-2 waits two seconds then makes a high, level pass without diving',
  FIREBOMB_CALL_DELAY_SECONDS === 2
    && flight.visible
    && flight.position.y === FIREBOMB_ALTITUDE
    && flight.direction.y === 0
    && flight.roll === 0);
const entry = firebombFlightPose(
  plan,
  FIREBOMB_CALL_DELAY_SECONDS + approachSeconds - 0.05
);
const run = firebombFlightPose(
  plan,
  FIREBOMB_CALL_DELAY_SECONDS + approachSeconds + 0.05
);
check('entry and bombing use one unchanged high cruise speed',
  Math.abs((run.position.x - entry.position.x) / 0.10 - FIREBOMB_CRUISE_SPEED)
    < 1e-6
    && runSeconds <= FIREBOMB_RELEASE_WINDOW_SECONDS);

const releaseAge = firebombImpactTime(plan, 3) - FIREBOMB_FALL_SECONDS;
const falling = firebombFallingBombPose(plan, 3, releaseAge + FIREBOMB_FALL_SECONDS * 0.5, 4);
check('released bombs fall independently from cruise altitude to the ground',
  falling.visible
    && !falling.impacted
    && falling.position.y > 4
    && falling.position.y < FIREBOMB_ALTITUDE);

check('the strengthened blast is 30% hotter and 15% wider',
  Math.abs(FIREBOMB_BLAST_RADIUS - GRENADE_BLAST_RADIUS * 1.5 * 1.15) < 1e-9
    && firebombDamage(0) === 520
    && firebombDamage(FIREBOMB_BLAST_RADIUS * 0.4) === 312
    && firebombDamage(FIREBOMB_BLAST_RADIUS * 0.7) === 208
    && firebombDamage(FIREBOMB_BLAST_RADIUS * 0.9) === 104
    && firebombDamage(FIREBOMB_BLAST_RADIUS * 1.01) === 0
    && firebombDamage(FIREBOMB_BLAST_RADIUS * 0.7, true) === 0);

check('every impact leaves the requested stronger, longer incendiary field',
  incendiaryRadius(AIRSTRIKE_INCENDIARY_KIND) === INCENDIARY_RADIUS
    && incendiaryTickDamage(AIRSTRIKE_INCENDIARY_KIND)
      === INCENDIARY_TICK_DAMAGE * 1.25
    && incendiaryDuration(AIRSTRIKE_INCENDIARY_KIND)
      === INCENDIARY_DURATION_SECONDS + 3
    && AIRSTRIKE_INCENDIARY_TICK_DAMAGE === INCENDIARY_TICK_DAMAGE * 1.25
    && AIRSTRIKE_INCENDIARY_DURATION_SECONDS === INCENDIARY_DURATION_SECONDS + 3);

const scene = new THREE.Scene();
const fieldRenderer = new FirebombFieldRenderer(scene, {
  maxZones: FIREBOMB_BOMB_COUNT * 2,
  pixelScale: 360,
});
let terrainSamples = 0;
for (let index = 0; index < FIREBOMB_BOMB_COUNT; index++) {
  const position = new THREE.Vector3(index * 4, 0, 3);
  const prepared = fieldRenderer.prepareZone(position, (x, z) => {
    terrainSamples++;
    return {
      y: x * 0.008 + z * 0.004,
      normal: new THREE.Vector3(-0.008, 1, -0.004).normalize(),
    };
  });
  fieldRenderer.addZone({
    id: `test-zone-${index}`,
    position,
    expiresAt: 20 + index * 0.1,
    prepared,
  });
}
fieldRenderer.update(10, new THREE.Vector3());
const fieldStats = fieldRenderer.stats();
const renderBatches = fieldRenderer.root.children.filter((object) =>
  object.isPoints || object.isInstancedMesh);
check('all twelve persistent fire fields share a fixed four-draw GPU renderer',
  fieldStats.activeZones === FIREBOMB_BOMB_COUNT
    && fieldStats.drawCalls === FIREBOMB_FIELD_DRAW_CALLS
    && renderBatches.length === FIREBOMB_FIELD_DRAW_CALLS
    && fieldStats.activeFlamePoints === FIREBOMB_BOMB_COUNT
      * FIREBOMB_FIELD_FLAME_CLUSTERS_PER_ZONE
      * FIREBOMB_FIELD_FLAMES_PER_CLUSTER
    && terrainSamples <= FIREBOMB_BOMB_COUNT * 100
    && fieldRenderer.root.children.filter((object) => object.isLight).length === 1,
  JSON.stringify({ fieldStats, terrainSamples, renderBatches: renderBatches.length }));

const fieldChildCount = fieldRenderer.root.children.length;
fieldRenderer.removeZone('test-zone-0');
fieldRenderer.addZone({
  id: 'replacement-zone',
  position: new THREE.Vector3(),
  expiresAt: 30,
  prepared: fieldRenderer.prepareZone(new THREE.Vector3(), () => ({
    y: 0,
    normal: new THREE.Vector3(0, 1, 0),
  })),
});
check('fire-field visuals reuse fixed slots without creating impact-time scene objects',
  fieldRenderer.root.children.length === fieldChildCount
    && fieldRenderer.stats().activeZones === FIREBOMB_BOMB_COUNT);

const bombBatch = createFirebombBombBatch(FIREBOMB_BOMB_COUNT);
bombBatch.setPose(0, {
  visible: true,
  position: new THREE.Vector3(1, 20, 2),
  direction: new THREE.Vector3(0, -1, 0.1),
  roll: 0.4,
});
bombBatch.commit();
check('all twelve falling bombs use four instanced draws instead of separate models',
  bombBatch.root.userData.drawCalls === 4
    && bombBatch.root.children.length === 4
    && bombBatch.root.children.every((object) => object.isInstancedMesh));

let sparkSpawns = 0;
let smokeSpawns = 0;
let decals = 0;
Effects.prototype.firebombImpact.call({
  sparks: { spawn: () => sparkSpawns++ },
  smoke: { spawn: () => smokeSpawns++ },
  decal: () => decals++,
  _v: new THREE.Vector3(),
  _up: new THREE.Vector3(0, 1, 0),
}, new THREE.Vector3(), 0);
check('each B-2 impact has a strict pooled particle budget',
  sparkSpawns === 28
    && smokeSpawns === 18
    && decals === 1
    && (sparkSpawns + smokeSpawns) * FIREBOMB_BOMB_COUNT < 600,
  JSON.stringify({ sparkSpawns, smokeSpawns, decals }));

bombBatch.dispose();
fieldRenderer.dispose();

console.log(failures
  ? `\n${failures} B-2 airstrike problem(s)\n`
  : '\nB-2 incendiary airstrike verified\n');
process.exit(failures ? 1 : 0);
