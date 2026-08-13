// Shared close-air-support rules. The browser owns presentation while the PVP
// server owns validation, timing and damage; both use these exact constants and
// deterministic impact positions so the A-10 run never drifts between clients.

export const CAS_STREAK_KILLS = 6;
export const CAS_RUN_LENGTH = 104;
export const CAS_BLAST_RADIUS = 5;
// Width shown on the tablet is the complete damage envelope. Impact centres
// occupy the inner 16 metres and their five-metre blast radius reaches the
// displayed edge, so presentation and authoritative damage use one footprint.
export const CAS_RUN_WIDTH = 26;
export const CAS_IMPACT_WIDTH = CAS_RUN_WIDTH - CAS_BLAST_RADIUS * 2;
export const CAS_DELAY_SECONDS = 1.15;
export const CAS_APPROACH_SECONDS = 1.25;
export const CAS_STRAFE_SECONDS = 0.86;
export const CAS_DEPART_SECONDS = 1.7;
export const CAS_PASS_COUNT = 2;
export const CAS_PASS_DELAY_SECONDS = 2;
export const CAS_FLIGHT_SECONDS =
  CAS_DELAY_SECONDS + CAS_APPROACH_SECONDS + CAS_STRAFE_SECONDS + CAS_DEPART_SECONDS
  + CAS_PASS_DELAY_SECONDS * (CAS_PASS_COUNT - 1);
export const CAS_ROUNDS = 80;
// One exposed GAU-8 impact inside the selected lane is fatal even through a
// fresh 50-point armor plate. Two fast, interleaved passes then make the whole
// tasking rectangle a genuinely lethal danger area instead of a cosmetic
// shower of chip damage.
export const CAS_DAMAGE_MIN = 175;
export const CAS_DAMAGE_MAX = 340;

const CAS_ROUNDS_PER_PASS = CAS_ROUNDS / CAS_PASS_COUNT;
const CAS_ALONG_CELLS = CAS_ROUNDS_PER_PASS / 2;
const CAS_APPROACH_DISTANCE = 320;
const CAS_ENTRY_ALTITUDE = 310;
const CAS_ATTACK_LEAD = 58;
const CAS_ATTACK_START_ALTITUDE = 155;
const CAS_ATTACK_END_ALTITUDE = 82;
const CAS_EXIT_DISTANCE = 320;
const CAS_EXIT_ALTITUDE = 320;
const CAS_PASS_LATERAL_OFFSET = 2.4;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

const bezier = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a
    + 3 * u * u * t * b
    + 3 * u * t * t * c
    + t * t * t * d;
};

const bezierTangent = (a, b, c, d, t) => {
  const u = 1 - t;
  return 3 * u * u * (b - a)
    + 6 * u * t * (c - b)
    + 3 * t * t * (d - c);
};

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

function shiftSegmentInside(start, end, limit, axis) {
  const low = Math.min(start[axis], end[axis]);
  const high = Math.max(start[axis], end[axis]);
  let shift = 0;
  if (low < -limit) shift = -limit - low;
  if (high + shift > limit) shift += limit - (high + shift);
  start[axis] += shift;
  end[axis] += shift;
}

/**
 * Turn two untrusted cursor points into an attack line with no gameplay
 * minimum. The requested distance is preserved until it reaches the 104 metre
 * maximum, then capped. The full damage corridor is shifted inside the map.
 */
export function normalizeCasPlan(startValue, endValue, bounds) {
  const start = finitePoint(startValue);
  const requestedEnd = finitePoint(endValue);
  const bx = Number(bounds?.x);
  const bz = Number(bounds?.z);
  if (!start || !requestedEnd || !Number.isFinite(bx) || !Number.isFinite(bz)) return null;

  const dx = requestedEnd.x - start.x;
  const dz = requestedEnd.z - start.z;
  const requestedLength = Math.hypot(dx, dz);
  // Exact coincidence has no direction and therefore cannot define a flight
  // path; every finite non-zero distance is otherwise valid.
  if (requestedLength < 1e-6) return null;
  const inv = 1 / requestedLength;
  const fx = dx * inv;
  const fz = dz * inv;

  const inset = CAS_RUN_WIDTH * 0.5 + 1.5;
  const limitX = bx - inset;
  const limitZ = bz - inset;
  if (limitX <= 0 || limitZ <= 0) return null;

  // A diagonal segment must fit along both axes after translation. Arena
  // boundaries can shorten the global maximum, but never lengthen a request.
  let allowedLength = CAS_RUN_LENGTH;
  if (Math.abs(fx) > 1e-8) allowedLength = Math.min(allowedLength, limitX * 2 / Math.abs(fx));
  if (Math.abs(fz) > 1e-8) allowedLength = Math.min(allowedLength, limitZ * 2 / Math.abs(fz));
  const length = Math.min(requestedLength, allowedLength);
  if (length < 1e-6) return null;
  const end = {
    x: start.x + fx * length,
    z: start.z + fz * length,
  };

  shiftSegmentInside(start, end, limitX, 'x');
  shiftSegmentInside(start, end, limitZ, 'z');

  return {
    start,
    end,
    length,
    maxLength: CAS_RUN_LENGTH,
    direction: { x: fx, z: fz },
  };
}

