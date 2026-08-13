import { installDomStub } from './domstub.mjs';
installDomStub();

const THREE = await import('three');
const { buildTextures } = await import('../src/world/textures.js');
const { loadSettings } = await import('../src/core/settings.js');
const { applyArmorDamage } = await import('../src/game/damage.js');
const {
  LOADOUT_OPTIONS,
  createDefaultLoadout,
  loadoutAllowsWeapon,
  setLoadoutSlot,
} = await import('../src/game/loadout.js');
const {
  COMBAT_KNIFE_DAMAGE,
  COMBAT_KNIFE_DRAW_SECONDS,
  COMBAT_KNIFE_RANGE,
  combatKnifeFlipPose,
  chooseCombatKnifeTarget,
} = await import('../src/game/melee.js');
const {
  WEAPON_DEFS,
  WEAPON_ORDER,
  buildWeapon,
} = await import('../src/game/weapons.js');
const { ViewModel } = await import('../src/game/viewmodel.js');
const { CharacterRig } = await import('../src/game/character.js');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nCombat knife audit\n');

const loadout = createDefaultLoadout();
const laserLoadout = setLoadoutSlot(loadout, 'melee', 0, 'laser_blade');
check('the first melee loadout is combat ready and selectable by the authority',
  LOADOUT_OPTIONS.melee.find((item) => item.id === 'combat_knife')?.live === true
    && loadoutAllowsWeapon(loadout, loadout.primary)
    && loadoutAllowsWeapon(loadout, 'combat_knife')
    && !loadoutAllowsWeapon(loadout, 'laser_blade')
    && loadoutAllowsWeapon(laserLoadout, 'laser_blade')
    && !loadoutAllowsWeapon(loadout, 'karambit')
    && !loadoutAllowsWeapon(loadout, 'developer_blade'));

const def = WEAPON_DEFS.combat_knife;
const laserDef = WEAPON_DEFS.laser_blade;
check('the knife is a no-ammo weapon with a short fixed reach',
  WEAPON_ORDER.includes('combat_knife')
    && def.melee === true
    && def.oneHanded === true
    && def.mag === 0
    && def.reserve === 0
    && def.range === COMBAT_KNIFE_RANGE
    && def.damage === COMBAT_KNIFE_DAMAGE);
check('the laser short blade has exactly the combat knife gameplay data',
  WEAPON_ORDER.includes('laser_blade')
    && laserDef.melee === true
    && laserDef.laserBlade === true
    && laserDef.damage === def.damage
    && laserDef.rpm === def.rpm
    && laserDef.range === def.range
    && laserDef.swingTime === def.swingTime
    && laserDef.hitTime === def.hitTime
    && laserDef.moveMult === def.moveMult
    && laserDef.mag === 0
    && laserDef.reserve === 0);

const origin = new THREE.Vector3(0, 1.56, 0);
const forward = new THREE.Vector3(0, 0, -1);
const front = {
  id: 'front',
  point: new THREE.Vector3(0.34, 1.08, -2.05),
  radius: 0.43,
};
const behind = {
  id: 'behind',
  point: new THREE.Vector3(0, 1.08, 1.2),
  radius: 0.43,
};
check('the sweep acquires a close target near the reticle but never one behind',
  chooseCombatKnifeTarget(origin, forward, [behind, front])?.id === 'front'
    && chooseCombatKnifeTarget(origin, forward, [behind]) === null);
check('world cover can reject the nearest knife candidate',
  chooseCombatKnifeTarget(origin, forward, [front], () => true) === null);
check('targets outside the fixed reach are rejected',
  chooseCombatKnifeTarget(origin, forward, [{
    id: 'far',
    point: new THREE.Vector3(0, 1.08, -COMBAT_KNIFE_RANGE - 1),
    radius: 0.43,
  }]) === null);

