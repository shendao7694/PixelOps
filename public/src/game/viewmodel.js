// First-person weapon: pose blending, bob, sway, recoil springs, reload /
// pump / bolt keyframe animation, muzzle flash and shell ejection, plus all
// the firing logic (ammo, fire rate, spread).
import * as THREE from '../../vendor/three.module.js';
import { clamp, lerp, damp, Spring, sampleTrack, rand } from '../core/math.js';
import {
  advanceFireCooldown,
  beginFireCooldown,
} from './fire-cadence.js';
import {
  WEAPON_DEFS,
  WEAPON_ORDER,
  buildWeapon,
  buildViewArms,
  playerWeaponSpread,
} from './weapons.js';
import {
  sidearmReloadComponentPose,
  updateSidearmReloadComponent,
} from './sidearm-reload.js';
import {
  COMBAT_KNIFE_DRAW_SECONDS,
  combatKnifeFlipPose,
} from './melee.js';
import { JUGGERNAUT_SPRINT_BOB_RATE_SCALE } from './juggernaut.js';
import {
  laserCannonChargeInputValid,
  laserCannonChargeProgress,
} from './laser-cannon.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TRACK_KEYS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'ax', 'ay', 'az'];

// Weapons are modelled at true scale (a rifle is 0.9 m long); viewmodels are
// traditionally shrunk so they read well inside the FOV instead of filling it.
const VM_SCALE = 0.62;

// The code-built sidearms have deliberately chunky silhouettes so they stay
// readable in third person. Give only their first-person copies more camera
// distance by scaling the complete held pose (weapon and hands together).
// Primary and world models remain at their authored scale.
export const FIRST_PERSON_WEAPON_SCALES = Object.freeze({
  machine_pistol: 0.76,
  desert_eagle: 0.72,
});

// Camera-space model recoil is deliberately separate from ballistic spread
// and camera kick. Every shot visibly drives the complete held weapon straight
// back toward the player. Pullback/recovery define the low, medium and high
// weapon classes without adding any recoil-driven left/right model deviation.
export const FIREARM_VISUAL_RECOIL = Object.freeze({
  rifle: Object.freeze({
    pullback: 0.050, recover: 12.5,
  }),
  smg: Object.freeze({
    pullback: 0.032, recover: 17.0,
  }),
  machine_pistol: Object.freeze({
    pullback: 0.027, recover: 19.0,
  }),
  desert_eagle: Object.freeze({
    pullback: 0.176, recover: 9.0,
  }),
  shotgun: Object.freeze({
    pullback: 0.095, recover: 8.5,
  }),
  sniper: Object.freeze({
    pullback: 0.210, recover: 7.5,
  }),
  railgun: Object.freeze({
    pullback: 0.235, recover: 7.0,
  }),
  minigun: Object.freeze({
    pullback: 0.025, recover: 20.0,
  }),
});

// magazine change: lower + tilt, drop mag, insert, chamber, recover
const RELOAD_TRACK = [
  { t: 0.00, px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, ax: 0, ay: 0, az: 0 },
  { t: 0.16, px: 0.02, py: -0.09, pz: 0.03, rx: 0.20, ry: 0.42, rz: -0.30, ax: 0, ay: -0.05, az: 0 },
  { t: 0.30, px: 0.02, py: -0.10, pz: 0.03, rx: 0.22, ry: 0.46, rz: -0.34, ax: -0.05, ay: -0.30, az: 0.08 },
  { t: 0.52, px: 0.02, py: -0.11, pz: 0.02, rx: 0.20, ry: 0.44, rz: -0.30, ax: -0.02, ay: -0.06, az: 0.02 },
  { t: 0.68, px: 0.015, py: -0.07, pz: 0.02, rx: 0.14, ry: 0.30, rz: -0.20, ax: 0, ay: 0.02, az: 0 },
  { t: 0.84, px: 0.005, py: -0.03, pz: 0.06, rx: 0.05, ry: 0.10, rz: -0.06, ax: 0, ay: 0, az: 0 },
  { t: 1.00, px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, ax: 0, ay: 0, az: 0 },
];

const RELOAD_EVENTS = [
  { t: 0.20, stage: 'magOut' },
  { t: 0.52, stage: 'magIn' },
  { t: 0.78, stage: 'bolt', onlyEmpty: true },
];

// single shell into the tube
const SHELL_TRACK = [
  { t: 0.00, px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, ax: 0, ay: 0, az: 0 },
  { t: 0.35, px: 0.01, py: -0.06, pz: 0.02, rx: 0.10, ry: 0.30, rz: -0.45, ax: 0, ay: -0.16, az: 0 },
  { t: 0.65, px: 0.01, py: -0.06, pz: 0.02, rx: 0.10, ry: 0.32, rz: -0.48, ax: 0, ay: -0.02, az: 0 },
  { t: 1.00, px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, ax: 0, ay: 0, az: 0 },
];

const MELEE_TRACK = [
  { t: 0.00, px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, ax: 0, ay: 0, az: 0 },
  { t: 0.16, px: 0.105, py: 0.045, pz: 0.090, rx: -0.18, ry: -0.42, rz: 0.34, ax: 0, ay: 0, az: 0 },
  { t: 0.34, px: -0.195, py: 0.010, pz: -0.230, rx: 0.30, ry: 0.92, rz: -1.18, ax: 0, ay: 0, az: 0 },
  { t: 0.56, px: -0.105, py: -0.035, pz: -0.105, rx: 0.16, ry: 0.45, rz: -0.62, ax: 0, ay: 0, az: 0 },
  { t: 0.78, px: 0.025, py: -0.025, pz: 0.025, rx: -0.04, ry: -0.12, rz: 0.18, ax: 0, ay: 0, az: 0 },
  { t: 1.00, px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, ax: 0, ay: 0, az: 0 },
];

