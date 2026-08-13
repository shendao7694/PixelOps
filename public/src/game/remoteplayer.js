import * as THREE from '../../vendor/three.module.js';
import { damp, angleDamp } from '../core/math.js';
import { CharacterRig } from './character.js';
import { buildWeapon } from './weapons.js';
import {
  GRENADE_THIRD_PERSON_THROW_SECONDS,
  buildGrenadeModel,
  grenadeKind,
} from './grenade.js';
import {
  JUGGERNAUT_MAX_ARMOR,
  JUGGERNAUT_MAX_HEALTH,
} from './juggernaut.js';
import { customConfig } from '../fx/custom.js'

const THROWABLE_SCALE = Object.freeze({
  frag: 0.82,
  incendiary: 0.80,
  molotov: 0.70,
});

function throwableState(value) {
  return value === 'carry' || value === 'aim' ? value : 'none';
}

export class RemotePlayer {
  ohp = customConfig.hp;
  constructor(scene, textures, snapshot, displayTeam = snapshot.team) {
    this.scene = scene;
    this.textures = textures;
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.team = snapshot.team;
    // Logical team stays untouched for damage/score rules. This separate
    // presentation team makes every client see allies blue and enemies red.
    this.displayTeam = displayTeam === 'blue' ? 'blue' : 'red';
    this.weaponId = snapshot.weapon || 'rifle';
    this.position = new THREE.Vector3(...snapshot.p);
    this.targetPosition = this.position.clone();
    this.velocity = new THREE.Vector3(...(snapshot.v || [0, 0, 0]));
    this.yaw = snapshot.yaw || 0;
    this.targetYaw = this.yaw;
    this.pitch = snapshot.pitch || 0;
    this.targetPitch = this.pitch;
    this.alive = snapshot.alive !== false;
    this.health = snapshot.health ?? this.ohp;
    this.armor = snapshot.armor ?? 50;
    this.kills = snapshot.kills || 0;
    this.deaths = snapshot.deaths || 0;
    this.score = snapshot.score || 0;
    this.invulnerable = !!snapshot.invulnerable;
    this.juggernaut = !!snapshot.juggernaut;
    this.maxHealth = snapshot.maxHealth
      ?? (this.juggernaut ? JUGGERNAUT_MAX_HEALTH : this.ohp);
    this.maxArmor = snapshot.maxArmor
      ?? (this.juggernaut ? JUGGERNAUT_MAX_ARMOR : 50);
    this.lastFiring = snapshot.firing || 0;
    this.firePulse = false;
    this.throwable = null;
    this.throwableModelKind = null;
    this.throwableKind = grenadeKind(snapshot.throwableKind);
    this.throwableState = throwableState(snapshot.throwableState);
    this.throwableThrowT = 0;
    this.throwableThrowFromAim = false;
    this.throwableVisualTime = 0;
    this.state = snapshot;
    this.buildRig();
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.y = this.yaw;
  }

  buildRig() {
    this.rig = new CharacterRig(this.textures, {
      team: this.displayTeam,
      juggernaut: this.juggernaut,
    });
    this.attachWeapon(this.weaponId);
    if (this.throwableState !== 'none') this.attachThrowable(this.throwableKind);
    this.updateEquipmentVisibility();
    this.rig.onImpact = null;
    this.scene.add(this.rig.root);
  }

