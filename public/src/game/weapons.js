// Weapon definitions + box-built models. Local space: barrel points down -Z,
// origin sits in the shooting hand, so the same model works as a viewmodel and
// in a bot's hand.
import * as THREE from '../../vendor/three.module.js';
import { clamp, lerp } from '../core/math.js';
import { customConfig } from "../fx/custom.js";
import {
  COMBAT_KNIFE_COOLDOWN_SECONDS,
  COMBAT_KNIFE_DAMAGE,
  COMBAT_KNIFE_HIT_SECONDS,
  COMBAT_KNIFE_RANGE,
  COMBAT_KNIFE_SWING_SECONDS,
} from './melee.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Accuracy bloom contributed by accumulated automatic-fire recoil. Shared by
// PVE and the authoritative PVP server so visual prediction cannot drift.
export const RECOIL_BLOOM_SPREAD = 0.001875;

export const WEAPON_DEFS = {
  rifle: {
    id: 'rifle',
    name: 'VK-74',
    cls: 'ASSAULT RIFLE',
    auto: true,
    damage: 25,
    rpm: 700,
    mag: 30,
    reserve: 180,
    pellets: 1,
    spreadHip: 0.036,
    spreadAds: 0.005,
    spreadMove: 0.030,
    recoilV: 1.15,
    aimKickUp: 0.0095,
    recoilH: 0.42,
    kick: 1.0,
    adsTime: 0.20,
    adsFov: 0.72,
    reloadTime: 2.25,
    reloadEmptyTime: 2.75,
    range: 70,
    minDamage: 0.62,
    moveMult: 1.0,
    sound: { kind: 'rifle', body: 150, bright: 3600, dur: 0.17, gain: 0.55, tail: true },
    hipPos: V(0.135, -0.135, -0.42),
    hipRot: V(0.015, -0.055, 0.02),
    sightHeight: 0.177,
    adsZ: -0.30,
  },
  smg: {
    id: 'smg',
    name: 'WASP-9',
    cls: 'SUBMACHINE GUN',
    auto: true,
    damage: 17,
    rpm: 940,
    mag: 32,
    reserve: 224,
    pellets: 1,
    spreadHip: 0.042,
    spreadAds: 0.011,
    spreadMove: 0.026,
    recoilV: 0.78,
    aimKickUp: 0.0042,
    recoilH: 0.55,
    kick: 0.72,
    adsTime: 0.15,
    adsFov: 0.80,
    reloadTime: 1.85,
    reloadEmptyTime: 2.3,
    range: 40,
    minDamage: 0.5,
    moveMult: 1.08,
    sound: { kind: 'smg', body: 190, bright: 3100, dur: 0.12, gain: 0.44 },
    hipPos: V(0.128, -0.125, -0.38),
    hipRot: V(0.02, -0.06, 0.02),
    sightHeight: 0.1608,       // reflex dot height; see reflexSight()
    adsZ: -0.28,
  },
  machine_pistol: {
    id: 'machine_pistol',
    name: 'VX-9 AUTO',
    cls: 'MACHINE PISTOL',
    auto: true,
    pistol: true,
    damage: 15.4,
    rpm: 1100,
    mag: 20,
    reserve: 120,
    pellets: 1,
    spreadHip: 0.0624,
    spreadAds: 0.0138,
    spreadMove: 0.028,
    recoilV: 0.68,
    aimKickUp: 0.0036,
    recoilH: 0.75,
    kick: 0.62,
    adsTime: 0.12,
    adsFov: 0.84,
    reloadTime: 1.55,
    reloadEmptyTime: 1.90,
    range: 28,
    minDamage: 0.44,
    moveMult: 1.12,
    sound: { kind: 'machine_pistol', body: 215, bright: 3200, dur: 0.09, gain: 0.39 },
    hipPos: V(0.145, -0.145, -0.36),
    hipRot: V(0.025, -0.055, 0.025),
    sightHeight: 0.156,
    adsZ: -0.275,
    // sidearm run: tucked inward and canted up instead of the rifle high-port
    sprintPos: V(0.105, -0.175, -0.295),
    sprintRot: V(0.35, 0.45, -0.30),
  },
  desert_eagle: {
    id: 'desert_eagle',
    name: 'DESERT EAGLE',
    cls: '.50 MAGNUM',
    auto: false,
    pistol: true,
    damage: 78,
    rpm: 240,
    mag: 7,
    reserve: 35,
    pellets: 1,
    spreadHip: 0.052,
    spreadAds: 0.004,
    spreadMove: 0.030,
    recoilV: 3.2,
    aimKickUp: 0.042,
    recoilH: 1.2,
    kick: 2.45,
    adsTime: 0.20,
    adsFov: 0.80,
    reloadTime: 2.05,
    reloadEmptyTime: 2.45,
    range: 58,
    minDamage: 0.60,
    moveMult: 1.04,
    sound: { kind: 'magnum', body: 92, bright: 3600, dur: 0.24, gain: 0.72, tail: true },
    hipPos: V(0.155, -0.155, -0.36),
    hipRot: V(0.025, -0.055, 0.025),
    sightHeight: 0.205,
    adsZ: -0.275,
    sprintPos: V(0.130, -0.205, -0.315),
    sprintRot: V(0.30, 0.52, -0.34),
  },
  shotgun: {
    id: 'shotgun',
    name: 'BREACH-12',
    cls: 'PUMP SHOTGUN',
    auto: false,
    damage: 14,
    rpm: 72,
    mag: 6,
    reserve: 42,
    pellets: 18,
    spreadHip: 0.05625,
    spreadAds: 0.036,
    spreadMove: 0.02,
    recoilV: 3.0,
    aimKickUp: 0.038,
    recoilH: 0.9,
    kick: 2.4,
    adsTime: 0.26,
    adsFov: 0.88,
    reloadTime: 0.55,          // per shell
    reloadEmptyTime: 0.55,
    shellReload: true,
    pumpTime: 0.62,
    range: 18,
    minDamage: 0.22,
    moveMult: 0.94,
    sound: { kind: 'shotgun', body: 105, bright: 2600, dur: 0.3, gain: 0.75, tail: true },
    hipPos: V(0.14, -0.14, -0.42),
    hipRot: V(0.01, -0.05, 0.02),
    sightHeight: 0.104,
    adsZ: -0.30,
  },
  sniper: customConfig.sniperConfigBuild(V),
  railgun: {
    id: 'railgun',
    name: 'ARC-7 LASER CANNON',
    cls: 'CHARGED BEAM WEAPON',
    auto: false, //
    damage: 300,
    rpm: 60, //
    mag: 1, //
    reserve: 7, //
    pellets: 1,
    spreadHip: 0.078,
    spreadAds: 0.0004,
    spreadMove: 0.046,
    recoilV: 5.0, //
    aimKickUp: 0.096, //
    recoilH: 0.65, //
    kick: 3.6,
    adsTime: 0.36, //
    adsFov: 0.26,
    scope: true,
    squareScope: true,
    reloadTime: 3.4, //
    reloadEmptyTime: 3.8,
    range: 170,
    minDamage: 1,
    moveMult: 0.84, //
    adsRequired: true, //
    chargeTime: 1,
    piercesWorld: true,
    limitedRewardAmmo: true,
    reloadEachShot: true, //
    retainsCases: true,
    sound: { kind: 'railgun', body: 62, bright: 5600, dur: 0.46, gain: 0.95, tail: true },
    hipPos: V(0.150, -0.145, -0.47),
    hipRot: V(0.015, -0.05, 0.02),
    sightHeight: 0.175,
    adsZ: -0.33,
  },
  minigun: {
    id: 'minigun',
    name: 'M134 VULCAN',
    cls: 'JUGGERNAUT MINIGUN',
    auto: true,
    damage: 18,
    rpm: 1080,
    mag: 1200,
    reserve: 0,
    pellets: 1,
    spreadHip: 0.034,
    spreadAds: 0.016,
    spreadMove: 0.028,
    recoilV: 0.46,
    recoilH: 0.38,
    kick: 0.48,
    adsTime: 0.30,
    adsFov: 0.88,
    reloadTime: 5.2,
    reloadEmptyTime: 5.6,
    noReload: true,
    spinUpTime: 0.5,
    range: 78,
    minDamage: 0.56,
    moveMult: 0.62,
    sound: { kind: 'minigun', body: 112, bright: 3300, dur: 0.10, gain: 0.50, tail: true },
    // This is suspended from its twin rear handles at the hip rather than
    // shouldered like a rifle. ADS tightens the view slightly but deliberately
    // leaves the receiver below the centre of the screen.
    lowCarry: true,
    hipPos: V(0.26, -0.40, -0.70),
    hipRot: V(0.020, -0.08, 0.020),
    adsPos: V(0.18, -0.34, -0.58),
    adsRot: V(0.010, -0.04, 0.015),
    sightHeight: 0.105,
    adsZ: -0.34,
  },
  combat_knife: {
    id: 'combat_knife',
    name: 'COMBAT KNIFE',
    cls: 'MELEE',
    auto: false,
    melee: true,
    oneHanded: true,
    damage: COMBAT_KNIFE_DAMAGE,
    rpm: 60 / COMBAT_KNIFE_COOLDOWN_SECONDS,
    mag: 0,
    reserve: 0,
    pellets: 1,
    spreadHip: 0,
    spreadAds: 0,
    spreadMove: 0,
    recoilV: 0,
    recoilH: 0,
    kick: 0,
    adsTime: 0.12,
    adsFov: 1,
    reloadTime: 0,
    reloadEmptyTime: 0,
    range: COMBAT_KNIFE_RANGE,
    minDamage: 1,
    moveMult: 1.08,
    swingTime: COMBAT_KNIFE_SWING_SECONDS,
    hitTime: COMBAT_KNIFE_HIT_SECONDS,
    hipPos: V(0.225, -0.135, -0.52),
    hipRot: V(0.06, 0.04, 0.16),
    sightHeight: 0,
    adsZ: -0.39,
  },
  laser_blade: {
    id: 'laser_blade',
    name: 'LASER SHORT BLADE',
    cls: 'MELEE',
    auto: false,
    melee: true,
    laserBlade: true,
    oneHanded: true,
    damage: COMBAT_KNIFE_DAMAGE,
    rpm: 60 / COMBAT_KNIFE_COOLDOWN_SECONDS,
    mag: 0,
    reserve: 0,
    pellets: 1,
    spreadHip: 0,
    spreadAds: 0,
    spreadMove: 0,
    recoilV: 0,
    recoilH: 0,
    kick: 0,
    adsTime: 0.12,
    adsFov: 1,
    reloadTime: 0,
    reloadEmptyTime: 0,
    range: COMBAT_KNIFE_RANGE,
    minDamage: 1,
    moveMult: 1.08,
    swingTime: COMBAT_KNIFE_SWING_SECONDS,
    hitTime: COMBAT_KNIFE_HIT_SECONDS,
    hipPos: V(0.225, -0.135, -0.52),
    hipRot: V(0.06, 0.04, 0.16),
    sightHeight: 0,
    adsZ: -0.39,
  },
};

