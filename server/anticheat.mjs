// Server-authoritative anti-cheat scoring.
//
// Detection hooks (aim-snap, aim-lock, and any future checks) report suspicious
// behaviour into a single AnticheatMgr, which accumulates a per-client score.
// When a client crosses the kick threshold the server routes the removal
// through the shared "environment anomaly" kick + public announcement, so one
// reusable notification path serves every rule.
//
// Two rules feed the score, both keyed on the *continuous aim error* e(t) —
// the angular distance (degrees) from the reported aim direction to the nearest
// living enemy's chest. This one metric is what a human cannot spoof without
// giving up the cheat's edge:
//   1. Snap — e(t) collapses from "clearly off-target" to "on a body" within a
//      single tick, or the aim angle jumps >`snapDegrees` and lands on a body.
//      Both are instant re-acquisition; a human converges over several ticks.
//   2. Lock — e(t) stays <= `lockEpsilon` on the SAME enemy for `lockTicks`
//      consecutive firing ticks. Silent aim (packet rewrite) holds a literal
//      zero-lag zero-noise lock a human hand cannot reproduce.
import { angleDelta } from '../public/src/core/math.js';

const RAD_TO_DEG = 180 / Math.PI;

// Raw aim-angle jump (degrees) within one 45 Hz tick that flags a teleport.
// Set well above a human's fastest flick (~3000-4000°/s ≈ 66-88°/tick): a
// single-tick turn this large is a teleport, not a 180° flick (which spans
// several ticks). 150°/tick ≈ 6800°/s is unreachable by hand.
export const ANTICHEAT_AIM_SNAP_DEGREES = 150;

// Kick threshold. With the lock rule calibrated to zero false positives on the
// recorded human sample, a low threshold is safe: 3 lock episodes (or 3 teleport
// snaps) convict. Each episode is a distinct engage-and-fire burst, so 3 is
// reached within a single fight rather than across a whole match.
export const ANTICHEAT_KICK_SCORE = 3;

// Lock: the aim ray must stay on the SAME enemy body for this many consecutive
// firing ticks (the silent-aim / smooth-aimbot signature: a zero-lag hold a
// human hand cannot sustain).
// Lock window length. Calibrated against recorded samples: a human can hold a
// steady track on a moving target for ~150 ms (7 ticks) but not ~310 ms
// (14 ticks), while silent aim holds indefinitely. 14 ticks is the shortest
// window that yields zero false positives on the recorded human sample.
export const ANTICHEAT_LOCK_TICKS = 14;        // ~310 ms at 45 Hz

// When true, a lock only convicts if the tracked enemy actually moved during the
// episode. This is the key guard against flagging a steady hold on a stationary
// target (ordinary shooting). Silent aim is most effective on moving targets, so
// the coverage trade is small.
export const ANTICHEAT_LOCK_REQUIRE_MOVE = true;
export const ANTICHEAT_LOCK_MIN_MOVE = 0.25;   // meters the target must travel
// Lock: max standard deviation (meters) of the aim ray's body-local hit height
// over the lock window. Silent aim pins a single aim point (head/chest), so its
// hit height is near-constant (~0.005 m); a smooth aimbot lands ~0.03 m; a
// human's hand wanders across head/chest/legs (measured ~0.20 m over 14 ticks).
// 0.05 m is the largest value that still yields zero false positives on the
// recorded human sample while flagging both cheats.
export const ANTICHEAT_LOCK_HY_STDDEV = 0.05;  // meters
// The lock rule is OFF by default: its body-height variance is confounded by the
// target's angular velocity — at small relative motion a steady human aims nearly
// as tightly as a packet rewriter, so it false-positives on normal play. The lag
// rule (timing) covers both cheats on moving targets; the lock rule remains
// available for experiments via env.
export const ANTICHEAT_LOCK_ENABLED = false;

// Lag rule: measure how many ticks it takes the reported aim to reverse direction
// after the target reverses direction. Silent aim (packet rewrite) flips in the
// same tick (plus ~1-2 ticks of client<->server latency); a human's aim flips
// only after the reaction time (~100-250 ms ≈ 4-11 ticks). Measuring at reversal
// *events* — not the continuous motion — is what exposes the reaction lag, and it
// is immune to hand-tremor magnitude noise because only the *timing* matters.
export const ANTICHEAT_LAG_REVERSALS_NEEDED = 4; // target reversals to observe
export const ANTICHEAT_LAG_ZERO_MAX = 3;         // median response delay (ticks) <= this => cheat
export const ANTICHEAT_LAG_MIN_STEP = 0.0005;    // rad — min step for a real reversal
export const ANTICHEAT_LAG_MAX_DELAY = 20;       // ticks — cap for a non-response

