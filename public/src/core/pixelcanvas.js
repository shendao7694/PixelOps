// A tiny software rasteriser used to author every texture in the game.
// Everything is written straight into an RGBA byte buffer so the art is
// pixel-exact and needs no external assets (and stays unit-testable).
import { makeRng, clamp } from './math.js';

export function hexRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

export function shade(hex, amount) {
  const [r, g, b] = hexRgb(hex);
  if (amount >= 0) {
    return [
      Math.round(r + (255 - r) * amount),
      Math.round(g + (255 - g) * amount),
      Math.round(b + (255 - b) * amount),
    ];
  }
  const k = 1 + amount;
  return [Math.round(r * k), Math.round(g * k), Math.round(b * k)];
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export class PixelCanvas {
  constructor(w, h, seed = 1) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.rng = makeRng(seed);
  }

  set(x, y, r, g, b, a = 255) {
    x = ((x % this.w) + this.w) % this.w;
    y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    if (a >= 255) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    } else {
      const t = a / 255;
      d[i] = d[i] * (1 - t) + r * t;
      d[i + 1] = d[i + 1] * (1 - t) + g * t;
      d[i + 2] = d[i + 2] * (1 - t) + b * t;
      d[i + 3] = Math.max(d[i + 3], a);
    }
  }

  get(x, y) {
    const i = (((y % this.h) + this.h) % this.h * this.w + ((x % this.w) + this.w) % this.w) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(hex, a = 255) {
    const [r, g, b] = hexRgb(hex);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, r, g, b, a);
    return this;
  }

  clear() {
    this.data.fill(0);
    return this;
  }

  rect(x, y, w, h, hex, a = 255) {
    const [r, g, b] = hexRgb(hex);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, r, g, b, a);
    return this;
  }

  rectRgb(x, y, w, h, rgb, a = 255) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, rgb[0], rgb[1], rgb[2], a);
    return this;
  }

  frame(x, y, w, h, hex, a = 255) {
    this.rect(x, y, w, 1, hex, a);
    this.rect(x, y + h - 1, w, 1, hex, a);
    this.rect(x, y, 1, h, hex, a);
    this.rect(x + w - 1, y, 1, h, hex, a);
    return this;
  }

  line(x0, y0, x1, y1, hex, a = 255) {
    const [r, g, b] = hexRgb(hex);
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.set(x0, y0, r, g, b, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  disc(cx, cy, radius, hex, a = 255) {
    const [r, g, b] = hexRgb(hex);
    const r2 = radius * radius;
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= r2) this.set(cx + x, cy + y, r, g, b, a);
      }
    }
    return this;
  }

  /** Multiply-ish value noise, the backbone of every surface. */
  noise(strength = 0.12, scale = 1) {
    const d = this.data;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        if (d[i + 3] === 0) continue;
        const n = 1 + (this.rng() - 0.5) * 2 * strength * scale;
        d[i] = clamp(d[i] * n, 0, 255);
        d[i + 1] = clamp(d[i + 1] * n, 0, 255);
        d[i + 2] = clamp(d[i + 2] * n, 0, 255);
      }
    }
    return this;
  }

  /** Ordered-dither speckles: gives surfaces that hand-placed pixel-art grain. */
  speckle(count, hex, alpha = 255, size = 1) {
    for (let i = 0; i < count; i++) {
      const x = (this.rng() * this.w) | 0;
      const y = (this.rng() * this.h) | 0;
      const s = size > 1 ? 1 + ((this.rng() * size) | 0) : 1;
      this.rect(x, y, s, s, hex, alpha);
    }
    return this;
  }

  /** Vertical gradient with 4x4 Bayer dithering - no banding, pure pixel art. */
  gradientDither(topHex, bottomHex) {
    const [r0, g0, b0] = hexRgb(topHex);
    const [r1, g1, b1] = hexRgb(bottomHex);
    for (let y = 0; y < this.h; y++) {
      const t = y / (this.h - 1);
      for (let x = 0; x < this.w; x++) {
        const dither = (BAYER4[y & 3][x & 3] / 16 - 0.5) * (1 / 12);
        const tt = clamp(t + dither, 0, 1);
        this.set(x, y, r0 + (r1 - r0) * tt, g0 + (g1 - g0) * tt, b0 + (b1 - b0) * tt, 255);
      }
    }
    return this;
  }

  /** Edge shading: darkens the outer border, fakes ambient occlusion on tiles. */
  edgeShade(depth = 2, amount = 0.55) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const e = Math.min(x, y, this.w - 1 - x, this.h - 1 - y);
        if (e >= depth) continue;
        const k = 1 - (1 - e / depth) * (1 - amount);
        const i = (y * this.w + x) * 4;
        this.data[i] *= k;
        this.data[i + 1] *= k;
        this.data[i + 2] *= k;
      }
    }
    return this;
  }

  /** Highlight on the top edge, shadow on the bottom - cheap bevel. */
  bevel(topHex = 0xffffff, bottomHex = 0x000000, alpha = 46) {
    this.rect(0, 0, this.w, 1, topHex, alpha);
    this.rect(0, this.h - 1, this.w, 1, bottomHex, alpha + 30);
    return this;
  }

  toImageData(ctx) {
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    return img;
  }
}

/** Rasterise a PixelCanvas into a real HTMLCanvasElement. */
export function toCanvas(px) {
  const c = document.createElement('canvas');
  c.width = px.w;
  c.height = px.h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px.w, px.h);
  img.data.set(px.data);
  ctx.putImageData(img, 0, 0);
  return c;
}