// New entries are appended so existing compact PVP weapon codes never change.
export const WEAPON_ORDER = [
  'rifle', 'smg', 'shotgun', 'sniper', 'minigun', 'combat_knife', 'laser_blade',
  'machine_pistol', 'desert_eagle', 'railgun',
];

/** Current player bullet-cone half-angle in radians. */
export function playerWeaponSpread(def, {
  adsBlend = 0,
  moveSpeed = 0,
  grounded = true,
  crouching = false,
  recoilAccum = 0,
} = {}) {
  if (def?.melee) return 0;
  const ads = clamp(adsBlend, 0, 1);
  // A settled sniper scope is perfectly true: no cone, bloom or movement tax.
  if (def.scope && ads > 0.86) return 0;
  const base = lerp(def.spreadHip, def.spreadAds, ads);
  const move = def.spreadMove * clamp(moveSpeed / 5.2, 0, 1) * (1 - ads * 0.45);
  const air = grounded ? 0 : 0.05 * (1 - ads * 0.4);
  const crouchBonus = crouching ? 0.82 : 1;
  const adsCut = def.id === 'shotgun' ? 0.8 : 0.5;
  return ((base + move + air) * crouchBonus + recoilAccum * RECOIL_BLOOM_SPREAD)
    * lerp(1, adsCut, ads);
}

/* ------------------------------------------------------------- materials */

function matCache(textures) {
  if (!textures.__weaponMats) {
    const mk = (map, color, shininess = 22) =>
      new THREE.MeshPhongMaterial({ map, color, shininess, specular: 0x30363c, flatShading: false });
    textures.__weaponMats = {
      black: mk(textures.gunBlack, 0xffffff),
      metal: mk(textures.gunmetal, 0xffffff, 34),
      tan: mk(textures.gunTan, 0xffffff, 14),
      grip: mk(textures.grip, 0xffffff, 8),
      wood: new THREE.MeshPhongMaterial({ color: 0x8a5426, shininess: 14, specular: 0x3a2a1a }),
      bakelite: new THREE.MeshPhongMaterial({ color: 0x9e5c22, shininess: 30, specular: 0x553818 }),
      lightMetal: new THREE.MeshPhongMaterial({
        color: 0xc6c9cb,
        shininess: 38,
        specular: 0x747b80,
        flatShading: true,
      }),
      silver: new THREE.MeshPhongMaterial({
        color: 0xe0e3e5,
        shininess: 72,
        specular: 0xd5dce0,
        flatShading: true,
      }),
      dark: new THREE.MeshPhongMaterial({ color: 0x15181c, shininess: 6 }),
      brass: new THREE.MeshPhongMaterial({ color: 0xc79a4a, shininess: 60, specular: 0x8a7040 }),
      blade: new THREE.MeshPhongMaterial({
        color: 0x7f898e, shininess: 88, specular: 0xd5e0e5, flatShading: true,
      }),
      glass: new THREE.MeshPhongMaterial({ color: 0x1c3a4a, shininess: 90, specular: 0x88bbdd, emissive: 0x081824 }),
      // reflex window: nearly invisible glass, PUBG-clear
      reflex: new THREE.MeshPhongMaterial({
        color: 0x3a6a80, shininess: 110, specular: 0xbbddff, emissive: 0x081820,
        transparent: true, opacity: 0.22, depthWrite: false,
      }),
      dot: new THREE.MeshBasicMaterial({ color: 0xff3322, fog: false }),
      dotGlow: new THREE.MeshBasicMaterial({
        color: 0xff6644, transparent: true, opacity: 0.24,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }),
      glove: new THREE.MeshLambertMaterial({ color: 0x343a40 }),
      sleeveBlue: new THREE.MeshLambertMaterial({ map: textures.camoBlue }),
      sleeveRed: new THREE.MeshLambertMaterial({ map: textures.camoRed }),
    };
  }
  return textures.__weaponMats;
}

function P(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

/**
 * Parts behind the shooter's eye (stock, cheek riser, buffer tube). When
 * aiming, the camera sits at the cheek weld, so these would fill the screen
 * from the inside - every FPS hides them. Build them into this group.
 */
function rearGroup(g) {
  const r = new THREE.Group();
  r.name = 'rear';
  g.add(r);
  return r;
}

function Cyl(parent, r1, r2, h, seg, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

function Torus(parent, radius, tube, radialSegments, tubularSegments, mat,
  x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments),
    mat
  );
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/**
 * Extrude a deliberately low-poly side silhouette across the weapon's X
 * thickness. `points` are [z, y] pairs in weapon-local space. One-segment
 * bevels catch the viewmodel light without turning the model into a smooth
 * PBR asset, which keeps these shapes in Pixel Ops' chunky visual language.
 */
function Profile(parent, points, depth, mat, bevel = 0.003) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: bevel > 0,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
  });
  geometry.translate(0, 0, -depth * 0.5);
  geometry.rotateY(-Math.PI * 0.5);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mat);
  parent.add(mesh);
  return mesh;
}

/**
 * Extruded side profile with a cut-out. Used for recognisable open pieces
 * such as a pistol trigger guard, where arranging four unrelated cuboids
 * cannot reproduce the supplied silhouette.
 */
function ProfileRing(parent, outline, hole, depth, mat, bevel = 0.002) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    shape.lineTo(outline[i][0], outline[i][1]);
  }
  shape.closePath();
  const cutout = new THREE.Path();
  cutout.moveTo(hole[0][0], hole[0][1]);
  for (let i = 1; i < hole.length; i++) {
    cutout.lineTo(hole[i][0], hole[i][1]);
  }
  cutout.closePath();
  shape.holes.push(cutout);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: bevel > 0,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
  });
  geometry.translate(0, 0, -depth * 0.5);
  geometry.rotateY(-Math.PI * 0.5);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mat);
  parent.add(mesh);
  return mesh;
}

/**
 * Reflex (red-dot) sight clamped to the top rail. `railY` is the rail's top
 * face and `z` where the sight sits along the receiver.
 *
 * Returns the height of the dot, which is what `sightHeight` has to be: the
 * ADS pose slides the weapon down by exactly that much, so whatever this
 * function puts the dot at ends up on the middle of the screen.
 */
function reflexSight(parent, M, detail, railY, z, s = 1) {
  // PUBG-style red dot: a WIDE, flat window - clearly landscape, never
  // square - with a thin frame whose horizontals ease into the verticals
  // through 45-degree chamfers. The dot height (railY + 0.042) is
  // load-bearing: sightHeight in the weapon defs depends on it.
  const eye = railY + 0.042 * s;
  const bodyZ = z - 0.010 * s;
  const D = 0.012 * s;                // housing depth - a plate, not a tube
  P(parent, 0.026 * s, 0.014 * s, 0.062 * s, M.black, 0, railY + 0.007 * s, z);     // low mount
  P(parent, 0.010 * s, 0.012 * s, 0.020 * s, M.black, 0, railY + 0.018 * s, bodyZ); // neck
  // thin frame: short verticals, long horizontals...
  P(parent, 0.004 * s, 0.030 * s, D, M.black, 0.030 * s, eye, bodyZ);
  P(parent, 0.004 * s, 0.030 * s, D, M.black, -0.030 * s, eye, bodyZ);
  P(parent, 0.048 * s, 0.004 * s, D, M.black, 0, eye + 0.019 * s, bodyZ);
  P(parent, 0.048 * s, 0.005 * s, D, M.black, 0, eye - 0.0185 * s, bodyZ);
  // ...joined by 45-degree chamfers, so each corner reads as a curve
  for (const cx of [1, -1]) {
    for (const cy of [1, -1]) {
      P(parent, 0.0045 * s, 0.014 * s, D, M.black,
        cx * 0.0285 * s, eye + cy * 0.0165 * s, bodyZ, 0, 0, cx * cy * Math.PI / 4);
    }
  }
  // controls on the right rail, battery cap on the left
  P(parent, 0.010 * s, 0.010 * s, 0.010 * s, M.metal, 0.028 * s, eye - 0.006 * s, z - 0.002 * s);
  P(parent, 0.009 * s, 0.012 * s, 0.009 * s, M.metal, -0.028 * s, eye - 0.008 * s, z - 0.002 * s);
  // wide clear glass with a tiny dot floating just behind it
  P(parent, 0.056 * s, 0.034 * s, 0.003 * s, M.reflex, 0, eye, bodyZ - 0.003 * s, 0.06, 0, 0);
  P(parent, 0.002 * s, 0.002 * s, 0.002 * s, M.dot, 0, eye, bodyZ + 0.001 * s);
  if (detail) P(parent, 0.005 * s, 0.005 * s, 0.002 * s, M.dotGlow, 0, eye, bodyZ + 0.002 * s);
  return eye;
}

/* ---------------------------------------------------------------- models */

