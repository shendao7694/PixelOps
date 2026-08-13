import * as THREE from '../../vendor/three.module.js';

export const COMBAT_KNIFE_DAMAGE = 30; //150
export const COMBAT_KNIFE_RANGE = 2.55;
export const COMBAT_KNIFE_SWEEP_RADIUS = 0.58;
export const COMBAT_KNIFE_SWING_SECONDS = 0.56;
export const COMBAT_KNIFE_HIT_SECONDS = 0.13;
export const COMBAT_KNIFE_COOLDOWN_SECONDS = 0.66;
export const COMBAT_KNIFE_DRAW_SECONDS = 0.62;

const TAU = Math.PI * 2;
const COMBAT_KNIFE_FLIP_TRACK = [
  { t: 0.00, spinX: -0.18, spinY: 0, spinZ: 0, handleL: 0, handleR: 0 },
  { t: 0.18, spinX: 0.42, spinY: 0.82, spinZ: 1.22, handleL: 1.54, handleR: -0.42 },
  { t: 0.39, spinX: -0.36, spinY: 2.34, spinZ: 2.72, handleL: 3.18, handleR: -1.86 },
  { t: 0.61, spinX: 0.28, spinY: 4.02, spinZ: 4.31, handleL: 4.76, handleR: -3.62 },
  { t: 0.82, spinX: -0.10, spinY: 5.52, spinZ: 5.66, handleL: 5.84, handleR: -5.32 },
  { t: 1.00, spinX: 0, spinY: TAU, spinZ: TAU, handleL: TAU, handleR: -TAU },
];

const _to = new THREE.Vector3();
const _direction = new THREE.Vector3();

function finiteRadius(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0.42;
}

/**
 * Shared first/third-person balisong flourish. Every rotating part finishes
 * on an exact full turn, so the animation can return to its authored pose
 * without a visible snap on the following frame.
 */
export function combatKnifeFlipPose(progress) {
  const time = Math.max(0, Math.min(1, Number(progress) || 0));
  let index = 0;
  while (
    index < COMBAT_KNIFE_FLIP_TRACK.length - 1
    && COMBAT_KNIFE_FLIP_TRACK[index + 1].t <= time
  ) {
    index++;
  }
  const a = COMBAT_KNIFE_FLIP_TRACK[index];
  const b = COMBAT_KNIFE_FLIP_TRACK[Math.min(index + 1, COMBAT_KNIFE_FLIP_TRACK.length - 1)];
  const span = b.t - a.t;
  const linear = span > 0 ? Math.max(0, Math.min(1, (time - a.t) / span)) : 1;
  const eased = linear * linear * (3 - 2 * linear);
  const mix = (key) => a[key] + (b[key] - a[key]) * eased;
  return {
    spinX: mix('spinX'),
    spinY: mix('spinY'),
    spinZ: mix('spinZ'),
    handleL: mix('handleL'),
    handleR: mix('handleR'),
  };
}

/**
 * Scores a body-sized target against the short capsule swept by a knife.
 * The caller supplies the target's torso point and radius; no client-selected
 * target id is needed by the authoritative server.
 */
export function combatKnifeCandidate(origin, forward, point, radius = 0.42) {
  if (!origin || !forward || !point) return null;
  const bodyRadius = finiteRadius(radius);
  _to.subVectors(point, origin);
  const centerDistance = _to.length();
  if (centerDistance <= 1e-5 || centerDistance > COMBAT_KNIFE_RANGE + bodyRadius) {
    return null;
  }

  _direction.copy(forward);
  if (_direction.lengthSq() <= 1e-8) return null;
  _direction.normalize();
  const along = _to.dot(_direction);
  if (along < 0.12 || along > COMBAT_KNIFE_RANGE + bodyRadius) return null;
  const lateralSq = Math.max(0, _to.lengthSq() - along * along);
  const allowedLateral = COMBAT_KNIFE_SWEEP_RADIUS + bodyRadius;
  if (lateralSq > allowedLateral * allowedLateral) return null;

  const lateral = Math.sqrt(lateralSq);
  return {
    along,
    lateral,
    distance: Math.max(0, centerDistance - bodyRadius),
    score: Math.max(0, along - bodyRadius) + lateral * 0.35,
  };
}

/**
 * Returns the best unobstructed candidate. `blocked` receives the eye, torso
 * point and direct distance so PVE and PVP can use their own world raycasters.
 */
export function chooseCombatKnifeTarget(origin, forward, candidates, blocked = null) {
  const ranked = [];
  for (const candidate of candidates || []) {
    if (!candidate?.point) continue;
    const hit = combatKnifeCandidate(
      origin,
      forward,
      candidate.point,
      candidate.radius
    );
    if (hit) ranked.push({ ...candidate, ...hit });
  }
  ranked.sort((a, b) => a.score - b.score);
  for (const candidate of ranked) {
    const directDistance = origin.distanceTo(candidate.point);
    if (blocked?.(origin, candidate.point, directDistance, candidate)) continue;
    return candidate;
  }
  return null;
}

export function combatKnifeTargetPoint(actor, out = new THREE.Vector3()) {
  const position = actor?.position || actor?.actor?.position;
  if (!position) return out.set(0, 0, 0);
  const crouching = Boolean(
    actor?.crouching
      ?? actor?.crouch
      ?? actor?.actor?.crouching
  );
  const sliding = Boolean(actor?.sliding ?? actor?.actor?.sliding);
  const y = sliding ? 0.72 : crouching ? 0.82 : 1.08;
  return out.copy(position).add(new THREE.Vector3(0, y, 0));
}
