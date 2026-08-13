// Small math toolbox shared by every system.
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = lerp;

/** Frame-rate independent lerp. lambda ~ "how fast", larger is snappier. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const smoothstep = (e0, e1, x) => {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export const invLerp = (a, b, v) => (b === a ? 0 : saturate((v - a) / (b - a)));

/** Shortest signed delta between two angles, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function angleDamp(from, to, lambda, dt) {
  return from + angleDelta(from, to) * (1 - Math.exp(-lambda * dt));
}

/** Deterministic PRNG (mulberry32) so generated art is stable across runs. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Box-Muller-ish cheap gaussian in [-1,1] bias to centre. */
export const randGauss = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;

/**
 * Critically-ish damped spring for a scalar. Used for weapon recoil,
 * camera kick, flinch, and every other "snap then settle" motion.
 */
export class Spring {
  constructor(stiffness = 140, damping = 14, value = 0) {
    this.k = stiffness;
    this.d = damping;
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
  set(v) {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
  kick(v) {
    this.velocity += v;
  }
  update(dt) {
    // sub-step for stability at low frame rates
    const steps = dt > 1 / 45 ? 2 : 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (this.target - this.value) * this.k - this.velocity * this.d;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}

/** Three independent springs, handy for positional kick. */
export class Spring3 {
  constructor(stiffness, damping) {
    this.x = new Spring(stiffness, damping);
    this.y = new Spring(stiffness, damping);
    this.z = new Spring(stiffness, damping);
  }
  kick(x, y, z) {
    this.x.kick(x);
    this.y.kick(y);
    this.z.kick(z);
  }
  update(dt) {
    this.x.update(dt);
    this.y.update(dt);
    this.z.update(dt);
  }
  get vx() { return this.x.value; }
  get vy() { return this.y.value; }
  get vz() { return this.z.value; }
}

/** Linear keyframe track: [{ t, ...values }] sampled by time. */
export function sampleTrack(track, time, keys) {
  let i = 0;
  while (i < track.length - 1 && track[i + 1].t <= time) i++;
  const a = track[i];
  const b = track[Math.min(i + 1, track.length - 1)];
  const span = b.t - a.t;
  const u = span > 0 ? saturate((time - a.t) / span) : 1;
  const e = u * u * (3 - 2 * u); // ease in/out keeps procedural anims readable
  const out = {};
  for (const k of keys) {
    const av = a[k] !== undefined ? a[k] : 0;
    const bv = b[k] !== undefined ? b[k] : 0;
    out[k] = av + (bv - av) * e;
  }
  return out;
}
