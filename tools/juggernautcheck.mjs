import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomStub } from './domstub.mjs';

installDomStub();

const THREE = await import('three');
const { buildTextures } = await import('../src/world/textures.js');
const { CharacterRig } = await import('../src/game/character.js');
const { ViewModel } = await import('../src/game/viewmodel.js');
const { buildWeapon, WEAPON_DEFS, WEAPON_ORDER } = await import('../src/game/weapons.js');
const { characterHitboxesForState } = await import('../src/game/stance-hitboxes.js');
const { LOADOUT_OPTIONS } = await import('../src/game/loadout.js');
const {
  JUGGERNAUT_STREAK_KILLS,
  JUGGERNAUT_MAX_HEALTH,
  JUGGERNAUT_MAX_ARMOR,
  JUGGERNAUT_SPRINT_BONUS_SCALE,
  JUGGERNAUT_SPRINT_BOB_RATE_SCALE,
  JUGGERNAUT_INTERACT_SECONDS,
  JUGGERNAUT_CRATE_LIFETIME_SECONDS,
  AIRDROP_RELEASE_SECONDS,
  AIRDROP_IMPACT_SECONDS,
  characterHitIsHeadshot,
  characterHitMultiplier,
  createJuggernautAirdrop,
  juggernautCanUseKillstreak,
  shouldPlayJuggernautBreathing,
  airdropHelicopterPose,
  airdropCratePose,
  airdropClaimable,
  airdropClaimableBy,
  withinAirdropInteraction,
} = await import('../src/game/juggernaut.js');
const { Player, sprintMoveTargetSpeed } = await import('../src/game/player.js');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

console.log('\nJuggernaut reward audit\n');

const reward = LOADOUT_OPTIONS.streaks.find((option) => option.id === 'juggernaut');
check('the selectable reward unlocks at exactly eight kills',
  reward?.live === true
    && reward.kills === JUGGERNAUT_STREAK_KILLS
    && JUGGERNAUT_STREAK_KILLS === 8);
check('the transformed combat profile totals 800 durability as 600 HP and 200 armor',
  JUGGERNAUT_MAX_HEALTH === 600 && JUGGERNAUT_MAX_ARMOR === 200);
check('the heavy helmet converts head hits to ordinary non-headshot damage',
  !characterHitIsHeadshot({ juggernaut: true }, 'head')
    && characterHitMultiplier({ juggernaut: true }, 'head', 2.2) === 1
    && characterHitIsHeadshot({ juggernaut: false }, 'head')
    && characterHitMultiplier({ juggernaut: false }, 'head', 2.2) === 2.2);
check('the heavy suit cannot activate killstreak rewards',
  !juggernautCanUseKillstreak({ juggernaut: true })
    && juggernautCanUseKillstreak({ juggernaut: false }));
check('respirator audio is gated to a living Juggernaut in live gameplay',
  shouldPlayJuggernautBreathing({
    mode: 'playing',
    alive: true,
    juggernaut: true,
  })
    && !shouldPlayJuggernautBreathing({
      mode: 'paused',
      alive: true,
      juggernaut: true,
    })
    && !shouldPlayJuggernautBreathing({
      mode: 'title',
      alive: true,
      juggernaut: true,
    })
    && !shouldPlayJuggernautBreathing({
      mode: 'playing',
      alive: false,
      juggernaut: true,
    }));
const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const pvpServerSource = fs.readFileSync(
  new URL('../server/pvp-server.mjs', import.meta.url),
  'utf8'
);
check('both client controls and PVP authority enforce the killstreak lockout',
  /streakSlotAvailable[\s\S]{0,220}!juggernautCanUseKillstreak\(this\.player\)/.test(mainSource)
    && /activateStreakSlot[\s\S]{0,220}!juggernautCanUseKillstreak\(this\.player\)/.test(mainSource)
    && /function handleAbility[\s\S]{0,180}!juggernautCanUseKillstreak\(player\)/.test(pvpServerSource));
check('the main loop applies the respirator lifecycle gate on every mode transition',
  /syncJuggernautBreathing\(\)[\s\S]{0,260}shouldPlayJuggernautBreathing/.test(mainSource)
    && /this\.syncJuggernautBreathing\(\);[\s\S]{0,100}this\.mode !== 'playing'/.test(mainSource));
