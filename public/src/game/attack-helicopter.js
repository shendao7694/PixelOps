export const ATTACK_HELICOPTER_STREAK_SCORE = 900;
export const ATTACK_HELICOPTER_STREAK_KILLS = 9;
export const ATTACK_HELICOPTER_TARGET_RADIUS = 130;
export const ATTACK_HELICOPTER_HEALTH = 1100;
export const ATTACK_HELICOPTER_APPROACH_SECONDS = 3.2;
export const ATTACK_HELICOPTER_ON_STATION_SECONDS = 40;
export const ATTACK_HELICOPTER_DEPART_SECONDS = 3.0;
export const ATTACK_HELICOPTER_LIFETIME_SECONDS =
  ATTACK_HELICOPTER_APPROACH_SECONDS
  + ATTACK_HELICOPTER_ON_STATION_SECONDS
  + ATTACK_HELICOPTER_DEPART_SECONDS;
export const ATTACK_HELICOPTER_BURST_ROUNDS = 10;
export const ATTACK_HELICOPTER_SHOT_INTERVAL_SECONDS = 0.2;
export const ATTACK_HELICOPTER_BURST_COOLDOWN_SECONDS = 2;
export const ATTACK_HELICOPTER_DAMAGE = 13;
export const ATTACK_HELICOPTER_ORBIT_RADIUS = 58;
export const ATTACK_HELICOPTER_ALTITUDE = 76;
export const ATTACK_HELICOPTER_TURN_RATE = Math.PI * 0.48;
export const ATTACK_HELICOPTER_FIRE_ALIGNMENT = 0.12;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

function point3(value) {
  if (Array.isArray(value)) {
    const [x, y, z] = value.map(Number);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }
  const x = Number(value?.x);
  const y = Number(value?.y);
  const z = Number(value?.z);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

export function attackHelicopterOnStation(ageSeconds) {
  const age = Number(ageSeconds);
  return Number.isFinite(age)
    && age >= ATTACK_HELICOPTER_APPROACH_SECONDS
    && age < ATTACK_HELICOPTER_APPROACH_SECONDS
      + ATTACK_HELICOPTER_ON_STATION_SECONDS;
}

function helicopterPosition(state, ageSeconds) {
  const call = point3(state?.call);
  if (!call) return null;
  const age = Math.max(0, Number(ageSeconds) || 0);
  const entryYaw = Number.isFinite(Number(state?.entryYaw))
    ? Number(state.entryYaw)
    : 0;
  const radialX = Math.sin(entryYaw);
  const radialZ = Math.cos(entryYaw);
  const stationX = call.x + radialX * ATTACK_HELICOPTER_ORBIT_RADIUS;
  const stationZ = call.z + radialZ * ATTACK_HELICOPTER_ORBIT_RADIUS;

  if (age < ATTACK_HELICOPTER_APPROACH_SECONDS) {
    const t = smooth(age / ATTACK_HELICOPTER_APPROACH_SECONDS);
    return {
      x: lerp(call.x + radialX * 245, stationX, t),
      y: lerp(call.y + 92, call.y + ATTACK_HELICOPTER_ALTITUDE, t),
      z: lerp(call.z + radialZ * 245, stationZ, t),
    };
  }

  const stationAge = age - ATTACK_HELICOPTER_APPROACH_SECONDS;
  const orbitAngle = entryYaw + stationAge * 0.20;
  const orbit = {
    x: call.x + Math.sin(orbitAngle) * ATTACK_HELICOPTER_ORBIT_RADIUS,
    y: call.y + ATTACK_HELICOPTER_ALTITUDE + Math.sin(stationAge * 0.55) * 2.1,
    z: call.z + Math.cos(orbitAngle) * ATTACK_HELICOPTER_ORBIT_RADIUS,
  };
  if (stationAge <= ATTACK_HELICOPTER_ON_STATION_SECONDS) return orbit;

  const departAge = stationAge - ATTACK_HELICOPTER_ON_STATION_SECONDS;
  const t = smooth(departAge / ATTACK_HELICOPTER_DEPART_SECONDS);
  const tangentX = Math.cos(orbitAngle);
  const tangentZ = -Math.sin(orbitAngle);
  return {
    x: orbit.x + tangentX * 245 * t,
    y: orbit.y + 78 * t,
    z: orbit.z + tangentZ * 245 * t,
  };
}

export function attackHelicopterPose(state, ageSeconds) {
  const age = Number(ageSeconds);
  if (!Number.isFinite(age) || age < 0) {
    return { visible: false, done: false };
  }
  if (age >= ATTACK_HELICOPTER_LIFETIME_SECONDS) {
    return { visible: false, done: true };
  }
  const position = helicopterPosition(state, age);
  const next = helicopterPosition(state, age + 0.035);
  if (!position || !next) return { visible: false, done: true };
  let dx = next.x - position.x;
  let dy = next.y - position.y;
  let dz = next.z - position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return {
    visible: true,
    done: false,
    onStation: attackHelicopterOnStation(age),
    position,
    direction: { x: dx / length, y: dy / length, z: dz / length },
    rotorAngle: age * 28,
  };
}

function angleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function attackHelicopterYaw(positionValue, targetValue, fallback = 0) {
  const position = point3(positionValue);
  const target = point3(targetValue);
  if (!position || !target) return Number(fallback) || 0;
  const dx = target.x - position.x;
  const dz = target.z - position.z;
  if (Math.hypot(dx, dz) <= 0.001) return Number(fallback) || 0;
  // The Apache asset points along local +X. THREE's positive Y rotation turns
  // +X toward -Z, hence the negative Z component here.
  return Math.atan2(-dz, dx);
}

export function turnAttackHelicopterYaw(currentValue, targetValue, dtSeconds) {
  const current = Number(currentValue) || 0;
  const target = Number(targetValue) || 0;
  const maxStep = ATTACK_HELICOPTER_TURN_RATE
    * clamp(Number(dtSeconds) || 0, 0, 0.1);
  return current + clamp(angleDelta(current, target), -maxStep, maxStep);
}

export function attackHelicopterLockDelay(currentYaw, targetYaw) {
  return Math.max(
    0.12,
    Math.abs(angleDelta(Number(currentYaw) || 0, Number(targetYaw) || 0))
      / ATTACK_HELICOPTER_TURN_RATE
  );
}

export function attackHelicopterTargetEligible(callValue, targetPosition) {
  const call = point3(callValue);
  const target = point3(targetPosition);
  if (!call || !target) return false;
  return Math.hypot(target.x - call.x, target.z - call.z)
    <= ATTACK_HELICOPTER_TARGET_RADIUS;
}
