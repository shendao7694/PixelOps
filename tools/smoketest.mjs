// Headless smoke test: builds every system, simulates a few seconds of a
// match and renders the HUD, so runtime errors surface without a GPU.
import { installDomStub } from './domstub.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { makeCanvas } = installDomStub();

const THREE = await import('three');
const { buildTextures } = await import('../src/world/textures.js');
const { buildLevelFromParts } = await import('../src/world/levelbuild.js');
const { buildServerLevel } = await import('../server/world.mjs');
const { stockMap } = await import('../src/world/mapstore.js');
const { CharacterRig } = await import('../src/game/character.js');
const { RemotePlayer } = await import('../src/game/remoteplayer.js');
const { Bot } = await import('../src/game/bot.js');
const { Player } = await import('../src/game/player.js');
const {
  FIREARM_VISUAL_RECOIL,
  FIRST_PERSON_WEAPON_SCALES,
  ViewModel,
} = await import('../src/game/viewmodel.js');
const { Effects } = await import('../src/fx/effects.js');
const { Hud } = await import('../src/ui/hud.js');
const { loadSettings } = await import('../src/core/settings.js');
const { moveActor, rampSurfaceAt } = await import('../src/core/collision.js');
const { applyArmorDamage, ARMOR_ABSORB } = await import('../src/game/damage.js');
const { SENTRY_CONFIG } = await import('../src/game/sentry.js');
const { publicRegionResult } = await import('../server/client-region.mjs');
const {
  advanceFireCooldown,
  beginFireCooldown,
  fireCooldownReady,
} = await import('../src/game/fire-cadence.js');
const {
  activateServerUav,
  advanceServerUav,
  createTeamUavStates,
  serverUavRevealSeconds,
  uavRevealAlpha,
  UAV_DURATION_SECONDS,
  UAV_REVEAL_SECONDS,
  UAV_SWEEP_INTERVAL_SECONDS,
} = await import('../src/game/uav.js');
const { keepsPvpSimulationRunning, shouldPauseOnUnlock } = await import('../src/game/pausepolicy.js');
const { PvpClient } = await import('../src/net/pvp-client.js');
const {
  PVP_PROTOCOL,
  PVP_MOVEMENT_SUBSTEPS,
  PVP_TICK_RATE,
  canDamagePvpTarget,
  hasPvpChatMessage,
  sanitizeChatMessage,
} = await import('../src/net/protocol.js');
const {
  absorbViewCorrection,
  capturePvpShotAim,
  decayViewCorrection,
  movementCorrection,
  pvpShotAimForInput,
  reconcilePredictedAmmo,
  ReloadCycleGuard,
  samplePoseHistory,
} = await import('../src/net/pvp-sync.js');
const {
  RECOIL_BLOOM_SPREAD,
  WEAPON_DEFS,
  WEAPON_ORDER,
  playerWeaponSpread,
} = await import('../src/game/weapons.js');
const { AudioEngine, SAMPLE_URLS } = await import('../src/core/audio.js');

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log('  ok   ' + name);
  } catch (err) {
    failures++;
    console.log('  FAIL ' + name + '\n       ' + (err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n       ') : err));
  }
};
const finite = (v, what) => {
  if (!Number.isFinite(v)) throw new Error(what + ' is not finite: ' + v);
};
const finiteVec = (v, what) => {
  finite(v.x, what + '.x'); finite(v.y, what + '.y'); finite(v.z, what + '.z');
};

console.log('\nPIXEL OPS smoke test\n');

const settings = loadSettings();
let textures, level, map, scene, effects, player, camera, hud, vm;
const bots = [];

check('default pixel scale is 540P', () => {
  if (settings.pixelHeight !== 540) {
    throw new Error(`expected 540P, got ${settings.pixelHeight}P`);
  }
});

check('combat audio samples are present', () => {
  const expected = [
    'grenadePin', 'hitmarker', 'armorCrack', 'killConfirm', 'uavSweep',
    'missileLaunch', 'missileIncoming', 'missileImpact', 'sentryShot',
    'streakReady', 'matchAmbience', 'casFlyby', 'casCannon',
    'bomberFlyby', 'helicopterLoop', 'desertEagleShot',
  ];
  for (const name of expected) {
    if (!SAMPLE_URLS[name]) throw new Error('missing sample mapping: ' + name);
    const path = fileURLToPath(SAMPLE_URLS[name]);
    if (!existsSync(path)) throw new Error('missing sample file: ' + path);
  }
});

check('custom cues queue during first-room decoding instead of using synth fallbacks', () => {
  const audio = new AudioEngine({ volume: 1 });
  audio.ready = true;
  audio.sampleState = 'loading';
  audio.ctx = { currentTime: 4 };
  if (!audio._sample('grenadePin', { gain: 0.8 })) {
    throw new Error('declared custom sample was not reserved');
  }
  if (audio.pendingSamples.length !== 1 || audio.pendingSamples[0].name !== 'grenadePin') {
    throw new Error('custom sample was not queued while decoding');
  }
  if (audio._sample('not-a-custom-cue')) {
    throw new Error('unknown cue incorrectly suppressed its fallback');
  }
});

check('killstreak-ready cue uses its dedicated sample', () => {
  const audio = new AudioEngine({ volume: 1 });
  let request = null;
  audio._sample = (name, options) => {
    request = { name, options };
    return true;
  };
  audio.tone = () => {
    throw new Error('synth fallback played despite an accepted custom sample');
  };
  audio.streakReady();
  if (request?.name !== 'streakReady' || request.options?.gain !== 0.92) {
    throw new Error(`wrong killstreak-ready sample request: ${JSON.stringify(request)}`);
  }
});

check('throwables use distinct physical recordings and noise transients', () => {
  const audio = new AudioEngine({ volume: 1 });
  audio.ready = true;
  const calls = [];
  audio.burst = (options) => calls.push({ voice: 'burst', ...options });
  audio.tone = (options) => calls.push({ voice: 'tone', ...options });
  audio._sample = (name, options) => {
    calls.push({ voice: 'sample', name, ...options });
    return true;
  };
  const capture = (method) => {
    calls.length = 0;
    audio[method]({ x: 1, y: 2, z: 3 });
    return calls.map((call) => ({ ...call }));
  };
  const frag = capture('fragGrenade');
  const incendiary = capture('incendiaryIgnite');
  const molotov = capture('molotovBreak');
  if (!frag.some((call) =>
    call.voice === 'sample'
      && call.name === 'missileImpact'
      && call.rate >= 1.4
      && call.gain >= 0.7)
    || !frag.some((call) => call.voice === 'burst' && call.type === 'highpass')
    || !frag.some((call) => call.voice === 'burst' && call.type === 'lowpass')) {
    throw new Error('fragmentation cue is missing its recorded blast, pressure body or shell crack');
  }
  if (frag.some((call) => call.voice === 'tone')) {
    throw new Error('fragmentation cue still contains a game-like oscillator');
  }
  if (!incendiary.some((call) => call.voice === 'burst' && call.dur >= 0.8)
    || incendiary.some((call) => call.voice === 'tone')) {
    throw new Error('incendiary cue does not sound like ignition without explosive sub-bass');
  }
  if (!molotov.some((call) =>
    call.voice === 'burst'
      && call.type === 'highpass'
      && call.freq >= 8000
      && call.dur <= 0.03)
    || !molotov.some((call) =>
      call.voice === 'burst'
        && call.type === 'bandpass'
        && call.freq >= 5000
        && call.dur <= 0.06)
    || molotov.some((call) => call.voice === 'tone')
    || !molotov.some((call) => Number(call.delay) >= 0.09)) {
    throw new Error('Molotov cue is missing its crisp neck snap or delayed high glass shards');
  }
  if (JSON.stringify(frag) === JSON.stringify(incendiary)
    || JSON.stringify(incendiary) === JSON.stringify(molotov)) {
    throw new Error('throwable sound layers are not distinct');
  }
});

check('every firearm uses a distinct physical ballistic report', () => {
  const audio = new AudioEngine({ volume: 1 });
  audio.ready = true;
  const calls = [];
  audio.burst = (options) => calls.push({ voice: 'burst', ...options });
  audio.tone = (options) => calls.push({ voice: 'tone', ...options });
  const firearmDefs = Object.values(WEAPON_DEFS).filter((def) => def.sound);
  const kinds = new Set(firearmDefs.map((def) => def.sound.kind));
  const expectedKinds = [
    'rifle', 'smg', 'machine_pistol', 'magnum', 'shotgun', 'sniper', 'minigun', 'railgun',
  ];
  if (firearmDefs.length !== expectedKinds.length
    || expectedKinds.some((kind) => !kinds.has(kind))) {
    throw new Error(`incomplete firearm sound profiles: ${[...kinds].join(',')}`);
  }
  for (const def of firearmDefs) {
    calls.length = 0;
    audio.shot(def.sound, { x: 0, y: 1, z: -2 });
    if (def.id === 'desert_eagle') {
      if (calls.length !== 0) {
        throw new Error('Desert Eagle still layers procedural magnum audio over its recording');
      }
      continue;
    }
    if (calls.length < 4
      || calls.some((call) => call.voice !== 'burst')
      || !calls.some((call) => call.type === 'highpass' && call.dur <= 0.03)
      || !calls.some((call) => call.type === 'lowpass')
      || !calls.some((call) => call.type === 'bandpass' && call.delay > 0)) {
      throw new Error(`${def.id} is missing crack, pressure or delayed action layers`);
    }
    if (['shotgun', 'sniper'].includes(def.id)
      && !calls.some((call) => call.delay >= 0.1 && call.dur >= 0.16)) {
      throw new Error(`${def.id} is missing its heavy-calibre terrain reflection`);
    }
    if (['machine_pistol', 'minigun'].includes(def.id) && calls.length > 4) {
      throw new Error(`${def.id} high-RPM report creates too many concurrent layers`);
    }
  }

  const capture = (id) => {
    calls.length = 0;
    audio.shot(WEAPON_DEFS[id].sound, null);
    return calls.map((call) => ({ ...call }));
  };
  const smg = capture('smg');
  const machinePistol = capture('machine_pistol');
  const shotgun = capture('shotgun');
  const sniper = capture('sniper');
  if (JSON.stringify(smg) === JSON.stringify(machinePistol)
    || !machinePistol.some((call) => call.type === 'bandpass' && call.freq >= 4000)
    || machinePistol.some((call) => call.type === 'lowpass' && call.dur > 0.08)) {
    throw new Error('machine pistol still shares the SMG body instead of a compact mechanical snap');
  }
  if (!shotgun.some((call) =>
    call.type === 'bandpass' && call.freq < 700 && call.gain > 0.4)
    || !sniper.some((call) => call.delay >= 0.35 && call.dur >= 0.7)
    || shotgun.some((call) => call.delay >= 0.35 && call.dur >= 0.7)) {
    throw new Error('shotgun blast and sniper after-effect are not perceptually separated');
  }
});

check('UAV cadence matches PVE and only reveals during sweep windows', () => {
  const state = {
    uavUntil: 0,
    uavNextSweepAt: 0,
    uavRevealUntil: 0,
    uavSweepSeq: 0,
  };
  activateServerUav(state, 1000);
  if (state.uavUntil !== 1000 + UAV_DURATION_SECONDS * 1000) {
    throw new Error('UAV duration differs from PVE');
  }
  if (advanceServerUav(state, 1499) || serverUavRevealSeconds(state, 1499) !== 0) {
    throw new Error('UAV revealed enemies before the first sweep');
  }
  if (!advanceServerUav(state, 1500) || state.uavSweepSeq !== 1) {
    throw new Error('first UAV sweep did not occur after 0.5 seconds');
  }
  if (Math.abs(serverUavRevealSeconds(state, 1500) - 0.5) > 1e-6) {
    throw new Error('UAV reveal window is not 0.5 seconds');
  }
  if (serverUavRevealSeconds(state, 2000) !== 0) {
    throw new Error('UAV reveal stayed permanently visible');
  }
  const secondAt = 1500 + UAV_SWEEP_INTERVAL_SECONDS * 1000;
  if (!advanceServerUav(state, secondAt) || state.uavSweepSeq !== 2) {
    throw new Error('UAV did not repeat on the PVE three-second cadence');
  }
  const teams = createTeamUavStates();
  activateServerUav(teams.blue, 5000);
  if (teams.blue.uavUntil <= 5000 || teams.red.uavUntil !== 0) {
    throw new Error('team UAV state leaked across opposing teams');
  }
  if (uavRevealAlpha(UAV_REVEAL_SECONDS) !== 1
    || uavRevealAlpha(UAV_REVEAL_SECONDS / 2) !== 0.5
    || uavRevealAlpha(0) !== 0) {
    throw new Error('UAV marker fade is not proportional to reveal time');
  }
});

check('armor absorbs 80% and passes overflow to health', () => {
  if (ARMOR_ABSORB !== 0.8) throw new Error('armor ratio is ' + ARMOR_ABSORB);
  const full = { health: 100, armor: 50 };
  const split = applyArmorDamage(full, 20);
  if (full.armor !== 34 || full.health !== 96) throw new Error('full armor split is incorrect');
  if (split.absorbed !== 16 || split.healthDamage !== 4 || split.armorBroke) throw new Error('full armor result is incorrect');
  const low = { health: 100, armor: 5 };
  const overflow = applyArmorDamage(low, 20);
  if (low.armor !== 0 || low.health !== 85) throw new Error('armor overflow is incorrect');
  if (!overflow.armorBroke || overflow.absorbed !== 5 || overflow.healthDamage !== 15) throw new Error('armor break result is incorrect');
});

check('sentry balance configuration', () => {
  if (SENTRY_CONFIG.damageScale !== 0.7) throw new Error('sentry damage is not reduced by 30%');
  if (SENTRY_CONFIG.spread !== 0.085) throw new Error('unexpected sentry spread: ' + SENTRY_CONFIG.spread);
  if (SENTRY_CONFIG.modelScale !== 1.5) throw new Error('unexpected sentry model scale: ' + SENTRY_CONFIG.modelScale);
  if (SENTRY_CONFIG.pitchMin >= 0 || SENTRY_CONFIG.pitchMax <= 0) throw new Error('sentry pitch range is invalid');
  if (SENTRY_CONFIG.tracerColor !== 0xd8dde0) throw new Error('sentry tracer is not white-gray');
});

check('player weapon spread and shotgun pellet balance', () => {
  if (RECOIL_BLOOM_SPREAD !== 0.001875) {
    throw new Error(`continuous-fire bloom is ${RECOIL_BLOOM_SPREAD}, expected 0.001875`);
  }
  const shotgun = WEAPON_DEFS.shotgun;
  if (shotgun.pellets !== 18) throw new Error(`shotgun has ${shotgun.pellets} pellets`);
  if (shotgun.spreadHip !== 0.05625 || shotgun.spreadAds !== 0.036) {
    throw new Error(`shotgun base spread is ${shotgun.spreadHip}/${shotgun.spreadAds}`);
  }
  const rifleBloom = playerWeaponSpread(WEAPON_DEFS.rifle, {
    adsBlend: 1,
    moveSpeed: 0,
    grounded: true,
    recoilAccum: 1,
  });
  const expectedRifleBloom = (WEAPON_DEFS.rifle.spreadAds + RECOIL_BLOOM_SPREAD) * 0.5;
  if (Math.abs(rifleBloom - expectedRifleBloom) > 1e-12) {
    throw new Error(`ADS bloom formula drifted: ${rifleBloom}/${expectedRifleBloom}`);
  }
  const shotgunAds = playerWeaponSpread(shotgun, {
    adsBlend: 1,
    moveSpeed: 0,
    grounded: true,
  });
  if (Math.abs(shotgunAds - 0.0288) > 1e-12) {
    throw new Error(`shotgun ADS spread is ${shotgunAds}, expected 0.0288`);
  }
});

check('machine pistol is a compact automatic secondary with bounded close-range balance', () => {
  const pistol = WEAPON_DEFS.machine_pistol;
  if (!pistol || !pistol.auto || !pistol.pistol) {
    throw new Error('machine pistol identity/automatic handling is missing');
  }
  if (pistol.mag !== 20 || pistol.reserve !== 120 || pistol.rpm !== 1100) {
    throw new Error(`unexpected machine pistol ammo/cadence: ${pistol.mag}/${pistol.reserve}/${pistol.rpm}`);
  }
  if (Math.abs(pistol.spreadHip - 0.0624) > 1e-12
    || Math.abs(pistol.spreadAds - 0.0138) > 1e-12) {
    throw new Error(`unexpected machine pistol spread: ${pistol.spreadHip}/${pistol.spreadAds}`);
  }
  if (Math.abs(pistol.damage - 15.4) > 1e-12) {
    throw new Error(`machine pistol did not receive the exact 10% damage increase: ${pistol.damage}`);
  }
  if (pistol.damage >= WEAPON_DEFS.smg.damage
    || pistol.range >= WEAPON_DEFS.smg.range
    || pistol.moveMult <= WEAPON_DEFS.smg.moveMult) {
    throw new Error('machine pistol no longer trades damage/range for secondary mobility');
  }
  if (WEAPON_ORDER.at(-3) !== 'machine_pistol') {
    throw new Error('machine pistol compact PVP code was not appended');
  }
});

check('Desert Eagle is a seven-round high-recoil magnum semi-auto pistol', () => {
  const deagle = WEAPON_DEFS.desert_eagle;
  if (!deagle || deagle.auto || !deagle.pistol || deagle.retainsCases) {
    throw new Error('Desert Eagle semi-auto pistol identity is missing');
  }
  if (deagle.mag !== 7 || deagle.reserve !== 35 || deagle.damage !== 78) {
    throw new Error(`unexpected Desert Eagle payload: ${deagle.mag}/${deagle.reserve}/${deagle.damage}`);
  }
  if (deagle.recoilV < 3 || deagle.kick < 2
    || deagle.damage <= WEAPON_DEFS.rifle.damage * 2) {
    throw new Error('Desert Eagle no longer has hand-cannon damage and recoil');
  }
  if (WEAPON_ORDER.at(-2) !== 'desert_eagle') {
    throw new Error('Desert Eagle compact PVP code was not appended');
  }
  if (WEAPON_ORDER.at(-1) !== 'railgun') {
    throw new Error('railgun primary code was not appended');
  }
});

check('PVP pause policy keeps live matches running', () => {
  if (shouldPauseOnUnlock('pvp', 'playing', false)) {
    throw new Error('PVP focus loss opened the pause menu');
  }
  if (!shouldPauseOnUnlock('pvp', 'playing', true)) {
    throw new Error('intentional PVP unlock did not open the menu');
  }
  if (!shouldPauseOnUnlock('pve', 'playing', false)) {
    throw new Error('PVE focus loss no longer pauses');
  }
  if (!keepsPvpSimulationRunning('pvp', 'paused')
    || !keepsPvpSimulationRunning('pvp', 'settings')
    || !keepsPvpSimulationRunning('pvp', 'votekick')
    || keepsPvpSimulationRunning('pve', 'paused')) {
    throw new Error('pause overlay simulation policy is incorrect');
  }
});

check('PVP friendly fire is disabled for every authoritative damage source', () => {
  const attacker = { id: 'a', team: 'blue' };
  const teammate = { id: 'b', team: 'blue' };
  const enemy = { id: 'c', team: 'red' };
  if (canDamagePvpTarget(attacker, teammate)
    || !canDamagePvpTarget(attacker, enemy)
    || canDamagePvpTarget(attacker, attacker)
    || !canDamagePvpTarget(attacker, attacker, true)) {
    throw new Error('friendly-fire policy is not team-safe');
  }
});

check('PVP chat keeps Unicode while removing controls and enforcing its limit', () => {
  const clean = sanitizeChatMessage('  你好\u0000   READY  ');
  const capped = sanitizeChatMessage('测'.repeat(100));
  if (clean !== '你好 READY' || Array.from(capped).length !== 80) {
    throw new Error(`chat sanitization failed: ${clean} / ${Array.from(capped).length}`);
  }
});

check('empty PVP chat closes on Enter without sending', () => {
  if (hasPvpChatMessage('  \u0000  ') || !hasPvpChatMessage(' READY ')) {
    throw new Error('empty Enter chat action cannot distinguish close from send');
  }
});

check('PVP region warning is China-safe and fails open when lookup is unavailable', () => {
  const china = publicRegionResult('cn');
  const overseas = publicRegionResult('US');
  const unknown = publicRegionResult(null);
  if (china.country !== 'CN' || china.outsideChina) {
    throw new Error('Chinese traffic was incorrectly warned');
  }
  if (overseas.country !== 'US' || !overseas.outsideChina) {
    throw new Error('overseas traffic did not receive the proxy warning');
  }
  if (unknown.country !== null || unknown.outsideChina) {
    throw new Error('an unavailable lookup did not fail open');
  }
});

check('PVP reload cycles are acknowledged only once', () => {
  const cycles = new ReloadCycleGuard();
  const first = { weapon: 'rifle', startedAt: 1000, endsAt: 3000 };
  if (!cycles.accept(first)) throw new Error('first reload cycle was rejected');
  if (cycles.accept(first)) throw new Error('same reload cycle restarted its animation');
  if (!cycles.accept({ ...first, startedAt: 4000 })) {
    throw new Error('a genuinely new reload cycle was rejected');
  }
});

check('PVP reconciliation compares matching times and ignores stair phase', () => {
  const history = [
    { at: 1000, p: [2, 0, 0], v: [4, 0, 0], grounded: true },
    { at: 1100, p: [2.4, 0.4, 0], v: [4, 0, 0], grounded: true },
  ];
  const predicted = samplePoseHistory(history, 1050);
  if (!predicted || Math.abs(predicted.p[0] - 2.2) > 0.0001) {
    throw new Error('pose history was not sampled at snapshot time');
  }
  const noLatencyPull = movementCorrection([2.2, 0.2, 0], predicted, {
    serverGrounded: true,
    clientGrounded: true,
  });
  if (Math.hypot(noLatencyPull.x, noLatencyPull.y, noLatencyPull.z) > 0.0001) {
    throw new Error('matching historical pose still pulled the current player backwards');
  }
  const stair = movementCorrection([2.2, 0, 0], {
    ...predicted,
    p: [2.2, 0.45, 0],
  }, {
    serverGrounded: true,
    clientGrounded: true,
    stepHeight: 0.55,
  });
  if (stair.y !== 0) throw new Error('one stair-step phase difference was corrected');
  const drift = movementCorrection([3, 0, 0], {
    ...predicted,
    p: [2.2, 0, 0],
  }, {
    serverGrounded: true,
    clientGrounded: true,
  });
  if (drift.x <= 0) throw new Error('real horizontal divergence was not reconciled');
});

check('PVP first-person view absorbs routine authoritative corrections', () => {
  const physical = { x: 4.2, y: 1.1, z: -2.5 };
  const viewOffset = { x: 0.04, y: -0.02, z: 0.01 };
  const before = {
    x: physical.x + viewOffset.x,
    y: physical.y + viewOffset.y,
    z: physical.z + viewOffset.z,
  };
  const correction = { x: -0.18, y: 0.06, z: 0.12, teleport: false };
  physical.x += correction.x;
  physical.y += correction.y;
  physical.z += correction.z;
  absorbViewCorrection(viewOffset, correction);
  const after = {
    x: physical.x + viewOffset.x,
    y: physical.y + viewOffset.y,
    z: physical.z + viewOffset.z,
  };
  if (Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) > 1e-9) {
    throw new Error('routine reconciliation still caused an instantaneous camera snap');
  }

  const buffered = Math.hypot(viewOffset.x, viewOffset.y, viewOffset.z);
  decayViewCorrection(viewOffset, 1 / 60);
  const decayed = Math.hypot(viewOffset.x, viewOffset.y, viewOffset.z);
  if (!(decayed > 0 && decayed < buffered)) {
    throw new Error('camera correction does not converge smoothly');
  }

  absorbViewCorrection(viewOffset, { x: 3, y: 0, z: 0, teleport: true });
  if (Math.hypot(viewOffset.x, viewOffset.y, viewOffset.z) !== 0) {
    throw new Error('teleport correction left a detached first-person camera');
  }
});

