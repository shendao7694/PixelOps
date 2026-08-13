// Shared Juggernaut reward rules and deterministic airdrop timeline.
//
// The browser uses the poses to render the helicopter/crate while the PVP
// server uses the same times to decide when a crate can be claimed. No client
// transform or interaction progress is trusted.

export const JUGGERNAUT_STREAK_KILLS = 8;
export const JUGGERNAUT_MAX_HEALTH = 600;
export const JUGGERNAUT_MAX_ARMOR = 200;

/** The heavy suit is a self-contained weapon platform and cannot call streaks. */
export function juggernautCanUseKillstreak(value) {
  const active = value && typeof value === 'object'
    ? value.juggernaut
    : value;
  return !Boolean(active);
}

/** Respirator audio only exists during live control of a living heavy suit. */
export function shouldPlayJuggernautBreathing({
  mode = '',
  alive = false,
  juggernaut = false,
} = {}) {
  return mode === 'playing' && Boolean(alive) && Boolean(juggernaut);
}

/** Heavy helmet removes both the headshot label and its damage multiplier. */
export function characterHitIsHeadshot(target, part) {
  return part === 'head' && !target?.juggernaut;
}

export function characterHitMultiplier(target, part, multiplier = 1) {
  return part === 'head' && target?.juggernaut ? 1 : multiplier;
}
// A heavy suit receives only 30% of the ordinary Shift-sprint bonus. This is
// the bonus above its walking speed, not 30% of the complete sprint speed.
export const JUGGERNAUT_SPRINT_BONUS_SCALE = 0.3;
// The helmet/camera and suspended M134 follow one deliberately heavy stride.
export const JUGGERNAUT_SPRINT_BOB_RATE_SCALE = 0.6;
export const JUGGERNAUT_INTERACT_SECONDS = 0.5;
export const JUGGERNAUT_INTERACT_RADIUS = 2.35;
export const JUGGERNAUT_CRATE_LIFETIME_SECONDS = 120;

export const JUGGERNAUT_CALL_COMMIT_SECONDS = 0.28;
export const JUGGERNAUT_CALL_DURATION_SECONDS = 0.5;

export const AIRDROP_HELICOPTER_ALTITUDE = 36;
export const AIRDROP_HELICOPTER_START_SECONDS = 0.35;
export const AIRDROP_RELEASE_SECONDS = 3.15;
export const AIRDROP_CRATE_FALL_SECONDS = 1.48;
export const AIRDROP_IMPACT_SECONDS = AIRDROP_RELEASE_SECONDS + AIRDROP_CRATE_FALL_SECONDS;
export const AIRDROP_HELICOPTER_END_SECONDS = 7.2;

const APPROACH_DISTANCE = 145;
const EXIT_DISTANCE = 165;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function createJuggernautAirdrop({
  id,
  ownerId = null,
  team = 'blue',
  target,
  yaw = 0,
  startedAt = 0,
} = {}) {
  const p = Array.isArray(target)
    ? target
    : [target?.x, target?.y, target?.z];
  return {
    id: String(id || ''),
    ownerId: ownerId ? String(ownerId) : null,
    team: team === 'red' ? 'red' : 'blue',
    target: [
      finite(p?.[0]),
      finite(p?.[1]),
      finite(p?.[2]),
    ],
    yaw: finite(yaw),
    startedAt: finite(startedAt),
  };
}

export function airdropAge(drop, now) {
  return Math.max(0, (finite(now) - finite(drop?.startedAt)) / 1000);
}

/**
 * World pose of the AW101. The aircraft crosses the called position exactly
 * when the crate releases, then follows a shallow climbing exit rather than
 * snapping or hovering over the target.
 */
