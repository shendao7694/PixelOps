import * as THREE from '../../vendor/three.module.js';
import { clamp, lerp } from '../core/math.js';

/*
 * Authoritative player hit volumes in character-local space.
 *
 * CharacterRig uses the same crouch/slide damping as Player, so interpolating
 * these measured poses keeps the server ray, the remote model and the
 * local predictive tracer on one definition. Boxes are yaw-oriented rather
 * than fixed in world axes; this matters most for the forward-leaning slide.
 */
export const CHARACTER_HITBOX_PROFILES = Object.freeze({
  stand: Object.freeze([
    Object.freeze({ part: 'head', mult: 2.2, center: [0, 1.760, 0.004], half: [0.240, 0.220, 0.230] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 1.120, 0.000], half: [0.350, 0.420, 0.300] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 0.350, 0.000], half: [0.330, 0.350, 0.260] }),
  ]),
  run: Object.freeze([
    // Covers the complete left/right gait cycle, not only the neutral frame.
    Object.freeze({ part: 'head', mult: 2.2, center: [0, 1.728, -0.077], half: [0.265, 0.265, 0.260] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 1.110, -0.035], half: [0.360, 0.425, 0.320] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 0.345, 0.000], half: [0.340, 0.350, 0.270] }),
  ]),
  sprint: Object.freeze([
    Object.freeze({ part: 'head', mult: 2.2, center: [0, 1.697, -0.197], half: [0.290, 0.300, 0.285] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 1.090, -0.080], half: [0.370, 0.430, 0.340] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 0.345, -0.010], half: [0.345, 0.350, 0.280] }),
  ]),
  crouch: Object.freeze([
    Object.freeze({ part: 'head', mult: 2.2, center: [0, 1.412, -0.111], half: [0.240, 0.245, 0.250] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 0.820, -0.050], half: [0.380, 0.360, 0.360] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 0.225, -0.310], half: [0.400, 0.255, 0.520] }),
  ]),
  slide: Object.freeze([
    Object.freeze({ part: 'head', mult: 2.2, center: [0, 0.878, -0.509], half: [0.250, 0.305, 0.300] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 0.610, -0.230], half: [0.360, 0.340, 0.350] }),
    Object.freeze({ part: 'chest', mult: 1, center: [0, 0.260, -0.490], half: [0.490, 0.290, 0.510] }),
  ]),
});

function stanceBlend(state, key, flag) {
  const value = state?.[key];
  if (Number.isFinite(value)) return clamp(value, 0, 1);
  return state?.[flag] ? 1 : 0;
}

/**
 * Return the three local-space OBB descriptions for the actor's current
 * interpolated stance. Exposed so tests and debug views can inspect the exact
 * volumes used by the authoritative ray.
 */
export function characterHitboxesForState(state) {
  const crouch = stanceBlend(state, 'crouchBlend', 'crouching');
  const slide = stanceBlend(state, 'slideBlend', 'sliding');
  let speed = Number(state?.speed2D);
  if (!Number.isFinite(speed)) {
    const velocity = state?.velocity;
    speed = velocity && Number.isFinite(velocity.x) && Number.isFinite(velocity.z)
      ? Math.hypot(velocity.x, velocity.z)
      : 0;
  }
  const run = clamp(speed / 5.4, 0, 1);
  const sprint = stanceBlend(state, 'sprintBlend', 'sprinting');
  return CHARACTER_HITBOX_PROFILES.stand.map((standing, i) => {
    const running = CHARACTER_HITBOX_PROFILES.run[i];
    const sprinting = CHARACTER_HITBOX_PROFILES.sprint[i];
    const crouched = CHARACTER_HITBOX_PROFILES.crouch[i];
    const sliding = CHARACTER_HITBOX_PROFILES.slide[i];
    const center = [0, 1, 2].map((axis) => lerp(
      lerp(
        lerp(
          lerp(standing.center[axis], running.center[axis], run),
          sprinting.center[axis],
          sprint
        ),
        crouched.center[axis],
        crouch
      ),
      sliding.center[axis],
      slide
    ));
    const half = [0, 1, 2].map((axis) => lerp(
      lerp(
        lerp(
          lerp(standing.half[axis], running.half[axis], run),
          sprinting.half[axis],
          sprint
        ),
        crouched.half[axis],
        crouch
      ),
      sliding.half[axis],
      slide
    ));
    if (state?.juggernaut) {
      const head = standing.part === 'head';
      half[0] *= head ? 1.28 : 1.36;
      half[1] *= head ? 1.16 : 1.10;
      half[2] *= head ? 1.28 : 1.30;
    }
    return { part: standing.part, mult: standing.mult, center, half };
  });
}

function rayLocalBox(ox, oy, oz, dx, dy, dz, center, half, maxDistance) {
  let near = 0;
  let far = maxDistance;
  let normalAxis = -1;
  let normalSign = 0;
  const origins = [ox, oy, oz];
  const directions = [dx, dy, dz];

  for (let axis = 0; axis < 3; axis++) {
    const min = center[axis] - half[axis];
    const max = center[axis] + half[axis];
    const origin = origins[axis];
    const direction = directions[axis];
    if (Math.abs(direction) < 1e-8) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let t1 = (min - origin) / direction;
    let t2 = (max - origin) / direction;
    let sign = -Math.sign(direction);
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
      sign = -sign;
    }
    if (t1 > near) {
      near = t1;
      normalAxis = axis;
      normalSign = sign;
    }
    far = Math.min(far, t2);
    if (near > far) return null;
  }

  if (far < 0 || near > maxDistance) return null;
  return {
    distance: Math.max(0, near),
    normalAxis,
    normalSign,
  };
}

/**
 * Raycast a live Player/RemotePlayer-like state against the shared yaw-oriented
 * stance volumes. The first volume is the head, so an exact shared boundary is
 * consistently classified as a headshot.
 */
export function rayCharacterHitboxes(state, origin, direction, maxDistance) {
  if (!state?.position || maxDistance < 0) return null;
  const yaw = Number.isFinite(state.yaw) ? state.yaw : 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const relX = origin.x - state.position.x;
  const relY = origin.y - state.position.y;
  const relZ = origin.z - state.position.z;
  // Inverse Y rotation: world -> character-local.
  const ox = cos * relX - sin * relZ;
  const oy = relY;
  const oz = sin * relX + cos * relZ;
  const dx = cos * direction.x - sin * direction.z;
  const dy = direction.y;
  const dz = sin * direction.x + cos * direction.z;

  let best = null;
  for (const box of characterHitboxesForState(state)) {
    const hit = rayLocalBox(ox, oy, oz, dx, dy, dz, box.center, box.half, maxDistance);
    if (!hit || (best && hit.distance >= best.distance - 1e-7)) continue;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (hit.normalAxis === 0) nx = hit.normalSign;
    else if (hit.normalAxis === 1) ny = hit.normalSign;
    else if (hit.normalAxis === 2) nz = hit.normalSign;
    best = {
      distance: hit.distance,
      point: origin.clone().addScaledVector(direction, hit.distance),
      normal: new THREE.Vector3(cos * nx + sin * nz, ny, -sin * nx + cos * nz),
      part: box.part,
      mult: box.mult,
    };
  }
  return best;
}