check('PVP ammo prediction cannot be restored by an older snapshot', () => {
  const predictedShot = reconcilePredictedAmmo(
    { mag: 29, reserve: 90 },
    { mag: 30, reserve: 90 },
    { mag: 30, reserve: 90 },
    true
  );
  if (predictedShot.mag !== 29) throw new Error('old snapshot restored a fired round');

  const partiallyConfirmed = reconcilePredictedAmmo(
    { mag: 27, reserve: 90 },
    { mag: 29, reserve: 90 },
    { mag: 30, reserve: 90 },
    true
  );
  if (partiallyConfirmed.mag !== 27) {
    throw new Error('partial server confirmation moved the counter backwards');
  }

  const settled = reconcilePredictedAmmo(
    { mag: 27, reserve: 90 },
    { mag: 29, reserve: 90 },
    { mag: 29, reserve: 90 },
    false
  );
  if (settled.mag !== 29) throw new Error('denied prediction never reconciled');

  const reloaded = reconcilePredictedAmmo(
    { mag: 20, reserve: 70 },
    { mag: 30, reserve: 60 },
    { mag: 20, reserve: 70 },
    true
  );
  if (reloaded.mag !== 30 || reloaded.reserve !== 60) {
    throw new Error('authoritative reload increase was not applied');
  }

  const predictedReloadFinished = reconcilePredictedAmmo(
    { mag: 30, reserve: 65 },
    { mag: 5, reserve: 90 },
    { mag: 5, reserve: 90 },
    true
  );
  if (predictedReloadFinished.mag !== 30 || predictedReloadFinished.reserve !== 65) {
    throw new Error('unchanged reload snapshot restored the pre-reload five rounds');
  }
});