const ordinary = { health: 100, armor: 50 };
applyArmorDamage(ordinary, COMBAT_KNIFE_DAMAGE);
const juggernaut = { health: 600, armor: 200 };
applyArmorDamage(juggernaut, COMBAT_KNIFE_DAMAGE);
check('one clean slash kills an ordinary armored soldier',
  ordinary.health <= 0 && ordinary.armor === 0,
  JSON.stringify(ordinary));
check('the same slash does not one-hit a Juggernaut',
  juggernaut.health > 0 && juggernaut.armor > 0,
  JSON.stringify(juggernaut));

const halfFlip = combatKnifeFlipPose(0.5);
const completeFlip = combatKnifeFlipPose(1);
check('the balisong draw completes full turns without changing the resting pose',
  COMBAT_KNIFE_DRAW_SECONDS >= 0.55
    && Math.abs(halfFlip.spinZ) > 2
    && Math.abs(halfFlip.handleL) > 3
    && Math.abs(completeFlip.spinY - Math.PI * 2) < 1e-8
    && Math.abs(completeFlip.spinZ - Math.PI * 2) < 1e-8
    && Math.abs(completeFlip.handleL - Math.PI * 2) < 1e-8
    && Math.abs(completeFlip.handleR + Math.PI * 2) < 1e-8);

const textures = buildTextures();
const settings = loadSettings();
const steelModel = buildWeapon('combat_knife', textures, true).group;
const laserModel = buildWeapon('laser_blade', textures, true).group;
const steelBlade = steelModel.getObjectByName('knife-blade');
const projectedBlade = laserModel.getObjectByName('laser-blade');
const projectedGlow = laserModel.getObjectByName('laser-blade-glow');
steelBlade.geometry.computeBoundingBox();
projectedBlade.geometry.computeBoundingBox();
const steelOutline = steelBlade.geometry.boundingBox.getSize(new THREE.Vector3());
const projectedOutline = projectedBlade.geometry.boundingBox.getSize(new THREE.Vector3());
laserModel.userData.updateVisual(0.25, 0.35);
const projectedEarlyTime = projectedBlade.material.uniforms.uTime.value;
const projectedEarlyLength = projectedBlade.scale.z;
laserModel.userData.updateVisual(0.75, 1);
check('the projected blade keeps the combat knife outline but replaces its steel edge',
  projectedBlade
    && projectedGlow
    && !laserModel.getObjectByName('knife-blade')
    && projectedBlade.material.isShaderMaterial
    && projectedBlade.material.transparent
    && projectedBlade.material.blending === THREE.AdditiveBlending
    && steelOutline.distanceTo(projectedOutline) < 1e-8);
check('the blue projection animates and extends outward from the handle',
  projectedEarlyTime === 0.25
    && projectedEarlyLength > 0.3
    && projectedEarlyLength < 0.4
    && projectedBlade.material.uniforms.uTime.value === 0.75
    && Math.abs(projectedBlade.scale.z - 1) < 1e-8
    && laserModel.userData.laserBlade === true);

const vm = new ViewModel({ textures, audio: null, settings, team: 'blue' });
let strikes = 0;
vm.onShoot = (weapon, spread, pellets) => {
  if (weapon.id === 'combat_knife' && spread === 0 && pellets === 1) strikes++;
};
vm.equip('combat_knife', true);
const knifeGrip = vm.armR.getObjectByName('knife-grip-fingers');
const triggerFinger = vm.armR.getObjectByName('right-trigger-finger');
const idle = {
  trigger: false,
  aim: false,
  reload: false,
  sprinting: false,
  sliding: false,
  moveSpeed: 0,
  grounded: true,
  crouch: false,
  lookDx: 0,
  lookDy: 0,
  landImpact: 0,
  dead: false,
  canAct: true,
};
for (let i = 0; i < 12; i++) vm.update(1 / 60, idle);
vm.update(1 / 60, { ...idle, trigger: true });
let movedDuringSlash = false;
for (let i = 0; i < 45; i++) {
  vm.update(1 / 60, idle);
  movedDuringSlash ||= Math.abs(vm.holder.rotation.z - def.hipRot.z) > 0.15;
}
vm.startReload();
check('the first-person knife is one-handed and performs one delayed strike',
  vm.armLHolder.visible === false
    && knifeGrip?.visible === true
    && knifeGrip.children.length >= 9
    && triggerFinger?.visible === false
    && strikes === 1
    && movedDuringSlash
    && vm.ammoState.mag === 0
    && vm.ammoState.reserve === 0
    && vm.reloading === false);
