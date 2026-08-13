// The player: momentum-based movement, stance handling, the slide, the head
// bob that drives the whole feel of the game, camera recoil, and a
// first-person collapse animation on death.
import * as THREE from '../../vendor/three.module.js';
import { clamp, lerp, damp, Spring, rand, TAU } from '../core/math.js';
import { moveActor, positionFree } from '../core/collision.js';
import { applyArmorDamage } from './damage.js';
import {
  JUGGERNAUT_SPRINT_BONUS_SCALE,
  JUGGERNAUT_SPRINT_BOB_RATE_SCALE,
} from './juggernaut.js';
import { customConfig } from '../fx/custom.js'

const STAND_EYE = 1.62;
const CROUCH_EYE = 1.05;
const SLIDE_EYE = 0.80;
const STAND_H = 1.8;
const CROUCH_H = 1.25;
const SLIDE_H = 1.15;

/* ---- slide tuning ---- */
const SLIDE_TIME = 0.85;      // seconds before it runs out on its own
const SLIDE_ENTRY = 5.2;      // ground speed needed to trigger one
const SLIDE_LAUNCH = 1.30;    // entry speed multiplier
const SLIDE_MAX = 9.8;
const SLIDE_DECEL = 5.4;      // m/s lost per second while sliding
const SLIDE_STOP = 3.1;       // slower than this and the slide ends
const SLIDE_COOLDOWN = 0.55;
const SLIDE_JUMP_PUSH = 4.2;  // extra shove along the slide when you jump out
const SLIDE_JUMP_UP = 7.3;
const STANDING_MOVE_SPEED = 4.75;
const NORMAL_SPRINT_SPEED = 7.0;

/** Sprint target after equipment weight, with the heavy bonus kept absolute. */
export function sprintMoveTargetSpeed(juggernaut = false, speedMult = 1) {
  const multiplier = Number.isFinite(speedMult) && speedMult > 0 ? speedMult : 1;
  if (!juggernaut) return NORMAL_SPRINT_SPEED * multiplier;
  return STANDING_MOVE_SPEED * multiplier
    + (NORMAL_SPRINT_SPEED - STANDING_MOVE_SPEED)
      * JUGGERNAUT_SPRINT_BONUS_SCALE;
}

export class Player {
  ohp = customConfig.hp;
  constructor({ camera, level, settings, audio }) {
    this.camera = camera;
    this.camera.rotation.order = 'YXZ';
    this.level = level;
    this.settings = settings;
    this.audio = audio;

    this.position = new THREE.Vector3(0, 0, 26);
    this.velocity = new THREE.Vector3();
    this.radius = 0.36;
    this.height = STAND_H;
    this.stepHeight = 0.55;
    this.grounded = false;

    this.yaw = Math.PI;
    this.pitch = 0;
    this.recoilPitch = new Spring(70, 9);
    this.recoilYaw = new Spring(70, 9);
    this.punch = new Spring(90, 11);

    this.team = 'blue';
    this.maxHealth = this.ohp;
    this.health = this.ohp;
    this.maxArmor = 50;
    this.armor = 50;
    this.juggernaut = false;
    this.alive = true;
    this.deathAnim = null;
    this.regenTimer = 0;
    this.lastHitTime = -10;
    this.healthRegenDelay = 5.5;
    this.armorRegenDelay = 5.5;
    this.time = 0;

    this.crouching = false;
    this.crouchBlend = 0;
    this.sprinting = false;
    this.speed2D = 0;

    this.sliding = false;
    this.slideBlend = 0;
    this.slideT = 0;
    this.slideSpeed = 0;
    this.slideCooldown = 0;
    this.slideDir = new THREE.Vector3(0, 0, -1);
    this.slideAirT = 0;
    this.slideLean = 0;

    this.bobPhase = 0;
    this.bobAmp = 0;
    this.stepSide = 0;
    this.landDip = new Spring(110, 13);
    this.leanRoll = 0;
    this.hurtRoll = new Spring(60, 8);
    this.landImpact = 0;

    this.damageFlash = 0;
    this.hitDirections = [];   // for the HUD damage arcs

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.baseFov = settings.fov;
  }

  /* ------------------------------------------------------------- helpers */

  eyePosition(out = this._eye) {
    return out.set(this.position.x, this.position.y + this.eyeHeight(), this.position.z);
  }

