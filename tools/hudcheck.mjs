// HUD layout audit. Every element is drawn on its own, its bounding box is
// recorded, and any two that share pixels - or anything that falls off the
// edge of the screen - is reported. Overlapping readouts are invisible to
// every other check in the suite, and the HUD is laid out for a viewport that
// changes size with the PIXEL SCALE setting and the window aspect.
import { installDomStub } from './domstub.mjs';
const { makeCanvas } = installDomStub();
const THREE = await import('three');
const { Hud, scopeRecoilPose } = await import('../src/ui/hud.js');
const { loadSettings } = await import('../src/core/settings.js');
const { textWidth } = await import('../src/ui/pixelfont.js');
const { WEAPON_DEFS } = await import('../src/game/weapons.js');

const settings = loadSettings();
const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 600);

const scopeRest = scopeRecoilPose(480, 270, 0);
const scopeKicked = scopeRecoilPose(480, 270, 1);
const scopeDoubled = scopeRecoilPose(480, 270, 2);
if (!(scopeKicked.cy < scopeRest.cy && scopeKicked.r > scopeRest.r)
  || Math.abs((scopeRest.cy - scopeDoubled.cy)
    - (scopeRest.cy - scopeKicked.cy) * 2) > 1e-9
  || Math.abs((scopeDoubled.r - scopeRest.r)
    - (scopeKicked.r - scopeRest.r) * 2) > 1e-9) {
  throw new Error('sniper scope recoil must rise and enlarge before settling');
}

function instrument(hud) {
  hud.__boxes = [];
  hud.__tag = null;
  const push = (x, y, w, h) => {
    if (!hud.__tag || w <= 0 || h <= 0) return;
    hud.__boxes.push({ tag: hud.__tag, x0: x, y0: y, x1: x + w, y1: y + h });
  };
  const rect = hud.rect.bind(hud);
  hud.rect = (x, y, w, h, c) => { push(x, y, w, h); rect(x, y, w, h, c); };
  const frame = hud.frame.bind(hud);
  hud.frame = (x, y, w, h, c) => { push(x, y, w, h); frame(x, y, w, h, c); };
  const sprite = hud.sprite.bind(hud);
  hud.sprite = (rows, x, y, s, c) => { push(x, y, rows[0].length * s, rows.length * s); sprite(rows, x, y, s, c); };
  const silhouette = hud.silhouette.bind(hud);
  hud.silhouette = (id, x, y, w, h, options) => {
    push(x, y, w, h);
    return silhouette(id, x, y, w, h, options);
  };
  const text = hud.text.bind(hud);
  hud.text = (str, x, y, o = {}) => {
    const sc = o.scale || 1;
    const w = textWidth(String(str), sc);
    const px = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    push(px, y, w, 7 * sc);
    return text(str, x, y, o);
  };
  return hud;
}

const state = (mode, alive) => ({
  mode, gameType: ['rooms', 'paused', 'votekick'].includes(mode) ? 'pvp' : 'pve',
  camera, yaw: 1.2, fps: 60, showScoreboard: false, mapName: 'THE FACILITY',
  hitDirections: [], crosshairHot: false,
  player: {
    team: 'blue',
    health: 100, maxHealth: 100, armor: 50, maxArmor: 50, alive,
    crouching: false, sprinting: false, sliding: true,
    killedBy: { name: 'KILO-3' }, killedByWeapon: 'sniper', respawnIn: 3,
  },
  weapon: {
    id: 'smg', name: 'WASP-9', cls: 'SUBMACHINE GUN', mag: 32, magSize: 32, reserve: 224,
    reloading: true, reloadProgress: 0.4, adsBlend: 0, scoped: false, fireMode: 'AUTO',
  },
  match: { blueTickets: 42, redTickets: 51, maxTickets: 60, winner: 'blue' },
  score: { total: 125000, kills: 9, deaths: 4 },
  passive: { icon: 'wing', hudName: 'LIGHTWEIGHT' },
  streaks: {
    uav: 1, strike: 2, uavTime: 0, sentry: 1, sentryHp: 0, cas: 1,
    slots: ['uav', 'strike', 'sentry'],
  },
  enemyTarget: {
    id: 'enemy-vitals', team: 'red',
    health: 72, maxHealth: 100, armor: 24, maxArmor: 50,
    x: 0, y: 2.1, z: -10,
  },
  teammates: [
    { id: 'near', name: 'ALPHA-2', team: 'blue', x: 0, y: 2, z: -10, visible: true, showName: true },
    { id: 'right', name: 'ALPHA-3', team: 'blue', x: 2, y: 2, z: -10, visible: true, showName: false },
    { id: 'behind', name: 'ALPHA-4', team: 'blue', x: -8, y: 2, z: 12, visible: false, showName: true },
    // Defensive HUD filtering: enemy data must never become a nameplate.
    { id: 'enemy', name: 'KILO-1', team: 'red', x: 0, y: 2, z: -8, visible: true, showName: true },
  ],
  scoreboard: [{ name: 'YOU', team: 'blue', kills: 9, deaths: 4, score: 1250, isPlayer: true, alive: true }],
  rooms: Array.from({ length: 5 }, (_, i) => ({
    id: `room-${i + 1}`, number: i + 1, players: i * 2, capacity: 12,
  })),
  voteKick: null,
  voteKickCooldown: 0,
  voteKickPlayers: Array.from({ length: 11 }, (_, i) => ({
    id: `remote-${i + 1}`,
    name: `PLAYER-${String(i + 1).padStart(2, '0')}`,
    team: i % 2 ? 'red' : 'blue',
  })),
  network: {
    status: 'online',
    latency: 32,
    playerId: 'local-player',
    playerName: 'PLAYER-1234',
    room: { number: 1 },
    banUntil: 0,
  },
});

