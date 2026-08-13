import * as THREE from '../../vendor/three.module.js';
import { clamp, damp, lerp, sampleTrack } from '../core/math.js';
import { viewArmMaterials } from './weapons.js';

export const GRENADES_PER_LIFE = 2;
export const GRENADE_FUSE_SECONDS = 5;
export const GRENADE_MAX_DAMAGE = 300;
export const GRENADE_BLAST_RADIUS = 16.8;
export const GRENADE_STANDARD_DURABILITY = 150;
export const GRENADE_COVER_START = 0.5;
export const GRENADE_THROW_SPEED = 18;
export const GRENADE_UPWARD_SPEED = 2.6;
export const GRENADE_RADIUS = 0.12;
export const GRENADE_GRAVITY = 20;
export const GRENADE_THIRD_PERSON_THROW_SECONDS = 0.62;

const GRENADE_BOUNCE = 0.46;
const GRENADE_GROUND_FRICTION = 0.72;
export const GRENADE_PHYSICS_STEP = 1 / 70;
const GRENADE_REST_HORIZONTAL_SPEED = 0.08;
const MAX_PHYSICS_STEPS_PER_CALL = 140;

export function grenadeRestSyncNeeded(grenade) {
  return Boolean(grenade?.resting && !grenade?.restSyncSent);
}

export function grenadeDamage(distance, occluded = false) {
  const ratio = Math.max(0, Number(distance) || 0) / GRENADE_BLAST_RADIUS;
  if (occluded && ratio >= GRENADE_COVER_START) return 0;
  if (ratio <= 0.3) return GRENADE_MAX_DAMAGE;
  // Outer percentages are measured against a standard full-health/full-armor
  // soldier (100 HP + 50 armor). Multiplying the 300-point centre damage by
  // 60% would still deal 180 and leave the old 50% radius lethal.
  if (ratio <= 0.5) return GRENADE_STANDARD_DURABILITY * 0.6;
  if (ratio <= 0.8) return GRENADE_STANDARD_DURABILITY * 0.4;
  if (ratio <= 1) return GRENADE_STANDARD_DURABILITY * 0.2;
  return 0;
}

/**
 * Cover only protects targets in the outer half of the blast. `cast` is the
 * same bounded world-ray adapter used by grenade flight, so PVE and the
 * authoritative PVP server make the same decision without testing actors.
 */
export function grenadeBlastOccluded(origin, target, cast) {
  if (typeof cast !== 'function') return false;
  const direction = target.clone().sub(origin);
  const distance = direction.length();
  if (distance < GRENADE_BLAST_RADIUS * GRENADE_COVER_START || distance <= 0.05) {
    return false;
  }
  direction.multiplyScalar(1 / distance);
  return Boolean(cast(origin, direction, distance - 0.05));
}

export function grenadeThrowVelocity(direction, inheritedVelocity = null, out = new THREE.Vector3()) {
  out.copy(direction).normalize().multiplyScalar(GRENADE_THROW_SPEED);
  out.y += GRENADE_UPWARD_SPEED;
  if (inheritedVelocity) out.addScaledVector(inheritedVelocity, 0.35);
  return out;
}

export function grenadeInputAction({
  selected,
  pinned,
  leftPressed,
  leftDown = false,
  leftReleased,
  rightDown,
  impactFused = false,
  impactHeld = false,
}) {
  if (!selected) return 'none';
  // A lit bottle has no fuse to cook. A normal LMB click still quick-throws,
  // while RMB aiming changes LMB into hold-to-ready / release-to-throw.
  if (impactFused) {
    if (impactHeld) {
      if (leftReleased) return 'throw-direct';
      return leftDown ? 'none' : 'cancel-impact-hold';
    }
    if (!leftPressed) return 'none';
    if (rightDown && !leftReleased) return 'hold-impact';
    return 'throw-direct';
  }
  if (pinned) return leftReleased ? 'throw-cooked' : 'none';
  if (!leftPressed) return 'none';
  return rightDown ? 'pull-pin' : 'throw-direct';
}

/**
 * Deterministic, collider-agnostic grenade movement. `cast` has the same
 * signature as the server's rayWorld helper and the browser's scene raycast
 * adapter: (origin, direction, maxDistance) => { distance, normal } | null.
 */
