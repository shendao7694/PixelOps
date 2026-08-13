import { installDomStub } from './domstub.mjs';
installDomStub();

const { buildTextures } = await import('../src/world/textures.js');
const { loadSettings } = await import('../src/core/settings.js');
const {
  PASSIVE_IDS,
  PASSIVE_TUNING,
  createDefaultLoadout,
  setLoadoutSlot,
} = await import('../src/game/loadout.js');
const {
  readyForActionActive,
  readyForActionMovementMultiplier,
  readyForActionUntil,
} = await import('../src/game/ready-for-action.js');
const { ViewModel } = await import('../src/game/viewmodel.js');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nReady for Action passive audit\n');

const defaults = createDefaultLoadout();
const loadout = setLoadoutSlot(
  defaults,
  'passives',
  0,
  PASSIVE_IDS.READY_FOR_ACTION
);
check('the passive grants exactly ten seconds after every spawn',
  PASSIVE_TUNING.readyForActionDurationSeconds === 10
    && readyForActionUntil(defaults, 10) === 0
    && readyForActionUntil(loadout, 10) === 20
    && readyForActionUntil(loadout, 5000, 1000) === 15000);
check('the buff is active only inside its authoritative spawn window',
  readyForActionActive(loadout, 20, 10)
    && readyForActionActive(loadout, 20, 19.999)
    && !readyForActionActive(loadout, 20, 20)
    && !readyForActionActive(defaults, 20, 10));
check('the active movement multiplier is exactly twenty percent',
  PASSIVE_TUNING.readyForActionMovementMultiplier === 1.20
    && readyForActionMovementMultiplier(true) === 1.20
    && readyForActionMovementMultiplier(false) === 1);

const vm = new ViewModel({
  textures: buildTextures(),
  audio: null,
  settings: loadSettings(),
  team: 'blue',
});
vm.equip('rifle', true);
let shots = 0;
vm.onShoot = () => { shots++; };
const idle = {
  trigger: false,
  aim: false,
  reload: false,
  sprinting: false,
  sliding: false,
  slideBlend: 0,
  moveSpeed: 0,
  grounded: true,
  crouch: false,
  lookDx: 0,
  lookDy: 0,
  landImpact: 0,
  dead: false,
  canAct: true,
  unlimitedAmmo: true,
};
for (let i = 0; i < 12; i++) vm.update(1 / 60, idle);
const fullMag = vm.ammoState.mag;
for (let i = 0; i < 90; i++) {
  vm.update(1 / 60, { ...idle, trigger: true });
}
check('continuous fire keeps its normal cadence without consuming ammunition',
  shots >= 8
    && vm.ammoState.mag === fullMag
    && vm.ammoState.reserve === vm.def.reserve
    && !vm.reloading,
  JSON.stringify({ shots, ammo: vm.ammoState }));

vm.update(1 / 60, idle);
vm.ammoState.mag = 5;
vm.update(1 / 60, { ...idle, reload: true });
check('manual and automatic reloads stay disabled during the buff',
  vm.ammoState.mag === 5
    && !vm.reloading
    && vm.autoReloadAt === 0);

vm.fireTimer = 0;
vm.triggerWasDown = false;
vm.update(1 / 60, {
  ...idle,
  trigger: true,
  unlimitedAmmo: false,
});
check('normal ammunition consumption resumes immediately after expiry',
  vm.ammoState.mag === 4);

if (failures) {
  console.error(`\n${failures} Ready for Action check(s) failed`);
  process.exit(1);
}
console.log('\nReady for Action passive verified\n');
