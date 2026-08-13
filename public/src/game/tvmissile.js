// TV-guided missile: the killstreak spawns a missile high over the middle of
// the map and puts the player behind its nose camera. Steering is the player's
// normal look input, so the same yaw/pitch already on the wire drives it.
//
// Everything here is deterministic and collider-agnostic: the PVP server runs
// it authoritatively at 45 Hz and single-player runs the identical code, so a
// modified client cannot invent an impact point.
import * as THREE from '../../vendor/three.module.js';
import { clamp, damp } from '../core/math.js';

export const TV_MISSILE_SPAWN_HEIGHT = 180;
export const TV_MISSILE_CRUISE_SPEED = 34;
export const TV_MISSILE_DIVE_SPEED = 82;
export const TV_MISSILE_CONTROL_LOCK_SECONDS = 0.5;
export const TV_MISSILE_INITIAL_PITCH = -1.0;
// Below this height above the ground the terminal motor ignites. It accelerates
// along the operator's current mouse-guided heading instead of overriding the
// pitch and forcing a vertical dive.
export const TV_MISSILE_DIVE_HEIGHT = 26;
// The motor also ignites after this long even if the operator is still high.
// Steering remains live in both cases.
export const TV_MISSILE_STEER_SECONDS = 13;
// Steering authority in radians/second. Low enough that the missile has real
// momentum and has to be led into a target rather than flicked onto one.
export const TV_MISSILE_TURN_RATE = 1.15;
// The network/physics pitch is canonical, so straight down is its lower bound.
// The optical view uses a separate ground-reference vector. That lets steering
// pass through nadir without expressing the camera as an Euler pitch below
// -90 degrees, which would turn tiny yaw corrections into visible roll.
export const TV_MISSILE_MIN_PITCH = -Math.PI / 2;
export const TV_MISSILE_MAX_CLIMB = -0.05;

function readControlAnchor(missile, out) {
  const value = missile?.controlUpAnchor;
  if (Array.isArray(value) && value.length >= 3
    && value.slice(0, 3).every(Number.isFinite)) {
    out.set(value[0], 0, value[2]);
  } else if (value && Number.isFinite(value.x) && Number.isFinite(value.z)) {
    out.set(value.x, 0, value.z);
  } else {
    const yaw = Number.isFinite(missile?.yaw) ? missile.yaw : 0;
    out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  }
  if (out.lengthSq() < 1e-10) out.set(0, 0, -1);
  return out.normalize();
}

/**
 * Ensure the optical head has a fixed ground reference. It is captured at
 * launch and intentionally does not follow yaw: around a vertical dive this
 * behaves like a gyro-stabilised map view, so the world cannot spiral beneath
 * the reticle when the heading crosses exact nadir.
 */
export function syncTvMissileControlFrame(missile) {
  if (!missile) return missile;
  missile.controlUpAnchor = readControlAnchor(
    missile,
    new THREE.Vector3()
  ).toArray();
  return missile;
}

/**
 * Camera up projected from the launch-time ground reference onto the plane
 * perpendicular to the current heading. This is deterministic, has no stored
 * Euler roll, and remains well-defined at straight down.
 */
export function tvMissileCameraUp(missile, out = new THREE.Vector3()) {
  syncTvMissileControlFrame(missile);
  const forward = tvMissileDirection(missile, new THREE.Vector3());
  const anchor = readControlAnchor(missile, new THREE.Vector3());
  out.copy(anchor).addScaledVector(forward, -anchor.dot(forward));
  if (out.lengthSq() < 1e-8) {
    // Only reachable near the shallow-pitch safety limit when the nose nearly
    // aligns with the ground anchor. World up is a stable secondary reference.
    out.set(0, 1, 0).addScaledVector(forward, -forward.y);
  }
  if (out.lengthSq() < 1e-8) {
    const yaw = Number.isFinite(missile?.yaw) ? missile.yaw : 0;
    out.set(Math.sin(yaw), 0, Math.cos(yaw));
  }
  return out.normalize();
}

/** Where a new missile is born: high above the middle of the arena. */
export function tvMissileSpawn(groundY = 0) {
  return new THREE.Vector3(0, groundY + TV_MISSILE_SPAWN_HEIGHT, 0);
}