  eyeHeight() {
    return lerp(lerp(STAND_EYE, CROUCH_EYE, this.crouchBlend), SLIDE_EYE, this.slideBlend);
  }

  aimDirection(out = this._fwd) {
    const p = this.pitch + this.recoilPitch.value;
    const y = this.yaw + this.recoilYaw.value;
    return out.set(
      -Math.sin(y) * Math.cos(p),
      Math.sin(p),
      -Math.cos(y) * Math.cos(p)
    ).normalize();
  }

  forwardFlat(out = this._tmp) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  rightFlat(out = this._right) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  applyRecoil(vert, horiz, punch) {
    // spring velocity -> peak angle is roughly kick / sqrt(stiffness)
    this.recoilPitch.kick(vert * 0.115);
    this.recoilYaw.kick(horiz * 0.075);
    this.punch.kick(punch * 2.2);
  }

  /** Persistent upward aim kick. Unlike the camera spring this is sent to PVP authority. */
  applyAimKick(radians = 0) {
    if (!this.alive || !Number.isFinite(radians) || radians <= 0) return;
    this.pitch = clamp(
      this.pitch + radians,
      -Math.PI / 2 + 0.02,
      Math.PI / 2 - 0.02
    );
  }

  /* -------------------------------------------------------------- damage */

  takeDamage(amount, fromPos, attacker) {
    if (!this.alive) return false;
    this.lastHitTime = this.time;
    const damage = applyArmorDamage(this, amount);
    this.damageFlash = Math.min(1, this.damageFlash + clamp(amount / 45, 0.25, 0.9));
    if (fromPos) {
      const dir = new THREE.Vector3().subVectors(fromPos, this.position).setY(0).normalize();
      this.hitDirections.push({ dir, t: 1.6 });
      const side = dir.dot(this.rightFlat(this._right));
      this.hurtRoll.kick(-side * clamp(amount / 12, 0.4, 2.6));
      this.recoilPitch.kick(clamp(amount / 22, 0.1, 0.7));
    }
    if (this.audio) {
      if (damage.armorBroke) this.audio.armorCrack();
      this.audio.hurt();
    }
    if (this.health <= 0) {
      this.health = 0;
      this.die(fromPos, attacker);
      return true;
    }
    return false;
  }

  die(fromPos, attacker) {
    if (!this.alive) return;
    this.alive = false;
    this.sliding = false;
    this.slideBlend = 0;
    this.killedBy = attacker || null;
    const dir = fromPos
      ? new THREE.Vector3().subVectors(this.position, fromPos).setY(0).normalize()
      : new THREE.Vector3(0, 0, 1);
    this.deathAnim = {
      t: 0,
      h: this.eyeHeight(),
      hVel: 0.4,
      roll: 0,
      rollVel: rand(0.6, 1.4) * (Math.random() < 0.5 ? -1 : 1),
      rollTarget: 0,
      pitchTarget: rand(-0.35, 0.55),
      yaw0: this.yaw,
      yawDrift: rand(-0.5, 0.5),
      slide: dir.multiplyScalar(rand(0.8, 1.8)),
      bounced: false,
      settled: 0,
    };
    this.deathAnim.rollTarget = (this.deathAnim.rollVel > 0 ? 1 : -1) * rand(1.15, 1.42);
    this.velocity.set(0, 0, 0);
    if (this.audio) this.audio.playerDeath();
  }

