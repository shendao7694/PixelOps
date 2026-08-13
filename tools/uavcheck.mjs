import * as THREE from 'three';
import {
  activateServerUav,
  createServerUavState,
  createUavDroneState,
  deactivateServerUav,
  UAV_CALL_COMMIT_SECONDS,
  UAV_CALL_DURATION_SECONDS,
  UAV_DRONE_ALTITUDE,
  UAV_DRONE_HEALTH,
  UAV_DRONE_ORBIT_RADIUS,
  UAV_DRONE_WINGSPAN,
  uavDronePose,
  updateUavDroneState,
} from '../src/game/uav.js';
import { buildUavDroneModel, UavDroneView } from '../src/game/uav-drone-view.js';
import { rayUavDrone } from '../server/world.mjs';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nUAV aircraft audit\n');

check('the complete accelerated radio gesture lasts exactly half a second',
  UAV_CALL_DURATION_SECONDS === 0.5
    && UAV_CALL_COMMIT_SECONDS > 0
    && UAV_CALL_COMMIT_SECONDS < UAV_CALL_DURATION_SECONDS);

const now = 1_234_567_890;
const blue = uavDronePose('blue', now);
const red = uavDronePose('red', now);
check('blue and red aircraft remain opposite each other on the shared orbit',
  Math.abs(blue.x + red.x) < 1e-8
    && Math.abs(blue.z + red.z) < 1e-8
    && Math.abs(blue.y - red.y) < 1e-8
    && Math.abs(Math.hypot(blue.x, blue.z) - UAV_DRONE_ORBIT_RADIUS) < 1e-8);
check('the aircraft circles at a genuinely high but weapon-reachable altitude',
  UAV_DRONE_ALTITUDE >= 60 && blue.y > 60 && blue.y < 90);

const drone = createUavDroneState({
  ownerId: 'operator',
  team: 'blue',
  now,
});
check('every authoritative UAV aircraft starts with exactly 500 HP',
  UAV_DRONE_HEALTH === 500
    && drone.health === 500
    && drone.maxHealth === 500
    && drone.id === 'uav-blue');
updateUavDroneState(drone, now + 1000);
check('server pose advancement follows the deterministic orbit',
  Math.hypot(drone.position.x - blue.x, drone.position.z - blue.z) > 1);

const rayOrigin = new THREE.Vector3(0, 1.6, 0);
const rayDirection = new THREE.Vector3(
  drone.position.x,
  drone.position.y,
  drone.position.z
).sub(rayOrigin).normalize();
const hit = rayUavDrone(drone, rayOrigin, rayDirection, 200);
check('the authoritative long-wing hitbox can be struck from the ground',
  hit?.kind === 'uav'
    && hit.drone === drone
    && hit.distance > 40
    && hit.distance < 120,
  JSON.stringify(hit && { distance: hit.distance, point: hit.point.toArray() }));

const model = buildUavDroneModel('blue');
model.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(model);
const size = bounds.getSize(new THREE.Vector3());
const outlines = [];
model.traverse((part) => {
  if (part.name.endsWith('-outline') || part.name.endsWith('-team-edges')) {
    outlines.push(part);
  }
});
check('the supplied long-wing silhouette is represented by a detailed aircraft model',
  size.x >= UAV_DRONE_WINGSPAN - 0.2
    && model.getObjectByName('uav-fuselage')
    && model.getObjectByName('uav-engine')
    && model.getObjectByName('uav-sensor-turret')
    && model.getObjectByName('uav-vertical-tail')
    && model.userData.hitboxes.length >= 7,
  JSON.stringify({ size: size.toArray(), hitboxes: model.userData.hitboxes.length }));
const blueMarker = model.getObjectByName('uav-team-dot');
const bluePixels = blueMarker.material.map.image.data;
const pixel = (data, x, y) => [...data.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)];
check('the full-airframe coloured outline has been completely removed',
  outlines.length === 0
    && !model.userData.outlineMaterial
    && !model.userData.edgeMaterial);
check('the friendly aircraft uses a small black-ringed blue dot',
  blueMarker?.isSprite
    && blueMarker.scale.x <= 2.2
    && pixel(bluePixels, 16, 16).join(',') === '57,170,255,255'
    && pixel(bluePixels, 4, 16).join(',') === '0,0,0,255');
const enemyModel = buildUavDroneModel('red');
const redMarker = enemyModel.getObjectByName('uav-team-dot');
const redPixels = redMarker.material.map.image.data;
check('the opposing aircraft uses the corresponding black-ringed red dot',
  redMarker?.isSprite
    && pixel(redPixels, 16, 16).join(',') === '255,57,51,255'
    && pixel(redPixels, 4, 16).join(',') === '0,0,0,255');

const markerScene = new THREE.Scene();
const markerCamera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 600);
markerCamera.position.set(0, 1.62, 50);
markerCamera.lookAt(blue.x, blue.y, blue.z);
markerCamera.updateMatrixWorld(true);
const markerView = new UavDroneView(markerScene, drone, 'blue', markerCamera);
markerView.setPose(blue);
markerScene.updateMatrixWorld(true);
const modelNdc = markerView.model.getWorldPosition(new THREE.Vector3()).project(markerCamera);
const markerNdc = markerView.teamMarker
  .getWorldPosition(new THREE.Vector3())
  .project(markerCamera);
check('the dot floats above the aircraft on screen without becoming a through-wall marker',
  markerNdc.y - modelNdc.y > 0.05
    && markerView.teamMarker.material.depthTest === true,
  JSON.stringify({ modelY: modelNdc.y, markerY: markerNdc.y }));
markerView.dispose(markerScene);

const uavState = createServerUavState();
activateServerUav(uavState, now);
deactivateServerUav(uavState);
check('shooting the aircraft can terminate every authoritative UAV timer immediately',
  uavState.uavUntil === 0
    && uavState.uavNextSweepAt === 0
    && uavState.uavRevealUntil === 0);

console.log(failures ? `\n${failures} UAV problem(s)\n` : '\nUAV aircraft verified\n');
process.exit(failures ? 1 : 0);