export function advanceGrenade(grenade, dt, cast) {
  grenade.impactThisStep = false;
  if (grenade.impactLocked || grenade.resting) return grenade;
  let physicsDt = Math.max(0, Number(dt) || 0);
  if (Number.isFinite(Number(grenade.physicsLifeRemaining))) {
    const remaining = Math.max(0, Number(grenade.physicsLifeRemaining) || 0);
    physicsDt = Math.min(physicsDt, remaining);
    grenade.physicsLifeRemaining = Math.max(0, remaining - physicsDt);
  }
  if (physicsDt <= 0) return grenade;
  grenade.physicsRemainder = Math.max(
    0,
    Number(grenade.physicsRemainder) || 0
  ) + physicsDt;
  const direction = grenade.physicsDirection?.isVector3
    ? grenade.physicsDirection
    : new THREE.Vector3();
  grenade.physicsDirection = direction;
  let steps = 0;
  while (grenade.physicsRemainder + 1e-9 >= GRENADE_PHYSICS_STEP
    && steps < MAX_PHYSICS_STEPS_PER_CALL) {
    grenade.physicsRemainder -= GRENADE_PHYSICS_STEP;
    if (grenade.physicsRemainder < 1e-9) grenade.physicsRemainder = 0;
    steps++;
    const step = GRENADE_PHYSICS_STEP;
    grenade.velocity.y -= GRENADE_GRAVITY * step;
    const distance = grenade.velocity.length() * step;
    if (distance <= 1e-7) continue;
    direction.copy(grenade.velocity).normalize();
    const hit = cast(grenade.position, direction, distance + GRENADE_RADIUS);
    if (!hit) {
      grenade.position.addScaledVector(grenade.velocity, step);
      continue;
    }

    const normal = hit.normal || direction.clone().negate();
    const penetration = Math.max(0, GRENADE_RADIUS - hit.distance);
    grenade.position
      .addScaledVector(direction, Math.max(0, hit.distance - GRENADE_RADIUS))
      .addScaledVector(normal, penetration + 0.002);
    if (grenade.impactFused) {
      grenade.impactThisStep = true;
      grenade.impactLocked = true;
      grenade.impactNormal = normal.clone();
      grenade.velocity.set(0, 0, 0);
      grenade.physicsRemainder = 0;
      break;
    }
    const normalSpeed = grenade.velocity.dot(normal);
    if (normalSpeed < 0) {
      grenade.velocity.addScaledVector(normal, -(1 + GRENADE_BOUNCE) * normalSpeed);
    }
    if (normal.y > 0.55) {
      grenade.velocity.x *= GRENADE_GROUND_FRICTION;
      grenade.velocity.z *= GRENADE_GROUND_FRICTION;
      if (Math.abs(grenade.velocity.y) < 0.65) grenade.velocity.y = 0;
      const horizontalSpeed = Math.hypot(grenade.velocity.x, grenade.velocity.z);
      if (grenade.velocity.y === 0
        && horizontalSpeed <= GRENADE_REST_HORIZONTAL_SPEED) {
        grenade.velocity.set(0, 0, 0);
        grenade.resting = true;
        grenade.physicsRemainder = 0;
      }
    }
    grenade.bounces = (grenade.bounces || 0) + 1;
    if (grenade.resting) break;
  }
  return grenade;
}