function buildRifle(g, M, detail) {
  // AK-74: stamped receiver with a smooth dust cover, wood furniture, a long
  // curved bakelite 5.45 magazine and the unmistakable two-window muzzle
  // brake. The bore line stays at y = 0.088 and the grip/foregrip/eject
  // anchors keep their old values, so poses, hands and shell ejection carry
  // over unchanged.
  P(g, 0.052, 0.080, 0.36, M.black, 0, 0.055, -0.04);            // receiver
  P(g, 0.056, 0.020, 0.315, M.black, 0, 0.103, -0.0325);         // dust cover
  // rear tangent leaf on its raised base, ahead of the cover's midpoint
  P(g, 0.034, 0.014, 0.052, M.black, 0, 0.117, -0.178);
  P(g, 0.028, 0.005, 0.048, M.metal, 0, 0.127, -0.176, -0.08);
  if (detail) {
    P(g, 0.006, 0.012, 0.008, M.metal, 0.009, 0.130, -0.155);
    P(g, 0.006, 0.012, 0.008, M.metal, -0.009, 0.130, -0.155);
  }
  // Optic: a side-rail bracket rises from the left dovetail plate and over
  // the dust cover, so the reflex dot stays on the unchanged 0.177 sight
  // line that sightHeight depends on.
  P(g, 0.006, 0.075, 0.13, M.metal, -0.029, 0.085, -0.03);       // dovetail plate
  P(g, 0.052, 0.012, 0.10, M.metal, -0.012, 0.117, -0.045);      // bracket arm
  P(g, 0.030, 0.024, 0.066, M.black, 0, 0.124, -0.055);          // riser
  reflexSight(g, M, detail, 0.135, -0.055);
  // Wooden lower handguard with palm swells, plus the upper guard over the
  // gas tube. Metal ferrules close both ends of the wood.
  Profile(g, [
    [-0.205, 0.095],
    [-0.425, 0.095],
    [-0.446, 0.072],
    [-0.448, 0.044],
    [-0.418, 0.024],
    [-0.340, 0.014],
    [-0.300, 0.016],
    [-0.245, 0.026],
    [-0.215, 0.034],
    [-0.205, 0.062],
  ], 0.058, M.wood, 0.003);
  P(g, 0.054, 0.052, 0.024, M.metal, 0, 0.060, -0.210);          // rear ferrule
  P(g, 0.056, 0.060, 0.020, M.metal, 0, 0.058, -0.440);          // front ferrule
  P(g, 0.052, 0.036, 0.225, M.wood, 0, 0.111, -0.315);           // upper handguard
  P(g, 0.036, 0.012, 0.210, M.wood, 0, 0.132, -0.310);
  P(g, 0.030, 0.062, 0.042, M.metal, 0, 0.104, -0.445);          // gas block
  if (detail) {
    // both guards carry the classic pair of longitudinal finger grooves
    for (const sx of [1, -1]) {
      P(g, 0.003, 0.012, 0.170, M.dark, sx * 0.0295, 0.052, -0.312);
      P(g, 0.003, 0.010, 0.180, M.dark, sx * 0.0265, 0.111, -0.315);
    }
  }
  // barrel, hooded front post and the cleaning rod underneath
  Cyl(g, 0.0105, 0.0105, 0.155, 8, M.metal, 0, 0.088, -0.525, Math.PI / 2, 0, 0);
  Cyl(g, 0.014, 0.014, 0.022, 8, M.metal, 0, 0.088, -0.576, Math.PI / 2, 0, 0);
  P(g, 0.028, 0.030, 0.026, M.metal, 0, 0.096, -0.578);
  P(g, 0.008, 0.036, 0.008, M.metal, 0, 0.122, -0.578);
  if (detail) {
    P(g, 0.006, 0.030, 0.020, M.metal, 0.013, 0.118, -0.578);
    P(g, 0.006, 0.030, 0.020, M.metal, -0.013, 0.118, -0.578);
  }
  Cyl(g, 0.0032, 0.0032, 0.36, 6, M.metal, 0, 0.0755, -0.40, Math.PI / 2, 0, 0);
  // The AK-74 brake: a long cylinder with two large side windows and a
  // stepped front cap - nothing else on the field looks like it.
  Cyl(g, 0.013, 0.013, 0.014, 8, M.metal, 0, 0.088, -0.608, Math.PI / 2, 0, 0);
  Cyl(g, 0.0145, 0.0145, 0.062, 10, M.black, 0, 0.088, -0.640, Math.PI / 2, 0, 0);
  Cyl(g, 0.0165, 0.0165, 0.016, 10, M.black, 0, 0.088, -0.672, Math.PI / 2, 0, 0);
  if (detail) {
    P(g, 0.010, 0.022, 0.046, M.dark, 0.0135, 0.088, -0.638);
    P(g, 0.010, 0.022, 0.046, M.dark, -0.0135, 0.088, -0.638);
    P(g, 0.006, 0.006, 0.024, M.dark, 0, 0.103, -0.672);
    Cyl(g, 0.005, 0.005, 0.012, 6, M.metal, 0, 0.0755, -0.578, Math.PI / 2, 0, 0);
  }
  // 5.45 bakelite magazine: one extruded arc instead of stacked boxes, with
  // the floorplate following the curve's closing tangent. The whole magazine
  // lives in its own group pivoted at the magwell mouth, so the reload can
  // rock it forward off the front lug and swap it like the real thing.
  const magGroup = new THREE.Group();
  magGroup.name = 'rifle-magazine';
  magGroup.position.set(0, 0.024, -0.062);
  const mag = { r: 0.34, sweep: 0.68, thick: 0.034 };
  const magOutline = [];
  for (const side of [1, -1]) {
    for (let i = 0; i <= 9; i++) {
      const step = side > 0 ? i : 9 - i;
      const a = (step / 9) * mag.sweep;
      const cz = -mag.r * (1 - Math.cos(a));
      const cy = -mag.r * Math.sin(a);
      magOutline.push([
        cz - Math.cos(a) * side * mag.thick * 0.5,
        cy + Math.sin(a) * side * mag.thick * 0.5,
      ]);
    }
  }
  const magBody = Profile(magGroup, magOutline, 0.038, M.bakelite, 0.002);
  magBody.name = 'rifle-magazine-body';
  const magEndZ = -mag.r * (1 - Math.cos(mag.sweep));
  const magEndY = -mag.r * Math.sin(mag.sweep);
  // floorplate, rear locking lug and two stamped stiffening ribs
  P(magGroup, 0.046, 0.014, 0.068, M.dark, 0,
    magEndY - 0.003 * Math.cos(mag.sweep),
    magEndZ - 0.003 * Math.sin(mag.sweep), mag.sweep);
  P(magGroup, 0.040, 0.020, 0.028, M.dark, 0, -0.002, 0.004);
  if (detail) {
    for (const a of [0.22, 0.45]) {
      P(magGroup, 0.044, 0.010, 0.052, M.dark,
        0, -mag.r * Math.sin(a), -mag.r * (1 - Math.cos(a)), a);
    }
  }
  g.add(magGroup);
  // wooden pistol grip, swept back like the real one
  Profile(g, [
    [0.022, 0.018],
    [0.082, 0.020],
    [0.100, -0.126],
    [0.088, -0.140],
    [0.038, -0.132],
    [0.024, -0.028],
  ], 0.042, M.wood, 0.003);
  // trigger guard, trigger and the magazine-release paddle
  P(g, 0.030, 0.016, 0.078, M.black, 0, 0.008, -0.002);
  P(g, 0.008, 0.030, 0.010, M.metal, 0, 0.002, 0.002, 0.12);
  P(g, 0.012, 0.026, 0.016, M.metal, 0, -0.004, -0.043);
  if (detail) {
    // right side: big selector lever, bolt handle and ejection-port recess
    P(g, 0.006, 0.020, 0.095, M.metal, 0.029, 0.078, 0.010);
    P(g, 0.014, 0.012, 0.026, M.metal, 0.032, 0.088, -0.020);
    P(g, 0.004, 0.030, 0.075, M.dark, 0.0265, 0.075, -0.030);
    // stamped-receiver rivets on both cheeks
    for (const sx of [1, -1]) {
      P(g, 0.004, 0.008, 0.008, M.dark, sx * 0.0265, 0.048, 0.095);
      P(g, 0.004, 0.008, 0.008, M.dark, sx * 0.0265, 0.070, -0.170);
      P(g, 0.004, 0.008, 0.008, M.dark, sx * 0.0265, 0.040, -0.020);
    }
  }
  // Fixed wooden stock with the AK's slight drop (behind the cheek weld).
  const rear = rearGroup(g);
  Profile(rear, [
    [0.125, 0.092],
    [0.298, 0.062],
    [0.314, 0.058],
    [0.314, -0.030],
    [0.150, 0.010],
    [0.130, 0.030],
  ], 0.046, M.wood, 0.003);
  P(rear, 0.048, 0.098, 0.016, M.dark, 0, 0.012, 0.318);          // buttplate
  if (detail) P(rear, 0.008, 0.012, 0.008, M.metal, 0, 0.016, 0.145); // sling swivel
  return {
    muzzle: V(0, 0.088, -0.69),
    foregrip: V(0, 0.055, -0.36),
    magazineGrip: V(0, -0.11, -0.09),
    eject: V(0.05, 0.098, -0.05),
    grip: V(0, -0.06, 0.05),
  };
}

function buildSMG(g, M, detail) {
  P(g, 0.055, 0.085, 0.22, M.black, 0, 0.030, -0.03);      // receiver
  P(g, 0.050, 0.050, 0.26, M.black, 0, 0.085, -0.06);      // upper
  P(g, 0.032, 0.014, 0.26, M.metal, 0, 0.116, -0.06);      // rail
  if (detail) for (let i = 0; i < 7; i++) P(g, 0.036, 0.006, 0.010, M.dark, 0, 0.117, -0.17 + i * 0.034);
  Cyl(g, 0.012, 0.012, 0.16, 8, M.metal, 0, 0.080, -0.29, Math.PI / 2, 0, 0);
  P(g, 0.046, 0.046, 0.055, M.black, 0, 0.080, -0.36);     // suppressor-ish shroud
  if (detail) {
    for (let i = 0; i < 3; i++) P(g, 0.050, 0.008, 0.008, M.dark, 0, 0.098 - i * 0.018, -0.36);
    P(g, 0.048, 0.048, 0.010, M.dark, 0, 0.080, -0.392);   // suppressor end cap
    Cyl(g, 0.009, 0.009, 0.016, 6, M.dark, 0, 0.080, -0.401, Math.PI / 2, 0, 0);
    // left-side charging handle, right-side laser box with a lit emitter
    P(g, 0.014, 0.014, 0.032, M.black, -0.034, 0.096, -0.10);
    P(g, 0.010, 0.012, 0.014, M.metal, -0.042, 0.096, -0.10);
    P(g, 0.016, 0.022, 0.055, M.black, 0.033, 0.072, -0.235);
    P(g, 0.008, 0.008, 0.005, M.dot, 0.033, 0.072, -0.265);
    P(g, 0.008, 0.022, 0.016, M.black, 0.030, 0.090, 0.008); // brass deflector
  }
  P(g, 0.050, 0.055, 0.10, M.grip, 0, 0.070, -0.20);       // fore grip shroud
  P(g, 0.036, 0.085, 0.045, M.grip, 0, -0.020, -0.15, -0.25, 0, 0); // angled foregrip
  // optic: reflex sight on the rail (rail top face is y = 0.123)
  reflexSight(g, M, detail, 0.123, -0.02, 0.9);
  // magazine with a flared well and grip ribs
  P(g, 0.036, 0.16, 0.042, M.black, 0, -0.070, -0.005, 0.05, 0, 0);
  P(g, 0.034, 0.02, 0.040, M.dark, 0, -0.155, 0.004, 0.05, 0, 0);
  if (detail) {
    P(g, 0.044, 0.020, 0.052, M.black, 0, -0.008, -0.008, 0.05, 0, 0);
    for (let i = 0; i < 3; i++) P(g, 0.038, 0.006, 0.044, M.dark, 0, -0.052 - i * 0.030, -0.004 + i * 0.0015, 0.05, 0, 0);
  }
  // grip + trigger
  P(g, 0.042, 0.115, 0.05, M.grip, 0, -0.060, 0.085, 0.28, 0, 0);
  P(g, 0.028, 0.010, 0.065, M.black, 0, -0.025, 0.045);
  P(g, 0.010, 0.024, 0.012, M.metal, 0, -0.010, 0.040);
  P(g, 0.006, 0.030, 0.075, M.dark, 0.029, 0.090, -0.02);  // ejection port
  // folding stock (behind the cheek weld)
  const rear = rearGroup(g);
  P(rear, 0.010, 0.012, 0.16, M.metal, 0.022, 0.060, 0.165);
  P(rear, 0.010, 0.012, 0.16, M.metal, -0.022, 0.060, 0.165);
  P(rear, 0.062, 0.070, 0.022, M.black, 0, 0.055, 0.250);
  return {
    muzzle: V(0, 0.080, -0.40),
    foregrip: V(0, 0.02, -0.17),
    eject: V(0.045, 0.090, -0.02),
    grip: V(0, -0.05, 0.09),
  };
}