/**
 * Turn the operator's requested look angles into the missile's actual heading.
 * The missile cannot snap to the request - it eases toward it at a fixed rate,
 * which is what makes the thing feel heavy through the terminal boost.
 */
export function steerTvMissile(missile, wantYaw, wantPitch, dt) {
  if ((missile.time || 0) < TV_MISSILE_CONTROL_LOCK_SECONDS) return missile;
  const yawTarget = Number.isFinite(wantYaw) ? wantYaw : missile.yaw;
  const pitchTarget = Number.isFinite(wantPitch)
    ? clamp(wantPitch, TV_MISSILE_MIN_PITCH, TV_MISSILE_MAX_CLIMB)
    : missile.pitch;

  // Turn through direction space, not independent Euler axes. Close to a
  // steep dive, changing Euler yaw barely changes the heading and feels like
  // roll; an axis-angle step keeps the same screen-space authority everywhere.
  const current = tvMissileDirection(missile, new THREE.Vector3());
  const target = tvMissileDirection(
    { yaw: yawTarget, pitch: pitchTarget },
    new THREE.Vector3()
  );
  const angle = current.angleTo(target);
  const step = Math.min(angle, Math.max(0, TV_MISSILE_TURN_RATE * dt));
  if (step > 1e-8) {
    const axis = new THREE.Vector3().crossVectors(current, target);
    if (axis.lengthSq() > 1e-12) current.applyAxisAngle(axis.normalize(), step);
    else current.copy(target);
  }
  current.normalize();
  missile.pitch = clamp(Math.asin(clamp(current.y, -1, 1)),
    TV_MISSILE_MIN_PITCH, TV_MISSILE_MAX_CLIMB);
  const horizontal = Math.hypot(current.x, current.z);
  // At exact nadir atan2(0, 0) has no useful orientation. Retaining the
  // requested side lets the extended camera frame cross it deterministically.
  missile.yaw = horizontal > 1e-8
    ? Math.atan2(-current.x, -current.z)
    : yawTarget;
  return missile;
}

/**
 * Apply one frame of real mouse movement. There is deliberately no retained
 * target angle: when dx/dy return to zero the missile immediately holds its
 * current heading instead of continuing to chase the last mouse position.
 */
export function applyTvMissileMouseSteering(
  missile,
  dx,
  dy,
  sensitivity,
  dt
) {
  if ((missile.time || 0) < TV_MISSILE_CONTROL_LOCK_SECONDS) return false;
  const moveX = Number.isFinite(dx) ? dx : 0;
  const moveY = Number.isFinite(dy) ? dy : 0;
  if (Math.abs(moveX) + Math.abs(moveY) <= 1e-6) return false;
  const scale = Number.isFinite(sensitivity) ? sensitivity : 0;

  syncTvMissileControlFrame(missile);

  // Build the request in the gyro-stabilised visible screen basis. The up
  // vector remains tied to the launch-time ground reference at nadir, so both
  // axes stay useful without rolling the picture.
  const forward = tvMissileDirection(missile, new THREE.Vector3());
  const screenUp = tvMissileCameraUp(missile, new THREE.Vector3());
  const right = new THREE.Vector3().crossVectors(forward, screenUp).normalize();
  let turnX = moveX * scale;
  let turnY = moveY * scale;
  const requestedTurn = Math.hypot(turnX, turnY);
  const maxTurn = Math.max(0, TV_MISSILE_TURN_RATE * dt);
  if (requestedTurn > maxTurn && requestedTurn > 1e-8) {
    const factor = maxTurn / requestedTurn;
    turnX *= factor;
    turnY *= factor;
  }
  const requested = forward.clone()
    .addScaledVector(right, turnX)
    .addScaledVector(screenUp, -turnY)
    .normalize();
  const requestedPitch = clamp(Math.asin(clamp(requested.y, -1, 1)),
    TV_MISSILE_MIN_PITCH, TV_MISSILE_MAX_CLIMB);
  const requestedHorizontal = Math.hypot(requested.x, requested.z);
  const requestedYaw = requestedHorizontal > 1e-8
    ? Math.atan2(-requested.x, -requested.z)
    : missile.yaw;
  steerTvMissile(
    missile,
    requestedYaw,
    requestedPitch,
    dt
  );
  return true;
}