export class AnticheatMgr {
  constructor({
    snapDegrees = ANTICHEAT_AIM_SNAP_DEGREES,
    kickScore = ANTICHEAT_KICK_SCORE,
    lockTicks = ANTICHEAT_LOCK_TICKS,
    lockRequireMove = ANTICHEAT_LOCK_REQUIRE_MOVE,
    lockMinMove = ANTICHEAT_LOCK_MIN_MOVE,
    lockHyStddev = ANTICHEAT_LOCK_HY_STDDEV,
    lockEnabled = ANTICHEAT_LOCK_ENABLED,
    lagReversalsNeeded = ANTICHEAT_LAG_REVERSALS_NEEDED,
    lagZeroMax = ANTICHEAT_LAG_ZERO_MAX,
    lagMinStep = ANTICHEAT_LAG_MIN_STEP,
    lagMaxDelay = ANTICHEAT_LAG_MAX_DELAY,
  } = {}) {
    this.snapDegrees = snapDegrees;
    this.kickScore = kickScore;
    this.lockTicks = lockTicks;
    this.lockRequireMove = lockRequireMove;
    this.lockMinMove = lockMinMove;
    this.lockHyStddev = lockHyStddev;
    this.lockEnabled = lockEnabled;
    this.lagReversalsNeeded = lagReversalsNeeded;
    this.lagZeroMax = lagZeroMax;
    this.lagMinStep = lagMinStep;
    this.lagMaxDelay = lagMaxDelay;
    this.scores = new Map(); // clientKey -> accumulated score
    this.aim = new Map();    // clientKey -> { yaw, pitch } last heading
    this.error = new Map();  // clientKey -> last aim error (degrees)
    this.lock = new Map();   // clientKey -> { targetId, ticks, sx, sy, sz, hy, scored }
    this.lag = new Map();    // clientKey -> { prevYaw, prevTrueYaw, prevTargetStep, awaiting, delays }
  }

  /** Forget every trace of a client (called on leave/kick). */
  reset(key) {
    this.scores.delete(key);
    this.aim.delete(key);
    this.error.delete(key);
    this.lock.delete(key);
    this.lag.delete(key);
  }

  /** Drop only the heading/error/lock/lag baselines, e.g. after a respawn reorients the view. */
  resetAim(key) {
    this.aim.delete(key);
    this.error.delete(key);
    this.lock.delete(key);
    this.lag.delete(key);
  }

  scoreOf(key) {
    return this.scores.get(key) || 0;
  }

  shouldKick(key) {
    return (this.scores.get(key) || 0) >= this.kickScore;
  }

  /** Bump a client's score by one (used internally once a rule fires). */
  score(key) {
    this.scores.set(key, (this.scores.get(key) || 0) + 1);
  }

  /**
   * Feed the authoritative input heading every tick. Returns the per-tick snap
   * magnitude in degrees (0 when under threshold or not firing) but does NOT
   * score on its own — the caller gates on the landing before convicting. The
   * baseline stays fresh while not firing, so the first shot after a turn is
   * still measured against the pre-shot heading.
   */
  feedAim(key, yaw, pitch, firing) {
    const prev = this.aim.get(key);
    if (!prev) {
      this.aim.set(key, { yaw, pitch });
      return 0;
    }
    const dy = Math.abs(angleDelta(prev.yaw, yaw)) * RAD_TO_DEG;
    const dp = Math.abs(pitch - prev.pitch) * RAD_TO_DEG;
    prev.yaw = yaw;
    prev.pitch = pitch;
    if (!firing) return 0;
    const snap = Math.max(dy, dp);
    return snap >= this.snapDegrees ? snap : 0;
  }