check('PVP fires the predicted shot along the pre-recoil reticle direction', () => {
  const yaw = -0.42;
  const pitch = 0.08;
  const firedAt = 1000;
  const pending = capturePvpShotAim('sniper', yaw, pitch, firedAt);
  const kickedPitch = pitch + WEAPON_DEFS.sniper.aimKickUp;
  const shot = pvpShotAimForInput(pending, {
    weapon: 'sniper',
    trigger: true,
    yaw,
    pitch: kickedPitch,
    now: firedAt + 16,
  });
  if (!shot.usesPending || shot.yaw !== yaw || shot.pitch !== pitch) {
    throw new Error(`sniper authority received post-recoil pitch ${shot.pitch}`);
  }
  const expired = pvpShotAimForInput(pending, {
    weapon: 'sniper',
    trigger: true,
    yaw,
    pitch: kickedPitch,
    now: firedAt + 300,
  });
  if (expired.usesPending || expired.pitch !== kickedPitch || !expired.discardPending) {
    throw new Error('stale shot aim survived into a later trigger');
  }
});

check('PVP uses a real 45 Hz authority with matched movement substeps', () => {
  if (PVP_TICK_RATE !== 45 || PVP_MOVEMENT_SUBSTEPS !== 2) {
    throw new Error(`PVP timing drifted: ${PVP_TICK_RATE} Hz x ${PVP_MOVEMENT_SUBSTEPS}`);
  }
});

