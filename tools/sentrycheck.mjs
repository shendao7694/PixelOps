// Sentry model audit. The sentry is a deployable the player walks around and
// shoots at, so its geometry has to hold up close: every part connected, sane
// proportions, and nothing that clips the ground or the player through its
// whole articulation range.
import { installDomStub } from './domstub.mjs';
installDomStub();

const THREE = await import('three');
const { SENTRY_CONFIG, buildSentryModel } = await import('../src/game/sentry.js');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nsentry model audit\n');

check('the sentry has a hard three-minute lifetime',
  SENTRY_CONFIG.lifetimeSeconds === 180);

const model = buildSentryModel('blue');
model.updateMatrixWorld(true);

function worldBoxes(root) {
  const boxes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    boxes.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return boxes;
}

// Every part must touch another part. A floating greeble is obvious the
// moment the head starts tracking a target.
const EPS = 0.004;
const boxes = worldBoxes(model);
const floating = [];
for (let i = 0; i < boxes.length; i++) {
  const grown = boxes[i].clone().expandByScalar(EPS);
  if (boxes.some((other, j) => j !== i && grown.intersectsBox(other))) continue;
  const c = boxes[i].getCenter(new THREE.Vector3());
  floating.push(`(${c.x.toFixed(3)}, ${c.y.toFixed(3)}, ${c.z.toFixed(3)})`);
}
check(`all ${boxes.length} sentry parts are connected`,
  floating.length === 0, floating.join(' '));

const whole = new THREE.Box3().setFromObject(model);
const size = whole.getSize(new THREE.Vector3());

// Proportions. The sentry shares the map with 1.8 m soldiers and gets placed
// against cover, so an oversized emplacement pokes through walls and blocks
// doorways it was meant to guard.
check('the emplacement stays within a soldier-sized footprint',
  size.y <= 2.2 && size.x <= 1.9 && size.z <= 2.8,
  `W ${size.x.toFixed(2)} H ${size.y.toFixed(2)} L ${size.z.toFixed(2)}`);
check('the tripod is wider than it is tall, so it reads as stable',
  size.x > size.y * 0.7,
  `span ${size.x.toFixed(2)} vs height ${size.y.toFixed(2)}`);
check('the model sits on the ground plane rather than floating or sinking',
  whole.min.y >= -0.02 && whole.min.y <= 0.06,
  `lowest point ${whole.min.y.toFixed(3)}`);

// Articulation rig.
const head = model.getObjectByName('sentry-head');
const pitch = model.getObjectByName('sentry-pitch');
const muzzle = model.getObjectByName('sentry-muzzle');
const secondaryMuzzle = model.getObjectByName('sentry-muzzle-secondary');
const laser = model.getObjectByName('sentry-laser-origin');
const ejectionPort = model.getObjectByName('sentry-ejection-port');
check('the yaw head, pitch cradle, twin muzzles, laser and ejection nodes all exist',
  Boolean(head && pitch && muzzle && secondaryMuzzle && laser && ejectionPort));
check('the hitboxes cover the base, column and receiver',
  (model.userData.hitboxes || []).length >= 4);
check('the refined model visibly includes its tripod, feed system and IR unit',
  Boolean(
    model.getObjectByName('sentry-tripod-leg-1')
      && model.getObjectByName('sentry-ammo-can')
      && model.getObjectByName('sentry-feed-round-5')
      && model.getObjectByName('sentry-ir-emitter')
      && model.getObjectByName('sentry-top-rail')
      && model.getObjectByName('sentry-spade-grip-left')
      && model.getObjectByName('sentry-barrel-left')
      && model.getObjectByName('sentry-barrel-right')
      && model.getObjectByName('sentry-cage-left-top')
      && model.getObjectByName('sentry-control-frame-vertical')
      && model.getObjectByName('sentry-side-servo')
  ));
check('the reference-inspired barrels are separated and alternate at one depth',
  Math.abs(muzzle.position.x - secondaryMuzzle.position.x) > 0.08
    && Math.abs(muzzle.position.z - secondaryMuzzle.position.z) < 1e-6);
const roundFeet = [1, 2, 3].map((i) => model.getObjectByName(`sentry-tripod-foot-${i}`));
check('all three long tripod legs end in round ground shoes',
  roundFeet.every((foot) => foot?.geometry?.type === 'CylinderGeometry'));
check('the shell port sits outside the receiver on its ejection side',
  ejectionPort?.position.x < -0.2
    && Math.abs(ejectionPort?.position.y) < 0.12
    && Math.abs(ejectionPort?.position.z) < 0.2,
  ejectionPort ? ejectionPort.position.toArray().join(', ') : 'missing');

// The muzzle node is where tracers spawn. If it drifts off the end of the
// barrel, rounds appear out of thin air.
const muzzleLocal = muzzle.position.clone();
let barrelEnd = Infinity;
pitch.traverse((o) => {
  if (!o.isMesh) return;
  o.geometry.computeBoundingBox();
  const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrix);
  barrelEnd = Math.min(barrelEnd, b.min.z);
});
check('tracers leave from the end of the barrel, not from mid-air',
  Math.abs(muzzleLocal.z - barrelEnd) < 0.12,
  `muzzle z ${muzzleLocal.z.toFixed(3)} vs barrel tip ${barrelEnd.toFixed(3)}`);

// Sweep the real articulation limits: the gun must never swing into the
// tripod or below the ground at any elevation or bearing.
let lowestGunPart = Infinity;
for (const p of [SENTRY_CONFIG.pitchMin, 0, SENTRY_CONFIG.pitchMax]) {
  for (let i = 0; i < 8; i++) {
    head.rotation.y = (i / 8) * Math.PI * 2;
    pitch.rotation.x = p;
    model.updateMatrixWorld(true);
    for (const box of worldBoxes(pitch)) lowestGunPart = Math.min(lowestGunPart, box.min.y);
  }
}
head.rotation.y = 0;
pitch.rotation.x = 0;
model.updateMatrixWorld(true);
check('the gun clears the ground through its whole traverse and elevation',
  lowestGunPart > 0.05,
  `lowest gun part reaches y ${lowestGunPart.toFixed(3)}`);

// Team colour has to be visible at a glance: friendly blue, hostile red.
const friendlyColors = (team) => {
  const built = buildSentryModel(team);
  const seen = new Set();
  built.traverse((o) => {
    if (o.isMesh && o.material?.isMeshBasicMaterial) seen.add(o.material.color.getHex());
  });
  return seen;
};
const blue = friendlyColors('blue');
const red = friendlyColors('red');
check('the status lamp distinguishes a friendly sentry from a hostile one',
  [...blue].some((c) => c !== 0xff2525) && [...red].some((c) => c !== 0xff2525)
    && [...blue].some((c) => !red.has(c)),
  `blue ${[...blue].map((c) => c.toString(16))} red ${[...red].map((c) => c.toString(16))}`);

console.log(failures ? `\n${failures} sentry model problem(s)\n` : '\nsentry model verified\n');
process.exit(failures ? 1 : 0);