function buildMachinePistol(g, M, detail) {
  // CZ75 Auto, rebuilt part-by-part from the licensed low-poly reference.
  // Matte-black slide and frame, bright barrel and controls, and the
  // signature silver-white magazine seated ahead of the trigger guard -
  // the support hand wraps it as the forward grip, and the reload
  // physically swaps it.
  // The complete upper (both slide blocks, barrel hood and sights) lives in
  // the named `slide` group so the viewmodel can cycle it under recoil.
  const BARREL_Y = 0.105;

  /* ---- fixed barrel: the slide travels around it ---- */
  Cyl(g, 0.0135, 0.0135, 0.460, 12, M.lightMetal,
    0, BARREL_Y, -0.190, Math.PI / 2, 0, 0);
  Cyl(g, 0.0170, 0.0170, 0.016, 12, M.dark,
    0, BARREL_Y, -0.412, Math.PI / 2, 0, 0);                    // muzzle ring
  Cyl(g, 0.0080, 0.0080, 0.018, 10, M.dark,
    0, BARREL_Y, -0.424, Math.PI / 2, 0, 0);                    // bore
  P(g, 0.036, 0.050, 0.090, M.metal, 0, 0.098, 0.020);          // chamber block

  /* ---- slide: two full-height blocks bridged under the open port ---- */
  const slide = new THREE.Group();
  slide.name = 'slide';
  g.add(slide);
  const slideFront = Profile(slide, [
    [-0.404, 0.076],
    [-0.400, 0.138],
    [-0.392, 0.152],
    [-0.168, 0.152],
    [-0.160, 0.136],
    [-0.160, 0.076],
  ], 0.056, M.black, 0.003);
  slideFront.name = 'cz75-slide-front';
  const slideRear = Profile(slide, [
    [-0.030, 0.076],
    [-0.030, 0.152],
    [0.070, 0.152],
    [0.088, 0.134],
    [0.088, 0.076],
  ], 0.056, M.black, 0.003);
  slideRear.name = 'cz75-slide-rear';
  P(slide, 0.056, 0.020, 0.132, M.black, 0, 0.086, -0.095);      // port bridge
  const hood = Cyl(slide, 0.024, 0.024, 0.120, 10, M.lightMetal,
    0, BARREL_Y + 0.004, -0.095, Math.PI / 2, 0, 0);
  hood.name = 'cz75-barrel-hood';

  // combat sights: notch-and-post sharing the configured 0.156 sight line
  P(slide, 0.052, 0.008, 0.024, M.dark, 0, 0.152, 0.058);
  P(slide, 0.013, 0.012, 0.020, M.dark, 0.0195, 0.156, 0.058);
  P(slide, 0.013, 0.012, 0.020, M.dark, -0.0195, 0.156, 0.058);
  const frontSight = P(slide, 0.011, 0.016, 0.020, M.dark, 0, 0.148, -0.352);
  frontSight.name = 'cz75-front-sight';
  if (detail) {
    P(slide, 0.004, 0.004, 0.002, M.lightMetal, 0, 0.152, -0.341);
    P(slide, 0.004, 0.004, 0.002, M.lightMetal, 0.0195, 0.156, 0.069);
    P(slide, 0.004, 0.004, 0.002, M.lightMetal, -0.0195, 0.156, 0.069);
    // grasping grooves, rear of the slide only
    for (let i = 0; i < 6; i++) {
      const z = 0.006 + i * 0.013;
      P(slide, 0.006, 0.056, 0.007, M.dark, 0.0285, 0.114, z, 0, 0, -0.18);
      P(slide, 0.006, 0.056, 0.007, M.dark, -0.0285, 0.114, z, 0, 0, 0.18);
    }
  }

  /* ---- frame ---- */
  const frame = Profile(g, [
    [-0.360, 0.024],
    [-0.352, 0.076],
    [0.075, 0.078],
    [0.100, 0.060],
    [0.092, 0.022],
    [-0.150, 0.012],
    [-0.300, 0.016],
  ], 0.054, M.metal, 0.003);
  frame.name = 'cz75-frame';

  /* ---- grip: raked shell, dark panels, screws, beavertail ---- */
  const grip = Profile(g, [
    [0.000, 0.040],
    [0.020, 0.046],
    [0.128, 0.060],
    [0.142, 0.030],
    [0.118, -0.168],
    [0.088, -0.186],
    [0.046, -0.184],
    [0.012, -0.030],
  ], 0.056, M.grip, 0.004);
  grip.name = 'cz75-grip-shell';
  P(g, 0.050, 0.024, 0.052, M.metal, 0, 0.054, 0.120, -0.22, 0, 0); // beavertail
  if (detail) {
    for (const sx of [1, -1]) {
      P(g, 0.006, 0.150, 0.088, M.dark, sx * 0.030, -0.062, 0.078, 0.10, 0, 0);
      Cyl(g, 0.005, 0.005, 0.008, 8, M.lightMetal,
        sx * 0.034, -0.020, 0.066, 0, 0, Math.PI / 2);
      Cyl(g, 0.005, 0.005, 0.008, 8, M.lightMetal,
        sx * 0.034, -0.120, 0.090, 0, 0, Math.PI / 2);
    }
  }

  // ring hammer and its spur, riding just behind the slide
  P(g, 0.020, 0.022, 0.024, M.dark, 0, 0.086, 0.106);
  Torus(g, 0.012, 0.0045, 6, 12, M.dark, 0, 0.098, 0.104, 0, Math.PI / 2, 0);

  /* ---- feed magazine: seated ahead of the trigger guard, exactly where the
         support hand wraps the gun. Bright silver-white body so it reads as
         the magazine at any distance; the reload physically swaps this box. */
  const magazine = new THREE.Group();
  magazine.name = 'machine-pistol-magazine';
  magazine.position.set(0, 0.012, -0.195);
  magazine.rotation.x = 0.06;
  g.add(magazine);
  const magazineBody = Profile(magazine, [
    [-0.019, -0.020],
    [0.019, -0.020],
    [0.022, -0.175],
    [0.010, -0.205],
    [-0.012, -0.198],
  ], 0.038, M.silver, 0.002);
  magazineBody.name = 'machine-pistol-magazine-body';
  P(magazine, 0.046, 0.018, 0.050, M.lightMetal, 0, -0.206, 0.002); // baseplate
  if (detail) {
    for (let i = 0; i < 3; i++) {
      P(magazine, 0.040, 0.006, 0.034, M.lightMetal,
        0, -0.056 - i * 0.048, 0.001);
    }
    P(magazine, 0.004, 0.010, 0.006, M.dark, 0.019, -0.100, 0.004); // witness holes
    P(magazine, 0.004, 0.010, 0.006, M.dark, 0.019, -0.146, 0.006);
  }
  P(g, 0.040, 0.018, 0.056, M.metal, 0, 0.022, -0.195);           // magwell lug

  /* ---- trigger guard, silver trigger, controls ---- */
  const guard = ProfileRing(g, [
    [-0.118, 0.036],
    [0.018, 0.036],
    [0.048, 0.014],
    [0.046, -0.034],
    [0.020, -0.056],
    [-0.094, -0.056],
    [-0.116, -0.028],
  ], [
    [-0.092, 0.014],
    [0.008, 0.014],
    [0.028, -0.002],
    [0.026, -0.026],
    [0.006, -0.038],
    [-0.080, -0.038],
    [-0.094, -0.014],
  ], 0.046, M.metal, 0.002);
  guard.name = 'cz75-trigger-guard';
  P(g, 0.011, 0.044, 0.013, M.lightMetal, 0, -0.002, -0.034, -0.30, 0, 0);
  P(g, 0.011, 0.020, 0.013, M.lightMetal, 0, -0.028, -0.048, -0.10, 0, 0);
  P(g, 0.010, 0.016, 0.034, M.lightMetal, -0.033, 0.060, -0.012); // slide stop
  P(g, 0.010, 0.014, 0.026, M.lightMetal, -0.034, 0.070, 0.038);  // safety
  P(g, 0.006, 0.006, 0.004, M.dot, -0.038, 0.080, 0.020);         // auto mark
  Cyl(g, 0.008, 0.008, 0.010, 10, M.lightMetal,
    -0.033, 0.028, 0.012, 0, 0, Math.PI / 2);                     // mag release

  g.userData.proceduralSidearm = 'cz75-auto';
  return {
    muzzle: V(0, 0.105, -0.436),
    foregrip: V(0, -0.100, -0.195),
    magazineGrip: V(0, -0.150, -0.195),
    eject: V(0.046, 0.118, -0.095),
    grip: V(0, -0.035, 0.040),
  };
}

