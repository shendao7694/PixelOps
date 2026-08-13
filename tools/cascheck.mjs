import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  CAS_APPROACH_SECONDS,
  CAS_BLAST_RADIUS,
  CAS_DAMAGE_MIN,
  CAS_DAMAGE_MAX,
  CAS_DELAY_SECONDS,
  CAS_DEPART_SECONDS,
  CAS_FLIGHT_SECONDS,
  CAS_IMPACT_WIDTH,
  CAS_PASS_COUNT,
  CAS_PASS_DELAY_SECONDS,
  CAS_ROUNDS,
  CAS_RUN_LENGTH,
  CAS_RUN_WIDTH,
  CAS_STRAFE_SECONDS,
  CAS_STREAK_KILLS,
  casDamage,
  casFlightPose,
  casImpactPoint,
  casRoundPass,
  casRoundTime,
  normalizeCasPlan,
} from '../src/game/close-air-support.js';
import {
  CasTabletView,
  UavRadioView,
} from '../src/game/close-air-support-view.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nClose air support audit\n');

const bounds = { x: 79.4, z: 65.4 };
const plan = normalizeCasPlan({ x: -74, z: 55 }, { x: -64, z: 55 }, bounds);
const length = plan
  ? Math.hypot(plan.end.x - plan.start.x, plan.end.z - plan.start.z)
  : 0;
const cappedPlan = normalizeCasPlan({ x: -70, z: 0 }, { x: 70, z: 0 }, bounds);
const cappedLength = cappedPlan
  ? Math.hypot(
    cappedPlan.end.x - cappedPlan.start.x,
    cappedPlan.end.z - cappedPlan.start.z
  )
  : 0;
const tinyPlan = normalizeCasPlan({ x: 0, z: 0 }, { x: 0.01, z: 0 }, bounds);
check('A-10 and sentry rewards share the same six-kill threshold',
  CAS_STREAK_KILLS === 6);
check('short cursor distances are preserved without a gameplay minimum',
  plan && Math.abs(length - 10) < 1e-7
    && tinyPlan && Math.abs(tinyPlan.length - 0.01) < 1e-7,
  JSON.stringify(plan));
check('only requests beyond the maximum range are capped to 104 metres',
  cappedPlan && Math.abs(cappedLength - CAS_RUN_LENGTH) < 1e-7,
  JSON.stringify(cappedPlan));
check('the complete wide corridor is shifted inside the playable wall',
  plan
    && [plan.start, plan.end].every((point) =>
      Math.abs(point.x) <= bounds.x - CAS_RUN_WIDTH * 0.5
      && Math.abs(point.z) <= bounds.z - CAS_RUN_WIDTH * 0.5),
  JSON.stringify(plan));
check('only directionless zero-length and non-finite plans are rejected',
  normalizeCasPlan([0, 0], [0, 0], bounds) === null
    && normalizeCasPlan([NaN, 0], [1, 0], bounds) === null);
check('the displayed danger width equals impact spread plus radial blast on both sides',
  CAS_RUN_WIDTH === CAS_IMPACT_WIDTH + CAS_BLAST_RADIUS * 2);

const run = {
  start: { x: -52, z: 4 },
  end: { x: 52, z: 4 },
  seed: 0xdecafbad,
};
const impacts = Array.from({ length: CAS_ROUNDS }, (_, index) => casImpactPoint(run, index));
check('the doubled gun run emits eighty distinct deterministic impacts',
  impacts.length === 80
    && new Set(impacts.map((point) => `${point.x.toFixed(4)},${point.z.toFixed(4)}`)).size === 80);
check('every cannon shell lands inside the selected wide rectangle',
  impacts.every((point) =>
    point.x >= run.start.x - 1.2
    && point.x <= run.end.x + 1.2
    && Math.abs(point.z - 4) <= CAS_IMPACT_WIDTH * 0.5),
  JSON.stringify(impacts.find((point) => Math.abs(point.z - 4) > CAS_IMPACT_WIDTH * 0.5)));
check('impact generation is identical for the same server seed',
  JSON.stringify(impacts) === JSON.stringify(
    Array.from({ length: CAS_ROUNDS }, (_, index) => casImpactPoint(run, index))
  ));

let worstCoverage = 0;
for (let x = run.start.x; x <= run.end.x; x += 0.25) {
  for (let z = -4; z <= 12; z += 0.25) {
    worstCoverage = Math.max(
      worstCoverage,
      Math.min(...impacts.map((point) => Math.hypot(point.x - x, point.z - z)))
    );
  }
}
check('the four interleaved impact lanes cover the complete selected rectangle',
  worstCoverage < CAS_BLAST_RADIUS
    && casDamage(worstCoverage) >= 150,
  `worst exposed point ${worstCoverage.toFixed(3)}m, ${casDamage(worstCoverage).toFixed(1)} damage`);
