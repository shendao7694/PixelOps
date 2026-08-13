// AI soldier. Simple, readable FSM (patrol -> engage -> search -> regroup)
// with reaction delays, burst discipline, strafing and cover seeking, driving
// the same CharacterRig the player shoots at.
import * as THREE from '../../vendor/three.module.js';
import { clamp, lerp, damp, rand, randInt, angleDelta, angleDamp, TAU } from '../core/math.js';
import { moveActor, positionFree } from '../core/collision.js';
import { findPath, segmentClear } from '../world/levelbuild.js';
import { CharacterRig } from './character.js';
import { applyArmorDamage } from './damage.js';
import { WEAPON_DEFS, buildWeapon } from './weapons.js';

const NAMES_BLUE = ['ALPHA-1', 'ALPHA-2', 'ALPHA-3', 'ALPHA-4', 'ALPHA-5', 'ALPHA-6', 'ALPHA-7', 'ALPHA-8'];
const NAMES_RED = ['KILO-1', 'KILO-2', 'KILO-3', 'KILO-4', 'KILO-5', 'KILO-6', 'KILO-7', 'KILO-8'];
const LOADOUTS = ['rifle', 'rifle', 'smg', 'smg', 'shotgun', 'sniper'];

let botSeq = 0;

export class Bot {
  constructor({ team, level, textures, index }) {
    this.id = ++botSeq;
    this.team = team;
    this.level = level;
    this.name = (team === 'blue' ? NAMES_BLUE : NAMES_RED)[index % 8];
    this.isBot = true;

    this.rig = new CharacterRig(textures, { team });
    this.weaponId = LOADOUTS[index % LOADOUTS.length];
    this.def = WEAPON_DEFS[this.weaponId];
    const built = buildWeapon(this.weaponId, textures, false);
    this.rig.attachWeapon(
      built.group,
      built.anchors.foregrip,
      built.anchors.muzzle,
      built.anchors.grip
    );
    this.rig.onImpact = () => { if (this.onBodyImpact) this.onBodyImpact(this); };

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = 0.38;
    this.height = 1.8;
    this.stepHeight = 0.55;
    this.grounded = false;

    this.yaw = rand(0, TAU);
    this.pitch = 0;
    this.aimYaw = this.yaw;
    this.aimPitch = 0;

    this.maxHealth = 100;
    this.health = 100;
    this.maxArmor = 50;
    this.armor = 50;
    this.lastDamage = null;
    this.alive = true;
    this.deadTimer = 0;

    // Deliberately mediocre: they react late, shoot loose groups and take
    // long breaks between bursts, so a firefight is winnable rather than a
    // reflex test. See also BOT_DAMAGE in main.js.
    this.skill = rand(0.22, 0.62);
    this.state = 'patrol';
    this.target = null;
    this.lastSeenPos = new THREE.Vector3();
    this.lastSeenTime = -99;
    this.losTimer = 0;
    this.hasLos = false;
    this.reaction = 0;
    this.burst = 0;
    this.burstCooldown = 0;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.mag = this.def.mag;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = rand(0.6, 1.8);
    this.destination = new THREE.Vector3();
    this.path = null;
    this.pathIdx = 0;
    this.repathTimer = 0;
    this.searchRepath = 0;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.crouch = false;
    this.jumpCooldown = 0;
    this.kills = 0;
    this.deaths = 0;
    this.score = 0;
    this.onReloadStart = null;

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
  }

  get object() { return this.rig.root; }

  eyePosition(out = this._v2) {
    return out.set(this.position.x, this.position.y + (this.crouch ? 1.05 : 1.56), this.position.z);
  }

  muzzlePosition(out = this._muzzle) {
    this.rig.getMuzzleWorld(out);
    if (!isFinite(out.x)) this.eyePosition(out);
    return out;
  }

