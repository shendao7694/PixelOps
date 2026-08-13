// Hand-authored 5x7 bitmap font. Drawing the HUD from real pixels (instead of
// a webfont) keeps every glyph aligned to the low-res framebuffer.
const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.#...', '#....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '\\': ['#....', '#....', '.#...', '..#..', '...#.', '....#', '....#'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '%': ['##..#', '##.#.', '..#..', '.#...', '#..##', '...##', '.....'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
  '|': ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  '^': ['..#..', '.#.#.', '#...#', '.....', '.....', '.....', '.....'],
  'v': ['.....', '.....', '.....', '#...#', '.#.#.', '..#..', '.....'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const CJK_GLYPH_W = 10;
const CJK_GLYPH_H = 10;
const CJK_RASTER_SIZE = 14;
const CJK_RASTER_INSET = 2;
const CJK_ALPHA_THRESHOLD = 0.5;
const CJK_FONT_FAMILY = 'Ark Pixel CJK';

// pre-compile every glyph into horizontal runs so drawing is a few fillRects
const RUNS = new Map();
const CJK_RUNS = new Map();
let cjkRasterizer = null;
let cjkRasterizerUnavailable = false;
let cjkPixelFontReady = false;
let cjkPixelFontLoading = false;
let cjkPixelFontFailed = false;

function compile(ch) {
  const rows = G[ch] || G['?'];
  const runs = [];
  for (let y = 0; y < GLYPH_H; y++) {
    const row = rows[y];
    let x = 0;
    while (x < GLYPH_W) {
      if (row[x] === '#') {
        let len = 1;
        while (x + len < GLYPH_W && row[x + len] === '#') len++;
        runs.push([x, y, len]);
        x += len;
      } else x++;
    }
  }
  RUNS.set(ch, runs);
  return runs;
}
for (const k in G) compile(k);

function isWideGlyph(ch) {
  return CJK_RE.test(ch) || (ch.codePointAt(0) || 0) > 0xff;
}

export function textWidth(str, scale = 1, tracking = 1) {
  if (!str) return 0;
  if (containsCjk(str)) {
    let units = 0;
    let lastWasWide = false;
    for (const ch of String(str)) {
      lastWasWide = isWideGlyph(ch);
      units += lastWasWide ? CJK_GLYPH_W : GLYPH_W + tracking;
    }
    return Math.max(0, units - (lastWasWide ? 0 : tracking)) * scale;
  }
  return (str.length * (GLYPH_W + tracking) - tracking) * scale;
}

export function containsCjk(str) {
  for (const ch of String(str || '')) {
    if (isWideGlyph(ch)) return true;
  }
  return false;
}

/**
 * Draw a string of pixels.
 * align: 'left' | 'center' | 'right'; y is the top of the glyph box.
 */
export function drawText(ctx, str, x, y, opts = {}) {
  const scale = opts.scale || 1;
  const tracking = opts.tracking === undefined ? 1 : opts.tracking;
  const color = opts.color || '#e8f0f5';
  const align = opts.align || 'left';
  const raw = String(str);
  if (containsCjk(raw)) {
    return drawCjkText(ctx, raw, x, y, { ...opts, scale, color, align });
  }
  const s = raw.toUpperCase();
  const w = textWidth(s, scale, tracking);
  let px = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? Math.round(x - w) : Math.round(x);
  const py = Math.round(y);

  if (opts.shadow !== false) {
    ctx.fillStyle = opts.shadowColor || 'rgba(0,0,0,0.75)';
    blit(ctx, s, px + scale, py + scale, scale, tracking);
  }
  ctx.fillStyle = color;
  blit(ctx, s, px, py, scale, tracking);
  return w;
}

function drawCjkText(ctx, text, x, y, opts) {
  const scale = opts.scale;
  const tracking = opts.tracking === undefined ? 1 : opts.tracking;
  const w = textWidth(text, scale, tracking);
  const px = opts.align === 'center'
    ? Math.round(x - w / 2)
    : opts.align === 'right'
      ? Math.round(x - w)
      : Math.round(x);
  const py = Math.round(y);

  if (opts.shadow !== false) {
    ctx.fillStyle = opts.shadowColor || 'rgba(0,0,0,0.75)';
    blitMixed(ctx, text, px + scale, py + scale, scale, tracking);
  }
  ctx.fillStyle = opts.color;
  blitMixed(ctx, text, px, py, scale, tracking);
  return w;
}

/**
 * Browsers cannot disable antialiasing for CanvasRenderingContext2D.fillText.
 * Rasterize each CJK glyph once at high resolution, quantize it into a compact
 * 1-bit cell, then draw only integer fillRect runs. The HUD can now scale with
 * image-rendering: pixelated without enlarging grey antialiasing pixels.
 */
function compileCjk(ch) {
  if (CJK_RUNS.has(ch)) return CJK_RUNS.get(ch);

  const pixels = rasterizeCjk(ch) || fallbackCjk(ch);
  const runs = [];
  for (let y = 0; y < CJK_GLYPH_H; y++) {
    let x = 0;
    while (x < CJK_GLYPH_W) {
      if (pixels[y * CJK_GLYPH_W + x]) {
        let len = 1;
        while (
          x + len < CJK_GLYPH_W
          && pixels[y * CJK_GLYPH_W + x + len]
        ) len++;
        runs.push([x, y, len]);
        x += len;
      } else x++;
    }
  }
  CJK_RUNS.set(ch, runs);
  return runs;
}

function getCjkRasterizer() {
  if (cjkRasterizerUnavailable) return null;
  if (cjkRasterizer) return cjkRasterizer;
  try {
    const canvas = globalThis.document?.createElement?.('canvas');
    if (!canvas?.getContext) throw new Error('canvas unavailable');
    canvas.width = CJK_RASTER_SIZE;
    canvas.height = CJK_RASTER_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx?.getImageData || !ctx?.fillText) throw new Error('2D rasterizer unavailable');
    cjkRasterizer = { canvas, ctx };
    return cjkRasterizer;
  } catch {
    cjkRasterizerUnavailable = true;
    return null;
  }
}

