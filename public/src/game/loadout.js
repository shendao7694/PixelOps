// Shared client/server loadout catalogue, passive tuning and validation.
// Every option exposed here is implemented and consumed by both the local
// simulation and the PVP authority.

export const LOADOUT_STORAGE_KEY = 'pixelops:loadout:v1';

import {
  LASER_CANNON_KILLS,
  LASER_CANNON_SCORE,
} from './laser-cannon.js';
import {
  ATTACK_HELICOPTER_STREAK_KILLS,
  ATTACK_HELICOPTER_STREAK_SCORE,
} from './attack-helicopter.js';
import {
  FIREBOMB_STREAK_KILLS,
  FIREBOMB_STREAK_SCORE,
} from './firebomb-airstrike.js';
import { JUGGERNAUT_STREAK_KILLS } from './juggernaut.js';

export const PRIMARY_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'rifle',
    name: 'VK-74',
    type: 'ASSAULT RIFLE',
    description: 'Balanced automatic rifle for medium-range fights.',
    live: true,
  }),
  Object.freeze({
    id: 'smg',
    name: 'WASP-9',
    type: 'SUBMACHINE GUN',
    description: 'Fast handling and high fire rate at close range.',
    live: true,
  }),
  Object.freeze({
    id: 'shotgun',
    name: 'BREACH-12',
    type: 'PUMP SHOTGUN',
    description: 'Heavy close-range spread with a deliberate pump cycle.',
    live: true,
  }),
  Object.freeze({
    id: 'sniper',
    name: 'LONGBOW M7',
    type: 'BOLT-ACTION',
    description: 'Precision rifle with a high-magnification optic.',
    live: true,
  }),
]);

export const SECONDARY_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'machine_pistol',
    name: 'VX-9 AUTO',
    type: 'MACHINE PISTOL',
    description: 'High-rate close-range sidearm. Equip with key 2.',
    live: true,
  }),
  Object.freeze({
    id: 'desert_eagle',
    name: 'DESERT EAGLE',
    type: '.50 MAGNUM',
    description: 'Semi-auto hand cannon with punishing recoil.',
    live: true,
  }),
]);

export const GRENADE_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'frag',
    name: 'M67 FRAG',
    type: 'LETHAL GRENADE',
    description: 'Two fragmentation grenades are issued per life.',
    live: true,
  }),
  Object.freeze({
    id: 'incendiary',
    name: 'M14 INCENDIARY',
    type: 'AREA DENIAL GRENADE',
    description: 'Ignites a 10.5-second fire field that cannot burn through cover.',
    live: true,
  }),
  Object.freeze({
    id: 'molotov',
    name: 'MOLOTOV COCKTAIL',
    type: 'IMPACT INCENDIARY',
    description: 'Shatters on first impact and burns for 8.75 seconds.',
    live: true,
  }),
]);

export const MELEE_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'combat_knife',
    name: 'COMBAT KNIFE',
    type: 'STRAIGHT BLADE',
    description: 'Fast one-hit close-range blade. Equip with key 4.',
    live: true,
  }),
  Object.freeze({
    id: 'laser_blade',
    name: 'LASER SHORT BLADE',
    type: 'PROJECTED ENERGY BLADE',
    description: 'Combat-knife handling with a dynamic blue projected edge.',
    live: true,
  }),
]);

export const PASSIVE_IDS = Object.freeze({
  BLAST_PADDING: 'blast_padding',
  CERAMIC_PLATES: 'ceramic_plates',
  AEROBIC_CONDITIONING: 'aerobic_conditioning',
  ELECTRONIC_STEALTH: 'electronic_stealth',
  PREDATORY_INSTINCT: 'predatory_instinct',
  WEAPON_MASTER: 'weapon_master',
  SCORE_SPECIALIST: 'score_specialist',
  LIGHTWEIGHT: 'lightweight',
  MARTYRDOM: 'martyrdom',
  READY_FOR_ACTION: 'ready_for_action',
});

export const PASSIVE_TUNING = Object.freeze({
  explosiveDamageMultiplier: 0.60,
  ceramicArmorBonus: 15,
  healthRegenDelayMultiplier: 0.60,
  streakKillDiscount: 1,
  movementMultiplier: 1.08,
  martyrdomFuseSeconds: 1.3,
  readyForActionDurationSeconds: 10,
  readyForActionMovementMultiplier: 1.20,
});

