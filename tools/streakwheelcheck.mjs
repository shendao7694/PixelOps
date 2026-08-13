import {
  STREAK_WHEEL_HOLD_SECONDS,
  createStreakWheelState,
  streakWheelBlocksCombat,
  streakWheelIndexFromVector,
  updateStreakWheelState,
} from '../src/game/streak-wheel.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nKillstreak wheel input audit\n');

check('the Q hold threshold is 180 milliseconds',
  STREAK_WHEEL_HOLD_SECONDS === 0.18);

check('mouse direction maps to the three equipped streak slots',
  streakWheelIndexFromVector(0, -0.8) === 0
    && streakWheelIndexFromVector(0.8, 0.45) === 1
    && streakWheelIndexFromVector(-0.8, 0.45) === 2
    && streakWheelIndexFromVector(0.05, -0.05) === -1);

const tap = createStreakWheelState();
updateStreakWheelState(tap, {
  enabled: true, pressed: true, down: true, dt: 0.1,
});
const tapResult = updateStreakWheelState(tap, {
  enabled: true, down: false, released: true,
});
check('a short Q tap never activates a reward',
  tapResult === -1 && !tap.open && !tap.tracking);

const hold = createStreakWheelState();
updateStreakWheelState(hold, {
  enabled: true, pressed: true, down: true, dt: 0.1, dx: 50,
});
const blocksDuringHold = streakWheelBlocksCombat(hold, true);
updateStreakWheelState(hold, {
  enabled: true, down: true, dt: 0.08, dy: 32,
});
check('holding Q opens the wheel and blocks combat without losing selection',
  blocksDuringHold && hold.open && hold.selected === 1,
  JSON.stringify(hold));
const releasedSlot = updateStreakWheelState(hold, {
  enabled: true, down: false, released: true,
});
check('releasing Q activates the selected slot and clears the wheel',
  releasedSlot === 1
    && !hold.open
    && !hold.tracking
    && hold.selected === -1);

const centered = createStreakWheelState();
updateStreakWheelState(centered, {
  enabled: true, pressed: true, down: true, dt: 0.2,
});
const centeredResult = updateStreakWheelState(centered, {
  enabled: true, down: false, released: true,
});
check('releasing Q inside the centre dead zone cancels',
  centeredResult === -1);

const blurred = createStreakWheelState();
updateStreakWheelState(blurred, {
  enabled: true, pressed: true, down: true, dt: 0.2, dy: -40,
});
const blurResult = updateStreakWheelState(blurred, {
  enabled: true, down: false, released: false,
});
check('focus loss cancels instead of spending a killstreak',
  blurResult === -1 && !blurred.open && !blurred.tracking);

const clamped = createStreakWheelState();
updateStreakWheelState(clamped, {
  enabled: true, pressed: true, down: true, dt: 0.2, dx: 1000, dy: 1000,
});
check('the virtual mouse cursor remains inside the wheel',
  Math.hypot(clamped.cursorX, clamped.cursorY) <= 1.000001);
updateStreakWheelState(clamped, { enabled: false });
check('disabling gameplay resets an open wheel',
  !clamped.open && !clamped.tracking && clamped.selected === -1);

if (failures) {
  console.error(`\n${failures} killstreak wheel check(s) failed`);
  process.exit(1);
}
console.log('\nKillstreak wheel input verified\n');
