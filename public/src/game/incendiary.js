import * as THREE from '../../vendor/three.module.js';
import { clamp, lerp } from '../core/math.js';

// Kept separate from fragmentation-grenade balance so either lethal can be
// tuned without silently changing the other.
const PREVIOUS_FIRE_RADIUS = 7.5;
export const INCENDIARY_RADIUS = PREVIOUS_FIRE_RADIUS * 0.85;
export const MOLOTOV_RADIUS = PREVIOUS_FIRE_RADIUS * 0.80;
export const INCENDIARY_DURATION_SECONDS = 10.5;
export const MOLOTOV_DURATION_SECONDS = 8.75;
export const INCENDIARY_TICK_SECONDS = 0.5;
export const MOLOTOV_TICK_DAMAGE = 24;
export const INCENDIARY_TICK_DAMAGE = MOLOTOV_TICK_DAMAGE * 1.10;
export const AIRSTRIKE_INCENDIARY_KIND = 'firebomb';
export const AIRSTRIKE_INCENDIARY_DURATION_SECONDS =
  INCENDIARY_DURATION_SECONDS + 3;
export const AIRSTRIKE_INCENDIARY_TICK_DAMAGE =
  INCENDIARY_TICK_DAMAGE * 1.25;

export function normalizeIncendiaryKind(kind = 'incendiary') {
  if (kind === 'molotov') return 'molotov';
  if (kind === AIRSTRIKE_INCENDIARY_KIND) return AIRSTRIKE_INCENDIARY_KIND;
  return 'incendiary';
}

export function incendiaryRadius(kind = 'incendiary') {
  return normalizeIncendiaryKind(kind) === 'molotov'
    ? MOLOTOV_RADIUS
    : INCENDIARY_RADIUS;
}

export function incendiaryTickDamage(kind = 'incendiary') {
  const normalized = normalizeIncendiaryKind(kind);
  if (normalized === 'molotov') return MOLOTOV_TICK_DAMAGE;
  if (normalized === AIRSTRIKE_INCENDIARY_KIND) {
    return AIRSTRIKE_INCENDIARY_TICK_DAMAGE;
  }
  return INCENDIARY_TICK_DAMAGE;
}

export function incendiaryDuration(kind = 'incendiary') {
  const normalized = normalizeIncendiaryKind(kind);
  if (normalized === 'molotov') return MOLOTOV_DURATION_SECONDS;
  if (normalized === AIRSTRIKE_INCENDIARY_KIND) {
    return AIRSTRIKE_INCENDIARY_DURATION_SECONDS;
  }
  return INCENDIARY_DURATION_SECONDS;
}

export function incendiaryDamage(distance, kind = 'incendiary') {
  const radius = incendiaryRadius(kind);
  const peakDamage = incendiaryTickDamage(kind);
  const ratio = Math.max(0, Number(distance) || 0) / radius;
  if (ratio > 1) return 0;
  if (ratio <= 0.55) return peakDamage;
  const edge = clamp((ratio - 0.55) / 0.45, 0, 1);
  return peakDamage * lerp(1, 0.65, edge);
}

/** Persistent fire never reaches through world cover, even near its centre. */
export function incendiaryOccluded(origin, target, cast) {
  if (typeof cast !== 'function') return false;
  const direction = target.clone().sub(origin);
  const distance = direction.length();
  if (distance <= 0.08) return false;
  direction.multiplyScalar(1 / distance);
  return Boolean(cast(origin, direction, Math.max(0, distance - 0.05)));
}

function smootherstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

const INCENDIARY_FLAME_CLUSTER_COUNT = 280;
const FLAME_PARTICLES_PER_CLUSTER = 5;
const INCENDIARY_FLAME_PARTICLE_COUNT =
  INCENDIARY_FLAME_CLUSTER_COUNT * FLAME_PARTICLES_PER_CLUSTER;
const PLANE_NORMAL = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function fieldHash(index, salt = 0) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

