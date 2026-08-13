// Browser-side A-10 and first-person tablet presentation. Gameplay constants,
// validation and damage stay in close-air-support.js so none of this visual
// code is trusted by the PVP server.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { damp } from '../core/math.js';
import { localizeText } from '../core/i18n.js';

// Model credit: "A-10 Thunderbolt II - Free" by bohmerang, downloaded from
// Sketchfab and licensed CC BY-NC-SA 4.0. Full attribution lives beside the
// project asset in A10-MODEL-LICENSE.md.
const A10_URL = new URL('../../assets/glb/a-10_thunderbolt_ii_-_free.glb', import.meta.url).href;
const A10_LENGTH_METRES = 17.0;
let a10TemplatePromise = null;

function fallbackA10() {
  const group = new THREE.Group();
  group.name = 'a10-fallback';
  const hull = new THREE.MeshLambertMaterial({ color: 0x68715f, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b3029, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({
    color: 0x3c6670, emissive: 0x10252b, flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.74, 12.5, 8), hull);
  body.rotation.z = -Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.56, 2.4, 8), hull);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 7.35;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.16, 17.2), hull);
  wing.position.x = -0.35;
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.13, 7.2), hull);
  tailWing.position.x = -5.45;
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.72, 1.05), glass);
  canopy.position.set(2.3, 0.67, 0);
  for (const z of [-1.35, 1.35]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 3.4, 10), dark);
    engine.rotation.z = -Math.PI / 2;
    engine.position.set(-2.15, 0.62, z);
    group.add(engine);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.25, 0.16), hull);
    tail.position.set(-5.25, 1.05, z);
    group.add(tail);
  }
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 2.5, 8), dark);
  gun.rotation.z = -Math.PI / 2;
  gun.position.set(7.2, -0.34, 0);
  group.add(body, nose, wing, tailWing, canopy, gun);
  return group;
}

async function loadA10Template() {
  const gltf = await new GLTFLoader().loadAsync(A10_URL);
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(model);
  const size = initialBox.getSize(new THREE.Vector3());
  const scale = A10_LENGTH_METRES / Math.max(0.001, size.x);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.updateMatrixWorld(true);
  model.name = 'a10-thunderbolt-ii';
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  return model;
}

export function preloadA10Model() {
  if (!a10TemplatePromise) {
    a10TemplatePromise = loadA10Template().catch((error) => {
      console.warn('A-10 model could not be loaded; using the built-in silhouette.', error);
      return null;
    });
  }
  return a10TemplatePromise;
}

/** Immediately returns a visible fallback and swaps in the GLB when ready. */
export function createA10Visual() {
  const root = new THREE.Group();
  root.name = 'close-air-support-a10';
  const fallback = fallbackA10();
  root.add(fallback);

  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff0bd,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 5), flashMaterial);
  muzzleFlash.position.set(8.55, -0.34, 0);
  muzzleFlash.visible = false;
  root.add(muzzleFlash);
  root.userData.muzzleFlash = muzzleFlash;
  root.userData.active = true;

  preloadA10Model().then((template) => {
    if (!template || !root.userData.active) return;
    const model = template.clone(true);
    root.add(model);
    fallback.visible = false;
  });
  return root;
}

export function releaseA10Visual(root) {
  if (!root) return;
  root.userData.active = false;
  root.removeFromParent();
}

const box = (w, h, d, material, x, y, z, parent) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
};

const TABLET_SCREEN_WIDTH = 512;
const TABLET_SCREEN_HEIGHT = 280;
const TABLET_ZONES = [
  { x: 0, z: 0, w: 30, d: 22 },
  { x: -12, z: -26, w: 10, d: 10 }, { x: 12, z: -26, w: 10, d: 10 },
  { x: -9, z: 26, w: 6, d: 6 }, { x: 9, z: 26, w: 6, d: 6 },
  { x: -52, z: 0, w: 26, d: 34 }, { x: 52, z: 0, w: 26, d: 30 },
  { x: -52, z: -44, w: 20, d: 16 }, { x: 52, z: 44, w: 20, d: 16 },
  { x: 46, z: -50, w: 5, d: 5 }, { x: 56, z: -42, w: 5, d: 5 },
  { x: 62, z: -54, w: 5, d: 5 }, { x: -46, z: 50, w: 5, d: 5 },
  { x: -56, z: 42, w: 5, d: 5 }, { x: -62, z: 54, w: 5, d: 5 },
  { x: 28, z: 18, w: 6, d: 6 }, { x: -28, z: -18, w: 6, d: 6 },
];