check('client and 45 Hz server preserve the same weapon fire cadence', () => {
  const simulate = (rpm, hz, seconds) => {
    const dt = 1 / hz;
    let cooldown = 0;
    let held = false;
    let shots = 0;
    for (let time = 0; time < seconds - 1e-9; time += dt) {
      cooldown = advanceFireCooldown(cooldown, dt, held);
      if (fireCooldownReady(cooldown)) {
        shots++;
        cooldown = beginFireCooldown(cooldown, 60 / rpm);
      }
      held = true;
    }
    return shots;
  };
  for (const rpm of [48, 72, 700, 940]) {
    const server = simulate(rpm, PVP_TICK_RATE, 10);
    const client60 = simulate(rpm, 60, 10);
    const client200 = simulate(rpm, 200, 10);
    if (Math.max(server, client60, client200) - Math.min(server, client60, client200) > 1) {
      throw new Error(
        `${rpm} RPM drifted: server ${server}, 60 FPS ${client60}, 200 FPS ${client200}`
      );
    }
  }
});

check('PVP snapshots cannot roll health or armor back to an older tick', () => {
  const received = [];
  const client = new PvpClient({
    snapshot: (snapshot) => received.push([
      snapshot.tick,
      snapshot.players[0].health,
      snapshot.players[0].armor,
    ]),
  });
  client.handleMessage(JSON.stringify({
    type: 'snapshot',
    protocol: PVP_PROTOCOL,
    tick: 20,
    players: [{ health: 72, armor: 18 }],
  }));
  client.handleMessage(JSON.stringify({
    type: 'snapshot',
    protocol: PVP_PROTOCOL,
    tick: 19,
    players: [{ health: 100, armor: 50 }],
  }));
  client.handleMessage(JSON.stringify({
    type: 'snapshot',
    protocol: PVP_PROTOCOL,
    tick: 21,
    players: [{ health: 68, armor: 2 }],
  }));
  if (JSON.stringify(received) !== JSON.stringify([[20, 72, 18], [21, 68, 2]])) {
    throw new Error(`stale vitals snapshot was accepted: ${JSON.stringify(received)}`);
  }
});

