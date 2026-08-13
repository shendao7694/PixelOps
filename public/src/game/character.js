// Blocky "Bad Business" style soldier: a real bone hierarchy (hips > spine >
// chest > neck > head, plus 4 limbs of 3 segments) driven by procedural
// animation - weight-shifted walk cycle, hip/chest counter-rotation, two-bone
// IK for the support hand on the weapon, additive flinch and a collapsing
// ragdoll on death.
import * as THREE from '../../vendor/three.module.js';
import { clamp, lerp, damp, TAU, rand, Spring } from '../core/math.js';
import {
  COMBAT_KNIFE_DRAW_SECONDS,
  combatKnifeFlipPose,
} from './melee.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// limb lengths (metres)
const L = {
  hip: 0.92,      // hip joint height
  thigh: 0.40,
  shin: 0.40,
  foot: 0.12,
  upperArm: 0.32,
  forearm: 0.28,
};

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function group(x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

/* ------------------------------------------------------------ two-bone IK */

const _t = V(), _f = V(), _axis = V(), _d1 = V(), _yA = V(), _xA = V(), _zA = V();
const _m = new THREE.Matrix4();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion(), _qWant = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _gripW = V(), _fgW = V(), _support = V();
const _up = V(0, 1, 0);
const _xAxis = V(1, 0, 0);

/**
 * How the weapon sits in the hand. The hand is rolled forward over the pistol
 * grip, so the weapon carries the opposite rotation to come out level.
 */
const GRIP_TILT = 0.34;
const GRIP_OFFSET = V(0, -0.085, -0.02);

/**
 * Weapon carries. `hand` is the wrist position in chest space; `pitch`, `yaw`
 * and `roll` orient the barrel relative to where the soldier is facing, and
 * `look` is how much of the head's pitch the barrel copies.
 *
 * These are blended by weight every frame, which is what makes the change from
 * a run to a shouldered aim a continuous motion instead of a snap.
 */
const CARRY = {
  // patrol: weapon at the chest, muzzle down and slightly across the body
  patrol: { hand: V(0.11, 0.11, -0.23), pitch: -0.30, yaw: 0.11, roll: 0.06, look: 0.55 },
  // aim: shouldered, barrel exactly along the line of sight
  aim: { hand: V(0.05, 0.26, -0.26), pitch: 0.0, yaw: 0.0, roll: 0.0, look: 1.0 },
  // sprint: dropped to the hip, muzzle down and swung across
  sprint: { hand: V(0.14, -0.03, -0.16), pitch: -0.62, yaw: 0.40, roll: 0.26, look: 0.2 },
};

// A machine pistol is presented with a compact two-hand stance. It stays
// below the shoulder while patrolling and sprinting, then rises to eye level
// without borrowing the long-gun stock/cheek-weld silhouette.
const PISTOL_CARRY = {
  patrol: { hand: V(0.18, 0.06, -0.18), pitch: -0.22, yaw: 0.08, roll: 0.04, look: 0.48 },
  aim: { hand: V(0.09, 0.23, -0.22), pitch: 0.0, yaw: 0.0, roll: 0.0, look: 1.0 },
  sprint: { hand: V(0.22, -0.09, -0.11), pitch: -0.68, yaw: 0.32, roll: 0.22, look: 0.18 },
};

// The M134 hangs from two rear spade grips around the pelvis. Firing can tilt
// the barrel onto the sight line, but neither wrist ever lifts it into a rifle
// shoulder pose.
const MINIGUN_CARRY = {
  // The right hand is the load-bearing hand. Keeping its grip just outside the
  // right hip shifts the receiver off the body's centreline while the left arm
  // reaches across only to steady the second spade grip.
  patrol: { hand: V(0.30, -0.22, -0.21), pitch: -0.16, yaw: 0.04, roll: 0.03, look: 0.35 },
  aim: { hand: V(0.30, -0.15, -0.26), pitch: 0.0, yaw: 0.0, roll: 0.0, look: 1.0 },
  sprint: { hand: V(0.31, -0.27, -0.17), pitch: -0.35, yaw: 0.18, roll: 0.10, look: 0.25 },
};

// The knife stays in the right hand with the point slightly forward and clear
// of the torso. It never borrows the rifle shoulder pose or an imaginary
// support-hand grip.
const KNIFE_CARRY = {
  patrol: { hand: V(0.28, -0.05, -0.10), pitch: -0.28, yaw: -0.20, roll: 0.72, look: 0.25 },
  aim: { hand: V(0.25, 0.02, -0.19), pitch: -0.05, yaw: -0.12, roll: 0.54, look: 0.55 },
  sprint: { hand: V(0.31, -0.12, -0.03), pitch: -0.46, yaw: -0.30, roll: 0.82, look: 0.15 },
};

// A throwable is carried one-handed at the right side, raised beside the head
// while aiming/cooking, then driven forward in a full over-arm release.
const THROWABLE_HAND_CARRY = V(0.29, 0.02, -0.10);
const THROWABLE_HAND_AIM = V(0.36, 0.34, 0.06);
const THROWABLE_HAND_RELEASE = V(0.12, 0.28, -0.51);
const THROWABLE_HAND_RECOVER = V(0.25, 0.02, -0.12);
const THROWABLE_LEFT_AIM = V(0.17, 0.24, 0.01);
const THROWABLE_LEFT_RECOVER = V(-0.08, 0.10, -0.04);

/**
 * Aim a 2-segment limb at `target` (given in the parent space of `upper`).
 * `pole` is the direction the joint should bulge towards.
 */
function solveTwoBoneIK(upper, elbow, len1, len2, target, pole) {
  _t.copy(target).sub(upper.position);
  const dist = clamp(_t.length(), 0.02, len1 + len2 - 0.005);
  if (_t.lengthSq() < 1e-8) return;
  _f.copy(_t).normalize();

  const cosA = clamp((len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist), -1, 1);
  const cosB = clamp((len1 * len1 + len2 * len2 - dist * dist) / (2 * len1 * len2), -1, 1);
  const a = Math.acos(cosA);
  const b = Math.acos(cosB);

  _axis.crossVectors(_f, pole);
  if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
  _axis.normalize();

  _d1.copy(_f).applyAxisAngle(_axis, a);

  // build the limb frame: -Y down the bone, +X on the bend axis
  _yA.copy(_d1).negate().normalize();
  _xA.copy(_axis);
  _zA.crossVectors(_xA, _yA).normalize();
  _xA.crossVectors(_yA, _zA).normalize();
  _m.makeBasis(_xA, _yA, _zA);
  upper.quaternion.setFromRotationMatrix(_m);
  elbow.rotation.set(-(Math.PI - b), 0, 0);
}

/* ------------------------------------------------------------------- rig */

export class CharacterRig {
  constructor(textures, opts = {}) {
    const team = opts.team === 'blue' ? 'blue' : 'red';
    this.team = team;
    const T = textures;

    const camo = team === 'blue' ? T.camoBlue : T.camoRed;
    const armorTex = team === 'blue' ? T.armorBlue : T.armorRed;
    const helmTex = team === 'blue' ? T.helmetBlue : T.helmetRed;
    const accent = team === 'blue' ? 0x4d7fbc : 0xbc4d4d;
    const teamLight = team === 'blue' ? 0x54b4ff : 0xff4a3c;

    // one material set per character so hit-flash is individual
    this.materials = {
      cloth: new THREE.MeshLambertMaterial({ map: camo }),
      armor: new THREE.MeshLambertMaterial({ map: armorTex }),
      helmet: new THREE.MeshLambertMaterial({ map: helmTex }),
      gear: new THREE.MeshLambertMaterial({ color: 0x2a2d31 }),
      skin: new THREE.MeshLambertMaterial({ color: 0x2b2f34 }),
      accent: new THREE.MeshLambertMaterial({ color: accent }),
      visor: new THREE.MeshLambertMaterial({ color: 0x1b2733, emissive: 0x16303f, emissiveIntensity: 0.6 }),
      jugCloth: new THREE.MeshLambertMaterial({ color: 0x4c5744, flatShading: true }),
      jugArmor: new THREE.MeshLambertMaterial({ color: 0x59634c, flatShading: true }),
      jugArmorDark: new THREE.MeshLambertMaterial({ color: 0x30392f, flatShading: true }),
      jugEdge: new THREE.MeshPhongMaterial({
        color: 0x727b68, shininess: 20, specular: 0x30382d, flatShading: true,
      }),
      jugVisor: new THREE.MeshPhongMaterial({
        color: 0x17272a, emissive: 0x071315, emissiveIntensity: 0.55,
        transparent: true, opacity: 0.82, shininess: 80,
      }),
      jugLight: new THREE.MeshBasicMaterial({ color: teamLight, fog: false }),
      jugLightGlow: new THREE.MeshBasicMaterial({
        color: teamLight, transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }),
      invulnerability: new THREE.PointsMaterial({
        color: 0xffc94d,
        size: 3,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: false,
        fog: false,
      }),
    };
    this.baseAppearance = {
      cloth: { map: camo, color: 0xffffff },
      armor: { map: armorTex, color: 0xffffff },
      helmet: { map: helmTex, color: 0xffffff },
      gear: { map: null, color: 0x2a2d31 },
      skin: { map: null, color: 0x2b2f34 },
    };
    this.baseEmissive = new Map();

    const M = this.materials;

    this.root = group();
    this.root.name = 'soldier';

    const shieldCount = 30;
    const shieldPositions = new Float32Array(shieldCount * 3);
    const shieldGeometry = new THREE.BufferGeometry();
    shieldGeometry.setAttribute('position', new THREE.BufferAttribute(shieldPositions, 3));
    this.invulnerabilityParticles = new THREE.Points(
      shieldGeometry,
      this.materials.invulnerability
    );
    this.invulnerabilityParticles.visible = false;
    this.invulnerabilityParticles.frustumCulled = false;
    this.invulnerabilityParticles.renderOrder = 4;
    this.root.add(this.invulnerabilityParticles);
    this.invulnerabilityBlend = 0;
    this.invulnerabilityTime = rand(0, TAU);

    /* ---- spine chain ---- */
    const hips = group(0, L.hip, 0);
    hips.add(box(0.44, 0.26, 0.28, M.cloth, 0, 0.02, 0));
    hips.add(box(0.46, 0.09, 0.30, M.gear, 0, -0.06, 0));           // belt
    hips.add(box(0.12, 0.16, 0.10, M.gear, 0.24, -0.02, 0.02));     // holster
    this.root.add(hips);

    const spine = group(0, 0.14, 0);
    spine.add(box(0.42, 0.22, 0.26, M.cloth, 0, 0.07, 0));
    hips.add(spine);

    const chest = group(0, 0.16, 0);
    chest.add(box(0.52, 0.32, 0.30, M.cloth, 0, 0.15, 0));
    chest.add(box(0.55, 0.26, 0.35, M.armor, 0, 0.15, 0));          // plate carrier
    chest.add(box(0.16, 0.10, 0.06, M.gear, -0.16, 0.20, -0.19));   // mag pouches
    chest.add(box(0.16, 0.10, 0.06, M.gear, 0.02, 0.20, -0.19));
    chest.add(box(0.10, 0.08, 0.06, M.accent, 0.20, 0.22, -0.19));  // team patch
    chest.add(box(0.30, 0.06, 0.06, M.gear, 0, 0.03, -0.19));       // lower rig
    chest.add(box(0.20, 0.14, 0.12, M.gear, 0, 0.14, 0.20));        // backpack
    spine.add(chest);

    const neck = group(0, 0.30, 0);
    neck.add(box(0.14, 0.10, 0.14, M.skin, 0, 0.03, 0));
    chest.add(neck);

    const head = group(0, 0.06, 0);
    head.add(box(0.26, 0.26, 0.26, M.skin, 0, 0.13, 0));            // balaclava
    head.add(box(0.30, 0.16, 0.30, M.helmet, 0, 0.25, 0));          // helmet shell
    head.add(box(0.32, 0.05, 0.32, M.helmet, 0, 0.16, 0));          // helmet rim
    head.add(box(0.24, 0.08, 0.03, M.visor, 0, 0.15, -0.135));      // goggles
    head.add(box(0.28, 0.03, 0.05, M.gear, 0, 0.11, -0.125));       // goggle strap
    head.add(box(0.07, 0.05, 0.07, M.gear, 0.12, 0.24, -0.10));     // helmet light
    head.add(box(0.05, 0.10, 0.05, M.gear, -0.13, 0.26, 0.02));     // antenna base
    head.add(box(0.02, 0.22, 0.02, M.gear, -0.13, 0.38, 0.02));     // antenna
    neck.add(head);

    /* ---- arms ---- */
    const makeArm = (side) => {
      const sx = side * 0.33;
      const shoulder = group(sx, 0.23, 0);
      shoulder.add(box(0.17, 0.13, 0.19, M.armor, side * 0.03, -0.02, 0)); // pauldron
      const upper = group(0, 0, 0);
      upper.add(box(0.15, L.upperArm, 0.17, M.cloth, 0, -L.upperArm / 2, 0));
      shoulder.add(upper);
      const elbow = group(0, -L.upperArm, 0);
      elbow.add(box(0.14, L.forearm, 0.16, M.cloth, 0, -L.forearm / 2, 0));
      elbow.add(box(0.155, 0.12, 0.175, M.gear, 0, -0.07, 0)); // elbow pad
      upper.add(elbow);
      const hand = group(0, -L.forearm, 0);
      hand.add(box(0.13, 0.15, 0.16, M.gear, 0, -0.07, -0.01));
      elbow.add(hand);
      chest.add(shoulder);
      return { shoulder, upper, elbow, hand };
    };
    this.armR = makeArm(1);
    this.armL = makeArm(-1);
    this.knifeGripVisual = group(0, -0.080, -0.020);
    this.knifeGripVisual.name = 'knife-third-person-grip';
    for (let i = 0; i < 4; i++) {
      this.knifeGripVisual.add(box(
        0.105,
        0.024,
        0.026,
        M.gear,
        0,
        -0.040,
        -0.050 + i * 0.034
      ));
    }
    this.knifeGripVisual.add(box(0.028, 0.038, 0.115, M.gear, 0.060, 0.018, 0));
    this.knifeGripVisual.visible = false;
    this.armR.hand.add(this.knifeGripVisual);

    /* ---- IFF marker: a glow panel on the right pauldron ----
       Unlit (MeshBasic) so it reads as an emissive strip at any distance and
       in any shadow - the one reliable way to tell friend from foe. */
    const iffColor = team === 'blue' ? 0x54b4ff : 0xff4a3c;
    this.materials.iff = new THREE.MeshBasicMaterial({ color: iffColor, fog: false });
    this.materials.iffGlow = new THREE.MeshBasicMaterial({
      color: iffColor, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const iffMount = this.armR.shoulder;
    // three chevron bars on the outer face of the pauldron
    for (let i = 0; i < 3; i++) {
      const bar = box(0.035, 0.022, 0.10 - i * 0.022, this.materials.iff, 0.093, 0.012 - i * 0.030, 0);
      bar.castShadow = false;
      iffMount.add(bar);
    }
    // soft bloom shell around the bars
    const halo = box(0.055, 0.115, 0.145, this.materials.iffGlow, 0.098, -0.016, 0);
    halo.castShadow = false;
    halo.renderOrder = 2;
    iffMount.add(halo);
    // a matching strip on the back plate, so you can ID someone facing away
    const backTag = box(0.11, 0.030, 0.030, this.materials.iff, 0, 0.245, 0.205);
    backTag.castShadow = false;
    chest.add(backTag);
    // and a strip on the crown of the helmet, visible over low cover
    const helmTag = box(0.085, 0.022, 0.085, this.materials.iff, 0, 0.338, 0);
    helmTag.castShadow = false;
    head.add(helmTag);

    /* ---- legs ---- */
    const makeLeg = (side) => {
      const hip = group(side * 0.13, -0.02, 0);
      const thigh = group();
      thigh.add(box(0.21, L.thigh, 0.23, M.cloth, 0, -L.thigh / 2, 0));
      thigh.add(box(0.225, 0.14, 0.245, M.armor, 0, -L.thigh + 0.09, -0.01)); // knee pad
      hip.add(thigh);
      const knee = group(0, -L.thigh, 0);
      knee.add(box(0.19, L.shin, 0.21, M.cloth, 0, -L.shin / 2, 0));
      thigh.add(knee);
      const ankle = group(0, -L.shin, 0);
      ankle.add(box(0.20, L.foot, 0.30, M.gear, 0, -L.foot / 2, -0.05));
      ankle.add(box(0.21, 0.05, 0.10, M.gear, 0, -0.02, -0.16));
      knee.add(ankle);
      hips.add(hip);
      return { hip, thigh, knee, ankle };
    };
    this.legR = makeLeg(1);
    this.legL = makeLeg(-1);

    this.bones = { hips, spine, chest, neck, head };
    this.juggernautParts = [];
    this.juggernaut = false;
    this._buildJuggernautArmor();

    /* ---- hit boxes (invisible, still raycastable) ---- */
    this.hitboxes = [];
    const hb = (parent, w, h, d, x, y, z, part, mult) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
      m.position.set(x, y, z);
      m.visible = false;
      m.userData.hitPart = part;
      m.userData.hitMult = mult;
      m.userData.rig = this;
      parent.add(m);
      this.hitboxes.push(m);
      return m;
    };
    hb(head, 0.36, 0.40, 0.36, 0, 0.18, 0, 'head', 2.4);
    hb(chest, 0.60, 0.42, 0.40, 0, 0.15, 0, 'chest', 1.0);
    hb(hips, 0.52, 0.34, 0.36, 0, 0.0, 0, 'stomach', 0.95);
    hb(this.armR.upper, 0.24, 0.66, 0.26, 0, -0.30, 0, 'arm', 0.72);
    hb(this.armL.upper, 0.24, 0.66, 0.26, 0, -0.30, 0, 'arm', 0.72);
    hb(this.legR.thigh, 0.28, 0.86, 0.30, 0, -0.42, 0, 'leg', 0.7);
    hb(this.legL.thigh, 0.28, 0.86, 0.30, 0, -0.42, 0, 'leg', 0.7);
    this.setJuggernaut(!!opts.juggernaut);

    /* ---- animation state ---- */
    this.phase = rand(0, TAU);
    this.idleT = rand(0, 10);
    this.hipYaw = 0;
    this.leanZ = 0;
    this.recoil = new Spring(150, 13);
    this.flinch = new Spring(90, 9);
    this.flinchSide = new Spring(90, 9);
    this.aimBlend = 0;
    this.crouchBlend = 0;
    this.slideBlend = 0;
    this.fireHold = 0;
    this.aimRaw = 0;
    this.sprintRaw = 0;
    this._sprintBlend = 0;
    this.speedSmooth = 0;
    this.dead = false;
    this.deadTime = 0;
    this.hitFlash = 0;
    this.footPhaseLast = 0;
    this.onFootstep = null;
    this.ragdoll = null;
    this.weapon = null;
    this.weaponGrip = null;
    this.lowWeaponCarry = false;
    this.pistolWeapon = false;
    this.meleeWeapon = false;
    this.meleeSwingT = 0;
    this.knifeFlipT = 0;
    this.knifeSpin = null;
    this.knifeHandleLeft = null;
    this.knifeHandleRight = null;
    this.weaponBarrels = null;
    this.weaponBarrelSpeed = 0;
    this.weaponVisualTime = 0;
    this.throwableAimBlend = 0;
    this.foregrip = null;
    this.muzzle = null;
    this._tmp = V();
    this._tmpTarget = V();
    this._pole = V();

    // small greebles (pouches, antenna, straps) don't need to cast shadows
    this.root.traverse((o) => {
      const p = o.geometry && o.geometry.parameters;
      if (p && p.width < 0.17 && p.height < 0.17 && p.depth < 0.17) o.castShadow = false;
    });
  }

  _buildJuggernautArmor() {
    const M = this.materials;
    const B = this.bones;
    const add = (parent, mesh) => {
      parent.add(mesh);
      mesh.visible = false;
      mesh.castShadow = true;
      this.juggernautParts.push(mesh);
      return mesh;
    };
    const plate = (parent, w, h, d, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = box(w, h, d, material, x, y, z);
      mesh.rotation.set(rx, ry, rz);
      return add(parent, mesh);
    };

    /* ---- EOD helmet: stepped dome, brow band, small ballistic visor ---- */
    // The silhouette reads as one heavy shell: a narrow top cap stacked on a
    // wider crown, so the head domes instead of box-sitting on the neck.
    plate(B.head, 0.46, 0.24, 0.46, M.jugArmor, 0, 0.28, 0.020);      // crown
    plate(B.head, 0.36, 0.13, 0.38, M.jugArmor, 0, 0.435, 0.025);     // top cap
    plate(B.head, 0.40, 0.045, 0.42, M.jugEdge, 0, 0.385, 0.022);     // cap seam
    plate(B.head, 0.485, 0.095, 0.485, M.jugArmorDark, 0, 0.165, 0.008); // brow band
    // visor: a recessed frame with a single horizontal glass slit
    plate(B.head, 0.32, 0.150, 0.070, M.jugArmorDark, 0, 0.175, -0.230);
    plate(B.head, 0.245, 0.072, 0.030, M.jugVisor, 0, 0.175, -0.256);
    plate(B.head, 0.290, 0.026, 0.050, M.jugEdge, 0, 0.240, -0.238);  // frame lip
    // armoured jaw and cheek pieces under the visor
    plate(B.head, 0.36, 0.125, 0.110, M.jugArmor, 0, 0.072, -0.195);
    plate(B.head, 0.095, 0.230, 0.310, M.jugArmorDark, 0.222, 0.135, 0.012);
    plate(B.head, 0.095, 0.230, 0.310, M.jugArmorDark, -0.222, 0.135, 0.012);
    // rear curtain and the thick blast collar ringing the neck
    plate(B.head, 0.38, 0.170, 0.090, M.jugCloth, 0, 0.055, 0.215);
    plate(B.neck, 0.58, 0.150, 0.50, M.jugArmorDark, 0, 0.050, 0.022);
    plate(B.neck, 0.50, 0.075, 0.44, M.jugEdge, 0, 0.115, 0.022);

    /* ---- torso: layered blast plates over a padded suit ---- */
    plate(B.chest, 0.86, 0.44, 0.52, M.jugCloth, 0, 0.16, 0.018);     // suit bulk
    // main chest plate juts forward and kicks out at the bottom like a wedge
    plate(B.chest, 0.72, 0.30, 0.160, M.jugArmor, 0, 0.240, -0.300, -0.055);
    plate(B.chest, 0.74, 0.060, 0.170, M.jugEdge, 0, 0.378, -0.292);  // top rim
    // segmented abdomen: two overlapping plates that can hinge when he bends
    plate(B.chest, 0.64, 0.130, 0.145, M.jugArmorDark, 0, 0.058, -0.296, 0.07);
    plate(B.chest, 0.56, 0.120, 0.135, M.jugArmor, 0, -0.062, -0.272, 0.15);
    // groin apron hanging off the abdomen, edged along the bottom
    plate(B.chest, 0.320, 0.310, 0.105, M.jugArmorDark, 0, -0.235, -0.205, 0.19);
    plate(B.chest, 0.330, 0.045, 0.115, M.jugEdge, 0, -0.375, -0.168, 0.19);
    // side ribs under the arms
    plate(B.chest, 0.080, 0.340, 0.400, M.jugArmorDark, 0.370, 0.140, 0.020);
    plate(B.chest, 0.080, 0.340, 0.400, M.jugArmorDark, -0.370, 0.140, 0.020);
    // harness straps crossing the plate, with the team lamp on the right
    for (const x of [-0.28, 0.28]) {
      plate(B.chest, 0.095, 0.660, 0.085, M.jugEdge, x, 0.11, -0.300, 0, 0, x > 0 ? -0.12 : 0.12);
    }
    const chestLamp = plate(B.chest, 0.120, 0.052, 0.035, M.jugLight, 0.175, 0.335, -0.352);
    chestLamp.castShadow = false;
    const chestGlow = plate(B.chest, 0.170, 0.085, 0.055, M.jugLightGlow, 0.175, 0.335, -0.355);
    chestGlow.castShadow = false;
    chestGlow.renderOrder = 3;
    // armoured back panel and the bulky rear pack
    plate(B.chest, 0.68, 0.540, 0.170, M.jugArmor, 0, 0.135, 0.315);
    plate(B.chest, 0.52, 0.350, 0.170, M.jugArmorDark, 0, 0.165, 0.465);
    plate(B.chest, 0.40, 0.070, 0.120, M.jugEdge, 0, 0.360, 0.435);
    // pelvic shell and front flap
    plate(B.hips, 0.68, 0.28, 0.48, M.jugArmorDark, 0, 0.01, 0);
    plate(B.hips, 0.38, 0.34, 0.16, M.jugArmor, 0, -0.21, -0.20, 0.20);

    /* ---- limbs: shells over padded fabric ---- */
    for (const [arm, side] of [[this.armR, 1], [this.armL, -1]]) {
      // twin-layer pauldron: a wide cap overlapping the shoulder shell
      plate(arm.shoulder, 0.35, 0.24, 0.37, M.jugArmor, side * 0.078, -0.045, 0);
      plate(arm.shoulder, 0.38, 0.095, 0.40, M.jugEdge, side * 0.078, 0.082, 0);
      plate(arm.shoulder, 0.30, 0.075, 0.34, M.jugArmorDark, side * 0.075, -0.165, 0);
      // bicep shell, elbow cap and the forearm gauntlet's front plate
      plate(arm.upper, 0.25, 0.42, 0.28, M.jugCloth, 0, -0.20, 0);
      plate(arm.upper, 0.27, 0.22, 0.30, M.jugArmor, 0, -0.10, -0.01);
      plate(arm.elbow, 0.28, 0.36, 0.31, M.jugArmorDark, 0, -0.17, 0);
      plate(arm.elbow, 0.24, 0.27, 0.075, M.jugArmor, 0, -0.135, -0.19);
      // a full armoured mitt: bulky enough to read past the forearm gauntlet
      // and against the dark minigun housing, with a lighter knuckle cap
      plate(arm.hand, 0.20, 0.17, 0.23, M.jugEdge, 0, -0.085, -0.02);
      plate(arm.hand, 0.21, 0.075, 0.24, M.jugArmorDark, 0, -0.035, -0.02);
      plate(arm.hand, 0.16, 0.10, 0.06, M.jugArmor, 0, -0.155, -0.06);
      // team lamp strip on the outer shoulder
      const lampX = side * 0.218;
      const lamp = plate(arm.shoulder, 0.052, 0.125, 0.17, M.jugLight, lampX, 0.015, 0);
      lamp.castShadow = false;
      const glow = plate(arm.shoulder, 0.082, 0.17, 0.23, M.jugLightGlow, lampX * 1.02, 0.015, 0);
      glow.castShadow = false;
      glow.renderOrder = 3;
    }

    // thighs, domed knees, shin guards and armoured boot caps
    for (const leg of [this.legR, this.legL]) {
      plate(leg.thigh, 0.36, 0.54, 0.38, M.jugCloth, 0, -0.27, 0);
      plate(leg.thigh, 0.31, 0.35, 0.11, M.jugArmor, 0, -0.28, -0.23);
      plate(leg.thigh, 0.38, 0.25, 0.42, M.jugArmorDark, 0, -0.63, -0.015);
      plate(leg.thigh, 0.31, 0.19, 0.11, M.jugEdge, 0, -0.645, -0.26);
      plate(leg.knee, 0.32, 0.52, 0.33, M.jugCloth, 0, -0.26, 0);
      plate(leg.knee, 0.29, 0.40, 0.11, M.jugArmor, 0, -0.24, -0.21);
      plate(leg.ankle, 0.25, 0.11, 0.35, M.jugArmorDark, 0, -0.035, -0.06);
    }
  }

  setJuggernaut(active) {
    const next = !!active;
    this.juggernaut = next;
    for (const part of this.juggernautParts || []) part.visible = next;
    // The bomb-suit torso is far wider than the plain chest; swing the
    // shoulder roots out past the shell so the arms hang in open air and
    // read as limbs instead of disappearing behind the rib plates.
    const shoulderX = next ? 0.42 : 0.33;
    this.armR.shoulder.position.x = shoulderX;
    this.armL.shoulder.position.x = -shoulderX;
    const activeColors = {
      cloth: 0x4b5642,
      armor: 0x556149,
      helmet: 0x4b5743,
      gear: 0x252d26,
      skin: 0x2c332d,
    };
    for (const key of Object.keys(this.baseAppearance || {})) {
      const material = this.materials[key];
      const base = this.baseAppearance[key];
      material.map = next ? null : base.map;
      material.color.setHex(next ? activeColors[key] : base.color);
      material.needsUpdate = true;
    }
    for (const hitbox of this.hitboxes || []) {
      hitbox.scale.setScalar(next ? 1.22 : 1);
    }
  }

  /** Attach a weapon object to the right hand. */
  attachWeapon(obj, foregripLocal, muzzleLocal, gripLocal) {
    if (this.weapon) this.armR.hand.remove(this.weapon);
    this.weapon = obj;
    this.lowWeaponCarry = obj.name === 'weapon-minigun';
    this.pistolWeapon = obj.userData.pistol === true;
    this.meleeWeapon = obj.userData.melee === true;
    this.meleeSwingT = 0;
    this.knifeFlipT = this.meleeWeapon ? COMBAT_KNIFE_DRAW_SECONDS : 0;
    if (this.knifeGripVisual) this.knifeGripVisual.visible = this.meleeWeapon;
    obj.position.copy(GRIP_OFFSET);
    // Rifle roots are already authored around their pistol grip. The minigun
    // is authored around its gearbox, so offset it until the right rear handle
    // actually lands inside the right hand instead of floating in front of it.
    if ((this.lowWeaponCarry || this.meleeWeapon) && gripLocal) obj.position.sub(gripLocal);
    obj.rotation.set(-GRIP_TILT, 0, 0);
    this.armR.hand.add(obj);
    this.weaponGrip = null;
    if (this.lowWeaponCarry && gripLocal) {
      this.weaponGrip = new THREE.Object3D();
      this.weaponGrip.position.copy(gripLocal);
      obj.add(this.weaponGrip);
    }
    this.weaponBarrels = obj.getObjectByName('minigun-barrels') || null;
    this.knifeSpin = obj.getObjectByName('knife-spin') || null;
    this.knifeHandleLeft = obj.getObjectByName('knife-handle-left') || null;
    this.knifeHandleRight = obj.getObjectByName('knife-handle-right') || null;
    this.weaponBarrelSpeed = 0;

    this.foregrip = null;
    if (!this.meleeWeapon) {
      this.foregrip = new THREE.Object3D();
      this.foregrip.position.copy(foregripLocal || V(0, 0, -0.32));
      obj.add(this.foregrip);
    }

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.copy(muzzleLocal || V(0, 0.02, -0.55));
    obj.add(this.muzzle);
  }

  getMuzzleWorld(out) {
    if (this.muzzle) return this.muzzle.getWorldPosition(out);
    return this.bones.chest.getWorldPosition(out);
  }

  setTint(hexEmissive, intensity) {
    for (const key in this.materials) {
      const m = this.materials[key];
      if (!m.emissive) continue;
      m.emissive.setHex(hexEmissive);
      m.emissiveIntensity = intensity;
    }
  }

  flash(amount = 1) {
    this.hitFlash = Math.max(this.hitFlash, amount);
  }

  hurt(dirLocalX = 0, amount = 1) {
    this.flinch.kick(-amount * 5.5);
    this.flinchSide.kick(dirLocalX * amount * 4.5);
    this.flash(1);
  }

  fireKick(amount = 1) {
    if (this.meleeWeapon) {
      this.meleeSwingT = 0.0001;
      return;
    }
    this.recoil.kick(amount * 9);
  }

  _updateInvulnerability(dt, active) {
    this.invulnerabilityBlend = damp(
      this.invulnerabilityBlend,
      active ? 1 : 0,
      active ? 12 : 8,
      dt
    );
    const visible = this.invulnerabilityBlend > 0.01;
    this.invulnerabilityParticles.visible = visible;
    if (!visible) return;

    this.invulnerabilityTime += dt * 2.4;
    const positions = this.invulnerabilityParticles.geometry.attributes.position.array;
    const count = positions.length / 3;
    for (let i = 0; i < count; i++) {
      const lane = i & 1;
      const phase = i / count;
      const angle = phase * TAU * 2
        + this.invulnerabilityTime * (lane ? 1.15 : -0.9);
      const rise = (phase + this.invulnerabilityTime * (0.055 + lane * 0.012)) % 1;
      const radius = 0.48 + Math.sin(angle * 2.7 + i) * 0.07;
      const o = i * 3;
      positions[o] = Math.cos(angle) * radius;
      positions[o + 1] = 0.08 + rise * 1.75;
      positions[o + 2] = Math.sin(angle) * radius;
    }
    this.invulnerabilityParticles.geometry.attributes.position.needsUpdate = true;
    this.materials.invulnerability.opacity = this.invulnerabilityBlend
      * (0.68 + Math.sin(this.invulnerabilityTime * 4.5) * 0.12);
  }

  /* ------------------------------------------------------------- ragdoll */

  die(hitDir, upKick = 1) {
    if (this.dead) return;
    this.dead = true;
    this.deadTime = 0;
    // topple about the horizontal axis perpendicular to the shot direction
    const len = Math.hypot(hitDir.x, hitDir.z) || 1;
    const dx = hitDir.x / len, dz = hitDir.z / len;
    this.ragdoll = {
      tip: 0,                                   // 0 -> upright, 1 -> flat
      tipVel: (0.5 + Math.random() * 0.5) * upKick,
      axis: V(dz, 0, -dx),
      yaw: this.root.rotation.y,
      baseY: this.root.position.y,
      slide: V(dx * 1.2, 0, dz * 1.2),
      spin: (Math.random() - 0.5) * 1.6,
      bounced: false,
      settle: 0,
      limb: {
        armR: rand(-0.6, 0.6), armL: rand(-0.6, 0.6),
        legR: rand(-0.5, 0.5), legL: rand(-0.5, 0.5),
        head: rand(-0.4, 0.4), chest: rand(-0.3, 0.3),
      },
    };
    this.onFootstep = null;
  }

  _updateRagdoll(dt) {
    const r = this.ragdoll;
    r.tipVel += 5.4 * dt * (1 - r.settle);
    r.tip += r.tipVel * dt;
    if (r.tip >= 1) {
      if (!r.bounced && r.tipVel > 1.4) {
        r.bounced = true;
        r.tip = 1;
        r.tipVel = -r.tipVel * 0.22;
        if (this.onImpact) this.onImpact();
      } else {
        r.tip = 1;
        r.tipVel *= 0.35;
        if (!r.landed) { r.landed = true; if (this.onImpact) this.onImpact(); }
        r.settle = Math.min(1, r.settle + dt * 2.4);
      }
    }
    const t = clamp(r.tip, 0, 1.02);
    const ease = t * t * (3 - 2 * clamp(t, 0, 1));

    // slide along the ground while toppling, then stop
    r.slide.multiplyScalar(Math.exp(-4.5 * dt));
    this.root.position.x += r.slide.x * dt;
    this.root.position.z += r.slide.z * dt;
    r.yaw += r.spin * dt * (1 - ease);

    // tip about the world-space axis perpendicular to the impact
    _q1.setFromAxisAngle(r.axis, ease * Math.PI * 0.5);
    _q2.setFromAxisAngle(_up, r.yaw);
    this.root.quaternion.copy(_q1).multiply(_q2);
    this.root.position.y = r.baseY + Math.sin(clamp(ease, 0, 1) * Math.PI) * 0.06;

    // the body goes limp: joints fall towards a slumped pose with a wobble
    const k = ease;
    const jig = Math.sin(this.deadTime * 22) * Math.exp(-this.deadTime * 4) * 0.25;
    const B = this.bones;
    B.hips.rotation.set(lerp(B.hips.rotation.x, -0.35 * k + jig * 0.4, 0.16), B.hips.rotation.y, 0);
    B.spine.rotation.set(lerp(B.spine.rotation.x, 0.30 * k, 0.14), 0, r.limb.chest * k * 0.5);
    B.chest.rotation.set(lerp(B.chest.rotation.x, 0.25 * k + jig * 0.3, 0.14), r.limb.chest * k, 0);
    B.neck.rotation.set(lerp(B.neck.rotation.x, -0.55 * k + jig, 0.2), 0, 0);
    B.head.rotation.set(lerp(B.head.rotation.x, 0.35 * k, 0.16), r.limb.head * k, r.limb.head * k * 0.6);

    const limp = (joint, tx, tz, sp = 0.14) => {
      joint.rotation.x = lerp(joint.rotation.x, tx, sp);
      joint.rotation.z = lerp(joint.rotation.z, tz, sp);
      joint.rotation.y = lerp(joint.rotation.y, 0, sp);
    };
    limp(this.armR.upper, -0.5 * k + jig * 0.6, 0.9 * k + r.limb.armR * k);
    limp(this.armR.elbow, -0.7 * k - Math.abs(jig), 0);
    limp(this.armL.upper, -0.4 * k - jig * 0.6, -1.0 * k + r.limb.armL * k);
    limp(this.armL.elbow, -0.9 * k - Math.abs(jig), 0);
    limp(this.legR.thigh, 0.55 * k + r.limb.legR * k * 0.6, 0.22 * k);
    limp(this.legR.knee, -0.85 * k - Math.abs(jig) * 0.8, 0);
    limp(this.legL.thigh, 0.35 * k + r.limb.legL * k * 0.6, -0.26 * k);
    limp(this.legL.knee, -1.05 * k - Math.abs(jig) * 0.8, 0);
    this.legR.ankle.rotation.x = lerp(this.legR.ankle.rotation.x, 0.3 * k, 0.14);
    this.legL.ankle.rotation.x = lerp(this.legL.ankle.rotation.x, 0.2 * k, 0.14);
  }

  /* -------------------------------------------------------------- update */

  /**
   * s = { position, yaw, pitch, speed, moveX, moveZ (local, -1..1),
   *       crouch, sliding, aiming, grounded, firing,
   *       throwableState, throwableThrowProgress, throwableThrowFromAim }
   */
  update(dt, s) {
    this.deadTime += dt;
    this.weaponVisualTime += dt;
    this._updateInvulnerability(dt, !!s.invulnerable && !this.dead);
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
      const e = this.hitFlash * 0.9;
      for (const key in this.materials) {
        const m = this.materials[key];
        if (!m.emissive || key === 'visor') continue;
        m.emissive.setRGB(e, e * 0.25, e * 0.2);
      }
    }

    if (this.dead) {
      this._updateRagdoll(dt);
      return;
    }

    if (s.position) this.root.position.copy(s.position);
    this.root.rotation.set(0, s.yaw, 0);

    const B = this.bones;
    const speed = this.speedSmooth = damp(this.speedSmooth, s.speed, 12, dt);
    const crouch = this.crouchBlend = damp(
      this.crouchBlend,
      s.crouch || s.sliding ? 1 : 0,
      13,
      dt
    );
    const slide = this.slideBlend = damp(
      this.slideBlend,
      s.sliding ? 1 : 0,
      s.sliding ? 16 : 9,
      dt
    );
    // A bomb suit moves like a bomb suit: slower cadence, wider stance,
    // heavier footfalls, less upper-body twist - the plates do the talking.
    const heavy = this.juggernaut ? 1 : 0;
    const pitch = clamp(s.pitch || 0, -1.1, 1.1);
    const throwableState = s.throwableState === 'carry'
      || s.throwableState === 'aim'
      || s.throwableState === 'throw'
      ? s.throwableState
      : 'none';
    const throwableActive = throwableState !== 'none' && !this.juggernaut;
    const throwableThrowing = throwableState === 'throw';
    const throwableThrowU = throwableThrowing
      ? clamp(Number(s.throwableThrowProgress) || 0, 0, 1)
      : 0;
    const throwableAimTarget = throwableState === 'aim'
      || (throwableThrowing && s.throwableThrowFromAim)
      ? 1
      : 0;
    this.throwableAimBlend = damp(
      this.throwableAimBlend,
      throwableAimTarget,
      throwableAimTarget > this.throwableAimBlend ? 13 : 9,
      dt
    );

    // Firing is a one-frame event, so it is latched: a burst from the hip
    // should hold the weapon up rather than flicker between two carries.
    if (s.firing) this.fireHold = 0.45;
    this.fireHold = Math.max(0, this.fireHold - dt);
    if (this.meleeSwingT > 0) {
      this.meleeSwingT += dt;
      if (this.meleeSwingT >= 0.56) this.meleeSwingT = 0;
    }
    const meleeU = this.meleeSwingT > 0
      ? clamp(this.meleeSwingT / 0.56, 0, 1)
      : 0;
    const meleeStrike = meleeU > 0
      ? Math.sin(Math.PI * clamp(meleeU / 0.72, 0, 1))
      : 0;
    if (this.knifeFlipT > 0) {
      this.knifeFlipT = Math.max(0, this.knifeFlipT - dt);
    }
    const knifeEquipU = this.knifeFlipT > 0
      ? clamp(1 - this.knifeFlipT / COMBAT_KNIFE_DRAW_SECONDS, 0, 1)
      : 0;
    if (this.knifeSpin) {
      if (this.knifeFlipT > 0) {
        const knifePose = combatKnifeFlipPose(knifeEquipU);
        this.knifeSpin.rotation.set(knifePose.spinX, knifePose.spinY, knifePose.spinZ);
        if (this.knifeHandleLeft) this.knifeHandleLeft.rotation.y = knifePose.handleL;
        if (this.knifeHandleRight) this.knifeHandleRight.rotation.y = knifePose.handleR;
      } else {
        this.knifeSpin.rotation.set(0, 0, 0);
        if (this.knifeHandleLeft) this.knifeHandleLeft.rotation.y = 0;
        if (this.knifeHandleRight) this.knifeHandleRight.rotation.y = 0;
      }
    }
    if (this.weapon?.userData.updateVisual) {
      const extension = this.weapon.userData.laserBlade && this.knifeFlipT > 0
        ? 1 - this.knifeFlipT / COMBAT_KNIFE_DRAW_SECONDS
        : 1;
      this.weapon.userData.updateVisual(this.weaponVisualTime, extension);
    }
    if (this.weaponBarrels) {
      this.weaponBarrelSpeed = damp(
        this.weaponBarrelSpeed,
        this.fireHold > 0 ? 35 : 0,
        this.fireHold > 0 ? 16 : 5,
        dt
      );
      this.weaponBarrels.rotation.z += this.weaponBarrelSpeed * dt;
    }
    const wantReady = !this.meleeWeapon
      && !throwableActive
      && (!!s.aiming || this.fireHold > 0);
    // Damped twice: a single exponential starts at full speed, which reads as a
    // pop when the weapon has half a metre to travel. Chaining two gives an
    // S-curve that leaves and arrives at rest.
    this.aimRaw = damp(this.aimRaw, wantReady ? 1 : 0, 11, dt);
    const aim = this.aimBlend = damp(this.aimBlend, this.aimRaw, 11, dt);

    this.recoil.update(dt);
    this.flinch.update(dt);
    this.flinchSide.update(dt);
    const recoil = this.recoil.value;
    const flinch = this.flinch.value;
    const flinchS = this.flinchSide.value;

    /* ---- locomotion ---- */
    const runRef = 5.4;
    const stride = clamp(speed / runRef, 0, 1.25);
    const cadence = lerp(4.0, 9.2, clamp(speed / runRef, 0, 1)) * (crouch > 0.5 ? 0.75 : 1) * (heavy ? 0.7 : 1);
    if (speed > 0.15) this.phase += cadence * dt;
    else this.phase = damp(this.phase % TAU, Math.round((this.phase % TAU) / Math.PI) * Math.PI, 6, dt);
    const ph = this.phase;
    this.idleT += dt;

    // footstep events on each ground contact
    const stepIndex = Math.floor(ph / Math.PI);
    if (speed > 0.6 && stepIndex !== this.footPhaseLast) {
      this.footPhaseLast = stepIndex;
      if (this.onFootstep) this.onFootstep(speed);
    }

    const fwd = clamp(s.moveZ || 0, -1, 1);
    const side = clamp(s.moveX || 0, -1, 1);
    const swing = 0.78 * stride * (heavy ? 0.85 : 1);
    const sideSwing = (heavy ? 0.56 : 0.42) * stride * Math.abs(side);

    // hips: bob, weight shift, and a yaw offset towards the travel direction
    const bob = -Math.abs(Math.sin(ph)) * 0.055 * (heavy ? 1.35 : 1) * stride;
    const targetHipYaw = clamp(Math.atan2(side, Math.max(0.25, -fwd)) * 0.45, -0.6, 0.6) * stride;
    this.hipYaw = damp(this.hipYaw, targetHipYaw, 7, dt);
    B.hips.position.set(0, L.hip - crouch * (heavy ? 0.27 : 0.34) - slide * 0.35 + bob, 0);
    B.hips.rotation.set(
      -crouch * 0.04 - slide * 0.26 - stride * 0.02,
      this.hipYaw + Math.sin(ph) * 0.10 * stride,
      Math.sin(ph * 2) * 0.045 * (heavy ? 1.5 : 1) * stride + flinchS * 0.1
    );

    // spine / chest: counter-rotate so the weapon keeps pointing down-range
    const breathe = Math.sin(this.idleT * 1.6) * 0.02 * (1 - stride * 0.7) * (1 - heavy * 0.6);
    B.spine.rotation.set(
      -crouch * 0.08 - slide * 0.17 - stride * 0.04 + breathe + flinch * 0.05,
      -this.hipYaw * 0.55,
      -Math.sin(ph) * 0.05 * stride
    );
    B.chest.rotation.set(
      pitch * 0.35 - crouch * 0.04 - slide * 0.21
        - stride * 0.03 + recoil * 0.012 + flinch * 0.08,
      -this.hipYaw * 0.45 + Math.sin(ph) * 0.05 * stride,
      Math.sin(ph + 1.2) * 0.035 * stride + flinchS * 0.05
    );

    // head stabilises on the target, with a little counter-bob
    B.neck.rotation.set(pitch * 0.25 - stride * 0.06, 0, 0);
    B.head.rotation.set(
      pitch * 0.42 - Math.sin(ph * 2) * 0.02 * stride + flinch * 0.16,
      Math.sin(this.idleT * 0.7) * 0.05 * (1 - stride),
      Math.sin(ph) * 0.03 * stride
    );

    /* ---- legs: heel strike -> stance -> toe off ---- */
    const legCycle = (leg, offset, sideSign) => {
      const p = ph + offset;
      const sw = Math.sin(p);
      const lift = Math.max(0, -Math.cos(p));
      leg.thigh.rotation.x = sw * swing + crouch * (heavy ? 0.95 : 0.85) + stride * 0.12;
      leg.thigh.rotation.z = sideSign * (sideSwing * Math.sin(p) + crouch * (heavy ? 0.22 : 0.12) + heavy * 0.05);
      // knee only bends backwards, most during the swing phase
      leg.knee.rotation.x = -(Math.max(0, Math.sin(p - 1.05)) * 1.35 * stride + lift * 0.35 * stride + crouch * (heavy ? 1.25 : 1.5));
      // ankle keeps the foot roughly parallel to the ground
      leg.ankle.rotation.x = -(leg.thigh.rotation.x + leg.knee.rotation.x) * 0.55 + crouch * 0.4 + Math.max(0, sw) * 0.25 * stride;
    };
    legCycle(this.legR, 0, 1);
    legCycle(this.legL, Math.PI, -1);
    if (slide > 0.001) {
      this.legR.hip.position.y = -0.02 + slide * 0.30;
      this.legL.hip.position.y = -0.02 + slide * 0.30;
      this.legR.thigh.rotation.x = lerp(this.legR.thigh.rotation.x, 1.83, slide);
      this.legR.thigh.rotation.z = lerp(this.legR.thigh.rotation.z, 0.16, slide);
      this.legR.knee.rotation.x = lerp(this.legR.knee.rotation.x, -0.10, slide);
      this.legL.thigh.rotation.x = lerp(this.legL.thigh.rotation.x, 1.63, slide);
      this.legL.thigh.rotation.z = lerp(this.legL.thigh.rotation.z, -0.24, slide);
      this.legL.knee.rotation.x = lerp(this.legL.knee.rotation.x, -0.18, slide);
      this.legR.ankle.rotation.x = lerp(this.legR.ankle.rotation.x, 0.12, slide);
      this.legL.ankle.rotation.x = lerp(this.legL.ankle.rotation.x, 0.08, slide);
    } else {
      this.legR.hip.position.y = -0.02;
      this.legL.hip.position.y = -0.02;
    }

    // idle weight shift when standing still
    if (stride < 0.05) {
      const sway = Math.sin(this.idleT * 0.9);
      this.legR.thigh.rotation.z += sway * 0.03;
      this.legL.thigh.rotation.z += sway * 0.03;
      B.hips.rotation.z += sway * 0.02;
    }

    if (!s.grounded) {
      this.legR.thigh.rotation.x = lerp(this.legR.thigh.rotation.x, 0.55, 0.4);
      this.legL.thigh.rotation.x = lerp(this.legL.thigh.rotation.x, 0.2, 0.4);
      this.legR.knee.rotation.x = lerp(this.legR.knee.rotation.x, -1.0, 0.4);
      this.legL.knee.rotation.x = lerp(this.legL.knee.rotation.x, -0.6, 0.4);
    }

    /* ---- arms ----
       Both hands are solved by IK onto the weapon rather than posed by hand,
       and the weapon's own orientation is then corrected so the barrel points
       exactly where the soldier is looking. That keeps the gun, the hands and
       the eyeline agreed with each other in every stance and at every pitch. */

    const sprintTarget = s.sprinting && !wantReady && !throwableActive ? 1 : 0;
    this.sprintRaw = damp(this.sprintRaw, sprintTarget, 9, dt);
    const sprint = this._sprintBlend = damp(this._sprintBlend, this.sprintRaw, 9, dt);

    // three carries, blended by weight - never a hard switch
    const carry = this.lowWeaponCarry
      ? MINIGUN_CARRY
      : this.meleeWeapon
        ? KNIFE_CARRY
        : this.pistolWeapon
          ? PISTOL_CARRY
          : CARRY;
    const wSprint = sprint;
    const wAim = aim * (1 - sprint);
    const wPatrol = Math.max(0, 1 - wSprint - wAim);
    const mix = (key, prop) => carry.patrol[key][prop] * wPatrol
      + carry.aim[key][prop] * wAim + carry.sprint[key][prop] * wSprint;
    const mixN = (prop) => carry.patrol[prop] * wPatrol
      + carry.aim[prop] * wAim + carry.sprint[prop] * wSprint;

    // Negative X is forward in this rig. The old positive sprint offsets made
    // every runner visibly recline; keep the centre of mass over the feet.
    B.spine.rotation.x -= sprint * (heavy ? 0.18 : 0.10);
    B.chest.rotation.x += pitch * (0.16 * wAim) - sprint * (heavy ? 0.10 : 0.06);
    B.chest.rotation.y -= wAim * (heavy ? 0.26 : 0.30) + wPatrol * (heavy ? 0.08 : 0.12); // blade the shoulders
    B.head.rotation.z += wAim * (heavy ? 0.05 : 0.10);  // cheek towards the stock

    // where the trigger hand goes, in chest space
    const armSwing = Math.sin(ph) * stride * (heavy ? 0.55 : 1);
    this._tmpTarget.set(
      mix('hand', 'x') + armSwing * 0.012,
      mix('hand', 'y') - Math.abs(Math.sin(ph)) * 0.018 * stride + flinch * 0.02,
      mix('hand', 'z') + armSwing * 0.05 * sprint + recoil * 0.008
    );
    let throwableRelease = 0;
    if (throwableActive) {
      if (throwableThrowing) {
        const throwStart = this._tmp.lerpVectors(
          THROWABLE_HAND_CARRY,
          THROWABLE_HAND_AIM,
          s.throwableThrowFromAim ? 1 : this.throwableAimBlend
        );
        if (throwableThrowU < 0.36) {
          const u = clamp(throwableThrowU / 0.36, 0, 1);
          const eased = u * u * (3 - 2 * u);
          this._tmpTarget.lerpVectors(throwStart, THROWABLE_HAND_RELEASE, eased);
          throwableRelease = eased;
        } else {
          const u = clamp((throwableThrowU - 0.36) / 0.64, 0, 1);
          const eased = u * u * (3 - 2 * u);
          this._tmpTarget.lerpVectors(
            THROWABLE_HAND_RELEASE,
            THROWABLE_HAND_RECOVER,
            eased
          );
          throwableRelease = 1 - eased;
        }
      } else {
        this._tmpTarget.lerpVectors(
          THROWABLE_HAND_CARRY,
          THROWABLE_HAND_AIM,
          this.throwableAimBlend
        );
        if (s.sprinting && throwableState === 'carry') {
          this._tmpTarget.y -= 0.09;
          this._tmpTarget.z += 0.04;
        }
        this._tmpTarget.x += armSwing * 0.018;
      }
    } else if (this.meleeWeapon && meleeU > 0) {
      // Wind outside the right shoulder, drive across and slightly down, then
      // recover to the hip. The right wrist remains the only weapon parent.
      const sweep = Math.sin(Math.PI * meleeU);
      this._tmpTarget.x += lerp(0.16, -0.34, clamp(meleeU * 1.55, 0, 1)) * sweep;
      this._tmpTarget.y += (0.10 - meleeU * 0.20) * sweep;
      this._tmpTarget.z -= meleeStrike * 0.25;
    }
    if (!throwableActive && this.meleeWeapon && this.knifeFlipT > 0) {
      const flourish = Math.sin(Math.PI * knifeEquipU);
      this._tmpTarget.x += Math.sin(knifeEquipU * Math.PI * 2) * 0.055 * flourish;
      this._tmpTarget.y += 0.065 * flourish;
      this._tmpTarget.z += 0.035 * flourish;
    }
    this._pole.set(0.78, -0.52, 0.42).normalize();
    solveTwoBoneIK(this.armR.shoulder, this.armR.elbow, L.upperArm, L.forearm, this._tmpTarget, this._pole);
    this.armR.upper.quaternion.copy(this.armR.shoulder.quaternion);
    this.armR.shoulder.quaternion.identity();

    /* ---- point the barrel ---- */
    // Chest-space orientation the weapon should end up with. Because it is
    // built from the blend weights it is continuous across carry changes.
    const look = mixN('look');
    if (throwableActive) {
      _euler.set(
        -0.08 - this.throwableAimBlend * 0.16 - throwableRelease * 0.48,
        -this.throwableAimBlend * 0.14 + throwableRelease * 0.10,
        -0.12 - this.throwableAimBlend * 0.16 - throwableRelease * 0.18,
        'YXZ'
      );
    } else {
      _euler.set(
        pitch * look + mixN('pitch') - recoil * 0.05 - flinch * 0.05,
        mixN('yaw') + flinchS * 0.06,
        mixN('roll'),
        'YXZ'
      );
    }
    if (!throwableActive && this.meleeWeapon && meleeU > 0) {
      _euler.x += meleeStrike * 0.34;
      _euler.y += Math.sin(Math.PI * meleeU) * 1.22;
      _euler.z -= Math.sin(Math.PI * meleeU) * 1.05;
    }
    if (!throwableActive && this.meleeWeapon && this.knifeFlipT > 0) {
      const flourish = Math.sin(Math.PI * knifeEquipU);
      _euler.x += Math.sin(knifeEquipU * Math.PI * 2) * 0.16 * flourish;
      _euler.y += Math.sin(knifeEquipU * Math.PI * 2) * 0.24 * flourish;
      _euler.z += Math.sin(knifeEquipU * Math.PI * 4) * 0.20 * flourish;
    }
    _qWant.setFromEuler(_euler);
    if (this.weapon) {
      // elbow orientation, walked down the bone chain (cheaper than a full
      // matrix update, and we need it before the weapon can be placed)
      _q1.copy(B.hips.quaternion).multiply(B.spine.quaternion).multiply(B.chest.quaternion)
        .multiply(this.armR.upper.quaternion).multiply(this.armR.elbow.quaternion);
      // hand = want * gripTilt, expressed relative to the elbow
      _q2.setFromAxisAngle(_xAxis, GRIP_TILT);
      _q3.copy(_qWant).multiply(_q2);
      this.armR.hand.quaternion.copy(_q1.invert()).multiply(_q3);
    } else {
      this.armR.hand.rotation.set(-0.15, 0.1, 0);
    }

    /* ---- support hand ---- */
    if (throwableActive) {
      const leftNeedsAim = this.throwableAimBlend > 0.02 || throwableThrowing;
      if (leftNeedsAim) {
        if (throwableThrowing) {
          _support.lerpVectors(
            THROWABLE_LEFT_AIM,
            THROWABLE_LEFT_RECOVER,
            clamp(throwableThrowU / 0.62, 0, 1)
          );
        } else {
          _support.lerpVectors(
            THROWABLE_LEFT_RECOVER,
            THROWABLE_LEFT_AIM,
            this.throwableAimBlend
          );
        }
        this._pole.set(-0.60, -0.64, 0.34).normalize();
        solveTwoBoneIK(
          this.armL.shoulder,
          this.armL.elbow,
          L.upperArm,
          L.forearm,
          _support,
          this._pole
        );
        this.armL.upper.quaternion.copy(this.armL.shoulder.quaternion);
        this.armL.shoulder.quaternion.identity();
        this.armL.hand.rotation.set(-0.24, 0.08, -0.12);
      } else {
        this.armL.upper.rotation.set(
          0.28 + pitch * 0.16 + armSwing * 0.28,
          0.16,
          -0.34
        );
        this.armL.elbow.rotation.set(1.34, 0, 0);
        this.armL.hand.rotation.set(-0.12, 0.04, 0);
      }
    } else if (this.foregrip) {
      this.root.updateMatrixWorld(true);
      (this.weaponGrip || this.weapon).getWorldPosition(_gripW);
      this.foregrip.getWorldPosition(_fgW);
      B.chest.worldToLocal(_gripW);
      B.chest.worldToLocal(_fgW);
      // The foregrip is often further than the left arm can stretch. Rather
      // than leave the hand hanging in space, slide it back down the
      // handguard until it is somewhere the arm can actually reach.
      const shoulder = this.armL.shoulder.position;
      // The bomb-suit shell pushes the M134 a touch further out; let the
      // heavy support arm stretch a few percent past the normal reach
      // instead of sliding halfway back down the handguard.
      const reach = (L.upperArm + L.forearm) * (this.juggernaut ? 1.10 : 0.97);
      _support.copy(_fgW);
      for (const t of [1, 0.82, 0.64, 0.46, 0.28]) {
        _support.lerpVectors(_gripW, _fgW, t);
        this.supportT = t;
        if (_support.distanceTo(shoulder) <= reach) break;
      }
      this._pole.set(-0.72, -0.58, 0.38).normalize();
      solveTwoBoneIK(this.armL.shoulder, this.armL.elbow, L.upperArm, L.forearm, _support, this._pole);
      // shoulder group carries the aim, `upper` stays identity in this path
      this.armL.upper.quaternion.copy(this.armL.shoulder.quaternion);
      this.armL.shoulder.quaternion.identity();
      this.armL.hand.rotation.set(-0.35, 0, 0);
    } else {
      this.armL.upper.rotation.set(0.35 + pitch * 0.4 + sprint * 0.6, 0.25, -0.4);
      this.armL.elbow.rotation.set(1.5 + sprint * 0.5, 0, 0);
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const key in this.materials) this.materials[key].dispose();
  }
}