  respawn(pos) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.juggernaut = false;
    this.maxHealth = this.ohp;
    this.maxArmor = 50;
    this.health = this.maxHealth;
    this.armor = this.maxArmor;
    this.alive = true;
    this.deathAnim = null;
    this.crouching = false;
    this.crouchBlend = 0;
    this.sprinting = false;
    this.speed2D = 0;
    this.sliding = false;
    this.slideBlend = 0;
    this.slideT = 0;
    this.slideCooldown = 0;
    this.slideLean = 0;
    this.pitch = 0;
    this.recoilPitch.set(0);
    this.recoilYaw.set(0);
    this.punch.set(0);
    this.hurtRoll.set(0);
    this.landDip.set(0);
    this.damageFlash = 0;
    this.hitDirections.length = 0;
    // face the middle of the map
    this.yaw = Math.atan2(pos.x, pos.z);
    if (this.audio) this.audio.spawn();
  }

  /* -------------------------------------------------------------- update */

  look(dx, dy) {
    if (!this.alive) return;
    const sens = 0.0022 * this.settings.sensitivity * (this.adsScale || 1);
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
    this.yaw = ((this.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
  }

  update(dt, cmd) {
    this.time += dt;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.9);
    for (let i = this.hitDirections.length - 1; i >= 0; i--) {
      this.hitDirections[i].t -= dt;
      if (this.hitDirections[i].t <= 0) this.hitDirections.splice(i, 1);
    }

    if (this.alive) this._updateAlive(dt, cmd);
    else this._updateDeath(dt);

    this._updateCamera(dt);
  }

  /* --------------------------------------------------------------- slide */

  /** True while a slide is legal: on the ground, moving, off cooldown. */
  canSlide() {
    return this.alive && !this.juggernaut
      && this.grounded && !this.sliding && this.slideCooldown <= 0
      && (this.sprinting || this.speed2D > SLIDE_ENTRY);
  }

  startSlide() {
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    // carry the run's direction, or fall back to where we are looking
    let dx, dz;
    if (sp > 0.5) { dx = this.velocity.x / sp; dz = this.velocity.z / sp; }
    else { const f = this.forwardFlat(this._tmp); dx = f.x; dz = f.z; }
    this.sliding = true;
    this.slideT = SLIDE_TIME;
    this.slideAirT = 0;
    this.slideDir.set(dx, 0, dz);
    this.slideSpeed = Math.min(Math.max(sp, SLIDE_ENTRY) * SLIDE_LAUNCH, SLIDE_MAX);
    this.velocity.x = dx * this.slideSpeed;
    this.velocity.z = dz * this.slideSpeed;
    this.crouching = true;
    this.sprinting = false;
    this.landDip.kick(-2.6);
    if (this.audio) this.audio.slide(this.position);
  }

  endSlide(cooldown = SLIDE_COOLDOWN) {
    if (!this.sliding) return;
    this.sliding = false;
    this.slideT = 0;
    this.slideCooldown = cooldown;
  }

  /** Bleed speed and decide when the slide is over. The direction is locked:
   *  a slide travels along the movement direction it started with, no matter
   *  where the camera looks mid-slide. */
  _updateSlide(dt, cmd) {
    this.slideT -= dt;
    const nx = this.slideDir.x;
    const nz = this.slideDir.z;

    this.slideSpeed = Math.max(0, this.slideSpeed - SLIDE_DECEL * dt);
    this.velocity.x = nx * this.slideSpeed;
    this.velocity.z = nz * this.slideSpeed;

    // jumping out of a slide launches you along it - the whole point of the move
    if (cmd.jump && this.grounded) {
      this.velocity.y = SLIDE_JUMP_UP;
      this.velocity.x += nx * SLIDE_JUMP_PUSH;
      this.velocity.z += nz * SLIDE_JUMP_PUSH;
      this.grounded = false;
      if (this.audio) this.audio.jump(this.position);
      this.endSlide(0.3);
      return;
    }

    // a short hop over a seam is fine, running off a ledge is not
    this.slideAirT = this.grounded ? 0 : this.slideAirT + dt;
    if (this.slideT <= 0 || this.slideSpeed < SLIDE_STOP || this.slideAirT > 0.2) this.endSlide();
  }

  _updateAlive(dt, cmd) {
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    if (this.sliding) this._updateSlide(dt, cmd);
    else if (cmd.slide && this.canSlide()) this.startSlide();

    const wantCrouch = cmd.crouch || this.sliding;
    if (this.crouching && !wantCrouch) {
      // Only stand once there is genuine headroom. Rising halfway through a
      // window used to wedge the taller body into the frame, and the push-out
      // then threw the player somewhere else entirely. Checked every frame,
      // so the stand happens by itself as soon as the opening is cleared.
      if (positionFree(this.level.colliders, this.position.x, this.position.y + 0.02,
        this.position.z, this.radius, STAND_H)) {
        this.crouching = false;
      }
    } else if (wantCrouch) {
      this.crouching = true;
    }
    this.crouchBlend = damp(this.crouchBlend, this.crouching ? 1 : 0, 13, dt);
    this.slideBlend = damp(this.slideBlend, this.sliding ? 1 : 0, this.sliding ? 16 : 9, dt);
    this.height = lerp(lerp(STAND_H, CROUCH_H, this.crouchBlend), SLIDE_H, this.slideBlend);

    const moving = cmd.move.x !== 0 || cmd.move.z !== 0;
    const canSprint = cmd.sprint && moving && cmd.move.z < -0.4 && !cmd.aim
      && !this.crouching && !this.sliding;
    this.sprinting = canSprint;

    // target speed for the current stance
    const speedMult = cmd.speedMult || 1;
    let target = STANDING_MOVE_SPEED;
    if (this.sliding) target = this.slideSpeed;
    else if (this.crouching) target = 2.45;
    else if (this.sprinting) {
      target = sprintMoveTargetSpeed(this.juggernaut, speedMult);
    }
    else if (cmd.aim) target = 3.15;
    if (!this.sliding && !this.sprinting) target *= speedMult;

    const fwd = this.forwardFlat(this._fwd);
    const right = this.rightFlat(this._right);
    const wishX = right.x * cmd.move.x + fwd.x * -cmd.move.z;
    const wishZ = right.z * cmd.move.x + fwd.z * -cmd.move.z;
    const wishLen = Math.hypot(wishX, wishZ);
    const wx = wishLen > 0 ? wishX / wishLen : 0;
    const wz = wishLen > 0 ? wishZ / wishLen : 0;

    const accel = this.grounded ? 62 : 16;
    // a slide steers itself; input and friction are both suspended
    const friction = this.sliding ? 0 : this.grounded ? 11.5 : 0.4;

    if (wishLen > 0 && !this.sliding) {
      const curr = this.velocity.x * wx + this.velocity.z * wz;
      const add = clamp(target - curr, 0, accel * dt);
      this.velocity.x += wx * add;
      this.velocity.z += wz * add;
    }
    // ground friction (Quake style: constant drop, so stopping feels crisp)
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    if (sp > 0.001 && friction > 0) {
      const control = Math.max(sp, 3.0);
      const drop = control * friction * dt * (wishLen > 0 ? 0.35 : 1);
      const k = Math.max(0, sp - drop) / sp;
      this.velocity.x *= k;
      this.velocity.z *= k;
    }
    // Hard speed cap, on the ground only: in the air it would eat the momentum
    // you earned by jumping out of a slide, and the accel step above already
    // refuses to push you past the stance speed.
    const sp2 = Math.hypot(this.velocity.x, this.velocity.z);
    const cap = target * 1.28;
    if (this.grounded && !this.sliding && sp2 > cap) {
      this.velocity.x *= cap / sp2;
      this.velocity.z *= cap / sp2;
    }

    // jump
    if (cmd.jump && this.grounded && !this.sliding) {
      this.velocity.y = 6.8;
      this.grounded = false;
      if (this.audio) this.audio.jump(this.position);
    }
    this.velocity.y -= 21 * dt;
    this.velocity.y = Math.max(this.velocity.y, -55);

    const res = moveActor(this, this.level.colliders, dt);
    this.grounded = res.grounded;
    this.landImpact = 0;
    if (res.landed > 0) {
      const hard = res.landed > 9;
      this.landDip.kick(-clamp(res.landed * 0.35, 0.5, 5));
      this.landImpact = res.landed;
      if (this.audio) this.audio.land(this.position, hard);
      if (hard) {
        const fall = res.landed - 11;
        if (fall > 0 && cmd.serverOwnsVitals !== true) {
          this.takeDamage(fall * 4.5, null, { name: 'GRAVITY' });
        }
      }
    }

    // keep inside the arena
    const B = this.level.bounds;
    this.position.x = clamp(this.position.x, -B.x, B.x);
    this.position.z = clamp(this.position.z, -B.z, B.z);

    this.speed2D = Math.hypot(this.velocity.x, this.velocity.z);

    /* ---- head bob + footsteps ---- */
    const bobSpeed = clamp(this.speed2D / 5.0, 0, 1.4);
    if (this.grounded && this.speed2D > 0.35 && !this.sliding) {
      const cadenceScale = this.juggernaut && this.sprinting
        ? JUGGERNAUT_SPRINT_BOB_RATE_SCALE
        : 1;
      this.bobPhase += dt
        * lerp(7.4, 11.0, clamp(this.speed2D / 6.5, 0, 1))
        * cadenceScale;
      this.bobAmp = damp(this.bobAmp, bobSpeed, 8, dt);
      const step = Math.floor(this.bobPhase / Math.PI);
      if (step !== this.stepSide) {
        this.stepSide = step;
        if (this.audio) this.audio.footstep(this.position, this.speed2D > 5.6);
      }
    } else {
      this.bobAmp = damp(this.bobAmp, 0, 6, dt);
      if (!this.grounded) this.bobPhase = damp(this.bobPhase, Math.round(this.bobPhase / Math.PI) * Math.PI, 4, dt);
    }

    // strafe lean, plus a roll into the slide when it runs across your view
    const strafe = cmd.move.x;
    this.leanRoll = damp(this.leanRoll, -strafe * 0.026 * (1 - (cmd.aimBlend || 0) * 0.6), 8, dt);
    const side = this.sliding ? this.slideDir.dot(this.rightFlat(this._right)) : 0;
    this.slideLean = damp(this.slideLean, -side * 0.085, 9, dt);

    /* ---- health regen ---- */
    if (cmd.serverOwnsVitals !== true) {
      const sinceHit = this.time - this.lastHitTime;
      // Juggernaut trauma remains for the life; only its armor plates recharge.
      if (!this.juggernaut && sinceHit > this.healthRegenDelay) {
        this.health = Math.min(this.maxHealth, this.health + dt * 14);
      }
      if (sinceHit > this.armorRegenDelay) {
        this.armor = Math.min(this.maxArmor, this.armor + dt * 6);
      }
    }
  }

  _updateDeath(dt) {
    const D = this.deathAnim;
    if (!D) return;
    D.t += dt;

    // the body folds: fast drop with a short bounce
    D.hVel -= 16 * dt;
    D.h += D.hVel * dt;
    const floor = 0.34;
    if (D.h <= floor) {
      D.h = floor;
      if (!D.bounced && D.hVel < -1.5) {
        D.bounced = true;
        D.hVel *= -0.24;
        this.hurtRoll.kick(rand(-2, 2));
        if (this.audio) this.audio.bodyFall(this.position);
      } else {
        D.hVel = 0;
        D.settled = Math.min(1, D.settled + dt * 1.6);
      }
    }

    // topple sideways
    const k = 1 - Math.exp(-4.5 * dt);
    D.rollVel += (D.rollTarget - D.roll) * 34 * dt;
    D.rollVel *= Math.exp(-6.5 * dt);
    D.roll += D.rollVel * dt;

    this.pitch = damp(this.pitch, D.pitchTarget, 3.2, dt);
    this.yaw = damp(this.yaw, D.yaw0 + D.yawDrift, 2.4, dt);

    // slide a little along the floor
    D.slide.multiplyScalar(Math.exp(-3.5 * dt));
    this.velocity.set(D.slide.x, this.velocity.y - 21 * dt, D.slide.z);
    moveActor(this, this.level.colliders, dt);
  }

  _updateCamera(dt) {
    this.recoilPitch.update(dt);
    this.recoilYaw.update(dt);
    this.punch.update(dt);
    this.landDip.update(dt);
    this.hurtRoll.update(dt);

    const bobScale = this.settings.viewBob * (1 - (this.adsBlend || 0) * 0.7);
    const amp = this.bobAmp * bobScale;
    // classic FPS bob: vertical at double the stride frequency
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.055 * amp;
    const bobX = Math.sin(this.bobPhase * 0.5) * 0.035 * amp;
    const bobRoll = Math.sin(this.bobPhase * 0.5) * 0.011 * amp;
    const bobPitch = Math.sin(this.bobPhase) * 0.006 * amp;

    // Joining a PVP room reserves a slot before the loadout is deployed. In
    // that state the local/server Player is intentionally not alive and has
    // no death animation yet; keep a neutral eye transform until the menu
    // camera takes over instead of dereferencing a nonexistent corpse.
    let eyeH = this.alive || !this.deathAnim ? this.eyeHeight() : this.deathAnim.h;
    eyeH += bobY + this.landDip.value * 0.045;

    const cam = this.camera;
    cam.position.set(this.position.x, this.position.y + eyeH, this.position.z);
    // lateral bob has to be applied along the camera's right vector
    const right = this.rightFlat(this._right);
    cam.position.x += right.x * bobX;
    cam.position.z += right.z * bobX;

    const deathRoll = this.alive ? 0 : (this.deathAnim?.roll || 0);
    cam.rotation.set(
      this.pitch + this.recoilPitch.value + bobPitch + this.punch.value * 0.004,
      this.yaw + this.recoilYaw.value,
      this.leanRoll + bobRoll + deathRoll + this.slideLean + this.hurtRoll.value * 0.04
    );
  }
}
