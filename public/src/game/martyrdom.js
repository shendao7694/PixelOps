import * as THREE from '../../vendor/three.module.js';
import {
  PASSIVE_IDS,
  PASSIVE_TUNING,
  loadoutHasPassive,
} from './loadout.js';

export const MARTYRDOM_SOURCE = 'martyrdom';
export const MARTYRDOM_DROP_HEIGHT = 0.28;

/**
 * Build the same death grenade for the local PVE clock (seconds) and the
 * authoritative PVP clock (milliseconds). Returning null keeps the passive
 * check beside construction so the two modes cannot drift.
 */
export function createMartyrdomGrenade({
  id,
  ownerId,
  team,
  position,
  loadout,
  now,
  timeUnitsPerSecond = 1,
}) {
  if (!loadoutHasPassive(loadout, PASSIVE_IDS.MARTYRDOM)) return null;
  const dropPosition = position instanceof THREE.Vector3
    ? position.clone()
    : new THREE.Vector3(...position);
  dropPosition.y += MARTYRDOM_DROP_HEIGHT;
  return {
    id,
    ownerId,
    team,
    kind: 'frag',
    position: dropPosition,
    velocity: new THREE.Vector3(),
    detonateAt: Number(now)
      + PASSIVE_TUNING.martyrdomFuseSeconds * timeUnitsPerSecond,
    impactFused: false,
    bounces: 0,
    source: MARTYRDOM_SOURCE,
  };
}
