// Every surface in the game is drawn here, pixel by pixel, at load time.
// No image files, no downloads - just a coherent 32px art style.
import * as THREE from '../../vendor/three.module.js';
import { PixelCanvas, toCanvas } from '../core/pixelcanvas.js';
import { makeRng } from '../core/math.js';

export const PALETTE = {
  concrete: 0x8b8f96,
  concreteDark: 0x5c6067,
  steel: 0x7c848c,
  steelDark: 0x474e56,
  rust: 0x8a4a2b,
  crate: 0x9a6b3c,
  crateDark: 0x6b4726,
  sand: 0xb4a37a,
  sandDark: 0x8a7b58,
  hazardYellow: 0xd7b53c,
  teamBlue: 0x3f6fa8,
  teamRed: 0xa8433f,
  gunmetal: 0x3a3f45,
  polymer: 0x2b2e33,
  brass: 0xc79a4a,
  bloodRed: 0x8e1f1f,
};

function texFromPixels(px, { repeat = 1, filterMips = true } = {}) {
  const tex = new THREE.CanvasTexture(toCanvas(px));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = filterMips ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
  tex.generateMipmaps = filterMips;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat !== 1) tex.repeat.set(repeat, repeat);
  return tex;
}

/* ---------------------------------------------------------------- surfaces */

function concreteTex(seed, base = PALETTE.concrete, dark = PALETTE.concreteDark) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(base);
  p.noise(0.09);
  p.speckle(70, dark, 90);
  p.speckle(30, 0xffffff, 40);
  // hairline cracks
  const rng = makeRng(seed + 7);
  for (let c = 0; c < 3; c++) {
    let x = (rng() * 32) | 0, y = (rng() * 32) | 0;
    for (let s = 0; s < 10; s++) {
      p.set(x, y, 0, 0, 0, 34);
      x += (rng() * 3 | 0) - 1;
      y += (rng() * 3 | 0) - 1;
    }
  }
  // panel joint
  p.rect(0, 0, 32, 1, dark, 150);
  p.rect(0, 0, 1, 32, dark, 150);
  p.rect(1, 1, 31, 1, 0xffffff, 22);
  return p;
}

function asphaltTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(0x3c4045);
  p.noise(0.16);
  p.speckle(120, 0x585d63, 120);
  p.speckle(40, 0x22262a, 160);
  return p;
}

function tileTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(0x9aa0a6);
  p.noise(0.06);
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const x = tx * 16, y = ty * 16;
      p.rect(x, y, 16, 1, 0x5f656b, 190);
      p.rect(x, y, 1, 16, 0x5f656b, 190);
      p.rect(x + 1, y + 1, 15, 1, 0xffffff, 30);
      p.rect(x + 15, y + 1, 1, 15, 0x000000, 30);
    }
  }
  p.speckle(40, 0x70767c, 70);
  return p;
}

function sandTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(PALETTE.sand);
  p.noise(0.1);
  p.speckle(150, PALETTE.sandDark, 90);
  p.speckle(60, 0xd8c99e, 90);
  p.speckle(14, 0x6f6244, 120, 2);
  return p;
}

function metalPanelTex(seed, base = PALETTE.steel) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(base);
  p.noise(0.07);
  // panel seams
  p.rect(0, 0, 32, 1, 0x000000, 60);
  p.rect(0, 15, 32, 1, 0x000000, 45);
  p.rect(0, 16, 32, 1, 0xffffff, 22);
  p.rect(0, 0, 1, 32, 0x000000, 60);
  // rivets
  for (let y = 3; y < 32; y += 12) {
    for (let x = 3; x < 32; x += 12) {
      p.set(x, y, 220, 226, 232, 150);
      p.set(x, y + 1, 20, 22, 26, 110);
    }
  }
  p.speckle(26, 0x2c3238, 60);
  p.speckle(18, PALETTE.rust, 70);
  return p;
}

function containerTex(seed, base = 0x2f6a5a) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(base);
  p.noise(0.06);
  // corrugation
  for (let x = 0; x < 32; x += 4) {
    p.rect(x, 0, 1, 32, 0xffffff, 30);
    p.rect(x + 1, 0, 1, 32, 0x000000, 16);
    p.rect(x + 3, 0, 1, 32, 0x000000, 46);
  }
  p.rect(0, 0, 32, 2, 0x000000, 55);
  p.rect(0, 30, 32, 2, 0x000000, 55);
  p.speckle(46, PALETTE.rust, 110);
  p.speckle(20, 0x1a1d20, 80);
  return p;
}

function crateTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(PALETTE.crate);
  p.noise(0.11);
  // planks
  for (let y = 0; y < 32; y += 8) {
    p.rect(0, y, 32, 1, PALETTE.crateDark, 190);
    p.rect(0, y + 1, 32, 1, 0xffffff, 24);
    p.rect(0, y + 7, 32, 1, 0x000000, 34);
  }
  // metal corner brackets
  p.rect(0, 0, 3, 32, 0x6a6f75, 220);
  p.rect(29, 0, 3, 32, 0x6a6f75, 220);
  p.rect(0, 0, 32, 1, 0x50555b, 200);
  for (let y = 2; y < 32; y += 7) {
    p.set(1, y, 210, 216, 222, 200);
    p.set(30, y, 210, 216, 222, 200);
  }
  p.speckle(40, PALETTE.crateDark, 80);
  return p;
}

function brickTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(0x6b4038);
  const rng = makeRng(seed);
  for (let row = 0; row < 8; row++) {
    const y = row * 4;
    const off = (row % 2) * 8;
    for (let b = 0; b < 2; b++) {
      const x = off + b * 16;
      const tint = 0.85 + rng() * 0.3;
      const col = [
        Math.min(255, 0x8a * tint) | 0,
        Math.min(255, 0x50 * tint) | 0,
        Math.min(255, 0x42 * tint) | 0,
      ];
      p.rectRgb(x + 1, y + 1, 14, 3, col, 255);
      p.rectRgb(x + 1, y + 1, 14, 1, [col[0] + 20, col[1] + 16, col[2] + 12], 120);
    }
  }
  p.noise(0.08);
  return p;
}

function hazardTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(0x22242a);
  for (let i = -32; i < 64; i += 12) {
    for (let y = 0; y < 32; y++) p.rect(i + y, y, 6, 1, PALETTE.hazardYellow, 255);
  }
  p.noise(0.1);
  p.speckle(70, 0x000000, 60);
  return p;
}

function roofTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(0x555b62);
  p.noise(0.08);
  for (let y = 0; y < 32; y += 6) {
    p.rect(0, y, 32, 1, 0x2d3238, 160);
    p.rect(0, y + 1, 32, 1, 0xffffff, 20);
  }
  p.speckle(30, PALETTE.rust, 60);
  return p;
}

function sandbagTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(0x9a8d64);
  for (let row = 0; row < 4; row++) {
    const y = row * 8;
    const off = (row % 2) * 8;
    for (let b = 0; b < 2; b++) {
      const x = off + b * 16;
      p.rect(x + 1, y + 1, 14, 6, 0xa89a70, 255);
      p.rect(x + 1, y + 1, 14, 1, 0xc4b688, 200);
      p.rect(x + 1, y + 6, 14, 1, 0x6d6446, 220);
      p.rect(x, y, 1, 8, 0x6d6446, 200);
    }
  }
  p.noise(0.12);
  p.speckle(50, 0x7a7050, 90);
  return p;
}

function glassTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(0x66809a);
  p.noise(0.05);
  for (let i = 0; i < 32; i += 2) p.set(i, i, 255, 255, 255, 60);
  p.rect(0, 0, 32, 1, 0x2a3340, 150);
  p.rect(0, 0, 1, 32, 0x2a3340, 150);
  return p;
}

function woodFloorTex(seed) {
  const p = new PixelCanvas(32, 32, seed);
  p.fill(0x7a5a36);
  p.noise(0.1);
  for (let y = 0; y < 32; y += 5) {
    p.rect(0, y, 32, 1, 0x4c3821, 190);
    p.rect(0, y + 1, 32, 1, 0xffffff, 16);
  }
  p.speckle(60, 0x5f472a, 80);
  return p;
}

/* -------------------------------------------------------------- characters */

function camoTex(seed, colors) {
  const p = new PixelCanvas(16, 16, seed);
  p.fill(colors[0]);
  const rng = makeRng(seed);
  for (let i = 1; i < colors.length; i++) {
    for (let b = 0; b < 7; b++) {
      const x = (rng() * 16) | 0, y = (rng() * 16) | 0;
      const w = 2 + ((rng() * 4) | 0), h = 2 + ((rng() * 3) | 0);
      p.rect(x, y, w, h, colors[i], 255);
      p.rect(x + 1, y + h, w - 1, 1, colors[i], 255);
    }
  }
  p.noise(0.07);
  return p;
}