check('PVP client stops reconnecting when server requires LinuxDO login', () => {
  let redirects = 0;
  const client = new PvpClient({ authRequired: () => { redirects++; } });
  client.wantConnection = true;
  client.pendingJoin = { roomId: 'room-1', name: 'PLAYER' };
  client.handleMessage(JSON.stringify({ type: 'auth_required' }));
  client.handleMessage(JSON.stringify({ type: 'auth_required' }));
  if (client.state !== 'auth_required' || client.wantConnection
    || client.pendingJoin !== null || redirects !== 1) {
    throw new Error('auth-required state did not stop and notify exactly once');
  }
});

check('textures build', () => {
  textures = buildTextures();
  if (!textures.concrete || !textures.camoRed || !textures.flash) throw new Error('missing texture');
});

check('level builds with colliders and spawns', () => {
  map = stockMap();
  level = buildLevelFromParts(map.parts, textures, { env: map.env });
  if (level.colliders.length < 40) throw new Error('too few colliders: ' + level.colliders.length);
  if (level.solids.length < 40) throw new Error('too few solids');
  if (!level.spawns.blue.length || !level.spawns.red.length) throw new Error('no spawns');
  for (const c of level.colliders) { finiteVec(c.min, 'collider.min'); finiteVec(c.max, 'collider.max'); }
  const stairs = map.parts.filter((part) => part.kind === 'stairs').length;
  const ramps = level.colliders.filter((c) => c.ramp).length;
  if (ramps !== stairs) throw new Error(`expected ${stairs} continuous stair ramps, got ${ramps}`);
  const serverLevel = buildServerLevel();
  const serverRamps = serverLevel.colliders.filter((c) => c.ramp);
  const expectedTreads = map.parts
    .filter((part) => part.kind === 'stairs')
    .reduce((sum, part) => sum + Math.round(part.steps), 0);
  if (serverRamps.length !== ramps) {
    throw new Error(`server/client ramp mismatch: ${serverRamps.length}/${ramps}`);
  }
  if (serverLevel.colliders.filter((c) => c.rayOnly).length !== expectedTreads) {
    throw new Error('server bullet geometry no longer matches the visible stair treads');
  }
});

check('scene assembly', () => {
  scene = new THREE.Scene();
  scene.add(level.group);
  effects = new Effects(scene, textures);
  effects.setViewportScale(270, 1.4);
});

check('character rig + procedural animation', () => {
  const rig = new CharacterRig(textures, { team: 'red' });
  scene.add(rig.root);
  if (rig.hitboxes.length !== 7) throw new Error('expected 7 hitboxes, got ' + rig.hitboxes.length);
  for (let i = 0; i < 240; i++) {
    rig.update(1 / 60, {
      position: new THREE.Vector3(Math.sin(i / 20) * 4, 0, Math.cos(i / 20) * 4),
      yaw: i / 40, pitch: Math.sin(i / 30) * 0.5, speed: 3 + Math.sin(i / 10) * 2,
      moveX: Math.sin(i / 15), moveZ: -1, crouch: i % 120 > 60, aiming: i % 80 > 40,
      firing: false, sprinting: false, grounded: true,
    });
  }
  rig.root.updateMatrixWorld(true);
  finiteVec(rig.bones.head.getWorldPosition(new THREE.Vector3()), 'head');
  finiteVec(rig.armL.elbow.getWorldPosition(new THREE.Vector3()), 'left elbow');
});

check('PVP presentation keeps allies blue and enemies red', () => {
  const base = {
    name: 'REMOTE', weapon: 'rifle', p: [0, 0, -5], v: [0, 0, 0],
    yaw: 0, pitch: 0, alive: true, health: 100, armor: 50,
    kills: 0, deaths: 0, score: 0, firing: 0,
  };
  const ally = new RemotePlayer(scene, textures, { ...base, id: 'ally', team: 'red' }, 'blue');
  const enemy = new RemotePlayer(scene, textures, { ...base, id: 'enemy', team: 'blue' }, 'red');
  if (ally.team !== 'red' || ally.rig.team !== 'blue') {
    throw new Error('authoritative ally team leaked into presentation');
  }
  if (enemy.team !== 'blue' || enemy.rig.team !== 'red') {
    throw new Error('authoritative enemy team leaked into presentation');
  }
  ally.dispose();
  enemy.dispose();
});

check('PVP spawn protection renders animated golden particles', () => {
  const protectedPlayer = new RemotePlayer(scene, textures, {
    id: 'protected',
    name: 'PROTECTED',
    team: 'red',
    weapon: 'rifle',
    p: [0, 0, -5],
    v: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    alive: true,
    health: 100,
    armor: 50,
    kills: 0,
    deaths: 0,
    score: 0,
    firing: 0,
    invulnerable: true,
  }, 'red');
  protectedPlayer.update(1 / 30);
  const particles = protectedPlayer.rig.invulnerabilityParticles;
  if (!particles.visible || protectedPlayer.rig.materials.invulnerability.opacity <= 0) {
    throw new Error('golden protection particles are not visible');
  }
  const positions = particles.geometry.attributes.position.array;
  if (![...positions].some((value) => Math.abs(value) > 0.05)) {
    throw new Error('protection particles were not animated around the model');
  }
  protectedPlayer.dispose();
});