  attachWeapon(id) {
    if (this.weapon) {
      this.rig.armR.hand.remove(this.weapon);
      this.weapon.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const built = buildWeapon(id, this.textures, false);
    this.weapon = built.group;
    this.weaponId = id;
    this.rig.attachWeapon(
      built.group,
      built.anchors.foregrip,
      built.anchors.muzzle,
      built.anchors.grip
    );
    this.updateEquipmentVisibility();
  }

  disposeThrowable() {
    if (!this.throwable) return;
    this.throwable.removeFromParent();
    this.throwable.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
    });
    for (const material of this.throwable.userData.ownedMaterials || []) {
      material.dispose();
    }
    this.throwable = null;
    this.throwableModelKind = null;
  }

  attachThrowable(kind) {
    const next = grenadeKind(kind);
    if (this.throwable && this.throwableModelKind === next) return this.throwable;
    this.disposeThrowable();
    const model = buildGrenadeModel(false, {
      textures: this.textures,
      team: this.displayTeam,
      kind: next,
    });
    model.name = `third-person-throwable-${next}`;
    model.scale.setScalar(THROWABLE_SCALE[next]);
    // The ordnance origin sits at its centre. Seat that centre just below the
    // wrist so the glove wraps the body rather than touching it at one point.
    model.position.set(0.01, -0.125, -0.025);
    model.rotation.set(0.05, 0, -0.08);
    model.visible = false;
    this.rig.armR.hand.add(model);
    this.throwable = model;
    this.throwableModelKind = next;
    return model;
  }

  updateEquipmentVisibility() {
    const throwing = this.throwableThrowT > 0;
    const holding = this.alive && this.throwableState !== 'none' && !throwing;
    const throwableActive = holding || throwing;
    if (throwableActive) this.attachThrowable(this.throwableKind);
    if (this.weapon) this.weapon.visible = !throwableActive;
    if (this.throwable) this.throwable.visible = holding;
  }

  playThrowableThrow(kind) {
    this.throwableKind = grenadeKind(kind);
    this.attachThrowable(this.throwableKind);
    this.throwableThrowFromAim = this.throwableState === 'aim';
    this.throwableThrowT = 0.0001;
    this.updateEquipmentVisibility();
  }

  rebuildForRespawn(snapshot) {
    this.disposeRig();
    this.team = snapshot.team;
    this.juggernaut = !!snapshot.juggernaut;
    this.maxHealth = snapshot.maxHealth
      ?? (this.juggernaut ? JUGGERNAUT_MAX_HEALTH : this.ohp);
    this.maxArmor = snapshot.maxArmor
      ?? (this.juggernaut ? JUGGERNAUT_MAX_ARMOR : 50);
    this.weaponId = snapshot.weapon || 'rifle';
    this.throwableKind = grenadeKind(snapshot.throwableKind);
    this.throwableState = throwableState(snapshot.throwableState);
    this.throwableThrowT = 0;
    this.throwableThrowFromAim = false;
    this.buildRig();
    this.position.set(...snapshot.p);
    this.targetPosition.copy(this.position);
    this.yaw = snapshot.yaw || 0;
    this.targetYaw = this.yaw;
    this.pitch = snapshot.pitch || 0;
    this.targetPitch = this.pitch;
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.set(0, this.yaw, 0);
  }

  applySnapshot(snapshot) {
    const wasAlive = this.alive;
    this.name = snapshot.name;
    this.team = snapshot.team;
    this.health = snapshot.health;
    this.armor = snapshot.armor;
    this.kills = snapshot.kills;
    this.deaths = snapshot.deaths;
    this.score = snapshot.score;
    this.invulnerable = !!snapshot.invulnerable;
    const wasJuggernaut = this.juggernaut;
    this.juggernaut = !!snapshot.juggernaut;
    this.maxHealth = snapshot.maxHealth
      ?? (this.juggernaut ? JUGGERNAUT_MAX_HEALTH : this.ohp);
    this.maxArmor = snapshot.maxArmor
      ?? (this.juggernaut ? JUGGERNAUT_MAX_ARMOR : 50);
    this.targetPosition.set(...snapshot.p);
    this.velocity.set(...(snapshot.v || [0, 0, 0]));
    this.targetYaw = snapshot.yaw || 0;
    this.targetPitch = snapshot.pitch || 0;
    this.alive = snapshot.alive;
    this.state = snapshot;
    this.throwableKind = grenadeKind(snapshot.throwableKind);
    this.throwableState = throwableState(snapshot.throwableState);

    if (!wasAlive && this.alive) {
      this.rebuildForRespawn(snapshot);
    } else if (wasAlive && !this.alive) {
      const hitDir = this.velocity.lengthSq() > 0.01
        ? this.velocity.clone().setY(0).normalize()
        : new THREE.Vector3(0, 0, 1);
      this.rig.die(hitDir, 1);
      this.throwableThrowT = 0;
    }
    if (this.alive && snapshot.weapon && snapshot.weapon !== this.weaponId) {
      this.attachWeapon(snapshot.weapon);
    }
    if (this.alive && wasJuggernaut !== this.juggernaut) {
      this.rig.setJuggernaut(this.juggernaut);
    }
    if ((snapshot.firing || 0) !== this.lastFiring) {
      this.lastFiring = snapshot.firing || 0;
      this.firePulse = true;
      this.rig.fireKick(snapshot.weapon === 'sniper' ? 1.5 : snapshot.weapon === 'shotgun' ? 1.25 : 0.8);
    }
    if (this.alive && this.throwableState !== 'none') {
      this.attachThrowable(this.throwableKind);
    }
    this.updateEquipmentVisibility();
  }

  update(dt) {
    if (!this.alive) {
      this.rig.update(dt, {});
      return;
    }
    const k = 1 - Math.exp(-18 * dt);
    this.position.lerp(this.targetPosition, k);
    this.yaw = angleDamp(this.yaw, this.targetYaw, 18, dt);
    this.pitch = damp(this.pitch, this.targetPitch, 18, dt);
    this.throwableVisualTime += dt;
    if (this.throwableThrowT > 0) {
      this.throwableThrowT += dt;
      if (this.throwableThrowT >= GRENADE_THIRD_PERSON_THROW_SECONDS) {
        this.throwableThrowT = 0;
        this.throwableThrowFromAim = false;
      }
    }
    this.updateEquipmentVisibility();
    if (this.throwable?.visible && this.throwable.userData.updateVisual) {
      this.throwable.userData.updateVisual(this.throwableVisualTime);
    }
    const activeThrowableState = this.throwableThrowT > 0
      ? 'throw'
      : this.throwableState;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const inv = speed > 0.05 ? 1 / speed : 0;
    const moveX = (this.velocity.x * rightX + this.velocity.z * rightZ) * inv;
    const moveZ = -(this.velocity.x * fwdX + this.velocity.z * fwdZ) * inv;
    this.rig.update(dt, {
      position: this.position,
      yaw: this.yaw,
      pitch: this.pitch,
      speed,
      moveX,
      moveZ,
      crouch: this.state.crouch,
      sliding: this.state.sliding,
      aiming: this.state.aiming,
      grounded: this.state.grounded,
      firing: this.firePulse,
      sprinting: this.state.sprinting,
      invulnerable: this.invulnerable,
      juggernaut: this.juggernaut,
      throwableState: activeThrowableState,
      throwableThrowProgress: this.throwableThrowT > 0
        ? Math.min(1, this.throwableThrowT / GRENADE_THIRD_PERSON_THROW_SECONDS)
        : 0,
      throwableThrowFromAim: this.throwableThrowFromAim,
    });
    this.firePulse = false;
  }

  muzzlePosition(out = new THREE.Vector3()) {
    return this.rig.getMuzzleWorld(out);
  }

  disposeRig() {
    if (!this.rig) return;
    this.disposeThrowable();
    this.scene.remove(this.rig.root);
    this.rig.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const mat of Object.values(this.rig.materials || {})) mat.dispose();
    this.weapon = null;
  }

  dispose() {
    this.disposeRig();
    this.rig = null;
    this.weapon = null;
  }
}