function armorTex(seed, base) {
  const p = new PixelCanvas(16, 16, seed);
  p.fill(base);
  p.noise(0.08);
  p.rect(0, 3, 16, 1, 0x000000, 60);
  p.rect(0, 11, 16, 1, 0x000000, 60);
  p.rect(0, 4, 16, 1, 0xffffff, 26);
  p.speckle(16, 0x000000, 50);
  return p;
}

function helmetTex(seed, base) {
  const p = new PixelCanvas(16, 16, seed);
  p.fill(base);
  p.noise(0.06);
  p.rect(0, 0, 16, 2, 0xffffff, 26);
  p.speckle(12, 0x000000, 40);
  return p;
}

/* ----------------------------------------------------------------- weapons */

function gunmetalTex(seed, base = PALETTE.gunmetal) {
  const p = new PixelCanvas(16, 16, seed);
  p.fill(base);
  p.noise(0.09);
  p.rect(0, 0, 16, 1, 0xffffff, 28);
  p.speckle(14, 0x11151a, 90);
  p.speckle(6, 0x9aa2aa, 60);
  return p;
}

function gripTex(seed) {
  const p = new PixelCanvas(16, 16, seed);
  p.fill(0x24272c);
  for (let y = 0; y < 16; y += 2) {
    for (let x = (y / 2) % 2; x < 16; x += 2) p.set(x, y, 90, 96, 104, 130);
  }
  p.noise(0.08);
  return p;
}

/* -------------------------------------------------------------------- misc */

function skyTex() {
  // Minecraft-school sky: NOTHING is painted on the dome except a pure
  // vertical gradient, so the sphere reads as depthless air rather than the
  // inside of a ball. The sun and the clouds are separate flat objects that
  // the level builder places in the world.
  const W = 16, H = 128;
  const p = new PixelCanvas(W, H, 91);
  const stops = [
    { t: 0.00, c: [0x2b, 0x4d, 0x78] },       // zenith
    { t: 0.52, c: [0x6f, 0x9c, 0xc4] },       // mid sky
    { t: 0.84, c: [0xc5, 0xd8, 0xe4] },       // low haze
    { t: 1.00, c: [0xe8, 0xe4, 0xd4] },       // warm horizon
  ];
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1].t) i++;
    const u0 = (t - stops[i].t) / (stops[i + 1].t - stops[i].t);
    const a = stops[i].c, b = stops[i + 1].c;
    for (let x = 0; x < W; x++) {
      const u = Math.min(1, Math.max(0, u0 + (BAYER[y & 3][x & 3] / 16 - 0.5) * 0.07));
      p.set(x, y, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, 255);
    }
  }
  return p;
}

function cloudsTex() {
  // Minecraft clouds: a handful of chunky white islands with plenty of open
  // blue between them, tiling seamlessly.
  const p = new PixelCanvas(64, 64, 17);
  p.clear();
  const rng = makeRng(23);
  for (let c = 0; c < 5; c++) {
    const cx = (rng() * 64) | 0;
    const cy = (rng() * 64) | 0;
    const n = 2 + ((rng() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const w = 6 + ((rng() * 8) | 0);
      const h = 3 + ((rng() * 4) | 0);
      const ox = ((rng() * 8) | 0) - 4;
      const oy = ((rng() * 6) | 0) - 3;
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          p.set((cx + ox + xx) & 63, (cy + oy + yy) & 63, 246, 250, 253, 225);
        }
      }
    }
  }
  return p;
}

function sunSpriteTex() {
  // The classic square sun, softly stepped so it glows without a halo mesh.
  const p = new PixelCanvas(16, 16, 3);
  p.clear();
  p.rect(1, 1, 14, 14, 0xffe9a8, 90);
  p.rect(2, 2, 12, 12, 0xfff3c8, 200);
  p.rect(3, 3, 10, 10, 0xfffbe6, 255);
  return p;
}

