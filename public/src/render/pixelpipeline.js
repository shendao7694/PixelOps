// Low-resolution render target + palette/dither post pass.
// The whole game is drawn at ~270p and blown up with nearest-neighbour so
// every edge lands on a real pixel; the post pass adds grading, ordered
// dithering, vignette, damage flash and the death desaturation.
import * as THREE from '../../vendor/three.module.js';
import { LASER_CANNON_THERMAL_LAYER } from '../game/laser-cannon.js';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tThermal;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDamage;     // red hit flash 0..1
uniform float uLowHealth;  // pulsing red edges 0..1
uniform float uDeath;      // 0 alive .. 1 dead
uniform float uLevels;     // palette steps per channel
uniform float uScanline;
uniform float uVignette;
uniform float uSaturation;
uniform float uContrast;
uniform float uFlash;      // short white spawn/combat flash
uniform float uMissileCam; // 0 normal .. 1 warhead camera
uniform float uThermalCam; // 0 normal .. 1 ARC-7 thermal optic
varying vec2 vUv;

const mat4 BAYER = mat4(
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0
);

float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  vec4 row = (y == 0) ? BAYER[0] : (y == 1) ? BAYER[1] : (y == 2) ? BAYER[2] : BAYER[3];
  float v = (x == 0) ? row.x : (x == 1) ? row.y : (x == 2) ? row.z : row.w;
  return v / 16.0 - 0.5;
}

vec3 linearToSrgb(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(0.4545454545));
}