check('ragdoll death settles', () => {
  const rig = new CharacterRig(textures, { team: 'blue' });
  rig.update(1 / 60, { position: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moveX: 0, moveZ: 0, grounded: true });
  rig.die(new THREE.Vector3(0.7, 0, 0.7).normalize(), 1);
  for (let i = 0; i < 300; i++) rig.update(1 / 60, {});
  finiteVec(rig.root.position, 'ragdoll position');
  if (rig.ragdoll.tip < 0.99) throw new Error('ragdoll never fell flat: ' + rig.ragdoll.tip);
});

check('collision: actor lands on the ground and stops at walls', () => {
  // drop from inside the building (above the ceiling it would land on the roof)
  const actor = {
    position: new THREE.Vector3(0, 4.5, 18), velocity: new THREE.Vector3(0, 0, 0),
    radius: 0.36, height: 1.8, stepHeight: 0.55, grounded: false,
  };
  for (let i = 0; i < 200; i++) {
    actor.velocity.y -= 21 / 60;
    moveActor(actor, level.colliders, 1 / 60);
  }
  if (!actor.grounded) throw new Error('actor never landed');
  if (Math.abs(actor.position.y) > 0.01) throw new Error('landed at wrong height: ' + actor.position.y);
  // run into the outer wall
  actor.velocity.set(0, 0, 8);
  for (let i = 0; i < 300; i++) moveActor(actor, level.colliders, 1 / 60);
  if (actor.position.z > level.bounds.z + 0.5) throw new Error('walked through the wall: ' + actor.position.z);
  // the compound is open to the sky: a hard launch sails above the walls and
  // gravity brings the actor back down to the same floor
  actor.position.set(0, 0, 18);
  actor.velocity.set(0, 30, 0);
  actor.grounded = false;
  let peak = 0;
  for (let i = 0; i < 600; i++) {
    actor.velocity.y -= 21 / 60;
    moveActor(actor, level.colliders, 1 / 60);
    peak = Math.max(peak, actor.position.y);
  }
  if (peak < 8.5) throw new Error('open-sky jump was capped at ' + peak.toFixed(2));
  if (!actor.grounded || Math.abs(actor.position.y) > 0.01) throw new Error('never came back down: ' + actor.position.y);
});

check('collision: visual stairs ride on a continuous ramp plane', () => {
  const ramp = {
    min: new THREE.Vector3(0, 0, -1.5),
    max: new THREE.Vector3(4, 2, 1.5),
    ramp: {
      axis: 'x', dir: 1, start: 0, length: 4, rise: 2, baseY: 0,
    },
  };
  const floor = {
    min: new THREE.Vector3(-5, -1, -2),
    max: new THREE.Vector3(8, 0, 2),
    isGround: true,
  };
  const actor = {
    position: new THREE.Vector3(-0.4, 0, 0),
    velocity: new THREE.Vector3(2, 0, 0),
    radius: 0.36,
    height: 1.8,
    stepHeight: 0.55,
    grounded: true,
  };
  let samples = 0;
  let maxError = 0;
  const heights = new Set();
  for (let i = 0; i < 150; i++) {
    actor.velocity.x = 2;
    actor.velocity.y -= 21 / 60;
    moveActor(actor, [floor, ramp], 1 / 60);
    if (actor.position.x <= 0.05 || actor.position.x >= 3.95) continue;
    const expected = rampSurfaceAt(ramp, actor.position.x, actor.position.z);
    maxError = Math.max(maxError, Math.abs(actor.position.y - expected));
    heights.add(actor.position.y.toFixed(3));
    samples++;
  }
  if (samples < 60) throw new Error('actor did not traverse enough of the ramp');
  if (maxError > 0.015) throw new Error(`feet left ramp plane by ${maxError.toFixed(4)}m`);
  if (heights.size < 60) throw new Error(`ramp still behaves like ${heights.size} discrete steps`);
});

check('collision: uphill jumps land on the ramp without endpoint ejection', () => {
  const ramp = {
    min: new THREE.Vector3(3, 0, -1.5),
    max: new THREE.Vector3(7.8, 3.6, 1.5),
    ramp: {
      axis: 'x', dir: 1, start: 3, length: 4.8, rise: 3.6, baseY: 0,
    },
  };
  const floor = {
    min: new THREE.Vector3(-20, -1, -4),
    max: new THREE.Vector3(30, 0, 4),
    isGround: true,
  };
  const jumpLevel = { colliders: [floor, ramp], bounds: { x: 30, z: 4 } };

  for (const jumpFrame of [30, 40, 50]) {
    const jumpCamera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 600);
    const jumper = new Player({
      camera: jumpCamera,
      level: jumpLevel,
      settings,
      audio: null,
    });
    jumper.respawn(new THREE.Vector3(0, 0, 0));
    jumper.yaw = -Math.PI / 2;
    jumper.grounded = true;
    let previousX = jumper.position.x;
    let largestStep = 0;

    for (let frame = 0; frame < 180; frame++) {
      jumper.update(1 / 60, {
        move: { x: 0, z: -1 },
        jump: frame === jumpFrame,
        crouch: false,
        slide: false,
        sprint: true,
        aim: false,
        aimBlend: 0,
        speedMult: 1,
      });
      largestStep = Math.max(largestStep, Math.abs(jumper.position.x - previousX));
      previousX = jumper.position.x;
    }

    if (largestStep > 0.35) {
      throw new Error(`jump at frame ${jumpFrame} displaced ${largestStep.toFixed(2)}m in one frame`);
    }
    if (jumper.position.x < 15) {
      throw new Error(`jump at frame ${jumpFrame} failed to traverse the stairs`);
    }
  }
});

check('PVP predicted movement does not regenerate authoritative vitals', () => {
  const vitalsCamera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 600);
  const vitalsPlayer = new Player({
    camera: vitalsCamera,
    level,
    settings,
    audio: null,
  });
  vitalsPlayer.respawn(level.spawns.blue[0].clone());
  vitalsPlayer.grounded = true;
  vitalsPlayer.health = 64;
  vitalsPlayer.armor = 17;
  vitalsPlayer.lastHitTime = -100;
  const idle = {
    move: { x: 0, z: 0 },
    jump: false,
    crouch: false,
    slide: false,
    sprint: false,
    aim: false,
    aimBlend: 0,
    speedMult: 1,
    serverOwnsVitals: true,
  };
  for (let i = 0; i < 60; i++) vitalsPlayer.update(1 / 60, idle);
  if (vitalsPlayer.health !== 64 || vitalsPlayer.armor !== 17) {
    throw new Error(`local prediction changed vitals to ${vitalsPlayer.health}/${vitalsPlayer.armor}`);
  }

  vitalsPlayer.update(1 / 60, { ...idle, serverOwnsVitals: false });
  if (vitalsPlayer.health <= 64 || vitalsPlayer.armor <= 17) {
    throw new Error('PVE regeneration was disabled together with PVP prediction');
  }
});

