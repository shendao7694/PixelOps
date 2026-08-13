// Weapon model audit: every part of a gun must touch at least one other part.
// A floating greeble reads as a bug the moment the weapon sways.
import { installDomStub } from './domstub.mjs';
installDomStub();

const THREE = await import('three');
const { buildTextures } = await import('../src/world/textures.js');
const { buildWeapon, WEAPON_ORDER } = await import('../src/game/weapons.js');
const {
  machinePistolMagazineReloadPose,
  desertEagleMagazineReloadPose,
  rifleMagazineReloadPose,
  railgunBatteryReloadPose,
  updateSidearmReloadComponent,
} = await import('../src/game/sidearm-reload.js');

const textures = buildTextures();
const EPS = 0.004;               // parts closer than this count as touching
let problems = 0;

console.log('\nweapon model audit\n');

{
  const id = 'machine_pistol';
  const poseFor = machinePistolMagazineReloadPose;
  const magazineOut = poseFor(0.40);
  const magazineSwap = poseFor(0.48);
  const magazineNew = poseFor(0.58);
  const magazineIn = poseFor(0.68);
  const magazineLocked = poseFor(0.80);
  const magazineTravel = Math.hypot(
    magazineOut.offsetX,
    magazineOut.offsetY,
    magazineOut.offsetZ
  );
  const magazineNewTravel = Math.hypot(
    magazineNew.offsetX,
    magazineNew.offsetY,
    magazineNew.offsetZ
  );
  const magazineInTravel = Math.hypot(
    magazineIn.offsetX,
    magazineIn.offsetY,
    magazineIn.offsetZ
  );
  const magazineAnimated = magazineOut.visible && magazineTravel > 0.20
    && !magazineSwap.visible
    && magazineNew.visible && magazineNewTravel > 0.20
    && magazineIn.visible && magazineInTravel > 0.02
    && magazineInTravel < magazineNewTravel
    && magazineLocked.visible && magazineLocked.offsetY === 0;
  if (!magazineAnimated) problems++;
  console.log(`  ${id}: code-built magazine exits, swaps and locks `
    + `(${magazineAnimated ? 'ok' : 'INVALID'})`);
}
for (const [id, poseFor] of [
  ['desert_eagle', desertEagleMagazineReloadPose],
  ['rifle', rifleMagazineReloadPose],
  ['railgun', railgunBatteryReloadPose],
]) {
  const magazineOut = poseFor(0.40);
  const magazineSwap = poseFor(0.48);
  const magazineNew = poseFor(0.58);
  const magazineLocked = poseFor(0.80);
  const travel = (pose) => Math.hypot(pose.offsetX, pose.offsetY, pose.offsetZ);
  const magazineAnimated = magazineOut.visible && travel(magazineOut) > 0.15
    && !magazineSwap.visible
    && magazineNew.visible && travel(magazineNew) > 0.15
    && magazineLocked.visible && travel(magazineLocked) === 0;
  if (!magazineAnimated) problems++;
  console.log(`  ${id}: code-built magazine exits, swaps and locks `
    + `(${magazineAnimated ? 'ok' : 'INVALID'})`);
}
console.log('');

for (const id of WEAPON_ORDER) {
  const { group, anchors } = buildWeapon(id, textures, true);
  const sidearmSpecs = {
    machine_pistol: {
      tag: 'cz75-auto',
      magazine: 'machine-pistol-magazine',
      grip: 'cz75-grip-shell',
      frontSight: 'cz75-front-sight',
    },
    desert_eagle: {
      tag: 'desert-eagle',
      magazine: 'deagle-magazine',
      grip: 'deagle-grip-shell',
      frontSight: 'deagle-front-sight',
    },
  };
  const sidearm = sidearmSpecs[id];
  if (sidearm) {
    const codeBuilt = group.userData.proceduralSidearm === sidearm.tag
      && !group.userData.importedModelFile
      && !group.userData.importedModelState;
    if (!codeBuilt) problems++;
    console.log(`  ${id}: runtime model is fully procedural `
      + `(${codeBuilt ? 'ok' : 'INVALID'})`);

    const componentName = sidearm.reloadComponent || sidearm.magazine;
    const component = group.getObjectByName(componentName);
    const frontSight = group.getObjectByName(sidearm.frontSight);
    const rest = component?.position.clone();
    updateSidearmReloadComponent(group, id, 0.40);
    const extracted = component?.visible
      && rest && component.position.distanceTo(rest) > 0.15;
    updateSidearmReloadComponent(group, id, 0.48);
    const exchanged = component && !component.visible;
    updateSidearmReloadComponent(group, id, 0.92);
    const locked = component?.visible
      && rest && component.position.distanceTo(rest) < 0.0001;
    const movingParts = !!frontSight && extracted && exchanged && locked;
    if (!movingParts) problems++;
    console.log(`  ${id}: sight and animated magazine are real model parts `
      + `(${movingParts ? 'ok' : 'INVALID'})`);

    group.updateMatrixWorld(true);
    const grip = group.getObjectByName(sidearm.grip);
    const palmCenter = anchors.grip.clone().add(new THREE.Vector3(0, -0.035, 0.045));
    const gripBox = grip ? new THREE.Box3().setFromObject(grip).expandByScalar(0.004) : null;
    const gripAligned = !!gripBox?.containsPoint(palmCenter);
    if (!gripAligned) problems++;
    console.log(`  ${id}: first-person palm centres on code-built grip `
      + `(${gripAligned ? 'ok' : 'MISALIGNED'})`);
  }
  group.updateMatrixWorld(true);
  const boxes = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    boxes.push({ b, o });
  });
  let floaters = 0;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i].b.clone().expandByScalar(EPS);
    let touching = false;
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      if (a.intersectsBox(boxes[j].b)) { touching = true; break; }
    }
    if (!touching) {
      floaters++;
      const c = boxes[i].b.getCenter(new THREE.Vector3());
      const s = boxes[i].b.getSize(new THREE.Vector3());
      console.log(`  ! ${id}: floating part at (${c.x.toFixed(3)}, ${c.y.toFixed(3)}, ${c.z.toFixed(3)})`
        + ` size ${s.x.toFixed(3)}x${s.y.toFixed(3)}x${s.z.toFixed(3)}`);
    }
  }
  console.log(`  ${id}: ${boxes.length} parts, ${floaters} floating`);
  problems += floaters;
}

console.log('');
if (problems) {
  console.log(`${problems} floating part(s)\n`);
  process.exit(1);
} else {
  console.log('all parts connected\n');
}