// The hand draws a compact figure-eight while the knife and both handle
// halves rotate around the grip. The large rotations live on the knife model,
// not the arm, so the forearm never sweeps across the player's whole view.
const KNIFE_DRAW_TRACK = [
  { t: 0.00, px: 0.135, py: -0.285, pz: 0.130, rx: 0.62, ry: -0.36, rz: 0.52 },
  { t: 0.20, px: 0.070, py: -0.125, pz: 0.075, rx: -0.18, ry: 0.34, rz: -0.30 },
  { t: 0.43, px: -0.045, py: 0.030, pz: -0.035, rx: 0.24, ry: -0.28, rz: 0.32 },
  { t: 0.67, px: 0.038, py: 0.055, pz: -0.012, rx: -0.13, ry: 0.18, rz: -0.19 },
  { t: 0.84, px: 0.012, py: 0.012, pz: 0.005, rx: 0.05, ry: -0.07, rz: 0.08 },
  { t: 1.00, px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 },
];

export class ViewModel {
  constructor({ textures, audio, settings, team = 'blue' }) {
    this.textures = textures;
    this.audio = audio;
    this.settings = settings;
    this.team = team;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.005, 12);

    // viewmodel lighting lives in camera space so it never flickers
    this.scene.add(new THREE.AmbientLight(0x8899aa, 1.35));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.9);
    key.position.set(-0.6, 1.0, 0.7);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6f8fb8, 0.9);
    rim.position.set(0.8, -0.2, -0.6);
    this.scene.add(rim);

    this.holder = new THREE.Group();     // pose (bob/sway/recoil)
    this.holder.scale.setScalar(VM_SCALE);
    this.scene.add(this.holder);
    this.weaponRoot = new THREE.Group(); // per-weapon offset
    this.holder.add(this.weaponRoot);

    const arms = buildViewArms(textures, team);
    this.armR = arms.armR;
    this.armL = arms.armL;
    this.armLHolder = new THREE.Group();
    this.armLHolder.add(this.armL);

    // muzzle flash: two crossed additive quads + a light. Depth-tested so the
    // gun body occludes it - untested it glowed straight through the model.
    const flashMat = new THREE.MeshBasicMaterial({
      map: textures.flash, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
    this.flash = new THREE.Group();
    const q1 = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), flashMat);
    const q2 = q1.clone();
    q2.rotation.z = Math.PI / 4;
    const q3 = q1.clone();
    q3.rotation.y = Math.PI / 2;
    this.flash.add(q1, q2, q3);
    this.flash.visible = false;
    this.flash.renderOrder = 10;
    this.scene.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffcc77, 0, 3.5, 2);
    this.scene.add(this.flashLight);

    this.ammo = {};
    for (const id of WEAPON_ORDER) {
      this.ammo[id] = { mag: WEAPON_DEFS[id].mag, reserve: WEAPON_DEFS[id].reserve };
    }

    this.def = null;
    this.model = null;
    this.anchors = null;
    this.weaponScale = 1;
    this.slot = 0;

    /* animation state */
    this.bobPhase = 0;
    this.adsBlend = 0;
    this.sprintBlend = 0;
    this.slideBlend = 0;
    this.swayX = new Spring(90, 15);
    this.swayY = new Spring(90, 15);
    this.kickZ = new Spring(190, 16);
    this.kickY = new Spring(170, 15);
    this.kickPitch = new Spring(150, 13);
    this.visualKickDepth = 0;
    this.scopeRecoil = 0;
    this.slideSpring = new Spring(300, 22);
    this.landDip = new Spring(120, 14);

    this.fireTimer = 0;
    this.cycleTimer = 0;      // pump / bolt
    this.cycleTotal = 0;
    this.cycleKind = null;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadTotal = 0;
    this.reloadWasEmpty = false;
    this.reloadEventIdx = 0;
    this.switchT = 0;
    this.switchTotal = 0;
    this.switchSwapAt = 0;
    this.pendingWeapon = null;
    this.triggerWasDown = false;
    this.flashTimer = 0;
    this.recoilAccum = 0;
    this.barrelSpinSpeed = 0;
    this.spinUpT = 0;
    this.chargeT = 0;
    this.chargeProgress = 0;
    this.chargeBlockedUntilRelease = false;
    this.scoped = false;
    this.lastShotAt = -10;
    this.time = 0;
    this.meleeSwingT = 0;
    this.meleeStrikePending = false;
    this.knifeFlipT = 0;
    this.knifeFlipTotal = COMBAT_KNIFE_DRAW_SECONDS;
    this.knifeSpin = null;
    this.knifeHandleLeft = null;
    this.knifeHandleRight = null;

    /* callbacks */
    this.onShoot = null;
    this.onCameraKick = null;
    this.onEjectShell = null;
    this.onDryFire = null;
    this.onReloadStart = null;
  }

  get ammoState() { return this.ammo[this.def.id]; }

  setTeam(team) {
    if (team === this.team) return;
    this.team = team;
    const oldR = this.armR;
    const oldL = this.armL;
    oldR?.parent?.remove(oldR);
    oldL?.parent?.remove(oldL);
    for (const arm of [oldR, oldL]) {
      arm?.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const arms = buildViewArms(this.textures, team);
    this.armR = arms.armR;
    this.armL = arms.armL;
    this.armLHolder.clear();
    this.armLHolder.add(this.armL);
    if (this.model && this.anchors) {
      this.armR.position.copy(this.anchors.grip);
      this.model.add(this.armR);
      this.armLHolder.position.copy(this.anchors.foregrip);
      this.model.add(this.armLHolder);
      this.armLHolder.visible = !this.def?.oneHanded;
      this._configureRightHand();
    }
  }

  _configureRightHand() {
    if (!this.armR) return;
    const knifeGrip = this.armR.getObjectByName('knife-grip-fingers');
    const triggerFinger = this.armR.getObjectByName('right-trigger-finger');
    const holdingKnife = !!this.def?.melee;
    if (knifeGrip) knifeGrip.visible = holdingKnife;
    if (triggerFinger) triggerFinger.visible = !holdingKnife;
  }

  equip(idOrIndex, instant = false) {
    const id = typeof idOrIndex === 'number' ? WEAPON_ORDER[idOrIndex] : idOrIndex;
    if (!WEAPON_DEFS[id]) return;
    if (this.def && this.def.id === id && !instant) return;
    this.audio?.stopRailgunCharge?.();
    if (!instant && this.def) {
      this.pendingWeapon = id;
      const drawTime = WEAPON_DEFS[id]?.melee ? COMBAT_KNIFE_DRAW_SECONDS : 0.21;
      this.switchTotal = 0.21 + drawTime;
      this.switchSwapAt = drawTime;
      this.switchT = this.switchTotal;
      this.cancelReload();
      return;
    }
    this._applyWeapon(id, false);
  }

  /**
   * Lower the equipped weapon before a handheld killstreak device takes over.
   * The caller keeps the weapon visible for the returned first-half duration,
   * then hides it at the deepest point of the normal switch animation.
   */
  holsterCurrent() {
    if (!this.def) return 0;
    this.pendingWeapon = null;
    this.switchTotal = 0.42;
    this.switchSwapAt = this.switchTotal * 0.5;
    this.switchT = this.switchTotal;
    this.adsBlend = 0;
    this.scoped = false;
    this.triggerWasDown = false;
    this.chargeT = 0;
    this.chargeProgress = 0;
    this.chargeBlockedUntilRelease = false;
    this.audio?.stopRailgunCharge?.();
    this.cancelReload();
    this.holder.visible = true;
    return this.switchTotal * 0.5;
  }

  /**
   * Bring the already equipped weapon back up after a killstreak device. This
   * starts at the lowered midpoint of the normal switch track, so the hidden
   * rifle never flashes at its ready pose before the draw animation begins.
   */
  drawCurrent() {
    if (!this.def) return false;
    this.pendingWeapon = null;
    this.switchTotal = 0.52;
    this.switchSwapAt = this.switchTotal * 0.5;
    this.switchT = this.switchSwapAt;
    this.adsBlend = 0;
    this.scoped = false;
    this.triggerWasDown = false;
    this.chargeT = 0;
    this.chargeProgress = 0;
    this.chargeBlockedUntilRelease = false;
    this.audio?.stopRailgunCharge?.();
    this.cancelReload();
    if (this.audio) this.audio.reload('magIn');
    return true;
  }

  _applyWeapon(id, flourish = false) {
    this.audio?.stopRailgunCharge?.();
    if (this.model) {
      this.weaponRoot.remove(this.model);
      this.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const built = buildWeapon(id, this.textures, true);
    this.model = built.group;
    this.anchors = built.anchors;
    this.def = WEAPON_DEFS[id];
    this.weaponScale = FIRST_PERSON_WEAPON_SCALES[id] || 1;
    this.model.scale.setScalar(this.weaponScale);
    this.slot = WEAPON_ORDER.indexOf(id);
    this.weaponRoot.add(this.model);

    // hands ride with the weapon
    this.armR.position.copy(this.anchors.grip);
    this.model.add(this.armR);
    this.armLHolder.position.copy(this.anchors.foregrip);
    this.model.add(this.armLHolder);
    this.armLHolder.visible = !this.def.oneHanded;
    this._configureRightHand();

    this.pump = this.model.getObjectByName('pump') || null;
    this.pumpRest = this.pump ? this.pump.position.z : 0;
    this.bolt = this.model.getObjectByName('bolt') || null;
    this.boltRest = this.bolt ? this.bolt.position.z : 0;
    this.rear = this.model.getObjectByName('rear') || null;
    this.slide = this.model.getObjectByName('slide') || null;
    this.slideRest = this.slide ? this.slide.position.z : 0;
    this.barrelCluster = this.model.getObjectByName('minigun-barrels') || null;
    this.knifeSpin = this.model.getObjectByName('knife-spin') || null;
    this.knifeHandleLeft = this.model.getObjectByName('knife-handle-left') || null;
    this.knifeHandleRight = this.model.getObjectByName('knife-handle-right') || null;
    this.knifeFlipTotal = COMBAT_KNIFE_DRAW_SECONDS;
    this.knifeFlipT = flourish && this.def.melee ? this.knifeFlipTotal : 0;
    this.barrelSpinSpeed = 0;
    this.spinUpT = 0;
    this.chargeT = 0;
    this.chargeProgress = 0;
    this.chargeBlockedUntilRelease = false;

    this.reloading = false;
    this.cycleKind = null;
    this.cycleTimer = 0;
    this.fireTimer = 0.15;
    this.recoilAccum = 0;
    this.visualKickDepth = 0;
    this.scopeRecoil = 0;
    this.meleeSwingT = 0;
    this.meleeStrikePending = false;
  }

  /** Kills top the current weapon back up, so you never run bone dry. */
  resupply(mags = 1) {
    if (!this.def || this.def.melee) return;
    const a = this.ammoState;
    a.reserve = Math.min(this.def.reserve, a.reserve + Math.ceil(this.def.mag * mags));
  }

  cancelReload() {
    this.reloading = false;
    this.reloadT = 0;
    this.reloadEventIdx = 0;
    updateSidearmReloadComponent(this.model, this.def?.id);
  }

  canFire(unlimitedAmmo = false) {
    if (!this.def) return false;
    if (this.reloading && !this.def.shellReload) return false;
    if (this.switchT > 0) return false;
    if (this.cycleTimer > 0) return false;
    if (this.fireTimer > 0) return false;
    return this.def.melee || unlimitedAmmo || this.ammoState.mag > 0;
  }

  startReload() {
    if (!this.def || this.def.melee || this.def.noReload
      || this.reloading || this.switchT > 0) return;
    const a = this.ammoState;
    if (a.reserve <= 0 || a.mag >= this.def.mag) return;
    if (this.cycleTimer > 0) return;
    this.reloading = true;
    this.reloadWasEmpty = a.mag === 0;
    this.reloadTotal = this.def.shellReload
      ? this.def.reloadTime
      : (this.reloadWasEmpty ? this.def.reloadEmptyTime : this.def.reloadTime);
    this.reloadT = 0;
    this.reloadEventIdx = 0;
    if (this.def.chargeTime) {
      this.chargeT = 0;
      this.chargeProgress = 0;
      this.audio?.stopRailgunCharge?.();
    }
    if (this.def.shellReload) this.shellStage = 0;
    this.onReloadStart?.(this.def);
  }

  /** Current cone half-angle in radians, used for bullets and the crosshair. */
  spread(moveSpeed, grounded, crouch) {
    return playerWeaponSpread(this.def, {
      adsBlend: this.adsBlend,
      moveSpeed,
      grounded,
      crouching: crouch,
      recoilAccum: this.recoilAccum,
    });
  }

  fire(ctx) {
    const d = this.def;
    const a = this.ammoState;
    if (d.melee) {
      this.fireTimer = beginFireCooldown(this.fireTimer, 60 / d.rpm);
      this.lastShotAt = this.time;
      this.meleeSwingT = d.swingTime;
      this.meleeStrikePending = true;
      if (this.audio) this.audio.meleeSwing();
      return;
    }
    if (!ctx.unlimitedAmmo || d.limitedRewardAmmo) a.mag--;
    this.fireTimer = beginFireCooldown(this.fireTimer, 60 / d.rpm);
    this.lastShotAt = this.time;
    this.recoilAccum = Math.min(this.recoilAccum + (d.recoilV * 0.55 + 0.25), 9);

    // Legacy springs retain the small vertical follow-through. The explicit
    // camera-space envelope below supplies only readable straight-back travel.
    const k = d.kick;
    this.kickZ.kick(2.6 * k);
    this.kickY.kick(0.9 * k);
    this.kickPitch.kick(-6.5 * k);
    const visual = FIREARM_VISUAL_RECOIL[d.id];
    if (visual) {
      this.visualKickDepth = Math.min(
        visual.pullback * 1.35,
        Math.max(0, this.visualKickDepth) + visual.pullback
      );
      if (d.scope && this.adsBlend > 0.86) this.scopeRecoil = 2;
    }
    this.flashTimer = 0.055;
    if (this.slide) this.slideSpring.kick(1.6 + k);

    // camera kick
    if (this.onCameraKick) {
      const vert = d.recoilV * (this.adsBlend > 0.5 ? 0.72 : 1) * rand(0.85, 1.15);
      const horiz = d.recoilH * rand(-1, 1) * (this.adsBlend > 0.5 ? 0.7 : 1);
      this.onCameraKick(vert, horiz, d.kick);
    }

    if (this.onShoot) this.onShoot(d, this.spread(ctx.moveSpeed, ctx.grounded, ctx.crouch), d.pellets);
    if (this.audio) this.audio.shot(d.sound, null);

    // shell + action cycle
    if (d.shellReload) {
      this.startCycle('pump', d.pumpTime);
    } else if (d.boltTime) {
      this.startCycle('bolt', d.boltTime);
    } else if (!d.retainsCases) {
      this.ejectShell(0.02);
    }
    if (d.reloadEachShot) {
      // The ARC-7 battery chamber holds one shot. Every discharge breaks the
      // sight picture immediately and starts a full battery swap before the
      // optic can settle for another charge.
      this.adsBlend = 0;
      this.scoped = false;
      this.chargeT = 0;
      this.chargeProgress = 0;
      this.chargeBlockedUntilRelease = true;
      if (a.reserve > 0) this.startReload();
    } else if (!ctx.unlimitedAmmo && a.mag === 0 && a.reserve > 0) {
      this.autoReloadAt = this.time + (d.boltTime || d.pumpTime || 0.12) + 0.1;
    }
  }

  startCycle(kind, time) {
    this.cycleKind = kind;
    this.cycleTotal = time;
    this.cycleTimer = time;
    this.cycleEjected = false;
  }

  ejectShell(delay = 0) {
    if (!this.onEjectShell || !this.anchors) return;
    const local = this.anchors.eject.clone();
    this.model.updateMatrixWorld(true);
    this.model.localToWorld(local); // -> view/camera space
    this.onEjectShell(local, this.def.id);
  }

  /**
   * ctx: { trigger, aim, reload, switchTo, sprinting, moveSpeed, grounded,
   *        crouch, lookDx, lookDy, landImpact, dead, canAct }
   */
  update(dt, ctx) {
    this.time += dt;
    const d = this.def;
    if (!d) return;

    const dead = !!ctx.dead;
    const unlimitedAmmo = Boolean(
      ctx.unlimitedAmmo && !d.melee && !d.limitedRewardAmmo
    );
    if (unlimitedAmmo) {
      this.autoReloadAt = 0;
      if (this.reloading) this.cancelReload();
    }
    this.fireTimer = advanceFireCooldown(this.fireTimer, dt, this.triggerWasDown);

    if (this.meleeSwingT > 0) {
      this.meleeSwingT = Math.max(0, this.meleeSwingT - dt);
      const elapsed = d.swingTime - this.meleeSwingT;
      if (this.meleeStrikePending && elapsed >= d.hitTime) {
        this.meleeStrikePending = false;
        if (!dead && ctx.canAct !== false && this.onShoot) this.onShoot(d, 0, 1);
      }
    } else {
      this.meleeStrikePending = false;
    }
    if (this.knifeFlipT > 0) {
      this.knifeFlipT = Math.max(0, this.knifeFlipT - dt);
    }

    /* -------- weapon switching -------- */
    if (this.switchT > 0) {
      const prev = this.switchT;
      this.switchT = Math.max(0, this.switchT - dt);
      if (prev > this.switchSwapAt && this.switchT <= this.switchSwapAt && this.pendingWeapon) {
        const nextWeapon = this.pendingWeapon;
        this._applyWeapon(nextWeapon, WEAPON_DEFS[nextWeapon]?.melee === true);
        this.pendingWeapon = null;
        if (this.audio) this.audio.reload('magIn');
      }
    }

    /* -------- action cycles (pump / bolt) -------- */
    if (this.cycleTimer > 0) {
      const prev = this.cycleTimer;
      this.cycleTimer = Math.max(0, this.cycleTimer - dt);
      const u = 1 - this.cycleTimer / this.cycleTotal;
      if (!this.cycleEjected && u > 0.45) {
        this.cycleEjected = true;
        this.ejectShell();
        if (this.audio) this.audio.reload(this.cycleKind === 'pump' ? 'pump' : 'bolt');
      }
      if (prev > 0 && this.cycleTimer === 0) this.cycleKind = null;
    }

    /* -------- aim / sprint / slide blends -------- */
    // sliding does not block the sights - a slide is a firing stance here
    const wantAds = !d.melee && ctx.aim && !dead && !this.reloading && this.switchT <= 0
      && !ctx.sprinting;
    this.adsBlend = damp(this.adsBlend, wantAds ? 1 : 0, 1 / Math.max(0.04, d.adsTime * 0.35), dt);
    this.scoped = !!d.scope && this.adsBlend > 0.86;
    // A knife attack can start directly from a sprint. Keep the hand out of
    // the lowered run pose for the complete slash instead of swallowing the
    // first click while sprintBlend slowly returns below the rifle threshold.
    const meleeAttacking = d.melee && this.meleeSwingT > 0;
    const sprintTarget = ctx.sprinting && !ctx.trigger && !meleeAttacking
      && !wantAds && !this.reloading
      ? 1
      : 0;
    this.sprintBlend = damp(this.sprintBlend, sprintTarget, 9, dt);
    this.slideBlend = damp(this.slideBlend, ctx.sliding ? 1 : 0, ctx.sliding ? 14 : 8, dt);

    /* -------- firing -------- */
    if (!dead && ctx.canAct !== false) {
      const trigger = !!ctx.trigger;
      if (!trigger) this.chargeBlockedUntilRelease = false;
      const fresh = trigger && !this.triggerWasDown;
      let wants = d.auto ? trigger : fresh;
      if (d.chargeTime) {
        const chargeValid = laserCannonChargeInputValid({
          weaponId: d.id,
          trigger,
          aim: ctx.aim,
          adsBlend: this.adsBlend,
          sprinting: ctx.sprinting,
          reloading: this.reloading,
          switching: this.switchT > 0,
          blocked: this.chargeBlockedUntilRelease,
          canAct: ctx.canAct,
        });
        this.chargeT = chargeValid ? this.chargeT + dt : 0;
        this.chargeProgress = laserCannonChargeProgress(this.chargeT);
        this.audio?.updateRailgunCharge?.(this.chargeProgress);
        wants = chargeValid && this.chargeProgress >= 1;
      } else {
        this.chargeT = 0;
        this.chargeProgress = 0;
        this.audio?.stopRailgunCharge?.();
      }
      const canSpin = trigger && !this.reloading && this.switchT <= 0;
      this.spinUpT = d.spinUpTime
        ? canSpin ? Math.min(d.spinUpTime, this.spinUpT + dt) : 0
        : 0;
      const spunUp = !d.spinUpTime || this.spinUpT >= d.spinUpTime;
      // Warm-up time cannot pre-charge the cadence remainder. The first round
      // leaves only after the complete continuous trigger hold.
      if (!spunUp) this.fireTimer = Math.max(0, this.fireTimer);
      if (wants && spunUp && this.canFire(unlimitedAmmo)
        && (d.melee || this.sprintBlend < 0.6)) {
        if (this.reloading && d.shellReload) this.cancelReload();
        this.fire(ctx);
        if (d.chargeTime) {
          this.chargeT = 0;
          this.chargeProgress = 0;
        }
      } else if (!unlimitedAmmo && !d.melee && fresh && this.ammoState.mag === 0
        && (!d.adsRequired || this.scoped)
        && !this.reloading && this.cycleTimer <= 0) {
        if (this.audio) this.audio.dryFire();
        if (this.ammoState.reserve > 0) this.startReload();
      }
      this.triggerWasDown = trigger;

      if (!unlimitedAmmo && !d.melee && ctx.reload) this.startReload();
      if (!unlimitedAmmo && this.autoReloadAt && this.time >= this.autoReloadAt) {
        this.autoReloadAt = 0;
        if (this.ammoState.mag === 0) this.startReload();
      }
    } else {
      this.triggerWasDown = false;
      this.spinUpT = 0;
      this.chargeT = 0;
      this.chargeProgress = 0;
      this.audio?.stopRailgunCharge?.();
    }

    if (this.barrelCluster) {
      const wantsSpin = !dead && ctx.canAct !== false && !!ctx.trigger
        && !this.reloading && this.switchT <= 0;
      const warm = d.spinUpTime ? clamp(this.spinUpT / d.spinUpTime, 0, 1) : 1;
      this.barrelSpinSpeed = damp(
        this.barrelSpinSpeed,
        wantsSpin ? 38 * warm : 0,
        wantsSpin ? 18 : 5,
        dt
      );
      this.barrelCluster.rotation.z += this.barrelSpinSpeed * dt;
    }

    /* -------- reload progression -------- */
    let reloadPose = null;
    let reloadProgress = null;
    if (this.reloading) {
      if (dead) {
        this.cancelReload();
      } else {
        this.reloadT += dt;
        const u = clamp(this.reloadT / this.reloadTotal, 0, 1);
        reloadProgress = u;
        if (d.shellReload) {
          reloadPose = sampleTrack(SHELL_TRACK, u, TRACK_KEYS);
          if (!this.shellInserted && u > 0.5) {
            this.shellInserted = true;
            const a = this.ammoState;
            const n = Math.min(1, a.reserve, d.mag - a.mag);
            a.mag += n;
            a.reserve -= n;
            if (this.audio) this.audio.reload('magIn');
          }
          if (u >= 1) {
            this.shellInserted = false;
            this.reloadT = 0;
            const a = this.ammoState;
            if (a.mag >= d.mag || a.reserve <= 0) {
              this.reloading = false;
              this.startCycle('pump', d.pumpTime * 0.8);
            }
          }
        } else {
          reloadPose = sampleTrack(RELOAD_TRACK, u, TRACK_KEYS);
          if (d.id === 'machine_pistol' || d.id === 'desert_eagle' || d.id === 'rifle'
            || d.id === 'railgun') {
            const componentPose = sidearmReloadComponentPose(d.id, u);
            // Lift the weapon while the magazine changes hands so the swap
            // stays in view instead of slipping below the frame edge.
            const lift = d.id === 'machine_pistol' ? [0.055, 0.150, -0.055]
              : d.id === 'desert_eagle' ? [0.040, 0.110, -0.045]
              : d.id === 'railgun' ? [0.028, 0.085, -0.020]
              : [0.020, 0.055, 0.000];
            const exchange = Math.sin(u * Math.PI);
            reloadPose.px += lift[0] * exchange;
            reloadPose.py += lift[1] * exchange;
            reloadPose.pz += lift[2] * exchange;
            // The support hand follows the actual animated component instead
            // of pantomiming beside an immobile magazine.
            const magazineGrip = this.anchors.magazineGrip || this.anchors.foregrip;
            const handGrab = Math.sin(clamp(u, 0, 1) * Math.PI);
            reloadPose.ax = (magazineGrip.x - this.anchors.foregrip.x) * handGrab
              + componentPose.offsetX;
            reloadPose.ay = (magazineGrip.y - this.anchors.foregrip.y) * handGrab
              + componentPose.offsetY;
            reloadPose.az = (magazineGrip.z - this.anchors.foregrip.z) * handGrab
              + componentPose.offsetZ;
          }
          while (this.reloadEventIdx < RELOAD_EVENTS.length && u >= RELOAD_EVENTS[this.reloadEventIdx].t) {
            const ev = RELOAD_EVENTS[this.reloadEventIdx++];
            if (ev.onlyEmpty && !this.reloadWasEmpty) continue;
            if (this.audio) this.audio.reload(ev.stage);
          }
          if (u >= 1) {
            this.reloading = false;
            const a = this.ammoState;
            const want = d.mag - a.mag;
            const take = Math.min(want, a.reserve);
            a.mag += take;
            a.reserve -= take;
          }
        }
      }
    }
    updateSidearmReloadComponent(
      this.model,
      d.id,
      reloadProgress
    );

    /* -------- blowback slide -------- */
    if (this.slide) {
      this.slideSpring.update(dt);
      let slideZ = this.slideRest + this.slideSpring.value * 0.011;
      if (this.reloading && this.reloadWasEmpty && reloadProgress != null) {
        const rack = Math.sin(clamp((reloadProgress - 0.70) / 0.22, 0, 1) * Math.PI);
        slideZ += rack * 0.045;
      }
      this.slide.position.z = slideZ;
    }

    /* -------- springs -------- */
    this.swayX.target = clamp(-(ctx.lookDx || 0) * 0.9, -1.6, 1.6);
    this.swayY.target = clamp((ctx.lookDy || 0) * 0.9, -1.6, 1.6);
    this.swayX.update(dt);
    this.swayY.update(dt);
    this.kickZ.update(dt);
    this.kickY.update(dt);
    this.kickPitch.update(dt);
    if (ctx.landImpact) this.landDip.kick(-clamp(ctx.landImpact * 1.4, 0, 9));
    this.landDip.update(dt);
    this.recoilAccum = Math.max(0, this.recoilAccum - dt * (this.time - this.lastShotAt > 0.14 ? 7 : 1.2));

    /* -------- bob -------- */
    const speed = ctx.moveSpeed || 0;
    const moving = speed > 0.4 && ctx.grounded;
    const bobRateScale = d.id === 'minigun' && ctx.sprinting
      ? JUGGERNAUT_SPRINT_BOB_RATE_SCALE
      : 1;
    if (moving) {
      this.bobPhase += dt
        * lerp(7.6, 11.5, clamp(speed / 6, 0, 1))
        * bobRateScale;
    }
    else this.bobPhase = damp(this.bobPhase, Math.round(this.bobPhase / Math.PI) * Math.PI, 6, dt);
    const bobAmt = clamp(speed / 5.2, 0, 1.25) * (1 - this.adsBlend * 0.65) * this.settings.viewBob;
    const bx = Math.sin(this.bobPhase) * 0.016 * bobAmt;
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.014 * bobAmt;
    const brz = Math.sin(this.bobPhase) * 0.030 * bobAmt;
    const brx = Math.abs(Math.cos(this.bobPhase)) * 0.012 * bobAmt;

    /* -------- idle breathing -------- */
    const breath = 1 - this.adsBlend * 0.8;
    const ibx = Math.sin(this.time * 1.15) * 0.0035 * breath;
    const iby = Math.sin(this.time * 1.7 + 1.1) * 0.0030 * breath;

    /* -------- compose pose -------- */
    const hip = d.hipPos, hipR = d.hipRot;
    // sights must land exactly on the screen centre, so the offset follows the
    // viewmodel scale
    const adsPos = d.adsPos || V(
      0,
      -d.sightHeight * VM_SCALE * this.weaponScale,
      d.adsZ
    );
    const adsRot = d.adsRot || V();
    const a = this.adsBlend;
    let px = lerp(hip.x, adsPos.x, a) + bx + ibx + this.swayX.value * 0.028;
    let py = lerp(hip.y, adsPos.y, a) + by + iby + this.swayY.value * 0.026 + this.landDip.value * 0.012;
    let pz = lerp(hip.z, adsPos.z, a)
      + this.kickZ.value * 0.012
      + this.visualKickDepth;
    let rx = lerp(hipR.x, adsRot.x, a) + brx + this.kickPitch.value * 0.016 - this.swayY.value * 0.055;
    let ry = lerp(hipR.y, adsRot.y, a) - this.swayX.value * 0.06;
    let rz = lerp(hipR.z, adsRot.z, a)
      + brz
      + this.swayX.value * 0.03;
    py += this.kickY.value * 0.006;

    // Rifles use a high-port sprint. The M134 cannot: it remains suspended
    // from its two handles at the hip and moves with a slower, heavier sway.
    const sp = this.sprintBlend;
    if (sp > 0.001) {
      const lowCarrySprint = d.id === 'minigun';
      const knifeSprint = d.melee;
      const sPos = d.sprintPos, sRot = d.sprintRot;
      px = lerp(px, lowCarrySprint ? 0.28 : knifeSprint ? 0.170 : sPos ? sPos.x : 0.08, sp);
      py = lerp(py, lowCarrySprint ? -0.43 : knifeSprint ? -0.145 : sPos ? sPos.y : -0.20, sp);
      pz = lerp(pz, lowCarrySprint ? -0.64 : knifeSprint ? -0.660 : sPos ? sPos.z : -0.17, sp);
      rx = lerp(rx, lowCarrySprint ? 0.08 : knifeSprint ? 0.08 : sRot ? sRot.x : 0.34, sp);
      ry = lerp(ry, lowCarrySprint ? -0.16 : knifeSprint ? 0.02 : sRot ? sRot.y : 0.62, sp);
      rz = lerp(rz, lowCarrySprint ? 0.08 : knifeSprint ? 0.28 : sRot ? sRot.z : -0.26, sp);
      // The lerp above flattens the walk bob, so the run drives its own sway:
      // the weapon pumps fore-aft with each stride and rolls through the
      // figure-8 that arms actually make at a run.
      const pump = sp * clamp(speed / 6.5, 0, 1.2) * this.settings.viewBob;
      const heavy = lowCarrySprint ? 0.38 : knifeSprint ? 0.60 : 1;
      px += Math.sin(this.bobPhase * 0.5) * 0.030 * pump * heavy;
      py -= Math.abs(Math.cos(this.bobPhase * 0.5)) * 0.026 * pump * heavy;
      pz += Math.sin(this.bobPhase) * 0.014 * pump * heavy;
      rx += Math.sin(this.bobPhase) * 0.045 * pump * heavy;
      ry += Math.sin(this.bobPhase * 0.5) * 0.05 * pump * heavy;
      rz += Math.sin(this.bobPhase * 0.5 + 0.6) * 0.10 * pump * heavy;
    }

    if (d.melee && this.meleeSwingT > 0) {
      const u = clamp(1 - this.meleeSwingT / d.swingTime, 0, 1);
      const pose = sampleTrack(MELEE_TRACK, u, TRACK_KEYS);
      px += pose.px; py += pose.py; pz += pose.pz;
      rx += pose.rx; ry += pose.ry; rz += pose.rz;
    }

    if (this.knifeSpin) {
      if (this.knifeFlipT > 0) {
        const u = clamp(1 - this.knifeFlipT / this.knifeFlipTotal, 0, 1);
        const handPose = sampleTrack(KNIFE_DRAW_TRACK, u, TRACK_KEYS);
        const knifePose = combatKnifeFlipPose(u);
        px += handPose.px; py += handPose.py; pz += handPose.pz;
        rx += handPose.rx; ry += handPose.ry; rz += handPose.rz;
        this.knifeSpin.rotation.set(knifePose.spinX, knifePose.spinY, knifePose.spinZ);
        if (this.knifeHandleLeft) this.knifeHandleLeft.rotation.y = knifePose.handleL;
        if (this.knifeHandleRight) this.knifeHandleRight.rotation.y = knifePose.handleR;
      } else {
        this.knifeSpin.rotation.set(0, 0, 0);
        if (this.knifeHandleLeft) this.knifeHandleLeft.rotation.y = 0;
        if (this.knifeHandleRight) this.knifeHandleRight.rotation.y = 0;
      }
    }
    if (this.model?.userData.updateVisual) {
      const extension = d.laserBlade && this.knifeFlipT > 0
        ? 1 - this.knifeFlipT / this.knifeFlipTotal
        : 1;
      this.model.userData.updateVisual(this.time, extension);
    }

    // a slide deliberately has no pose of its own: the weapon keeps the
    // normal moving stance (hip or ADS) so you can fight all the way through

    // weapon switch dip
    if (this.switchT > 0) {
      const swapAt = Math.max(0.0001, this.switchSwapAt || this.switchTotal * 0.5);
      const holsterDuration = Math.max(0.0001, this.switchTotal - swapAt);
      const dip = this.switchT > swapAt
        ? Math.sin(clamp((this.switchTotal - this.switchT) / holsterDuration, 0, 1) * Math.PI * 0.5)
        : Math.sin(clamp(this.switchT / swapAt, 0, 1) * Math.PI * 0.5);
      py -= dip * 0.24;
      rx += dip * 0.9;
      rz += dip * 0.25;
    }

    // reload / cycle overlay
    if (reloadPose) {
      px += reloadPose.px; py += reloadPose.py; pz += reloadPose.pz;
      rx += reloadPose.rx; ry += reloadPose.ry; rz += reloadPose.rz;
      this.armLHolder.position.set(
        this.anchors.foregrip.x + reloadPose.ax,
        this.anchors.foregrip.y + reloadPose.ay,
        this.anchors.foregrip.z + reloadPose.az
      );
      this.armLHolder.visible = true;
    } else if (this.anchors) {
      this.armLHolder.position.lerp(this.anchors.foregrip, 0.35);
    }
    this.armLHolder.visible = !d.oneHanded;

    if (this.cycleTimer > 0) {
      const u = 1 - this.cycleTimer / this.cycleTotal;
      const slide = Math.sin(u * Math.PI);
      if (this.pump) this.pump.position.z = this.pumpRest + slide * 0.085;
      if (this.bolt) {
        this.bolt.rotation.z = 0.5 + slide * 1.2;
        this.bolt.position.z = this.boltRest + slide * 0.07;
      }
      px += slide * 0.012;
      rz += slide * 0.10;
      rx += slide * 0.05;
      if (this.anchors && !reloadPose) {
        this.armLHolder.position.z = this.anchors.foregrip.z + slide * 0.085;
      }
    } else {
      if (this.pump) this.pump.position.z = damp(this.pump.position.z, this.pumpRest, 14, dt);
      if (this.bolt) {
        this.bolt.rotation.z = damp(this.bolt.rotation.z, 0.5, 14, dt);
        this.bolt.position.z = damp(this.bolt.position.z, this.boltRest, 14, dt);
      }
    }

    // death: the weapon drops out of view
    if (dead) {
      this.deathT = (this.deathT || 0) + dt;
      const u = clamp(this.deathT * 1.4, 0, 1);
      py -= u * 0.55;
      pz += u * 0.20;
      rx += u * 1.5;
      rz -= u * 1.1;
    } else {
      this.deathT = 0;
    }

    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz);
    this.holder.visible = !this.scoped;
    const visual = FIREARM_VISUAL_RECOIL[d.id];
    const recover = visual?.recover || 14;
    this.visualKickDepth = damp(this.visualKickDepth, 0, recover, dt);
    // The optic returns more slowly than the physical receiver so a bolt-action
    // shot has a readable rise/zoom pulse instead of a one-frame flash.
    this.scopeRecoil = damp(this.scopeRecoil, 0, 4.2, dt);
    // aiming puts the eye at the cheek weld, so the stock is behind the camera
    if (this.rear) this.rear.visible = this.adsBlend < 0.55;

    /* -------- muzzle flash -------- */
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const on = this.flashTimer > 0;
      this.flash.visible = on;
      if (on && this.anchors) {
        const p = this.anchors.muzzle.clone();
        this.model.updateMatrixWorld(true);
        this.model.localToWorld(p);
        this.flash.position.copy(p);
        this.flash.quaternion.copy(this.model.getWorldQuaternion(new THREE.Quaternion()));
        const s = rand(0.75, 1.25) * (this.def.id === 'shotgun' ? 1.5 : this.def.id === 'sniper' ? 1.35 : this.def.id === 'railgun' ? 1.6 : 1);
        this.flash.scale.setScalar(s * (this.scoped ? 0.01 : 1));
        this.flash.rotateZ(rand(0, 6.28));
        this.flashLight.position.copy(p);
        this.flashLight.intensity = 9 * s;
      } else {
        this.flashLight.intensity = 0;
      }
    } else {
      this.flash.visible = false;
      this.flashLight.intensity = damp(this.flashLight.intensity, 0, 25, dt);
    }
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** FOV multiplier the main camera should use (scope zoom). */
  fovScale() {
    return lerp(1, this.def ? this.def.adsFov : 1, this.adsBlend);
  }

  reset() {
    for (const id of WEAPON_ORDER) {
      this.ammo[id] = { mag: WEAPON_DEFS[id].mag, reserve: WEAPON_DEFS[id].reserve };
    }
    this.holder.visible = true;
    this.cancelReload();
    this.cycleTimer = 0;
    this.cycleKind = null;
    this.adsBlend = 0;
    this.sprintBlend = 0;
    this.slideBlend = 0;
    this.recoilAccum = 0;
    this.visualKickDepth = 0;
    this.scopeRecoil = 0;
    this.meleeSwingT = 0;
    this.meleeStrikePending = false;
    this.knifeFlipT = 0;
    if (this.knifeSpin) this.knifeSpin.rotation.set(0, 0, 0);
    if (this.knifeHandleLeft) this.knifeHandleLeft.rotation.y = 0;
    if (this.knifeHandleRight) this.knifeHandleRight.rotation.y = 0;
    this.barrelSpinSpeed = 0;
    this.chargeT = 0;
    this.chargeProgress = 0;
    this.chargeBlockedUntilRelease = false;
    this.audio?.stopRailgunCharge?.();
    this.deathT = 0;
  }
}
