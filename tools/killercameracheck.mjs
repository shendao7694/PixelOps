import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  KILLER_CAMERA_CONFIG,
  advanceKillerCamera,
  createKillerCamera,
  killerCameraHandoffReady,
  killerCameraTargetPose,
} from '../src/game/killer-camera.js';

const near = (actual, expected, epsilon, label) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, got ${actual}`
  );
};

console.log('\nKiller camera checks\n');

{
  assert.equal(killerCameraHandoffReady(null), false);
  assert.equal(killerCameraHandoffReady({ settled: 0.999 }), false);
  assert.equal(killerCameraHandoffReady({ settled: 1 }), true);
  console.log('  ok   handoff readiness requires the complete body-fall animation');
}

{
  const target = {
    alive: true,
    position: new THREE.Vector3(2, 0, 3),
    yaw: 0,
  };
  const pose = killerCameraTargetPose(target);
  assert.ok(pose.position.z > target.position.z, 'yaw 0 camera must sit behind the target');
  assert.ok(pose.position.x > target.position.x, 'camera should use a right shoulder offset');
  assert.ok(pose.position.y > pose.focus.y, 'camera should be raised above its focus');
  console.log('  ok   target is framed from a raised right-shoulder third-person pose');
}

{
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(-5, 1.7, -4);
  camera.rotation.set(0.15, -0.4, 0.35);
  const initialPosition = camera.position.clone();
  const target = {
    alive: true,
    position: new THREE.Vector3(1, 0, 2),
    yaw: Math.PI * 0.25,
  };
  const state = createKillerCamera(camera, { kind: 'test' });
  for (let i = 0; i < 120; i++) {
    const waitingForFall = advanceKillerCamera(
      state,
      1 / 60,
      camera,
      target,
      null,
      false
    );
    assert.equal(waitingForFall, 'waiting');
  }
  assert.equal(state.phaseTime, 0, 'post-fall timer must not run during the fall');
  assert.ok(camera.position.equals(initialPosition), 'fall animation must retain the death camera');

  const waiting = advanceKillerCamera(
    state,
    KILLER_CAMERA_CONFIG.postFallDelay * 0.5,
    camera,
    target,
    null,
    true
  );
  assert.equal(waiting, 'waiting');
  assert.ok(camera.position.equals(initialPosition), 'delay must preserve the live death camera');

  for (let i = 0; i < 90; i++) {
    advanceKillerCamera(state, 1 / 60, camera, target, null, true);
  }
  assert.equal(state.phase, 'follow');
  const pose = killerCameraTargetPose(target);
  const cameraForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(camera.quaternion)
    .normalize();
  const toTarget = pose.focus.clone().sub(camera.position).normalize();
  assert.ok(cameraForward.dot(toTarget) > 0.995, 'camera must look back at the killer');
  assert.ok(camera.position.distanceTo(pose.position) < 0.02, 'follow pose should converge smoothly');
  console.log('  ok   handoff waits 0.5 seconds after the fall, then keeps the killer centered');
}

{
  const config = {
    ...KILLER_CAMERA_CONFIG,
    postFallDelay: 0,
  };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  const target = {
    alive: true,
    position: new THREE.Vector3(0, 0, 0),
    yaw: 0,
  };
  const state = createKillerCamera(camera, { kind: 'test' }, config);
  for (let i = 0; i < 90; i++) {
    advanceKillerCamera(state, 1 / 60, camera, target, () => 1.05);
  }
  const pose = killerCameraTargetPose(target, new THREE.Vector3(), new THREE.Vector3(), config);
  const expectedDistance = 1.05 - config.collisionPadding;
  near(camera.position.distanceTo(pose.focus), expectedDistance, 0.02, 'collision distance');
  console.log('  ok   wall collision pulls the camera in front of geometry');
}

{
  const config = {
    ...KILLER_CAMERA_CONFIG,
    postFallDelay: 0,
  };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(-2, 1.5, -2);
  const target = {
    alive: true,
    position: new THREE.Vector3(0, 0, 0),
    yaw: 0,
  };
  const state = createKillerCamera(camera, { kind: 'test' }, config);
  for (let i = 0; i < 180; i++) {
    assert.equal(advanceKillerCamera(state, 1 / 60, camera, target), 'active');
  }
  assert.equal(state.phase, 'follow', 'living killer should remain under continuous follow');

  target.alive = false;
  assert.equal(advanceKillerCamera(state, 1 / 60, camera, target), 'active');
  assert.equal(state.phase, 'hold');
  const heldPosition = camera.position.clone();
  const heldQuaternion = camera.quaternion.clone();

  // Simulate Player._updateCamera trying to restore the victim corpse view.
  camera.position.set(40, 0.34, -25);
  camera.rotation.set(1.2, -0.8, 0.9);
  assert.equal(advanceKillerCamera(state, 1 / 60, camera, null), 'active');
  assert.ok(camera.position.distanceTo(heldPosition) < 1e-6);
  assert.ok(1 - Math.abs(camera.quaternion.dot(heldQuaternion)) < 1e-6);
  console.log('  ok   view stays on the killer and freezes there if the killer disappears');
}

console.log('\nAll killer camera checks passed.\n');
