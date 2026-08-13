import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LOADOUT_OPTIONS,
  PASSIVE_IDS,
  PASSIVE_TUNING,
  createDefaultLoadout,
  loadSavedLoadout,
  loadoutArmorCapacity,
  loadoutAllowsWeapon,
  loadoutExplosiveDamage,
  loadoutHasPassive,
  loadoutHasStreak,
  loadoutHealthRegenDelay,
  loadoutMovementMultiplier,
  loadoutSecondaryOption,
  loadoutStreakCrossings,
  loadoutStreakKey,
  loadoutStreakRequirement,
  sanitizeLoadout,
  saveLoadout,
  setLoadoutSlot,
} from '../src/game/loadout.js';
import {
  EQUIPMENT_HOTKEYS,
  equipmentSlotForCode,
  pressedEquipmentSlot,
} from '../src/game/equipment-hotkeys.js';
import { silhouetteAssetUrl } from '../src/ui/silhouette-assets.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nDeployment loadout audit\n');

check('equipment hotkeys are 1 primary, 2 secondary, 3 melee and 4 grenade',
  EQUIPMENT_HOTKEYS.primary.code === 'Digit1'
    && EQUIPMENT_HOTKEYS.secondary.code === 'Digit2'
    && EQUIPMENT_HOTKEYS.melee.code === 'Digit3'
    && EQUIPMENT_HOTKEYS.grenade.code === 'Digit4'
    && equipmentSlotForCode('Digit1') === 'primary'
    && equipmentSlotForCode('Digit2') === 'secondary'
    && equipmentSlotForCode('Digit3') === 'melee'
    && equipmentSlotForCode('Digit4') === 'grenade'
    && equipmentSlotForCode('Backquote') === null
    && pressedEquipmentSlot({
      pressed: (code) => code === 'Digit4',
    }) === 'grenade');

check('the armory exposes four ordinary primaries and no scorestreak weapon',
  LOADOUT_OPTIONS.primary.length === 4
    && LOADOUT_OPTIONS.primary.every((option) => option.live)
    && !LOADOUT_OPTIONS.primary.some((option) => option.id === 'railgun'));
check('the secondary catalogue contains only the two implemented sidearms',
  LOADOUT_OPTIONS.secondary.length === 2
    && LOADOUT_OPTIONS.secondary.every((option) => option.live)
    && LOADOUT_OPTIONS.secondary.some((option) =>
      option.id === 'machine_pistol' && option.live)
    && LOADOUT_OPTIONS.secondary.some((option) =>
      option.id === 'desert_eagle' && option.live)
    && !LOADOUT_OPTIONS.secondary.some((option) =>
      ['p9', 'm1911', 'r8'].includes(option.id)));
const deagleSilhouetteUrl = silhouetteAssetUrl('desert_eagle');
const deagleSilhouettePath = fileURLToPath(deagleSilhouetteUrl);
const deagleSilhouette = existsSync(deagleSilhouettePath)
  ? readFileSync(deagleSilhouettePath)
  : Buffer.alloc(0);
const deagleAssetUrl = new URL(deagleSilhouetteUrl);
const silhouetteRendererSource = readFileSync(
  new URL('../tools/render-air-support-silhouettes.mjs', import.meta.url),
  'utf8'
);
check('the Desert Eagle silhouette is rasterized from the attributed real model',
  deagleAssetUrl.pathname.endsWith('/desert_eagle.png')
    && deagleAssetUrl.searchParams.get('v') === 'reference-glb-2'
    && deagleSilhouette.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
    && silhouetteRendererSource.includes("model: resolve(ROOT, 'low-poly_desert_eagle.glb')")
    && silhouetteRendererSource.includes('return [-point.x, -point.y]'));
const railgunSilhouetteUrl = silhouetteAssetUrl('railgun');
const railgunSilhouettePath = fileURLToPath(railgunSilhouetteUrl);
const railgunSilhouette = existsSync(railgunSilhouettePath)
  ? readFileSync(railgunSilhouettePath, 'utf8')
  : '';
const railgunAssetUrl = new URL(railgunSilhouetteUrl);
check('the ARC-7 uses its own large twin-rail cannon silhouette',
  railgunAssetUrl.pathname.endsWith('/railgun.svg')
    && railgunAssetUrl.searchParams.get('v') === 'buildRailgun-2'
    && railgunSilhouette.includes('data-weapon="arc-7-railgun"')
    && railgunSilhouette.includes('data-action="charged-rail-cannon"')
    && railgunSilhouette.includes('data-model-source="buildRailgun"')
    && railgunSilhouette.includes('Five narrow accelerator collars'));
const staticServerSource = readFileSync(new URL('../serve.mjs', import.meta.url), 'utf8');
const fallbackOutlineSource = readFileSync(
  new URL('../src/ui/loadout-previews.js', import.meta.url),
  'utf8'
);
const hudSource = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
check('the browser receives the ARC-7 SVG instead of falling back to old placeholder art',
  staticServerSource.includes("'.svg': 'image/svg+xml; charset=utf-8'")
    && fallbackOutlineSource.includes('Exact low-detail side projection of buildRailgun')
    && hudSource.includes('...........######....'));