// element groups that must stay out of each other's way
const GROUPS = [
  ['compass', (h, s) => h.drawCompass(s)],
  ['tickets', (h, s) => h.drawTickets(s)],
  ['killfeed', (h, s) => h.drawKillfeed(s)],
  ['scores', (h, s) => h.drawScorePopups(s)],
  ['streaks', (h, s) => h.drawStreaks(s)],
  ['ping', (h, s) => h.drawNetworkLatency({ ...s, gameType: 'pvp' })],
  ['passive', (h, s) => h.drawPassive(s)],
  ['health', (h, s) => h.drawHealth(s)],
  ['ammo', (h, s) => h.drawAmmo(s)],
  ['reload', (h, s) => h.drawReloadStatus(s)],
  ['banners', (h, s) => h.drawBanners(s)],
  ['fps', (h) => h.text('60 FPS', h.w - 4, 3, { scale: 1, align: 'right' })],
];

let problems = 0;
for (const [W, H] of [[480, 270], [320, 180], [960, 540], [360, 270], [640, 270], [240, 180]]) {
  const hud = instrument(new Hud(makeCanvas(W, H), settings));
  hud.resize(W, H);
  for (let i = 0; i < 6; i++) {
    hud.pushKill({ killer: 'ALPHA-' + i, victim: 'KILO-' + i, killerTeam: 'blue', victimTeam: 'red', weapon: 'rifle', headshot: true, highlight: true });
  }
  for (let i = 0; i < 7; i++) {
    hud.pushScore(50 + i * 10, i % 2 ? 'HEADSHOT' : 'KILL');
  }
  hud.banner('DOUBLE KILL', 'NICE WORK', 2);
  const s = state('playing', true);
  hud.ctx.clearRect(0, 0, W, H);
  for (const [tag, fn] of GROUPS) { hud.__tag = tag; fn(hud, s); }
  hud.__tag = null;

  const bounds = new Map();
  for (const b of hud.__boxes) {
    const cur = bounds.get(b.tag);
    if (!cur) bounds.set(b.tag, { ...b });
    else {
      cur.x0 = Math.min(cur.x0, b.x0); cur.y0 = Math.min(cur.y0, b.y0);
      cur.x1 = Math.max(cur.x1, b.x1); cur.y1 = Math.max(cur.y1, b.y1);
    }
  }
  const names = [...bounds.keys()];
  const hits = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = bounds.get(names[i]), b = bounds.get(names[j]);
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 0.5 && oy > 0.5) hits.push(`${names[i]} x ${names[j]} (${ox.toFixed(0)}x${oy.toFixed(0)}px)`);
    }
  }
  // anything drawn off-screen is just as broken as an overlap
  const off = [];
  for (const [tag, b] of bounds) {
    if (b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > W + 0.5 || b.y1 > H + 0.5) {
      off.push(`${tag} [${b.x0.toFixed(0)},${b.y0.toFixed(0)} .. ${b.x1.toFixed(0)},${b.y1.toFixed(0)}]`);
    }
  }
  console.log(`${W}x${H}: ${hits.length ? 'OVERLAP ' + hits.join(', ') : 'clear'}${off.length ? ' | OFFSCREEN ' + off.join(', ') : ''}`);
  problems += hits.length + off.length;
}

// The old verbose centre combat card and rank strip stay retired. The original
// crosshair-adjacent score stack and the new compact icon must remain available.
const retiredHud = new Hud(makeCanvas(960, 540), settings);
if (['pushKillCard', 'drawKillCard', 'drawRankStrip']
  .some((method) => typeof retiredHud[method] === 'function')) {
  console.log('  ! retired verbose kill card or rank HUD methods are still present');
  problems++;
}
if (['pushScore', 'drawScorePopups', 'pushKillIcon', 'drawKillIcon']
  .some((method) => typeof retiredHud[method] !== 'function')) {
  console.log('  ! restored score feedback or compact kill icon is missing');
  problems++;
}

const feedbackHud = new Hud(makeCanvas(480, 270), settings);
feedbackHud.resize(480, 270);
const feedbackLabels = [];
const feedbackSprites = [];
feedbackHud.text = (str) => feedbackLabels.push(String(str));
feedbackHud.sprite = (rows, x, y, scale, color) => {
  feedbackSprites.push({ rows, x, y, scale, color });
};
feedbackHud.pushScore(100, 'KILL');
feedbackHud.pushScore(50, 'HEADSHOT');
feedbackHud.drawScorePopups(state('playing', true));
feedbackHud.pushKillIcon(true);
feedbackHud.drawKillIcon(state('playing', true));
if (feedbackLabels.join(',') !== '+50,HEADSHOT,+100,KILL'
  || feedbackSprites.length !== 2
  || feedbackSprites.some((entry) => entry.rows !== feedbackSprites[0].rows)) {
  console.log(`  ! score stack or compact kill icon rendering failed: ${JSON.stringify({
    labels: feedbackLabels,
    spriteCount: feedbackSprites.length,
  })}`);
  problems++;
}
feedbackHud.update(1.21);
if (feedbackHud.killIcon) {
  console.log('  ! compact kill icon did not expire');
  problems++;
}