check('two aircraft split the eighty authoritative rounds into paired fast passes two seconds apart',
  CAS_PASS_COUNT === 2
    && CAS_PASS_DELAY_SECONDS === 2
    && casRoundPass(0) === 0
    && casRoundPass(CAS_ROUNDS / 2) === 1
    && casRoundTime(CAS_ROUNDS / 2) - casRoundTime(0) > CAS_PASS_DELAY_SECONDS * 0.8);

const beforeArrival = casFlightPose(run, CAS_DELAY_SECONDS - 0.001);
const approach = casFlightPose(
  run,
  CAS_DELAY_SECONDS + CAS_APPROACH_SECONDS * 0.82
);
const firingAge = CAS_DELAY_SECONDS + CAS_APPROACH_SECONDS + CAS_STRAFE_SECONDS * 0.5;
const firing = casFlightPose(run, firingAge);
const wingman = casFlightPose(run, firingAge + CAS_PASS_DELAY_SECONDS, 1);
const departureStart = CAS_DELAY_SECONDS + CAS_APPROACH_SECONDS + CAS_STRAFE_SECONDS;
const departureDown = casFlightPose(run, departureStart + CAS_DEPART_SECONDS * 0.02);
const departureUp = casFlightPose(run, departureStart + CAS_DEPART_SECONDS * 0.35);
const finished = casFlightPose(run, CAS_FLIGHT_SECONDS + 0.01);
check('the aircraft waits for the configured tasking delay before entering',
  !beforeArrival.visible && !beforeArrival.done
    && casFlightPose(run, CAS_DELAY_SECONDS).visible);
check('the A-10 enters fast from high altitude and commits to a steep dive',
  approach.visible
    && approach.position.x < run.start.x
    && approach.position.y > 100
    && approach.direction.y < -0.5,
  JSON.stringify(approach));
check('the model fires nose-down from high above rather than raining rounds from its belly',
  firing.visible && firing.firing
    && firing.position.y > 100
    && firing.direction.y < -0.75,
  JSON.stringify(firing));
const firingGroundRange = -firing.position.y / firing.direction.y;
const firingGroundX = firing.position.x + firing.direction.x * firingGroundRange;
check('the model nose projects onto the selected ground run',
  firingGroundRange > 0
    && firingGroundX > run.start.x
    && firingGroundX < run.end.x,
  JSON.stringify({ firingGroundRange, firingGroundX, firing }));
check('the second A-10 follows on a separate lateral track',
  wingman.visible && wingman.firing
    && Math.abs(wingman.position.z - firing.position.z) > 4,
  JSON.stringify({ firing, wingman }));
check('after firing the aircraft continues through the dive before a curved pull-up',
  departureDown.visible && departureDown.direction.y < 0
    && departureUp.visible && departureUp.direction.y > 0
    && departureUp.position.x > departureDown.position.x
    && departureUp.position.y > departureDown.position.y,
  JSON.stringify({ departureDown, departureUp }));

let lowestAltitude = Infinity;
for (let pass = 0; pass < CAS_PASS_COUNT; pass++) {
  for (let i = 0; i <= 240; i++) {
    const age = CAS_DELAY_SECONDS + pass * CAS_PASS_DELAY_SECONDS
      + (CAS_APPROACH_SECONDS + CAS_STRAFE_SECONDS + CAS_DEPART_SECONDS) * (i / 240);
    const pose = casFlightPose(run, age, pass);
    if (pose.visible) lowestAltitude = Math.min(lowestAltitude, pose.position.y);
  }
}
check('both A-10s remain safely high even at the bottom of the gun run',
  lowestAltitude > 70,
  `minimum altitude ${lowestAltitude.toFixed(2)}m`);

let minimumForwardDot = 1;
for (let pass = 0; pass < CAS_PASS_COUNT; pass++) {
  let previous = null;
  for (let i = 0; i <= 240; i++) {
    const age = CAS_DELAY_SECONDS + pass * CAS_PASS_DELAY_SECONDS
      + (CAS_APPROACH_SECONDS + CAS_STRAFE_SECONDS + CAS_DEPART_SECONDS) * (i / 240);
    const pose = casFlightPose(run, age, pass);
    if (!pose.visible || !previous) {
      previous = pose.visible ? pose : null;
      continue;
    }
    const dx = pose.position.x - previous.position.x;
    const dy = pose.position.y - previous.position.y;
    const dz = pose.position.z - previous.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > 1e-6) {
      minimumForwardDot = Math.min(
        minimumForwardDot,
        (dx * previous.direction.x + dy * previous.direction.y + dz * previous.direction.z)
          / distance
      );
    }
    previous = pose;
  }
}
check('both models always face their direction of travel instead of flying backwards',
  minimumForwardDot > 0.55,
  `minimum forward dot ${minimumForwardDot.toFixed(4)}`);
