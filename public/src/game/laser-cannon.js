// ARC-7 laser-cannon scorestreak. Keep the tuning and charge gate shared by
// the local simulation, first-person prediction and the PVP authority.

export const LASER_CANNON_ID = 'railgun';
export const LASER_CANNON_SCORE = 600; //
export const LASER_CANNON_KILLS = 6; //
export const LASER_CANNON_SHOTS = 8; //
export const LASER_CANNON_CHARGE_SECONDS = 1; //
export const LASER_CANNON_THERMAL_LAYER = 2; //2

export function laserCannonChargeInputValid({
  weaponId,
  active = true,
  trigger,
  aim,
  adsBlend,
  sprinting = false,
  reloading = false,
  switching = false,
  blocked = false,
  canAct = true,
} = {}) {
  return active
    && weaponId === LASER_CANNON_ID
    && Boolean(trigger)
    && Boolean(aim)
    && Number(adsBlend) > 0.86
    && !sprinting
    && !reloading
    && !switching
    && !blocked
    && canAct !== false;
}

export function laserCannonChargeProgress(elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  return Math.min(1, elapsed / LASER_CANNON_CHARGE_SECONDS);
}
