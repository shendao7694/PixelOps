export const UAV_DURATION_SECONDS = 20;
export const UAV_FIRST_SWEEP_SECONDS = 0.5;
export const UAV_SWEEP_INTERVAL_SECONDS = 3;
export const UAV_REVEAL_SECONDS = 0.5;
export const UAV_CALL_DURATION_SECONDS = 0.5;
export const UAV_CALL_COMMIT_SECONDS = 0.24;

// The aircraft is deliberately large enough to read against the sky and low
// enough that every primary weapon except the shotgun can reach it from most
// of the arena. Its pose is a function of server time, so clients reconstruct
// smooth 60/120 Hz motion without streaming another transform at 45 Hz.
export const UAV_DRONE_HEALTH = 500;
export const UAV_DRONE_ALTITUDE = 68;
export const UAV_DRONE_ORBIT_RADIUS = 43;
export const UAV_DRONE_ORBIT_SECONDS = 24;
export const UAV_DRONE_WINGSPAN = 18;

const SECOND = 1000;
const TAU = Math.PI * 2;

export function createServerUavState() {
  return {
    uavUntil: 0,
    uavNextSweepAt: 0,
    uavRevealUntil: 0,
    uavSweepSeq: 0,
  };
}

export function createTeamUavStates() {
  return {
    blue: createServerUavState(),
    red: createServerUavState(),
  };
}

/** Starts the authoritative PVP UAV cadence on a team state object. */
export function activateServerUav(state, now) {
  state.uavUntil = now + UAV_DURATION_SECONDS * SECOND;
  state.uavNextSweepAt = now + UAV_FIRST_SWEEP_SECONDS * SECOND;
  state.uavRevealUntil = 0;
  return state.uavUntil;
}

/** Ends the scan immediately while retaining the monotonic sweep sequence. */
export function deactivateServerUav(state) {
  state.uavUntil = 0;
  state.uavNextSweepAt = 0;
  state.uavRevealUntil = 0;
}

/**
 * Advances the server-owned sweep clock. The sequence is monotonic across
 * activations so clients can play exactly one sound for each genuine sweep.
 */
export function advanceServerUav(state, now) {
  if (!state.uavUntil || now >= state.uavUntil) {
    state.uavNextSweepAt = 0;
    state.uavRevealUntil = 0;
    return false;
  }

  let swept = false;
  const interval = UAV_SWEEP_INTERVAL_SECONDS * SECOND;
  while (state.uavNextSweepAt > 0 && now >= state.uavNextSweepAt) {
    const sweepAt = state.uavNextSweepAt;
    state.uavSweepSeq = (state.uavSweepSeq || 0) + 1;
    state.uavRevealUntil = Math.min(
      state.uavUntil,
      sweepAt + UAV_REVEAL_SECONDS * SECOND
    );
    state.uavNextSweepAt += interval;
    swept = true;
  }
  return swept;
}

export function serverUavRevealSeconds(state, now) {
  if (!state.uavUntil || now >= state.uavUntil) return 0;
  return Math.max(0, (state.uavRevealUntil - now) / SECOND);
}

/** Opacity for the end of a sweep reveal: 1 at ping, smoothly reaching 0. */
export function uavRevealAlpha(revealSeconds) {
  return Math.max(0, Math.min(1, Number(revealSeconds) / UAV_REVEAL_SECONDS || 0));
}

export function uavDroneId(team) {
  return `uav-${team === 'red' ? 'red' : 'blue'}`;
}

/**
 * Deterministic high-altitude orbit shared by the authoritative server and
 * every renderer. Red is always half an orbit from blue, so the two allowed
 * aircraft can never overlap even when their activation times differ.
 */
export function uavDronePose(team, nowMs, groundY = 0, out = {}) {
  const periodMs = UAV_DRONE_ORBIT_SECONDS * SECOND;
  const clock = Number.isFinite(nowMs) ? nowMs : 0;
  const phase = team === 'red' ? Math.PI : 0;
  const angle = ((clock % periodMs) / periodMs) * TAU + phase;
  out.x = Math.sin(angle) * UAV_DRONE_ORBIT_RADIUS;
  out.y = groundY + UAV_DRONE_ALTITUDE + Math.sin(angle * 2) * 1.1;
  out.z = Math.cos(angle) * UAV_DRONE_ORBIT_RADIUS;
  out.yaw = angle - Math.PI / 2;
  out.bank = -0.11;
  return out;
}

export function createUavDroneState({
  ownerId = null,
  team = 'blue',
  now = 0,
  groundY = 0,
} = {}) {
  const pose = uavDronePose(team, now, groundY);
  return {
    id: uavDroneId(team),
    ownerId,
    team,
    health: UAV_DRONE_HEALTH,
    maxHealth: UAV_DRONE_HEALTH,
    spawnedAt: now,
    expiresAt: now + UAV_DURATION_SECONDS * SECOND,
    position: { x: pose.x, y: pose.y, z: pose.z },
    yaw: pose.yaw,
    bank: pose.bank,
    alive: true,
  };
}

export function updateUavDroneState(drone, now, groundY = 0) {
  const pose = uavDronePose(drone.team, now, groundY);
  drone.position.x = pose.x;
  drone.position.y = pose.y;
  drone.position.z = pose.z;
  drone.yaw = pose.yaw;
  drone.bank = pose.bank;
  return drone;
}
