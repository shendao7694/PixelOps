import * as THREE from 'three';
import { applyArmorDamage } from '../src/game/damage.js';
import {
  GRENADES_PER_LIFE,
  GRENADE_BLAST_RADIUS,
  GRENADE_COVER_START,
  GRENADE_FUSE_SECONDS,
  GRENADE_MAX_DAMAGE,
  GRENADE_PHYSICS_STEP,
  GRENADE_RADIUS,
  GRENADE_STANDARD_DURABILITY,
  GrenadeTrajectory,
  GrenadeView,
  advanceGrenade,
  buildGrenadeModel,
  grenadeBlastOccluded,
  grenadeCreatesFire,
  grenadeDamage,
  grenadeDetonationAudioCue,
  grenadeDetonatesOnImpact,
  grenadeInputAction,
  grenadeKind,
  grenadeRestSyncNeeded,
  grenadeThrowVelocity,
} from '../src/game/grenade.js';
import {
  INCENDIARY_DURATION_SECONDS,
  INCENDIARY_RADIUS,
  INCENDIARY_TICK_DAMAGE,
  INCENDIARY_TICK_SECONDS,
  MOLOTOV_DURATION_SECONDS,
  MOLOTOV_RADIUS,
  MOLOTOV_TICK_DAMAGE,
  buildIncendiaryFieldModel,
  conformIncendiaryFieldToGround,
  incendiaryDamage,
  incendiaryOccluded,
  incendiaryRadius,
  updateIncendiaryFieldModel,
} from '../src/game/incendiary.js';
import {
  buildServerLevel,
  rayAabb,
  rayGrenadeWorld,
} from '../server/world.mjs';
import { expandPart } from '../src/world/parts.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nGrenade mechanics audit\n');

check('each life starts with exactly two grenades', GRENADES_PER_LIFE === 2);
check('the fuse is exactly five seconds', GRENADE_FUSE_SECONDS === 5);
check('blast damage peaks at exactly 300',
  grenadeDamage(0) === GRENADE_MAX_DAMAGE && GRENADE_MAX_DAMAGE === 300);
check('blast radius is increased by 20% from fourteen to 16.8 metres',
  GRENADE_BLAST_RADIUS === 16.8);
const innerBlastTarget = { health: 100, armor: 50 };
const firstOuterBandTarget = { health: 100, armor: 50 };
applyArmorDamage(innerBlastTarget, grenadeDamage(GRENADE_BLAST_RADIUS * 0.3));
applyArmorDamage(
  firstOuterBandTarget,
  grenadeDamage(GRENADE_BLAST_RADIUS * 0.3001)
);
check('only the inner thirty percent is lethal to a full standard soldier',
  GRENADE_STANDARD_DURABILITY === 150
    && grenadeDamage(GRENADE_BLAST_RADIUS * 0.3) === GRENADE_MAX_DAMAGE
    && grenadeDamage(GRENADE_BLAST_RADIUS * 0.3001)
      === GRENADE_STANDARD_DURABILITY * 0.6
    && innerBlastTarget.health <= 0
    && firstOuterBandTarget.health > 0);
check('blast uses the requested 60% / 40% / 20% outer bands',
  grenadeDamage(GRENADE_BLAST_RADIUS * 0.5)
      === GRENADE_STANDARD_DURABILITY * 0.6
    && grenadeDamage(GRENADE_BLAST_RADIUS * 0.5001)
      === GRENADE_STANDARD_DURABILITY * 0.4
    && grenadeDamage(GRENADE_BLAST_RADIUS * 0.8)
      === GRENADE_STANDARD_DURABILITY * 0.4
    && grenadeDamage(GRENADE_BLAST_RADIUS * 0.8001)
      === GRENADE_STANDARD_DURABILITY * 0.2
    && grenadeDamage(GRENADE_BLAST_RADIUS)
      === GRENADE_STANDARD_DURABILITY * 0.2
    && grenadeDamage(GRENADE_BLAST_RADIUS + 1) === 0);
check('incendiary and Molotov use their independently reduced fire footprints',
  INCENDIARY_RADIUS === 7.5 * 0.85
    && MOLOTOV_RADIUS === 7.5 * 0.80
    && incendiaryRadius('incendiary') === INCENDIARY_RADIUS
    && incendiaryRadius('molotov') === MOLOTOV_RADIUS
    && INCENDIARY_DURATION_SECONDS === 10.5
    && MOLOTOV_DURATION_SECONDS === 8.75
    && INCENDIARY_TICK_SECONDS === 0.5);