/**
 * Block-built first-person tactical tablet. The map and cursor are painted
 * into the physical screen texture, alongside the frame, controls and hands.
 */
export class CasTabletView {
  constructor(scene, settings = null) {
    this.settings = settings;
    this.root = new THREE.Group();
    this.root.name = 'close-air-support-tablet';
    this.root.visible = false;
    scene.add(this.root);
    this.blend = 0;

    const frame = new THREE.MeshLambertMaterial({ color: 0x151b1d, flatShading: true });
    const edge = new THREE.MeshLambertMaterial({ color: 0x394348, flatShading: true });
    this.screenCanvas = null;
    this.screenCtx = null;
    this.screenTexture = null;
    if (globalThis.document?.createElement) {
      this.screenCanvas = document.createElement('canvas');
      this.screenCanvas.width = TABLET_SCREEN_WIDTH;
      this.screenCanvas.height = TABLET_SCREEN_HEIGHT;
      this.screenCtx = this.screenCanvas.getContext('2d', { alpha: false });
      this.screenCtx.imageSmoothingEnabled = false;
      this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
      this.screenTexture.colorSpace = THREE.SRGBColorSpace;
      this.screenTexture.minFilter = THREE.NearestFilter;
      this.screenTexture.magFilter = THREE.NearestFilter;
      this.screenTexture.generateMipmaps = false;
    }
    const screen = new THREE.MeshBasicMaterial({
      color: this.screenTexture ? 0xffffff : 0x173e31,
      map: this.screenTexture,
    });
    const glow = new THREE.MeshBasicMaterial({ color: 0x78ffc1 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xb98764, flatShading: true });
    const sleeve = new THREE.MeshLambertMaterial({ color: 0x235f91, flatShading: true });

    box(0.92, 0.58, 0.055, frame, 0, 0, 0, this.root);
    box(0.96, 0.045, 0.075, edge, 0, 0.30, 0, this.root);
    box(0.96, 0.045, 0.075, edge, 0, -0.30, 0, this.root);
    box(0.045, 0.58, 0.075, edge, -0.48, 0, 0, this.root);
    box(0.045, 0.58, 0.075, edge, 0.48, 0, 0, this.root);
    this.screenMesh = box(0.79, 0.43, 0.008, screen, 0, 0.01, 0.034, this.root);
    this.screenMesh.name = 'tablet-live-screen';
    this.screenDecor = new THREE.Group();
    this.screenDecor.name = 'tablet-fallback-grid';
    this.root.add(this.screenDecor);
    for (let i = -3; i <= 3; i++) {
      box(0.002, 0.41, 0.005, glow, i * 0.105, 0.01, 0.040, this.screenDecor);
    }
    for (let i = -2; i <= 2; i++) {
      box(0.77, 0.002, 0.005, glow, 0, i * 0.068, 0.040, this.screenDecor);
    }
    this.screenDecor.visible = !this.screenTexture;
    const status = box(0.11, 0.018, 0.008, glow, 0.32, -0.255, 0.044, this.root);
    status.material = status.material.clone();
    status.material.color.setHex(0xffb84e);
    this.confirmButton = box(
      0.13,
      0.032,
      0.018,
      new THREE.MeshLambertMaterial({ color: 0x9f6a22, flatShading: true }),
      0.17,
      -0.255,
      0.054,
      this.root
    );

    for (const side of [-1, 1]) {
      const forearm = box(0.22, 0.24, 0.18, sleeve, side * 0.48, -0.39, 0.10, this.root);
      forearm.rotation.z = side * -0.34;
      const hand = box(0.18, 0.22, 0.14, skin, side * 0.48, -0.22, 0.08, this.root);
      hand.rotation.z = side * -0.12;
      for (let i = 0; i < 4; i++) {
        const finger = box(0.032, 0.17, 0.05, skin, side * (0.40 + i * 0.025), -0.14, 0.105, this.root);
        finger.rotation.z = side * -0.08;
      }
    }
    // Right thumb rests over the physical confirm key. Missile activation
    // drives it into the bezel once before the camera downlink fades in.
    this.tapThumb = box(0.052, 0.145, 0.060, skin, 0.22, -0.19, 0.112, this.root);
    this.tapThumb.rotation.z = -0.24;

    this.root.scale.setScalar(0.82);
    this.drawScreen({ mode: 'idle' });
  }

