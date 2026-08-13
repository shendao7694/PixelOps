import {
  PASSIVE_IDS,
  PASSIVE_TUNING,
  loadoutHasPassive,
} from './loadout.js';

export function readyForActionUntil(loadout, now, timeUnitsPerSecond = 1) {
  if (!loadoutHasPassive(loadout, PASSIVE_IDS.READY_FOR_ACTION)) return 0;
  return Number(now)
    + PASSIVE_TUNING.readyForActionDurationSeconds * timeUnitsPerSecond;
}

export function readyForActionActive(loadout, until, now) {
  return loadoutHasPassive(loadout, PASSIVE_IDS.READY_FOR_ACTION)
    && Number(until) > Number(now);
}

export function readyForActionMovementMultiplier(active) {
  return active ? PASSIVE_TUNING.readyForActionMovementMultiplier : 1;
}