check('the lethal slot exposes all three implemented grenades as live choices',
  LOADOUT_OPTIONS.grenade.length === 3
    && LOADOUT_OPTIONS.grenade.every((option) => option.live)
    && LOADOUT_OPTIONS.grenade.some((option) => option.id === 'frag')
    && LOADOUT_OPTIONS.grenade.some((option) => option.id === 'incendiary')
    && LOADOUT_OPTIONS.grenade.some((option) => option.id === 'molotov'));
check('the melee slot contains only the two implemented blades',
  LOADOUT_OPTIONS.melee.length === 2
    && LOADOUT_OPTIONS.melee.every((option) => option.live)
    && LOADOUT_OPTIONS.melee.some((option) => option.id === 'combat_knife')
    && LOADOUT_OPTIONS.melee.some((option) => option.id === 'laser_blade')
    && !LOADOUT_OPTIONS.melee.some((option) => ['karambit', 'tomahawk'].includes(option.id)));
check('the field package contains exactly ten implemented passive skills',
  LOADOUT_OPTIONS.passives.length === 10
    && LOADOUT_OPTIONS.passives.every((option) =>
      option.live && option.icon && option.description)
    && new Set(LOADOUT_OPTIONS.passives.map((option) => option.id)).size === 10);
check('the killstreak catalogue contains the eight live rewards',
  new Set(LOADOUT_OPTIONS.streaks.map((option) => option.id)).size === 8
    && LOADOUT_OPTIONS.streaks.some((option) =>
      option.id === 'firebomb' && option.kills === 7 && option.live)
    && LOADOUT_OPTIONS.streaks.some((option) =>
      option.id === 'attack_helicopter' && option.kills === 9 && option.live)
    && LOADOUT_OPTIONS.streaks.some((option) =>
      option.id === 'juggernaut' && option.kills === 8 && option.live)
    && LOADOUT_OPTIONS.streaks.some((option) =>
      option.id === 'railgun'
        && option.kills === 6
        && option.score === 600
        && option.live));

const defaults = createDefaultLoadout();
check('a deployment carries one primary and exactly three unique streaks',
  typeof defaults.primary === 'string'
    && defaults.streaks.length === 3
    && new Set(defaults.streaks).size === 3);
check('a deployment carries exactly one passive skill',
  defaults.passives.length === 1
    && defaults.passives[0] === PASSIVE_IDS.BLAST_PADDING);

const hostile = sanitizeLoadout({
  primary: 'developer_cannon',
  secondary: '<script>',
  grenade: 'nuke',
  melee: null,
  passives: ['ghost', 'ghost', 'unknown'],
  streaks: ['cas', 'cas', 'server_crash'],
});
check('invalid and duplicate client values are replaced by safe catalogue entries',
  hostile.primary === 'rifle'
    && hostile.secondary === 'machine_pistol'
    && hostile.grenade === 'frag'
    && hostile.melee === 'combat_knife'
    && hostile.passives.length === 1
    && hostile.passives[0] === PASSIVE_IDS.BLAST_PADDING
    && hostile.streaks.length === 3
    && new Set(hostile.streaks).size === 3,
  JSON.stringify(hostile));

const swapped = setLoadoutSlot(defaults, 'streaks', 0, defaults.streaks[2]);
check('selecting an occupied streak swaps slots instead of creating a duplicate',
  swapped.streaks[0] === defaults.streaks[2]
    && swapped.streaks[2] === defaults.streaks[0]
    && new Set(swapped.streaks).size === 3,
  JSON.stringify(swapped.streaks));

const withCas = setLoadoutSlot(defaults, 'streaks', 2, 'cas');
check('selected streak slots define their dynamic 5-7 hotkeys',
  loadoutHasStreak(withCas, 'cas')
    && loadoutStreakKey(withCas, 'cas') === '7'
    && loadoutStreakKey(withCas, 'sentry') === null);

const alternateEquipment = setLoadoutSlot(
  setLoadoutSlot(defaults, 'grenade', 0, 'molotov'),
  'melee',
  0,
  'laser_blade'
);
check('both new equipment choices survive shared client/server validation',
  alternateEquipment.grenade === 'molotov'
    && alternateEquipment.melee === 'laser_blade');

const withMachinePistol = setLoadoutSlot(defaults, 'secondary', 0, 'machine_pistol');
const migratedPlaceholder = sanitizeLoadout({ ...defaults, secondary: 'p9' });
check('the implemented machine pistol is the safe default and replaces legacy placeholders',
  defaults.secondary === 'machine_pistol'
    && withMachinePistol.secondary === 'machine_pistol'
    && loadoutAllowsWeapon(withMachinePistol, 'machine_pistol')
    && migratedPlaceholder.secondary === 'machine_pistol'
    && !loadoutAllowsWeapon(migratedPlaceholder, 'p9'));

const withDeagle = setLoadoutSlot(defaults, 'secondary', 0, 'desert_eagle');
check('the selected Desert Eagle survives validation and is combat-authorized',
  withDeagle.secondary === 'desert_eagle'
    && loadoutAllowsWeapon(withDeagle, 'desert_eagle')
    && !loadoutAllowsWeapon(defaults, 'desert_eagle'));