function buildDesertEagle(g, M, detail) {
  // Desert Eagle XIX, rebuilt from the licensed low-poly reference: the huge
  // gas-operated hand cannon. Brushed-silver slide and frame, a fixed
  // polygonal barrel with a stepped muzzle crown, the full-length top rib,
  // ambidextrous slide safeties, spur hammer, and a seven-round magazine in
  // the raked grip that the reload physically swaps. The complete upper
  // (slide, sights, port furniture) lives in the named `slide` group so the
  // viewmodel can cycle it under the .50's enormous recoil.
  const BARREL_Y = 0.118;

  /* ---- fixed octagonal barrel: the slide travels around it ---- */
  Cyl(g, 0.025, 0.025, 0.520, 8, M.silver,
    0, BARREL_Y, -0.220, Math.PI / 2, 0, 0);
  const crown = Cyl(g, 0.029, 0.029, 0.024, 8, M.silver,
    0, BARREL_Y, -0.488, Math.PI / 2, 0, 0);
  crown.name = 'deagle-muzzle-crown';
  Cyl(g, 0.010, 0.010, 0.026, 10, M.dark,
    0, BARREL_Y, -0.500, Math.PI / 2, 0, 0);                    // bore
  P(g, 0.040, 0.052, 0.100, M.silver, 0, 0.110, 0.020);         // chamber block

  /* ---- slide: the famous heavy bevelled block ---- */
  const slide = new THREE.Group();
  slide.name = 'slide';
  g.add(slide);
  const slideBody = Profile(slide, [
    [-0.458, 0.086],
    [-0.458, 0.150],
    [-0.446, 0.168],
    [-0.430, 0.174],
    [0.060, 0.174],
    [0.082, 0.162],
    [0.095, 0.140],
    [0.095, 0.086],
  ], 0.058, M.silver, 0.004);
  slideBody.name = 'deagle-slide-body';

  // ejection port with the barrel hood showing through, right side
  P(slide, 0.008, 0.036, 0.100, M.dark, 0.029, 0.140, -0.130);
  P(slide, 0.010, 0.024, 0.060, M.lightMetal, 0.030, 0.138, -0.128);

  // full-length top rib with cross slots - the DE's scope-mount spine
  P(slide, 0.026, 0.007, 0.420, M.silver, 0, 0.1765, -0.190);
  if (detail) {
    for (let i = 0; i < 7; i++) {
      P(slide, 0.028, 0.004, 0.010, M.dark, 0, 0.1795, -0.360 + i * 0.048);
    }
    // rear grasping grooves
    for (let i = 0; i < 6; i++) {
      for (const sx of [1, -1]) {
        P(slide, 0.006, 0.048, 0.008, M.dark,
          sx * 0.031, 0.126, 0.058 - i * 0.012, 0, 0, sx * -0.12);
      }
    }
  }

  // combat sights: tall front ramp and rear notch hold the 0.205 sight line
  const frontSight = Profile(slide, [
    [-0.432, 0.174],
    [-0.426, 0.205],
    [-0.414, 0.205],
    [-0.406, 0.174],
  ], 0.022, M.dark, 0);
  frontSight.name = 'deagle-front-sight';
  P(slide, 0.040, 0.014, 0.036, M.dark, 0, 0.181, 0.055);
  P(slide, 0.012, 0.024, 0.026, M.dark, 0.014, 0.193, 0.055);
  P(slide, 0.012, 0.024, 0.026, M.dark, -0.014, 0.193, 0.055);
  if (detail) {
    P(slide, 0.004, 0.004, 0.002, M.lightMetal, 0, 0.198, -0.434);
    P(slide, 0.004, 0.004, 0.002, M.lightMetal, 0.014, 0.193, 0.069);
    P(slide, 0.004, 0.004, 0.002, M.lightMetal, -0.014, 0.193, 0.069);
  }

  // ambidextrous teardrop safeties at the rear of the slide
  for (const sx of [1, -1]) {
    P(slide, 0.012, 0.016, 0.034, M.dark, sx * 0.033, 0.132, 0.052, 0, 0, sx * 0.5);
  }

  /* ---- frame ---- */
  const frame = Profile(g, [
    [-0.420, 0.020],
    [-0.414, 0.086],
    [0.070, 0.090],
    [0.102, 0.068],
    [0.096, 0.020],
    [0.020, 0.010],
    [-0.340, 0.010],
  ], 0.054, M.silver, 0.003);
  frame.name = 'deagle-frame';
  P(g, 0.010, 0.014, 0.030, M.dark, -0.034, 0.098, -0.010);       // slide stop
  Cyl(g, 0.006, 0.006, 0.010, 8, M.dark,
    -0.033, 0.052, -0.060, 0, 0, Math.PI / 2);                    // takedown

  /* ---- long raked grip with black panels and gold medallions ---- */
  const grip = Profile(g, [
    [0.006, 0.042],
    [0.026, 0.048],
    [0.120, 0.062],
    [0.148, 0.024],
    [0.128, -0.160],
    [0.104, -0.196],
    [0.052, -0.200],
    [0.018, -0.150],
    [0.002, -0.036],
  ], 0.056, M.silver, 0.004);
  grip.name = 'deagle-grip-shell';
  for (const sx of [1, -1]) {
    const panel = Profile(g, [
      [0.024, 0.020],
      [0.108, 0.040],
      [0.130, 0.010],
      [0.114, -0.140],
      [0.094, -0.172],
      [0.056, -0.176],
      [0.028, -0.136],
      [0.012, -0.028],
    ], 0.009, M.grip, 0.002);
    panel.position.x = sx * 0.033;
    panel.name = `deagle-grip-panel-${sx < 0 ? 'left' : 'right'}`;
    Cyl(g, 0.0045, 0.0045, 0.012, 8, M.brass,
      sx * 0.039, -0.068, 0.080, 0, 0, Math.PI / 2);              // medallion
  }

  // external spur hammer behind the slide
  const hammer = Profile(g, [
    [0.082, 0.092],
    [0.096, 0.128],
    [0.118, 0.140],
    [0.130, 0.132],
    [0.122, 0.108],
    [0.100, 0.088],
  ], 0.026, M.dark, 0.002);
  hammer.name = 'deagle-hammer';

  /* ---- seven-round magazine inside the grip ---- */
  const magazine = new THREE.Group();
  magazine.name = 'deagle-magazine';
  magazine.position.set(0, 0.046, 0.070);
  g.add(magazine);
  const magazineBody = Profile(magazine, [
    [-0.016, 0.000],
    [0.016, 0.000],
    [0.018, -0.150],
    [0.024, -0.222],
    [0.010, -0.236],
    [-0.010, -0.228],
    [-0.014, -0.150],
  ], 0.038, M.lightMetal, 0.002);
  magazineBody.name = 'deagle-magazine-body';
  P(magazine, 0.046, 0.018, 0.050, M.dark, 0, -0.240, 0.006);     // baseplate
  if (detail) {
    P(magazine, 0.040, 0.006, 0.034, M.metal, 0, -0.070, 0.002);
    P(magazine, 0.004, 0.012, 0.007, M.dark, 0.020, -0.120, 0.008);
    P(magazine, 0.004, 0.012, 0.007, M.dark, 0.020, -0.164, 0.012);
  }

  /* ---- oversized rounded trigger guard, dark trigger ---- */
  const guard = ProfileRing(g, [
    [-0.104, 0.038],
    [0.024, 0.038],
    [0.054, 0.016],
    [0.052, -0.034],
    [0.026, -0.056],
    [-0.082, -0.056],
    [-0.104, -0.026],
  ], [
    [-0.080, 0.016],
    [0.014, 0.016],
    [0.034, 0.000],
    [0.032, -0.026],
    [0.012, -0.038],
    [-0.070, -0.038],
    [-0.082, -0.012],
  ], 0.050, M.silver, 0.002);
  guard.name = 'deagle-trigger-guard';
  P(g, 0.012, 0.044, 0.014, M.dark, 0, -0.004, -0.034, -0.26, 0, 0);
  Cyl(g, 0.008, 0.008, 0.010, 10, M.dark,
    -0.033, 0.028, 0.014, 0, 0, Math.PI / 2);                     // mag release

  g.userData.proceduralSidearm = 'desert-eagle';
  return {
    muzzle: V(0, 0.118, -0.515),
    foregrip: V(0, 0.004, -0.058),
    magazineGrip: V(0, -0.176, 0.082),
    eject: V(0.048, 0.142, -0.128),
    grip: V(0, -0.052, 0.078),
  };
}

function buildShotgun(g, M, detail) {
  P(g, 0.058, 0.075, 0.34, M.black, 0, 0.055, -0.10);       // receiver
  Cyl(g, 0.019, 0.019, 0.42, 8, M.metal, 0, 0.082, -0.44, Math.PI / 2, 0, 0);   // barrel
  Cyl(g, 0.015, 0.015, 0.34, 8, M.black, 0, 0.038, -0.40, Math.PI / 2, 0, 0);   // tube mag
  P(g, 0.024, 0.020, 0.05, M.metal, 0, 0.038, -0.575);      // tube cap
  // pump handle (animated by the controller via name lookup)
  const pump = P(g, 0.062, 0.062, 0.14, M.grip, 0, 0.055, -0.34);
  pump.name = 'pump';
  if (detail) {
    for (let i = 0; i < 4; i++) P(pump, 0.066, 0.008, 0.012, M.dark, 0, 0.024 - i * 0.016, 0);
    // action bars that ride back with the pump
    P(pump, 0.006, 0.010, 0.20, M.metal, 0.033, -0.006, 0.11);
    P(pump, 0.006, 0.010, 0.20, M.metal, -0.033, -0.006, 0.11);
    // barrel heat-shield ribs + barrel/tube clamp + sling stud
    for (let i = 0; i < 5; i++) P(g, 0.046, 0.010, 0.016, M.dark, 0, 0.097, -0.26 - i * 0.07);
    P(g, 0.044, 0.062, 0.014, M.metal, 0, 0.056, -0.545);
    P(g, 0.010, 0.016, 0.010, M.dark, 0, 0.024, -0.545);
    // loading port plate on the left of the receiver
    P(g, 0.008, 0.028, 0.075, M.metal, -0.031, 0.046, -0.08);
  }
  // bead sight + open rear notch
  P(g, 0.012, 0.018, 0.014, M.metal, 0, 0.106, -0.62);
  P(g, 0.008, 0.020, 0.018, M.dark, 0.014, 0.101, 0.02);
  P(g, 0.008, 0.020, 0.018, M.dark, -0.014, 0.101, 0.02);
  P(g, 0.036, 0.008, 0.018, M.black, 0, 0.088, 0.02);
  // grip + trigger
  P(g, 0.046, 0.125, 0.06, M.grip, 0, -0.040, 0.070, 0.30, 0, 0);
  P(g, 0.030, 0.010, 0.07, M.black, 0, -0.005, 0.030);
  P(g, 0.010, 0.024, 0.012, M.metal, 0, 0.005, 0.028);
  // stock (behind the cheek weld)
  const rear = rearGroup(g);
  P(rear, 0.058, 0.085, 0.18, M.black, 0, 0.045, 0.190);
  P(rear, 0.062, 0.115, 0.030, M.grip, 0, 0.030, 0.290);
  // shell carrier + side saddle
  P(g, 0.008, 0.040, 0.10, M.dark, 0.031, 0.045, -0.06);
  if (detail) for (let i = 0; i < 4; i++) P(g, 0.020, 0.020, 0.020, M.brass, -0.036, 0.070, -0.02 + i * 0.045);
  return {
    muzzle: V(0, 0.082, -0.66),
    foregrip: V(0, 0.02, -0.34),
    eject: V(0.05, 0.060, -0.05),
    grip: V(0, -0.04, 0.07),
  };
}