check('incendiary damage is exactly ten percent higher than Molotov damage',
  MOLOTOV_TICK_DAMAGE === 24
    && INCENDIARY_TICK_DAMAGE === MOLOTOV_TICK_DAMAGE * 1.10
    && incendiaryDamage(0) === INCENDIARY_TICK_DAMAGE
    && incendiaryDamage(0, 'molotov') === MOLOTOV_TICK_DAMAGE
    && incendiaryDamage(INCENDIARY_RADIUS * 0.55) === INCENDIARY_TICK_DAMAGE
    && incendiaryDamage(INCENDIARY_RADIUS) >= INCENDIARY_TICK_DAMAGE * 0.65
    && incendiaryDamage(INCENDIARY_RADIUS + 0.01) === 0
    && incendiaryDamage(MOLOTOV_RADIUS, 'molotov') >= MOLOTOV_TICK_DAMAGE * 0.65
    && incendiaryDamage(MOLOTOV_RADIUS + 0.01, 'molotov') === 0);
check('persistent fire is stopped by cover at every distance',
  incendiaryOccluded(
    new THREE.Vector3(),
    new THREE.Vector3(0.5, 0.8, 0),
    () => ({ distance: 0.2 })
  )
    && !incendiaryOccluded(
      new THREE.Vector3(),
      new THREE.Vector3(0.5, 0.8, 0),
      () => null
    ));
check('cover blocks damage from exactly the outer half of the blast',
  GRENADE_COVER_START === 0.5
    && grenadeDamage(GRENADE_BLAST_RADIUS * 0.4999, true)
      === GRENADE_STANDARD_DURABILITY * 0.6
    && grenadeDamage(GRENADE_BLAST_RADIUS * 0.5, true) === 0
    && grenadeDamage(GRENADE_BLAST_RADIUS * 0.9, true) === 0);
let coverCast = null;
const blockedByWorld = grenadeBlastOccluded(
  new THREE.Vector3(0, 0.2, 0),
  new THREE.Vector3(GRENADE_BLAST_RADIUS * 0.75, 1.1, 0),
  (origin, direction, distance) => {
    coverCast = { origin, direction, distance };
    return { distance: 2, normal: new THREE.Vector3(-1, 0, 0) };
  }
);
let nearCastRan = false;
const protectedInnerBlast = grenadeBlastOccluded(
  new THREE.Vector3(),
  new THREE.Vector3(GRENADE_BLAST_RADIUS * 0.49, 0, 0),
  () => {
    nearCastRan = true;
    return { distance: 1 };
  }
);
check('cover test casts only through the eligible outer half',
  blockedByWorld && coverCast?.distance > 0 && !protectedInnerBlast && !nearCastRan);

const velocity = grenadeThrowVelocity(
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(4, 0, 0)
);
check('throw velocity inherits some player momentum and has an upward arc',
  velocity.x > 0 && velocity.y > 0 && velocity.z < -10,
  JSON.stringify(velocity.toArray()));

check('right mouse only previews and releasing it performs no action',
  grenadeInputAction({
    selected: true,
    pinned: false,
    leftPressed: false,
    leftReleased: false,
    rightDown: true,
  }) === 'none'
    && grenadeInputAction({
      selected: true,
      pinned: false,
      leftPressed: false,
      leftReleased: false,
      rightDown: false,
    }) === 'none');
check('left mouse directly throws unless right mouse is held to pull the pin',
  grenadeInputAction({
    selected: true,
    pinned: false,
    leftPressed: true,
    leftReleased: false,
    rightDown: false,
  }) === 'throw-direct'
    && grenadeInputAction({
      selected: true,
      pinned: false,
      leftPressed: true,
      leftReleased: false,
      rightDown: true,
    }) === 'pull-pin');