  screenText(text, x, y, {
    size = 12,
    color = '#9fffd0',
    align = 'left',
    weight = 'bold',
  } = {}) {
    const ctx = this.screenCtx;
    if (!ctx) return;
    const display = localizeText(text, this.settings?.language);
    const family = /[\u3400-\u9fff]/.test(display)
      ? '"Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif'
      : 'Consolas, monospace';
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(display, x, y);
  }

  screenFrame(x, y, w, h, color = '#70d9a5') {
    const ctx = this.screenCtx;
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  screenBase(title, subtitle) {
    const ctx = this.screenCtx;
    if (!ctx) return;
    ctx.fillStyle = '#04110c';
    ctx.fillRect(0, 0, TABLET_SCREEN_WIDTH, TABLET_SCREEN_HEIGHT);
    ctx.fillStyle = '#0a281a';
    ctx.fillRect(0, 0, TABLET_SCREEN_WIDTH, 36);
    ctx.fillStyle = '#70d9a5';
    ctx.fillRect(0, 35, TABLET_SCREEN_WIDTH, 2);
    this.screenText(title, TABLET_SCREEN_WIDTH / 2, 5, {
      size: 15, align: 'center', color: '#b7ffdb',
    });
    this.screenText(subtitle, TABLET_SCREEN_WIDTH / 2, 21, {
      size: 10, align: 'center', color: '#70a98b',
    });
  }

  drawCasScreen(targeting = {}) {
    const ctx = this.screenCtx;
    if (!ctx) return;
    this.screenBase('FIRE MISSION UPLINK', 'A-10 PRECISION AIRSTRIKE');

    // A square, uniform-scale tactical map. World X/Z share one scale, so the
    // BLACKSITE footprint and the danger corridor cannot stretch horizontally.
    const mapX = 10;
    const mapY = 44;
    const mapSize = 226;
    const bounds = targeting.bounds || { x: 80, z: 66 };
    const bx = Math.max(1, Number(bounds.x) || 80);
    const bz = Math.max(1, Number(bounds.z) || 66);
    const extent = Math.max(bx, bz);
    const scale = mapSize / (extent * 2);
    const sx = (wx) => mapX + mapSize / 2 + (Number(wx) || 0) * scale;
    const sz = (wz) => mapY + mapSize / 2 + (Number(wz) || 0) * scale;

    ctx.fillStyle = '#061b10';
    ctx.fillRect(mapX, mapY, mapSize, mapSize);
    ctx.strokeStyle = 'rgba(91,180,113,0.24)';
    ctx.lineWidth = 1;
    for (let value = -Math.floor(extent / 20) * 20; value <= extent; value += 20) {
      const gx = Math.round(sx(value)) + 0.5;
      const gy = Math.round(sz(value)) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, mapY); ctx.lineTo(gx, mapY + mapSize); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mapX, gy); ctx.lineTo(mapX + mapSize, gy); ctx.stroke();
    }
    ctx.strokeStyle = '#4a9a63';
    ctx.strokeRect(sx(-bx), sz(-bz), bx * 2 * scale, bz * 2 * scale);
    for (const zone of TABLET_ZONES) {
      ctx.fillStyle = 'rgba(86,151,102,0.42)';
      ctx.fillRect(
        sx(zone.x - zone.w / 2),
        sz(zone.z - zone.d / 2),
        Math.max(2, zone.w * scale),
        Math.max(2, zone.d * scale)
      );
    }

