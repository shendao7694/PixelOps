// Sentry gun: tuning constants and the deployable model.
//
// The model lives here rather than in main.js so tools/sentrycheck.mjs can
// audit it the same way weapons and grenades are audited - a floating greeble
// or an over-long barrel is a bug you only catch by measuring the assembly.
import * as THREE from '../../vendor/three.module.js';

const TAU = Math.PI * 2;

export const SENTRY_CONFIG = Object.freeze({
  health: 500,
  lifetimeSeconds: 180,
  range: 35,
  spread: 0.085,
  damageScale: 0.7,
  modelScale: 1.5,
  pitchMin: -0.38,
  pitchMax: 0.48,
  tracerColor: 0xd8dde0,
});

export function buildSentryModel(displayTeam = 'blue') {
  const g = new THREE.Group();
  g.scale.setScalar(SENTRY_CONFIG.modelScale);
  const gunmetal = new THREE.MeshLambertMaterial({ color: 0x303841 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x151a1e });
  const mid = new THREE.MeshLambertMaterial({ color: 0x59636d });
  const edge = new THREE.MeshLambertMaterial({ color: 0x78838d });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x0b0d0f });
  const brass = new THREE.MeshLambertMaterial({ color: 0xa77d37 });
  const khaki = new THREE.MeshLambertMaterial({ color: 0x716b52 });
  const friendly = new THREE.MeshBasicMaterial({
    color: displayTeam === 'blue' ? 0x55aaff : 0xff4a3c,
  });
  const infrared = new THREE.MeshBasicMaterial({ color: 0xff2525 });
  const box = (mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  const cylinder = (mat, radius, height, x, y, z, rx = 0, ry = 0, rz = 0, parent = g, sides = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, sides), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  const beam = (mat, from, to, width, depth = width, parent = g) => {
    const delta = new THREE.Vector3().subVectors(to, from);
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, delta.length(), depth), mat);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    parent.add(m);
    return m;
  };

  // Tall, splayed tripod copied from a crew-served gun mount. The long legs
  // still converge on a solid hub and end in round anti-slip ground shoes.
  const lowerHub = cylinder(gunmetal, 0.16, 0.32, 0, 0.20, 0, 0, 0, 0, g, 12);
  lowerHub.name = 'sentry-tripod-hub';
  cylinder(edge, 0.18, 0.055, 0, 0.365, 0, 0, 0, 0, g, 12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const radial = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const hinge = radial.clone().multiplyScalar(0.10).setY(0.36);
    const foot = radial.clone().multiplyScalar(0.58).setY(0.06);
    const leg = beam(gunmetal, hinge, foot, 0.072, 0.09);
    leg.name = `sentry-tripod-leg-${i + 1}`;
    const joint = cylinder(edge, 0.07, 0.12, hinge.x, hinge.y, hinge.z,
      Math.PI / 2, a, 0, g, 8);
    joint.name = `sentry-tripod-joint-${i + 1}`;
    const pad = cylinder(rubber, 0.11, 0.05, foot.x, 0.025, foot.z,
      0, 0, 0, g, 12);
    pad.name = `sentry-tripod-foot-${i + 1}`;
    // A thinner lower brace gives the tripod the double-strut silhouette of
    // a deployable heavy weapon mount.
    const braceStart = radial.clone().multiplyScalar(0.055).setY(0.26);
    const braceEnd = radial.clone().multiplyScalar(0.46).setY(0.10);
    const brace = beam(dark, braceStart, braceEnd, 0.035, 0.045);
    brace.name = `sentry-tripod-brace-${i + 1}`;
  }
  const column = cylinder(mid, 0.105, 0.40, 0, 0.47, 0, 0, 0, 0, g, 12);
  column.name = 'sentry-pedestal';
  cylinder(dark, 0.13, 0.065, 0, 0.31, 0, 0, 0, 0, g, 12);
  cylinder(edge, 0.125, 0.055, 0, 0.65, 0, 0, 0, 0, g, 12);
  cylinder(dark, 0.18, 0.075, 0, 0.70, 0, 0, 0, 0, g, 16);

  // The upper assembly yaws on the turntable. The gun itself lives in a
  // separate pitch group held between two trunnion arms.
  const head = new THREE.Group();
  head.name = 'sentry-head';
  head.position.y = 0.70;
  g.add(head);
  cylinder(mid, 0.17, 0.075, 0, 0.035, 0, 0, 0, 0, head, 16);
  const cradle = box(gunmetal, 0.54, 0.10, 0.34, 0, 0.11, 0.02, 0, 0, 0, head);
  box(mid, 0.085, 0.29, 0.17, -0.23, 0.255, 0.02, 0, 0, 0, head);
  box(mid, 0.085, 0.29, 0.17, 0.23, 0.255, 0.02, 0, 0, 0, head);
  cylinder(edge, 0.09, 0.12, -0.275, 0.275, 0.02,
    0, 0, Math.PI / 2, head, 12);
  cylinder(edge, 0.09, 0.12, 0.275, 0.275, 0.02,
    0, 0, Math.PI / 2, head, 12);

  const pitch = new THREE.Group();
  pitch.name = 'sentry-pitch';
  pitch.position.set(0, 0.275, 0.02);
  head.add(pitch);

  // Layered receiver, servo pack and feed cover.
  const receiver = box(gunmetal, 0.38, 0.27, 0.56, 0, 0.015, -0.08,
    0, 0, 0, pitch);
  receiver.name = 'sentry-receiver';
  box(mid, 0.33, 0.075, 0.38, 0, 0.19, -0.10, 0, 0, 0, pitch);
  box(edge, 0.25, 0.035, 0.22, 0, 0.245, -0.12, 0, 0, 0, pitch);
  box(dark, 0.29, 0.22, 0.24, 0, 0.01, 0.32, 0, 0, 0, pitch);
  cylinder(mid, 0.11, 0.30, 0, 0.01, 0.47,
    Math.PI / 2, 0, 0, pitch, 12);
  box(dark, 0.06, 0.18, 0.16, -0.22, 0.00, 0.27, 0, 0, 0, pitch);
  box(dark, 0.06, 0.18, 0.16, 0.22, 0.00, 0.27, 0, 0, 0, pitch);

  // Working-gun details: a toothed top rail, an ejection door and charging
  // handle, plus rear spade grips attached to the drive housing.
  const rail = box(dark, 0.24, 0.026, 0.31, 0, 0.274, -0.12,
    0, 0, 0, pitch);
  rail.name = 'sentry-top-rail';
  for (let i = 0; i < 6; i++) {
    const tooth = box(edge, 0.22, 0.02, 0.026, 0, 0.296, -0.245 + i * 0.05,
      0, 0, 0, pitch);
    tooth.name = `sentry-rail-tooth-${i + 1}`;
  }
  const ejectionDoor = box(dark, 0.022, 0.09, 0.16, -0.196, 0.04, -0.02,
    0, 0, 0, pitch);
  ejectionDoor.name = 'sentry-ejection-door';
  const chargingHandle = cylinder(rubber, 0.025, 0.09, -0.235, 0.02, 0.08,
    0, 0, Math.PI / 2, pitch, 8);
  chargingHandle.name = 'sentry-charging-handle';
  const rearBar = box(gunmetal, 0.46, 0.045, 0.055, 0, 0.02, 0.51,
    0, 0, 0, pitch);
  rearBar.name = 'sentry-spade-crossbar';
  const leftGrip = beam(
    rubber,
    new THREE.Vector3(-0.18, 0.02, 0.51),
    new THREE.Vector3(-0.25, 0.14, 0.60),
    0.045,
    0.055,
    pitch
  );
  leftGrip.name = 'sentry-spade-grip-left';
  const rightGrip = beam(
    rubber,
    new THREE.Vector3(0.18, 0.02, 0.51),
    new THREE.Vector3(0.25, 0.14, 0.60),
    0.045,
    0.055,
    pitch
  );
  rightGrip.name = 'sentry-spade-grip-right';

  // A protective tubular cage follows the reference silhouette over the
  // receiver and rear drive pack. It also reads as a real two-person lift
  // handle instead of another floating decorative rail.
  for (const [side, x] of [['left', -0.16], ['right', 0.16]]) {
    const cageFront = beam(
      dark,
      new THREE.Vector3(x, 0.20, 0.03),
      new THREE.Vector3(x, 0.34, 0.22),
      0.025,
      0.032,
      pitch
    );
    cageFront.name = `sentry-cage-${side}-front`;
    const cageTop = beam(
      dark,
      new THREE.Vector3(x, 0.34, 0.22),
      new THREE.Vector3(x, 0.34, 0.50),
      0.025,
      0.032,
      pitch
    );
    cageTop.name = `sentry-cage-${side}-top`;
    const cageRear = beam(
      dark,
      new THREE.Vector3(x, 0.34, 0.50),
      new THREE.Vector3(x, 0.18, 0.61),
      0.025,
      0.032,
      pitch
    );
    cageRear.name = `sentry-cage-${side}-rear`;
  }
  box(dark, 0.35, 0.025, 0.035, 0, 0.34, 0.49,
    0, 0, 0, pitch).name = 'sentry-cage-crossbar';

  // Twin heavy barrels match the supplied reference. Both barrels overlap the
  // receiver at the breech and are tied together by real cross clamps, while
  // their inner tubes and muzzle brakes remain visually separate.
  for (const [side, x] of [['left', -0.055], ['right', 0.055]]) {
    const barrelJacket = cylinder(dark, 0.05, 0.44, x, 0.015, -0.49,
      Math.PI / 2, 0, 0, pitch, 12);
    barrelJacket.name = `sentry-barrel-${side}`;
    for (const z of [-0.33, -0.47, -0.61]) {
      cylinder(edge, 0.059, 0.035, x, 0.015, z,
        Math.PI / 2, 0, 0, pitch, 12);
    }
    cylinder(gunmetal, 0.03, 0.34, x, 0.015, -0.86,
      Math.PI / 2, 0, 0, pitch, 12);
    cylinder(dark, 0.052, 0.16, x, 0.015, -1.11,
      Math.PI / 2, 0, 0, pitch, 12);
  }
  for (const [i, z] of [-0.36, -0.54, -0.69].entries()) {
    box(mid, 0.22, 0.04, 0.05, 0, 0.015, z,
      0, 0, 0, pitch).name = `sentry-twin-barrel-clamp-${i + 1}`;
  }
  const gasTube = cylinder(gunmetal, 0.025, 0.72, 0, -0.06, -0.65,
    Math.PI / 2, 0, 0, pitch, 8);
  gasTube.name = 'sentry-gas-tube';
  box(mid, 0.14, 0.13, 0.08, 0, -0.025, -0.69, 0, 0, 0, pitch)
    .name = 'sentry-gas-block';
  for (let i = 0; i < 4; i++) {
    box(rubber, 0.13, 0.018, 0.055, 0, 0.068, -0.38 - i * 0.085,
      0, 0, 0, pitch).name = `sentry-heat-slot-${i + 1}`;
  }
  const carryLeft = beam(
    edge,
    new THREE.Vector3(-0.075, 0.06, -0.45),
    new THREE.Vector3(-0.12, 0.17, -0.55),
    0.025,
    0.035,
    pitch
  );
  carryLeft.name = 'sentry-carry-handle-left';
  const carryRight = beam(
    edge,
    new THREE.Vector3(0.075, 0.06, -0.45),
    new THREE.Vector3(0.12, 0.17, -0.55),
    0.025,
    0.035,
    pitch
  );
  carryRight.name = 'sentry-carry-handle-right';
  box(rubber, 0.28, 0.045, 0.055, 0, 0.175, -0.56,
    0, 0, 0, pitch).name = 'sentry-carry-handle-grip';
  box(rubber, 0.025, 0.07, 0.055, -0.075, 0.015, -1.11,
    0, 0, 0, pitch).name = 'sentry-muzzle-port-left';
  box(rubber, 0.025, 0.07, 0.055, 0.075, 0.015, -1.11,
    0, 0, 0, pitch).name = 'sentry-muzzle-port-right';

  // Olive side electronics/ammunition module, exposed belt and lower servo
  // reproduce the boxy control frame in the reference rather than a plain can.
  const ammoCan = box(khaki, 0.20, 0.32, 0.32, 0.31, -0.07, 0.02,
    0, 0, 0, pitch);
  ammoCan.name = 'sentry-ammo-can';
  box(khaki, 0.22, 0.045, 0.34, 0.31, 0.115, 0.02,
    0, 0, 0, pitch).name = 'sentry-ammo-can-lid';
  for (const [i, y] of [-0.11, 0.015].entries()) {
    box(edge, 0.018, 0.035, 0.27, 0.407, y, 0.02,
      0, 0, 0, pitch).name = `sentry-ammo-can-rib-${i + 1}`;
  }
  box(khaki, 0.10, 0.43, 0.08, 0.30, -0.12, 0.30,
    0, 0, 0, pitch).name = 'sentry-control-frame-vertical';
  box(khaki, 0.20, 0.07, 0.34, 0.26, -0.31, 0.18,
    0, 0, 0, pitch).name = 'sentry-control-frame-lower';
  const sideServo = cylinder(dark, 0.09, 0.09, 0.415, -0.16, 0.18,
    0, 0, Math.PI / 2, pitch, 12);
  sideServo.name = 'sentry-side-servo';
  const lowerSensor = cylinder(dark, 0.11, 0.12, -0.23, -0.18, 0.08,
    0, 0, Math.PI / 2, pitch, 12);
  lowerSensor.name = 'sentry-lower-sensor';
  for (let i = 0; i < 5; i++) {
    const round = cylinder(
      brass,
      0.018,
      0.075,
      0.205 + i * 0.027,
      0.09,
      -0.10 - i * 0.025,
      0,
      0,
      Math.PI / 2,
      pitch,
      8
    );
    round.name = `sentry-feed-round-${i + 1}`;
  }

  // Optical block, team status lamp, and a dedicated IR illuminator. The
  // lamp is sunk into the block's front face rather than parked in front of
  // it, or it reads as a detached mote once the head starts tracking.
  box(dark, 0.22, 0.13, 0.22, 0, 0.305, -0.19,
    0, 0, 0, pitch).name = 'sentry-optic';
  box(friendly, 0.09, 0.045, 0.025, 0, 0.31, -0.305, 0, 0, 0, pitch);
  cylinder(infrared, 0.038, 0.022, -0.075, 0.275, -0.303,
    Math.PI / 2, 0, 0, pitch, 10);
  const irHousing = box(dark, 0.12, 0.10, 0.30, -0.20, -0.07, -0.46,
    0, 0, 0, pitch);
  irHousing.name = 'sentry-ir-housing';
  const irCollar = cylinder(edge, 0.043, 0.045, -0.20, -0.07, -0.605,
    Math.PI / 2, 0, 0, pitch, 10);
  irCollar.name = 'sentry-ir-collar';
  const irLens = cylinder(infrared, 0.032, 0.025, -0.20, -0.07, -0.629,
    Math.PI / 2, 0, 0, pitch, 10);
  irLens.name = 'sentry-ir-emitter';
  beam(
    dark,
    new THREE.Vector3(-0.17, -0.04, -0.32),
    new THREE.Vector3(-0.20, -0.07, -0.46),
    0.018,
    0.018,
    pitch
  ).name = 'sentry-ir-cable';

  const muzzle = new THREE.Object3D();
  muzzle.name = 'sentry-muzzle';
  muzzle.position.set(-0.055, 0.015, -1.20);
  pitch.add(muzzle);
  const secondaryMuzzle = new THREE.Object3D();
  secondaryMuzzle.name = 'sentry-muzzle-secondary';
  secondaryMuzzle.position.set(0.055, 0.015, -1.20);
  pitch.add(secondaryMuzzle);
  const laserOrigin = new THREE.Object3D();
  laserOrigin.name = 'sentry-laser-origin';
  laserOrigin.position.set(-0.20, -0.07, -0.65);
  pitch.add(laserOrigin);
  const ejectionPort = new THREE.Object3D();
  ejectionPort.name = 'sentry-ejection-port';
  ejectionPort.position.set(-0.225, 0.04, -0.02);
  pitch.add(ejectionPort);

  g.userData.hitboxes = [lowerHub, column, cradle, receiver];
  return g;
}