function Box(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/**
 * Throwing hand. The forearm has to run all the way out of the frustum: at the
 * grenade's depth the frame is only ~0.6 group-units tall, so a short forearm
 * ends in a visible cut-off stump floating in the middle of the screen. It is
 * built long and swept down-right-back so the cap always clears the frame,
 * including through the throw's follow-through.
 */
function buildThrowHand(M) {
  const hand = new THREE.Group();
  hand.name = 'grenade-throw-hand';

  // Fist wrapping the grenade body: the palm slabs against the lever side,
  // the heel of the hand closes it off underneath.
  Box(hand, 0.072, 0.150, 0.150, M.glove, 0.116, -0.012, 0.010, 0, 0, -0.06);
  Box(hand, 0.150, 0.072, 0.140, M.glove, 0.062, -0.098, 0.012, 0, 0, -0.24);
  Box(hand, 0.132, 0.118, 0.128, M.knuckle, 0.150, -0.150, 0.030, 0, 0, -0.42);

  // Forearm + upper arm. Both are angled steeply DOWN as well as back, so the
  // limb leaves through the bottom of the frame the way the rifle's arms do.
  // A shallow, mostly-horizontal arm sweeps broadside across the view during
  // the throw and reads as a limb flying through your face.
  Box(hand, 0.150, 0.156, 0.70, M.sleeve, 0.201, -0.390, 0.198, 1.044, 0.293, -0.169);
  Box(hand, 0.230, 0.234, 1.90, M.sleeve, 0.440, -1.242, 0.742, 0.983, 0.201, -0.108);

  // Keep the front of every grenade unobstructed. The old four separate
  // knuckle bars sat on top of the body and read as black floating fingers.
  // The palm and thumb still make a complete grip without covering the model.
  // thumb laid across the top of the fist, behind the fuse
  Box(hand, 0.050, 0.038, 0.108, M.glove, 0.086, 0.078, 0.036, 0.34, 0.20, -0.12);
  return { hand, fingers: null };
}

/** Support hand: only ever on screen to strip the pin, then it clears out. */
function buildPinHand(M) {
  const arm = new THREE.Group();
  arm.name = 'grenade-left-pin-hand';
  Box(arm, 0.076, 0.060, 0.060, M.glove, 0, 0, 0);
  Box(arm, 0.058, 0.021, 0.027, M.knuckle, 0.036, 0.016, 0);
  Box(arm, 0.050, 0.023, 0.029, M.glove, 0.028, -0.019, 0.004, 0, 0, -0.25);
  Box(arm, 0.086, 0.062, 0.062, M.knuckle, -0.060, -0.026, 0.016, 0, 0, 0.22);
  // Same rule as the throwing arm: steeply down and to the left, so the limb
  // exits the bottom-left corner instead of lying across the middle of the
  // screen while the pin is stripped.
  Box(arm, 0.118, 0.120, 0.62, M.sleeve, -0.121, -0.267, 0.174, 1.044, -0.399, 0.232);
  Box(arm, 0.186, 0.188, 1.90, M.sleeve, -0.424, -1.062, 0.695, 0.968, -0.268, 0.141);
  arm.visible = false;
  return arm;
}

export function grenadeKind(value) {
  if (value === 'incendiary' || value === 'molotov') return value;
  return 'frag';
}

export function grenadeDetonationAudioCue(value) {
  const kind = grenadeKind(value);
  if (kind === 'molotov') return 'molotovBreak';
  if (kind === 'incendiary') return 'incendiaryIgnite';
  return 'fragGrenade';
}

export function grenadeCreatesFire(value) {
  const kind = grenadeKind(value);
  return kind === 'incendiary' || kind === 'molotov';
}

export function grenadeDetonatesOnImpact(value) {
  return grenadeKind(value) === 'molotov';
}

function buildMolotovModel(viewModel, { textures = null, team = 'blue' } = {}) {
  const group = new THREE.Group();
  const ordnance = new THREE.Group();
  ordnance.name = 'grenade-ordnance';
  group.add(ordnance);

  const glassMaterial = new THREE.MeshPhongMaterial({
    color: 0x31513a,
    transparent: true,
    opacity: 0.72,
    shininess: 92,
    specular: 0xa9d0b2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const liquidMaterial = new THREE.MeshLambertMaterial({
    color: 0x6f2412,
    emissive: 0x2a0702,
    emissiveIntensity: 0.34,
  });
  const labelMaterial = new THREE.MeshLambertMaterial({ color: 0xd7c49a });
  const labelInkMaterial = new THREE.MeshLambertMaterial({ color: 0x32150c });
  const clothMaterial = new THREE.MeshLambertMaterial({ color: 0xbda77d });
  const charMaterial = new THREE.MeshLambertMaterial({ color: 0x21150f });
  const outerFlameMaterial = new THREE.MeshBasicMaterial({
    color: 0xff5a08,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const innerFlameMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe46a,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.061, 0.061, 0.168, 12),
    liquidMaterial
  );
  liquid.name = 'molotov-fuel';
  liquid.position.y = -0.018;
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.071, 0.073, 0.228, 12),
    glassMaterial
  );
  bottle.name = 'molotov-bottle';
  bottle.position.y = -0.010;
  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.071, 0.022, 12),
    glassMaterial
  );
  bottom.position.y = -0.130;
  const shoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.071, 0.060, 12),
    glassMaterial
  );
  shoulder.position.y = 0.128;
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.030, 0.034, 0.092, 10),
    glassMaterial
  );
  neck.position.y = 0.202;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.006, 6, 12), glassMaterial);
  lip.name = 'molotov-bottle-lip';
  lip.position.y = 0.249;
  lip.rotation.x = Math.PI / 2;
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.074, 0.074, 0.072, 12, 1, true),
    labelMaterial
  );
  label.name = 'molotov-label';
  label.position.y = -0.016;
  const labelStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.009, 0.020, 0.144),
    labelInkMaterial
  );
  labelStripe.position.set(0.070, -0.016, 0);
  ordnance.add(liquid, bottle, bottom, shoulder, neck, lip, label, labelStripe);

  const wick = Box(
    ordnance, 0.026, 0.110, 0.028, clothMaterial,
    0.009, 0.298, 0, 0, 0, -0.16
  );
  wick.name = 'molotov-wick';
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.008, 5, 10), clothMaterial);
  wrap.position.y = 0.252;
  wrap.rotation.x = Math.PI / 2;
  const charredTip = Box(
    ordnance, 0.029, 0.040, 0.031, charMaterial,
    0.017, 0.355, 0, 0, 0, -0.16
  );
  charredTip.name = 'molotov-charred-wick';
  ordnance.add(wrap);

  const flamePivot = new THREE.Group();
  flamePivot.name = 'molotov-wick-flame';
  flamePivot.position.set(0.021, 0.397, 0);
  const outerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.032, 0.095, 6),
    outerFlameMaterial
  );
  outerFlame.position.y = 0.042;
  const innerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.015, 0.058, 6),
    innerFlameMaterial
  );
  innerFlame.position.y = 0.026;
  flamePivot.add(outerFlame, innerFlame);
  ordnance.add(flamePivot);
  const wickLight = new THREE.PointLight(0xff6c1d, 0.72, 1.6, 2);
  wickLight.position.set(0.02, 0.42, 0);
  ordnance.add(wickLight);

  let hand = null;
  if (viewModel) {
    const throwHand = buildThrowHand(viewArmMaterials(textures, team));
    hand = throwHand.hand;
    group.add(hand);
  }

  const dummyPin = new THREE.Group();
  const dummyLever = new THREE.Object3D();
  group.userData.pinParts = [];
  group.userData.pinAssembly = dummyPin;
  group.userData.ordnance = ordnance;
  group.userData.leftPullHand = null;
  group.userData.fingers = null;
  group.userData.lever = dummyLever;
  group.userData.kind = 'molotov';
  group.userData.hasPin = false;
  group.userData.ownedMaterials = [
    glassMaterial,
    liquidMaterial,
    labelMaterial,
    labelInkMaterial,
    clothMaterial,
    charMaterial,
    outerFlameMaterial,
    innerFlameMaterial,
  ];
  group.userData.updateVisual = (time = 0) => {
    const flicker = 0.88
      + Math.sin(time * 17.0) * 0.12
      + Math.sin(time * 27.0 + 0.8) * 0.06;
    flamePivot.scale.set(
      0.90 + Math.sin(time * 13.5) * 0.11,
      flicker,
      0.90 + Math.cos(time * 15.2) * 0.10
    );
    flamePivot.rotation.z = Math.sin(time * 8.2) * 0.14;
    wickLight.intensity = 0.62 + Math.sin(time * 19.0) * 0.10;
  };
  return group;
}