const FLAME_FIELD_VERT = /* glsl */ `
attribute float aSize;
attribute float aRise;
attribute float aSpeed;
attribute float aGround;
attribute float aPhase;
attribute float aStrength;
uniform float uTime;
uniform float uPixelScale;
varying float vLife;
varying float vGround;
varying float vPhase;
varying float vStrength;
void main() {
  float cycle = fract(uTime * aSpeed + aPhase);
  float groundLife = 0.075
    + (sin(uTime * 5.3 + aPhase * 17.0) * 0.5 + 0.5) * 0.045;
  float life = mix(cycle, groundLife, aGround);
  vec3 p = position;
  p.y += 0.035 + life * aRise;
  float drift = (0.025 + life * 0.105) * aRise * mix(1.0, 0.18, aGround);
  p.x += sin(uTime * 1.92 + aPhase * 17.3 + life * 5.1) * drift;
  p.z += cos(uTime * 1.47 + aPhase * 13.1 + life * 4.3) * drift * 0.72;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float pulse = mix(
    sin(clamp(life, 0.0, 1.0) * 3.14159265),
    0.48 + sin(uTime * 6.1 + aPhase * 21.0) * 0.10,
    aGround
  );
  gl_PointSize = clamp(
    aSize * (0.84 + pulse * 0.36) * uPixelScale / max(0.15, -mv.z),
    1.0,
    96.0
  );
  vLife = cycle;
  vGround = aGround;
  vPhase = aPhase;
  vStrength = aStrength;
}
`;