const contributionHud = new Hud(makeCanvas(480, 270), settings);
contributionHud.resize(480, 270);
const contributionLabels = [];
contributionHud.text = (str, x, y, opts = {}) => {
  contributionLabels.push({ str: String(str), x, y, opts });
};
contributionHud.banner('UAV ONLINE', 'ALPHA-2 USED UAV', 2.4, '#7de08a');
contributionHud.drawBanners(state('playing', true));
if (contributionLabels.length !== 2
  || contributionLabels[0].str !== 'UAV ONLINE'
  || contributionLabels[1].str !== 'ALPHA-2 USED UAV'
  || contributionLabels[1].y <= contributionLabels[0].y
  || contributionLabels.some((entry) => entry.opts.align !== 'center')) {
  console.log(`  ! PVP contribution subtitle did not render beneath its title: ${
    JSON.stringify(contributionLabels)
  }`);
  problems++;
}

// Tablet map must render finite geometry at the smallest supported canvas.
const tabletHud = new Hud(makeCanvas(240, 180), settings);
tabletHud.resize(240, 180);
tabletHud.drawCasTablet({
  phase: 'end',
  cursor: { x: 26, z: 8 },
  start: { x: -26, z: 8 },
  end: { x: 26, z: 8 },
  bounds: { x: 79.4, z: 65.4 },
  width: 26,
  px: 0,
  pz: 24,
  yaw: 0.4,
  enemies: [{ x: -8, z: 2 }, { x: 17, z: -11 }],
});
tabletHud.drawMissileTablet({ type: 'strike', progress: 0.58, committed: false });
tabletHud.drawMissileTablet({ type: 'strike', progress: 0.82, committed: true });

// PVP-only latency readout: rounded RTT in the top-left with severity colors.
const pingHud = new Hud(makeCanvas(480, 270), settings);
pingHud.resize(480, 270);
const pingLabels = [];
pingHud.text = (str, x, y, opts = {}) => pingLabels.push({
  str: String(str), x, y, color: opts.color,
});
const pingState = state('playing', true);
pingState.gameType = 'pvp';
pingState.network.latency = 32.4;
pingHud.drawNetworkLatency(pingState);
pingState.network.latency = 88.7;
pingHud.drawNetworkLatency(pingState);
pingState.network.latency = 156.2;
pingHud.drawNetworkLatency(pingState);
pingState.gameType = 'pve';
pingHud.drawNetworkLatency(pingState);
if (pingLabels.length !== 3
  || pingLabels[0].str !== 'PING 32 MS' || pingLabels[0].x !== 4 || pingLabels[0].y !== 3
  || pingLabels[0].color !== '#7de08a'
  || pingLabels[1].str !== 'PING 89 MS' || pingLabels[1].color !== '#ffcc55'
  || pingLabels[2].str !== 'PING 156 MS' || pingLabels[2].color !== '#ff5b4c') {
  console.log(`  ! PVP latency readout failed: ${JSON.stringify(pingLabels)}`);
  problems++;
}
const narrowPingHud = new Hud(makeCanvas(240, 180), settings);
narrowPingHud.resize(240, 180);
let narrowPing = null;
narrowPingHud.text = (str, x, y) => { narrowPing = { str: String(str), x, y }; };
narrowPingHud.drawNetworkLatency({ ...state('playing', true), gameType: 'pvp' });
if (narrowPing?.str !== '32MS' || narrowPing.x !== 4 || narrowPing.y !== 3) {
  console.log(`  ! narrow PVP latency readout did not use the compact form: ${JSON.stringify(narrowPing)}`);
  problems++;
}

// The contested crate prompt stays centred and exposes both the exact control
// and a real half-second progress state. The reward inventory must also render
// from its selected dynamic hotkey rather than being hard-coded to one slot.
const jugHud = new Hud(makeCanvas(480, 270), settings);
jugHud.resize(480, 270);
const jugLabels = [];
const jugRects = [];
const jugFrames = [];
const jugSilhouettes = [];
jugHud.text = (str, x, y, opts = {}) => {
  jugLabels.push({ str: String(str), x, y, color: opts.color });
};
jugHud.rect = (x, y, w, h, color) => { jugRects.push({ x, y, w, h, color }); };
jugHud.frame = (x, y, w, h, color) => { jugFrames.push({ x, y, w, h, color }); };
jugHud.silhouette = (id, x, y, w, h, options) => {
  jugSilhouettes.push({ id, x, y, w, h, options });
};
const jugState = state('playing', true);
jugState.airdropInteraction = {
  id: 'drop-1',
  holding: true,
  stationary: true,
  progress: 0.5,
};
jugState.streaks = {
  juggernaut: 1,
  slots: ['uav', 'strike', 'juggernaut'],
};
jugHud.drawAirdropInteraction(jugState);
jugHud.drawStreaks(jugState);
if (!jugLabels.some((entry) => entry.str === 'HOLD E - CLAIM JUGGERNAUT')
  || !jugLabels.some((entry) => entry.str === '7')
  || jugSilhouettes.length !== 3
  || jugSilhouettes[2]?.id !== 'juggernaut'
  || !jugFrames.some((frame) => frame.color === '#7de08a')
  || !jugRects.some((rect) => rect.w >= 45 && rect.w <= 50)) {
  console.log(`  ! Juggernaut prompt or silhouette reward rack failed: ${JSON.stringify({
    labels: jugLabels,
    icons: jugSilhouettes,
    frames: jugFrames,
  })}`);
  problems++;
}

