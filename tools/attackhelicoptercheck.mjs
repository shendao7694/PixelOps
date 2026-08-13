import * as THREE from 'three';
import {
  ATTACK_HELICOPTER_ALTITUDE,
  ATTACK_HELICOPTER_APPROACH_SECONDS,
  ATTACK_HELICOPTER_BURST_COOLDOWN_SECONDS,
  ATTACK_HELICOPTER_BURST_ROUNDS,
  ATTACK_HELICOPTER_DAMAGE,
  ATTACK_HELICOPTER_FIRE_ALIGNMENT,
  ATTACK_HELICOPTER_HEALTH,
  ATTACK_HELICOPTER_LIFETIME_SECONDS,
  ATTACK_HELICOPTER_ON_STATION_SECONDS,
  ATTACK_HELICOPTER_SHOT_INTERVAL_SECONDS,
  ATTACK_HELICOPTER_TARGET_RADIUS,
  ATTACK_HELICOPTER_TURN_RATE,
  attackHelicopterLockDelay,
  attackHelicopterOnStation,
  attackHelicopterPose,
  attackHelicopterTargetEligible,
  turnAttackHelicopterYaw,
} from '../src/game/attack-helicopter.js';
import { UAV_DRONE_ALTITUDE } from '../src/game/uav.js';
import { rayAttackHelicopter } from '../server/world.mjs';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

console.log('\nAH-64D attack-helicopter audit\n');

const heli = {
  call: [12, 3, -8],
  entryYaw: Math.PI * 0.35,
};
check('the patrol owns the exact 130 metre call-area radius',
  ATTACK_HELICOPTER_TARGET_RADIUS === 130
    && attackHelicopterTargetEligible(heli.call, [142, 40, -8])
    && !attackHelicopterTargetEligible(heli.call, [142.01, 3, -8]));

check('the aircraft stays on station for exactly forty seconds',
  ATTACK_HELICOPTER_ON_STATION_SECONDS === 40
    && !attackHelicopterOnStation(ATTACK_HELICOPTER_APPROACH_SECONDS - 0.01)
    && attackHelicopterOnStation(ATTACK_HELICOPTER_APPROACH_SECONDS)
    && attackHelicopterOnStation(
      ATTACK_HELICOPTER_APPROACH_SECONDS
        + ATTACK_HELICOPTER_ON_STATION_SECONDS - 0.01
    )
    && !attackHelicopterOnStation(
      ATTACK_HELICOPTER_APPROACH_SECONDS
        + ATTACK_HELICOPTER_ON_STATION_SECONDS
    ));

const stationPose = attackHelicopterPose(
  heli,
  ATTACK_HELICOPTER_APPROACH_SECONDS + 5,
  [45, 3, 12]
);
const donePose = attackHelicopterPose(heli, ATTACK_HELICOPTER_LIFETIME_SECONDS);
check('approach, orbit and departure are deterministic for late joiners',
  stationPose.visible
    && stationPose.onStation
    && Number.isFinite(stationPose.position.x)
    && Number.isFinite(stationPose.position.y)
    && Number.isFinite(stationPose.direction.x)
    && donePose.done
    && !donePose.visible);

check('each burst is ten guaranteed 13-damage rounds at 0.2 second spacing',
  ATTACK_HELICOPTER_BURST_ROUNDS === 10
    && ATTACK_HELICOPTER_SHOT_INTERVAL_SECONDS === 0.2
    && ATTACK_HELICOPTER_BURST_COOLDOWN_SECONDS === 2
    && ATTACK_HELICOPTER_DAMAGE === 13);

const turned = turnAttackHelicopterYaw(0, Math.PI, 1 / 60);
check('target changes use a bounded turn instead of an instant 180-degree snap',
  ATTACK_HELICOPTER_TURN_RATE > 0
    && turned > 0
    && turned < Math.PI * 0.02
    && ATTACK_HELICOPTER_FIRE_ALIGNMENT < Math.PI / 18
    && attackHelicopterLockDelay(0, Math.PI) > 1);

const shootable = {
  alive: true,
  health: ATTACK_HELICOPTER_HEALTH,
  position: new THREE.Vector3(
    stationPose.position.x,
    stationPose.position.y,
    stationPose.position.z
  ),
  yaw: 0,
};
const rayOrigin = new THREE.Vector3(12, 1.6, -8);
const rayDirection = shootable.position.clone().sub(rayOrigin).normalize();
const hit = rayAttackHelicopter(shootable, rayOrigin, rayDirection, 220);
check('the Apache is higher than the UAV and has an authoritative 1100 HP hull',
  ATTACK_HELICOPTER_ALTITUDE > UAV_DRONE_ALTITUDE
    && ATTACK_HELICOPTER_HEALTH === 1100
    && hit?.kind === 'attack_helicopter'
    && hit.heli === shootable);

console.log(failures
  ? `\n${failures} attack-helicopter problem(s)\n`
  : '\nAH-64D attack helicopter verified\n');
process.exit(failures ? 1 : 0);