check('the completed flyby removes itself',
  finished.done && !finished.visible);
check('all shell times fall inside the strafing stage',
  casRoundTime(0) > CAS_DELAY_SECONDS
    && casRoundTime(CAS_ROUNDS - 1) < CAS_FLIGHT_SECONDS
    && casRoundTime(-1) === Infinity);

check('each shell has a tight explosive core with radial falloff',
  casDamage(0) === CAS_DAMAGE_MAX
    && casDamage(CAS_BLAST_RADIUS * 0.5) >= CAS_DAMAGE_MIN
    && casDamage(CAS_BLAST_RADIUS) === 0
    && casDamage(CAS_BLAST_RADIUS + 1) === 0);

const modelPath = new URL('../a-10_thunderbolt_ii_-_free.glb', import.meta.url);
const licensePath = new URL('../A10-MODEL-LICENSE.md', import.meta.url);
const glb = existsSync(modelPath) ? readFileSync(modelPath) : null;
check('the supplied A-10 GLB and attribution are packaged',
  glb?.subarray(0, 4).toString('ascii') === 'glTF'
    && glb.length > 1_000_000
    && existsSync(licensePath));

const viewScene = new THREE.Scene();
const tablet = new CasTabletView(viewScene);
let tabletParts = 0;
tablet.root.traverse((object) => { if (object.isMesh) tabletParts++; });
tablet.blend = 1;
tablet.update(0, true, 'end');
check('the first-person targeting tablet has a physical frame, screen and hands',
  tabletParts >= 24 && tablet.root.visible && tablet.root.parent === viewScene,
  `${tabletParts} parts`);
check('the tablet keeps its close pose while sitting high enough to expose the full map',
  Math.abs(tablet.root.position.x - 0.02) < 0.001
    && Math.abs(tablet.root.position.y + 0.24) < 0.01
    && Math.abs(tablet.root.position.z + 0.77) < 0.001
    && Math.abs(tablet.root.rotation.x + 0.12) < 0.001);
const hudSource = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
check('tablet pages are no longer duplicated as floating HUD windows',
  !hudSource.includes('this.drawCasTablet(')
    && !hudSource.includes('this.drawMissileTablet('));
const radio = new UavRadioView(viewScene);
let radioParts = 0;
radio.root.traverse((object) => { if (object.isMesh) radioParts++; });
radio.blend = 1;
radio.update(0, true, 0.45);
let radioMinX = radio.root.position.x;
let radioMaxX = radio.root.position.x;
let radioMinY = radio.root.position.y;
let radioMaxY = radio.root.position.y;
for (let i = 0; i < 120; i++) {
  radio.update(1 / 60, true, 0.45, {
    moveSpeed: 4.8,
    sprinting: false,
    grounded: true,
  });
  radioMinX = Math.min(radioMinX, radio.root.position.x);
  radioMaxX = Math.max(radioMaxX, radio.root.position.x);
  radioMinY = Math.min(radioMinY, radio.root.position.y);
  radioMaxY = Math.max(radioMaxY, radio.root.position.y);
}
radio.root.updateMatrixWorld(true);
const radioBox = (part) => new THREE.Box3().setFromObject(part);
check('UAV activation has a separate handheld radio with one attached operating hand',
  radioParts >= 34
    && radio.root.visible
    && radio.root.parent === viewScene
    && radio.ptt
    && radio.pressThumb
    && radio.carryHand
    && radio.cuff
    && radio.forearm,
  `${radioParts} parts`);
check('the radio hand, cuff and forearm form one continuous silhouette',
  radioBox(radio.pressThumb).intersectsBox(radioBox(radio.carryHand))
    && radioBox(radio.carryHand).intersectsBox(radioBox(radio.cuff))
    && radioBox(radio.cuff).intersectsBox(radioBox(radio.forearm)));
check('the UAV radio pose sways with grounded player movement',
  radio.walkBlend > 0.8
    && radioMaxX - radioMinX > 0.025
    && radioMaxY - radioMinY > 0.008,
  JSON.stringify({
    walkBlend: radio.walkBlend,
    xTravel: radioMaxX - radioMinX,
    yTravel: radioMaxY - radioMinY,
  }));
check('the radio settles against the right edge with its sleeve continuing off-screen',
  radio.root.position.x >= 0.98
    && radio.root.position.y <= -0.44
    && radio.root.position.z <= -1.63
    && radio.forearm.geometry.parameters.height >= 0.85);

console.log(failures
  ? `\n${failures} close air support problem(s)\n`
  : '\nClose air support verified\n');
process.exit(failures ? 1 : 0);