// Every in-match equipment surface must request the shared silhouette artwork:
// weapon/ammo, killfeed, death card and the three carried streak blocks.
const iconHud = new Hud(makeCanvas(480, 270), settings);
iconHud.resize(480, 270);
const iconCalls = [];
iconHud.silhouette = (id, x, y, w, h, options) => {
  iconCalls.push({ id, x, y, w, h, options });
};
const iconState = state('playing', true);
iconHud.drawAmmo(iconState);
iconHud.pushKill({
  killer: 'ALPHA-1',
  victim: 'KILO-2',
  killerTeam: 'blue',
  victimTeam: 'red',
  weapon: 'rifle',
  headshot: false,
});
iconHud.drawKillfeed(iconState);
iconState.player.alive = false;
iconState.player.killedByWeapon = 'sniper';
iconHud.drawDeath(iconState);
iconHud.drawStreaks(iconState);
const requestedIcons = iconCalls.map((entry) => entry.id);
if (!['smg', 'rifle', 'sniper', 'uav', 'strike', 'sentry']
  .every((id) => requestedIcons.includes(id))) {
  console.log(`  ! shared in-match silhouettes are incomplete: ${JSON.stringify(requestedIcons)}`);
  problems++;
}

// Shared silhouettes are much wider than the old glyphs. Audit the internal
// ammo layout separately so no weapon shape can enter the magazine, reserve,
// pip or metadata boxes at any supported HUD scale.
const ammoOverlap = (a, b) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5
    && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
const ammoWeapons = [
  ...Object.values(WEAPON_DEFS).map((def) => ({
    id: def.id,
    name: def.name,
    cls: def.cls,
    mag: def.melee ? 0 : Math.min(def.mag, 12),
    magSize: def.melee ? 0 : def.mag,
    reserve: def.melee ? 0 : def.reserve,
    melee: Boolean(def.melee),
    grenade: false,
    reloading: false,
    fireMode: def.melee ? 'LMB SLASH' : def.auto ? 'AUTO' : 'SEMI',
  })),
  {
    id: 'incendiary',
    name: 'INCENDIARY GRENADE',
    cls: 'LETHAL',
    mag: 2,
    magSize: 2,
    reserve: 0,
    melee: false,
    grenade: true,
    reloading: false,
    fireMode: 'LMB THROW / RMB AIM',
  },
];
for (const [W, H] of [[240, 180], [480, 270], [960, 540]]) {
  for (const weapon of ammoWeapons) {
    const ammoHud = new Hud(makeCanvas(W, H), settings);
    ammoHud.resize(W, H);
    const boxes = [];
    ammoHud.text = (str, x, y, options = {}) => {
      const scale = options.scale || 1;
      const width = textWidth(String(str), scale);
      const left = options.align === 'right'
        ? x - width
        : options.align === 'center' ? x - width / 2 : x;
      boxes.push({ kind: 'text', label: String(str), x: left, y, w: width, h: 7 * scale });
    };
    ammoHud.rect = (x, y, w, h) => boxes.push({ kind: 'pip', x, y, w, h });
    ammoHud.silhouette = (id, x, y, w, h) =>
      boxes.push({ kind: 'silhouette', label: id, x, y, w, h });
    ammoHud.drawAmmo({ weapon });
    const silhouette = boxes.find((box) => box.kind === 'silhouette');
    const overlap = silhouette && boxes.some((box) =>
      box !== silhouette && ammoOverlap(silhouette, box));
    const offscreen = boxes.some((box) =>
      box.x < -0.5 || box.y < -0.5 || box.x + box.w > W + 0.5 || box.y + box.h > H + 0.5);
    if (!silhouette || overlap || offscreen) {
      console.log(`  ! ammo silhouette layout failed for ${weapon.id} at ${W}x${H}: ${JSON.stringify(boxes)}`);
      problems++;
    }
  }
}

// The first-person bomb-suit helmet is a real, moving interior silhouette:
// it must render only for the living local Juggernaut and keep a large central
// aperture rather than covering the targeting area.
const helmetHud = new Hud(makeCanvas(480, 270), settings);
helmetHud.resize(480, 270);
const helmetCtx = helmetHud.ctx;
let helmetPolygons = 0;
let helmetRects = 0;
const originalHelmetFill = helmetCtx.fill.bind(helmetCtx);
const originalHelmetRect = helmetCtx.fillRect.bind(helmetCtx);
helmetCtx.fill = () => {
  helmetPolygons++;
  originalHelmetFill();
};
helmetCtx.fillRect = (x, y, w, h) => {
  helmetRects++;
  originalHelmetRect(x, y, w, h);
};
const validateHelmetPoint = (fn) => (x, y) => {
  if (![x, y].every(Number.isFinite)) throw new Error(`helmet path got NaN: ${x},${y}`);
  fn(x, y);
};
helmetCtx.moveTo = validateHelmetPoint(helmetCtx.moveTo.bind(helmetCtx));
helmetCtx.lineTo = validateHelmetPoint(helmetCtx.lineTo.bind(helmetCtx));
const helmetState = state('playing', true);
helmetState.player.juggernaut = true;
helmetState.player.speed2D = 5.2;
helmetState.player.sprinting = true;
helmetHud.update(0.37);
helmetHud.drawJuggernautHelmet(helmetState);
const renderedHelmet = helmetPolygons >= 7 && helmetRects >= 3;
const callsBeforeHiddenTest = helmetPolygons + helmetRects;
helmetState.player.juggernaut = false;
helmetHud.drawJuggernautHelmet(helmetState);
if (!renderedHelmet || helmetPolygons + helmetRects !== callsBeforeHiddenTest) {
  console.log(`  ! Juggernaut first-person helmet gating failed: ${helmetPolygons} polygons, ${helmetRects} rects`);
  problems++;
}