export function buildGrenadeModel(
  viewModel = false,
  { textures = null, team = 'blue', kind = 'frag' } = {}
) {
  const grenadeType = grenadeKind(kind);
  if (grenadeType === 'molotov') {
    return buildMolotovModel(viewModel, { textures, team });
  }
  const incendiary = grenadeType === 'incendiary';
  const group = new THREE.Group();
  // The ordnance lives in its own group so the throw animation can hand the
  // grenade off to the world projectile and keep animating an empty fist.
  const ordnance = new THREE.Group();
  ordnance.name = 'grenade-ordnance';
  group.add(ordnance);

  const bodyMaterial = new THREE.MeshLambertMaterial({
    color: incendiary ? 0x343a3d : 0x53613a,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  const grooveMaterial = new THREE.MeshLambertMaterial({
    color: incendiary ? 0x1c2022 : 0x303923,
  });
  const darkMaterial = new THREE.MeshLambertMaterial({
    color: incendiary ? 0x252a2d : 0x242a20,
  });
  const metalMaterial = new THREE.MeshLambertMaterial({ color: 0xc4c8bf });
  const wornMetalMaterial = new THREE.MeshLambertMaterial({ color: 0x696f68 });
  const hotBandMaterial = incendiary
    ? new THREE.MeshLambertMaterial({
      color: 0xc52d32,
      emissive: 0x2a0203,
      emissiveIntensity: 0.22,
    })
    : null;

  // The incendiary is a straight, tall canister. The fragmentation grenade
  // keeps its compact ribbed body; only the fuse hardware is shared.
  const body = new THREE.Mesh(
    incendiary
      ? new THREE.CylinderGeometry(0.073, 0.073, 0.250, 14)
      : new THREE.CylinderGeometry(0.09, 0.09, 0.16, 10),
    bodyMaterial
  );
  body.name = incendiary ? 'incendiary-canister' : 'frag-grenade-body';
  body.position.y = incendiary ? -0.015 : 0;
  const top = new THREE.Mesh(
    incendiary
      ? new THREE.CylinderGeometry(0.073, 0.073, 0.026, 14)
      : new THREE.CylinderGeometry(0.082, 0.09, 0.032, 10),
    bodyMaterial
  );
  top.position.y = incendiary ? 0.115 : 0.083;
  const bottom = new THREE.Mesh(
    incendiary
      ? new THREE.CylinderGeometry(0.073, 0.073, 0.026, 14)
      : new THREE.CylinderGeometry(0.09, 0.076, 0.032, 10),
    bodyMaterial
  );
  bottom.position.y = incendiary ? -0.145 : -0.083;
  ordnance.add(body, top, bottom);

  if (incendiary) {
    // One continuous red identification stripe wraps the centre of the dark
    // grey canister. Dark end collars keep the silhouette cylindrical.
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0755, 0.0755, 0.025, 14),
      hotBandMaterial
    );
    band.position.y = -0.015;
    band.name = 'incendiary-band';
    ordnance.add(band);
    for (const y of [-0.134, 0.104]) {
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.0735, 0.0035, 5, 16),
        grooveMaterial
      );
      collar.name = 'incendiary-end-collar';
      collar.position.y = y;
      collar.rotation.x = Math.PI / 2;
      ordnance.add(collar);
    }
  } else {
    for (const y of [-0.052, 0, 0.052]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.091, 0.0045, 4, 12), grooveMaterial);
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      ordnance.add(ring);
    }
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.158, 0.018), grooveMaterial);
      const angle = i * Math.PI / 2;
      rib.position.set(Math.cos(angle) * 0.087, 0, Math.sin(angle) * 0.087);
      rib.rotation.y = -angle;
      ordnance.add(rib);
    }
  }

  const shoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.082, 0.052, 10),
    darkMaterial
  );
  shoulder.position.y = 0.112;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.048, 0.048, 10), darkMaterial);
  neck.position.y = 0.153;
  const fuseCap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.039, 0.028, 8), wornMetalMaterial);
  fuseCap.position.y = 0.188;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.018, 0.15), metalMaterial);
  lever.position.set(0.019, 0.198, 0.031);
  lever.rotation.x = -0.12;
  const leverHinge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.052, 8),
    wornMetalMaterial
  );
  leverHinge.position.set(0.019, 0.19, -0.036);
  leverHinge.rotation.z = Math.PI / 2;

  // The pin is one articulated assembly: a shaft exits the fuse housing,
  // bends down, and actually touches the pull ring instead of floating in its
  // centre.
  const pinAssembly = new THREE.Group();
  pinAssembly.name = 'grenade-pin-assembly';
  const pinStem = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.013, 0.013), metalMaterial);
  pinStem.position.set(-0.035, 0.157, 0);
  const pinElbow = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.036, 0.013), metalMaterial);
  pinElbow.position.set(-0.066, 0.143, 0);
  const pin = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0058, 6, 16), metalMaterial);
  pin.name = 'grenade-pin';
  pin.position.set(-0.066, 0.111, 0);
  pinAssembly.add(pinStem, pinElbow, pin);
  ordnance.add(shoulder, neck, fuseCap, lever, leverHinge, pinAssembly);

  let pinHand = null;
  let fingers = null;
  if (viewModel) {
    const M = viewArmMaterials(textures, team);
    const throwHand = buildThrowHand(M);
    fingers = throwHand.fingers;
    if (incendiary) throwHand.hand.position.x = -0.018;
    group.add(throwHand.hand);
    pinHand = buildPinHand(M);
    pinHand.position.set(-0.12, 0.115, 0.015);
    pinHand.rotation.z = 0.08;
    group.add(pinHand);
  }
  group.userData.pinParts = [pin, pinStem, pinElbow];
  group.userData.pinAssembly = pinAssembly;
  group.userData.ordnance = ordnance;
  group.userData.leftPullHand = pinHand;
  group.userData.fingers = fingers;
  group.userData.lever = lever;
  group.userData.kind = grenadeType;
  group.userData.hasPin = true;
  group.userData.ownedMaterials = [
    bodyMaterial,
    grooveMaterial,
    darkMaterial,
    metalMaterial,
    wornMetalMaterial,
    ...(hotBandMaterial ? [hotBandMaterial] : []),
  ];
  return group;
}