check('the Molotov quick-throws normally but RMB aim requires hold-and-release LMB',
  grenadeInputAction({
    selected: true,
    pinned: false,
    leftPressed: true,
    leftDown: true,
    leftReleased: false,
    rightDown: false,
    impactFused: true,
  }) === 'throw-direct'
    && grenadeInputAction({
      selected: true,
      pinned: false,
      leftPressed: true,
      leftDown: true,
      leftReleased: false,
      rightDown: true,
      impactFused: true,
    }) === 'hold-impact'
    && grenadeInputAction({
      selected: true,
      pinned: false,
      leftPressed: false,
      leftDown: true,
      leftReleased: false,
      rightDown: true,
      impactFused: true,
      impactHeld: true,
    }) === 'none'
    && grenadeInputAction({
      selected: true,
      pinned: false,
      leftPressed: false,
      leftDown: false,
      leftReleased: true,
      rightDown: true,
      impactFused: true,
      impactHeld: true,
    }) === 'throw-direct'
    && grenadeDetonatesOnImpact('molotov')
    && grenadeCreatesFire('molotov')
    && grenadeCreatesFire('incendiary')
    && !grenadeDetonatesOnImpact('incendiary'));
check('each throwable routes to its own detonation sound',
  grenadeDetonationAudioCue('frag') === 'fragGrenade'
    && grenadeDetonationAudioCue('incendiary') === 'incendiaryIgnite'
    && grenadeDetonationAudioCue('molotov') === 'molotovBreak'
    && grenadeDetonationAudioCue('invalid') === 'fragGrenade');
check('a cooked grenade throws only when left mouse is released',
  grenadeInputAction({
    selected: true,
    pinned: true,
    leftPressed: false,
    leftReleased: false,
    rightDown: true,
  }) === 'none'
    && grenadeInputAction({
      selected: true,
      pinned: true,
      leftPressed: false,
      leftReleased: true,
      rightDown: true,
    }) === 'throw-cooked');