export const PASSIVE_OPTIONS = Object.freeze([
  Object.freeze({
    id: PASSIVE_IDS.BLAST_PADDING,
    name: 'BLAST PADDING',
    hudName: 'BLAST PAD',
    type: 'BLAST PADDING',
    description: 'Reduces all incoming explosive damage by 40%.',
    icon: 'blast',
    live: true,
  }),
  Object.freeze({
    id: PASSIVE_IDS.CERAMIC_PLATES,
    name: 'CERAMIC PLATES',
    hudName: 'CERAMIC',
    type: 'CERAMIC PLATES',
    description: 'Increases maximum armor by 15 points.',
    icon: 'plates',
    live: true,
  }),
  Object.freeze({
    id: PASSIVE_IDS.AEROBIC_CONDITIONING,
    name: 'AEROBIC CONDITIONING',
    hudName: 'AEROBIC',
    type: 'AEROBIC CONDITIONING',
    description: 'Reduces the delay before health regeneration by 40%.',
    icon: 'pulse',
    live: true,
  }),
  Object.freeze({
    id: PASSIVE_IDS.ELECTRONIC_STEALTH,
    name: 'ELECTRONIC STEALTH',
    hudName: 'E-STEALTH',
    type: 'ELECTRONIC STEALTH',
    description: 'Hidden from enemy UAV sweeps and hostile electronic devices.',
    icon: 'stealth',
    live: true,
  }),
  Object.freeze({
    id: PASSIVE_IDS.PREDATORY_INSTINCT,
    name: 'PREDATORY INSTINCT',
    hudName: 'PREDATOR',
    type: 'PREDATORY INSTINCT',
    description: 'Fully restores armor immediately after every enemy kill.',
    icon: 'predator',
    live: true,
  }),
  Object.freeze({
    id: PASSIVE_IDS.WEAPON_MASTER,
    name: 'WEAPON MASTER',
    hudName: 'OVERKILL',
    type: 'WEAPON MASTER',
    description: 'Replaces the sidearm slot with a second primary weapon.',
    icon: 'weapons',
    live: true,
  }),
  Object.freeze({
    id: PASSIVE_IDS.SCORE_SPECIALIST,
    name: 'SCORE SPECIALIST',
    hudName: 'SCORE PRO',
    type: 'SCORE SPECIALIST',
    description: 'Reduces every killstreak activation requirement by one kill.',
    icon: 'score',
    live: true,
  }),
  Object.freeze({
    id: PASSIVE_IDS.LIGHTWEIGHT,
    name: 'LIGHTWEIGHT',
    hudName: 'LIGHTWEIGHT',
    type: 'LIGHTWEIGHT',
    description: 'Increases movement and sprint speed by 8%.',
    icon: 'wing',
    live: true,
  }),
  Object.freeze({
    id: PASSIVE_IDS.MARTYRDOM,
    name: 'MARTYRDOM',
    hudName: 'MARTYRDOM',
    type: 'MARTYRDOM',
    description: 'Drops a fragmentation grenade on death that explodes after 1.3 seconds.',
    icon: 'martyrdom',
    live: true,
  }),
  Object.freeze({
    id: PASSIVE_IDS.READY_FOR_ACTION,
    name: 'READY FOR ACTION',
    hudName: 'READY UP',
    type: 'READY FOR ACTION',
    description: 'For 10 seconds after spawning, move 20% faster and fire without reloading.',
    icon: 'ready',
    live: true,
  }),
]);

export const STREAK_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'firebomb',
    name: 'INCENDIARY AIRSTRIKE',
    type: `${FIREBOMB_STREAK_KILLS} KILLSTREAK`,
    description: 'B-2 cross-map pass with twelve incendiary bombs.',
    kills: FIREBOMB_STREAK_KILLS,
    score: FIREBOMB_STREAK_SCORE,
    live: true,
  }),
  Object.freeze({
    id: 'attack_helicopter',
    name: 'ATTACK HELICOPTER',
    type: `${ATTACK_HELICOPTER_STREAK_KILLS} KILLSTREAK`,
    description: 'AH-64D gunship patrols the call area for 40 seconds.',
    kills: ATTACK_HELICOPTER_STREAK_KILLS,
    score: ATTACK_HELICOPTER_STREAK_SCORE,
    live: true,
  }),
  Object.freeze({
    id: 'uav',
    name: 'UAV',
    type: '3 KILLSTREAK',
    description: 'Team radar sweeps from a shootable aircraft.',
    kills: 3,
    score: 300,
    live: true,
  }),
  Object.freeze({
    id: 'railgun',
    name: 'ARC-7 LASER CANNON',
    type: `${LASER_CANNON_KILLS} KILLSTREAK`,
    description: 'Eight charged wall-piercing shots with thermal target vision.',
    kills: LASER_CANNON_KILLS,
    score: LASER_CANNON_SCORE,
    live: true,
  }),
  Object.freeze({
    id: 'strike',
    name: 'TV MISSILE',
    type: '5 KILLSTREAK',
    description: 'Manually guided high-altitude missile.',
    kills: 5,
    score: 500,
    live: true,
  }),
  Object.freeze({
    id: 'juggernaut',
    name: 'JUGGERNAUT',
    type: `${JUGGERNAUT_STREAK_KILLS} KILLSTREAK`,
    description: 'Call an AW101-delivered heavy armor and minigun crate.',
    kills: JUGGERNAUT_STREAK_KILLS,
    score: JUGGERNAUT_STREAK_KILLS * 100,
    live: true,
  }),
  Object.freeze({
    id: 'sentry',
    name: 'SENTRY GUN',
    type: '6 KILLSTREAK',
    description: 'Deployable automatic heavy weapon.',
    kills: 6,
    score: 600,
    live: true,
  }),
  Object.freeze({
    id: 'cas',
    name: 'A-10 STRIKE',
    type: '6 KILLSTREAK',
    description: 'Two-aircraft close air support pass.',
    kills: 6,
    score: 600,
    live: true,
  }),
]);