// menu screens: every button must be fully on screen
for (const [W, H] of [[480, 270], [320, 180], [960, 540], [240, 180]]) {
  const hud = new Hud(makeCanvas(W, H), settings);
  hud.resize(W, H);
  for (const mode of ['title', 'rooms', 'paused', 'votekick', 'settings', 'gameover']) {
    hud.render(state(mode, true));
    for (const b of hud.buttons) {
      if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H) {
        console.log(`  ! ${mode} ${W}x${H}: button ${b.id} off screen (${b.x},${b.y},${b.w},${b.h})`);
        problems++;
      }
    }
    // buttons must not overlap each other either
    for (let i = 0; i < hud.buttons.length; i++) {
      for (let j = i + 1; j < hud.buttons.length; j++) {
        const a = hud.buttons[i], b = hud.buttons[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          console.log(`  ! ${mode} ${W}x${H}: buttons ${a.id} and ${b.id} overlap`);
          problems++;
        }
      }
    }
  }
}

const pvePauseHud = new Hud(makeCanvas(480, 270), settings);
pvePauseHud.resize(480, 270);
const pvePauseState = state('paused', true);
pvePauseState.gameType = 'pve';
pvePauseHud.render(pvePauseState);
if (!pvePauseHud.buttons.some((button) => button.id === 'restart')
  || !pvePauseHud.buttons.some((button) => button.id === 'return-title')) {
  console.log('  ! PVE pause menu is missing restart or back-to-menu');
  problems++;
}

// Teammate-marker regression: visible friendlies always get diamond pixels,
// but only the one nearest the reticle gets plain name text. Offscreen,
// occluded and enemy entries must not leak a label.
const markerLabels = (s) => {
  const hud = new Hud(makeCanvas(480, 270), settings);
  hud.resize(480, 270);
  const labels = [];
  let frames = 0;
  const colors = [];
  const shadows = [];
  const rectColors = [];
  hud.text = (str, x, y, opts = {}) => {
    labels.push(String(str));
    colors.push(opts.color);
    shadows.push(opts.shadow);
  };
  hud.rect = (x, y, w, h, color) => { rectColors.push(color); };
  hud.frame = () => { frames++; };
  hud.drawTeammateMarkers(s);
  return { labels, frames, colors, shadows, rectColors };
};
const blueMarkers = markerLabels(state('playing', true));
if (blueMarkers.labels.join(',') !== 'ALPHA-2' || blueMarkers.frames !== 0
  || blueMarkers.colors[0] !== '#8ed8ff' || blueMarkers.shadows[0] !== false
  || blueMarkers.rectColors.length !== 16
  || blueMarkers.rectColors.some((color) => !String(color).startsWith('#'))) {
  console.log(`  ! blue teammate marker filtering failed: ${blueMarkers.labels.join(', ')}`);
  problems++;
}
const redState = state('playing', true);
redState.player.team = 'red';
const redMarkers = markerLabels(redState);
if (redMarkers.labels.join(',') !== 'KILO-1' || redMarkers.frames !== 0
  || redMarkers.colors[0] !== '#8ed8ff' || redMarkers.shadows[0] !== false
  || redMarkers.rectColors.length !== 8
  || redMarkers.rectColors.some((color) => !String(color).startsWith('#'))) {
  console.log(`  ! red teammate marker filtering failed: ${redMarkers.labels.join(', ')}`);
  problems++;
}

// Friendly sentries use one through-wall blue shield containing the shared
// sentry silhouette. Enemy sentries never receive that locator.
const sentryMarkerHud = new Hud(makeCanvas(480, 270), settings);
sentryMarkerHud.resize(480, 270);
const sentryMarkerState = state('playing', true);
sentryMarkerState.sentryMarkers = [
  { id: 'friendly-sentry', team: 'blue', x: 0, y: 1.2, z: -10 },
  { id: 'enemy-sentry', team: 'red', x: 1, y: 1.2, z: -10 },
];
const sentryMarkerIcons = [];
const sentryMarkerFills = [];
const sentryMarkerStrokes = [];
sentryMarkerHud.silhouette = (id, x, y, w, h, options) => {
  sentryMarkerIcons.push({ id, x, y, w, h, options });
};
sentryMarkerHud.ctx.fill = () => {
  sentryMarkerFills.push(sentryMarkerHud.ctx.fillStyle);
};
sentryMarkerHud.ctx.stroke = () => {
  sentryMarkerStrokes.push(sentryMarkerHud.ctx.strokeStyle);
};
sentryMarkerHud.drawSentryMarkers(sentryMarkerState);
if (sentryMarkerIcons.length !== 1
  || sentryMarkerIcons[0].id !== 'sentry'
  || sentryMarkerFills[0] !== 'rgba(24,112,190,0.82)'
  || !sentryMarkerStrokes.includes('rgba(0,0,0,0.92)')
  || !sentryMarkerStrokes.includes('#8ed8ff')) {
  console.log(`  ! friendly sentry shield marker failed: ${JSON.stringify({
    icons: sentryMarkerIcons,
    fills: sentryMarkerFills,
    strokes: sentryMarkerStrokes,
  })}`);
  problems++;
}
const nearSentryWidth = sentryMarkerIcons[0]?.w || 0;
sentryMarkerIcons.length = 0;
const distantSentryState = state('playing', true);
distantSentryState.sentryMarkers = [
  { id: 'distant-friendly-sentry', team: 'blue', x: 0, y: 1.2, z: -90 },
];
sentryMarkerHud.drawSentryMarkers(distantSentryState);
if (sentryMarkerIcons.length !== 1
  || sentryMarkerIcons[0].w >= nearSentryWidth * 0.65) {
  console.log(`  ! distant sentry marker did not shrink enough: ${JSON.stringify({
    near: nearSentryWidth,
    far: sentryMarkerIcons[0]?.w,
  })}`);
  problems++;
}