const standingSpeed = 4.75;
const normalSprintSpeed = sprintMoveTargetSpeed(false, 1);
const juggernautWalkSpeed = standingSpeed * WEAPON_DEFS.minigun.moveMult;
const juggernautSprintSpeed = sprintMoveTargetSpeed(
  true,
  WEAPON_DEFS.minigun.moveMult
);
check('Juggernaut Shift-sprint receives exactly thirty percent of the normal bonus',
  JUGGERNAUT_SPRINT_BONUS_SCALE === 0.3
    && Math.abs(
      (juggernautSprintSpeed - juggernautWalkSpeed)
        / (normalSprintSpeed - standingSpeed)
      - 0.3
    ) < 1e-9,
  `normal ${normalSprintSpeed}, Juggernaut walk ${juggernautWalkSpeed}, sprint ${juggernautSprintSpeed}`);
check('the heavy sprint camera and M134 cadence run at a slower shared rate',
  JUGGERNAUT_SPRINT_BOB_RATE_SCALE === 0.6);
check('the crate uses a half-second stationary hold and expires after two minutes',
  JUGGERNAUT_INTERACT_SECONDS === 0.5
    && JUGGERNAUT_CRATE_LIFETIME_SECONDS === 120);

const drop = createJuggernautAirdrop({
  id: 'audit-drop',
  ownerId: 'caller',
  team: 'red',
  target: [12.5, 0.25, -8.75],
  yaw: Math.PI / 3,
  startedAt: 1000,
});
const atRelease = airdropHelicopterPose(drop, AIRDROP_RELEASE_SECONDS);
const falling = airdropCratePose(
  drop,
  AIRDROP_RELEASE_SECONDS + (AIRDROP_IMPACT_SECONDS - AIRDROP_RELEASE_SECONDS) * 0.5
);
const landed = airdropCratePose(drop, AIRDROP_IMPACT_SECONDS);
check('the helicopter crosses the exact call point at release',
  Math.abs(atRelease.x - drop.target[0]) < 1e-6
    && Math.abs(atRelease.z - drop.target[2]) < 1e-6);
check('the unassisted crate accelerates directly down to the exact call point',
  falling.visible && !falling.landed
    && falling.y > drop.target[1]
    && landed.landed
    && landed.x === drop.target[0]
    && landed.y === drop.target[1]
    && landed.z === drop.target[2]);
check('claim timing and proximity are deterministic for every player',
  !airdropClaimable(drop, 1000 + AIRDROP_IMPACT_SECONDS * 1000 - 1)
    && airdropClaimable(drop, 1000 + AIRDROP_IMPACT_SECONDS * 1000)
    && withinAirdropInteraction(drop, new THREE.Vector3(14.5, 0.25, -8.75))
    && !withinAirdropInteraction(drop, new THREE.Vector3(16, 0.25, -8.75)));
check('an opposing player can contest and claim the caller team crate',
  airdropClaimableBy(drop, {
    alive: true,
    juggernaut: false,
    team: 'blue',
    id: 'opponent',
    position: new THREE.Vector3(12.5, 0.25, -8.75),
  }, 1000 + AIRDROP_IMPACT_SECONDS * 1000));

const textures = buildTextures();
const minigun = WEAPON_DEFS.minigun;
check('the M134 uses the requested authoritative combat balance',
  WEAPON_ORDER.includes('minigun')
    && minigun.mag === 1200
    && minigun.reserve === 0
    && minigun.rpm === 1080
    && minigun.damage === 18
    && minigun.moveMult === 0.62
    && minigun.spinUpTime === 0.5
    && minigun.noReload === true);
check('the first-person M134 stays on its low twin-handle carry',
  minigun.lowCarry === true
    && minigun.hipPos.y <= -0.39
    && minigun.adsPos?.y <= -0.33
    && minigun.adsPos?.x > 0);
const sprintView = new ViewModel({
  textures,
  audio: null,
  settings: { viewBob: 1 },
});
sprintView.equip('minigun', true);
for (let frame = 0; frame < 90; frame++) {
  sprintView.update(1 / 60, {
    trigger: false,
    aim: false,
    reload: false,
    sprinting: true,
    sliding: false,
    slideBlend: 0,
    moveSpeed: 3.55,
    grounded: true,
    crouch: false,
    lookDx: 0,
    lookDy: 0,
    landImpact: 0,
    dead: false,
    canAct: true,
  });
}
check('first-person sprint keeps the M134 low instead of using a rifle high-port pose',
  sprintView.sprintBlend > 0.95
    && sprintView.holder.position.x > 0.24
    && sprintView.holder.position.y < -0.39
    && sprintView.holder.position.z < -0.55,
  `pose ${sprintView.holder.position.toArray().map((value) => value.toFixed(3)).join(', ')}`);