const FLAME_FIELD_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uFade;
varying float vLife;
varying float vGround;
varying float vPhase;
varying float vStrength;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float vertical = gl_PointCoord.y;
  float t = uTime * 1.45 + vPhase * 19.7;
  p.x += sin(p.y * 2.8 + t) * (0.045 + vLife * 0.065);
  p.y += cos(p.x * 2.2 - t * 0.73) * 0.035;
  float coarse = valueNoise(vec2(
    p.x * 2.3 + vPhase * 7.1,
    p.y * 2.7 - t * 0.46
  ));
  float fine = valueNoise(vec2(
    p.x * 5.4 - vPhase * 4.9,
    p.y * 6.1 - t * 0.82
  ));
  float taper = mix(0.28, 0.70, vertical);
  float shape = length(vec2(
    p.x * (0.95 + (coarse - 0.5) * 0.12) / taper,
    p.y * (0.60 + (fine - 0.5) * 0.06)
  ));
  float boundary = 0.73 + (coarse - 0.5) * 0.25 + (fine - 0.5) * 0.10;
  float plume = 1.0 - smoothstep(boundary - 0.18, boundary + 0.08, shape);
  float breakup = smoothstep(
    0.34,
    0.76,
    coarse * 0.56 + fine * 0.44 + plume * 0.24
  );
  float lifeFade = smoothstep(0.0, 0.060, vLife)
    * (1.0 - smoothstep(0.74, 1.0, vLife));
  lifeFade = mix(
    lifeFade,
    0.86 + sin(uTime * 5.8 + vPhase * 23.0) * 0.10,
    vGround
  );
  float alpha = plume * breakup * lifeFade * vStrength * uFade;
  if (alpha < 0.015) discard;

  float core = 1.0 - smoothstep(0.05, 0.78, shape);
  float heat = clamp(
    (1.0 - vLife) * 0.62 + core * 0.34 + vertical * 0.28 + vGround * 0.18,
    0.0,
    1.0
  );
  vec3 emberColor = vec3(0.48, 0.012, 0.001);
  vec3 flameColor = vec3(1.00, 0.155, 0.004);
  vec3 hotColor = vec3(1.00, 0.72, 0.18);
  vec3 color = mix(emberColor, flameColor, smoothstep(0.02, 0.58, plume));
  color = mix(color, hotColor, smoothstep(0.42, 0.96, heat) * core);
  color *= 0.78 + fine * 0.25;
  gl_FragColor = vec4(color, alpha);
}
`;

function makeSmokeTexture() {
  const size = 48;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size - 0.5) * 2;
      const ny = ((y + 0.5) / size - 0.5) * 2;
      const angle = Math.atan2(ny, nx);
      const radius = Math.sqrt(nx * nx + ny * ny);
      const edge = 0.68
        + Math.sin(angle * 5 + radius * 8) * 0.07
        + Math.sin(angle * 9 - radius * 5) * 0.045;
      const alpha = 1 - smootherstep(0.08, edge, radius);
      const index = (y * size + x) * 4;
      data[index] = 210;
      data[index + 1] = 196;
      data[index + 2] = 184;
      data[index + 3] = Math.round(clamp(alpha, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'incendiary-smoke-texture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function makeEmberTexture() {
  const size = 40;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size - 0.5) * 2;
      const ny = ((y + 0.5) / size - 0.5) * 2;
      const radius = Math.sqrt(nx * nx + ny * ny);
      const irregular = 0.84
        + Math.sin(nx * 9 + ny * 5) * 0.08
        + Math.sin(nx * 17 - ny * 13) * 0.08;
      const alpha = (1 - smootherstep(0.22, irregular, radius))
        * (0.78 + Math.sin(nx * 23 + ny * 19) * 0.22);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 96;
      data[index + 2] = 8;
      data[index + 3] = Math.round(clamp(alpha, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'incendiary-ember-texture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Persistent fire uses camera-facing, soft-edged flame tongues instead of
 * rigid cones. Ground embers break up the footprint so it reads as burning
 * fuel rather than a flat red disc.
 */
export function buildIncendiaryFieldModel({
  pixelScale = 360,
  radius = INCENDIARY_RADIUS,
} = {}) {
  const fieldRadius = Math.max(0.5, Number(radius) || INCENDIARY_RADIUS);
  const group = new THREE.Group();
  group.name = 'incendiary-field';

  const emberTexture = makeEmberTexture();
  const smokeTexture = makeSmokeTexture();
  const flameMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelScale: { value: Math.max(1, Number(pixelScale) || 360) },
      uFade: { value: 1 },
    },
    vertexShader: FLAME_FIELD_VERT,
    fragmentShader: FLAME_FIELD_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const smokeMaterial = new THREE.SpriteMaterial({
    map: smokeTexture,
    color: 0x292421,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const emberMaterial = new THREE.MeshBasicMaterial({
    map: emberTexture,
    color: 0xff6520,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const scorchMaterial = new THREE.MeshBasicMaterial({
    map: emberTexture,
    color: 0x170604,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  // One draw call carries dense, independently animated flames over the full
  // damage radius. Each point stores its ground anchor separately.
  const positions = new Float32Array(INCENDIARY_FLAME_PARTICLE_COUNT * 3);
  const sizes = new Float32Array(INCENDIARY_FLAME_PARTICLE_COUNT);
  const rises = new Float32Array(INCENDIARY_FLAME_PARTICLE_COUNT);
  const speeds = new Float32Array(INCENDIARY_FLAME_PARTICLE_COUNT);
  const grounds = new Float32Array(INCENDIARY_FLAME_PARTICLE_COUNT);
  const phases = new Float32Array(INCENDIARY_FLAME_PARTICLE_COUNT);
  const strengths = new Float32Array(INCENDIARY_FLAME_PARTICLE_COUNT);
  const flameAnchors = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  let visualRadius = 0;
  for (let i = 0; i < INCENDIARY_FLAME_CLUSTER_COUNT; i++) {
    const u = (i + 0.55) / INCENDIARY_FLAME_CLUSTER_COUNT;
    const radius = Math.sqrt(u) * fieldRadius * 0.985;
    const angle = i * goldenAngle + (fieldHash(i, 1) - 0.5) * 0.32;
    const radial = radius / fieldRadius;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const indices = [];
    const particleStrengths = [];
    let maxSize = 0;
    for (let j = 0; j < FLAME_PARTICLES_PER_CLUSTER; j++) {
      const index = i * FLAME_PARTICLES_PER_CLUSTER + j;
      const sizeSeed = fieldHash(index, 2);
      const riseSeed = fieldHash(index, 3);
      const grounded = j === 0;
      const size = (
        grounded ? 0.30 + sizeSeed * 0.16 : 0.28 + sizeSeed * 0.28
      ) * (1 - radial * 0.08);
      const rise = (
        grounded ? 0.08 : 0.34 + riseSeed * riseSeed * 0.88
      ) * (1 - radial * 0.10);
      const strength = grounded
        ? 0.58 + fieldHash(index, 4) * 0.18
        : 0.42 + fieldHash(index, 4) * 0.25;
      positions[index * 3] = x;
      positions[index * 3 + 1] = 0.04;
      positions[index * 3 + 2] = z;
      sizes[index] = size;
      rises[index] = rise;
      speeds[index] = 0.42 + fieldHash(index, 5) * 0.25;
      grounds[index] = grounded ? 1 : 0;
      phases[index] = grounded
        ? fieldHash(i, 6)
        : ((j - 1) / (FLAME_PARTICLES_PER_CLUSTER - 1)
          + fieldHash(i, 6) * 0.16) % 1;
      strengths[index] = strength;
      indices.push(index);
      particleStrengths.push(strength);
      maxSize = Math.max(maxSize, size);
    }
    flameAnchors.push({
      index: indices[0],
      indices,
      x,
      z,
      size: maxSize,
      strengths: particleStrengths,
    });
    visualRadius = Math.max(visualRadius, radius + maxSize * 0.68);
  }
  const flameGeometry = new THREE.BufferGeometry();
  flameGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  flameGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  flameGeometry.setAttribute('aRise', new THREE.BufferAttribute(rises, 1));
  flameGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  flameGeometry.setAttribute('aGround', new THREE.BufferAttribute(grounds, 1));
  flameGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  flameGeometry.setAttribute('aStrength', new THREE.BufferAttribute(strengths, 1));
  flameGeometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0.75, 0),
    fieldRadius + 2
  );
  const flamePoints = new THREE.Points(flameGeometry, flameMaterial);
  flamePoints.name = 'incendiary-dynamic-flame-field';
  flamePoints.frustumCulled = false;
  group.add(flamePoints);

  const groundPatches = [];
  const groundSurfaces = [];
  for (let i = 0; i < 46; i++) {
    const radius = Math.sqrt((i + 0.35) / 46) * fieldRadius * 0.985;
    const angle = i * goldenAngle + fieldHash(i, 6) * 0.38;
    const size = 1.35 + fieldHash(i, 7) * 1.15;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size * (0.55 + fieldHash(i, 8) * 0.24)),
      emberMaterial
    );
    patch.name = 'incendiary-ground-ember';
    patch.position.set(x, 0.016, z);
    patch.rotation.x = -Math.PI / 2;
    patch.userData.localX = x;
    patch.userData.localZ = z;
    patch.userData.rotationSeed = angle * 0.37;
    patch.userData.phase = i * 0.83;
    patch.userData.baseScale = 0.90 + fieldHash(i, 9) * 0.16;
    group.add(patch);
    groundPatches.push(patch);
    groundSurfaces.push(patch);
  }
  for (let i = 0; i < 22; i++) {
    const radius = Math.sqrt((i + 0.5) / 22) * fieldRadius * 0.97;
    const angle = i * goldenAngle + 0.5;
    const size = 1.8 + fieldHash(i, 10) * 1.4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size * (0.52 + fieldHash(i, 11) * 0.22)),
      scorchMaterial
    );
    patch.name = 'incendiary-scorch';
    patch.position.set(x, 0.011, z);
    patch.rotation.x = -Math.PI / 2;
    patch.userData.localX = x;
    patch.userData.localZ = z;
    patch.userData.rotationSeed = -angle * 0.24;
    group.add(patch);
    groundSurfaces.push(patch);
  }

  const smokeWisps = [];
  for (let i = 0; i < 24; i++) {
    const radius = Math.sqrt((i + 0.6) / 24) * fieldRadius * 0.94;
    const angle = i * goldenAngle + 0.36;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const wisp = new THREE.Sprite(smokeMaterial);
    wisp.name = 'incendiary-smoke-wisp';
    wisp.center.set(0.5, 0.22);
    wisp.position.set(x, 0.22, z);
    wisp.userData.localX = x;
    wisp.userData.localZ = z;
    wisp.userData.basePosition = wisp.position.clone();
    wisp.userData.phase = (i * 0.137) % 1;
    wisp.userData.baseScale = 1.55 + fieldHash(i, 12) * 1.15;
    wisp.scale.setScalar(wisp.userData.baseScale);
    group.add(wisp);
    smokeWisps.push(wisp);
  }

  const light = new THREE.PointLight(0xff5b16, 3.1, fieldRadius * 2.4, 1.85);
  light.position.y = 0.72;
  group.add(light);

  group.userData.flamePoints = flamePoints;
  group.userData.flameAnchors = flameAnchors;
  group.userData.flameMaterial = flameMaterial;
  group.userData.smokeWisps = smokeWisps;
  group.userData.light = light;
  group.userData.groundPatches = groundPatches;
  group.userData.groundSurfaces = groundSurfaces;
  group.userData.smokeMaterial = smokeMaterial;
  group.userData.emberMaterial = emberMaterial;
  group.userData.scorchMaterial = scorchMaterial;
  group.userData.visualRadius = visualRadius;
  group.userData.damageRadius = fieldRadius;
  group.userData.groundCoverage = 1;
  group.userData.ownedMaterials = [
    flameMaterial,
    smokeMaterial,
    emberMaterial,
    scorchMaterial,
  ];
  group.userData.ownedTextures = [emberTexture, smokeTexture];
  return group;
}

/**
 * Project every fire sample onto its own world surface. A missing surface
 * disables that sample instead of leaving a flame suspended at the blast
 * centre's height.
 */
export function conformIncendiaryFieldToGround(group, sampleGround) {
  if (!group || typeof sampleGround !== 'function') return 0;
  const flamePoints = group.userData.flamePoints;
  const positionAttribute = flamePoints?.geometry?.attributes?.position;
  const strengthAttribute = flamePoints?.geometry?.attributes?.aStrength;
  let attachedFlames = 0;
  for (const anchor of group.userData.flameAnchors || []) {
    const hit = sampleGround(anchor.x, anchor.z);
    const y = typeof hit === 'number' ? hit : Number(hit?.y);
    const attached = Number.isFinite(y);
    for (let i = 0; i < anchor.indices.length; i++) {
      const index = anchor.indices[i];
      positionAttribute.array[index * 3 + 1] = attached ? y + 0.04 : -1000;
      strengthAttribute.array[index] = attached ? anchor.strengths[i] : 0;
    }
    if (attached) attachedFlames++;
  }
  if (positionAttribute) positionAttribute.needsUpdate = true;
  if (strengthAttribute) strengthAttribute.needsUpdate = true;

  for (const surface of group.userData.groundSurfaces || []) {
    const hit = sampleGround(surface.userData.localX, surface.userData.localZ);
    const y = typeof hit === 'number' ? hit : Number(hit?.y);
    surface.visible = Number.isFinite(y);
    if (!surface.visible) continue;
    surface.position.y = y + (surface.name === 'incendiary-scorch' ? 0.011 : 0.016);
    const normal = hit?.normal?.isVector3
      ? hit.normal.clone().normalize()
      : WORLD_UP;
    surface.quaternion.setFromUnitVectors(PLANE_NORMAL, normal);
    surface.rotateZ(surface.userData.rotationSeed || 0);
  }

  for (const wisp of group.userData.smokeWisps || []) {
    const hit = sampleGround(wisp.userData.localX, wisp.userData.localZ);
    const y = typeof hit === 'number' ? hit : Number(hit?.y);
    wisp.visible = Number.isFinite(y);
    if (!wisp.visible) continue;
    wisp.userData.basePosition.set(
      wisp.userData.localX,
      y + 0.18,
      wisp.userData.localZ
    );
  }
  const centre = sampleGround(0, 0);
  const centreY = typeof centre === 'number' ? centre : Number(centre?.y);
  if (group.userData.light && Number.isFinite(centreY)) {
    group.userData.light.position.y = centreY + 0.72;
  }
  const total = Math.max(1, group.userData.flameAnchors?.length || 0);
  group.userData.groundCoverage = attachedFlames / total;
  return group.userData.groundCoverage;
}

export function updateIncendiaryFieldModel(group, time, remaining) {
  if (!group) return;
  const fade = clamp(Number(remaining) || 0, 0, 1);
  const flameMaterial = group.userData.flameMaterial;
  if (flameMaterial) {
    flameMaterial.uniforms.uTime.value = Number(time) || 0;
    flameMaterial.uniforms.uFade.value = fade;
  }
  for (const wisp of group.userData.smokeWisps || []) {
    if (!wisp.visible) continue;
    const phase = wisp.userData.phase || 0;
    const lift = ((Number(time) || 0) * 0.12 + phase) % 1;
    const base = wisp.userData.basePosition;
    const spread = 0.10 + lift * 0.46;
    wisp.position.set(
      base.x + Math.sin(time * 0.68 + phase * 9) * spread,
      base.y + 0.10 + lift * 1.85,
      base.z + Math.cos(time * 0.57 + phase * 7) * spread
    );
    const scale = wisp.userData.baseScale * (0.70 + lift * 0.92);
    wisp.scale.set(scale * 1.18, scale, 1);
  }
  for (const patch of group.userData.groundPatches || []) {
    if (!patch.visible) continue;
    const pulse = patch.userData.baseScale
      * (0.95 + Math.sin(time * 4.2 + patch.userData.phase) * 0.05);
    patch.scale.setScalar(pulse);
  }
  if (group.userData.light) {
    group.userData.light.intensity = (2.85
      + Math.sin(time * 7.8) * 0.34
      + Math.sin(time * 12.6) * 0.16) * fade;
  }
  if (group.userData.smokeMaterial) {
    group.userData.smokeMaterial.opacity = 0.12 * Math.sqrt(fade);
  }
  if (group.userData.emberMaterial) {
    group.userData.emberMaterial.opacity = (0.050
      + Math.sin(time * 4.7) * 0.010) * fade;
  }
  if (group.userData.scorchMaterial) group.userData.scorchMaterial.opacity = 0.38 * fade;
}
