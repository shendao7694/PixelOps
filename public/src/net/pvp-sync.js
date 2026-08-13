const HORIZONTAL_DEADZONE = 0.12;
const VERTICAL_DEADZONE = 0.08;
const TELEPORT_DISTANCE = 2.25;
const VIEW_CORRECTION_LIMIT = 0.75;
const VIEW_CORRECTION_SHARPNESS = 14;
const SHOT_AIM_TTL_MS = 250;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Captures the exact reticle direction before the local recoil kick changes
 * player yaw/pitch. PVP can then send the same direction for the matching
 * authoritative shot instead of accidentally firing above the crosshair.
 */
export function capturePvpShotAim(weapon, yaw, pitch, now = 0) {
  if (typeof weapon !== 'string' || !weapon
    || !Number.isFinite(yaw) || !Number.isFinite(pitch) || !Number.isFinite(now)) {
    return null;
  }
  return {
    weapon,
    yaw,
    pitch,
    expiresAt: now + SHOT_AIM_TTL_MS,
  };
}

/** Selects the pre-recoil direction only for the next matching trigger packet. */
export function pvpShotAimForInput(pending, {
  weapon,
  trigger = false,
  yaw = 0,
  pitch = 0,
  now = 0,
} = {}) {
  const usesPending = Boolean(
    pending
      && trigger
      && pending.weapon === weapon
      && Number.isFinite(now)
      && now <= pending.expiresAt
  );
  return {
    yaw: usesPending ? pending.yaw : yaw,
    pitch: usesPending ? pending.pitch : pitch,
    usesPending,
    discardPending: Boolean(pending) && !usesPending,
  };
}

/**
 * Samples the locally predicted pose at the time represented by a server
 * snapshot. Entries use plain arrays so this module stays browser/server-test
 * friendly and does not need a Three.js dependency.
 */
export function samplePoseHistory(history, at, maxEdgeGap = 180) {
  if (!history.length || !Number.isFinite(at)) return null;
  const first = history[0];
  const last = history[history.length - 1];
  if (at <= first.at) return first.at - at <= maxEdgeGap ? first : null;
  if (at >= last.at) return at - last.at <= maxEdgeGap ? last : null;

  let hi = history.length - 1;
  while (hi > 0 && history[hi - 1].at >= at) hi--;
  const a = history[hi - 1];
  const b = history[hi];
  const span = Math.max(0.001, b.at - a.at);
  const t = clamp01((at - a.at) / span);
  return {
    at,
    p: [
      a.p[0] + (b.p[0] - a.p[0]) * t,
      a.p[1] + (b.p[1] - a.p[1]) * t,
      a.p[2] + (b.p[2] - a.p[2]) * t,
    ],
    v: [
      a.v[0] + (b.v[0] - a.v[0]) * t,
      a.v[1] + (b.v[1] - a.v[1]) * t,
      a.v[2] + (b.v[2] - a.v[2]) * t,
    ],
    grounded: t < 0.5 ? a.grounded : b.grounded,
  };
}

/**
 * Produces a restrained correction between states from the same point in
 * time. Small grounded height disagreements are deliberately ignored: those
 * are normally the two simulations stepping onto the same stair on adjacent
 * physics substeps, and correcting them is what makes stairs visibly judder.
 */
export function movementCorrection(authoritative, predicted, options = {}) {
  const dx = authoritative[0] - predicted.p[0];
  const dy = authoritative[1] - predicted.p[1];
  const dz = authoritative[2] - predicted.p[2];
  const horizontal = Math.hypot(dx, dz);
  const distance = Math.hypot(horizontal, dy);
  const stepHeight = Number.isFinite(options.stepHeight) ? options.stepHeight : 0.55;
  const serverGrounded = options.serverGrounded === true;
  const clientGrounded = options.clientGrounded === true || predicted.grounded === true;
  const teleport = distance > TELEPORT_DISTANCE
    || horizontal > 2
    || Math.abs(dy) > 1.6;

  if (teleport) {
    return { x: dx, y: dy, z: dz, teleport: true, distance };
  }

  let horizontalScale = 0;
  if (horizontal > HORIZONTAL_DEADZONE) {
    horizontalScale = horizontal > 1.2 ? 0.82 : horizontal > 0.65 ? 0.48 : 0.28;
  }

  let verticalScale = 0;
  const stairPhase = Math.abs(dy) <= stepHeight + 0.12
    && (serverGrounded || clientGrounded);
  if (!stairPhase && Math.abs(dy) > VERTICAL_DEADZONE) {
    verticalScale = Math.abs(dy) > 1 ? 0.62 : 0.24;
  }

  return {
    x: dx * horizontalScale,
    y: dy * verticalScale,
    z: dz * horizontalScale,
    teleport: false,
    distance,
  };
}

