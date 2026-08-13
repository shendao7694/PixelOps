export const STREAK_WHEEL_HOLD_SECONDS = 0.18;
export const STREAK_WHEEL_DEAD_ZONE = 0.24;
export const STREAK_WHEEL_MOUSE_SCALE = 0.014;

const SECTOR_ANGLES = Object.freeze([
  -Math.PI / 2,
  Math.PI / 6,
  5 * Math.PI / 6,
]);

export function createStreakWheelState() {
  return {
    tracking: false,
    hold: 0,
    open: false,
    cursorX: 0,
    cursorY: 0,
    selected: -1,
  };
}

export function resetStreakWheelState(state) {
  if (!state) return;
  state.tracking = false;
  state.hold = 0;
  state.open = false;
  state.cursorX = 0;
  state.cursorY = 0;
  state.selected = -1;
}

function angleDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function streakWheelIndexFromVector(x, y, deadZone = STREAK_WHEEL_DEAD_ZONE) {
  const px = Number(x) || 0;
  const py = Number(y) || 0;
  if (Math.hypot(px, py) < deadZone) return -1;
  const angle = Math.atan2(py, px);
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < SECTOR_ANGLES.length; index++) {
    const distance = angleDistance(angle, SECTOR_ANGLES[index]);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Advances one Q-hold selection cycle. Returns the selected slot on a valid
 * key release, or -1 when no reward should be activated.
 */
export function updateStreakWheelState(state, {
  enabled = true,
  pressed = false,
  down = false,
  released = false,
  dx = 0,
  dy = 0,
  dt = 0,
} = {}) {
  if (!state) return -1;
  if (!enabled) {
    resetStreakWheelState(state);
    return -1;
  }

  if (pressed) {
    resetStreakWheelState(state);
    state.tracking = true;
  }

  if (state.tracking && down) {
    state.hold += Math.max(0, Number(dt) || 0);
    state.cursorX += (Number(dx) || 0) * STREAK_WHEEL_MOUSE_SCALE;
    state.cursorY += (Number(dy) || 0) * STREAK_WHEEL_MOUSE_SCALE;
    const length = Math.hypot(state.cursorX, state.cursorY);
    if (length > 1) {
      state.cursorX /= length;
      state.cursorY /= length;
    }
    if (state.hold >= STREAK_WHEEL_HOLD_SECONDS) state.open = true;
    state.selected = state.open
      ? streakWheelIndexFromVector(state.cursorX, state.cursorY)
      : -1;
  }

  if (state.tracking && released) {
    const selected = state.open ? state.selected : -1;
    resetStreakWheelState(state);
    return selected;
  }

  // Blur/reset clears held keys without manufacturing a key-up edge. Treat
  // that as cancellation so losing focus can never spend a reward.
  if (state.tracking && !down && !pressed) resetStreakWheelState(state);
  return -1;
}

export function streakWheelBlocksCombat(state, qDown) {
  return Boolean(state?.tracking && qDown);
}