  /**
   * Feed the continuous aim error every tick and run both rules. `errorDeg` is
   * the angular distance to the nearest enemy chest (Infinity when there is no
   * enemy in range); `onTarget` is true when the aim ray actually intersects a
   * body; `target` is { id, x, y, z } of the enemy the aim ray hits; `hy` is the
   * aim ray's body-local hit height (meters above the target's feet, null when
   * off-target). Returns a report ({ snap, lock }) whose flags are 1 on the tick
   * a rule scored.
   */
  feedError(key, snapDelta, errorDeg, onTarget, target, firing, hy) {
    const report = { snap: 0, lock: 0 };

    // Snap rule: only an impossible-speed aim-angle jump (>snapDegrees ≈ 6800°/s)
    // that lands on a body. A human 180° flick spans several ticks, so it never
    // produces a single-tick delta this large; a teleport does.
    if (firing && onTarget && snapDelta > 0) {
      this.score(key);
      report.snap = 1;
    }

    // Lock rule (opt-in, off by default): the aim ray staying on the SAME enemy
    // body for many consecutive firing ticks *and* pinned to one body height (low
    // hy std-dev). Disabled because its body-height variance is confounded by the
    // target's angular velocity — see ANTICHEAT_LOCK_ENABLED.
    if (this.lockEnabled) {
      const st = this.lock.get(key);
      const onLock = firing && target && onTarget;
      if (!onLock) {
        if (st) this.lock.delete(key);
      } else if (!st || st.targetId !== target.id) {
        this.lock.set(key, {
          targetId: target.id,
          ticks: 1,
          sx: target.x,
          sy: target.y,
          sz: target.z,
          hy: hy != null ? [hy] : [],
          scored: false,
        });
      } else if (!st.scored) {
        st.ticks++;
        if (hy != null) {
          st.hy.push(hy);
          if (st.hy.length > this.lockTicks) st.hy.shift();
        }
        if (st.ticks >= this.lockTicks) {
          const moved = Math.hypot(target.x - st.sx, target.y - st.sy, target.z - st.sz);
          const hyStd = st.hy.length >= this.lockTicks ? stddev(st.hy) : Infinity;
          if ((!this.lockRequireMove || moved >= this.lockMinMove)
            && hyStd <= this.lockHyStddev) {
            st.scored = true;
            this.score(key);
            report.lock = 1;
          }
        }
      }
    }

    return report;
  }

  /**
   * Lag rule: time how long the reported aim takes to reverse direction after
   * the target reverses direction (as seen from the shooter). `yaw` is the
   * reported aim heading (radians); `targetStep` is the target's per-tick
   * angular step relative to the shooter (radians), derived from the relative
   * velocity so the shooter's own movement never reads as target motion.
   * Returns 1 on the tick a zero-lag episode is scored.
   */
  feedLag(key, yaw, targetStep, firing) {
    let s = this.lag.get(key);
    if (!firing) {
      if (s) this.lag.delete(key);
      return 0;
    }
    if (!s) {
      this.lag.set(key, {
        prevYaw: yaw,
        prevTargetStep: null,
        awaiting: null,
        delays: [],
      });
      return 0;
    }
    const aimStep = angleDelta(s.prevYaw, yaw);
    s.prevYaw = yaw;

    // A target direction reversal (real-magnitude sign flip) starts the clock.
    if (s.prevTargetStep != null
      && targetStep * s.prevTargetStep < 0
      && Math.abs(targetStep) > this.lagMinStep) {
      const sign = Math.sign(targetStep);
      if (Math.sign(aimStep) === sign && Math.abs(aimStep) > this.lagMinStep) {
        s.delays.push(0); // aim reversed in the same tick
      } else {
        s.awaiting = { sign, ticks: 0 };
      }
    }
    s.prevTargetStep = targetStep;

    // Count ticks until the aim flips to the target's new direction.
    if (s.awaiting) {
      s.awaiting.ticks++;
      if (Math.sign(aimStep) === s.awaiting.sign && Math.abs(aimStep) > this.lagMinStep) {
        s.delays.push(s.awaiting.ticks);
        s.awaiting = null;
      } else if (s.awaiting.ticks >= this.lagMaxDelay) {
        s.delays.push(this.lagMaxDelay);
        s.awaiting = null;
      }
    }

    // Judge the median response delay once enough reversals are observed.
    if (s.delays.length >= this.lagReversalsNeeded) {
      const sorted = s.delays.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      this.lag.delete(key);
      if (median <= this.lagZeroMax) {
        this.score(key);
        return 1;
      }
    }
    return 0;
  }
}

function stddev(values) {
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return Math.sqrt(sq / values.length);
}