void main() {
  vec2 uv = vUv;
  vec3 col = texture2D(tDiffuse, uv).rgb;

  // --- grading (linear space) ---
  col *= 1.12;
  col *= mix(1.0, 0.55, uDeath);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, mix(uSaturation, 0.15, uDeath));
  col = (col - 0.18) * uContrast + 0.18;
  col = max(col, vec3(0.0));

  // --- display transfer ---
  vec3 srgb = linearToSrgb(col);

  // --- damage / death tinting ---
  srgb = mix(srgb, vec3(0.62, 0.06, 0.05), uDamage * 0.55);
  srgb = mix(srgb, vec3(0.30, 0.04, 0.04), uDeath * 0.35);
  srgb += uFlash;

  // --- vignette + low health pulse ---
  vec2 d = uv - 0.5;
  float r = length(d) * 1.42;
  float vig = 1.0 - uVignette * smoothstep(0.45, 1.05, r);
  srgb *= vig;
  float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
  float edge = smoothstep(0.30, 0.95, r);
  srgb = mix(srgb, vec3(0.55, 0.03, 0.03), edge * uLowHealth * (0.35 + 0.35 * pulse));

  // --- scanlines (subtle, keeps the CRT-ish arcade feel) ---
  float sl = 1.0 - uScanline * step(1.0, mod(gl_FragCoord.y, 2.0));
  srgb *= sl;

  // --- warhead camera: a hardened monochrome downlink ---
  // Target identification is a separate 2D HUD layer. Keep every world pixel
  // monochrome so red brick, rust, blood and team materials cannot become
  // false-positive targets.
  float tacticalCam = max(uMissileCam, uThermalCam);
  if (tacticalCam > 0.001) {
    float g = dot(srgb, vec3(0.299, 0.587, 0.114));
    vec3 feed = vec3(g);
    feed = (feed - 0.5) * 1.28 + 0.46;              // crushed broadcast contrast
    feed += vec3(0.02, 0.03, 0.04);                 // faint cold cast
    // heavy interlace + a slow bright bar rolling down the tube
    float heavy = 1.0 - 0.34 * step(1.0, mod(gl_FragCoord.y, 2.0));
    float roll = smoothstep(0.965, 1.0, fract(vUv.y * 1.6 - uTime * 0.35));
    feed *= heavy;
    feed += roll * 0.16;
    // signal noise, worse toward the edges of the picture
    float grain = fract(sin(dot(gl_FragCoord.xy + uTime * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
    feed += (grain - 0.5) * 0.085;
    float edge = smoothstep(0.25, 1.05, length(uv - 0.5) * 1.42);
    feed *= 1.0 - edge * 0.55;
    srgb = mix(srgb, clamp(feed, 0.0, 1.0), tacticalCam);
  }

  // ARC-7 target-only pass. Enemy meshes are rendered without depth testing
  // into tThermal, so this contour remains visible through every wall while
  // ordinary red world materials never become false positives.
  if (uThermalCam > 0.001) {
    vec2 px = 1.0 / uResolution;
    float c = texture2D(tThermal, uv).r;
    float n = texture2D(tThermal, uv + vec2(0.0, px.y)).r;
    float s = texture2D(tThermal, uv - vec2(0.0, px.y)).r;
    float e = texture2D(tThermal, uv + vec2(px.x, 0.0)).r;
    float w = texture2D(tThermal, uv - vec2(px.x, 0.0)).r;
    float ne = texture2D(tThermal, uv + px).r;
    float nw = texture2D(tThermal, uv + vec2(-px.x, px.y)).r;
    float se = texture2D(tThermal, uv + vec2(px.x, -px.y)).r;
    float sw = texture2D(tThermal, uv - px).r;
    float dilated = max(c, max(max(max(n, s), max(e, w)), max(max(ne, nw), max(se, sw))));
    float eroded = min(c, min(min(min(n, s), min(e, w)), min(min(ne, nw), min(se, sw))));
    float outline = smoothstep(0.08, 0.55, dilated - eroded);
    float targetMark = max(outline, c * 0.12) * uThermalCam;
    srgb = mix(srgb, vec3(1.0, 0.025, 0.012), clamp(targetMark, 0.0, 1.0));
  }

  // --- ordered dither + palette quantise: the pixel-art signature ---
  float dither = bayer(gl_FragCoord.xy) / uLevels;
  srgb = floor((srgb + dither) * uLevels + 0.5) / uLevels;

  gl_FragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
}
`;

export class PixelPipeline {
  constructor(canvas, settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;

    this.width = 480;
    this.height = 270;

    this.rt = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
    });
    this.thermalRt = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
    });
    this.thermalMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.uniforms = {
      tDiffuse: { value: this.rt.texture },
      tThermal: { value: this.thermalRt.texture },
      uResolution: { value: new THREE.Vector2(this.width, this.height) },
      uTime: { value: 0 },
      uDamage: { value: 0 },
      uLowHealth: { value: 0 },
      uDeath: { value: 0 },
      uLevels: { value: 22 },
      uScanline: { value: 0.05 },
      uVignette: { value: 0.42 },
      uSaturation: { value: 1.14 },
      uContrast: { value: 1.06 },
      uFlash: { value: 0 },
      uMissileCam: { value: 0 },
      uThermalCam: { value: 0 },
    };

    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    quad.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.postScene = new THREE.Scene();
    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(quad, this.postMaterial));
    this.postCamera = new THREE.Camera();
  }

  /** Recompute the internal resolution from the viewport aspect. */
  resize(viewW, viewH) {
    const targetH = this.settings.pixelHeight;
    const aspect = viewW / Math.max(1, viewH);
    const h = Math.max(120, Math.round(targetH));
    const w = Math.max(160, Math.round(h * aspect / 2) * 2);
    if (w === this.width && h === this.height) return false;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.rt.setSize(w, h);
    this.thermalRt.setSize(w, h);
    this.uniforms.uResolution.value.set(w, h);
    return true;
  }

  applySettings() {
    this.uniforms.uLevels.value = this.settings.paletteLevels;
    this.uniforms.uScanline.value = this.settings.scanlines ? 0.07 : 0.0;
  }

  render(scene, camera, viewScene, viewCamera, state, dt) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uDamage.value = state.damageFlash;
    u.uLowHealth.value = state.lowHealth;
    u.uDeath.value = state.death;
    u.uFlash.value = state.flash;
    u.uMissileCam.value = state.missileCam || 0;
    u.uThermalCam.value = state.thermalCam || 0;

    const r = this.renderer;
    if (u.uThermalCam.value > 0.001) {
      const oldLayerMask = camera.layers.mask;
      const oldBackground = scene.background;
      const oldFog = scene.fog;
      const oldOverride = scene.overrideMaterial;
      const oldClear = r.getClearColor(new THREE.Color());
      const oldClearAlpha = r.getClearAlpha();
      camera.layers.set(LASER_CANNON_THERMAL_LAYER);
      scene.background = null;
      scene.fog = null;
      scene.overrideMaterial = this.thermalMaterial;
      r.setClearColor(0x000000, 1);
      r.setRenderTarget(this.thermalRt);
      r.clear(true, true, false);
      r.render(scene, camera);
      camera.layers.mask = oldLayerMask;
      scene.background = oldBackground;
      scene.fog = oldFog;
      scene.overrideMaterial = oldOverride;
      r.setClearColor(oldClear, oldClearAlpha);
    }
    r.setRenderTarget(this.rt);
    r.clear(true, true, false);
    r.render(scene, camera);
    if (viewScene && viewCamera) {
      r.clearDepth();
      r.render(viewScene, viewCamera);
    }
    r.setRenderTarget(null);
    r.clear(true, true, false);
    r.render(this.postScene, this.postCamera);
  }
}