// Enemy-vitals regression: health/armor reduction and shatter motion all run
// at half their former speed, while the white trail remains behind the red.
const vitalHud = new Hud(makeCanvas(480, 270), settings);
vitalHud.resize(480, 270);
const vitalState = state('playing', true);
vitalState.enemyTarget = {
  id: 'vital-test', team: 'red',
  health: 100, maxHealth: 100, armor: 50, maxArmor: 50,
  x: 0, y: 2.1, z: -10,
};
vitalHud.drawEnemyVitals(vitalState);
vitalState.enemyTarget = { ...vitalState.enemyTarget, health: 60, armor: 0 };
vitalHud.drawEnemyVitals(vitalState);
const shardLife = vitalHud.enemyVitalStates.get('vital-test').shards[0].t;
vitalHud.update(0.06);
const vitalAnim = vitalHud.enemyVitalStates.get('vital-test');
if (!vitalAnim || vitalAnim.breakT <= 0 || vitalAnim.shards.length === 0
  || vitalAnim.trailHealth <= vitalAnim.healthVisual
  || vitalAnim.healthVisual < 78 || vitalAnim.armorVisual < 25
  || vitalAnim.breakT < 0.515
  || shardLife - vitalAnim.shards[0].t > 0.035) {
  console.log('  ! enemy health/armor transition animation failed');
  problems++;
}

// Once the lethal zero snapshot has arrived, the bars and armor fragments
// keep animating even after the target is no longer selected.
const deathHud = new Hud(makeCanvas(480, 270), settings);
deathHud.resize(480, 270);
const deathState = state('playing', true);
deathState.enemyTarget = {
  id: 'death-vital', team: 'red',
  health: 100, maxHealth: 100, armor: 50, maxArmor: 50,
  x: 0, y: 2.1, z: -10,
};
deathHud.drawEnemyVitals(deathState);
deathState.enemyTarget = { ...deathState.enemyTarget, health: 0, armor: 0, dead: true };
deathHud.drawEnemyVitals(deathState);
deathState.enemyTarget = null;
deathHud.drawEnemyVitals(deathState);
deathHud.update(0.1);
const deathAnim = deathHud.enemyVitalStates.get('death-vital');
if (!deathAnim || deathAnim.healthVisual <= 0 || deathAnim.healthVisual >= 100
  || deathAnim.armorVisual <= 0 || deathAnim.armorVisual >= 50
  || deathAnim.breakT <= 0 || deathAnim.shards.length === 0) {
  console.log('  ! lethal enemy-vitals animation did not persist');
  problems++;
}

// Two instant kills can be registered together even when neither target lived
// long enough to be sampled by the network-rate reticle scan. Both bars must start
// from their authoritative pre-hit values and animate independently.
const rapidHud = new Hud(makeCanvas(480, 270), settings);
rapidHud.resize(480, 270);
const rapidState = state('playing', true);
rapidState.enemyTarget = null;
rapidState.enemyTargets = [
  {
    id: 'rapid-a', team: 'red',
    health: 0, maxHealth: 100, armor: 0, maxArmor: 50,
    initialHealth: 100, initialArmor: 50,
    x: -1.2, y: 2.1, z: -10, dead: true,
  },
  {
    id: 'rapid-b', team: 'red',
    health: 0, maxHealth: 100, armor: 0, maxArmor: 50,
    initialHealth: 100, initialArmor: 50,
    x: 1.2, y: 2.1, z: -10, dead: true,
  },
];
rapidHud.drawEnemyVitals(rapidState);
rapidHud.update(0.1);
const rapidA = rapidHud.enemyVitalStates.get('rapid-a');
const rapidB = rapidHud.enemyVitalStates.get('rapid-b');
if (rapidHud.enemyVitalActiveIds.size !== 2
  || !rapidA || !rapidB
  || rapidA.healthVisual <= 0 || rapidA.healthVisual >= 100
  || rapidB.healthVisual <= 0 || rapidB.healthVisual >= 100
  || rapidA.armorVisual <= 0 || rapidA.armorVisual >= 50
  || rapidB.armorVisual <= 0 || rapidB.armorVisual >= 50
  || rapidA.shards.length === 0 || rapidB.shards.length === 0) {
  console.log('  ! rapid consecutive kills did not retain two enemy vital animations');
  problems++;
}

// A red-side client still sees its own ticket bar and killfeed names in blue.
const perspectiveHud = new Hud(makeCanvas(480, 270), settings);
perspectiveHud.resize(480, 270);
const perspectiveState = state('playing', true);
perspectiveState.player.team = 'red';
const ticketBars = [];
perspectiveHud.bar = (x, y, w, h, pct, color) => { ticketBars.push({ pct, color }); };
perspectiveHud.text = () => {};
perspectiveHud.drawTickets(perspectiveState);
if (Math.abs(ticketBars[0].pct - 51 / 60) > 0.0001 || ticketBars[0].color !== '#4fa3ff'
  || Math.abs(ticketBars[1].pct - 42 / 60) > 0.0001 || ticketBars[1].color !== '#ff5b4c') {
  console.log('  ! red-side ticket perspective colors failed');
  problems++;
}
const outcomeLabels = [];
perspectiveHud.text = (str) => { outcomeLabels.push(String(str)); };
perspectiveState.match.winner = 'red';
perspectiveHud.drawGameOver(perspectiveState);
if (!outcomeLabels.includes('VICTORY')) {
  console.log('  ! red-side victory perspective failed');
  problems++;
}