function ensureCjkPixelFont() {
  if (cjkPixelFontReady) return true;
  const fonts = globalThis.document?.fonts;
  if (!fonts) return false;
  const query = `10px "${CJK_FONT_FAMILY}"`;
  if (fonts.check?.(query, '设置语言')) {
    cjkPixelFontReady = true;
    return true;
  }
  if (!cjkPixelFontLoading && !cjkPixelFontFailed) {
    cjkPixelFontLoading = true;
    fonts.load(query, '设置语言').then(() => {
      cjkPixelFontReady = true;
      cjkPixelFontLoading = false;
      CJK_RUNS.clear();
    }).catch(() => {
      cjkPixelFontLoading = false;
      cjkPixelFontFailed = true;
    });
  }
  return false;
}

function rasterizeCjk(ch) {
  const rasterizer = getCjkRasterizer();
  if (!rasterizer) return null;
  if (!ensureCjkPixelFont()) return null;
  const { ctx } = rasterizer;
  ctx.clearRect(0, 0, CJK_RASTER_SIZE, CJK_RASTER_SIZE);
  ctx.fillStyle = '#fff';
  ctx.font = `10px "${CJK_FONT_FAMILY}"`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(ch, CJK_RASTER_INSET, CJK_RASTER_INSET);

  const source = ctx.getImageData(
    0,
    0,
    CJK_RASTER_SIZE,
    CJK_RASTER_SIZE
  ).data;
  let sourceHasInk = false;
  for (let i = 3; i < source.length; i += 4) {
    if (source[i] > 0) {
      sourceHasInk = true;
      break;
    }
  }
  if (!sourceHasInk) return null;

  const pixels = new Uint8Array(CJK_GLYPH_W * CJK_GLYPH_H);
  for (let y = 0; y < CJK_GLYPH_H; y++) {
    for (let x = 0; x < CJK_GLYPH_W; x++) {
      const sx = CJK_RASTER_INSET + x;
      const sy = CJK_RASTER_INSET + y;
      const alpha = source[(sy * CJK_RASTER_SIZE + sx) * 4 + 3];
      pixels[y * CJK_GLYPH_W + x] =
        alpha / 255 >= CJK_ALPHA_THRESHOLD ? 1 : 0;
    }
  }
  return pixels;
}

// Node layout audits do not have a real font rasterizer. They still receive a
// deterministic hard-pixel glyph so measurements and drawing paths stay valid.
function fallbackCjk(ch) {
  const pixels = new Uint8Array(CJK_GLYPH_W * CJK_GLYPH_H);
  const code = ch.codePointAt(0) || 0;
  for (let x = 1; x < CJK_GLYPH_W - 1; x++) {
    pixels[CJK_GLYPH_W + x] = 1;
    pixels[(CJK_GLYPH_H - 2) * CJK_GLYPH_W + x] = 1;
  }
  for (let y = 1; y < CJK_GLYPH_H - 1; y++) {
    pixels[y * CJK_GLYPH_W + 1] = 1;
    pixels[y * CJK_GLYPH_W + CJK_GLYPH_W - 2] = 1;
    if ((code >> (y - 1)) & 1) pixels[y * CJK_GLYPH_W + 4] = 1;
  }
  return pixels;
}

function blitMixed(ctx, text, px, py, scale, tracking) {
  let cx = px;
  for (const rawCh of text) {
    if (isWideGlyph(rawCh)) {
      const runs = compileCjk(rawCh);
      for (const [rx, ry, len] of runs) {
        ctx.fillRect(
          cx + rx * scale,
          py + ry * scale,
          len * scale,
          scale
        );
      }
      // The monospaced CJK cell already includes its own side bearing.
      cx += CJK_GLYPH_W * scale;
      continue;
    }

    const ch = rawCh.toUpperCase();
    if (ch !== ' ') {
      const runs = RUNS.get(ch) || compile(ch);
      for (const [rx, ry, len] of runs) {
        ctx.fillRect(
          cx + rx * scale,
          py + ry * scale,
          len * scale,
          scale
        );
      }
    }
    cx += (GLYPH_W + tracking) * scale;
  }
}

function blit(ctx, s, px, py, scale, tracking) {
  let cx = px;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== ' ') {
      const runs = RUNS.get(ch) || compile(ch);
      for (let r = 0; r < runs.length; r++) {
        const [rx, ry, len] = runs[r];
        ctx.fillRect(cx + rx * scale, py + ry * scale, len * scale, scale);
      }
    }
    cx += (GLYPH_W + tracking) * scale;
  }
}