function bulletHoleTex() {
  const p = new PixelCanvas(16, 16, 33);
  p.clear();
  p.disc(8, 8, 5, 0x2a2622, 120);
  p.disc(8, 8, 3, 0x131110, 230);
  p.disc(8, 8, 2, 0x000000, 255);
  p.speckle(10, 0x000000, 90);
  // rim highlight
  p.set(6, 5, 200, 200, 200, 90);
  p.set(10, 11, 40, 40, 40, 90);
  const tex = new THREE.CanvasTexture(toCanvas(p));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function bloodDecalTex(seed = 12) {
  const p = new PixelCanvas(16, 16, seed);
  p.clear();
  const rng = makeRng(seed);
  p.disc(8, 8, 4, PALETTE.bloodRed, 210);
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const d = 3 + rng() * 5;
    p.rect((8 + Math.cos(a) * d) | 0, (8 + Math.sin(a) * d) | 0, 1 + ((rng() * 2) | 0), 1, 0x6d1414, 190);
  }
  const tex = new THREE.CanvasTexture(toCanvas(p));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function flashTex() {
  const p = new PixelCanvas(32, 32, 77);
  p.clear();
  p.disc(16, 16, 9, 0xff9c2e, 90);
  p.disc(16, 16, 6, 0xffd166, 190);
  p.disc(16, 16, 4, 0xfff6d5, 255);
  // spikes
  for (let i = 0; i < 16; i++) {
    const a = 255 - i * 12;
    p.rect(16 - i, 15, 1, 2, 0xffe9a8, Math.max(0, a));
    p.rect(15 + i, 15, 1, 2, 0xffe9a8, Math.max(0, a));
    p.rect(15, 16 - i, 2, 1, 0xffd166, Math.max(0, a - 60));
    p.rect(15, 15 + i, 2, 1, 0xffd166, Math.max(0, a - 60));
  }
  const tex = new THREE.CanvasTexture(toCanvas(p));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function softSquareTex() {
  const p = new PixelCanvas(8, 8, 3);
  p.fill(0xffffff);
  const tex = new THREE.CanvasTexture(toCanvas(p));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ export */

export function buildTextures() {
  const T = {};
  T.concrete = texFromPixels(concreteTex(1));
  T.concreteDark = texFromPixels(concreteTex(2, 0x6d7178, 0x494d54));
  T.asphalt = texFromPixels(asphaltTex(3));
  T.tile = texFromPixels(tileTex(4));
  T.sand = texFromPixels(sandTex(5));
  T.metal = texFromPixels(metalPanelTex(6));
  T.metalDark = texFromPixels(metalPanelTex(7, 0x4e555d));
  T.containerGreen = texFromPixels(containerTex(8, 0x2f6a5a));
  T.containerRust = texFromPixels(containerTex(9, 0x8a4b32));
  T.containerBlue = texFromPixels(containerTex(10, 0x2f4f7a));
  T.crate = texFromPixels(crateTex(11));
  T.brick = texFromPixels(brickTex(12));
  T.hazard = texFromPixels(hazardTex(13));
  T.roof = texFromPixels(roofTex(14));
  T.sandbag = texFromPixels(sandbagTex(15));
  T.glass = texFromPixels(glassTex(16));
  T.wood = texFromPixels(woodFloorTex(17));

  T.camoBlue = texFromPixels(camoTex(21, [0x33465e, 0x25334a, 0x435a76, 0x1d2735]));
  T.camoRed = texFromPixels(camoTex(22, [0x5e3833, 0x4a2825, 0x764a43, 0x35201d]));
  T.armorBlue = texFromPixels(armorTex(23, 0x2b3c52));
  T.armorRed = texFromPixels(armorTex(24, 0x522b2b));
  T.helmetBlue = texFromPixels(helmetTex(25, 0x35485f));
  T.helmetRed = texFromPixels(helmetTex(26, 0x5f3535));

  T.gunmetal = texFromPixels(gunmetalTex(31));
  T.gunBlack = texFromPixels(gunmetalTex(32, 0x24272b));
  T.gunTan = texFromPixels(gunmetalTex(33, 0x7d6a4a));
  T.grip = texFromPixels(gripTex(34));

  T.sky = texFromPixels(skyTex(), { filterMips: false });
  T.sky.wrapS = THREE.RepeatWrapping;
  T.sky.wrapT = THREE.ClampToEdgeWrapping;
  T.clouds = texFromPixels(cloudsTex(), { filterMips: false });
  T.clouds.wrapS = T.clouds.wrapT = THREE.RepeatWrapping;
  T.sunSprite = texFromPixels(sunSpriteTex(), { filterMips: false });

  T.bulletHole = bulletHoleTex();
  T.bloodDecal = bloodDecalTex();
  T.flash = flashTex();
  T.particle = softSquareTex();

  return T;
}