// ESC vote-kick selection exposes every other room member, while the live
// prompt clearly distinguishes an eligible voter from the target.
const voteMenuHud = new Hud(makeCanvas(320, 180), settings);
voteMenuHud.resize(320, 180);
voteMenuHud.render(state('votekick', true));
if (voteMenuHud.buttons.filter((button) => button.id.startsWith('vote-kick-player:')).length !== 11
  || !voteMenuHud.buttons.some((button) => button.id === 'vote-kick-back')) {
  console.log('  ! vote-kick player selection menu is incomplete');
  problems++;
}
const votePromptHud = new Hud(makeCanvas(320, 180), settings);
votePromptHud.resize(320, 180);
const voteLabels = [];
votePromptHud.text = (str) => { voteLabels.push(String(str)); };
const promptState = state('playing', true);
promptState.voteKick = {
  targetId: 'remote-1',
  targetName: 'PLAYER-01',
  initiatorName: 'PLAYER-02',
  yes: 2,
  no: 1,
  required: 4,
  endsAt: Date.now() + 30000,
  yourVote: null,
  canVote: true,
};
votePromptHud.drawVoteKickPrompt(promptState);
if (!voteLabels.includes('PRESS Y = YES     N = NO')) {
  console.log('  ! eligible vote-kick prompt does not expose Y/N controls');
  problems++;
}
voteLabels.length = 0;
promptState.voteKick.canVote = false;
promptState.network.playerId = 'remote-1';
votePromptHud.drawVoteKickPrompt(promptState);
if (!voteLabels.includes('YOU ARE THE TARGET')) {
  console.log('  ! vote-kick target state is not identified');
  problems++;
}

// Warhead camera overlay. It replaces the crosshair while flying a TV missile,
// so it has to draw at every resolution and stay inside the frame - the whole
// picture is the operator's only instrument.
for (const [W, H] of [[480, 270], [320, 180], [960, 540], [240, 180]]) {
  for (const diving of [false, true]) {
    const camHud = instrument(new Hud(makeCanvas(W, H), settings));
    camHud.resize(W, H);
    const camState = {
      ...state('playing', true),
      missileCam: {
        altitude: 61.5,
        diving,
        speed: 34,
        x: 12,
        z: -4,
        targets: [
          { id: 'enemy-a', x: -1.5, y: -0.9, z: -10, height: 1.8, radius: 0.46 },
          { id: 'enemy-b', x: 2, y: -0.9, z: -14, height: 1.8, radius: 0.46 },
        ],
      },
    };
    camHud.__tag = 'missilecam';
    camHud.drawMissileCam(camState);
    camHud.__tag = null;
    if (!camHud.__boxes.length) {
      console.log(`  ! warhead camera drew nothing at ${W}x${H} (diving=${diving})`);
      problems++;
      continue;
    }
    const off = camHud.__boxes.filter((b) =>
      b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > W + 0.5 || b.y1 > H + 0.5);
    if (off.length) {
      console.log(`  ! warhead camera draws offscreen at ${W}x${H} (diving=${diving})`);
      problems++;
    }
  }
}

const camLabels = [];
const camLabelHud = new Hud(makeCanvas(480, 270), settings);
camLabelHud.resize(480, 270);
camLabelHud.text = (str) => camLabels.push(String(str));
camLabelHud.drawMissileCam({
  ...state('playing', true),
  missileCam: { altitude: 61.5, diving: true, speed: 78, x: 0, z: 0 },
});
if (!camLabels.includes('TERMINAL')) {
  console.log('  ! committed dive is not called out to the operator');
  problems++;
}
if (!camLabels.some((label) => label.startsWith('ALT '))) {
  console.log('  ! warhead camera does not report altitude');
  problems++;
}

const targetHud = new Hud(makeCanvas(480, 270), settings);
targetHud.resize(480, 270);
const targetFrames = [];
const targetFrame = targetHud.frame.bind(targetHud);
targetHud.frame = (x, y, w, h, color) => {
  if (color === '#ff5b4c') targetFrames.push({ x, y, w, h });
  targetFrame(x, y, w, h, color);
};
targetHud.drawMissileTargets({
  ...state('playing', true),
  missileCam: {
    targets: [
      { id: 'enemy-a', x: -1.5, y: -0.9, z: -10, height: 1.8, radius: 0.46 },
      { id: 'enemy-b', x: 2, y: -0.9, z: -14, height: 1.8, radius: 0.46 },
    ],
  },
});
if (targetFrames.length !== 2
  || targetFrames.some((box) => box.w < 10 || box.h < 10
    || box.x < 0 || box.y < 0 || box.x + box.w > 480 || box.y + box.h > 270)) {
  console.log('  ! warhead hostile boxes are missing, too small or offscreen');
  problems++;
}