function buildSniper(g, M, detail) {
  P(g, 0.055, 0.080, 0.38, M.black, 0, 0.040, -0.08);       // receiver
  Cyl(g, 0.016, 0.013, 0.52, 8, M.metal, 0, 0.070, -0.54, Math.PI / 2, 0, 0);  // heavy barrel
  P(g, 0.040, 0.040, 0.09, M.black, 0, 0.070, -0.82);       // brake
  if (detail) for (let i = 0; i < 3; i++) P(g, 0.044, 0.008, 0.014, M.dark, 0, 0.086, -0.79 - i * 0.02);
  // chassis / handguard rails
  P(g, 0.062, 0.055, 0.30, M.tan, 0, 0.062, -0.40);
  if (detail) for (let i = 0; i < 6; i++) P(g, 0.066, 0.010, 0.016, M.dark, 0, 0.045, -0.30 - i * 0.04);
  // scope: rings, tube, lenses
  P(g, 0.020, 0.040, 0.026, M.black, 0, 0.115, -0.05);
  P(g, 0.020, 0.040, 0.026, M.black, 0, 0.115, -0.20);
  Cyl(g, 0.026, 0.026, 0.30, 10, M.black, 0, 0.150, -0.13, Math.PI / 2, 0, 0);
  Cyl(g, 0.032, 0.032, 0.05, 10, M.black, 0, 0.150, -0.285, Math.PI / 2, 0, 0);
  Cyl(g, 0.028, 0.028, 0.012, 10, M.glass, 0, 0.150, -0.312, Math.PI / 2, 0, 0);
  Cyl(g, 0.024, 0.024, 0.012, 10, M.glass, 0, 0.150, 0.022, Math.PI / 2, 0, 0);
  P(g, 0.022, 0.022, 0.022, M.metal, 0, 0.182, -0.13);      // elevation turret
  P(g, 0.022, 0.022, 0.022, M.metal, 0.030, 0.150, -0.13);  // windage turret
  if (detail) {
    // sunshade ahead of the objective, flip-cap ring at the ocular,
    // parallax turret on the left
    Cyl(g, 0.033, 0.033, 0.045, 10, M.dark, 0, 0.150, -0.336, Math.PI / 2, 0, 0);
    Cyl(g, 0.027, 0.027, 0.014, 10, M.dark, 0, 0.150, 0.036, Math.PI / 2, 0, 0);
    P(g, 0.020, 0.020, 0.020, M.metal, -0.028, 0.150, -0.13);
    // barrel flutes + brake side vents
    P(g, 0.005, 0.005, 0.34, M.dark, 0.014, 0.079, -0.50);
    P(g, 0.005, 0.005, 0.34, M.dark, -0.014, 0.079, -0.50);
    for (let i = 0; i < 2; i++) {
      P(g, 0.006, 0.026, 0.016, M.dark, 0.021, 0.070, -0.795 - i * 0.028);
      P(g, 0.006, 0.026, 0.016, M.dark, -0.021, 0.070, -0.795 - i * 0.028);
    }
    // dope-card holder on the chassis + mag base pad
    P(g, 0.002, 0.030, 0.045, M.tan, 0.033, 0.062, -0.34);
    P(g, 0.042, 0.014, 0.054, M.tan, 0, -0.089, -0.07);
  }
  // bolt handle
  const bolt = P(g, 0.014, 0.014, 0.07, M.metal, 0.040, 0.075, 0.02, 0, 0, 0.5);
  bolt.name = 'bolt';
  P(bolt, 0.024, 0.024, 0.024, M.metal, 0, 0, -0.045);
  // magazine
  P(g, 0.038, 0.09, 0.050, M.black, 0, -0.035, -0.07);
  // grip + trigger
  P(g, 0.044, 0.125, 0.055, M.grip, 0, -0.050, 0.075, 0.26, 0, 0);
  P(g, 0.030, 0.010, 0.07, M.black, 0, -0.012, 0.030);
  P(g, 0.010, 0.026, 0.012, M.metal, 0, 0.000, 0.028);
  // Stock: one continuous body with a raised cheek comb that runs all the way
  // back into the recoil pad. The old separate riser + tall butt plate read as
  // two buttstocks from the side.
  const rear = rearGroup(g);
  P(rear, 0.058, 0.090, 0.24, M.tan, 0, 0.040, 0.205);
  P(rear, 0.054, 0.046, 0.155, M.grip, 0, 0.098, 0.240);
  P(rear, 0.062, 0.112, 0.026, M.grip, 0, 0.022, 0.322);
  if (detail) {
    P(rear, 0.014, 0.014, 0.014, M.metal, 0.032, 0.095, 0.205); // comb adjustment knob
    P(rear, 0.012, 0.034, 0.012, M.metal, 0, -0.012, 0.295);    // rear monopod
  }
  return {
    muzzle: V(0, 0.070, -0.88),
    foregrip: V(0, 0.02, -0.44),
    eject: V(0.05, 0.075, -0.02),
    grip: V(0, -0.05, 0.08),
  };
}

function buildMinigun(g, M, detail) {
  // Square receiver, front gearbox and rear control block. The silhouette is
  // deliberately voxel-heavy like the supplied reference rather than a rifle
  // with six thin tubes attached to its muzzle.
  P(g, 0.46, 0.34, 0.56, M.black, 0, 0.04, -0.10);
  P(g, 0.40, 0.16, 0.42, M.dark, 0, -0.17, -0.06);
  P(g, 0.36, 0.28, 0.25, M.metal, 0, 0.04, -0.43);
  P(g, 0.42, 0.26, 0.22, M.black, 0, 0.02, 0.25);
  P(g, 0.24, 0.09, 0.24, M.metal, -0.04, 0.245, -0.08);
  P(g, 0.14, 0.055, 0.18, M.dark, 0.10, 0.305, -0.08);
  P(g, 0.08, 0.08, 0.15, M.metal, -0.17, 0.18, 0.05);

  // Left-side drive motor and stepped cap.
  Cyl(g, 0.115, 0.115, 0.22, 12, M.metal, -0.27, 0.01, -0.08, 0, 0, Math.PI / 2);
  Cyl(g, 0.083, 0.083, 0.055, 12, M.dark, -0.405, 0.01, -0.08, 0, 0, Math.PI / 2);
  Cyl(g, 0.037, 0.037, 0.075, 10, M.black, -0.445, 0.01, -0.08, 0, 0, Math.PI / 2);

  // Six heavy barrels, a central spindle and three smooth retaining collars.
  // A real M134 barrel cage has no outward-pointing teeth: the old box teeth
  // read as spikes from first- and third-person, so the collars stay round.
  // Everything lives in one named group so first- and third-person animation
  // spins the complete barrel cage exactly as one mechanical assembly.
  const cluster = new THREE.Group();
  cluster.name = 'minigun-barrels';
  cluster.position.set(0, 0.095, -0.48);
  g.add(cluster);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const x = Math.cos(a) * 0.092;
    const y = Math.sin(a) * 0.092;
    Cyl(cluster, 0.021, 0.021, 0.88, 8, M.metal, x, y, -0.39, Math.PI / 2);
    Cyl(cluster, 0.030, 0.027, 0.075, 8, M.black, x, y, -0.845, Math.PI / 2);
  }
  Cyl(cluster, 0.052, 0.052, 0.96, 12, M.dark, 0, 0, -0.38, Math.PI / 2);
  for (const z of [0.02, -0.38, -0.79]) {
    const collar = Cyl(cluster, 0.152, 0.152, 0.070, 16, M.black, 0, 0, z, Math.PI / 2);
    collar.name = 'minigun-retaining-collar';
  }
  // Paired top rails/handle with four proper supports into the receiver.
  for (const x of [-0.17, 0.17]) {
    P(g, 0.055, 0.055, 0.78, M.dark, x, 0.30, -0.23);
    for (const z of [-0.55, 0.12]) {
      P(g, 0.055, 0.16, 0.075, M.metal, x, 0.235, z);
    }
  }
  P(g, 0.40, 0.055, 0.07, M.metal, 0, 0.30, 0.15);

  // Twin rear spade grips, thumb shelves, safety bar and red trigger buttons.
  for (const x of [-0.15, 0.15]) {
    P(g, 0.075, 0.23, 0.08, M.grip, x, -0.11, 0.35, -0.10);
    P(g, 0.10, 0.07, 0.17, M.black, x, 0.03, 0.30, 0.12);
    P(g, 0.025, 0.025, 0.035, M.dot, x, 0.075, 0.22);
  }
  P(g, 0.32, 0.05, 0.06, M.metal, 0, 0.065, 0.36);

  // Large round ammunition drum under the right side of the receiver. A
  // raised cap, cross-bracing and hub keep its face readable from every angle.
  Cyl(g, 0.255, 0.255, 0.30, 16, M.dark, 0.31, -0.32, -0.03, 0, 0, Math.PI / 2);
  Cyl(g, 0.235, 0.235, 0.045, 16, M.metal, 0.475, -0.32, -0.03, 0, 0, Math.PI / 2);
  P(g, 0.025, 0.055, 0.38, M.black, 0.495, -0.32, -0.03);
  P(g, 0.025, 0.38, 0.055, M.black, 0.495, -0.32, -0.03);
  Cyl(g, 0.055, 0.055, 0.075, 12, M.black, 0.515, -0.32, -0.03, 0, 0, Math.PI / 2);
  P(g, 0.10, 0.18, 0.14, M.metal, 0.17, -0.12, 0.02);
  P(g, 0.16, 0.14, 0.20, M.black, 0.25, -0.03, -0.27);

  // Exposed articulated ammunition belt rising from the drum into the feed
  // throat. Brass rounds and dark links alternate like the supplied model.
  if (detail) {
    for (let i = 0; i < 11; i++) {
      const u = i / 10;
      const x = 0.40 - u * 0.15;
      const y = -0.075 + u * 0.215;
      const z = -0.10 - u * 0.21;
      P(
        g,
        0.038, 0.082, 0.038, M.brass,
        x, y, z, 0, -0.16, 0.22
      );
      P(g, 0.052, 0.027, 0.052, M.dark, x, y - 0.034, z, 0, -0.16, 0.22);
    }
    // Receiver ribs, top switch bank and side inspection panel.
    for (let i = 0; i < 7; i++) {
      P(g, 0.035, 0.035, 0.16, M.metal, -0.15 + i * 0.05, 0.205, -0.30);
    }
    P(g, 0.16, 0.11, 0.025, M.metal, -0.15, 0.055, -0.385);
    for (let i = 0; i < 3; i++) {
      P(g, 0.025, 0.022, 0.035, i === 2 ? M.dot : M.black, 0.10 + i * 0.032, 0.30, 0.02);
    }
  }

  return {
    muzzle: V(0, 0.095, -1.35),
    foregrip: V(-0.15, -0.10, 0.34),
    eject: V(0.25, 0.00, -0.27),
    grip: V(0.15, -0.10, 0.34),
  };
}