vm.update(1 / 60, { ...idle, trigger: true });
for (let i = 0; i < 20; i++) vm.update(1 / 60, idle);
check('the knife can swing repeatedly without consuming or inventing ammunition',
  strikes === 2 && vm.ammoState.mag === 0 && vm.ammoState.reserve === 0);

const laserVm = new ViewModel({ textures, audio: null, settings, team: 'blue' });
let laserStrikes = 0;
laserVm.onShoot = (weapon, spread, pellets) => {
  if (weapon.id === 'laser_blade' && spread === 0 && pellets === 1) laserStrikes++;
};
laserVm.equip('laser_blade', true);
for (let i = 0; i < 12; i++) laserVm.update(1 / 60, idle);
laserVm.update(1 / 60, { ...idle, trigger: true });
for (let i = 0; i < 20; i++) laserVm.update(1 / 60, idle);
check('the laser blade uses the same one-handed delayed melee attack',
  laserStrikes === 1
    && laserVm.def.damage === def.damage
    && laserVm.armLHolder.visible === false
    && laserVm.model.userData.updateVisual
    && laserVm.model.getObjectByName('laser-blade').material.uniforms.uTime.value > 0);

const drawVm = new ViewModel({ textures, audio: null, settings, team: 'blue' });
drawVm.equip('rifle', true);
drawVm.equip('combat_knife');
let sawKnifeFlip = false;
let sawSeparatedHandles = false;
for (let i = 0; i < 60; i++) {
  drawVm.update(1 / 60, idle);
  if (drawVm.def.id !== 'combat_knife') continue;
  sawKnifeFlip ||= drawVm.knifeFlipT > 0
    && Math.abs(drawVm.knifeSpin?.rotation.z || 0) > 0.25;
  sawSeparatedHandles ||= Math.abs(drawVm.knifeHandleLeft?.rotation.y || 0) > 0.5
    && Math.abs(drawVm.knifeHandleRight?.rotation.y || 0) > 0.2;
}
check('switching to the knife plays a visible hand-and-handle flourish before it can attack',
  sawKnifeFlip
    && sawSeparatedHandles
    && drawVm.switchT === 0
    && drawVm.knifeFlipT === 0
    && drawVm.canFire()
    && Math.abs(drawVm.knifeSpin?.rotation.z || 0) < 1e-8
    && Math.abs(drawVm.knifeHandleLeft?.rotation.y || 0) < 1e-8
    && Math.abs(drawVm.knifeHandleRight?.rotation.y || 0) < 1e-8);

const sprintVm = new ViewModel({ textures, audio: null, settings, team: 'blue' });
sprintVm.equip('combat_knife', true);
for (let i = 0; i < 90; i++) {
  sprintVm.update(1 / 60, {
    ...idle,
    sprinting: true,
    moveSpeed: 7.2,
  });
}
sprintVm.camera.updateMatrixWorld(true);
sprintVm.holder.updateMatrixWorld(true);
const sprintBladeNdc = sprintVm.model
  .getObjectByName('knife-blade')
  .getWorldPosition(new THREE.Vector3())
  .project(sprintVm.camera);
const sprintPalmNdc = sprintVm.armR
  .getObjectByName('right-palm')
  .getWorldPosition(new THREE.Vector3())
  .project(sprintVm.camera);