function floatingParts(model, epsilon = 0.008) {
  model.updateMatrixWorld(true);
  const boxes = [];
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.computeBoundingBox();
    boxes.push(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  let floating = 0;
  for (let i = 0; i < boxes.length; i++) {
    const expanded = boxes[i].clone().expandByScalar(epsilon);
    if (!boxes.some((box, index) => index !== i && expanded.intersectsBox(box))) floating++;
  }
  return { parts: boxes.length, floating };
}

const worldModel = floatingParts(buildGrenadeModel(false));
const viewModel = floatingParts(buildGrenadeModel(true));
const incendiaryWorld = buildGrenadeModel(false, { kind: 'incendiary' });
const incendiaryView = buildGrenadeModel(true, { kind: 'incendiary' });
const molotovWorld = buildGrenadeModel(false, { kind: 'molotov' });
const molotovView = buildGrenadeModel(true, { kind: 'molotov' });
const incendiaryWorldAudit = floatingParts(incendiaryWorld);
const incendiaryViewAudit = floatingParts(incendiaryView);
const molotovWorldAudit = floatingParts(molotovWorld);
const molotovViewAudit = floatingParts(molotovView);
check('world and first-person grenade models have no floating components',
  worldModel.floating === 0 && viewModel.floating === 0,
  JSON.stringify({ worldModel, viewModel }));
const incendiaryCanister = incendiaryWorld.getObjectByName('incendiary-canister');
const incendiaryBand = incendiaryWorld.getObjectByName('incendiary-band');
check('the incendiary is a connected dark-grey cylindrical canister with one red band',
  incendiaryWorld.userData.kind === 'incendiary'
    && incendiaryView.userData.kind === 'incendiary'
    && grenadeKind('invalid') === 'frag'
    && incendiaryCanister?.geometry?.parameters?.height
      > incendiaryCanister?.geometry?.parameters?.radiusTop * 3.3
    && incendiaryCanister?.material?.color?.getHex() === 0x343a3d
    && incendiaryWorld.getObjectsByProperty('name', 'incendiary-band').length === 1
    && incendiaryBand?.material?.color?.getHex() === 0xc52d32
    && incendiaryWorldAudit.floating === 0
    && incendiaryViewAudit.floating === 0,
  JSON.stringify({ incendiaryWorldAudit, incendiaryViewAudit }));
check('the Molotov has a connected bottle, fuel, cloth wick and live flame',
  grenadeKind('molotov') === 'molotov'
    && molotovWorld.userData.kind === 'molotov'
    && molotovView.userData.kind === 'molotov'
    && molotovWorld.getObjectByName('molotov-bottle')
    && molotovWorld.getObjectByName('molotov-fuel')
    && molotovWorld.getObjectByName('molotov-wick')
    && molotovWorld.getObjectByName('molotov-wick-flame')
    && molotovWorldAudit.floating === 0
    && molotovViewAudit.floating === 0,
  JSON.stringify({ molotovWorldAudit, molotovViewAudit }));

const animationScene = new THREE.Scene();
const grenadeView = new GrenadeView(animationScene);
const originalGrenadeGroup = grenadeView.group;
grenadeView.setKind('incendiary');
check('the first-person view can swap lethal models without changing its pose rig',
  grenadeView.kind === 'incendiary'
    && grenadeView.group !== originalGrenadeGroup
    && grenadeView.group.scale.x === 0.58
    && grenadeView.group.getObjectByName('grenade-throw-hand')
    && grenadeView.group.userData.kind === 'incendiary');
const fireField = buildIncendiaryFieldModel();
const molotovField = buildIncendiaryFieldModel({ radius: MOLOTOV_RADIUS });
const flamePositions = fireField.userData.flamePoints.geometry.attributes.position;
const flameStrengths = fireField.userData.flamePoints.geometry.attributes.aStrength;
const maxFlameRadius = Math.max(...fireField.userData.flameAnchors.map((anchor) =>
  Math.hypot(anchor.x, anchor.z)));
const terrainHeight = (x, z) => x * 0.018 + z * 0.011;
const groundCoverage = conformIncendiaryFieldToGround(fireField, (x, z) => ({
  y: terrainHeight(x, z),
  normal: new THREE.Vector3(-0.018, 1, -0.011).normalize(),
}));
const everyFlameGrounded = fireField.userData.flameAnchors.every((anchor) =>
  anchor.indices.every((index) =>
    Math.abs(
      flamePositions.array[index * 3 + 1]
        - (terrainHeight(anchor.x, anchor.z) + 0.04)
    ) < 1e-6));
const smokeBefore = fireField.userData.smokeWisps[0].position.y;
updateIncendiaryFieldModel(fireField, 0.42, 1);
const smokeAfter = fireField.userData.smokeWisps[0].position.y;
updateIncendiaryFieldModel(fireField, 1.12, 0.25);
check('the persistent fire field uses dense animated shader flames over the full radius',
  fireField.userData.flamePoints.isPoints
    && fireField.userData.flameAnchors.length >= 270
    && flameStrengths.count >= 1350
    && fireField.userData.flameMaterial.isShaderMaterial
    && maxFlameRadius >= INCENDIARY_RADIUS * 0.97
    && fireField.userData.visualRadius >= INCENDIARY_RADIUS
    && fireField.userData.damageRadius === INCENDIARY_RADIUS
    && molotovField.userData.damageRadius === MOLOTOV_RADIUS
    && molotovField.userData.visualRadius < fireField.userData.visualRadius
    && fireField.userData.groundPatches.length >= 40
    && fireField.userData.smokeWisps.length >= 20
    && fireField.userData.ownedTextures.length === 2
    && groundCoverage === 1
    && everyFlameGrounded
    && flameStrengths.array.every((value) => value > 0)
    && fireField.userData.flameMaterial.uniforms.uTime.value === 1.12
    && fireField.userData.flameMaterial.uniforms.uFade.value === 0.25
    && smokeAfter !== smokeBefore
    && fireField.userData.light.intensity > 0);
const partialCoverage = conformIncendiaryFieldToGround(
  fireField,
  (x) => x <= 0 ? { y: 0, normal: new THREE.Vector3(0, 1, 0) } : null
);
check('fire samples without supporting ground are disabled instead of floating',
  partialCoverage > 0.4
    && partialCoverage < 0.6
    && fireField.userData.flameAnchors.every((anchor) =>
      anchor.indices.every((index) =>
        anchor.x <= 0
          ? flameStrengths.array[index] > 0
          : flameStrengths.array[index] === 0
            && flamePositions.array[index * 3 + 1] === -1000)));
grenadeView.setSelected(true);
grenadeView.setPinned(true);
grenadeView.update(0.34, {
  selected: true,
  aiming: true,
  pinned: true,
  sprinting: false,
  dead: false,
});
check('pulling the pin visibly detaches it with the assisting hand',
  grenadeView.pinAssembly.visible
    && grenadeView.pinAssembly.position.length() > 0.01
    && grenadeView.leftPullHand.visible);
grenadeView.update(0.4, {
  selected: true,
  aiming: true,
  pinned: true,
  sprinting: false,
  dead: false,
});
check('the detached pin exits cleanly after its animation',
  !grenadeView.pinAssembly.visible && !grenadeView.leftPullHand.visible);
grenadeView.playThrow();
check('the grenade leaves the hand the moment the throw starts',
  !grenadeView.ordnance.visible && grenadeView.group.visible);
grenadeView.update(0.12, {
  selected: false,
  aiming: false,
  pinned: false,
  sprinting: false,
  dead: false,
});
const throwMidFlight = grenadeView.throwing && grenadeView.group.visible;
const throwSwingsBack = grenadeView.group.position.z < 0;
grenadeView.update(0.4, {
  selected: false,
  aiming: false,
  pinned: false,
  sprinting: false,
  dead: false,
});
check('the first-person hand follows through and then leaves the frame',
  throwMidFlight && throwSwingsBack
    && !grenadeView.throwing && !grenadeView.group.visible);
check('the hand is reloaded with a fresh grenade once the throw ends',
  grenadeView.ordnance.visible && grenadeView.pinAssembly.visible);

grenadeView.setSelected(true);
grenadeView.update(0.05, {
  selected: true,
  aiming: false,
  pinned: false,
  sprinting: false,
  dead: false,
  moveSpeed: 0,
  grounded: true,
});
const drawn = grenadeView.group.position.y;
grenadeView.update(0.4, {
  selected: true,
  aiming: false,
  pinned: false,
  sprinting: false,
  dead: false,
  moveSpeed: 0,
  grounded: true,
});
check('selecting a grenade swings it up into the carry pose',
  drawn < grenadeView.group.position.y - 0.1,
  JSON.stringify({ drawn, settled: grenadeView.group.position.y }));

const carryY = grenadeView.group.position.y;
grenadeView.update(0.5, {
  selected: true,
  aiming: true,
  pinned: false,
  sprinting: false,
  dead: false,
  moveSpeed: 0,
  grounded: true,
});
check('readying the throw raises the grenade toward the eye line',
  grenadeView.group.position.y > carryY,
  JSON.stringify({ carryY, ready: grenadeView.group.position.y }));

grenadeView.setPinned(true, false);
for (let i = 0; i < 20; i++) {
  grenadeView.update(0.05, {
    selected: true,
    aiming: true,
    pinned: true,
    sprinting: false,
    dead: false,
    moveSpeed: 0,
    grounded: true,
  });
}
check('all grenade variants omit the black finger bars over the body',
  grenadeView.fingers === null
    && !grenadeView.group.getObjectByName('grenade-fingers')
    && buildGrenadeModel(true, { kind: 'frag' }).userData.fingers === null
    && buildGrenadeModel(true, { kind: 'incendiary' }).userData.fingers === null
    && buildGrenadeModel(true, { kind: 'molotov' }).userData.fingers === null);

const trajectory = new GrenadeTrajectory(animationScene, 8);
trajectory.update({
  visible: true,
  origin: new THREE.Vector3(0.3, 1, 0),
  velocity: new THREE.Vector3(0, 1, -12),
  time: 0.25,
  cast: (_origin, _direction, distance) => ({
    distance: distance * 0.65,
    normal: new THREE.Vector3(0, 1, 0),
  }),
});
check('the trajectory marks its first collision with a red sphere',
  trajectory.impactMarker.visible
    && trajectory.impactMarker.material.transparent
    && trajectory.impactMarker.material.color.getHex() === 0xff5540);
check('the guide arc draws through geometry so it is never lost against cover',
  trajectory.blocks.every((b) => b.material.depthTest === false
    && b.material.blending === THREE.AdditiveBlending
    && b.material.opacity >= 0.5)
    && trajectory.impactMarker.material.depthTest === false);
check('the impact point is grounded by a ring laid on the surface it hits',
  trajectory.impactRing.visible
    && trajectory.impactRing.material.depthTest === false);

// A first-person limb must never end inside the frame: the open cap reads as a
// severed arm. Every long segment's far end has to be outside the frustum, or
// buried inside another limb segment.
const viewCamera = new THREE.PerspectiveCamera(55, 16 / 9, 0.005, 12);
viewCamera.updateMatrixWorld(true);
viewCamera.updateProjectionMatrix();

function exposedStumps(view) {
  view.group.updateMatrixWorld(true);
  const limbs = [];
  view.group.traverse((object) => {
    if (!object.isMesh) return;
    if (!/hand/.test(object.parent?.name || '')) return;
    object.geometry.computeBoundingBox();
    limbs.push({ object, box: object.geometry.boundingBox });
  });
  let exposed = 0;
  const point = new THREE.Vector3();
  for (const limb of limbs) {
    const box = limb.box;
    const size = box.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.y, size.z) < 0.5) continue;   // hands, not limbs
    for (const x of [box.min.x * 0.85, box.max.x * 0.85]) {
      for (const y of [box.min.y * 0.85, box.max.y * 0.85]) {
        point.set(x, y, box.max.z).applyMatrix4(limb.object.matrixWorld);
        if (point.z >= -0.006) continue;                    // behind the eye
        const ndc = point.clone().project(viewCamera);
        if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z >= 1) continue;
        const buried = limbs.some((other) => other !== limb
          && other.box.containsPoint(other.object.worldToLocal(point.clone())));
        if (!buried) exposed++;
      }
    }
  }
  return exposed;
}

