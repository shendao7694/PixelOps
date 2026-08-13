import * as THREE from '../../vendor/three.module.js';
import { clamp } from '../core/math.js';
import { INCENDIARY_RADIUS } from './incendiary.js';

// One renderer owns every B-2 fire field in the match. The old implementation
// created a complete high-detail incendiary scene graph for every bomb:
// 12 strikes meant more than a thousand independently rendered meshes/sprites.
// These fixed budgets keep the cost flat and move all repeated pieces into four
// GPU batches (flames, smoke, embers and scorch marks).
export const FIREBOMB_FIELD_MAX_ZONES = 24;
export const FIREBOMB_FIELD_FLAME_CLUSTERS_PER_ZONE = 72;
export const FIREBOMB_FIELD_FLAMES_PER_CLUSTER = 3;
export const FIREBOMB_FIELD_SMOKE_PER_ZONE = 8;
export const FIREBOMB_FIELD_EMBERS_PER_ZONE = 12;
export const FIREBOMB_FIELD_SCORCHES_PER_ZONE = 6;
export const FIREBOMB_FIELD_DRAW_CALLS = 4;

const FLAMES_PER_ZONE =
  FIREBOMB_FIELD_FLAME_CLUSTERS_PER_ZONE * FIREBOMB_FIELD_FLAMES_PER_CLUSTER;
const PLANE_NORMAL = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

