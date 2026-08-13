// Short operator callouts shared by PVE, the authoritative PVP server and the
// HUD. Audio and both subtitle languages live in the same immutable record so
// a randomly selected voice can never display another file's words.

export const OPERATOR_VOICE_MAX_DISTANCE = 30;
export const OPERATOR_VOICE_FALLOFF_PER_METRE = 0.015;
// Local-player callouts are guaranteed. They are queued by the game when the
// shared dialogue channel is busy, so an input action never silently loses its
// matching spoken line.
export const SELF_OPERATOR_VOICE_CHANCE = 1;
export const TEAMMATE_OPERATOR_VOICE_COOLDOWN_SECONDS = 30;
export const OPERATOR_SUBTITLE_SECONDS = 3.1;
export const OPERATOR_SUBTITLE_FADE_SECONDS = 0.7;
export const OPERATOR_SUBTITLE_LIMIT = 3;

function voiceLine(sample, file, en, zh, folder = 'voice') {
  return Object.freeze({
    sample,
    url: `../../audio/${folder}/${file}`,
    captions: Object.freeze({ en, zh }),
  });
}

const SELF_LINES = Object.freeze({
  reload: Object.freeze([
    voiceLine('voiceSelfReload1', 'reload1.mp3', 'Reloading!', '正在换弹！'),
    voiceLine('voiceSelfReload2', 'reload2.mp3', 'Reloading!', '正在换弹！'),
    voiceLine('voiceSelfReload3', 'reload3.mp3', 'Changing mag!', '更换弹匣！'),
  ]),
  grenade: Object.freeze([
    voiceLine('voiceSelfGrenade1', 'grenade1.mp3', 'Grenade out!', '手雷！'),
    voiceLine('voiceSelfGrenade2', 'grenade2.mp3', 'Throwing grenade!', '扔手雷！'),
  ]),
  molotov: Object.freeze([
    voiceLine('voiceSelfMolotov1', 'throw-molotov-cocktail1.mp3', 'Molotov out!', '燃烧瓶！'),
  ]),
  machine_gun: Object.freeze([
    voiceLine('voiceSelfMachineGun1', 'machine-gun1.mp3', 'Firing!', '开火！'),
    voiceLine('voiceSelfMachineGun2', 'machine-gun2.mp3', 'Suppress them!', '压制他们！'),
  ]),
  sentry: Object.freeze([
    voiceLine('voiceSelfSentry', 'sentinel-gun.mp3', 'Sentry gun deployed!', '哨兵机枪已部署！', 'attack'),
  ]),
  juggernaut: Object.freeze([
    voiceLine('voiceSelfJuggernautCall', 'fearless-call.mp3', 'Requesting Juggernaut armor!', '请求投放无畏战士装甲！', 'attack'),
  ]),
});

const TEAMMATE_LINES = Object.freeze({
  reload: Object.freeze([
    voiceLine('voiceTeamReload1', 'teammate-reloading1.mp3', 'Reloading!', '正在换弹！'),
    voiceLine('voiceTeamReload2', 'teammate-reloading2.mp3', 'Reloading!', '正在换弹！'),
    voiceLine('voiceTeamReload3', 'teammate-reloading3.mp3', 'Changing mags!', '更换弹匣！'),
  ]),
  grenade: Object.freeze([
    voiceLine('voiceTeamGrenade1', 'teammate-throw-grenade1.mp3', 'Grenade out!', '手雷！'),
    voiceLine('voiceTeamGrenade2', 'teammate-throw-grenade2.mp3', 'Grenade out!', '手雷！'),
    voiceLine('voiceTeamGrenade3', 'teammate-throw-grenade3.mp3', 'Frag out!', '破片手雷！'),
  ]),
  molotov: Object.freeze([
    voiceLine('voiceTeamMolotov1', 'teammate-throw-molotov-cocktail1.mp3', 'Molotov out!', '燃烧瓶！'),
    voiceLine('voiceTeamMolotov2', 'teammate-throw-molotov-cocktail2.mp3', 'Use the Molotov!', '使用燃烧瓶！'),
  ]),
  laser_cannon: Object.freeze([
    voiceLine(
      'voiceTeamLaserCannon1',
      'teammate-machine-gun1.mp3',
      "You ask for my life, here's my answer!",
      '想要我的命？这就是我的回答！'
    ),
    voiceLine(
      'voiceTeamLaserCannon2',
      'teammate-machine-gun2.mp3',
      "It's game time!",
      '游戏时间到了！'
    ),
  ]),
});

export const OPERATOR_VOICE_LINES = Object.freeze({
  self: SELF_LINES,
  teammate: TEAMMATE_LINES,
});

const ALL_LINES = Object.freeze([
  ...Object.values(SELF_LINES).flat(),
  ...Object.values(TEAMMATE_LINES).flat(),
]);

export const OPERATOR_VOICE_SAMPLE_URLS = Object.freeze(
  Object.fromEntries(ALL_LINES.map((line) => [line.sample, line.url]))
);

export function operatorVoiceActionForGrenade(kind) {
  return String(kind || '').toLowerCase() === 'molotov' ? 'molotov' : 'grenade';
}

export function randomOperatorVoiceSeed() {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

export function operatorVoiceLine(action, audience, seed = 0, previousSample = null) {
  const lines = OPERATOR_VOICE_LINES[audience]?.[action];
  if (!lines?.length) return null;
  const finiteSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 0;
  let index = ((finiteSeed % lines.length) + lines.length) % lines.length;
  // When an action has alternatives, consecutive self callouts must not reuse
  // the same recording. A one-line pool (currently the self Molotov callout)
  // necessarily keeps its only supplied recording.
  if (audience === 'self' && lines.length > 1
    && lines[index].sample === previousSample) {
    index = (index + 1) % lines.length;
  }
  return lines[index];
}

export function operatorVoiceShouldTrigger(audience, roll = Math.random()) {
  if (audience !== 'self') return true;
  if (SELF_OPERATOR_VOICE_CHANCE >= 1) return true;
  const chanceRoll = Number(roll);
  return Number.isFinite(chanceRoll)
    && chanceRoll >= 0
    && chanceRoll < SELF_OPERATOR_VOICE_CHANCE;
}

export function teammateOperatorVoiceReady(lastAt, now) {
  const previous = Number(lastAt);
  const current = Number(now);
  if (!Number.isFinite(previous)) return true;
  if (!Number.isFinite(current)) return false;
  return current - previous >= TEAMMATE_OPERATOR_VOICE_COOLDOWN_SECONDS;
}

/**
 * Linear squad-radio attenuation requested by design: every metre removes
 * exactly 1.5 percentage points, and anything beyond 30 m is inaudible.
 */
export function operatorVoiceGain(distance) {
  const metres = Number(distance);
  if (!Number.isFinite(metres) || metres < 0
    || metres > OPERATOR_VOICE_MAX_DISTANCE) return 0;
  return Math.max(0, 1 - metres * OPERATOR_VOICE_FALLOFF_PER_METRE);
}