  spawn(pos) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.armor = this.maxArmor;
    this.lastDamage = null;
    this.alive = true;
    this.deadTimer = 0;
    this.mag = this.def.mag;
    this.reloadTimer = 0;
    this.state = 'patrol';
    this.target = null;
    this.rig.dead = false;
    this.rig.ragdoll = null;
    this.rig.hitFlash = 0;
    this.rig.root.visible = true;
    this.rig.root.position.copy(pos);
    this.rig.root.rotation.set(0, this.yaw, 0);
    this.pickDestination();
  }

  hit(amount, dir, part, attacker) {
    if (!this.alive) return false;
    this.lastDamage = applyArmorDamage(this, amount);
    const localSide = dir ? dir.x * Math.cos(-this.yaw) + dir.z * Math.sin(-this.yaw) : 0;
    this.rig.hurt(localSide, clamp(amount / 40, 0.3, 1.4));
    // getting shot at makes them look for the shooter
    if (attacker && (!this.target || this.target === attacker || Math.random() < 0.6)) {
      this.target = attacker;
      this.lastSeenPos.copy(attacker.position);
      this.lastSeenTime = this.time || 0;
      if (this.state === 'patrol') this.state = 'search';
      this.reaction = Math.max(this.reaction, rand(0.16, 0.38));
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deadTimer = 0;
      this.deaths++;
      this.rig.die(dir || new THREE.Vector3(0, 0, 1), part === 'head' ? 1.35 : 1);
      return true;
    }
    return false;
  }

  pickDestination() {
    const wp = this.level.waypoints;
    if (!wp || !wp.length) { this.repathTimer = 3; return; }
    let best = null;
    for (let i = 0; i < 4; i++) {
      const c = wp[randInt(0, wp.length - 1)];
      if (!best || c.distanceToSquared(this.position) > 36) best = c;
    }
    this.setDestination(best || this.position);
  }

  /**
   * Route to a point through the nav graph. Indoors the direct line is almost
   * always blocked by a wall, so the path is what actually gets bots through
   * doorways; steering only handles the last few metres and local avoidance.
   */
  setDestination(target) {
    this.destination.copy(target);
    // long enough to actually walk the route rather than re-rolling mid-way -
    // the arena is 100 m across, so a crossing takes the better part of half a minute
    this.repathTimer = rand(14, 24);
    this.path = null;
    this.pathIdx = 0;
    const graph = this.level.navGraph;
    if (!graph || !graph.nodes.length) return;
    // no need to path if we can just walk there
    if (segmentClear(this.level.colliders, this.position.x, this.position.z, target.x, target.z)) return;
    const path = findPath(graph, this.position.x, this.position.z, target.x, target.z);
    if (path && path.length) {
      this.path = path;
      this.pathIdx = 0;
    }
  }

  /** The point to actually steer at this frame: next path node, or the goal. */
  currentGoal() {
    if (!this.path) return this.destination;
    while (this.pathIdx < this.path.length) {
      const node = this.path[this.pathIdx];
      const dx = node.x - this.position.x, dz = node.z - this.position.z;
      if (dx * dx + dz * dz > 1.6 * 1.6) return node;
      this.pathIdx++;
    }
    this.path = null;
    return this.destination;
  }

  /** Closest cover point that puts distance between us and the threat. */
  findCover(threat) {
    const pts = this.level.coverPoints;
    let best = null;
    let bestScore = Infinity;
    const myDist = this.position.distanceTo(threat);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const d = this.position.distanceTo(p);
      if (d > 26) continue;
      const away = p.distanceTo(threat);
      if (away < myDist * 0.9) continue;      // no point running towards them
      const score = d - away * 0.35;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best ? best.clone() : null;
  }

  /** Move towards `to`, sliding around anything in the way. */
  steer(dt, to, speedTarget, strafe = 0) {
    const dir = this._v.subVectors(to, this.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist < 0.001) return dist;
    dir.multiplyScalar(1 / dist);

    // obstacle avoidance: try the direct route, then fan out
    let mx = dir.x, mz = dir.z;
    const probe = 1.5;
    let clear = false;
    for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.7, -1.7]) {
      const c = Math.cos(a), s = Math.sin(a);
      const tx = dir.x * c - dir.z * s;
      const tz = dir.x * s + dir.z * c;
      if (positionFree(this.level.colliders, this.position.x + tx * probe, this.position.y + 0.35,
        this.position.z + tz * probe, this.radius, this.height - 0.4)) {
        mx = tx; mz = tz; clear = true;
        break;
      }
    }
    if (!clear) { mx = -dir.x; mz = -dir.z; }

    if (strafe !== 0) {
      const sx = -mz * strafe, sz = mx * strafe;
      mx = mx * 0.55 + sx * 0.85;
      mz = mz * 0.55 + sz * 0.85;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l; mz /= l;
    }

    const accel = this.grounded ? 46 : 12;
    const curr = this.velocity.x * mx + this.velocity.z * mz;
    const add = clamp(speedTarget - curr, 0, accel * dt);
    this.velocity.x += mx * add;
    this.velocity.z += mz * add;
    return dist;
  }

  update(dt, world) {
    this.time = world.time;

    if (!this.alive) {
      this.deadTimer += dt;
      this.rig.update(dt, {});
      return;
    }

    /* ---------------- perception ---------------- */
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = rand(0.18, 0.34);
      const found = world.findTarget(this);
      if (found) {
        if (found !== this.target) this.reaction = rand(0.30, 0.72) * (1.6 - this.skill);
        this.target = found;
        this.hasLos = true;
        this.lastSeenPos.copy(found.position);
        this.lastSeenTime = world.time;
      } else {
        this.hasLos = false;
        if (this.target && !this.target.alive) this.target = null;
      }
    }
    if (this.reaction > 0) this.reaction -= dt;

    const sinceSeen = world.time - this.lastSeenTime;
    if (this.hasLos) this.state = 'engage';
    else if (this.target && sinceSeen < 6) this.state = 'search';
    else { this.state = 'patrol'; this.target = null; }

    /* ---------------- act ---------------- */
    let speedTarget = 3.2;
    let strafe = 0;
    let aiming = false;
    let firing = false;

    if (this.state === 'engage' && this.target) {
      const tp = this.target.position;
      const dist = this.position.distanceTo(tp);
      const preferred = this.def.id === 'shotgun' ? 6 : this.def.id === 'sniper' ? 26 : 14;

      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(0.7, 2.0);
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      strafe = this.strafeDir;

      // hurt bots break contact and fall back to the nearest piece of cover
      if (this.health < 34) {
        if (!this.coverPoint || this.position.distanceTo(this.coverPoint) < 1.6) {
          this.coverPoint = this.findCover(tp);
          if (this.coverPoint) this.setDestination(this.coverPoint);
        }
      } else {
        this.coverPoint = null;
      }

      // close in or back off to the preferred range
      const want = this._v2.copy(this.coverPoint ? this.currentGoal() : tp);
      if (this.coverPoint) {
        speedTarget = 5.0;
        strafe = 0;
      } else if (dist < preferred * 0.7) {
        want.sub(this.position).setY(0).normalize().multiplyScalar(-4).add(this.position);
        speedTarget = 3.6;
      } else if (dist > preferred * 1.25) {
        speedTarget = 4.6;
      } else {
        speedTarget = 2.9;
      }
      this.steer(dt, want, speedTarget, strafe);

      if (this.health < 32 && Math.random() < dt * 0.7) this.crouch = true;
      else if (Math.random() < dt * 0.4) this.crouch = false;

      aiming = this.reaction <= 0 && (dist > 6 || this.def.id === 'sniper');

      // aim
      const eye = this.eyePosition();
      const aimAt = this._v.copy(tp);
      aimAt.y += this.target.isSentry ? 0.8 : 1.35;
      // lead the target a touch
      if (this.target.velocity) aimAt.addScaledVector(this.target.velocity, clamp(dist / 420, 0, 0.09));
      const dx = aimAt.x - eye.x, dy = aimAt.y - eye.y, dz = aimAt.z - eye.z;
      const flat = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dy, flat);
      const turn = lerp(4.5, 9.0, this.skill);
      this.aimYaw = angleDamp(this.aimYaw, wantYaw, turn, dt);
      this.aimPitch = damp(this.aimPitch, wantPitch, turn, dt);
      this.yaw = angleDamp(this.yaw, wantYaw, turn * 0.85, dt);
      this.pitch = this.aimPitch;

      // fire when roughly on target
      const aimErr = Math.abs(angleDelta(this.aimYaw, wantYaw)) + Math.abs(this.aimPitch - wantPitch);
      const inRange = dist < this.def.range * 1.1;
      if (this.reaction <= 0 && aimErr < 0.16 && inRange && this.reloadTimer <= 0) {
        firing = this.tryFire(dt, world, dist);
      }
    } else if (this.state === 'search' && this.target) {
      // hunt towards the last known position, routing around walls
      this.searchRepath -= dt;
      if (this.searchRepath <= 0 || !this.path) {
        this.searchRepath = 1.2;
        this.setDestination(this.lastSeenPos);
      }
      speedTarget = 4.8;
      const goal = this.currentGoal();
      this.steer(dt, goal, speedTarget);
      const wantYaw = Math.atan2(-(goal.x - this.position.x), -(goal.z - this.position.z));
      this.yaw = angleDamp(this.yaw, wantYaw, 7, dt);
      this.aimYaw = this.yaw;
      this.pitch = damp(this.pitch, 0, 5, dt);
      if (this.position.distanceTo(this.lastSeenPos) < 2.5) { this.lastSeenTime = -99; this.target = null; }
      if (this.mag < this.def.mag * 0.4) this.startReload();
    } else {
      this.repathTimer -= dt;
      speedTarget = 3.4;
      const goal = this.currentGoal();
      this.steer(dt, goal, speedTarget);
      const reached = this.position.distanceTo(this.destination) < 2.2;
      if (reached || this.repathTimer <= 0) this.pickDestination();
      const wantYaw = Math.atan2(-(goal.x - this.position.x), -(goal.z - this.position.z));
      this.yaw = angleDamp(this.yaw, wantYaw, 5, dt);
      this.aimYaw = this.yaw;
      this.pitch = damp(this.pitch, 0, 4, dt);
      if (this.mag < this.def.mag) this.startReload();
      this.crouch = false;
    }

    /* ---------------- reload ---------------- */
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.mag = this.def.mag;
    } else if (this.mag <= 0) {
      this.startReload();
    }
    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.burstCooldown > 0) this.burstCooldown -= dt;

    /* ---------------- physics ---------------- */
    this.velocity.y -= 21 * dt;
    // friction
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    if (sp > 0.001 && this.grounded) {
      const drop = Math.max(sp, 3) * 9 * dt * 0.4;
      const k = Math.max(0, sp - drop) / sp;
      this.velocity.x *= k;
      this.velocity.z *= k;
    }
    const res = moveActor(this, this.level.colliders, dt);
    this.grounded = res.grounded;

    // unstick: hop or repath if we stop making progress
    if (this.position.distanceToSquared(this.lastPos) < 0.0006) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.7) {
        this.stuckTimer = 0;
        if (this.grounded && this.jumpCooldown <= 0) {
          this.velocity.y = 6.4;
          this.jumpCooldown = 1.2;
        }
        this.pickDestination();
      }
    } else {
      this.stuckTimer = 0;
      this.lastPos.copy(this.position);
    }
    this.jumpCooldown -= dt;

    const B = this.level.bounds;
    this.position.x = clamp(this.position.x, -B.x, B.x);
    this.position.z = clamp(this.position.z, -B.z, B.z);

    /* ---------------- animation ---------------- */
    const speed2D = Math.hypot(this.velocity.x, this.velocity.z);
    const cos = Math.cos(-this.yaw), sin = Math.sin(-this.yaw);
    const localX = this.velocity.x * cos + this.velocity.z * sin;
    const localZ = -this.velocity.x * sin + this.velocity.z * cos;
    this.rig.update(dt, {
      position: this.position,
      yaw: this.yaw,
      pitch: clamp(this.pitch, -0.9, 0.9),
      speed: speed2D,
      moveX: clamp(localX / 4, -1, 1),
      moveZ: clamp(-localZ / 4, -1, 1),
      crouch: this.crouch,
      aiming,
      firing,
      sprinting: speed2D > 4.3 && this.state !== 'engage' && !aiming,
      grounded: this.grounded,
    });
  }

  startReload() {
    if (this.reloadTimer > 0 || this.mag >= this.def.mag) return;
    this.reloadTimer = this.def.reloadEmptyTime || this.def.reloadTime;
    this.onReloadStart?.(this);
  }

  tryFire(dt, world, dist) {
    if (this.fireTimer > 0 || this.burstCooldown > 0 || this.mag <= 0) return false;
    const d = this.def;
    if (this.burst <= 0) {
      this.burst = d.auto ? randInt(2, 4) : 1;
    }
    this.mag--;
    this.burst--;
    this.fireTimer = 60 / d.rpm;
    if (this.burst <= 0) {
      this.burstCooldown = rand(0.50, 1.25) * (1.7 - this.skill);
    }
    this.rig.fireKick(d.kick * 0.5);

    // accuracy: better bots shoot tighter, distance and movement widen it
    const moveFactor = 1 + clamp(Math.hypot(this.velocity.x, this.velocity.z) / 6, 0, 1) * 0.8;
    const spread = lerp(0.125, 0.040, this.skill) * moveFactor * clamp(dist / 22, 0.6, 2.2);
    world.botShoot(this, spread);
    return true;
  }
}