function randomUnit(seed, index, lane = 0) {
  let value = ((seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b1)
    ^ Math.imul(lane + 7, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

/** Deterministic impact inside the selected wide rectangle. */
export function casImpactPoint(run, index) {
  const start = finitePoint(run?.start);
  const end = finitePoint(run?.end);
  if (!start || !end || !Number.isInteger(index) || index < 0 || index >= CAS_ROUNDS) {
    return null;
  }
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz) || 1;
  const fx = dx / length;
  const fz = dz / length;
  const rx = -fz;
  const rz = fx;
  const seed = Number(run?.seed) >>> 0;
  const pass = casRoundPass(index);
  const shot = index % CAS_ROUNDS_PER_PASS;
  const alongCell = Math.floor(shot / 2);
  // Each aircraft owns two of four interleaved lanes. Their outer centres sit
  // on the +/-8m impact limits; the five-metre radial blast then reaches the
  // exact +/-13m danger width painted on the tablet.
  const lane = pass + (shot % 2) * CAS_PASS_COUNT;
  const alongJitter = (randomUnit(seed, index, 0) - 0.5) * 0.9;
  const lateralJitter = (randomUnit(seed, index, 1) - 0.5) * 0.7;
  const progress = clamp(
    (alongCell + 0.5) / CAS_ALONG_CELLS + alongJitter / length,
    0,
    1
  );
  const lanePosition = -CAS_IMPACT_WIDTH * 0.5
    + lane * (CAS_IMPACT_WIDTH / (CAS_PASS_COUNT * 2 - 1));
  const lateral = clamp(
    lanePosition + lateralJitter,
    -CAS_IMPACT_WIDTH * 0.5,
    CAS_IMPACT_WIDTH * 0.5
  );
  return {
    x: lerp(start.x, end.x, progress) + rx * lateral,
    z: lerp(start.z, end.z, progress) + rz * lateral,
  };
}

export function casRoundPass(index) {
  if (!Number.isInteger(index) || index < 0 || index >= CAS_ROUNDS) return -1;
  return Math.floor(index / CAS_ROUNDS_PER_PASS);
}

export function casRoundTime(index) {
  const pass = casRoundPass(index);
  if (pass < 0) return Infinity;
  const shot = index % CAS_ROUNDS_PER_PASS;
  return pass * CAS_PASS_DELAY_SECONDS
    + CAS_DELAY_SECONDS + CAS_APPROACH_SECONDS
    + ((shot + 0.5) / CAS_ROUNDS_PER_PASS) * CAS_STRAFE_SECONDS;
}

export function casDamage(distance) {
  const d = Number(distance);
  if (!Number.isFinite(d) || d >= CAS_BLAST_RADIUS) return 0;
  const u = 1 - Math.max(0, d) / CAS_BLAST_RADIUS;
  return CAS_DAMAGE_MIN + (CAS_DAMAGE_MAX - CAS_DAMAGE_MIN) * u * u;
}

function direction3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

/**
 * MW-style precision-airstrike flight. Each fast pass enters high, commits to
 * a steep nose-down gun run whose muzzle points at the selected ground line,
 * then continues through the dive before following a cubic pull-up. The
 * derivative of that curve supplies the departure heading, so the model can
 * never translate one way while appearing to fly backwards.
 */
export function casFlightPose(run, ageSeconds, passIndex = 0) {
  const start = finitePoint(run?.start);
  const end = finitePoint(run?.end);
  const age = Number(ageSeconds) - Math.max(0, Number(passIndex) || 0) * CAS_PASS_DELAY_SECONDS;
  if (!start || !end || !Number.isFinite(age)
    || passIndex < 0 || passIndex >= CAS_PASS_COUNT) {
    return { visible: false, done: true };
  }
  if (age < CAS_DELAY_SECONDS) return { visible: false, done: false };

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz) || 1;
  const fx = dx / length;
  const fz = dz / length;
  const rx = -fz;
  const rz = fx;
  const lateral = (passIndex - (CAS_PASS_COUNT - 1) * 0.5) * 2 * CAS_PASS_LATERAL_OFFSET;
  const sx = start.x + rx * lateral;
  const sz = start.z + rz * lateral;
  const ex = end.x + rx * lateral;
  const ez = end.z + rz * lateral;
  const flightAge = age - CAS_DELAY_SECONDS;
  let position;
  let direction;
  let firing = false;
  let roll = 0;

  if (flightAge < CAS_APPROACH_SECONDS) {
    const t = clamp(flightAge / CAS_APPROACH_SECONDS, 0, 1);
    const p0 = {
      x: sx - fx * CAS_APPROACH_DISTANCE,
      y: CAS_ENTRY_ALTITUDE,
      z: sz - fz * CAS_APPROACH_DISTANCE,
    };
    const p1 = {
      x: sx - fx * 220,
      y: 305,
      z: sz - fz * 220,
    };
    const p2 = {
      x: sx - fx * 83,
      y: 222,
      z: sz - fz * 83,
    };
    const p3 = {
      x: sx - fx * CAS_ATTACK_LEAD,
      y: CAS_ATTACK_START_ALTITUDE,
      z: sz - fz * CAS_ATTACK_LEAD,
    };
    position = {
      x: bezier(p0.x, p1.x, p2.x, p3.x, t),
      y: bezier(p0.y, p1.y, p2.y, p3.y, t),
      z: bezier(p0.z, p1.z, p2.z, p3.z, t),
    };
    direction = direction3(
      bezierTangent(p0.x, p1.x, p2.x, p3.x, t),
      bezierTangent(p0.y, p1.y, p2.y, p3.y, t),
      bezierTangent(p0.z, p1.z, p2.z, p3.z, t)
    );
    roll = Math.sin(t * Math.PI) * (passIndex ? -0.08 : 0.08);
  } else if (flightAge < CAS_APPROACH_SECONDS + CAS_STRAFE_SECONDS) {
    const t = clamp(
      (flightAge - CAS_APPROACH_SECONDS) / CAS_STRAFE_SECONDS,
      0,
      1
    );
    const targetX = lerp(sx, ex, t);
    const targetZ = lerp(sz, ez, t);
    // A linear descent keeps translational velocity aligned with the pointed
    // nose throughout the burst. Easing the height at either end made the
    // aircraft slide almost horizontally while still pitched steeply down.
    const altitude = lerp(CAS_ATTACK_START_ALTITUDE, CAS_ATTACK_END_ALTITUDE, t);
    position = {
      x: targetX - fx * CAS_ATTACK_LEAD,
      y: altitude,
      z: targetZ - fz * CAS_ATTACK_LEAD,
    };
    // Point the GAU-8 itself at the tasking line. This is deliberately not a
    // vertical ray from the aircraft's belly.
    direction = direction3(fx * CAS_ATTACK_LEAD, -altitude, fz * CAS_ATTACK_LEAD);
    firing = true;
    roll = Math.sin(t * Math.PI) * (passIndex ? 0.018 : -0.018);
  } else if (flightAge < CAS_APPROACH_SECONDS + CAS_STRAFE_SECONDS + CAS_DEPART_SECONDS) {
    const t = clamp(
      (flightAge - CAS_APPROACH_SECONDS - CAS_STRAFE_SECONDS) / CAS_DEPART_SECONDS,
      0,
      1
    );
    const p0 = {
      x: ex - fx * CAS_ATTACK_LEAD,
      y: CAS_ATTACK_END_ALTITUDE,
      z: ez - fz * CAS_ATTACK_LEAD,
    };
    // Continue along the firing attitude before the curve bottoms out. A
    // straight snap upward here is what made the previous departure look like
    // the aircraft had reversed direction.
    const p1 = {
      x: p0.x + fx * 20,
      y: 54,
      z: p0.z + fz * 20,
    };
    const p2 = {
      x: ex + fx * 130,
      y: 235,
      z: ez + fz * 130,
    };
    const p3 = {
      x: ex + fx * CAS_EXIT_DISTANCE,
      y: CAS_EXIT_ALTITUDE,
      z: ez + fz * CAS_EXIT_DISTANCE,
    };
    position = {
      x: bezier(p0.x, p1.x, p2.x, p3.x, t),
      y: bezier(p0.y, p1.y, p2.y, p3.y, t),
      z: bezier(p0.z, p1.z, p2.z, p3.z, t),
    };
    direction = direction3(
      bezierTangent(p0.x, p1.x, p2.x, p3.x, t),
      bezierTangent(p0.y, p1.y, p2.y, p3.y, t),
      bezierTangent(p0.z, p1.z, p2.z, p3.z, t)
    );
    roll = -Math.sin(t * Math.PI) * (passIndex ? -0.10 : 0.10);
  } else {
    return { visible: false, done: true };
  }

  return { visible: true, done: false, firing, position, direction, roll };
}