const warmupView = new ViewModel({
  textures,
  audio: null,
  settings: { viewBob: 1 },
});
let warmupShots = 0;
warmupView.onShoot = () => { warmupShots++; };
warmupView.equip('minigun', true);
const warmupContext = {
  trigger: true,
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
};
for (let frame = 0; frame < 28; frame++) warmupView.update(1 / 60, warmupContext);
const preWarmMag = warmupView.ammoState.mag;
check('holding the M134 trigger for less than half a second fires no round',
  warmupShots === 0 && preWarmMag === 1200);
for (let frame = 0; frame < 5; frame++) warmupView.update(1 / 60, warmupContext);
check('the M134 starts firing only after its continuous half-second warm-up',
  warmupShots > 0
    && warmupView.ammoState.mag < preWarmMag
    && warmupView.barrelSpinSpeed > 0);
warmupView.update(1 / 60, { ...warmupContext, trigger: false });
check('releasing the trigger clears M134 warm-up progress immediately',
  warmupView.spinUpT === 0);
warmupView.ammoState.mag = 1100;
warmupView.ammoState.reserve = 100;
warmupView.startReload();
check('the belt-fed 1200-round M134 cannot enter a reload animation',
  !warmupView.reloading);

const heavyPlayer = new Player({
  camera: new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 600),
  level: { colliders: [], bounds: { x: 100, z: 100 } },
  settings: { fov: 80, sensitivity: 1, viewBob: 1 },
  audio: null,
});
heavyPlayer.juggernaut = true;
heavyPlayer.maxHealth = JUGGERNAUT_MAX_HEALTH;
heavyPlayer.maxArmor = JUGGERNAUT_MAX_ARMOR;
heavyPlayer.health = 400;
heavyPlayer.armor = 100;
heavyPlayer.grounded = true;
heavyPlayer.sprinting = true;
heavyPlayer.speed2D = 7;
heavyPlayer.lastHitTime = -100;
check('Juggernaut movement rejects a slide even at sprint speed',
  !heavyPlayer.canSlide());
heavyPlayer.update(1 / 60, {
  move: { x: 0, z: 0 },
  jump: false,
  crouch: false,
  slide: false,
  sprint: false,
  aim: false,
  aimBlend: 0,
  speedMult: minigun.moveMult,
});
check('Juggernaut health stays damaged while armor is still allowed to regenerate',
  heavyPlayer.health === 400 && heavyPlayer.armor > 100,
  `${heavyPlayer.health}/${heavyPlayer.armor}`);

const barrelAudit = buildWeapon('minigun', textures, true);
const barrelCluster = barrelAudit.group.getObjectByName('minigun-barrels');
check('the M134 barrel cage uses smooth collars with no spike geometry',
  barrelCluster?.children.length > 0
    && barrelCluster.children.every((part) => part.geometry?.type === 'CylinderGeometry')
    && barrelCluster.children.filter((part) => part.name === 'minigun-retaining-collar').length === 3);
barrelAudit.group.traverse((object) => object.geometry?.dispose());
for (const team of ['blue', 'red']) {
  const rig = new CharacterRig(textures, { team, juggernaut: true });
  const built = buildWeapon('minigun', textures, false);
  rig.attachWeapon(
    built.group,
    built.anchors.foregrip,
    built.anchors.muzzle,
    built.anchors.grip
  );
  const expectedLamp = team === 'blue' ? 0x54b4ff : 0xff4a3c;
  check(`${team} Juggernaut exposes layered armor, team lamps and rotating barrels`,
    rig.juggernautParts.length >= 35
      && rig.juggernautParts.every((part) => part.visible)
      && rig.materials.jugLight.color.getHex() === expectedLamp
      && rig.weaponBarrels?.name === 'minigun-barrels');
  rig.dispose();
}