    const project = (point) => ({ x: sx(point?.x), y: sz(point?.z) });
    const start = targeting.start ? project(targeting.start) : null;
    const endValue = targeting.end || (targeting.phase === 'end' ? targeting.cursor : null);
    const end = endValue ? project(endValue) : null;
    if (start && end) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const halfWidth = Math.max(3, (Number(targeting.width) || 26) * scale * 0.5);
      ctx.fillStyle = 'rgba(255,68,48,0.38)';
      ctx.beginPath();
      ctx.moveTo(start.x + nx * halfWidth, start.y + ny * halfWidth);
      ctx.lineTo(end.x + nx * halfWidth, end.y + ny * halfWidth);
      ctx.lineTo(end.x - nx * halfWidth, end.y - ny * halfWidth);
      ctx.lineTo(start.x - nx * halfWidth, start.y - ny * halfWidth);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffad64';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffcc55';
      ctx.fillRect(start.x - 3, start.y - 3, 6, 6);
      ctx.fillStyle = '#ff5b4c';
      ctx.fillRect(end.x - 3, end.y - 3, 6, 6);
    }

    const own = project({ x: targeting.px, z: targeting.pz });
    ctx.fillStyle = '#55b9ff';
    ctx.fillRect(own.x - 3, own.y - 3, 6, 6);
    for (const enemy of targeting.enemies || []) {
      const mark = project(enemy);
      ctx.fillStyle = '#ff4e42';
      ctx.fillRect(mark.x - 2, mark.y - 2, 5, 5);
    }
    const cursor = project(targeting.cursor || { x: 0, z: 0 });
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursor.x - 8, cursor.y); ctx.lineTo(cursor.x + 8, cursor.y);
    ctx.moveTo(cursor.x, cursor.y - 8); ctx.lineTo(cursor.x, cursor.y + 8);
    ctx.stroke();
    this.screenFrame(mapX, mapY, mapSize, mapSize, '#70d9a5');

    const infoX = 252;
    this.screenText('ATTACK PROFILE', infoX, 48, { size: 14, color: '#ffcc55' });
    ctx.fillStyle = '#123522';
    ctx.fillRect(infoX, 68, 248, 2);
    const rawLength = Number(targeting.length);
    const runLength = Number.isFinite(rawLength) ? Math.max(0, rawLength) : 0;
    const lengthLabel = runLength < 10 ? runLength.toFixed(1) : String(Math.round(runLength));
    const maxLength = Math.round(Number(targeting.maxLength) || 104);
    this.screenText(`RUN LENGTH     ${lengthLabel} M`, infoX, 80, { size: 13 });
    this.screenText(`MAX RANGE      ${maxLength} M`, infoX, 101, { size: 13, color: '#ffcc55' });
    this.screenText(`DANGER WIDTH   ${Math.round(Number(targeting.width) || 26)} M`, infoX, 122, {
      size: 13,
    });
    this.screenText('AIRCRAFT       2 x A-10', infoX, 143, { size: 13 });
    this.screenText('PASS SPACING   2.0 SEC', infoX, 164, { size: 13 });
    this.screenText(`HOSTILES       ${(targeting.enemies || []).length}`, infoX, 185, {
      size: 13, color: '#ff796c',
    });
    this.screenText('CURSOR', infoX, 205, { size: 10, color: '#70a98b' });
    this.screenText(
      `${Math.round(Number(targeting.cursor?.x) || 0)}, ${Math.round(Number(targeting.cursor?.z) || 0)}`,
      infoX,
      217,
      { size: 15, color: '#ffffff' }
    );
    const ready = targeting.phase === 'end';
    ctx.fillStyle = ready ? '#7a3b22' : '#16442d';
    ctx.fillRect(infoX, 239, 248, 31);
    this.screenText(ready ? 'LMB  CONFIRM ATTACK RUN' : 'LMB  SET ATTACK ENTRY', 376, 247, {
      size: 12,
      align: 'center',
      color: ready ? '#ffd17a' : '#b7ffdb',
    });
  }

  drawFirebombScreen(targeting = {}) {
    const ctx = this.screenCtx;
    if (!ctx) return;
    this.screenBase('FIRE MISSION UPLINK', 'B-2 INCENDIARY AIRSTRIKE');

    const mapX = 10;
    const mapY = 44;
    const mapSize = 226;
    const bounds = targeting.bounds || { x: 80, z: 66 };
    const bx = Math.max(1, Number(bounds.x) || 80);
    const bz = Math.max(1, Number(bounds.z) || 66);
    const extent = Math.max(bx, bz);
    const scale = mapSize / (extent * 2);
    const sx = (wx) => mapX + mapSize / 2 + (Number(wx) || 0) * scale;
    const sz = (wz) => mapY + mapSize / 2 + (Number(wz) || 0) * scale;

    ctx.fillStyle = '#061b10';
    ctx.fillRect(mapX, mapY, mapSize, mapSize);
    ctx.strokeStyle = 'rgba(91,180,113,0.24)';
    ctx.lineWidth = 1;
    for (let value = -Math.floor(extent / 20) * 20; value <= extent; value += 20) {
      const gx = Math.round(sx(value)) + 0.5;
      const gy = Math.round(sz(value)) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, mapY); ctx.lineTo(gx, mapY + mapSize); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mapX, gy); ctx.lineTo(mapX + mapSize, gy); ctx.stroke();
    }
    ctx.strokeStyle = '#4a9a63';
    ctx.strokeRect(sx(-bx), sz(-bz), bx * 2 * scale, bz * 2 * scale);
    for (const zone of TABLET_ZONES) {
      ctx.fillStyle = 'rgba(86,151,102,0.42)';
      ctx.fillRect(
        sx(zone.x - zone.w / 2),
        sz(zone.z - zone.d / 2),
        Math.max(2, zone.w * scale),
        Math.max(2, zone.d * scale)
      );
    }

    const start = targeting.start || { x: -bx, z: targeting.cursor?.z || 0 };
    const end = targeting.end || { x: bx, z: targeting.cursor?.z || 0 };
    const startX = sx(start.x);
    const endX = sx(end.x);
    const lineY = sz(start.z);
    const halfWidth = Math.max(
      4,
      (Number(targeting.blastRadius) || 25.2) * scale
    );
    ctx.fillStyle = 'rgba(255,74,34,0.34)';
    ctx.fillRect(startX, lineY - halfWidth, endX - startX, halfWidth * 2);
    ctx.strokeStyle = '#ffad64';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, lineY);
    ctx.lineTo(endX, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    const bombCount = Math.max(1, Number(targeting.bombCount) || 12);
    for (let index = 0; index < bombCount; index++) {
      const progress = (index + 0.5) / bombCount;
      const x = startX + (endX - startX) * progress;
      ctx.fillStyle = index % 2 ? '#ff7f45' : '#ffcc55';
      ctx.fillRect(Math.round(x) - 2, Math.round(lineY) - 2, 5, 5);
    }
    ctx.fillStyle = '#ffcc55';
    ctx.fillRect(startX - 3, lineY - 3, 6, 6);
    ctx.fillStyle = '#ff5b4c';
    ctx.fillRect(endX - 3, lineY - 3, 6, 6);

    const ownX = sx(targeting.px);
    const ownY = sz(targeting.pz);
    ctx.fillStyle = '#55b9ff';
    ctx.fillRect(ownX - 3, ownY - 3, 6, 6);
    for (const enemy of targeting.enemies || []) {
      ctx.fillStyle = '#ff4e42';
      ctx.fillRect(sx(enemy.x) - 2, sz(enemy.z) - 2, 5, 5);
    }
    const cursorY = sz(targeting.cursor?.z || 0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mapX, cursorY); ctx.lineTo(mapX + mapSize, cursorY);
    ctx.moveTo(mapX + mapSize / 2 - 8, cursorY - 8);
    ctx.lineTo(mapX + mapSize / 2 + 8, cursorY + 8);
    ctx.moveTo(mapX + mapSize / 2 + 8, cursorY - 8);
    ctx.lineTo(mapX + mapSize / 2 - 8, cursorY + 8);
    ctx.stroke();
    this.screenFrame(mapX, mapY, mapSize, mapSize, '#70d9a5');

    const infoX = 252;
    this.screenText('BOMBING PROFILE', infoX, 48, { size: 14, color: '#ffcc55' });
    ctx.fillStyle = '#123522';
    ctx.fillRect(infoX, 68, 248, 2);
    this.screenText('AIRCRAFT       1 x B-2', infoX, 80, { size: 13 });
    this.screenText(`BOMBS          ${bombCount} x INC`, infoX, 101, {
      size: 13,
      color: '#ffcc55',
    });
    this.screenText(
      `BLAST RADIUS   ${Math.round(Number(targeting.blastRadius) || 25.2)} M`,
      infoX,
      122,
      { size: 13 }
    );
    this.screenText('FIRE DURATION  13.5 SEC', infoX, 143, { size: 13 });
    this.screenText('RUN AXIS       LEFT > RIGHT', infoX, 164, { size: 13 });
    this.screenText(`HOSTILES       ${(targeting.enemies || []).length}`, infoX, 185, {
      size: 13,
      color: '#ff796c',
    });
    this.screenText('LINE POSITION', infoX, 205, { size: 10, color: '#70a98b' });
    this.screenText(
      `Z ${Math.round(Number(targeting.cursor?.z) || 0)} M`,
      infoX,
      217,
      { size: 15, color: '#ffffff' }
    );
    ctx.fillStyle = '#7a3b22';
    ctx.fillRect(infoX, 239, 248, 31);
    this.screenText('LMB  CONFIRM BOMBING LINE', 376, 247, {
      size: 12,
      align: 'center',
      color: '#ffd17a',
    });
  }

  drawMissileScreen(device = {}) {
    const ctx = this.screenCtx;
    if (!ctx) return;
    this.screenBase('TACTICAL MISSILE CONTROL', 'WARHEAD UPLINK  //  CHANNEL 06');
    const progress = Math.max(0, Math.min(1, Number(device.progress) || 0));
    ctx.strokeStyle = 'rgba(112,217,165,0.22)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= TABLET_SCREEN_WIDTH; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 38); ctx.lineTo(x, TABLET_SCREEN_HEIGHT); ctx.stroke();
    }
    for (let y = 38; y <= TABLET_SCREEN_HEIGHT; y += 28) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TABLET_SCREEN_WIDTH, y); ctx.stroke();
    }
    const cy = 130;
    ctx.fillStyle = '#b5d9c3';
    ctx.fillRect(154, cy - 8, 156, 16);
    ctx.fillStyle = '#f1fff7';
    ctx.fillRect(304, cy - 15, 34, 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(336, cy - 8, 24, 16);
    ctx.fillStyle = '#70a98b';
    ctx.fillRect(164, cy - 26, 28, 18);
    ctx.fillRect(164, cy + 8, 28, 18);
    ctx.fillStyle = '#ffb84e';
    ctx.fillRect(140, cy - 5, 14, 10);
    this.screenText('MISSILE', TABLET_SCREEN_WIDTH / 2, 165, {
      size: 30,
      align: 'center',
      color: device.committed ? '#ffcc55' : '#9fffd0',
    });
    this.screenFrame(54, 222, 404, 14, 'rgba(112,217,165,0.72)');
    ctx.fillStyle = device.committed ? '#ffb84e' : '#70d9a5';
    ctx.fillRect(58, 226, Math.round(396 * progress), 6);
    this.screenText(
      device.committed ? 'LAUNCH CONFIRMED  //  CAMERA HANDOFF' : 'ARMING WARHEAD LINK',
      TABLET_SCREEN_WIDTH / 2,
      248,
      { size: 13, align: 'center', color: device.committed ? '#ffcc55' : '#9fffd0' }
    );
  }

  drawScreen(state = {}) {
    if (!this.screenCtx || !this.screenTexture) return;
    if (state.mode === 'cas') this.drawCasScreen(state.targeting);
    else if (state.mode === 'firebomb') this.drawFirebombScreen(state.targeting);
    else if (state.mode === 'missile') this.drawMissileScreen(state.device);
    else {
      this.screenBase('FIRE MISSION UPLINK', 'STANDBY  //  DATA LINK READY');
      this.screenText('AWAITING TASKING', TABLET_SCREEN_WIDTH / 2, 126, {
        size: 23, align: 'center', color: '#70a98b',
      });
    }
    this.screenTexture.needsUpdate = true;
  }

  update(dt, active, phase = 'start', press = 0, screenState = null) {
    this.blend = damp(this.blend, active ? 1 : 0, active ? 12 : 16, dt);
    this.root.visible = this.blend > 0.01;
    if (!this.root.visible) return;
    if (screenState) this.drawScreen(screenState);
    const eased = 1 - Math.pow(1 - this.blend, 3);
    const click = Math.sin(Math.PI * Math.max(0, Math.min(1, Number(press) || 0)));
    // Keep the settled pose from the original A-10 tablet: close to the
    // operator, slightly below the sight line and clear of the screen centre.
    // Only the tiny confirm-button impulse is layered on top of that pose.
    this.root.position.set(
      0.02 + click * 0.004,
      -0.51 + eased * 0.27
        + Math.sin(performance.now() * 0.0024) * 0.003 * eased
        - click * 0.006,
      -0.92 + eased * 0.15 + click * 0.008
    );
    this.root.rotation.set(-0.12 + (1 - eased) * 0.32, 0,
      (phase === 'end' ? -0.012 : 0.012) * eased - click * 0.005);
    this.tapThumb.position.set(
      0.22 - click * 0.018,
      -0.19 - click * 0.045,
      0.112 - click * 0.055
    );
    this.confirmButton.position.z = 0.054 - click * 0.010;
  }
}