const stumpView = new GrenadeView(new THREE.Scene());
const stumpBase = {
  selected: true, aiming: false, pinned: false, sprinting: false, dead: false,
  moveSpeed: 0, grounded: true, lookDx: 0, lookDy: 0,
};
function worstStumps(frames, context) {
  let worst = 0;
  for (let i = 0; i < frames; i++) {
    stumpView.update(1 / 60, context);
    worst = Math.max(worst, exposedStumps(stumpView));
  }
  return worst;
}
stumpView.setSelected(true);
const carryStumps = worstStumps(40, stumpBase);
const sprintStumps = worstStumps(60, { ...stumpBase, sprinting: true, moveSpeed: 6.4 });
const lookStumps = worstStumps(60, { ...stumpBase, moveSpeed: 5.6, lookDx: 1.6, lookDy: -1.6 });
const readyStumps = worstStumps(50, { ...stumpBase, aiming: true });
stumpView.setPinned(true);
const pinStumps = worstStumps(50, { ...stumpBase, aiming: true, pinned: true });
stumpView.playThrow();
const throwStumps = worstStumps(28, { ...stumpBase, selected: false, pinned: false });
check('no severed arm ends are ever visible in the first-person frame',
  carryStumps === 0 && sprintStumps === 0 && lookStumps === 0
    && readyStumps === 0 && pinStumps === 0 && throwStumps === 0,
  JSON.stringify({
    carryStumps, sprintStumps, lookStumps, readyStumps, pinStumps, throwStumps,
  }));