export class GrenadeTrajectory {
  constructor(scene, count = 36) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.blocks = [];
    // Additive and depth-test-off so the arc stays legible against dark
    // interiors and reads through the geometry between you and the impact
    // point - a guide you have to hunt for is not a guide.
    const geometry = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xff4a3a,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const block = new THREE.Mesh(geometry, material);
      block.frustumCulled = false;
      block.renderOrder = 12;
      this.group.add(block);
      this.blocks.push(block);
    }
    this.impactMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff5540,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    this.impactMarker.visible = false;
    this.impactMarker.frustumCulled = false;
    this.impactMarker.renderOrder = 13;
    this.group.add(this.impactMarker);
    // A flat ring on the impact surface: the sphere alone reads as floating,
    // and the ring is what actually tells you where the blast is centred.
    this.impactRing = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.40, 20),
      new THREE.MeshBasicMaterial({
        color: 0xff3a2a,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      })
    );
    this.impactRing.visible = false;
    this.impactRing.frustumCulled = false;
    this.impactRing.renderOrder = 13;
    this.group.add(this.impactRing);
    scene.add(this.group);
    this._previous = new THREE.Vector3();
    this._point = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._normal = new THREE.Vector3();
  }

  hide() {
    this.group.visible = false;
  }

  update({ visible, origin, velocity, time, cast }) {
    this.group.visible = Boolean(visible);
    if (!this.group.visible) return;
    const step = 0.055;
    const flow = (time * 1.7) % 1;
    this._previous.copy(origin);
    let stopped = false;
    this.impactMarker.visible = false;
    this.impactRing.visible = false;
    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];
      if (stopped) {
        block.visible = false;
        continue;
      }
      const t = (i + 0.06 + flow * 0.55) * step;
      this._point.copy(origin).addScaledVector(velocity, t);
      this._point.y -= 0.5 * GRENADE_GRAVITY * t * t;
      this._direction.subVectors(this._point, this._previous);
      const distance = this._direction.length();
      if (distance <= 1e-6) {
        block.visible = false;
        continue;
      }
      this._direction.multiplyScalar(1 / distance);
      const hit = cast(this._previous, this._direction, distance);
      if (hit) {
        this._point.copy(this._previous)
          .addScaledVector(this._direction, Math.max(0, hit.distance - GRENADE_RADIUS));
        this.impactMarker.visible = true;
        this.impactMarker.position.copy(this._point);
        this._normal.copy(hit.normal || this._direction.clone().negate());
        this.impactMarker.position.addScaledVector(this._normal, 0.035);
        this.impactRing.visible = true;
        this.impactRing.position.copy(this._point).addScaledVector(this._normal, 0.045);
        this.impactRing.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          this._normal
        );
        stopped = true;
      }
      block.visible = true;
      block.position.copy(this._point);
      const pulse = 0.5 + 0.5 * Math.sin(i * 0.9 - time * 10);
      block.material.opacity = 0.62 + pulse * 0.38;
      const nearHandTaper = Math.min(1, 0.34 + i * 0.085);
      block.scale.setScalar((0.92 + pulse * 0.40) * nearHandTaper);
      this._previous.copy(this._point);
    }
    if (this.impactMarker.visible) {
      const markerPulse = 0.88 + Math.sin(time * 8) * 0.13;
      this.impactMarker.scale.setScalar(markerPulse);
      this.impactMarker.material.opacity = 0.72 + Math.sin(time * 8) * 0.18;
      this.impactRing.scale.setScalar(0.94 + Math.sin(time * 8) * 0.14);
      this.impactRing.material.opacity = 0.58 + Math.sin(time * 8) * 0.20;
    }
  }
}

