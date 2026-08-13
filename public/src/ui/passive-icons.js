const SVG_NS = 'http://www.w3.org/2000/svg';

const GLYPHS = Object.freeze({
  blast: [
    ['path', { d: 'M16 8v5M16 21v4M8 16h5M21 16h4M10.4 10.4l3.2 3.2M18.4 18.4l3.2 3.2M21.6 10.4l-3.2 3.2M13.6 18.4l-3.2 3.2' }],
    ['circle', { cx: 16, cy: 16, r: 3.2, fill: 'currentColor', stroke: 'none' }],
  ],
  plates: [
    ['path', { d: 'M10 11h12v4H10zM11 16h10v4H11zM12 21h8v3h-8z', fill: 'currentColor', stroke: 'none' }],
  ],
  pulse: [
    ['path', { d: 'M8 17h5l2-6 3 11 2-5h4' }],
    ['path', { d: 'M9 12c1.7-3.1 5.5-3.1 7 0 1.5-3.1 5.3-3.1 7 0', opacity: '.55' }],
  ],
  stealth: [
    ['path', { d: 'M9 20a9 9 0 0114-8M12 20a6 6 0 018-6M16 19h.01M8 9l16 16' }],
  ],
  predator: [
    ['path', { d: 'M10 10l3 10M16 8l1 12M22 10l-3 10' }],
    ['path', { d: 'M11 23c3-2 7-2 10 0', opacity: '.7' }],
  ],
  weapons: [
    ['path', { d: 'M10 9l12 15M22 9L10 24M8 8l4 1-3 3M24 8l-4 1 3 3M8 25l4-1M24 25l-4-1' }],
  ],
  score: [
    ['path', { d: 'M16 8l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z' }],
    ['path', { d: 'M12 25h8', strokeWidth: 2.4 }],
  ],
  wing: [
    ['path', { d: 'M8 20c6 0 9-4 14-11-1 6-4 11-9 14M10 17h6M12 14h6M15 11h5' }],
  ],
  martyrdom: [
    ['path', { d: 'M12 15h8v7l-2 3h-4l-2-3zM14 12h4v3M18 12h2.5l1.5-2' }],
    ['path', { d: 'M23 6v3M21.5 7.5h3M21.9 6.4l2.2 2.2' }],
  ],
  ready: [
    ['path', { d: 'M10 10h7v14l-3.5 2-3.5-2zM12.5 7h2v3' }],
    ['path', { d: 'M19 10h4l-2.4 4H24l-6 8 2-6h-3z' }],
  ],
});

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key === 'strokeWidth' ? 'stroke-width' : key, String(value));
  }
  return node;
}

/** Tactical shield shared by the loadout slot and the armory catalogue. */
export function createPassiveIcon(icon, className = 'passive-icon') {
  const svg = svgElement('svg', {
    viewBox: '0 0 32 34',
    class: className,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.append(
    svgElement('path', {
      d: 'M16 1.5L28 5.5v9.2c0 8.2-4.8 14-12 17.5C8.8 28.7 4 22.9 4 14.7V5.5z',
      class: 'passive-shield-fill',
    }),
    svgElement('path', {
      d: 'M16 1.5L28 5.5v9.2c0 8.2-4.8 14-12 17.5C8.8 28.7 4 22.9 4 14.7V5.5z',
      class: 'passive-shield-line',
    }),
    svgElement('path', {
      d: 'M16 5l8 2.7v7c0 5.8-3.1 10-8 13-4.9-3-8-7.2-8-13v-7z',
      class: 'passive-shield-inner',
    })
  );
  const glyph = svgElement('g', {
    class: 'passive-shield-glyph',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'square',
    'stroke-linejoin': 'miter',
  });
  for (const [tag, attrs] of GLYPHS[icon] || GLYPHS.plates) {
    glyph.append(svgElement(tag, attrs));
  }
  svg.append(glyph);
  return svg;
}

const PIXEL_GLYPHS = Object.freeze({
  blast: [[6, 3], [6, 9], [3, 6], [9, 6], [4, 4], [8, 4], [4, 8], [8, 8], [5, 5, 3, 3]],
  plates: [[3, 4, 7, 2], [4, 7, 5, 2], [5, 10, 3, 1]],
  pulse: [[2, 7, 3, 1], [5, 5, 1, 3], [6, 3, 1, 5], [7, 7, 1, 3], [8, 6, 3, 1]],
  stealth: [[3, 8, 1, 1], [4, 6, 1, 1], [5, 5, 3, 1], [8, 6, 1, 1], [9, 8, 1, 1], [3, 3, 1, 1], [4, 4, 1, 1], [5, 5, 1, 1], [6, 6, 1, 1], [7, 7, 1, 1], [8, 8, 1, 1], [9, 9, 1, 1]],
  predator: [[3, 3, 1, 7], [6, 2, 1, 8], [9, 3, 1, 7], [4, 10, 5, 1]],
  weapons: [[3, 3, 1, 2], [4, 5, 1, 2], [5, 7, 1, 2], [6, 9, 1, 2], [9, 3, 1, 2], [8, 5, 1, 2], [7, 7, 1, 2], [6, 9, 1, 2]],
  score: [[6, 2, 1, 1], [4, 3, 5, 1], [5, 4, 3, 1], [4, 5, 5, 1], [6, 6, 1, 2], [4, 10, 5, 1]],
  wing: [[3, 8, 2, 1], [4, 7, 3, 1], [5, 6, 4, 1], [6, 5, 4, 1], [7, 4, 3, 1], [8, 3, 2, 1], [5, 9, 2, 1]],
  martyrdom: [[4, 6, 5, 5], [5, 4, 3, 2], [8, 3, 2, 1], [10, 2], [9, 1], [11, 1]],
  ready: [[3, 4, 4, 8], [4, 2, 2, 2], [8, 3, 3, 1], [7, 4, 3, 2], [8, 6, 3, 1], [7, 7, 2, 3]],
});

/** Low-resolution HUD version; all geometry stays aligned to whole pixels. */
export function drawPassiveIcon(hud, icon, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  hud.rect(px + 3, py, 7, 1, color);
  hud.rect(px + 1, py + 1, 2, 1, color);
  hud.rect(px + 10, py + 1, 2, 1, color);
  hud.rect(px, py + 2, 1, 8, color);
  hud.rect(px + 12, py + 2, 1, 8, color);
  hud.rect(px + 1, py + 10, 2, 2, color);
  hud.rect(px + 10, py + 10, 2, 2, color);
  hud.rect(px + 3, py + 12, 2, 2, color);
  hud.rect(px + 8, py + 12, 2, 2, color);
  hud.rect(px + 5, py + 14, 3, 1, color);
  for (const [gx, gy, gw = 1, gh = 1] of PIXEL_GLYPHS[icon] || PIXEL_GLYPHS.plates) {
    hud.rect(px + gx, py + gy, gw, gh, color);
  }
}