// An arm must also never sweep broadside across the middle of the view. A limb
// covering screen centre blocks the crosshair and reads as flying through your
// face, which is what a too-shallow arm angle produces during the throw.
function coversCentre(view, name) {
  const limb = view.group.getObjectByName(name);
  if (!limb || !limb.visible) return false;
  view.group.updateMatrixWorld(true);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let any = false;
  const point = new THREE.Vector3();
  limb.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          point.set(x, y, z).applyMatrix4(mesh.matrixWorld);
          if (point.z >= -0.006) continue;
          any = true;
          const ndc = point.clone().project(viewCamera);
          minX = Math.min(minX, ndc.x); maxX = Math.max(maxX, ndc.x);
          minY = Math.min(minY, ndc.y); maxY = Math.max(maxY, ndc.y);
        }
      }
    }
  });
  return any && minX < 0.05 && maxX > -0.05 && minY < 0.05 && maxY > -0.05;
}

const centreView = new GrenadeView(new THREE.Scene());
centreView.setSelected(true);
for (let i = 0; i < 40; i++) centreView.update(1 / 60, stumpBase);
let pinCrossings = 0;
centreView.setPinned(true);
for (let i = 0; i < 50; i++) {
  centreView.update(1 / 60, { ...stumpBase, aiming: true, pinned: true });
  if (coversCentre(centreView, 'grenade-left-pin-hand')) pinCrossings++;
}
let throwCrossings = 0;
centreView.playThrow();
for (let i = 0; i < 28; i++) {
  centreView.update(1 / 60, { ...stumpBase, selected: false, pinned: false });
  if (coversCentre(centreView, 'grenade-throw-hand')) throwCrossings++;
}
check('neither arm sweeps across the centre of the view',
  pinCrossings === 0 && throwCrossings === 0,
  JSON.stringify({ pinCrossings, throwCrossings }));