// Hold-Q killstreak wheel. It deliberately overlays the normal HUD, so it is
// audited separately from the non-overlap groups above.
for (const [W, H] of [[480, 270], [320, 180], [960, 540], [240, 180]]) {
  const wheelHud = instrument(new Hud(makeCanvas(W, H), settings));
  wheelHud.resize(W, H);
  const wheelState = {
    ...state('playing', true),
    streakWheel: {
      open: true,
      selected: 1,
      cursorX: 0.82,
      cursorY: 0.47,
      slots: ['uav', 'strike', 'sentry'],
      available: [true, false, true],
    },
  };
  wheelHud.__tag = 'streakwheel';
  wheelHud.drawStreakWheel(wheelState);
  wheelHud.__tag = null;
  const offscreen = wheelHud.__boxes.filter((box) =>
    box.x0 < -0.5 || box.y0 < -0.5
      || box.x1 > W + 0.5 || box.y1 > H + 0.5);
  if (offscreen.length) {
    console.log(`  ! killstreak wheel draws offscreen at ${W}x${H}`);
    problems++;
  }
}

const wheelLabels = [];
const wheelIcons = [];
const wheelLabelHud = new Hud(makeCanvas(480, 270), settings);
wheelLabelHud.resize(480, 270);
wheelLabelHud.text = (str) => wheelLabels.push(String(str));
wheelLabelHud.silhouette = (id) => wheelIcons.push(String(id));
wheelLabelHud.drawStreakWheel({
  ...state('playing', true),
  streakWheel: {
    open: true,
    selected: 1,
    cursorX: 0.8,
    cursorY: 0.45,
    slots: ['uav', 'strike', 'sentry'],
    available: [true, false, true],
  },
});
if (!wheelLabels.includes('KILLSTREAK WHEEL')
  || !wheelLabels.includes('TV MISSILE')
  || !wheelLabels.includes('UNAVAILABLE')
  || !['5', '6', '7'].every((key) => wheelLabels.includes(key))
  || wheelIcons.join(',') !== 'uav,strike,sentry') {
  console.log('  ! killstreak wheel is missing its slots, keys or unavailable feedback');
  problems++;
}
wheelLabels.length = 0;
wheelLabelHud.drawStreakWheel({
  ...state('playing', true),
  streakWheel: {
    open: true,
    selected: 0,
    cursorX: 0,
    cursorY: -0.8,
    slots: ['uav', 'strike', 'sentry'],
    available: [true, false, true],
  },
});
if (!wheelLabels.includes('RELEASE Q TO USE')) {
  console.log('  ! available killstreak selection does not expose release-to-use feedback');
  problems++;
}

// Reward-ready cards are one-at-a-time FIFO notifications. Each card holds
// fully visible for one second, fades, and only then starts the next card (and
// its audio callback). It contains exactly one silhouette and one title.
const readyHud = new Hud(makeCanvas(480, 270), settings);
readyHud.resize(480, 270);
const readyShown = [];
const readyLabels = [];
const readyIcons = [];
readyHud.onStreakReadyShown = (entry) => readyShown.push(entry.id);
readyHud.text = (str) => readyLabels.push(String(str));
readyHud.silhouette = (id) => readyIcons.push(String(id));
readyHud.pushStreakReady('uav', 'UAV READY', '#7de08a');
readyHud.pushStreakReady('strike', 'MISSILE STRIKE READY', '#ffcc55');
readyHud.pushStreakReady('sentry', 'SENTRY GUN READY', '#8ecbff');
readyHud.drawStreakReady(state('playing', true));
if (readyHud.streakReady?.id !== 'uav'
  || readyHud.streakReadyQueue.map((entry) => entry.id).join(',') !== 'strike,sentry'
  || readyShown.join(',') !== 'uav'
  || readyIcons.join(',') !== 'uav'
  || readyLabels.join(',') !== 'UAV READY') {
  console.log('  ! killstreak-ready card did not start as a single FIFO item');
  problems++;
}
readyHud.update(1);
if (readyHud.streakReady?.id !== 'uav') {
  console.log('  ! killstreak-ready card began dequeuing before its one-second hold');
  problems++;
}
readyHud.update(0.2);
const fadeAlpha = [];
readyHud.rect = () => fadeAlpha.push(readyHud.ctx.globalAlpha);
readyHud.drawStreakReady(state('playing', true));
if (!fadeAlpha.length || Math.abs(fadeAlpha[0] - 0.5) > 0.02) {
  console.log(`  ! killstreak-ready fade timing failed: ${fadeAlpha[0]}`);
  problems++;
}
readyHud.update(0.21);
if (readyHud.streakReady?.id !== 'strike'
  || readyHud.streakReadyQueue.map((entry) => entry.id).join(',') !== 'sentry'
  || readyShown.join(',') !== 'uav,strike') {
  console.log('  ! killstreak-ready queue did not advance exactly once after fading');
  problems++;
}
readyHud.clearStreakReady();
if (readyHud.streakReady || readyHud.streakReadyQueue.length) {
  console.log('  ! killstreak-ready queue did not clear on match transition');
  problems++;
}

// The old centre-screen grey instruction/status feed is deliberately hidden.
const noticeHud = new Hud(makeCanvas(480, 270), settings);
noticeHud.resize(480, 270);
const noticeLabels = [];
noticeHud.text = (str) => noticeLabels.push(String(str));
noticeHud.notice('PRESS SOMETHING', 2);
noticeHud.drawNotices(state('playing', true));
if (noticeLabels.length) {
  console.log('  ! retired centre-screen grey notice text is still visible');
  problems++;
}

console.log(problems ? `\n${problems} HUD layout problem(s)\n` : '\nHUD layout clear\n');
process.exit(problems ? 1 : 0);