const withBlastPadding = setLoadoutSlot(defaults, 'passives', 0, PASSIVE_IDS.BLAST_PADDING);
check('Blast Padding reduces every tagged explosive hit by exactly 40%',
  loadoutHasPassive(withBlastPadding, PASSIVE_IDS.BLAST_PADDING)
    && loadoutExplosiveDamage(withBlastPadding, 100)
      === 100 * PASSIVE_TUNING.explosiveDamageMultiplier);

const withCeramic = setLoadoutSlot(defaults, 'passives', 0, PASSIVE_IDS.CERAMIC_PLATES);
check('Ceramic Plates adds exactly 15 armor to normal and Juggernaut bases',
  loadoutArmorCapacity(withCeramic, 50) === 65
    && loadoutArmorCapacity(withCeramic, 200) === 215);

const withAerobic = setLoadoutSlot(
  defaults,
  'passives',
  0,
  PASSIVE_IDS.AEROBIC_CONDITIONING
);
check('Aerobic Conditioning shortens only the configured health delay by 40%',
  Math.abs(loadoutHealthRegenDelay(withAerobic, 5.5) - 3.3) < 1e-9);

const withLightweight = setLoadoutSlot(defaults, 'passives', 0, PASSIVE_IDS.LIGHTWEIGHT);
check('Lightweight applies the requested 8% movement multiplier',
  withLightweight.passives.length === 1
    && loadoutMovementMultiplier(withLightweight) === 1.08);

const withMartyrdom = setLoadoutSlot(defaults, 'passives', 0, PASSIVE_IDS.MARTYRDOM);
check('Martyrdom is a valid exclusive passive with a 1.3-second fuse',
  withMartyrdom.passives.length === 1
    && loadoutHasPassive(withMartyrdom, PASSIVE_IDS.MARTYRDOM)
    && PASSIVE_TUNING.martyrdomFuseSeconds === 1.3);

const withReadyForAction = setLoadoutSlot(
  defaults,
  'passives',
  0,
  PASSIVE_IDS.READY_FOR_ACTION
);
const readyForActionOption = LOADOUT_OPTIONS.passives.find(
  (option) => option.id === PASSIVE_IDS.READY_FOR_ACTION
);
check('Ready for Action is a valid exclusive ten-second passive',
  withReadyForAction.passives.length === 1
    && loadoutHasPassive(withReadyForAction, PASSIVE_IDS.READY_FOR_ACTION)
    && PASSIVE_TUNING.readyForActionDurationSeconds === 10
    && PASSIVE_TUNING.readyForActionMovementMultiplier === 1.20
    && readyForActionOption?.description.includes('10 seconds')
    && !readyForActionOption?.description.includes('15 seconds'));

const withScoreSpecialist = setLoadoutSlot(
  defaults,
  'passives',
  0,
  PASSIVE_IDS.SCORE_SPECIALIST
);
check('each reward uses its requested one-life kill threshold',
  JSON.stringify(Object.fromEntries(LOADOUT_OPTIONS.streaks.map((item) => [item.id, item.kills])))
    === JSON.stringify({
      firebomb: 7,
      attack_helicopter: 9,
      uav: 3,
      railgun: 6,
      strike: 5,
      juggernaut: 8,
      sentry: 6,
      cas: 6,
    }));
check('Score Specialist lowers every reward threshold by exactly one kill',
  loadoutStreakRequirement(defaults, 'uav') === 3
    && loadoutStreakRequirement(withScoreSpecialist, 'uav') === 2
    && loadoutStreakRequirement(withScoreSpecialist, 'strike') === 4
    && loadoutStreakRequirement(withScoreSpecialist, 'sentry') === 5
    && loadoutStreakCrossings(withScoreSpecialist, 'uav', 1, 2) === 1
    && loadoutStreakCrossings(withScoreSpecialist, 'uav', 3, 4) === 0);

const withWeaponMaster = setLoadoutSlot(
  defaults,
  'passives',
  0,
  PASSIVE_IDS.WEAPON_MASTER
);
const withSecondPrimary = setLoadoutSlot(withWeaponMaster, 'secondary', 0, 'sniper');
check('Weapon Master converts slot 2 into a distinct server-authorized primary',
  withWeaponMaster.secondary === 'smg'
    && loadoutSecondaryOption(withWeaponMaster)?.id === 'smg'
    && withSecondPrimary.secondary === 'sniper'
    && loadoutAllowsWeapon(withSecondPrimary, 'sniper')
    && !loadoutAllowsWeapon(withSecondPrimary, 'machine_pistol'));

const memoryStorage = {
  value: null,
  getItem() { return this.value; },
  setItem(_key, value) { this.value = value; },
};
saveLoadout(withCas, memoryStorage);
check('the selected kit survives a local persistence round trip',
  JSON.stringify(loadSavedLoadout(memoryStorage)) === JSON.stringify(withCas));

if (failures) {
  console.error(`\n${failures} loadout check(s) failed`);
  process.exit(1);
}
console.log('\nDeployment loadout verified\n');