function projectedBladeMaterial(glow = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: glow ? 0.18 : 0.72 },
      uColor: { value: new THREE.Color(glow ? 0x125cff : 0x2f8cff) },
    },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec3 vLocal;
      void main() {
        float scan = 0.72
          + 0.20 * sin(uTime * 13.0 + vLocal.z * 82.0)
          + 0.08 * sin(uTime * 29.0 + vLocal.x * 110.0);
        float flicker = 0.92 + 0.08 * sin(uTime * 41.0);
        float energy = clamp(scan * flicker, 0.35, 1.25);
        gl_FragColor = vec4(uColor * (0.76 + energy * 0.28), uOpacity * energy);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function buildCombatKnife(g, M, detail, projected = false) {
  // Compact balisong-style field knife: the blade and split handle remain a
  // single connected silhouette at rest, while named hinge groups let the
  // draw animation flip both scales around the tang.
  // The blade is angled inside the weapon root while the root itself remains
  // aligned with the wrist. That keeps the one visible right forearm below
  // the screen instead of rotating it sideways across half the view.
  const spin = new THREE.Group();
  spin.name = 'knife-spin';
  g.add(spin);
  const body = new THREE.Group();
  body.name = 'knife-body';
  const bodyRotation = new THREE.Euler(0.08, 0.70, 0.22);
  const authoredGrip = V(0, -0.005, 0.100);
  body.rotation.copy(bodyRotation);
  body.position.copy(authoredGrip).applyEuler(bodyRotation).multiplyScalar(-1);
  spin.add(body);

  const profile = new THREE.Shape();
  profile.moveTo(-0.050, 0);
  profile.lineTo(0.050, 0);
  profile.lineTo(0.043, -0.195);
  profile.lineTo(0.024, -0.255);
  profile.lineTo(0, -0.315);
  profile.lineTo(-0.041, -0.230);
  profile.closePath();
  const bladeGeometry = new THREE.ExtrudeGeometry(profile, {
    depth: 0.020,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.004,
    bevelThickness: 0.004,
  });
  bladeGeometry.translate(0, 0, -0.010);
  bladeGeometry.rotateX(Math.PI / 2);
  bladeGeometry.computeVertexNormals();
  const laserCoreMaterial = projected ? projectedBladeMaterial(false) : null;
  const laserGlowMaterial = projected ? projectedBladeMaterial(true) : null;
  const blade = new THREE.Mesh(bladeGeometry, projected ? laserCoreMaterial : M.blade);
  blade.name = projected ? 'laser-blade' : 'knife-blade';
  blade.position.y = 0.015;
  body.add(blade);
  let bladeGlow = null;
  if (projected) {
    bladeGlow = new THREE.Mesh(bladeGeometry, laserGlowMaterial);
    bladeGlow.name = 'laser-blade-glow';
    bladeGlow.position.copy(blade.position);
    bladeGlow.scale.set(1.16, 1.16, 1.04);
    bladeGlow.renderOrder = 5;
    body.add(bladeGlow);
  }

  // Guard, hinge block and exposed tang keep both moving handle halves
  // physically connected even at the widest part of the flourish.
  P(body, 0.145, 0.035, 0.036, M.metal, 0, 0.014, -0.001);
  P(body, 0.044, 0.048, 0.060, M.metal, 0, 0.000, 0.024);
  P(body, 0.032, 0.040, 0.190, M.metal, 0, -0.005, 0.105);
  if (projected) {
    const emitterMaterial = new THREE.MeshBasicMaterial({
      color: 0x73ddff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    P(body, 0.092, 0.044, 0.022, emitterMaterial, 0, 0.014, -0.010);
    P(body, 0.052, 0.052, 0.024, emitterMaterial, 0, 0.014, -0.024);
    g.userData.ownedMaterials = [
      laserCoreMaterial,
      laserGlowMaterial,
      emitterMaterial,
    ];
  }

  const addHandleHalf = (name, x) => {
    const hinge = new THREE.Group();
    hinge.name = name;
    hinge.position.set(x, -0.005, 0.014);
    body.add(hinge);
    P(hinge, 0.044, 0.074, 0.174, M.grip, 0, 0, 0.087);
    P(hinge, 0.048, 0.078, 0.030, M.black, 0, 0, 0.177);
    P(hinge, 0.050, 0.082, 0.028, M.metal, 0, 0, 0.010);
    if (detail) {
      P(hinge, 0.048, 0.064, 0.132, M.dark, 0, 0, 0.087);
      for (let i = 0; i < 5; i++) {
        P(hinge, 0.052, 0.070, 0.009, M.black, 0, 0, 0.038 + i * 0.026);
      }
    }
    return hinge;
  };
  addHandleHalf('knife-handle-left', -0.021);
  addHandleHalf('knife-handle-right', 0.021);

  if (detail && !projected) {
    // A shallow fuller lies against each blade face; both pieces intersect
    // the steel volume so the model audit can catch genuine floaters.
    for (const y of [-0.0005, 0.0305]) {
      P(body, 0.042, 0.005, 0.150, M.metal, 0, y, -0.102, -0.035);
    }
  }

  if (projected) {
    g.userData.laserBlade = true;
    g.userData.updateVisual = (time = 0, extension = 1) => {
      const length = clamp(extension, 0.02, 1);
      laserCoreMaterial.uniforms.uTime.value = time;
      laserGlowMaterial.uniforms.uTime.value = time + 0.07;
      blade.scale.z = length;
      bladeGlow.scale.z = length * 1.04;
      const pulse = 1 + Math.sin(time * 18) * 0.018;
      bladeGlow.scale.x = 1.16 * pulse;
      bladeGlow.scale.y = 1.16 * pulse;
    };
  }

  const toRoot = (point) => point.clone().applyEuler(bodyRotation).add(body.position);
  return {
    muzzle: toRoot(V(0, 0.015, -0.315)),
    foregrip: V(0, 0, 0),
    eject: V(0, 0, 0),
    grip: V(0, 0, 0),
  };
}

/**
 * Pulsing red electromagnetic fill for the railgun's energy channel: a scan
 * wave races toward the muzzle under a constant hot flicker, matching the
 * laser blade's projected material in style but tuned to weapon red.
 */
function railEnergyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.92 },
      uColor: { value: new THREE.Color(0xff2c16) },
    },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec3 vLocal;
      void main() {
        float race = 0.62
          + 0.30 * sin(uTime * 10.0 - vLocal.z * 55.0)
          + 0.10 * sin(uTime * 33.0 - vLocal.z * 130.0);
        float flicker = 0.90 + 0.10 * sin(uTime * 47.0);
        float energy = clamp(race * flicker, 0.30, 1.30);
        gl_FragColor = vec4(uColor * (0.72 + energy * 0.38), uOpacity * energy);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function buildRailgun(g, M, detail) {
  // Deep grey / black machine metal with live red EM hardware. Two solid
  // rails run the barrel's full length around a visible red energy channel;
  // square accelerator coils cinch the pair at regular intervals.
  const energy = railEnergyMaterial();
  const redGlow = new THREE.MeshBasicMaterial({
    color: 0xff2a16, transparent: true, opacity: 0.9, fog: false,
  });

  P(g, 0.085, 0.105, 0.50, M.black, 0, 0.048, -0.12);        // receiver
  P(g, 0.070, 0.042, 0.88, M.dark, 0, 0.118, -0.56);         // top spine
  for (const x of [-0.040, 0.040]) {
    P(g, 0.020, 0.034, 0.84, M.metal, x, 0.062, -0.64);      // EM rails
    P(g, 0.024, 0.066, 0.32, M.metal, x * 1.35, 0.040, -0.16); // capacitor banks
  }
  // energy channel core (visible red crackle between the rails) + top strip
  const core = P(g, 0.064, 0.034, 0.78, energy, 0, 0.062, -0.63);
  core.name = 'railgun-energy-core';
  const strip = P(g, 0.024, 0.008, 0.80, energy, 0, 0.141, -0.58);
  strip.name = 'railgun-energy-strip';
  // square accelerator coils with glowing red pole windows
  for (let i = 0; i < 5; i++) {
    const z = -0.30 - i * 0.15;
    P(g, 0.072, 0.072, 0.032, M.black, 0, 0.062, z);
    P(g, 0.076, 0.014, 0.012, redGlow, 0, 0.062, z);
  }
  // muzzle device + hot red tip ring
  P(g, 0.062, 0.062, 0.12, M.dark, 0, 0.062, -1.10);
  const tip = P(g, 0.064, 0.064, 0.014, redGlow, 0, 0.062, -1.165);
  tip.name = 'railgun-muzzle-tip';
  // square high-power optic: mounts, box tube, hoods, glass, turrets
  P(g, 0.026, 0.034, 0.032, M.black, 0, 0.152, -0.16);
  P(g, 0.026, 0.034, 0.032, M.black, 0, 0.152, -0.38);
  P(g, 0.054, 0.054, 0.36, M.black, 0, 0.183, -0.27);
  P(g, 0.066, 0.066, 0.07, M.dark, 0, 0.183, -0.475);
  P(g, 0.056, 0.056, 0.012, M.glass, 0, 0.183, -0.515);
  P(g, 0.060, 0.060, 0.06, M.dark, 0, 0.183, -0.065);
  P(g, 0.048, 0.048, 0.012, M.glass, 0, 0.183, -0.030);
  P(g, 0.026, 0.026, 0.026, M.metal, 0, 0.222, -0.27);
  P(g, 0.026, 0.026, 0.026, M.metal, 0.036, 0.183, -0.27);
  P(g, 0.010, 0.010, 0.010, redGlow, -0.030, 0.196, -0.12);   // scope status dot
  // red bus lines running from the capacitor banks into the coil pack
  for (const x of [-0.054, 0.054]) P(g, 0.010, 0.010, 0.30, redGlow, x, 0.078, -0.30);
  // detachable power cell: one named group so the reload yanks it out whole
  const battery = new THREE.Group();
  battery.name = 'railgun-battery';
  battery.position.set(0, -0.052, -0.10);
  g.add(battery);
  P(battery, 0.064, 0.118, 0.096, M.dark, 0, 0, 0);
  P(battery, 0.068, 0.050, 0.060, redGlow, 0, -0.018, 0);      // charge windows
  P(battery, 0.070, 0.016, 0.102, M.black, 0, -0.066, 0);      // base pad
  // grip + trigger
  P(g, 0.048, 0.125, 0.060, M.grip, 0, -0.055, 0.085, 0.28, 0, 0);
  P(g, 0.032, 0.010, 0.075, M.black, 0, -0.012, 0.035);
  P(g, 0.010, 0.026, 0.012, M.metal, 0, 0.000, 0.033);
  // angled foregrip on a rail mount (support hand rides here)
  P(g, 0.040, 0.030, 0.060, M.dark, 0, 0.030, -0.46);
  P(g, 0.046, 0.105, 0.062, M.grip, 0, -0.030, -0.46, 0.38, 0, 0);
  // charging handle (static: the ARC-7 self-cycles between shots)
  P(g, 0.016, 0.016, 0.07, M.metal, -0.052, 0.085, -0.02);
  // stock behind the cheek weld
  const rear = rearGroup(g);
  P(rear, 0.072, 0.104, 0.26, M.black, 0, 0.046, 0.225);
  P(rear, 0.060, 0.040, 0.16, M.dark, 0, 0.112, 0.24);
  P(rear, 0.076, 0.118, 0.028, M.grip, 0, 0.040, 0.365);
  P(rear, 0.078, 0.012, 0.10, redGlow, 0, 0.075, 0.20);        // stock charge strip
  if (detail) {
    // rail joint bolts + receiver inspection plate
    for (let i = 0; i < 4; i++) {
      P(g, 0.010, 0.010, 0.010, M.dark, 0.052, 0.062, -0.34 - i * 0.20);
      P(g, 0.010, 0.010, 0.010, M.dark, -0.052, 0.062, -0.34 - i * 0.20);
    }
    P(g, 0.006, 0.050, 0.14, M.metal, -0.045, 0.045, -0.02);
  }

  g.userData.ownedMaterials = [energy, redGlow];
  g.userData.updateVisual = (time = 0) => {
    energy.uniforms.uTime.value = time;
    // every red node breathes together; the muzzle ring runs hottest
    redGlow.opacity = 0.62 + 0.30 * Math.sin(time * 5.2) + 0.08 * Math.sin(time * 23.0);
  };

  return {
    muzzle: V(0, 0.062, -1.175),
    foregrip: V(0, -0.045, -0.46),
    eject: V(0.05, 0.075, -0.05),
    grip: V(0, -0.055, 0.085),
    magazineGrip: V(0, -0.070, -0.10),
  };
}

const BUILDERS = {
  rifle: buildRifle,
  smg: buildSMG,
  machine_pistol: buildMachinePistol,
  desert_eagle: buildDesertEagle,
  shotgun: buildShotgun,
  sniper: buildSniper,
  railgun: buildRailgun,
  minigun: buildMinigun,
  combat_knife: buildCombatKnife,
  laser_blade: (g, M, detail) => buildCombatKnife(g, M, detail, true),
};

/**
 * Build a weapon. `detail` adds the small greebles - on for the viewmodel,
 * off for the dozen copies carried by bots.
 */
export function buildWeapon(id, textures, detail = true) {
  const M = matCache(textures);
  const g = new THREE.Group();
  g.name = 'weapon-' + id;
  g.userData.weaponId = id;
  g.userData.melee = WEAPON_DEFS[id]?.melee === true;
  g.userData.pistol = WEAPON_DEFS[id]?.pistol === true;
  const anchors = (BUILDERS[id] || buildRifle)(g, M, detail);
  if (!detail) {
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  }
  return { group: g, anchors };
}

/**
 * Palette for every first-person limb. Grenade hands are built in a module
 * that has no texture set in the headless tools, so the flat-colour fallback
 * keeps the geometry identical while the shading degrades gracefully.
 */
export function viewArmMaterials(textures = null, team = 'blue') {
  if (!textures) {
    return {
      glove: new THREE.MeshLambertMaterial({ color: 0x343a40 }),
      knuckle: new THREE.MeshLambertMaterial({ color: 0x15181c }),
      sleeve: new THREE.MeshLambertMaterial({ color: team === 'red' ? 0x4a2825 : 0x25334a }),
    };
  }
  const M = matCache(textures);
  return {
    glove: M.glove,
    knuckle: M.dark,
    sleeve: team === 'red' ? M.sleeveRed : M.sleeveBlue,
  };
}

/**
 * First-person arms. They have to run all the way off the bottom of the frame,
 * otherwise a floating forearm sits in the middle of the screen.
 */
export function buildViewArms(textures, team = 'blue') {
  const M = matCache(textures);
  const sleeve = team === 'red' ? M.sleeveRed : M.sleeveBlue;

  // Trigger hand: a fist that actually closes around the pistol grip - palm
  // behind the grip, three fingers curled across its front, the index
  // reaching into the trigger guard and the thumb over the grip's shoulder.
  const armR = new THREE.Group();
  const rightPalm = P(armR, 0.088, 0.096, 0.116, M.glove, 0, -0.036, 0.046);
  rightPalm.name = 'right-palm';
  P(armR, 0.090, 0.018, 0.052, M.dark, 0, 0.008, 0.016, 0.14);   // knuckle ridge
  P(armR, 0.098, 0.100, 0.085, M.dark, 0.010, -0.080, 0.115);    // cuff
  // two-piece forearm: the elbow bend keeps the sleeve running off frame
  P(armR, 0.094, 0.098, 0.36, sleeve, 0.030, -0.170, 0.250, 0.44, 0.18, 0);
  P(armR, 0.100, 0.106, 0.44, sleeve, 0.070, -0.350, 0.480, 0.58, 0.26, 0);

  // Rifle-grip fingers, grouped under the old trigger-finger name so melee
  // weapons still hide the whole rifle grip with one visibility toggle.
  const rifleFingers = new THREE.Group();
  rifleFingers.name = 'right-trigger-finger';
  armR.add(rifleFingers);
  // index finger: base knuckle on top of the fist, tip into the trigger guard
  P(rifleFingers, 0.026, 0.034, 0.046, M.glove, -0.006, 0.024, -0.012);
  P(rifleFingers, 0.022, 0.032, 0.070, M.glove, -0.008, 0.052, -0.032, 0.12);
  // middle / ring / pinky: each wraps across the grip's front face and
  // finishes on its far cheek, so the hold reads from both sides
  for (let i = 0; i < 3; i++) {
    const y = -0.035 - i * 0.024;
    const z = -0.016 + i * 0.002;
    P(rifleFingers, 0.054, 0.025, 0.032, M.glove, 0.002, y, z, 0.14 + i * 0.16);
    P(rifleFingers, 0.024, 0.023, 0.034, M.glove, -0.028, y - 0.002, z + 0.012,
      0.14 + i * 0.16, 0, 0.30);
  }
  // thumb rises from the palm's heel and lies along the grip's left shoulder
  P(rifleFingers, 0.030, 0.036, 0.046, M.glove, -0.026, 0.010, 0.020);
  P(rifleFingers, 0.024, 0.028, 0.068, M.glove, -0.027, 0.030, 0.002, -0.12, -0.18, 0);

  // A knife needs a closed power grip instead of the rifle's straight trigger
  // finger. These pieces remain attached to the hand while the balisong turns
  // inside it, then visibly wrap around both handle scales at rest.
  const knifeGrip = new THREE.Group();
  knifeGrip.name = 'knife-grip-fingers';
  knifeGrip.rotation.set(0.08, 0.70, 0.22);
  for (let i = 0; i < 4; i++) {
    const z = -0.057 + i * 0.038;
    const finger = P(knifeGrip, 0.052, 0.021, 0.027, M.glove, -0.014, -0.055, z, 0, 0, -0.10);
    finger.name = `knife-finger-${i + 1}`;
    P(knifeGrip, 0.021, 0.052, 0.029, M.glove, -0.046, -0.027, z, 0, 0, 0.18);
  }
  const thumb = P(knifeGrip, 0.025, 0.029, 0.094, M.glove, 0.047, 0.021, -0.002, 0.14, 0.12, -0.24);
  thumb.name = 'knife-thumb';
  P(knifeGrip, 0.074, 0.014, 0.102, M.dark, 0.002, 0.047, 0.004);
  knifeGrip.visible = false;
  armR.add(knifeGrip);

  // Support hand: fist pressed into the handguard's underside, thumb running
  // along the near flank, fingertips curling up the far side.
  const armL = new THREE.Group();
  P(armL, 0.080, 0.100, 0.116, M.glove, 0, -0.028, 0.018);
  P(armL, 0.082, 0.016, 0.050, M.dark, 0, -0.086, 0.052, 0.12);   // knuckle pad
  P(armL, 0.024, 0.032, 0.104, M.glove, -0.034, -0.018, -0.028, 0.02, -0.10, 0); // thumb
  for (let i = 0; i < 3; i++) {
    P(armL, 0.024, 0.050, 0.028, M.glove, 0.036, -0.026, 0.032 - i * 0.036, 0, 0, 0.24);
  }
  P(armL, 0.092, 0.094, 0.082, M.dark, -0.008, -0.098, 0.096, 0.16, -0.06, 0); // cuff
  P(armL, 0.090, 0.096, 0.36, sleeve, -0.048, -0.210, 0.245, 0.52, -0.26, 0);
  P(armL, 0.096, 0.102, 0.46, sleeve, -0.098, -0.395, 0.460, 0.68, -0.34, 0);
  return { armR, armL };
}