function fieldHash(index, salt = 0) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function smootherstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function makeSoftTexture({
  size = 48,
  rgb = [255, 255, 255],
  irregularity = 0.08,
} = {}) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size - 0.5) * 2;
      const ny = ((y + 0.5) / size - 0.5) * 2;
      const angle = Math.atan2(ny, nx);
      const radius = Math.hypot(nx, ny);
      const edge = 0.72
        + Math.sin(angle * 5 + radius * 8) * irregularity
        + Math.sin(angle * 9 - radius * 5) * irregularity * 0.55;
      const alpha = 1 - smootherstep(0.08, edge, radius);
      const offset = (y * size + x) * 4;
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = Math.round(clamp(alpha, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const FLAME_VERTEX = /* glsl */ `
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
    76.0
  );
  vLife = cycle;
  vGround = aGround;
  vPhase = aPhase;
  vStrength = aStrength;
}
`;

const FLAME_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uTime;
varying float vLife;
varying float vGround;
varying float vPhase;
varying float vStrength;
void main() {
  if (vStrength <= 0.001) discard;
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float vertical = gl_PointCoord.y;
  float wave = sin(
    p.y * 7.0 + uTime * 7.2 + vPhase * 31.0
  ) * (0.035 + vLife * 0.055);
  p.x += wave;
  float taper = mix(0.30, 0.72, vertical);
  float shape = length(vec2(p.x / taper, p.y * 0.64));
  float ragged = sin(
    p.x * 12.0 - p.y * 9.0 + uTime * 5.4 + vPhase * 19.0
  ) * 0.055;
  float plume = 1.0 - smoothstep(0.63 + ragged, 0.91 + ragged, shape);
  float lifeFade = smoothstep(0.0, 0.07, vLife)
    * (1.0 - smoothstep(0.73, 1.0, vLife));
  lifeFade = mix(
    lifeFade,
    0.82 + sin(uTime * 6.0 + vPhase * 23.0) * 0.10,
    vGround
  );
  float alpha = plume * lifeFade * vStrength;
  if (alpha < 0.015) discard;
  float core = 1.0 - smoothstep(0.04, 0.70, shape);
  float heat = clamp((1.0 - vLife) * 0.58 + core * 0.58 + vertical * 0.18, 0.0, 1.0);
  vec3 color = mix(
    vec3(0.68, 0.025, 0.002),
    vec3(1.00, 0.24, 0.008),
    smoothstep(0.08, 0.60, plume)
  );
  color = mix(color, vec3(1.00, 0.78, 0.24), smoothstep(0.58, 0.98, heat) * core);
  gl_FragColor = vec4(color, alpha);
}
`;

const SMOKE_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aStrength;
uniform float uTime;
uniform float uPixelScale;
varying float vAlpha;
void main() {
  float life = fract(uTime * 0.105 + aPhase);
  vec3 p = position;
  float drift = 0.12 + life * 0.54;
  p.x += sin(uTime * 0.72 + aPhase * 18.0) * drift;
  p.y += 0.12 + life * 2.15;
  p.z += cos(uTime * 0.61 + aPhase * 15.0) * drift;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(
    aSize * (0.72 + life * 0.92) * uPixelScale / max(0.15, -mv.z),
    1.0,
    92.0
  );
  vAlpha = aStrength
    * smoothstep(0.0, 0.10, life)
    * (1.0 - smoothstep(0.64, 1.0, life));
}
`;

const SMOKE_FRAGMENT = /* glsl */ `
precision mediump float;
uniform sampler2D uMap;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.001) discard;
  vec4 texel = texture2D(uMap, gl_PointCoord);
  float alpha = texel.a * vAlpha * 0.22;
  if (alpha < 0.008) discard;
  gl_FragColor = vec4(vec3(0.105, 0.09, 0.082), alpha);
}
`;

const GROUND_VERTEX = /* glsl */ `
attribute float aStrength;
attribute float aPhase;
uniform float uTime;
varying vec2 vUv;
varying float vStrength;
void main() {
  vec3 p = position;
  float pulse = 0.97 + sin(uTime * 4.6 + aPhase) * 0.03;
  p.xy *= pulse;
  vec4 worldPosition = instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
  vUv = uv;
  vStrength = aStrength;
}
`;

const GROUND_FRAGMENT = /* glsl */ `
precision mediump float;
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vStrength;
void main() {
  if (vStrength <= 0.001) discard;
  vec4 texel = texture2D(uMap, vUv);
  float alpha = texel.a * uOpacity * vStrength;
  if (alpha < 0.006) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

function surfaceAt(sampleGround, localX, localZ) {
  const hit = typeof sampleGround === 'function'
    ? sampleGround(localX, localZ)
    : { y: 0, normal: WORLD_UP };
  const y = typeof hit === 'number' ? hit : Number(hit?.y);
  if (!Number.isFinite(y)) return null;
  const normal = hit?.normal?.isVector3
    ? hit.normal.clone().normalize()
    : WORLD_UP.clone();
  if (normal.y < 0) normal.negate();
  return { y, normal };
}

function composeGroundMatrix(position, localX, localZ, surface, {
  size,
  aspect,
  rotation,
  lift,
}) {
  if (!surface) return HIDDEN_MATRIX.toArray();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    PLANE_NORMAL,
    surface.normal
  );
  const twist = new THREE.Quaternion().setFromAxisAngle(PLANE_NORMAL, rotation);
  quaternion.multiply(twist);
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(
      position.x + localX,
      position.y + surface.y + lift,
      position.z + localZ
    ),
    quaternion,
    new THREE.Vector3(size, size * aspect, 1)
  );
  return matrix.toArray();
}

/**
 * Performs terrain projection without allocating any render objects. It is
 * intentionally safe to run from requestIdleCallback before the first bomb
 * lands; the impact path only copies these packed arrays into the fixed pool.
 */
export function prepareFirebombFieldData(
  position,
  sampleGround,
  { radius = INCENDIARY_RADIUS } = {}
) {
  const centre = position?.isVector3
    ? position
    : new THREE.Vector3(...(position || [0, 0, 0]));
  const fieldRadius = Math.max(0.5, Number(radius) || INCENDIARY_RADIUS);
  const seed = centre.x * 0.037 + centre.z * 0.061;
  const flames = new Float32Array(FLAMES_PER_ZONE * 9);
  let flameOffset = 0;
  let grounded = 0;
  for (let i = 0; i < FIREBOMB_FIELD_FLAME_CLUSTERS_PER_ZONE; i++) {
    const u = (i + 0.55) / FIREBOMB_FIELD_FLAME_CLUSTERS_PER_ZONE;
    const radialDistance = Math.sqrt(u) * fieldRadius * 0.985;
    const angle = i * GOLDEN_ANGLE + (fieldHash(i, 1 + seed) - 0.5) * 0.34;
    const radial = radialDistance / fieldRadius;
    const localX = Math.cos(angle) * radialDistance;
    const localZ = Math.sin(angle) * radialDistance;
    const surface = surfaceAt(sampleGround, localX, localZ);
    if (surface) grounded++;
    for (let j = 0; j < FIREBOMB_FIELD_FLAMES_PER_CLUSTER; j++) {
      const index = i * FIREBOMB_FIELD_FLAMES_PER_CLUSTER + j;
      const groundedParticle = j === 0;
      const sizeSeed = fieldHash(index, 2 + seed);
      const riseSeed = fieldHash(index, 3 + seed);
      const size = (
        groundedParticle ? 0.34 + sizeSeed * 0.18 : 0.36 + sizeSeed * 0.30
      ) * (1 - radial * 0.08);
      const rise = (
        groundedParticle ? 0.08 : 0.38 + riseSeed * riseSeed * 0.92
      ) * (1 - radial * 0.10);
      const strength = surface
        ? groundedParticle
          ? 0.68 + fieldHash(index, 4 + seed) * 0.17
          : 0.54 + fieldHash(index, 4 + seed) * 0.24
        : 0;
      flames[flameOffset++] = centre.x + localX;
      flames[flameOffset++] = surface
        ? centre.y + surface.y + 0.04
        : -1000;
      flames[flameOffset++] = centre.z + localZ;
      flames[flameOffset++] = size;
      flames[flameOffset++] = rise;
      flames[flameOffset++] = 0.42 + fieldHash(index, 5 + seed) * 0.25;
      flames[flameOffset++] = groundedParticle ? 1 : 0;
      flames[flameOffset++] = groundedParticle
        ? fieldHash(i, 6 + seed)
        : ((j - 1) / Math.max(1, FIREBOMB_FIELD_FLAMES_PER_CLUSTER - 1)
          + fieldHash(i, 6 + seed) * 0.16) % 1;
      flames[flameOffset++] = strength;
    }
  }

  const smoke = new Float32Array(FIREBOMB_FIELD_SMOKE_PER_ZONE * 6);
  let smokeOffset = 0;
  for (let i = 0; i < FIREBOMB_FIELD_SMOKE_PER_ZONE; i++) {
    const radialDistance = Math.sqrt((i + 0.6) / FIREBOMB_FIELD_SMOKE_PER_ZONE)
      * fieldRadius * 0.92;
    const angle = i * GOLDEN_ANGLE + 0.36 + seed;
    const localX = Math.cos(angle) * radialDistance;
    const localZ = Math.sin(angle) * radialDistance;
    const surface = surfaceAt(sampleGround, localX, localZ);
    smoke[smokeOffset++] = centre.x + localX;
    smoke[smokeOffset++] = surface ? centre.y + surface.y + 0.18 : -1000;
    smoke[smokeOffset++] = centre.z + localZ;
    smoke[smokeOffset++] = 1.60 + fieldHash(i, 12 + seed) * 1.20;
    smoke[smokeOffset++] = (i * 0.137 + fieldHash(i, 13 + seed) * 0.08) % 1;
    smoke[smokeOffset++] = surface ? 0.72 + fieldHash(i, 14 + seed) * 0.18 : 0;
  }

  const emberMatrices = new Float32Array(FIREBOMB_FIELD_EMBERS_PER_ZONE * 16);
  const emberStrengths = new Float32Array(FIREBOMB_FIELD_EMBERS_PER_ZONE);
  const emberPhases = new Float32Array(FIREBOMB_FIELD_EMBERS_PER_ZONE);
  for (let i = 0; i < FIREBOMB_FIELD_EMBERS_PER_ZONE; i++) {
    const radialDistance = Math.sqrt((i + 0.35) / FIREBOMB_FIELD_EMBERS_PER_ZONE)
      * fieldRadius * 0.98;
    const angle = i * GOLDEN_ANGLE + fieldHash(i, 7 + seed) * 0.38;
    const localX = Math.cos(angle) * radialDistance;
    const localZ = Math.sin(angle) * radialDistance;
    const surface = surfaceAt(sampleGround, localX, localZ);
    const matrix = composeGroundMatrix(centre, localX, localZ, surface, {
      size: 1.55 + fieldHash(i, 8 + seed) * 1.25,
      aspect: 0.55 + fieldHash(i, 9 + seed) * 0.24,
      rotation: angle * 0.37,
      lift: 0.016,
    });
    emberMatrices.set(matrix, i * 16);
    emberStrengths[i] = surface ? 0.72 + fieldHash(i, 10 + seed) * 0.20 : 0;
    emberPhases[i] = i * 0.83 + seed;
  }

  const scorchMatrices = new Float32Array(FIREBOMB_FIELD_SCORCHES_PER_ZONE * 16);
  const scorchStrengths = new Float32Array(FIREBOMB_FIELD_SCORCHES_PER_ZONE);
  const scorchPhases = new Float32Array(FIREBOMB_FIELD_SCORCHES_PER_ZONE);
  for (let i = 0; i < FIREBOMB_FIELD_SCORCHES_PER_ZONE; i++) {
    const radialDistance = Math.sqrt((i + 0.5) / FIREBOMB_FIELD_SCORCHES_PER_ZONE)
      * fieldRadius * 0.96;
    const angle = i * GOLDEN_ANGLE + 0.5 - seed * 0.5;
    const localX = Math.cos(angle) * radialDistance;
    const localZ = Math.sin(angle) * radialDistance;
    const surface = surfaceAt(sampleGround, localX, localZ);
    const matrix = composeGroundMatrix(centre, localX, localZ, surface, {
      size: 2.25 + fieldHash(i, 15 + seed) * 1.55,
      aspect: 0.52 + fieldHash(i, 16 + seed) * 0.22,
      rotation: -angle * 0.24,
      lift: 0.011,
    });
    scorchMatrices.set(matrix, i * 16);
    scorchStrengths[i] = surface ? 0.86 : 0;
    scorchPhases[i] = i * 0.41 + seed;
  }

  const centreSurface = surfaceAt(sampleGround, 0, 0);
  return {
    type: 'firebomb-field-prepared',
    position: new THREE.Vector3(
      centre.x,
      centreSurface ? centre.y + centreSurface.y : centre.y,
      centre.z
    ),
    radius: fieldRadius,
    coverage: grounded / FIREBOMB_FIELD_FLAME_CLUSTERS_PER_ZONE,
    samples: FIREBOMB_FIELD_FLAME_CLUSTERS_PER_ZONE
      + FIREBOMB_FIELD_SMOKE_PER_ZONE
      + FIREBOMB_FIELD_EMBERS_PER_ZONE
      + FIREBOMB_FIELD_SCORCHES_PER_ZONE
      + 1,
    flames,
    smoke,
    emberMatrices,
    emberStrengths,
    emberPhases,
    scorchMatrices,
    scorchStrengths,
    scorchPhases,
  };
}

function createGroundBatch(capacity, texture, {
  color,
  opacity,
  blending = THREE.NormalBlending,
  name,
}) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const strength = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const phase = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute('aStrength', strength);
  geometry.setAttribute('aPhase', phase);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: texture },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, HIDDEN_MATRIX);
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, geometry, material, strength, phase };
}

export class FirebombFieldRenderer {
  constructor(scene, {
    pixelScale = 360,
    radius = INCENDIARY_RADIUS,
    maxZones = FIREBOMB_FIELD_MAX_ZONES,
  } = {}) {
    this.scene = scene;
    this.radius = Math.max(0.5, Number(radius) || INCENDIARY_RADIUS);
    this.maxZones = Math.max(1, Math.floor(Number(maxZones) || FIREBOMB_FIELD_MAX_ZONES));
    this.root = new THREE.Group();
    this.root.name = 'firebomb-field-batch';
    this.root.userData.renderer = this;
    this.scene?.add(this.root);

    this.zones = new Map();
    this.slots = Array(this.maxZones).fill(null);
    this.freeSlots = Array.from({ length: this.maxZones }, (_, index) =>
      this.maxZones - index - 1);
    this.currentTime = 0;
    this.droppedZones = 0;
    this._matrix = new THREE.Matrix4();
    this._lightTarget = new THREE.Vector3();

    const flameCapacity = this.maxZones * FLAMES_PER_ZONE;
    this.flameBaseStrengths = new Float32Array(flameCapacity);
    const flameGeometry = new THREE.BufferGeometry();
    const flamePosition = new THREE.BufferAttribute(new Float32Array(flameCapacity * 3), 3);
    const flameSize = new THREE.BufferAttribute(new Float32Array(flameCapacity), 1);
    const flameRise = new THREE.BufferAttribute(new Float32Array(flameCapacity), 1);
    const flameSpeed = new THREE.BufferAttribute(new Float32Array(flameCapacity), 1);
    const flameGround = new THREE.BufferAttribute(new Float32Array(flameCapacity), 1);
    const flamePhase = new THREE.BufferAttribute(new Float32Array(flameCapacity), 1);
    const flameStrength = new THREE.BufferAttribute(new Float32Array(flameCapacity), 1);
    flameGeometry.setAttribute('position', flamePosition);
    flameGeometry.setAttribute('aSize', flameSize);
    flameGeometry.setAttribute('aRise', flameRise);
    flameGeometry.setAttribute('aSpeed', flameSpeed);
    flameGeometry.setAttribute('aGround', flameGround);
    flameGeometry.setAttribute('aPhase', flamePhase);
    flameGeometry.setAttribute('aStrength', flameStrength);
    flameGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    const flameMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelScale: { value: Math.max(1, Number(pixelScale) || 360) },
      },
      vertexShader: FLAME_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const flamePoints = new THREE.Points(flameGeometry, flameMaterial);
    flamePoints.name = 'firebomb-batched-flames';
    flamePoints.frustumCulled = false;
    this.root.add(flamePoints);
    this.flames = {
      points: flamePoints,
      geometry: flameGeometry,
      material: flameMaterial,
      position: flamePosition,
      size: flameSize,
      rise: flameRise,
      speed: flameSpeed,
      ground: flameGround,
      phase: flamePhase,
      strength: flameStrength,
    };

    const smokeCapacity = this.maxZones * FIREBOMB_FIELD_SMOKE_PER_ZONE;
    this.smokeTexture = makeSoftTexture({
      size: 48,
      rgb: [210, 196, 184],
      irregularity: 0.075,
    });
    this.smokeBaseStrengths = new Float32Array(smokeCapacity);
    const smokeGeometry = new THREE.BufferGeometry();
    const smokePosition = new THREE.BufferAttribute(new Float32Array(smokeCapacity * 3), 3);
    const smokeSize = new THREE.BufferAttribute(new Float32Array(smokeCapacity), 1);
    const smokePhase = new THREE.BufferAttribute(new Float32Array(smokeCapacity), 1);
    const smokeStrength = new THREE.BufferAttribute(new Float32Array(smokeCapacity), 1);
    smokeGeometry.setAttribute('position', smokePosition);
    smokeGeometry.setAttribute('aSize', smokeSize);
    smokeGeometry.setAttribute('aPhase', smokePhase);
    smokeGeometry.setAttribute('aStrength', smokeStrength);
    smokeGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    const smokeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelScale: { value: Math.max(1, Number(pixelScale) || 360) },
        uMap: { value: this.smokeTexture },
      },
      vertexShader: SMOKE_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const smokePoints = new THREE.Points(smokeGeometry, smokeMaterial);
    smokePoints.name = 'firebomb-batched-smoke';
    smokePoints.frustumCulled = false;
    this.root.add(smokePoints);
    this.smoke = {
      points: smokePoints,
      geometry: smokeGeometry,
      material: smokeMaterial,
      position: smokePosition,
      size: smokeSize,
      phase: smokePhase,
      strength: smokeStrength,
    };

    this.groundTexture = makeSoftTexture({
      size: 40,
      rgb: [255, 96, 8],
      irregularity: 0.11,
    });
    this.embers = createGroundBatch(
      this.maxZones * FIREBOMB_FIELD_EMBERS_PER_ZONE,
      this.groundTexture,
      {
        color: 0xff5b18,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        name: 'firebomb-batched-ground-embers',
      }
    );
    this.scorches = createGroundBatch(
      this.maxZones * FIREBOMB_FIELD_SCORCHES_PER_ZONE,
      this.groundTexture,
      {
        color: 0x150402,
        opacity: 0.48,
        name: 'firebomb-batched-scorches',
      }
    );
    this.root.add(this.embers.mesh, this.scorches.mesh);

    // One non-shadow-casting light follows the nearest active fire field.
    // Twelve independent point lights were a major GPU multiplier.
    this.light = new THREE.PointLight(0xff5b16, 0, this.radius * 2.7, 1.85);
    this.light.name = 'firebomb-shared-light';
    this.light.castShadow = false;
    this.root.add(this.light);
  }

  prepareZone(position, sampleGround) {
    return prepareFirebombFieldData(position, sampleGround, { radius: this.radius });
  }

  _markFlamesDirty() {
    for (const attribute of [
      this.flames.position,
      this.flames.size,
      this.flames.rise,
      this.flames.speed,
      this.flames.ground,
      this.flames.phase,
      this.flames.strength,
    ]) attribute.needsUpdate = true;
  }

  _markSmokeDirty() {
    for (const attribute of [
      this.smoke.position,
      this.smoke.size,
      this.smoke.phase,
      this.smoke.strength,
    ]) attribute.needsUpdate = true;
  }

  _writePrepared(slot, prepared) {
    const flameStart = slot * FLAMES_PER_ZONE;
    for (let i = 0; i < FLAMES_PER_ZONE; i++) {
      const src = i * 9;
      const dst = flameStart + i;
      const dst3 = dst * 3;
      this.flames.position.array[dst3] = prepared.flames[src];
      this.flames.position.array[dst3 + 1] = prepared.flames[src + 1];
      this.flames.position.array[dst3 + 2] = prepared.flames[src + 2];
      this.flames.size.array[dst] = prepared.flames[src + 3];
      this.flames.rise.array[dst] = prepared.flames[src + 4];
      this.flames.speed.array[dst] = prepared.flames[src + 5];
      this.flames.ground.array[dst] = prepared.flames[src + 6];
      this.flames.phase.array[dst] = prepared.flames[src + 7];
      this.flameBaseStrengths[dst] = prepared.flames[src + 8];
      this.flames.strength.array[dst] = prepared.flames[src + 8];
    }
    this._markFlamesDirty();

    const smokeStart = slot * FIREBOMB_FIELD_SMOKE_PER_ZONE;
    for (let i = 0; i < FIREBOMB_FIELD_SMOKE_PER_ZONE; i++) {
      const src = i * 6;
      const dst = smokeStart + i;
      const dst3 = dst * 3;
      this.smoke.position.array[dst3] = prepared.smoke[src];
      this.smoke.position.array[dst3 + 1] = prepared.smoke[src + 1];
      this.smoke.position.array[dst3 + 2] = prepared.smoke[src + 2];
      this.smoke.size.array[dst] = prepared.smoke[src + 3];
      this.smoke.phase.array[dst] = prepared.smoke[src + 4];
      this.smokeBaseStrengths[dst] = prepared.smoke[src + 5];
      this.smoke.strength.array[dst] = prepared.smoke[src + 5];
    }
    this._markSmokeDirty();

    const emberStart = slot * FIREBOMB_FIELD_EMBERS_PER_ZONE;
    for (let i = 0; i < FIREBOMB_FIELD_EMBERS_PER_ZONE; i++) {
      const dst = emberStart + i;
      this._matrix.fromArray(prepared.emberMatrices, i * 16);
      this.embers.mesh.setMatrixAt(dst, this._matrix);
      this.embers.strength.array[dst] = prepared.emberStrengths[i];
      this.embers.phase.array[dst] = prepared.emberPhases[i];
    }
    this.embers.mesh.instanceMatrix.needsUpdate = true;
    this.embers.strength.needsUpdate = true;
    this.embers.phase.needsUpdate = true;

    const scorchStart = slot * FIREBOMB_FIELD_SCORCHES_PER_ZONE;
    for (let i = 0; i < FIREBOMB_FIELD_SCORCHES_PER_ZONE; i++) {
      const dst = scorchStart + i;
      this._matrix.fromArray(prepared.scorchMatrices, i * 16);
      this.scorches.mesh.setMatrixAt(dst, this._matrix);
      this.scorches.strength.array[dst] = prepared.scorchStrengths[i];
      this.scorches.phase.array[dst] = prepared.scorchPhases[i];
    }
    this.scorches.mesh.instanceMatrix.needsUpdate = true;
    this.scorches.strength.needsUpdate = true;
    this.scorches.phase.needsUpdate = true;
  }

  addZone({ id, position, expiresAt, prepared = null, sampleGround = null }) {
    const key = String(id);
    const existing = this.zones.get(key);
    if (existing) {
      existing.expiresAt = Math.max(existing.expiresAt, Number(expiresAt) || 0);
      return existing;
    }
    let slot = this.freeSlots.pop();
    if (!Number.isInteger(slot)) {
      // Reclaim an already expired visual before dropping a new one. Damage is
      // never tied to this pool, so exhausting it cannot affect gameplay.
      const expired = [...this.zones.values()].find((zone) =>
        zone.expiresAt <= this.currentTime);
      if (expired) {
        slot = expired.slot;
        this.removeZone(expired.id, false);
        const freeIndex = this.freeSlots.indexOf(slot);
        if (freeIndex >= 0) this.freeSlots.splice(freeIndex, 1);
      }
    }
    if (!Number.isInteger(slot)) {
      this.droppedZones++;
      return null;
    }
    const centre = position?.isVector3
      ? position.clone()
      : new THREE.Vector3(...(position || [0, 0, 0]));
    const data = prepared?.type === 'firebomb-field-prepared'
      ? prepared
      : this.prepareZone(centre, sampleGround);
    const zone = {
      id: key,
      slot,
      position: data.position.clone(),
      expiresAt: Number(expiresAt) || this.currentTime + 1,
      fade: 1,
      prepared: data,
    };
    this.slots[slot] = zone;
    this.zones.set(key, zone);
    this._writePrepared(slot, data);
    return zone;
  }

  _setSlotFade(zone, fade) {
    const value = clamp(Number(fade) || 0, 0, 1);
    if (Math.abs(value - zone.fade) < 0.01 && value !== 0 && value !== 1) return;
    zone.fade = value;
    const flameStart = zone.slot * FLAMES_PER_ZONE;
    for (let i = 0; i < FLAMES_PER_ZONE; i++) {
      const index = flameStart + i;
      this.flames.strength.array[index] = this.flameBaseStrengths[index] * value;
    }
    this.flames.strength.needsUpdate = true;

    const smokeStart = zone.slot * FIREBOMB_FIELD_SMOKE_PER_ZONE;
    for (let i = 0; i < FIREBOMB_FIELD_SMOKE_PER_ZONE; i++) {
      const index = smokeStart + i;
      this.smoke.strength.array[index] = this.smokeBaseStrengths[index] * value;
    }
    this.smoke.strength.needsUpdate = true;

    const emberStart = zone.slot * FIREBOMB_FIELD_EMBERS_PER_ZONE;
    for (let i = 0; i < FIREBOMB_FIELD_EMBERS_PER_ZONE; i++) {
      this.embers.strength.array[emberStart + i] =
        zone.prepared.emberStrengths[i] * value;
    }
    this.embers.strength.needsUpdate = true;

    const scorchStart = zone.slot * FIREBOMB_FIELD_SCORCHES_PER_ZONE;
    for (let i = 0; i < FIREBOMB_FIELD_SCORCHES_PER_ZONE; i++) {
      this.scorches.strength.array[scorchStart + i] =
        zone.prepared.scorchStrengths[i] * value;
    }
    this.scorches.strength.needsUpdate = true;
  }

  removeZone(id, releaseSlot = true) {
    const key = String(id);
    const zone = this.zones.get(key);
    if (!zone) return false;
    this._setSlotFade(zone, 0);
    const flameStart = zone.slot * FLAMES_PER_ZONE;
    this.flameBaseStrengths.fill(0, flameStart, flameStart + FLAMES_PER_ZONE);
    const smokeStart = zone.slot * FIREBOMB_FIELD_SMOKE_PER_ZONE;
    this.smokeBaseStrengths.fill(
      0,
      smokeStart,
      smokeStart + FIREBOMB_FIELD_SMOKE_PER_ZONE
    );
    const emberStart = zone.slot * FIREBOMB_FIELD_EMBERS_PER_ZONE;
    for (let i = 0; i < FIREBOMB_FIELD_EMBERS_PER_ZONE; i++) {
      this.embers.mesh.setMatrixAt(emberStart + i, HIDDEN_MATRIX);
    }
    this.embers.mesh.instanceMatrix.needsUpdate = true;
    const scorchStart = zone.slot * FIREBOMB_FIELD_SCORCHES_PER_ZONE;
    for (let i = 0; i < FIREBOMB_FIELD_SCORCHES_PER_ZONE; i++) {
      this.scorches.mesh.setMatrixAt(scorchStart + i, HIDDEN_MATRIX);
    }
    this.scorches.mesh.instanceMatrix.needsUpdate = true;
    this.slots[zone.slot] = null;
    this.zones.delete(key);
    if (releaseSlot) this.freeSlots.push(zone.slot);
    return true;
  }

  update(time, viewerPosition = null) {
    this.currentTime = Number(time) || 0;
    this.flames.material.uniforms.uTime.value = this.currentTime;
    this.smoke.material.uniforms.uTime.value = this.currentTime;
    this.embers.material.uniforms.uTime.value = this.currentTime;
    this.scorches.material.uniforms.uTime.value = this.currentTime;

    let nearest = null;
    let nearestDistanceSq = Infinity;
    for (const zone of this.zones.values()) {
      this._setSlotFade(zone, Math.min(1, zone.expiresAt - this.currentTime));
      const distanceSq = viewerPosition?.isVector3
        ? viewerPosition.distanceToSquared(zone.position)
        : nearest
          ? Infinity
          : 0;
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearest = zone;
      }
    }
    if (!nearest) {
      this.light.intensity = 0;
      return;
    }
    this._lightTarget.copy(nearest.position);
    this._lightTarget.y += 0.72;
    if (this.light.intensity <= 0.01) this.light.position.copy(this._lightTarget);
    else this.light.position.lerp(this._lightTarget, 0.22);
    this.light.intensity = (
      3.05
      + Math.sin(this.currentTime * 7.8) * 0.34
      + Math.sin(this.currentTime * 12.6) * 0.16
    ) * nearest.fade;
  }

  clear() {
    for (const id of [...this.zones.keys()]) this.removeZone(id);
    this.light.intensity = 0;
  }

  stats() {
    return {
      activeZones: this.zones.size,
      maxZones: this.maxZones,
      drawCalls: FIREBOMB_FIELD_DRAW_CALLS,
      flamePoints: this.maxZones * FLAMES_PER_ZONE,
      activeFlamePoints: this.zones.size * FLAMES_PER_ZONE,
      smokePoints: this.maxZones * FIREBOMB_FIELD_SMOKE_PER_ZONE,
      groundInstances: this.maxZones
        * (FIREBOMB_FIELD_EMBERS_PER_ZONE + FIREBOMB_FIELD_SCORCHES_PER_ZONE),
      droppedZones: this.droppedZones,
    };
  }

  dispose() {
    this.clear();
    this.root.removeFromParent();
    for (const geometry of [
      this.flames.geometry,
      this.smoke.geometry,
      this.embers.geometry,
      this.scorches.geometry,
    ]) geometry.dispose();
    for (const material of [
      this.flames.material,
      this.smoke.material,
      this.embers.material,
      this.scorches.material,
    ]) material.dispose();
    this.smokeTexture.dispose();
    this.groundTexture.dispose();
  }
}