const POSE_KEYS = ['px', 'py', 'pz', 'rx', 'ry', 'rz'];

// Poses are authored in viewmodel camera space, same as the weapon hip/ADS
// offsets. +x is right, +z is toward the eye.
const CARRY_POSE = { px: 0.252, py: -0.232, pz: -0.660, rx: -0.22, ry: -0.34, rz: 0.18 };
// Right mouse readies the throw: the grenade comes up to the eye line and
// turns its fuse toward the camera, which is what the arc preview reads off.
const READY_POSE = { px: 0.224, py: -0.146, pz: -0.596, rx: -0.36, ry: -0.24, rz: 0.21 };
// Pin out, lever clamped: the arm draws back beside the ear. This doubles as
// the throw's wind-up, so cooking a grenade never has a dead pose.
const COCK_POSE = { px: 0.318, py: -0.062, pz: -0.470, rx: -0.60, ry: -0.09, rz: 0.34 };
// Sprint drops the whole assembly to the hip and turns the shoulder in.
const SPRINT_POSE = { px: 0.302, py: -0.372, pz: -0.616, rx: 0.12, ry: -0.56, rz: 0.30 };

// A throw is wind-up, release, follow-through. The projectile spawns in the
// world on the input, so the ordnance is hidden from frame zero and only the
// arm plays out - which is why the wind-up here is very short: it reads as the
// tail of a motion the player already committed to.
//
// The follow-through sweeps down and across the body rather than pitching the
// forearm up. Rotating the arm past about -0.8 rad swings its far end back
// into the frustum, which puts a cut-off elbow in the middle of the screen.
const THROW_TRACK = [
  { t: 0.00, px: 0.000, py: 0.000, pz: 0.000, rx: 0.00, ry: 0.00, rz: 0.00 },
  { t: 0.16, px: 0.070, py: 0.080, pz: 0.130, rx: 0.34, ry: 0.24, rz: -0.16 },
  { t: 0.42, px: -0.120, py: -0.090, pz: -0.250, rx: -0.46, ry: -0.34, rz: 0.30 },
  { t: 0.66, px: -0.230, py: -0.330, pz: -0.090, rx: -0.62, ry: -0.62, rz: 0.58 },
  { t: 1.00, px: -0.190, py: -0.560, pz: 0.070, rx: -0.34, ry: -0.40, rz: 0.36 },
];

// Bringing a grenade out: it swings up from below the frame and settles.
const DRAW_TRACK = [
  { t: 0.00, px: 0.075, py: -0.520, pz: 0.080, rx: 0.85, ry: 0.34, rz: -0.28 },
  { t: 0.62, px: -0.014, py: 0.036, pz: -0.020, rx: -0.10, ry: -0.05, rz: 0.04 },
  { t: 1.00, px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 },
];

function blendPose(out, from, to, t) {
  for (const k of POSE_KEYS) out[k] = lerp(from[k], to[k], t);
  return out;
}

export class GrenadeView {
  constructor(scene, { textures = null, team = 'blue', kind = 'frag' } = {}) {
    this.scene = scene;
    this.textures = textures;
    this.team = team;
    this.kind = grenadeKind(kind);
    this.group = buildGrenadeModel(true, {
      textures,
      team,
      kind: this.kind,
    });
    this.group.visible = false;
    this.group.scale.setScalar(0.58);
    scene.add(this.group);
    this.selected = false;
    this.pinned = false;
    this.aimBlend = 0;
    this.cockBlend = 0;
    this.sprintBlend = 0;
    this.gripBlend = 0;
    this.pinPullTime = -1;
    this.pinPullDuration = 0.62;
    this.throwTime = -1;
    this.throwDuration = 0.38;
    this.drawTime = -1;
    this.drawDuration = 0.30;
    this.bobPhase = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bindModel();
    this.pose = { ...CARRY_POSE };
    this.time = 0;
  }