const grenade = {
  position: new THREE.Vector3(0, 0.8, 0),
  velocity: new THREE.Vector3(0, -6, -4),
  bounces: 0,
};
const groundCast = (origin, direction, maxDistance) => {
  if (direction.y >= -1e-8) return null;
  const distance = origin.y / -direction.y;
  if (distance > maxDistance) return null;
  return { distance, normal: new THREE.Vector3(0, 1, 0) };
};
for (let i = 0; i < 70; i++) advanceGrenade(grenade, 1 / 70, groundCast);
check('grenades collide with and bounce off world surfaces',
  grenade.bounces > 0 && grenade.position.y >= GRENADE_RADIUS - 0.02,
  JSON.stringify({ position: grenade.position.toArray(), bounces: grenade.bounces }));

const collisionBox = {
  min: new THREE.Vector3(-2, 0, -0.5),
  max: new THREE.Vector3(2, 3, 0.5),
};
const negativeZHit = rayAabb(
  new THREE.Vector3(0, 1.5, 3),
  new THREE.Vector3(0, 0, -1),
  collisionBox,
  5
);
const downwardHit = rayAabb(
  new THREE.Vector3(0, 5, 0),
  new THREE.Vector3(0, -1, 0),
  collisionBox,
  5
);
check('server collision normals oppose negative-axis impacts',
  negativeZHit?.normal.z === 1
    && downwardHit?.normal.y === 1,
  JSON.stringify({
    negativeZ: negativeZHit?.normal.toArray(),
    downward: downwardHit?.normal.toArray(),
  }));

const wallBounce = {
  position: new THREE.Vector3(0, 1.6, 3),
  velocity: new THREE.Vector3(2, 0, -12),
  bounces: 0,
  physicsRemainder: 0,
};
for (let i = 0; i < 24; i++) {
  advanceGrenade(
    wallBounce,
    GRENADE_PHYSICS_STEP,
    (origin, direction, maxDistance) =>
      rayAabb(origin, direction, collisionBox, maxDistance)
  );
}
check('an oblique wall impact rebounds instead of sticking to the wall',
  wallBounce.bounces === 1
    && wallBounce.velocity.z > 5
    && Math.abs(wallBounce.velocity.x - 2) < 1e-7
    && wallBounce.position.z > collisionBox.max.z + GRENADE_RADIUS,
  JSON.stringify({
    position: wallBounce.position.toArray(),
    velocity: wallBounce.velocity.toArray(),
    bounces: wallBounce.bounces,
  }));

const sharedGrenadeLevel = buildServerLevel();
const expectedGrenadeSolids = sharedGrenadeLevel.map.parts
  .flatMap((part) => expandPart(part))
  .filter((box) => !box.opts?.ghost)
  .length;
check('PVP authority builds the exact visible PVE grenade collision geometry',
  sharedGrenadeLevel.grenadeSolids.length === expectedGrenadeSolids
    && sharedGrenadeLevel.grenadeSolids.some(
      (solid) => solid.geometry.type === 'CylinderGeometry'
    ),
  JSON.stringify({
    authority: sharedGrenadeLevel.grenadeSolids.length,
    visible: expectedGrenadeSolids,
  }));

const makeSharedWorldGrenade = () => ({
  position: new THREE.Vector3(-0.3, 1.44, 65.32),
  velocity: new THREE.Vector3(0, 2.6, 18),
  bounces: 0,
  physicsRemainder: 0,
  physicsLifeRemaining: 5,
});
const authorityWorldGrenade = makeSharedWorldGrenade();
const visibleWorldGrenade = makeSharedWorldGrenade();
const castSharedWorld = (origin, direction, maxDistance) =>
  rayGrenadeWorld(sharedGrenadeLevel, origin, direction, maxDistance);
for (let i = 0; i < 225; i++) {
  advanceGrenade(authorityWorldGrenade, 1 / 45, castSharedWorld);
}
let visibleWorldElapsed = 0;
const visibleWorldFrames = [1 / 144, 1 / 83, 1 / 120, 1 / 97, 1 / 165];
for (let frame = 0; visibleWorldElapsed < 5 - 1e-9; frame++) {
  const frameDt = Math.min(
    visibleWorldFrames[frame % visibleWorldFrames.length],
    5 - visibleWorldElapsed
  );
  visibleWorldElapsed += frameDt;
  advanceGrenade(visibleWorldGrenade, frameDt, castSharedWorld);
}
check('PVP authority and visible PVE trajectory end at one identical world point',
  authorityWorldGrenade.position.distanceTo(visibleWorldGrenade.position) < 1e-9
    && authorityWorldGrenade.velocity.distanceTo(visibleWorldGrenade.velocity) < 1e-9
    && authorityWorldGrenade.bounces === visibleWorldGrenade.bounces
    && authorityWorldGrenade.resting === visibleWorldGrenade.resting,
  JSON.stringify({
    authority: {
      p: authorityWorldGrenade.position.toArray(),
      v: authorityWorldGrenade.velocity.toArray(),
      bounces: authorityWorldGrenade.bounces,
    },
    visible: {
      p: visibleWorldGrenade.position.toArray(),
      v: visibleWorldGrenade.velocity.toArray(),
      bounces: visibleWorldGrenade.bounces,
    },
  }));

