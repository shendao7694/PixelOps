import {
  GRENADE_BLAST_RADIUS,
  GRENADE_COVER_START,
} from './grenade.js';

export const FIREBOMB_STREAK_SCORE = 700;
export const FIREBOMB_STREAK_KILLS = 7;
export const FIREBOMB_BOMB_COUNT = 12;
export const FIREBOMB_CALL_DELAY_SECONDS = 2;
export const FIREBOMB_CRUISE_SPEED = 100;
export const FIREBOMB_RELEASE_WINDOW_SECONDS = 2;
export const FIREBOMB_FALL_SECONDS = 1.35;
export const FIREBOMB_ALTITUDE = 220;
export const FIREBOMB_OFFMAP_DISTANCE = 145;
export const FIREBOMB_MAX_DAMAGE = 400 * 1.30;
export const FIREBOMB_BLAST_RADIUS = GRENADE_BLAST_RADIUS * 1.5 * 1.15;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function finitePoint(point) {
  if (Array.isArray(point)) {
    const x = Number(point[0]);
    const z = Number(point[1]);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }
  const x = Number(point?.x);
  const z = Number(point?.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

/**
 * The B-2 always crosses the complete arena from the left boundary to the
 * right boundary. The operator may move only the shared Z coordinate.
 */
export function normalizeFirebombPlan(zValue, bounds) {
  const bx = Number(bounds?.x);
  const bz = Number(bounds?.z);
  const requestedZ = Number(
    Array.isArray(zValue) ? zValue[1] : zValue?.z ?? zValue
  );
  if (!Number.isFinite(bx) || !Number.isFinite(bz)
    || !Number.isFinite(requestedZ) || bx <= 0 || bz <= 0) {
    return null;
  }
  const z = clamp(requestedZ, -bz + 2, bz - 2);
  return {
    start: { x: -bx, z },
    end: { x: bx, z },
    length: bx * 2,
    direction: { x: 1, z: 0 },
  };
}

export function firebombImpactPoint(run, index) {
  const start = finitePoint(run?.start);
  const end = finitePoint(run?.end);
  if (!start || !end || !Number.isInteger(index)
    || index < 0 || index >= FIREBOMB_BOMB_COUNT) {
    return null;
  }
  const progress = (index + 0.5) / FIREBOMB_BOMB_COUNT;
  return {
    x: lerp(start.x, end.x, progress),
    z: lerp(start.z, end.z, progress),
  };
}

export function firebombRunSeconds(run) {
  const start = finitePoint(run?.start);
  const end = finitePoint(run?.end);
  if (!start || !end) return 0;
  return Math.hypot(end.x - start.x, end.z - start.z)
    / FIREBOMB_CRUISE_SPEED;
}

export function firebombReleaseTime(run, index) {
  if (!Number.isInteger(index) || index < 0 || index >= FIREBOMB_BOMB_COUNT) {
    return Infinity;
  }
  const runSeconds = firebombRunSeconds(run);
  if (runSeconds <= 0) return Infinity;
  return FIREBOMB_CALL_DELAY_SECONDS
    + FIREBOMB_OFFMAP_DISTANCE / FIREBOMB_CRUISE_SPEED
    + ((index + 0.5) / FIREBOMB_BOMB_COUNT) * runSeconds;
}

export function firebombImpactTime(run, index) {
  return firebombReleaseTime(run, index) + FIREBOMB_FALL_SECONDS;
}

export function firebombRunLifetimeSeconds(run) {
  const lastImpact = firebombImpactTime(run, FIREBOMB_BOMB_COUNT - 1);
  return Number.isFinite(lastImpact) ? lastImpact + 0.25 : 0;
}

/** A level, high-altitude pass. The aircraft never pitches into a dive. */
export function firebombFlightPose(run, ageSeconds) {
  const start = finitePoint(run?.start);
  const end = finitePoint(run?.end);
  const age = Number(ageSeconds);
  if (!start || !end || !Number.isFinite(age)) {
    return { visible: false, done: true };
  }
  if (age < FIREBOMB_CALL_DELAY_SECONDS) {
    return { visible: false, done: false };
  }

  const flightAge = age - FIREBOMB_CALL_DELAY_SECONDS;
  const routeLength = FIREBOMB_OFFMAP_DISTANCE
    + Math.hypot(end.x - start.x, end.z - start.z)
    + FIREBOMB_OFFMAP_DISTANCE;
  const travelled = flightAge * FIREBOMB_CRUISE_SPEED;
  if (travelled > routeLength) {
    return { visible: false, done: true };
  }
  // One linear clock drives entry, release and exit. There is no special
  // bombing segment, so the airframe cannot visibly brake over the arena.
  const x = start.x - FIREBOMB_OFFMAP_DISTANCE + travelled;
  return {
    visible: true,
    done: false,
    position: { x, y: FIREBOMB_ALTITUDE, z: start.z },
    direction: { x: 1, y: 0, z: 0 },
    roll: 0,
  };
}

export function firebombFallingBombPose(run, index, ageSeconds, groundY = 0) {
  const impact = firebombImpactPoint(run, index);
  const releaseAt = firebombReleaseTime(run, index);
  const age = Number(ageSeconds);
  if (!impact || !Number.isFinite(age) || age < releaseAt) {
    return { visible: false, impacted: false };
  }
  const t = (age - releaseAt) / FIREBOMB_FALL_SECONDS;
  if (t >= 1) return { visible: false, impacted: true };
  const eased = clamp(t, 0, 1);
  return {
    visible: true,
    impacted: false,
    position: {
      x: impact.x - (1 - eased) * 15,
      y: lerp(FIREBOMB_ALTITUDE - 2.2, Number(groundY) || 0, eased * eased),
      z: impact.z,
    },
    direction: { x: 0.22, y: -1, z: 0 },
  };
}

/** Same four proportional bands as the fragmentation grenade, with a 400 core. */
export function firebombDamage(distance, occluded = false) {
  const ratio = Math.max(0, Number(distance) || 0) / FIREBOMB_BLAST_RADIUS;
  if (occluded && ratio >= GRENADE_COVER_START) return 0;
  if (ratio <= 0.3) return FIREBOMB_MAX_DAMAGE;
  if (ratio <= 0.5) return FIREBOMB_MAX_DAMAGE * 0.6;
  if (ratio <= 0.8) return FIREBOMB_MAX_DAMAGE * 0.4;
  if (ratio <= 1) return FIREBOMB_MAX_DAMAGE * 0.2;
  return 0;
}

export function firebombBlastOccluded(origin, target, cast) {
  if (typeof cast !== 'function') return false;
  const direction = target.clone().sub(origin);
  const distance = direction.length();
  if (distance < FIREBOMB_BLAST_RADIUS * GRENADE_COVER_START
    || distance <= 0.05) {
    return false;
  }
  direction.multiplyScalar(1 / distance);
  return Boolean(cast(origin, direction, distance - 0.05));
}