/**
 * Compact first-person UAV radio. It intentionally has its own silhouette
 * instead of recycling the tablet: the left thumb presses push-to-talk once,
 * the team UAV goes live, then the radio drops back out of view.
 */
export class UavRadioView {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'uav-handheld-radio';
    this.root.visible = false;
    scene.add(this.root);
    this.blend = 0;

    const shell = new THREE.MeshLambertMaterial({ color: 0x20272a, flatShading: true });
    const edge = new THREE.MeshLambertMaterial({ color: 0x465157, flatShading: true });
    const rubber = new THREE.MeshLambertMaterial({ color: 0x101516, flatShading: true });
    const lit = new THREE.MeshBasicMaterial({ color: 0x7dff9e });
    const amber = new THREE.MeshBasicMaterial({ color: 0xffb84e });
    const skin = new THREE.MeshLambertMaterial({ color: 0xb98764, flatShading: true });
    const sleeve = new THREE.MeshLambertMaterial({ color: 0x235f91, flatShading: true });

    box(0.34, 0.57, 0.16, shell, 0, 0, 0, this.root);
    box(0.30, 0.05, 0.19, edge, 0, 0.285, 0, this.root);
    box(0.30, 0.05, 0.19, edge, 0, -0.285, 0, this.root);
    box(0.05, 0.48, 0.19, rubber, -0.18, -0.02, 0, this.root);
    box(0.05, 0.48, 0.19, rubber, 0.18, -0.02, 0, this.root);
    box(0.23, 0.095, 0.012, lit, 0, 0.18, 0.088, this.root);
    box(0.075, 0.018, 0.014, amber, 0.06, 0.18, 0.096, this.root);