check('player movement + death animation', () => {
  camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 600);
  player = new Player({ camera, level, settings, audio: null });
  player.respawn(level.spawns.blue[0].clone());
  for (let i = 0; i < 180; i++) {
    player.look(4, 1);
    player.update(1 / 60, {
      move: { x: i % 60 > 30 ? 1 : 0, z: -1 }, jump: i % 45 === 0, crouch: i % 90 > 70,
      sprint: true, aim: false, aimBlend: 0, speedMult: 1,
    });
  }
  finiteVec(player.position, 'player position');
  finiteVec(camera.position, 'camera position');
  if (player.speed2D <= 0.5) throw new Error('player never moved');
  player.takeDamage(20, null, { name: 'ARMOR TEST' });
  if (Math.abs(player.armor - 34) > 0.001) throw new Error('player armor did not absorb 80%: ' + player.armor);
  if (Math.abs(player.health - 96) > 0.001) throw new Error('player health did not take 20%: ' + player.health);
  player.takeDamage(500, new THREE.Vector3(0, 0, 0), { name: 'TEST' });
  if (player.alive) throw new Error('player survived 500 damage');
  for (let i = 0; i < 200; i++) player.update(1 / 60, { move: { x: 0, z: 0 } });
  finite(player.deathAnim.roll, 'death roll');
  if (Math.abs(player.deathAnim.roll) < 0.8) throw new Error('death fall never rolled: ' + player.deathAnim.roll);
  if (player.deathAnim.h > 0.4) throw new Error('camera never dropped: ' + player.deathAnim.h);
  player.respawn(level.spawns.blue[0].clone());
  player.alive = false;
  player.deathAnim = null;
  player.update(1 / 60, { move: { x: 0, z: 0 } });
  finiteVec(camera.position, 'undeployed PVP camera');
  player.respawn(level.spawns.blue[0].clone());
});

check('viewmodel: equip, fire, reload, switch for every weapon', () => {
  vm = new ViewModel({ textures, audio: null, settings, team: 'blue' });
  let shots = 0;
  const ejectedCases = new Map();
  vm.onShoot = (def, spread) => { shots++; finite(spread, 'spread'); };
  vm.onCameraKick = (v, h) => { finite(v, 'kick v'); finite(h, 'kick h'); };
  vm.onEjectShell = (p, id) => {
    finiteVec(p, 'shell');
    ejectedCases.set(id, (ejectedCases.get(id) || 0) + 1);
  };
  for (const id of WEAPON_ORDER) {
    vm.equip(id, true);
    const expectedViewScale = FIRST_PERSON_WEAPON_SCALES[id] || 1;
    if (Math.abs(vm.model.scale.x - expectedViewScale) > 1e-9
      || Math.abs(vm.model.scale.y - expectedViewScale) > 1e-9
      || Math.abs(vm.model.scale.z - expectedViewScale) > 1e-9) {
      throw new Error(`${id} first-person scale drifted: ${vm.model.scale.x}`);
    }
    for (let i = 0; i < 420; i++) {
      vm.update(1 / 60, {
        trigger: id === 'railgun'
          ? i >= 90 && i < 180
          : id === 'minigun' ? i % 90 < 60 : i % 30 < 20,
        aim: id === 'railgun' ? i >= 20 : i % 100 > 50,
        reload: i === 200,
        sprinting: id === 'railgun' ? false : i % 150 > 120,
        moveSpeed: 4, grounded: true, crouch: false,
        lookDx: 0.2, lookDy: -0.1, landImpact: i === 60 ? 8 : 0, dead: false, canAct: true,
      });
      finite(vm.holder.position.x, 'holder.x');
      finite(vm.holder.rotation.x, 'holder.rx');
    }
    if (shots === 0) throw new Error(id + ' never fired');
    shots = 0;
  }
  if ((ejectedCases.get('desert_eagle') || 0) === 0) {
    throw new Error('the Desert Eagle stopped ejecting cases after its shots');
  }
  vm.equip('rifle');
  for (let i = 0; i < 60; i++) vm.update(1 / 60, { moveSpeed: 0, grounded: true, canAct: true });
  vm.holder.visible = false;
  vm.reset();
  if (!vm.holder.visible) {
    throw new Error('viewmodel reset left the deployed weapon hidden');
  }
  vm.equip('rifle', true);
  const holsterDuration = vm.holsterCurrent();
  if (Math.abs(holsterDuration - 0.21) > 1e-9
    || Math.abs(vm.switchT - vm.switchTotal) > 1e-9
    || !vm.holder.visible) {
    throw new Error('killstreak weapon holster did not begin on the normal switch track');
  }
  const holsterStart = vm.switchT;
  vm.update(1 / 60, {
    trigger: false, aim: false, reload: false, sprinting: false,
    moveSpeed: 0, grounded: true, crouch: false, dead: false, canAct: false,
  });
  if (!(vm.switchT > vm.switchTotal * 0.5 && vm.switchT < holsterStart)) {
    throw new Error('killstreak weapon holster did not advance toward the lowered midpoint');
  }
  for (let i = 0; i < 12; i++) {
    vm.update(1 / 60, {
      trigger: false, aim: false, reload: false, sprinting: false,
      moveSpeed: 0, grounded: true, crouch: false, dead: false, canAct: false,
    });
  }
  if (vm.switchT > vm.switchTotal * 0.5) {
    throw new Error('killstreak weapon holster never reached the lowered midpoint');
  }
  if (!vm.drawCurrent() || Math.abs(vm.switchT - vm.switchTotal * 0.5) > 1e-9) {
    throw new Error('killstreak return did not begin at the lowered weapon-draw midpoint');
  }
  const drawStart = vm.switchT;
  vm.update(1 / 60, {
    trigger: false, aim: false, reload: false, sprinting: false,
    moveSpeed: 0, grounded: true, crouch: false, dead: false, canAct: false,
  });
  if (!(vm.switchT > 0 && vm.switchT < drawStart)) {
    throw new Error('killstreak weapon draw did not advance');
  }
  for (let i = 0; i < 30; i++) {
    vm.update(1 / 60, {
      trigger: false, aim: false, reload: false, sprinting: false,
      moveSpeed: 0, grounded: true, crouch: false, dead: false, canAct: true,
    });
  }
  if (vm.switchT !== 0) throw new Error('killstreak weapon draw did not finish');
});