/** Unit heading implied by the missile's current yaw/pitch. */
export function tvMissileDirection(missile, out = new THREE.Vector3()) {
  const cosPitch = Math.cos(missile.pitch);
  return out.set(
    -Math.sin(missile.yaw) * cosPitch,
    Math.sin(missile.pitch),
    -Math.cos(missile.yaw) * cosPitch
  ).normalize();
}

/**
 * Ignite the terminal motor on command. It only changes thrust; the current
 * heading and full mouse steering authority are preserved.
 */
export function triggerTvMissileBoost(missile) {
  if (!missile || missile.diving) return false;
  missile.diving = true;
  missile.manualBoost = true;
  return true;
}

/**
 * One fixed step of flight. `cast` matches the grenade/world raycast adapter:
 * (origin, direction, maxDistance) => { distance, normal } | null.
 *
 * `bounds` is the level's { x, z } half-extent. Steering outside it is fenced
 * off rather than ended, so an operator who overshoots can turn back instead of
 * losing the streak to an invisible wall.
 *
 * Returns 'flying' or the reason it ended, so the caller can explode it.
 */
export function advanceTvMissile(missile, dt, cast, groundY = 0, bounds = null) {
  missile.time = (missile.time || 0) + dt;
  if (missile.time <= TV_MISSILE_CONTROL_LOCK_SECONDS) {
    // The opening half-second is a fixed down-looking launch corridor. This
    // suppresses stray mouse deltas during the tablet-to-camera transition,
    // and the server repeats the rule so a modified client cannot bypass it.
    missile.yaw = Number.isFinite(missile.launchYaw) ? missile.launchYaw : missile.yaw;
    missile.pitch = Number.isFinite(missile.launchPitch)
      ? missile.launchPitch
      : TV_MISSILE_INITIAL_PITCH;
    syncTvMissileControlFrame(missile);
  }

  const height = missile.position.y - groundY;
  // The terminal phase changes thrust only. Mouse movement may still update
  // yaw and pitch before this step, but a stationary mouse leaves them alone.
  if (!missile.diving
    && (height <= TV_MISSILE_DIVE_HEIGHT || missile.time >= TV_MISSILE_STEER_SECONDS)) {
    triggerTvMissileBoost(missile);
  }
  if (missile.diving) {
    missile.speed = damp(missile.speed, TV_MISSILE_DIVE_SPEED, 3.5, dt);
  } else {
    missile.speed = damp(missile.speed, TV_MISSILE_CRUISE_SPEED, 2, dt);
  }

  const direction = tvMissileDirection(missile, new THREE.Vector3());
  const distance = missile.speed * dt;
  const hit = cast ? cast(missile.position, direction, distance + 0.5) : null;
  if (hit) {
    missile.position.addScaledVector(direction, Math.max(0, hit.distance - 0.2));
    return 'impact';
  }
  missile.position.addScaledVector(direction, distance);

  if (bounds) {
    missile.position.x = clamp(missile.position.x, -bounds.x, bounds.x);
    missile.position.z = clamp(missile.position.z, -bounds.z, bounds.z);
  }

  if (missile.position.y <= groundY + 0.2) {
    missile.position.y = groundY;
    return 'impact';
  }
  return 'flying';
}

/** Fresh missile state. Shared so client and server start from the same pose. */
export function createTvMissile({ ownerId, team, groundY = 0, yaw = 0 } = {}) {
  return {
    ownerId,
    team,
    position: tvMissileSpawn(groundY),
    yaw,
    // Start nosed over so the operator sees the map immediately instead of
    // staring at the horizon while the missile falls.
    pitch: TV_MISSILE_INITIAL_PITCH,
    // Top-of-screen ground direction for the gyro-stabilised optical view.
    controlUpAnchor: [-Math.sin(yaw), 0, -Math.cos(yaw)],
    launchYaw: yaw,
    launchPitch: TV_MISSILE_INITIAL_PITCH,
    speed: TV_MISSILE_CRUISE_SPEED,
    diving: false,
    manualBoost: false,
    time: 0,
  };
}