export const LOADOUT_OPTIONS = Object.freeze({
  primary: PRIMARY_OPTIONS,
  secondary: SECONDARY_OPTIONS,
  grenade: GRENADE_OPTIONS,
  melee: MELEE_OPTIONS,
  passives: PASSIVE_OPTIONS,
  streaks: STREAK_OPTIONS,
});

const DEFAULT_LOADOUT = Object.freeze({
  version: 1,
  primary: 'rifle',
  secondary: 'machine_pistol',
  grenade: 'frag',
  melee: 'combat_knife',
  passives: Object.freeze([PASSIVE_IDS.BLAST_PADDING]),
  streaks: Object.freeze(['uav', 'strike', 'sentry']),
});

const ids = (options) => new Set(options.map((option) => option.id));
const VALID_IDS = Object.freeze({
  primary: ids(PRIMARY_OPTIONS),
  secondary: ids(SECONDARY_OPTIONS),
  grenade: ids(GRENADE_OPTIONS),
  melee: ids(MELEE_OPTIONS),
  passives: ids(PASSIVE_OPTIONS),
  streaks: ids(STREAK_OPTIONS),
});

export function createDefaultLoadout() {
  return {
    version: DEFAULT_LOADOUT.version,
    primary: DEFAULT_LOADOUT.primary,
    secondary: DEFAULT_LOADOUT.secondary,
    grenade: DEFAULT_LOADOUT.grenade,
    melee: DEFAULT_LOADOUT.melee,
    passives: [...DEFAULT_LOADOUT.passives],
    streaks: [...DEFAULT_LOADOUT.streaks],
  };
}

function sanitizeSingle(value, group, fallback) {
  return VALID_IDS[group].has(value) ? value : fallback;
}

function sanitizeUniqueSlots(value, group, count, fallback) {
  const result = [];
  for (const id of Array.isArray(value) ? value : []) {
    if (!VALID_IDS[group].has(id) || result.includes(id)) continue;
    result.push(id);
    if (result.length >= count) break;
  }
  for (const id of fallback) {
    if (result.length >= count) break;
    if (!result.includes(id)) result.push(id);
  }
  for (const option of LOADOUT_OPTIONS[group]) {
    if (result.length >= count) break;
    if (!result.includes(option.id)) result.push(option.id);
  }
  return result;
}

export function sanitizeLoadout(value) {
  const source = value && typeof value === 'object' ? value : {};
  const fallback = createDefaultLoadout();
  const primary = sanitizeSingle(source.primary, 'primary', fallback.primary);
  const passives = sanitizeUniqueSlots(source.passives, 'passives', 1, fallback.passives);
  const weaponMaster = passives[0] === PASSIVE_IDS.WEAPON_MASTER;
  let secondary;
  if (weaponMaster) {
    secondary = VALID_IDS.primary.has(source.secondary) && source.secondary !== primary
      ? source.secondary
      : PRIMARY_OPTIONS.find((option) => option.live && option.id !== primary)?.id;
  } else {
    secondary = sanitizeSingle(source.secondary, 'secondary', fallback.secondary);
  }
  return {
    version: 1,
    primary,
    secondary,
    grenade: sanitizeSingle(source.grenade, 'grenade', fallback.grenade),
    melee: sanitizeSingle(source.melee, 'melee', fallback.melee),
    passives,
    streaks: sanitizeUniqueSlots(source.streaks, 'streaks', 3, fallback.streaks),
  };
}