export function airdropHelicopterPose(drop, ageSeconds) {
  const age = finite(ageSeconds);
  const target = drop?.target || [0, 0, 0];
  const yaw = finite(drop?.yaw);
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  let along;
  if (age <= AIRDROP_RELEASE_SECONDS) {
    const u = smoothstep(
      (age - AIRDROP_HELICOPTER_START_SECONDS)
        / (AIRDROP_RELEASE_SECONDS - AIRDROP_HELICOPTER_START_SECONDS)
    );
    along = -APPROACH_DISTANCE * (1 - u);
  } else {
    const u = smoothstep(
      (age - AIRDROP_RELEASE_SECONDS)
        / (AIRDROP_HELICOPTER_END_SECONDS - AIRDROP_RELEASE_SECONDS)
    );
    along = EXIT_DISTANCE * u;
  }
  const exitLift = age > AIRDROP_RELEASE_SECONDS
    ? smoothstep((age - AIRDROP_RELEASE_SECONDS)
      / (AIRDROP_HELICOPTER_END_SECONDS - AIRDROP_RELEASE_SECONDS)) * 11
    : 0;
  const visible = age >= AIRDROP_HELICOPTER_START_SECONDS
    && age <= AIRDROP_HELICOPTER_END_SECONDS;
  return {
    visible,
    x: finite(target[0]) + forwardX * along,
    y: finite(target[1]) + AIRDROP_HELICOPTER_ALTITUDE + exitLift,
    z: finite(target[2]) + forwardZ * along,
    yaw,
    roll: Math.sin(clamp(age, 0, AIRDROP_HELICOPTER_END_SECONDS) * 1.3) * 0.025,
    pitch: age > AIRDROP_RELEASE_SECONDS ? -0.055 : 0.018,
  };
}

/**
 * The crate has no parachute. A slightly accelerating curve sells its weight
 * while still landing at a deterministic time shared with the server.
 */
export function airdropCratePose(drop, ageSeconds) {
  const age = finite(ageSeconds);
  const target = drop?.target || [0, 0, 0];
  const released = age >= AIRDROP_RELEASE_SECONDS;
  const fall = clamp(
    (age - AIRDROP_RELEASE_SECONDS) / AIRDROP_CRATE_FALL_SECONDS,
    0,
    1
  );
  const accelerated = fall * fall;
  const y = finite(target[1])
    + AIRDROP_HELICOPTER_ALTITUDE * (1 - accelerated);
  return {
    visible: released,
    landed: age >= AIRDROP_IMPACT_SECONDS,
    x: finite(target[0]),
    y: age >= AIRDROP_IMPACT_SECONDS ? finite(target[1]) : y,
    z: finite(target[2]),
    rotationX: released && age < AIRDROP_IMPACT_SECONDS ? fall * 2.7 : 0,
    rotationY: finite(drop?.yaw) + (released && age < AIRDROP_IMPACT_SECONDS ? fall * 1.9 : 0),
    rotationZ: released && age < AIRDROP_IMPACT_SECONDS ? fall * -1.6 : 0,
  };
}

export function airdropClaimable(drop, now) {
  const age = airdropAge(drop, now);
  return age >= AIRDROP_IMPACT_SECONDS
    && age <= AIRDROP_IMPACT_SECONDS + JUGGERNAUT_CRATE_LIFETIME_SECONDS;
}

export function withinAirdropInteraction(drop, position) {
  if (!drop?.target || !position) return false;
  const dx = finite(position.x) - finite(drop.target[0]);
  const dz = finite(position.z) - finite(drop.target[2]);
  const dy = Math.abs(finite(position.y) - finite(drop.target[1]));
  return dx * dx + dz * dz <= JUGGERNAUT_INTERACT_RADIUS ** 2 && dy <= 2.2;
}

/**
 * Crates are deliberately contested: eligibility depends on the live body,
 * time and distance, never on the caller id or team.
 */
export function airdropClaimableBy(drop, player, now) {
  return player?.alive !== false
    && !player?.juggernaut
    && airdropClaimable(drop, now)
    && withinAirdropInteraction(drop, player?.position);
}