    // Speaker grille and keypad keep the device readable at the low internal
    // pixel resolution without resorting to a flat rectangle.
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 5; x++) {
        box(
          0.018,
          0.018,
          0.014,
          rubber,
          (x - 2) * 0.043,
          0.075 - y * 0.038,
          0.090,
          this.root
        );
      }
    }
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        box(
          0.047,
          0.033,
          0.014,
          edge,
          (x - 1) * 0.072,
          -0.13 - y * 0.052,
          0.090,
          this.root
        );
      }
    }

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.46, 7), rubber);
    antenna.position.set(-0.105, 0.52, 0);
    this.root.add(antenna);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.055, 8), edge);
    knob.position.set(0.105, 0.34, 0);
    this.root.add(knob);

    this.ptt = box(0.045, 0.13, 0.026, amber, 0.198, 0.075, 0.01, this.root);
    this.ptt.name = 'uav-radio-ptt';

    // One continuous right arm carries and operates the radio. The long sleeve
    // exits through the lower-right edge of the camera, so neither an open
    // wrist seam nor the missing upper arm can ever enter the frame.
    this.forearm = box(0.24, 0.88, 0.20, sleeve, 0.26, -0.64, 0.04, this.root);
    this.forearm.name = 'uav-radio-sleeved-forearm';
    this.forearm.rotation.z = 0.22;
    this.cuff = box(0.28, 0.15, 0.21, edge, 0.20, -0.38, 0.045, this.root);
    this.cuff.name = 'uav-radio-cuff';
    this.cuff.rotation.z = 0.10;
    this.carryHand = box(0.20, 0.28, 0.15, skin, 0.18, -0.25, 0.055, this.root);
    this.carryHand.name = 'uav-radio-carry-hand';
    this.carryHand.rotation.z = -0.06;
    this.pressThumb = box(0.060, 0.25, 0.065, skin, 0.24, -0.005, 0.092, this.root);
    this.pressThumb.name = 'uav-radio-attached-thumb';
    this.pressThumb.rotation.z = 0.18;

    this.root.scale.setScalar(0.70);
    this.walkPhase = 0;
    this.walkBlend = 0;
  }

  update(dt, active, progress = 0, motion = null) {
    // The complete radio gesture is only half a second, so both the raise and
    // drop springs must settle quickly enough to stay inside that call window.
    this.blend = damp(this.blend, active ? 1 : 0, active ? 27 : 32, dt);
    this.root.visible = this.blend > 0.01;
    if (!this.root.visible) return;
    const eased = 1 - Math.pow(1 - this.blend, 3);
    const pressPhase = Math.max(0, Math.min(1, ((Number(progress) || 0) - 0.28) / 0.34));
    const press = Math.sin(pressPhase * Math.PI);
    const speed = Math.max(0, Number(motion?.moveSpeed) || 0);
    const grounded = motion?.grounded !== false;
    const moveTarget = active && grounded ? Math.min(1, speed / 5.2) : 0;
    this.walkBlend = damp(this.walkBlend, moveTarget, moveTarget > this.walkBlend ? 10 : 14, dt);
    if (moveTarget > 0.01) {
      this.walkPhase += dt * (7.4 + Math.min(1, speed / 6.2) * 3.8);
    }
    const walk = this.walkBlend;
    const stride = Math.sin(this.walkPhase);
    const step = Math.abs(Math.cos(this.walkPhase));
    const sprintScale = motion?.sprinting ? 1.22 : 1;
    const bobX = stride * 0.017 * walk * sprintScale;
    const bobY = -step * 0.012 * walk * sprintScale;
    const bobZ = Math.cos(this.walkPhase * 2) * 0.005 * walk;
    this.root.position.set(
      1.14 - eased * 0.14 + bobX,
      -1.12 + eased * 0.66 - press * 0.004 + bobY,
      -1.05 - eased * 0.60 + press * 0.012 + bobZ
    );
    this.root.rotation.set(
      0.10 + (1 - eased) * 0.40 + step * 0.010 * walk,
      -0.08 + (1 - eased) * 0.24 + stride * 0.012 * walk,
      -0.025 + (1 - eased) * 0.16 + stride * 0.022 * walk
    );
    this.pressThumb.position.set(
      0.24 - press * 0.035,
      -0.005,
      0.092 - press * 0.018
    );
    this.ptt.position.x = 0.198 - press * 0.010;
  }
}
