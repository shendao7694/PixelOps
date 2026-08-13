const READY_EPSILON = 1e-7;

/**
 * Advances a weapon cooldown without throwing away the fractional part that
 * crossed zero. Keeping that remainder lets a 45 Hz server represent rates
 * such as 700/940 RPM with the same long-term cadence as a 60+ FPS client.
 *
 * A new trigger press starts from zero. Negative carry is retained only while
 * the same burst is being held, so time spent idle cannot pre-charge a shot.
 */
export function advanceFireCooldown(cooldown, dt, continuingBurst) {
  const current = Number.isFinite(cooldown) ? cooldown : 0;
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const next = current - step;
  return continuingBurst ? next : Math.max(0, next);
}

export function fireCooldownReady(cooldown) {
  return !Number.isFinite(cooldown) || cooldown <= READY_EPSILON;
}

/**
 * Schedules the next round while retaining a bounded amount of tick/frame
 * overshoot. The bound prevents a long stalled frame from producing a burst
 * of catch-up shots.
 */
export function beginFireCooldown(cooldown, interval) {
  const period = Number.isFinite(interval) ? Math.max(READY_EPSILON, interval) : 1;
  const carry = Math.max(-period * 0.9, Math.min(0, Number(cooldown) || 0));
  return Math.max(period * 0.1, period + carry);
}
