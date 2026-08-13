import * as THREE from '../../vendor/three.module.js';

export const KILLER_CAMERA_CONFIG = Object.freeze({
  postFallDelay: 0.5,
  distance: 4.15,
  shoulder: 0.62,
  height: 1.05,
  focusHeight: 1.34,
  collisionPadding: 0.18,
  smoothing: 8.5,
});

const UP = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const desiredPosition = new THREE.Vector3();
const focusPosition = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const desiredQuaternion = new THREE.Quaternion();
const lookMatrix = new THREE.Matrix4();

export function killerCameraHandoffReady(deathAnim) {
  return Boolean(deathAnim && Number(deathAnim.settled) >= 1);
}

export function killerCameraTargetValid(target) {
  return Boolean(
    target
    && target.alive !== false
    && target.position
    && Number.isFinite(target.position.x)
    && Number.isFinite(target.position.y)
    && Number.isFinite(target.position.z)
    && Number.isFinite(Number(target.yaw))
  );
}

export function killerCameraTargetPose(
  target,
  outPosition = new THREE.Vector3(),
  outFocus = new THREE.Vector3(),
  config = KILLER_CAMERA_CONFIG
) {
  const yaw = Number(target?.yaw) || 0;
  const crouched = Boolean(target?.crouch ?? target?.state?.crouch);
  const sliding = Boolean(target?.sliding ?? target?.state?.sliding);
  const juggernaut = Boolean(target?.juggernaut);
  const stanceDrop = sliding ? 0.48 : crouched ? 0.30 : 0;
  const bodyScale = juggernaut ? 1.10 : 1;

  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  outFocus.copy(target.position);
  outFocus.y += config.focusHeight * bodyScale - stanceDrop;
  outPosition.copy(outFocus)
    .addScaledVector(forward, -config.distance * bodyScale)
    .addScaledVector(right, config.shoulder)
    .addScaledVector(UP, config.height);
  return { position: outPosition, focus: outFocus };
}

export function createKillerCamera(camera, targetRef, config = KILLER_CAMERA_CONFIG) {
  return {
    targetRef,
    config,
    phase: 'delay',
    phaseTime: 0,
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
  };
}

/**
 * Advance a Battlefield-style third-person view of the killer.
 *
 * Once the handoff has happened, this controller deliberately keeps ownership
 * of the view. If the killer disappears it freezes the last valid frame rather
 * than returning the victim to their corpse camera.
 */
export function advanceKillerCamera(
  state,
  dt,
  camera,
  target,
  castWorld = null,
  handoffReady = true
) {
  if (!state || state.phase === 'done') return 'done';
  const config = state.config || KILLER_CAMERA_CONFIG;
  const frameTime = Math.max(0, Number(dt) || 0);

  if (state.phase === 'delay') {
    // The timer begins only after the first-person body-fall animation has
    // fully settled. This guarantees the complete fall remains visible before
    // the requested half-second hold and third-person handoff.
    if (!handoffReady) {
      state.phaseTime = 0;
      return 'waiting';
    }
    state.phaseTime += frameTime;
    if (state.phaseTime < config.postFallDelay) return 'waiting';
    if (!killerCameraTargetValid(target)) {
      state.phase = 'done';
      return 'done';
    }
    state.phase = 'follow';
    state.phaseTime = 0;
    state.position.copy(camera.position);
    state.quaternion.copy(camera.quaternion);
  } else {
    state.phaseTime += frameTime;
  }

  if (state.phase === 'follow') {
    if (!killerCameraTargetValid(target)) {
      state.phase = 'hold';
      state.phaseTime = 0;
    } else {
      killerCameraTargetPose(target, desiredPosition, focusPosition, config);
      rayDirection.subVectors(desiredPosition, focusPosition);
      const requestedDistance = rayDirection.length();
      if (requestedDistance > 1e-5) {
        rayDirection.multiplyScalar(1 / requestedDistance);
        const hit = castWorld
          ? castWorld(focusPosition, rayDirection, requestedDistance)
          : null;
        const hitDistance = typeof hit === 'number' ? hit : Number(hit?.distance);
        if (Number.isFinite(hitDistance) && hitDistance < requestedDistance) {
          const cameraDistance = Math.max(0.12, hitDistance - config.collisionPadding);
          desiredPosition.copy(focusPosition).addScaledVector(rayDirection, cameraDistance);
        }
      }

      lookMatrix.lookAt(desiredPosition, focusPosition, UP);
      desiredQuaternion.setFromRotationMatrix(lookMatrix);
      const alpha = 1 - Math.exp(-config.smoothing * Math.max(0, dt));
      state.position.lerp(desiredPosition, alpha);
      state.quaternion.slerp(desiredQuaternion, alpha);
      camera.position.copy(state.position);
      camera.quaternion.copy(state.quaternion);
      return 'active';
    }
  }

  if (state.phase === 'hold') {
    camera.position.copy(state.position);
    camera.quaternion.copy(state.quaternion);
    return 'active';
  }

  return 'done';
}