const normalRig = new CharacterRig(textures, { team: 'blue' });
const heavyRig = new CharacterRig(textures, { team: 'blue', juggernaut: true });
for (const rig of [normalRig, heavyRig]) {
  const built = buildWeapon('minigun', textures, false);
  rig.attachWeapon(
    built.group,
    built.anchors.foregrip,
    built.anchors.muzzle,
    built.anchors.grip
  );
  rig.phase = 0.47;
  rig.idleT = 1.25;
}
const sharedPose = {
  position: new THREE.Vector3(2, 0, -4),
  yaw: 0.72,
  pitch: -0.18,
  speed: 3.8,
  moveX: 0.35,
  moveZ: -0.82,
  crouch: false,
  sliding: false,
  aiming: true,
  grounded: true,
  firing: true,
  sprinting: false,
  invulnerable: false,
};
for (let frame = 0; frame < 90; frame++) {
  normalRig.update(1 / 60, sharedPose);
  heavyRig.update(1 / 60, sharedPose);
}
heavyRig.root.updateMatrixWorld(true);
const heavyRightHand = heavyRig.armR.hand.getWorldPosition(new THREE.Vector3());
const heavyLeftHand = heavyRig.armL.hand.getWorldPosition(new THREE.Vector3());
const heavyRightGrip = heavyRig.weaponGrip.getWorldPosition(new THREE.Vector3());
const heavyLeftGrip = heavyRig.foregrip.getWorldPosition(new THREE.Vector3());
const heavyWeaponOrigin = heavyRig.weapon.getWorldPosition(new THREE.Vector3());
const heavyWeaponLocal = heavyRig.root.worldToLocal(heavyWeaponOrigin.clone());
check('the third-person M134 rides at the waist with both hands on its handles',
  heavyWeaponOrigin.y >= 0.55
    && heavyWeaponOrigin.y <= 1.10
    && heavyWeaponLocal.x >= 0.10
    && heavyRightHand.distanceTo(heavyRightGrip) < 0.12
    && heavyLeftHand.distanceTo(heavyLeftGrip) < 0.035,
  `height ${heavyWeaponOrigin.y.toFixed(3)}, local x ${heavyWeaponLocal.x.toFixed(3)}, right ${heavyRightHand.distanceTo(heavyRightGrip).toFixed(3)}, left ${heavyLeftHand.distanceTo(heavyLeftGrip).toFixed(3)}`);
const animatedNodes = (rig) => [
  ...Object.values(rig.bones),
  rig.armR.shoulder, rig.armR.upper, rig.armR.elbow, rig.armR.hand,
  rig.armL.shoulder, rig.armL.upper, rig.armL.elbow, rig.armL.hand,
  rig.legR.hip, rig.legR.thigh, rig.legR.knee, rig.legR.ankle,
  rig.legL.hip, rig.legL.thigh, rig.legL.knee, rig.legL.ankle,
];
const normalNodes = animatedNodes(normalRig);
const heavyNodes = animatedNodes(heavyRig);
const poseDeltas = normalNodes.map((node, index) => ({
  index,
  position: node.position.distanceTo(heavyNodes[index].position),
  rotation: node.quaternion.angleTo(heavyNodes[index].quaternion),
}));
const largestPoseDelta = poseDeltas.reduce((largest, delta) =>
  Math.max(delta.position, delta.rotation) > Math.max(largest.position, largest.rotation)
    ? delta
    : largest);
// The suit reuses the soldier skeleton and hit volumes, but the heavy gait,
// crouch and aim poses are allowed to diverge within tight limits.
check('the thicker bomb suit reuses the soldier skeleton with bounded heavy pose deltas',
  poseDeltas.every((delta) => delta.position < 0.15 && delta.rotation < 1.2),
  `node ${largestPoseDelta.index}: position ${largestPoseDelta.position}, rotation ${largestPoseDelta.rotation}`);
normalRig.dispose();
heavyRig.dispose();

const normalBoxes = characterHitboxesForState({
  position: new THREE.Vector3(),
  yaw: 0,
});
const heavyBoxes = characterHitboxesForState({
  position: new THREE.Vector3(),
  yaw: 0,
  juggernaut: true,
});
check('the authoritative hit volumes expand with the visible bomb suit',
  heavyBoxes.every((box, index) =>
    box.half[0] > normalBoxes[index].half[0]
      && box.half[1] > normalBoxes[index].half[1]
      && box.half[2] > normalBoxes[index].half[2]));

const here = path.dirname(fileURLToPath(import.meta.url));
const modelPath = path.resolve(here, '..', 'animated_aw101_helicopter.glb');
const licensePath = path.resolve(here, '..', 'AW101-MODEL-LICENSE.md');
check('the animated AW101 asset and its attribution ship with the game',
  fs.statSync(modelPath).size > 1000 && fs.readFileSync(licensePath, 'utf8').includes('CC BY 4.0'));

console.log(failures
  ? `\n${failures} Juggernaut problem(s)\n`
  : '\nJuggernaut reward verified\n');
process.exit(failures ? 1 : 0);