const fuseLimitedGrenade = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(0, 0, 10),
  physicsRemainder: 0,
  physicsLifeRemaining: 0.1,
};
advanceGrenade(fuseLimitedGrenade, 0.5, () => null);
const fuseEndPosition = fuseLimitedGrenade.position.clone();
advanceGrenade(fuseLimitedGrenade, 0.5, () => null);
check('network delay cannot move a visible grenade beyond its fuse endpoint',
  fuseLimitedGrenade.physicsLifeRemaining === 0
    && fuseLimitedGrenade.position.distanceTo(fuseEndPosition) < 1e-12,
  JSON.stringify({
    position: fuseLimitedGrenade.position.toArray(),
    remaining: fuseLimitedGrenade.physicsLifeRemaining,
  }));

const makePartitionGrenade = () => ({
  position: new THREE.Vector3(0, 1.45, 0),
  velocity: new THREE.Vector3(4.2, 3.1, -11.5),
  bounces: 0,
  physicsRemainder: 0,
});
const serverPartition = makePartitionGrenade();
const clientPartition = makePartitionGrenade();
for (let i = 0; i < 225; i++) {
  advanceGrenade(serverPartition, 1 / 45, groundCast);
}
const clientFrameTimes = [1 / 144, 1 / 83, 1 / 120, 1 / 97, 1 / 165];
let clientElapsed = 0;
let clientFrame = 0;
while (clientElapsed < 5 - 1e-9) {
  const frameDt = Math.min(
    clientFrameTimes[clientFrame++ % clientFrameTimes.length],
    5 - clientElapsed
  );
  clientElapsed += frameDt;
  advanceGrenade(clientPartition, frameDt, groundCast);
}
check('fixed-step grenade physics ends at the same rest point at 45 Hz and variable FPS',
  serverPartition.position.distanceTo(clientPartition.position) < 1e-7
    && serverPartition.velocity.distanceTo(clientPartition.velocity) < 1e-7
    && serverPartition.resting
    && clientPartition.resting
    && serverPartition.bounces === clientPartition.bounces
    && serverPartition.bounces < 30
    && GRENADE_PHYSICS_STEP === 1 / 70,
  JSON.stringify({
    server: {
      p: serverPartition.position.toArray(),
      v: serverPartition.velocity.toArray(),
      bounces: serverPartition.bounces,
      resting: serverPartition.resting,
    },
    client: {
      p: clientPartition.position.toArray(),
      v: clientPartition.velocity.toArray(),
      bounces: clientPartition.bounces,
      resting: clientPartition.resting,
    },
  }));
check('PVP authority never corrects a grenade during flight or rebound',
  !grenadeRestSyncNeeded(wallBounce)
    && grenadeRestSyncNeeded(serverPartition),
  JSON.stringify({
    reboundNeedsSync: grenadeRestSyncNeeded(wallBounce),
    restingNeedsSync: grenadeRestSyncNeeded(serverPartition),
  }));
serverPartition.restSyncSent = true;
check('the final resting point is synchronized only once',
  !grenadeRestSyncNeeded(serverPartition));

const molotov = {
  position: new THREE.Vector3(0, 0.8, 0),
  velocity: new THREE.Vector3(0, -6, -4),
  impactFused: true,
  bounces: 0,
};
for (let i = 0; i < 70 && !molotov.impactLocked; i++) {
  advanceGrenade(molotov, 1 / 70, groundCast);
}
check('the Molotov locks and detonates on its first world contact without bouncing',
  molotov.impactLocked
    && molotov.impactThisStep
    && molotov.bounces === 0
    && molotov.velocity.lengthSq() === 0,
  JSON.stringify({
    position: molotov.position.toArray(),
    bounces: molotov.bounces,
    impactLocked: molotov.impactLocked,
  }));

console.log(failures ? `\n${failures} grenade problem(s)\n` : '\nGrenade mechanics verified\n');
process.exit(failures ? 1 : 0);