check('first-person firearms pull straight back with classed visual recoil', () => {
  const low = ['smg', 'machine_pistol'];
  const high = ['shotgun', 'sniper', 'desert_eagle'];
  const ids = ['rifle', ...low, ...high, 'minigun'];
  for (const id of ids) {
    const profile = FIREARM_VISUAL_RECOIL[id];
    if (!profile) throw new Error(`${id} has no first-person visual recoil profile`);
    if (profile.pullback <= 0 || profile.recover <= 0) {
      throw new Error(`${id} visual recoil is outside the requested bounds`);
    }
    if ('yawMinDeg' in profile || 'yawMaxDeg' in profile) {
      throw new Error(`${id} still contains recoil-driven left/right deviation`);
    }
  }
  const riflePullback = FIREARM_VISUAL_RECOIL.rifle.pullback;
  if (low.some((id) => FIREARM_VISUAL_RECOIL[id].pullback >= riflePullback)
    || high.some((id) => FIREARM_VISUAL_RECOIL[id].pullback <= riflePullback)) {
    throw new Error('low / medium / high firearm pullback ordering drifted');
  }
  if (Math.abs(FIREARM_VISUAL_RECOIL.sniper.pullback - 0.210) > 1e-9
    || Math.abs(FIREARM_VISUAL_RECOIL.desert_eagle.pullback - 0.176) > 1e-9) {
    throw new Error('sniper or Desert Eagle did not receive its exact doubled pullback');
  }

  const recoilVm = new ViewModel({ textures, audio: null, settings, team: 'blue' });
  let sniperScopeKicked = false;
  for (const id of ids) {
    recoilVm.equip(id, true);
    recoilVm.adsBlend = id === 'sniper' ? 1 : 0;
    recoilVm.scoped = id === 'sniper';
    recoilVm.fire({
      unlimitedAmmo: true,
      moveSpeed: 0,
      grounded: true,
      crouch: false,
    });
    const profile = FIREARM_VISUAL_RECOIL[id];
    if (recoilVm.visualKickDepth < profile.pullback - 1e-9) {
      throw new Error(`${id} did not produce its authored straight-back recoil`);
    }
    if ('visualKickYaw' in recoilVm || 'visualKickRoll' in recoilVm) {
      throw new Error(`${id} still owns lateral visual recoil state`);
    }
    if (id === 'sniper') sniperScopeKicked = recoilVm.scopeRecoil >= 1.99;
  }
  if (!sniperScopeKicked) {
    throw new Error('a settled sniper shot did not kick the scope mask');
  }
  recoilVm.equip('sniper', true);
  recoilVm.adsBlend = 1;
  recoilVm.scoped = true;
  recoilVm.fire({
    unlimitedAmmo: true,
    moveSpeed: 0,
    grounded: true,
    crouch: false,
  });
  for (let i = 0; i < 120; i++) {
    recoilVm.update(1 / 60, {
      trigger: false,
      aim: true,
      reload: false,
      sprinting: false,
      moveSpeed: 0,
      grounded: true,
      crouch: false,
      dead: false,
      canAct: false,
    });
  }
  if (recoilVm.scopeRecoil > 0.001
    || recoilVm.visualKickDepth > 0.001) {
    throw new Error('visual firearm/scope recoil did not settle back to rest');
  }
});

check('bots patrol, engage and die', () => {
  // dropped into the middle corridors rather than at the team spawns: the
  // arena is 160 x 132 m and they would spend the whole test walking towards
  // each other before anyone could open fire.
  for (let i = 0; i < 4; i++) {
    const team = i % 2 ? 'blue' : 'red';
    const bot = new Bot({ team, level, textures, index: i });
    bot.spawn(new THREE.Vector3(i < 2 ? -4 : 4, 0, team === 'blue' ? 15 : -15));
    scene.add(bot.rig.root);
    bots.push(bot);
  }
  let shotCount = 0;
  const world = {
    time: 0,
    findTarget: (b) => bots.find((o) => o !== b && o.alive && o.team !== b.team) || null,
    botShoot: () => { shotCount++; },
  };
  for (let step = 0; step < 600; step++) {
    world.time = step / 60;
    for (const b of bots) b.update(1 / 60, world);
  }
  for (const b of bots) {
    finiteVec(b.position, b.name + ' position');
    if (b.position.y < -3) throw new Error(b.name + ' fell through the floor');
  }
  if (shotCount === 0) throw new Error('bots never opened fire');
  if (bots[0].armor !== 50) throw new Error('bot did not spawn with 50 armor: ' + bots[0].armor);
  bots[0].hit(20, new THREE.Vector3(1, 0, 0), 'chest', bots[1]);
  if (Math.abs(bots[0].armor - 34) > 0.001) throw new Error('bot armor did not absorb 80%: ' + bots[0].armor);
  if (Math.abs(bots[0].health - 96) > 0.001) throw new Error('bot health did not take 20%: ' + bots[0].health);
  bots[0].hit(500, new THREE.Vector3(1, 0, 0), 'head', bots[1]);
  if (bots[0].alive) throw new Error('bot survived 500 damage');
  for (let step = 0; step < 120; step++) bots[0].update(1 / 60, world);
  finiteVec(bots[0].rig.root.position, 'dead bot position');
});

check('effects pools', () => {
  const p = new THREE.Vector3(1, 1, 1);
  const n = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 120; i++) {
    effects.impact(p, n, 'metal', 1);
    effects.blood(p, n, 1);
    effects.tracer(new THREE.Vector3(), p);
    effects.ejectShell(p, n, n, n, 'normal');
    effects.bloodSplat(1, 2);
    effects.muzzleSmoke(p, n);
    effects.update(1 / 60);
  }
  for (let i = 0; i < 400; i++) effects.update(1 / 60);
});

check('hud renders every screen', () => {
  const canvas = makeCanvas(480, 270);
  hud = new Hud(canvas, settings);
  hud.resize(480, 270);
  hud.pushKill({ killer: 'ALPHA-1', victim: 'KILO-2', killerTeam: 'blue', victimTeam: 'red', weapon: 'rifle', headshot: true, highlight: true });
  hud.banner('DOUBLE KILL', 'NICE', 2);
  hud.notice('ENEMY SPOTTED');
  hud.damageNumber(new THREE.Vector3(0, 1, -5), 37, true);
  hud.hit('killHead');
  const state = (mode) => ({
    mode, camera, yaw: 1.2, fps: 60, showScoreboard: true,
    hitDirections: [{ dir: new THREE.Vector3(1, 0, 0), t: 1.2 }],
    crosshairHot: true,
    player: {
      health: 62, maxHealth: 100, armor: 20, maxArmor: 50, alive: mode !== 'dead',
      crouching: false, sprinting: true, killedBy: { name: 'KILO-3' }, killedByWeapon: 'sniper', respawnIn: 3,
    },
    weapon: {
      id: 'sniper', name: 'LONGBOW M7', cls: 'BOLT-ACTION', mag: 3, magSize: 5, reserve: 25,
      reloading: true, reloadProgress: 0.4, adsBlend: 0.9, scoped: mode === 'playing',
      fireMode: 'BOLT',
    },
    match: { blueTickets: 42, redTickets: 51, maxTickets: 60, winner: 'blue' },
    score: { total: 1250, kills: 9, deaths: 4 },
    scoreboard: [
      { name: 'YOU', team: 'blue', kills: 9, deaths: 4, score: 1250, isPlayer: true, alive: true },
      { name: 'KILO-1', team: 'red', kills: 3, deaths: 6, score: 300, isPlayer: false, alive: false },
    ],
  });
  for (const mode of ['title', 'playing', 'paused', 'settings', 'dead', 'gameover']) {
    hud.update(1 / 60);
    hud.render(state(mode));
    if (mode !== 'playing' && hud.buttons.length === 0 && mode !== 'dead') {
      throw new Error('no buttons drawn for mode ' + mode);
    }
  }
  if (hud.pick(0.5, 0.5) === undefined) throw new Error('pick returned undefined');
});

console.log('');
if (failures) {
  console.log(`${failures} check(s) FAILED\n`);
  process.exit(1);
} else {
  console.log('all checks passed\n');
}