/**
 * Keeps an authoritative physics correction from becoming a first-person
 * camera snap. The player/collision position moves immediately, while an
 * equal and opposite render-only offset preserves the view at that instant.
 *
 * The offset is deliberately bounded: ordinary prediction drift is hidden,
 * but a large server correction cannot leave the camera far away from the
 * authoritative body.
 */
export function absorbViewCorrection(offset, correction, limit = VIEW_CORRECTION_LIMIT) {
  if (!offset || !correction) return offset;
  if (correction.teleport) {
    offset.x = 0;
    offset.y = 0;
    offset.z = 0;
    return offset;
  }

  offset.x -= Number.isFinite(correction.x) ? correction.x : 0;
  offset.y -= Number.isFinite(correction.y) ? correction.y : 0;
  offset.z -= Number.isFinite(correction.z) ? correction.z : 0;

  const distance = Math.hypot(offset.x, offset.y, offset.z);
  const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : VIEW_CORRECTION_LIMIT;
  if (distance > safeLimit && distance > 0) {
    const scale = safeLimit / distance;
    offset.x *= scale;
    offset.y *= scale;
    offset.z *= scale;
  }
  return offset;
}

/**
 * Smoothly returns the render-only camera offset to the authoritative body.
 * Exponential decay makes the result frame-rate independent.
 */
export function decayViewCorrection(offset, dt, sharpness = VIEW_CORRECTION_SHARPNESS) {
  if (!offset) return offset;
  const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const safeSharpness = Number.isFinite(sharpness)
    ? Math.max(0, sharpness)
    : VIEW_CORRECTION_SHARPNESS;
  const scale = Math.exp(-safeSharpness * safeDt);
  offset.x *= scale;
  offset.y *= scale;
  offset.z *= scale;
  if (Math.hypot(offset.x, offset.y, offset.z) < 0.0001) {
    offset.x = 0;
    offset.y = 0;
    offset.z = 0;
  }
  return offset;
}

/**
 * Reconciles a locally predicted ammo counter with an authoritative snapshot.
 * While a recent local fire/reload prediction is still in flight, an unchanged
 * server value keeps the locally shown value in either direction. That covers
 * both a predicted shot (magazine decreased) and a predicted reload (magazine
 * increased). Once the server value changes, its confirmed decrease/increase
 * is merged immediately.
 */
export function reconcilePredictedAmmo(
  local,
  authoritative,
  previousAuthoritative = null,
  preservePrediction = false
) {
  const value = (candidate, fallback = 0) => (
    Number.isFinite(candidate) ? Math.max(0, Math.round(candidate)) : fallback
  );
  const auth = {
    mag: value(authoritative?.mag),
    reserve: value(authoritative?.reserve),
  };
  if (!previousAuthoritative) return auth;

  const previous = {
    mag: value(previousAuthoritative.mag, auth.mag),
    reserve: value(previousAuthoritative.reserve, auth.reserve),
  };
  const current = {
    mag: value(local?.mag, auth.mag),
    reserve: value(local?.reserve, auth.reserve),
  };
  const reconcileCounter = (shown, next, before) => {
    if (next > before) return next;
    if (next < before) return Math.min(shown, next);
    if (preservePrediction) return shown;
    return next;
  };
  return {
    mag: reconcileCounter(current.mag, auth.mag, previous.mag),
    reserve: reconcileCounter(current.reserve, auth.reserve, previous.reserve),
  };
}

export function reloadCycleKey(reload) {
  if (!reload || typeof reload.weapon !== 'string' || !Number.isFinite(reload.startedAt)) {
    return null;
  }
  return `${reload.weapon}:${reload.startedAt}`;
}

/** Bounded duplicate guard for authoritative reload animation cycles. */
export class ReloadCycleGuard {
  constructor(limit = 24) {
    this.limit = limit;
    this.seen = new Set();
    this.order = [];
  }

  accept(reload) {
    const key = reloadCycleKey(reload);
    if (!key || this.seen.has(key)) return false;
    this.seen.add(key);
    this.order.push(key);
    while (this.order.length > this.limit) {
      this.seen.delete(this.order.shift());
    }
    return true;
  }

  reset() {
    this.seen.clear();
    this.order.length = 0;
  }
}