export function setLoadoutSlot(loadout, group, index, optionId) {
  const next = sanitizeLoadout(loadout);
  const weaponMasterSecondary = group === 'secondary'
    && next.passives[0] === PASSIVE_IDS.WEAPON_MASTER;
  if (weaponMasterSecondary) {
    if (!VALID_IDS.primary.has(optionId) || optionId === next.primary) return next;
  } else if (!VALID_IDS[group]?.has(optionId)) {
    return next;
  }
  if (group === 'passives' || group === 'streaks') {
    const slots = next[group];
    const target = Math.max(0, Math.min(slots.length - 1, Number(index) || 0));
    const occupied = slots.indexOf(optionId);
    if (occupied >= 0 && occupied !== target) {
      [slots[target], slots[occupied]] = [slots[occupied], slots[target]];
    } else {
      slots[target] = optionId;
    }
    return sanitizeLoadout(next);
  }
  next[group] = optionId;
  return sanitizeLoadout(next);
}

export function loadoutOption(group, id) {
  return LOADOUT_OPTIONS[group]?.find((option) => option.id === id) || null;
}

export function loadoutSecondaryOption(loadout) {
  const safe = sanitizeLoadout(loadout);
  return safe.passives[0] === PASSIVE_IDS.WEAPON_MASTER
    ? loadoutOption('primary', safe.secondary)
    : loadoutOption('secondary', safe.secondary);
}

export function loadSavedLoadout(storage = globalThis.localStorage) {
  try {
    return sanitizeLoadout(JSON.parse(storage?.getItem(LOADOUT_STORAGE_KEY) || 'null'));
  } catch {
    return createDefaultLoadout();
  }
}

export function saveLoadout(loadout, storage = globalThis.localStorage) {
  const safe = sanitizeLoadout(loadout);
  try {
    storage?.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(safe));
  } catch {}
  return safe;
}

export function loadoutHasStreak(loadout, streakId) {
  return sanitizeLoadout(loadout).streaks.includes(streakId);
}

export function loadoutHasPassive(loadout, passiveId) {
  return Array.isArray(loadout?.passives)
    && loadout.passives[0] === passiveId
    && VALID_IDS.passives.has(passiveId);
}

export function loadoutArmorCapacity(loadout, baseArmor = 50) {
  const base = Math.max(0, Number(baseArmor) || 0);
  return base + (loadoutHasPassive(loadout, PASSIVE_IDS.CERAMIC_PLATES)
    ? PASSIVE_TUNING.ceramicArmorBonus
    : 0);
}

export function loadoutHealthRegenDelay(loadout, baseDelay = 5.5) {
  const base = Math.max(0, Number(baseDelay) || 0);
  return base * (loadoutHasPassive(loadout, PASSIVE_IDS.AEROBIC_CONDITIONING)
    ? PASSIVE_TUNING.healthRegenDelayMultiplier
    : 1);
}

export function loadoutMovementMultiplier(loadout) {
  return loadoutHasPassive(loadout, PASSIVE_IDS.LIGHTWEIGHT)
    ? PASSIVE_TUNING.movementMultiplier
    : 1;
}

export function loadoutExplosiveDamage(loadout, amount) {
  const damage = Math.max(0, Number(amount) || 0);
  return damage * (loadoutHasPassive(loadout, PASSIVE_IDS.BLAST_PADDING)
    ? PASSIVE_TUNING.explosiveDamageMultiplier
    : 1);
}

export function loadoutStreakRequirement(loadout, streakId) {
  const base = Math.max(0, loadoutOption('streaks', streakId)?.kills || 0);
  const discount = loadoutHasPassive(loadout, PASSIVE_IDS.SCORE_SPECIALIST)
    ? PASSIVE_TUNING.streakKillDiscount
    : 0;
  return Math.max(1, base - discount);
}

export function loadoutStreakCrossings(loadout, streakId, beforeKills, afterKills) {
  const requirement = loadoutStreakRequirement(loadout, streakId);
  const before = Math.max(0, Number(beforeKills) || 0);
  const after = Math.max(before, Number(afterKills) || 0);
  // A reward belongs to one life and is earned once when that life first
  // crosses its kill requirement. It must not repeat at 2x/3x the threshold.
  return before < requirement && after >= requirement ? 1 : 0;
}

/** Weapons an ordinary player may ask the PVP authority to equip. */
export function loadoutAllowsWeapon(loadout, weaponId) {
  const safe = sanitizeLoadout(loadout);
  if (weaponId === safe.primary) return true;
  if (weaponId === safe.secondary) {
    return safe.passives[0] === PASSIVE_IDS.WEAPON_MASTER
      ? weaponId !== safe.primary && loadoutOption('primary', weaponId)?.live === true
      : loadoutOption('secondary', weaponId)?.live === true;
  }
  if (weaponId === safe.melee) {
    return loadoutOption('melee', weaponId)?.live === true;
  }
  return false;
}

export function loadoutStreakKey(loadout, streakId) {
  const index = sanitizeLoadout(loadout).streaks.indexOf(streakId);
  return index < 0 ? null : String(index + 5);
}
