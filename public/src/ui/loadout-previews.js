const SVG_NS = 'http://www.w3.org/2000/svg';

const weapon = (body, details = []) => [
  ['path', { d: body, class: 'model-primary' }],
  ...details,
];

const MODEL_OUTLINES = Object.freeze({
  rifle: weapon(
    'M16 48h28l19-14h22l7-7h63l8 9h31v5h31v9h-31l-8 8h-42l-13 10H91L72 59H48L35 67H17l9-10H16z',
    [
      ['path', { d: 'M96 58l-3 25h17l9-25M126 58l11 24h12l-4-27M78 33h58M109 27v-8h24v8M115 19v-5h12v5', class: 'model-detail' }],
      ['path', { d: 'M171 36v14M184 36v14M49 48l12 10', class: 'model-detail' }],
    ]
  ),
  smg: weapon(
    'M24 43h30l12-9h70l9 7h28v6h38v9h-41l-9 8h-37l-11 8H82L64 61H44L31 69H18l9-12h-3z',
    [
      ['path', { d: 'M108 63l5 25h18l4-28M75 34v-8h37v8M144 42v15M55 44l13 15', class: 'model-detail' }],
      ['rect', { x: 89, y: 25, width: 21, height: 7, rx: 2, class: 'model-detail' }],
    ]
  ),
  shotgun: weapon(
    'M14 45h39l21-14h27l10 7h85v-4h28v9h-27v9h-80l-15 12H75L54 57H35L24 66H12l8-12h-6z',
    [
      ['path', { d: 'M119 52l9 26h15l4-29M149 38v14M160 38v14M170 38v14M47 45l13 11', class: 'model-detail' }],
      ['path', { d: 'M150 55h36l-5 8h-31z', class: 'model-detail' }],
    ]
  ),
  sniper: weapon(
    'M10 48h42l21-14h33l9 8h51l8-5h48v5h15v9h-64l-10 8h-50L98 69H72L51 59H29L18 67H8l8-11h-6z',
    [
      ['path', { d: 'M118 58l8 25h16l4-27M77 34v-8h52v8M89 26v-8h31v8M174 37v15M192 37v15', class: 'model-detail' }],
      ['rect', { x: 82, y: 17, width: 44, height: 9, rx: 4, class: 'model-detail' }],
    ]
  ),
  machine_pistol: weapon(
    'M48 31h112l12 10h30v12h-35l-12 9h-41l-8 28H83l7-34H56L44 48z',
    [
      ['path', { d: 'M120 62l5 31h17l5-31M64 31v-8h54v8M167 41v12M78 57h29', class: 'model-detail' }],
      ['path', { d: 'M99 58L87 95h23l7-37', class: 'model-detail' }],
    ]
  ),
  desert_eagle: weapon(
    'M42 32h122l14 12h28v12h-30l-10 8h-50l-8 30H82l6-36H54L42 47z',
    [
      ['path', { d: 'M148 32l6-8h24l-4 8M176 44h20M60 32h84M82 94h30', class: 'model-detail' }],
      ['path', { d: 'M58 44v12M132 44h24', class: 'model-detail' }],
    ]
  ),
  railgun: weapon(
    // Exact low-detail side projection of buildRailgun(): the left/right EM
    // rails overlap from this angle, followed by its square receiver and stock.
    'M8 47h22v12H8L3 53zM28 50h116v7H28zM36 42h121v6H36zM123 47h70v15h-70zM176 47h50v16h-50zM226 47h5v18h-5zM185 38h33v7h-33z',
    [
      ['path', { d: 'M43 45v16M64 45v16M85 45v16M106 45v16M127 45v16', class: 'model-detail' }],
      ['path', { d: 'M109 23h59v9h-59zM112 32v10M161 32v10M137 19v4', class: 'model-detail' }],
      ['path', { d: 'M153 62h14v18h-14zM151 80h18M105 59l6 20h8l-6-20M169 61l5 21h9l-5-21', class: 'model-detail' }],
      ['path', { d: 'M30 54h112M129 52h60M186 51h38', class: 'model-accent' }],
    ]
  ),
  frag: [
    ['path', { d: 'M90 33l14-12h32l14 12 10 18-3 29-17 16h-40L83 80l-3-29z', class: 'model-primary' }],
    ['path', { d: 'M104 21v-9h35v9M136 12l19 5-6 11M86 43h68M82 58h76M86 76h68M103 33l-5 62M124 33v63M145 33l5 61', class: 'model-detail' }],
    ['path', { d: 'M147 17c26-9 37 0 35 14-2 11-11 17-24 16', class: 'model-detail' }],
  ],
  incendiary: [
    ['path', { d: 'M91 18h58l9 12v58l-9 10H91L82 88V30z', class: 'model-primary' }],
    ['path', { d: 'M100 18V9h40v9M86 35h68M86 81h68M92 25h56M92 91h56', class: 'model-detail' }],
    ['path', { d: 'M84 57h72', class: 'model-accent' }],
  ],
  molotov: [
    ['path', { d: 'M106 7h28v25l12 16 8 41-10 9H96l-10-9 8-41 12-16z', class: 'model-primary' }],
    ['path', { d: 'M103 16h34M96 45h48M90 79h60M106 28h28M124 7V1l18 9', class: 'model-detail' }],
    ['path', { d: 'M111 49h26v28h-26z', class: 'model-accent' }],
  ],
  combat_knife: [
    ['path', { d: 'M25 73l27-19 113-43-41 69-54 9z', class: 'model-primary' }],
    ['path', { d: 'M70 89l-2 11-40 2-8-13 32-35M58 61l27 21M73 51l29 24M91 44l27 20', class: 'model-detail' }],
  ],
  laser_blade: [
    ['path', { d: 'M25 73l27-19 113-43-41 69-54 9z', class: 'model-accent laser-edge' }],
    ['path', { d: 'M70 89l-2 11-40 2-8-13 32-35M58 61l27 21M73 51l29 24', class: 'model-primary' }],
  ],
  uav: [
    ['path', { d: 'M18 55l75-14 28-29 10 1-11 31 81 11v8l-80 8 11 28-10 2-29-27-75-11z', class: 'model-primary' }],
    ['path', { d: 'M93 41l27 30M120 44l-27 30M201 55l21-6v20l-21-6', class: 'model-detail' }],
  ],
  strike: [
    ['path', { d: 'M113 5h14l10 17v47l15 16-5 5-20-8v17h-14V82l-20 8-5-5 15-16V22z', class: 'model-primary' }],
    ['path', { d: 'M103 27h34M103 65h34M113 13h14', class: 'model-detail' }],
  ],
  juggernaut: [
    ['path', { d: 'M86 17l18-12h32l18 12 6 32-13 15v28H93V64L80 49z', class: 'model-primary' }],
    ['path', { d: 'M88 27h64M93 36h54v18H93zM105 54v11h30V54M93 70h54M120 70v22', class: 'model-detail' }],
  ],
  sentry: [
    ['path', { d: 'M63 25h91l11 10h45v9h-46l-12 11H64L51 44H27v-9h24z', class: 'model-primary' }],
    ['path', { d: 'M88 55v16M132 55v16M110 55v39M95 69L59 97M125 69l36 28M91 31h50M171 35v9', class: 'model-detail' }],
  ],
  cas: [
    ['path', { d: 'M17 55l70-12 23-32h20l23 32 70 12v10l-70 4-20 24h-26L87 69l-70-4z', class: 'model-primary' }],
    ['path', { d: 'M87 43l20 26M153 43l-20 26M110 11v82M130 11v82', class: 'model-detail' }],
  ],
  firebomb: [
    ['path', { d: 'M15 62l23-8 43-19 34-24h10l34 24 43 19 23 8-26 6-53 1-26 24-26-24-53-1z', class: 'model-primary' }],
    ['path', { d: 'M120 11v82M81 35l39 34 39-34M42 54l79 15 78-15', class: 'model-detail' }],
  ],
  attack_helicopter: [
    ['path', { d: 'M17 45h65l18-18h52l24 14h32l16 10-16 10h-38l-17 12h-58L75 60H17z', class: 'model-primary' }],
    ['path', { d: 'M104 27l12-16h31l19 30M121 73v17M102 90h39M75 47H29M47 38v18M179 61l9 24M174 85h29M118 23h89', class: 'model-detail' }],
  ],
  fallback: [
    ['path', { d: 'M55 26h130v52H55zM55 39h130M76 26V16h88v10M85 78v10h70V78', class: 'model-primary' }],
    ['path', { d: 'M88 49h64M88 58h64', class: 'model-detail' }],
  ],
});

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

/** A lightweight line-art stand-in for the selected in-game model. */
export function createLoadoutModelOutline(id, className = 'loadout-model-outline') {
  const svg = svgElement('svg', {
    viewBox: '0 0 240 104',
    class: className,
    'aria-hidden': 'true',
    focusable: 'false',
    preserveAspectRatio: 'xMidYMid meet',
  });
  const group = svgElement('g', {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  for (const [tag, attributes] of MODEL_OUTLINES[id] || MODEL_OUTLINES.fallback) {
    group.append(svgElement(tag, attributes));
  }
  svg.append(group);
  return svg;
}