check('sprinting keeps the blade inside the first-person camera instead of lowering it out of view',
  sprintVm.sprintBlend > 0.99
    && sprintBladeNdc.x > -0.95
    && sprintBladeNdc.x < 0.78
    && sprintBladeNdc.y > -0.90
    && sprintBladeNdc.y < 0.86
    && sprintBladeNdc.z > -1
    && sprintBladeNdc.z < 1
    && sprintBladeNdc.x < sprintPalmNdc.x - 0.08,
  JSON.stringify({ blade: sprintBladeNdc, palm: sprintPalmNdc }));

let sprintStrikes = 0;
sprintVm.onShoot = (weapon) => {
  if (weapon.id === 'combat_knife') sprintStrikes++;
};
const fullSprintBlend = sprintVm.sprintBlend;
sprintVm.update(1 / 60, {
  ...idle,
  sprinting: true,
  moveSpeed: 7.2,
  trigger: true,
});
const sprintAttackStarted = sprintVm.meleeSwingT > 0
  && sprintVm.sprintBlend < fullSprintBlend;
for (let i = 0; i < 12; i++) {
  sprintVm.update(1 / 60, {
    ...idle,
    sprinting: true,
    moveSpeed: 7.2,
  });
}
check('the first click during a full sprint immediately starts and resolves a knife attack',
  sprintAttackStarted
    && sprintStrikes === 1
    && sprintVm.meleeSwingT > 0
    && sprintVm.sprintBlend < 0.35,
  JSON.stringify({
    sprintAttackStarted,
    sprintStrikes,
    meleeSwingT: sprintVm.meleeSwingT,
    sprintBlend: sprintVm.sprintBlend,
  }));

const rig = new CharacterRig(textures, { team: 'red' });
const built = buildWeapon('combat_knife', textures, false);
rig.attachWeapon(
  built.group,
  built.anchors.foregrip,
  built.anchors.muzzle,
  built.anchors.grip
);
rig.fireKick();
rig.update(1 / 30, {
  position: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  speed: 0,
  moveX: 0,
  moveZ: 0,
  crouch: false,
  sliding: false,
  aiming: false,
  grounded: true,
  firing: false,
  sprinting: false,
});
check('third person carries and animates the blade in the right hand only',
  rig.meleeWeapon === true
    && rig.foregrip === null
    && rig.weapon.parent === rig.armR.hand
    && rig.knifeSpin
    && rig.knifeHandleLeft
    && rig.knifeHandleRight
    && rig.knifeGripVisual?.visible === true
    && rig.meleeSwingT > 0
    && [rig.armR.upper.quaternion.x, rig.armR.upper.quaternion.y,
      rig.armR.upper.quaternion.z, rig.armR.upper.quaternion.w]
      .every(Number.isFinite));

const laserRig = new CharacterRig(textures, { team: 'blue' });
const builtLaser = buildWeapon('laser_blade', textures, false);
laserRig.attachWeapon(
  builtLaser.group,
  builtLaser.anchors.foregrip,
  builtLaser.anchors.muzzle,
  builtLaser.anchors.grip
);
laserRig.update(1 / 30, {
  position: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  speed: 0,
  moveX: 0,
  moveZ: 0,
  crouch: false,
  sliding: false,
  aiming: false,
  grounded: true,
  firing: false,
  sprinting: false,
});
check('third person recognises and animates the projected blade as melee',
  laserRig.meleeWeapon === true
    && laserRig.foregrip === null
    && laserRig.weapon.parent === laserRig.armR.hand
    && laserRig.weapon.getObjectByName('laser-blade')
    && laserRig.weapon.getObjectByName('laser-blade').material.uniforms.uTime.value > 0);

if (failures) {
  console.error(`\n${failures} combat knife check(s) failed`);
  process.exit(1);
}
console.log('\nCombat knife verified\n');
