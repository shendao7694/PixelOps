// Pooled world effects: pixel particles, tracers, bullet decals, shells and
// smoke. Everything is preallocated - no garbage during a firefight.
import * as THREE from '../../vendor/three.module.js';
import { rand, clamp } from '../core/math.js';

const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // aSize is a world-space diameter in metres; clamp so nearby hits stay
  // chunky pixels instead of screen-filling squares
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 1.0, 26.0);
}
`;

const PARTICLE_FRAG = /* glsl */ `
precision mediump float;
varying float vAlpha;
varying vec3 vColor;
void main() {
  if (vAlpha <= 0.01) discard;
  gl_FragColor = vec4(vColor, vAlpha);
}
`;

class ParticlePool {
  constructor(capacity, additive) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 200 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.geo = geo;
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, gravity = 9, drag = 1.2) {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      dirty = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] *= -0.25;
        this.vel[i3] *= 0.6;
        this.vel[i3 + 2] *= 0.6;
      }
      this.alpha[i] = clamp(this.life[i] / this.maxLife[i], 0, 1);
    }
    if (dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
    }
  }
}

export class Effects {
  constructor(scene, textures) {
    this.scene = scene;
    this.T = textures;

    this.smoke = new ParticlePool(700, false);
    this.sparks = new ParticlePool(500, true);
    scene.add(this.smoke.points, this.sparks.points);

    /* ---- tracers ---- */
    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.016, 0.016, 1);
    // Object3D.lookAt() points a plain mesh's +Z at the target, so the streak
    // must extend along +Z - along -Z it fires backwards over your shoulder.
    tracerGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
        color: 0xffd98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 0.06, hold: 0 });
    }
    this.tracerHead = 0;

    /* ---- bullet decals ---- */
    this.decals = [];
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 60; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: textures.bulletHole, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity: 1,
      });
      const m = new THREE.Mesh(decalGeo, mat);
      m.visible = false;
      scene.add(m);
      this.decals.push({ mesh: m, life: 0 });
    }
    this.decalHead = 0;

    /* ---- blood splats ---- */
    this.splats = [];
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: textures.bloodDecal, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
      const m = new THREE.Mesh(decalGeo, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.splats.push({ mesh: m, life: 0 });
    }
    this.splatHead = 0;

    /* ---- shells ---- */
    this.shells = [];
    const shellGeo = new THREE.BoxGeometry(0.016, 0.016, 0.045);
    const shellMat = new THREE.MeshLambertMaterial({ color: 0xc79a4a });
    const shotShellMat = new THREE.MeshLambertMaterial({ color: 0xa8342c });
    const sentryShellMat = new THREE.MeshLambertMaterial({ color: 0xd1a34f });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(shellGeo, shellMat);
      m.visible = false;
      m.castShadow = false;
      scene.add(m);
      this.shells.push({
        mesh: m, life: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3(), grounded: false,
      });
    }
    this.shellHead = 0;
    this.shellMats = { normal: shellMat, shotgun: shotShellMat, sentry: sentryShellMat };

    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  setViewportScale(renderHeight, fovRad) {
    const s = renderHeight / (2 * Math.tan(fovRad / 2));
    this.smoke.material.uniforms.uScale.value = s;
    this.sparks.material.uniforms.uScale.value = s;
  }

  /* ------------------------------------------------------------- spawners */

  tracer(from, to, color = 0xffd98a, width = 1, life = 0.06, hold = 0) {
    const t = this.tracers[this.tracerHead];
    this.tracerHead = (this.tracerHead + 1) % this.tracers.length;
    const d = this._v.copy(to).sub(from);
    const len = d.length();
    if (len < 0.05) return;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(width, width, len);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 1;
    t.mesh.visible = true;
    t.max = Math.max(0.02, life);
    t.hold = clamp(Number(hold) || 0, 0, t.max);
    t.life = t.max;
  }

  laserCannonBeam(from, to) {
    // Five times the previous ARC-7 diameter. Both additive layers remain
    // fully visible for one second, then the red halo and hot core fade out.
    this.tracer(from, to, 0xff1e12, 17, 1.25, 1.0);
    this.tracer(from, to, 0xffc0b0, 7.5, 1.22, 1.0);
  }

  impact(point, normal, surface = 'concrete', power = 1) {
    const n = normal || this._up;
    // dust puff
    const col = surface === 'metal' ? [0.85, 0.85, 0.9]
      : surface === 'wood' ? [0.55, 0.4, 0.24]
        : surface === 'sand' ? [0.72, 0.65, 0.48]
          : [0.62, 0.62, 0.6];
    for (let i = 0; i < 7 * power; i++) {
      this.smoke.spawn(
        point.x, point.y, point.z,
        n.x * rand(1, 4) + rand(-1.6, 1.6),
        n.y * rand(1, 4) + rand(0, 2),
        n.z * rand(1, 4) + rand(-1.6, 1.6),
        col[0] * rand(0.7, 1.1), col[1] * rand(0.7, 1.1), col[2] * rand(0.7, 1.1),
        rand(0.028, 0.065), rand(0.25, 0.6), 5, 2.6
      );
    }
    for (let i = 0; i < 5 * power; i++) {
      this.sparks.spawn(
        point.x, point.y, point.z,
        n.x * rand(2, 7) + rand(-3, 3),
        n.y * rand(2, 7) + rand(-1, 3),
        n.z * rand(2, 7) + rand(-3, 3),
        1, rand(0.7, 0.95), rand(0.25, 0.5),
        rand(0.018, 0.042), rand(0.1, 0.3), 14, 1.4
      );
    }
    this.decal(point, n);
  }

  shieldImpact(point, normal) {
    const n = normal || this._up;
    for (let i = 0; i < 12; i++) {
      this.sparks.spawn(
        point.x, point.y, point.z,
        n.x * rand(2, 7) + rand(-2.5, 2.5),
        n.y * rand(2, 7) + rand(-0.5, 3),
        n.z * rand(2, 7) + rand(-2.5, 2.5),
        1, rand(0.68, 0.92), rand(0.12, 0.28),
        rand(0.02, 0.05), rand(0.12, 0.34), 9, 1.2
      );
    }
  }

  decal(point, normal, scale = rand(0.11, 0.17)) {
    const d = this.decals[this.decalHead];
    this.decalHead = (this.decalHead + 1) % this.decals.length;
    d.mesh.position.copy(point).addScaledVector(normal, 0.012);
    this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    d.mesh.quaternion.copy(this._q);
    d.mesh.rotateZ(rand(0, 6.283));
    d.mesh.scale.setScalar(scale);
    d.mesh.material.opacity = 1;
    d.mesh.visible = true;
    d.life = 22;
  }

  blood(point, dir, power = 1) {
    for (let i = 0; i < 12 * power; i++) {
      this.smoke.spawn(
        point.x, point.y, point.z,
        dir.x * rand(0.5, 3.5) + rand(-1.8, 1.8),
        rand(0.5, 3.2),
        dir.z * rand(0.5, 3.5) + rand(-1.8, 1.8),
        rand(0.42, 0.72), rand(0.03, 0.10), rand(0.03, 0.09),
        rand(0.030, 0.075), rand(0.3, 0.7), 11, 1.1
      );
    }
    for (let i = 0; i < 4; i++) {
      this.smoke.spawn(
        point.x, point.y, point.z,
        rand(-0.7, 0.7), rand(0.2, 1.2), rand(-0.7, 0.7),
        0.35, 0.05, 0.05, rand(0.09, 0.16), rand(0.25, 0.45), 1.5, 2.2
      );
    }
  }

  bloodSplat(x, z, y = 0.03, scale = rand(0.5, 0.9)) {
    const s = this.splats[this.splatHead];
    this.splatHead = (this.splatHead + 1) % this.splats.length;
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.set(-Math.PI / 2, 0, rand(0, 6.283));
    s.mesh.scale.setScalar(scale);
    s.mesh.material.opacity = 0.9;
    s.mesh.visible = true;
    s.life = 26;
  }

  /**
   * Muzzle smoke. The muzzle sits ~0.6 m from the eye, so anything spawned
   * right on it covers the screen: puffs start well down-range, stay small,
   * and drift further away instead of towards the camera.
   */
  muzzleSmoke(point, dir) {
    for (let i = 0; i < 3; i++) {
      const ahead = 0.9 + i * 0.35;
      this.smoke.spawn(
        point.x + dir.x * ahead, point.y + dir.y * ahead, point.z + dir.z * ahead,
        dir.x * rand(1.6, 3.4) + rand(-0.25, 0.25),
        dir.y * rand(1.6, 3.4) + rand(0.05, 0.35),
        dir.z * rand(1.6, 3.4) + rand(-0.25, 0.25),
        0.60, 0.58, 0.54, rand(0.035, 0.07), rand(0.14, 0.26), 0.5, 2.8
      );
    }
  }

  /**
   * Missile-strike blast: a white-hot fireball flashing out through orange,
   * glowing debris arcs, a rising smoke column and scorch marks.
   */
  explosion(pos, scale = 1) {
    // white-hot core flash: huge, gone in a blink
    for (let i = 0; i < 14; i++) {
      this.sparks.spawn(
        pos.x + rand(-1, 1), pos.y + rand(0.4, 2.0), pos.z + rand(-1, 1),
        rand(-2, 2), rand(0, 3), rand(-2, 2),
        1, 1, rand(0.85, 1),
        rand(0.4, 0.8) * scale, rand(0.06, 0.14), 0, 3
      );
    }
    // ground shockwave: a ring of dust racing outwards
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const sp = rand(22, 30) * scale;
      this.smoke.spawn(
        pos.x + Math.cos(a) * 1.2, pos.y + 0.25, pos.z + Math.sin(a) * 1.2,
        Math.cos(a) * sp, rand(0.5, 1.5), Math.sin(a) * sp,
        rand(0.55, 0.7), rand(0.52, 0.66), rand(0.48, 0.6),
        rand(0.20, 0.42) * scale, rand(0.35, 0.6), 0.5, 3.4
      );
    }
    // fireball
    for (let i = 0; i < 70; i++) {
      const a = rand(0, Math.PI * 2);
      const el = rand(-0.2, 1.1);
      const sp = rand(4, 16) * scale;
      const c = Math.cos(el);
      this.sparks.spawn(
        pos.x, pos.y + 0.6, pos.z,
        Math.cos(a) * c * sp, Math.abs(Math.sin(el)) * sp * 0.9 + 2, Math.sin(a) * c * sp,
        1, rand(0.45, 0.85), rand(0.08, 0.25),
        rand(0.10, 0.30) * scale, rand(0.25, 0.7), 9, 1.6
      );
    }
    // glowing debris, flung far and falling hard
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(6, 20) * scale;
      this.sparks.spawn(
        pos.x, pos.y + 0.4, pos.z,
        Math.cos(a) * sp, rand(4, 14), Math.sin(a) * sp,
        1, rand(0.6, 0.8), rand(0.3, 0.5),
        rand(0.03, 0.07), rand(0.5, 1.2), 18, 0.8
      );
    }
    // smoke column (negative gravity: it rises and hangs there)
    for (let i = 0; i < 52; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 3.2 * scale;
      this.smoke.spawn(
        pos.x + Math.cos(a) * r, pos.y + rand(0.2, 2.4), pos.z + Math.sin(a) * r,
        Math.cos(a) * rand(1, 4), rand(3, 10), Math.sin(a) * rand(1, 4),
        rand(0.16, 0.30), rand(0.15, 0.27), rand(0.13, 0.24),
        rand(0.35, 0.95) * scale, rand(1.8, 3.4), -1.5, 1.0
      );
    }
    // scorch marks on the ground
    for (let i = 0; i < 4; i++) {
      this.decal(
        this._v.set(pos.x + rand(-2.5, 2.5) * scale, 0.02, pos.z + rand(-2.5, 2.5) * scale),
        this._up, rand(1.8, 3.4) * scale
      );
    }
  }

  /**
   * Budgeted B-2 impact. Twelve ordinary missile explosions plus twelve
   * ignition splashes used to enqueue more than three thousand particles in
   * under two seconds. The airstrike gets one purpose-built pooled burst per
   * bomb instead; the persistent batched fire field supplies the dense flame.
   */
  firebombImpact(pos, sequence = 0) {
    const phase = Math.max(0, Number(sequence) || 0);
    // White-hot centre and burning fuel fragments.
    for (let i = 0; i < 28; i++) {
      const angle = rand(0, Math.PI * 2);
      const elevation = rand(-0.08, 0.92);
      const speed = rand(4.5, 15.5);
      const horizontal = Math.cos(elevation);
      this.sparks.spawn(
        pos.x + rand(-0.22, 0.22),
        pos.y + rand(0.18, 0.72),
        pos.z + rand(-0.22, 0.22),
        Math.cos(angle) * horizontal * speed,
        Math.abs(Math.sin(elevation)) * speed + rand(1.2, 3.4),
        Math.sin(angle) * horizontal * speed,
        1,
        rand(0.40, 0.88),
        rand(0.025, 0.16),
        rand(0.10, 0.30),
        rand(0.24, 0.72),
        rand(7, 14),
        1.25
      );
    }
    // A compact ground sheet plus a rising column. Across all twelve bombs the
    // sequence remains broad without overrunning the global 700-puff pool.
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + phase * 0.31;
      const ring = i < 10;
      const speed = ring ? rand(8, 18) : rand(1.2, 4.8);
      this.smoke.spawn(
        pos.x + Math.cos(angle) * rand(0.15, 1.2),
        pos.y + rand(0.12, 1.15),
        pos.z + Math.sin(angle) * rand(0.15, 1.2),
        Math.cos(angle) * speed,
        ring ? rand(0.8, 2.8) : rand(3.0, 8.0),
        Math.sin(angle) * speed,
        rand(0.24, 0.46),
        rand(0.19, 0.36),
        rand(0.15, 0.28),
        rand(0.28, 0.72),
        ring ? rand(0.55, 1.15) : rand(1.25, 2.4),
        ring ? 0.8 : -0.7,
        ring ? 2.6 : 1.15
      );
    }
    // Four shared scorch decals are enough to anchor a twelve-bomb line; the
    // batched ground field handles the full burning footprint.
    if (phase % 3 === 0) {
      this.decal(
        this._v.set(pos.x, pos.y + 0.016, pos.z),
        this._up,
        rand(2.8, 4.4)
      );
    }
  }

  /** Glass fragments and burning-fuel splash from an impact-fused bottle. */
  molotovBreak(pos) {
    for (let i = 0; i < 34; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2.8, 9.5);
      this.sparks.spawn(
        pos.x + rand(-0.10, 0.10),
        pos.y + rand(0.05, 0.28),
        pos.z + rand(-0.10, 0.10),
        Math.cos(angle) * speed,
        rand(1.2, 5.8),
        Math.sin(angle) * speed,
        rand(0.42, 0.72),
        rand(0.68, 0.92),
        rand(0.60, 0.80),
        rand(0.035, 0.085),
        rand(0.36, 0.78),
        15,
        0.72
      );
    }
    this.incendiaryIgnite(pos);
  }

  /** Initial flash and outward splash when an incendiary canister ignites. */
  incendiaryIgnite(pos) {
    for (let i = 0; i < 56; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2.8, 10.5);
      this.sparks.spawn(
        pos.x + rand(-0.18, 0.18),
        pos.y + rand(0.06, 0.28),
        pos.z + rand(-0.18, 0.18),
        Math.cos(angle) * speed,
        rand(0.7, 3.0),
        Math.sin(angle) * speed,
        1,
        rand(0.38, 0.82),
        rand(0.025, 0.11),
        rand(0.07, 0.18),
        rand(0.30, 0.72),
        6.5,
        1.35
      );
    }
    for (let i = 0; i < 22; i++) {
      const angle = rand(0, Math.PI * 2);
      this.smoke.spawn(
        pos.x + rand(-0.55, 0.55),
        pos.y + rand(0.10, 0.46),
        pos.z + rand(-0.55, 0.55),
        Math.cos(angle) * rand(0.4, 2.3),
        rand(1.0, 3.5),
        Math.sin(angle) * rand(0.4, 2.3),
        rand(0.18, 0.29),
        rand(0.13, 0.22),
        rand(0.10, 0.17),
        rand(0.26, 0.58),
        rand(1.2, 2.5),
        -0.30,
        1.0
      );
    }
  }

  /** Low drifting embers layered over the broad persistent flame sheets. */
  incendiaryFlame(pos) {
    this.sparks.spawn(
      pos.x + rand(-0.24, 0.24),
      pos.y + rand(0, 0.08),
      pos.z + rand(-0.24, 0.24),
      rand(-0.48, 0.48),
      rand(0.35, 1.45),
      rand(-0.48, 0.48),
      1,
      rand(0.42, 0.82),
      rand(0.018, 0.075),
      rand(0.08, 0.18),
      rand(0.38, 0.82),
      -0.18,
      1.15
    );
    if (Math.random() < 0.56) {
      this.sparks.spawn(
        pos.x + rand(-0.12, 0.12),
        pos.y + 0.04,
        pos.z + rand(-0.12, 0.12),
        rand(-0.22, 0.22),
        rand(0.45, 1.15),
        rand(-0.22, 0.22),
        1,
        rand(0.78, 1),
        rand(0.30, 0.62),
        rand(0.045, 0.11),
        rand(0.16, 0.38),
        -0.12,
        1.45
      );
    }
    if (Math.random() < 0.46) {
      this.smoke.spawn(
        pos.x + rand(-0.18, 0.18),
        pos.y + 0.12,
        pos.z + rand(-0.18, 0.18),
        rand(-0.34, 0.34),
        rand(0.55, 1.65),
        rand(-0.34, 0.34),
        rand(0.13, 0.22),
        rand(0.11, 0.18),
        rand(0.09, 0.15),
        rand(0.17, 0.34),
        rand(1.2, 2.1),
        -0.22,
        1.12
      );
    }
  }

  /**
   * A one-ton equipment crate hitting without a parachute: a broad ground
   * sheet of dust, a dense upward smoke punch and dark fragments. Deliberately
   * no orange fireball—the impact is violent, but the crate does not explode.
   */
  airdropImpact(pos) {
    for (let i = 0; i < 64; i++) {
      const a = rand(0, Math.PI * 2);
      const speed = rand(8, 24);
      this.smoke.spawn(
        pos.x + Math.cos(a) * rand(0.1, 0.9),
        pos.y + rand(0.08, 0.42),
        pos.z + Math.sin(a) * rand(0.1, 0.9),
        Math.cos(a) * speed,
        rand(0.4, 3.4),
        Math.sin(a) * speed,
        rand(0.36, 0.60),
        rand(0.34, 0.55),
        rand(0.29, 0.46),
        rand(0.16, 0.48),
        rand(0.55, 1.25),
        1.2,
        2.2
      );
    }
    for (let i = 0; i < 42; i++) {
      const a = rand(0, Math.PI * 2);
      const radius = Math.sqrt(Math.random()) * 1.2;
      this.smoke.spawn(
        pos.x + Math.cos(a) * radius,
        pos.y + rand(0.12, 0.75),
        pos.z + Math.sin(a) * radius,
        Math.cos(a) * rand(1, 5),
        rand(3.5, 10),
        Math.sin(a) * rand(1, 5),
        rand(0.18, 0.34),
        rand(0.19, 0.32),
        rand(0.18, 0.29),
        rand(0.28, 0.72),
        rand(1.3, 2.8),
        -0.8,
        1.0
      );
    }
    for (let i = 0; i < 48; i++) {
      const a = rand(0, Math.PI * 2);
      const speed = rand(4, 17);
      this.sparks.spawn(
        pos.x + rand(-0.45, 0.45),
        pos.y + rand(0.18, 0.7),
        pos.z + rand(-0.45, 0.45),
        Math.cos(a) * speed,
        rand(3, 13),
        Math.sin(a) * speed,
        rand(0.25, 0.48),
        rand(0.25, 0.46),
        rand(0.22, 0.38),
        rand(0.035, 0.12),
        rand(0.5, 1.45),
        19,
        0.7
      );
    }
    this.decal(
      this._v.set(pos.x, pos.y + 0.018, pos.z),
      this._up,
      rand(1.6, 2.4)
    );
  }

  /**
   * GAU-8 shell impact: much tighter than a missile blast, but brighter and
   * heavier than an infantry round. Repeated impacts form a rolling wall of
   * dust, incandescent fragments and overlapping ground scars.
   */
  cannonImpact(pos) {
    for (let i = 0; i < 9; i++) {
      const a = rand(0, Math.PI * 2);
      const speed = rand(5, 16);
      this.sparks.spawn(
        pos.x, pos.y + 0.18, pos.z,
        Math.cos(a) * speed, rand(4, 12), Math.sin(a) * speed,
        1, rand(0.62, 0.92), rand(0.18, 0.42),
        rand(0.055, 0.14), rand(0.18, 0.48), 16, 1.2
      );
    }
    for (let i = 0; i < 13; i++) {
      const a = rand(0, Math.PI * 2);
      const speed = rand(3, 10);
      this.smoke.spawn(
        pos.x + rand(-0.25, 0.25), pos.y + 0.12, pos.z + rand(-0.25, 0.25),
        Math.cos(a) * speed, rand(2.2, 7.5), Math.sin(a) * speed,
        rand(0.29, 0.48), rand(0.27, 0.43), rand(0.23, 0.36),
        rand(0.18, 0.46), rand(0.75, 1.55), -0.35, 1.35
      );
    }
    for (let i = 0; i < 4; i++) {
      this.sparks.spawn(
        pos.x + rand(-0.18, 0.18), pos.y + rand(0.15, 0.55), pos.z + rand(-0.18, 0.18),
        rand(-1.2, 1.2), rand(0.5, 3), rand(-1.2, 1.2),
        1, 0.94, rand(0.62, 0.9),
        rand(0.18, 0.34), rand(0.055, 0.11), 0, 3
      );
    }
    this.decal(
      this._v.set(pos.x + rand(-0.3, 0.3), pos.y + 0.025, pos.z + rand(-0.3, 0.3)),
      this._up,
      rand(0.55, 0.95)
    );
  }

  ejectShell(worldPos, forward, right, up, kind = 'normal') {
    const s = this.shells[this.shellHead];
    this.shellHead = (this.shellHead + 1) % this.shells.length;
    const shotgun = kind === 'shotgun';
    const sentry = kind === 'sentry';
    s.mesh.position.copy(worldPos);
    s.mesh.material = shotgun
      ? this.shellMats.shotgun
      : (sentry ? this.shellMats.sentry : this.shellMats.normal);
    s.mesh.scale.setScalar(shotgun ? 1.5 : (sentry ? 1.3 : 1));
    s.vel.copy(right).multiplyScalar(sentry ? rand(2.8, 4.2) : rand(1.6, 3.0))
      .addScaledVector(up, sentry ? rand(1.8, 2.8) : rand(1.2, 2.4))
      .addScaledVector(forward, rand(-0.6, 0.4));
    s.spin.set(rand(-18, 18), rand(-18, 18), rand(-18, 18));
    s.life = 3.2;
    s.grounded = false;
    s.mesh.visible = true;
  }

  /* --------------------------------------------------------------- update */

  update(dt) {
    this.smoke.update(dt);
    this.sparks.update(dt);

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      const elapsed = t.max - t.life;
      const fadeDuration = Math.max(0.001, t.max - t.hold);
      t.mesh.material.opacity = (elapsed <= t.hold
        ? 1
        : clamp(t.life / fadeDuration, 0, 1)) * 0.9;
    }

    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      if (d.life < 2) d.mesh.material.opacity = d.life / 2;
    }

    for (const s of this.splats) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      if (s.life < 3) s.mesh.material.opacity = (s.life / 3) * 0.9;
    }

    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      if (!s.grounded) {
        s.vel.y -= 16 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.mesh.rotation.x += s.spin.x * dt;
        s.mesh.rotation.y += s.spin.y * dt;
        s.mesh.rotation.z += s.spin.z * dt;
        if (s.mesh.position.y <= 0.012) {
          s.mesh.position.y = 0.012;
          if (Math.abs(s.vel.y) < 0.8) {
            s.grounded = true;
            s.mesh.rotation.x = Math.PI / 2;
          } else {
            s.vel.y *= -0.35;
            s.vel.x *= 0.6;
            s.vel.z *= 0.6;
            s.spin.multiplyScalar(0.5);
          }
        }
      }
    }
  }
}