  bindModel() {
    this.pinAssembly = this.group.userData.pinAssembly;
    this.ordnance = this.group.userData.ordnance;
    this.leftPullHand = this.group.userData.leftPullHand;
    this.fingers = this.group.userData.fingers;
    this.fingerRest = (this.fingers ? this.fingers.children : []).map((f) => ({
      x: f.rotation.x,
      z: f.rotation.z,
      spread: f.userData.spread || 0,
    }));
    this.lever = this.group.userData.lever;
  }

  setKind(kind) {
    const next = grenadeKind(kind);
    if (next === this.kind) return false;
    const previous = this.group;
    this.scene.remove(previous);
    previous.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
    });
    for (const material of previous.userData.ownedMaterials || []) material.dispose();

    this.kind = next;
    this.group = buildGrenadeModel(true, {
      textures: this.textures,
      team: this.team,
      kind: this.kind,
    });
    this.group.scale.setScalar(0.58);
    this.group.visible = false;
    this.scene.add(this.group);
    this.bindModel();

    this.selected = false;
    this.pinned = false;
    this.aimBlend = 0;
    this.cockBlend = 0;
    this.sprintBlend = 0;
    this.gripBlend = 0;
    this.pinPullTime = -1;
    this.throwTime = -1;
    this.drawTime = -1;
    this.ordnance.visible = true;
    this.pinAssembly.visible = true;
    if (this.leftPullHand) this.leftPullHand.visible = false;
    return true;
  }

  setSelected(selected) {
    const next = Boolean(selected);
    if (next && !this.selected && !this.throwing) {
      this.drawTime = 0;
      this.ordnance.visible = true;
    }
    this.selected = next;
    this.group.visible = this.selected || this.throwing;
    if (!this.selected) {
      this.aimBlend = 0;
      this.drawTime = -1;
    }
  }

  get throwing() {
    return this.throwTime >= 0;
  }

  setPinned(pinned, animate = true) {
    const next = Boolean(pinned);
    if (next === this.pinned) return;
    this.pinned = next;
    if (this.pinned && animate) {
      this.pinPullTime = 0;
      this.pinAssembly.visible = true;
      if (this.leftPullHand) this.leftPullHand.visible = true;
      return;
    }
    this.pinPullTime = -1;
    this.pinAssembly.visible = !this.pinned;
    this.pinAssembly.position.set(0, 0, 0);
    this.pinAssembly.rotation.set(0, 0, 0);
    this.lever.rotation.x = -0.12;
    if (this.leftPullHand) this.leftPullHand.visible = false;
  }

  reset() {
    this.throwTime = -1;
    this.drawTime = -1;
    this.setPinned(false);
    this.setSelected(false);
    this.cockBlend = 0;
    this.sprintBlend = 0;
    this.gripBlend = 0;
    this.ordnance.visible = true;
    this.group.visible = false;
  }

  playThrow() {
    this.throwTime = 0;
    this.drawTime = -1;
    this.selected = false;
    this.group.visible = true;
    this.pinPullTime = -1;
    this.pinAssembly.visible = false;
    // The projectile exists in the world the instant the throw is requested,
    // so the hand has to be empty for every frame of the follow-through.
    this.ordnance.visible = false;
    if (this.leftPullHand) this.leftPullHand.visible = false;
  }

  /**
   * Grip tension. 1 clamps the fingers onto the safety lever (pin is out and
   * only the hand is holding the fuse shut), -1 splays them open on release.
   */
  applyGrip(u) {
    if (!this.fingers) return;
    const children = this.fingers.children;
    for (let i = 0; i < children.length; i++) {
      const rest = this.fingerRest[i];
      children[i].rotation.x = rest.x + u * 0.34;
      children[i].rotation.z = rest.z + Math.max(0, -u) * rest.spread;
    }
  }

  updatePinPull(dt) {
    if (this.pinPullTime < 0) return;
    this.pinPullTime += dt;
    const t = Math.min(1, this.pinPullTime / this.pinPullDuration);
    const grab = Math.min(1, t / 0.3);
    const pull = Math.max(0, (t - 0.3) / 0.7);
    const smoothGrab = grab * grab * (3 - 2 * grab);
    const smoothPull = pull * pull * (3 - 2 * pull);

    if (this.leftPullHand) {
      this.leftPullHand.visible = true;
      this.leftPullHand.position.set(
        -0.25 + smoothGrab * 0.13 - smoothPull * 0.17,
        -0.045 + smoothGrab * 0.16 - smoothPull * 0.055,
        0.115 - smoothGrab * 0.1 + smoothPull * 0.065
      );
      this.leftPullHand.rotation.set(
        -0.18 + smoothGrab * 0.18,
        -0.28 + smoothGrab * 0.28 + smoothPull * 0.25,
        0.22 - smoothGrab * 0.14 - smoothPull * 0.65
      );
    }

    this.pinAssembly.position.set(
      -smoothPull * 0.17,
      -smoothPull * 0.055,
      smoothPull * 0.12
    );
    this.pinAssembly.rotation.set(
      smoothPull * 0.55,
      smoothPull * 0.35,
      -smoothPull * 1.25
    );
    this.lever.rotation.x = -0.12 - smoothPull * 0.08;

    if (t >= 1) {
      this.pinPullTime = -1;
      this.pinAssembly.visible = false;
      if (this.leftPullHand) this.leftPullHand.visible = false;
    }
  }

  update(dt, {
    selected, aiming, pinned, sprinting, dead,
    moveSpeed = 0, grounded = true, lookDx = 0, lookDy = 0,
  }) {
    this.time += dt;
    this.group.userData.updateVisual?.(this.time);
    if (dead) {
      this.reset();
      return;
    }
    this.setSelected(selected);
    if (!this.throwing) this.setPinned(pinned);
    this.updatePinPull(dt);
    if (!this.group.visible) return;

    /* -------- blends -------- */
    const throwing = this.throwing;
    this.aimBlend = damp(this.aimBlend, aiming && !throwing ? 1 : 0, 11, dt);
    this.cockBlend = damp(this.cockBlend, this.pinned && !throwing ? 1 : 0, 9, dt);
    this.sprintBlend = damp(this.sprintBlend, sprinting && !throwing && !this.pinned ? 1 : 0, 9, dt);
    // A pinned grenade is only held shut by the fist, so the grip tightens the
    // moment the pin clears and snaps open the instant it is thrown.
    this.gripBlend = damp(this.gripBlend, throwing ? -1 : this.cockBlend, throwing ? 26 : 12, dt);
    this.applyGrip(this.gripBlend);

    /* -------- carry -> ready -> cocked -> sprint -------- */
    const pose = blendPose(this.pose, CARRY_POSE, READY_POSE, this.aimBlend);
    blendPose(pose, pose, COCK_POSE, this.cockBlend);
    blendPose(pose, pose, SPRINT_POSE, this.sprintBlend);

    /* -------- bob, breathing and look sway -------- */
    const speed = Math.max(0, moveSpeed);
    const moving = speed > 0.4 && grounded;
    if (moving) this.bobPhase += dt * lerp(7.6, 11.5, clamp(speed / 6, 0, 1));
    else this.bobPhase = damp(this.bobPhase, Math.round(this.bobPhase / Math.PI) * Math.PI, 6, dt);
    const bobAmt = clamp(speed / 5.2, 0, 1.25) * (1 - this.aimBlend * 0.5);
    this.swayX = damp(this.swayX, clamp(-lookDx * 0.9, -1.6, 1.6), 16, dt);
    this.swayY = damp(this.swayY, clamp(lookDy * 0.9, -1.6, 1.6), 16, dt);

    pose.px += Math.sin(this.bobPhase) * 0.020 * bobAmt + this.swayX * 0.030;
    pose.py += -Math.abs(Math.cos(this.bobPhase)) * 0.017 * bobAmt
      + Math.sin(this.time * 1.7 + 1.1) * 0.0035 * (1 - this.aimBlend * 0.7)
      + this.swayY * 0.028;
    pose.pz += Math.sin(this.time * 1.15) * 0.0030 * (1 - this.aimBlend * 0.7);
    pose.rx += Math.abs(Math.cos(this.bobPhase)) * 0.014 * bobAmt - this.swayY * 0.06;
    pose.ry += -this.swayX * 0.065;
    pose.rz += Math.sin(this.bobPhase) * 0.034 * bobAmt + this.swayX * 0.032;

    /* -------- draw -------- */
    if (this.drawTime >= 0) {
      this.drawTime += dt;
      const u = clamp(this.drawTime / this.drawDuration, 0, 1);
      const draw = sampleTrack(DRAW_TRACK, u, POSE_KEYS);
      for (const k of POSE_KEYS) pose[k] += draw[k];
      if (u >= 1) this.drawTime = -1;
    }

    /* -------- throw -------- */
    if (throwing) {
      this.throwTime += dt;
      const u = clamp(this.throwTime / this.throwDuration, 0, 1);
      const swing = sampleTrack(THROW_TRACK, u, POSE_KEYS);
      for (const k of POSE_KEYS) pose[k] += swing[k];
      if (u >= 1) {
        this.throwTime = -1;
        this.pinned = false;
        this.pinAssembly.visible = true;
        this.pinAssembly.position.set(0, 0, 0);
        this.pinAssembly.rotation.set(0, 0, 0);
        this.lever.rotation.x = -0.12;
        this.ordnance.visible = true;
        this.cockBlend = 0;
        this.group.visible = false;
      }
    }

    this.group.position.set(pose.px, pose.py, pose.pz);
    this.group.rotation.set(pose.rx, pose.ry, pose.rz);
  }
}
