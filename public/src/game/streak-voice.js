// Killstreak radio traffic. Keep the audio file, both subtitle languages and
// the localized speaker label in one immutable record so a random variant can
// never be paired with another recording's words.

function streakVoiceLine(sample, file, duration, speaker, en, zh) {
  return Object.freeze({
    sample,
    url: `../../audio/attack/${file}`,
    duration,
    speaker: Object.freeze(speaker),
    captions: Object.freeze({ en, zh }),
  });
}

const STRIKER = Object.freeze({
  en: '“STRIKER” 3-1',
  zh: '“打击者”3-1',
});
const UAV_OPERATOR = Object.freeze({
  en: 'UAV OPERATOR',
  zh: 'UAV操作员',
});
const HUNTER = Object.freeze({
  en: '“HUNTER” 2-2',
  zh: '“猎杀者”2-2',
});
const JAGUAR = Object.freeze({
  en: '“JAGUAR” 3-1',
  zh: '“美洲豹”3-1',
});
const AW101_PILOT = Object.freeze({
  en: 'AW101 PILOT',
  zh: 'AW101飞行员',
});
const SQUAD_LEADER = Object.freeze({
  en: 'SQUAD LEADER',
  zh: '小队指挥官',
});

export const STREAK_VOICE_LINES = Object.freeze({
  cas_inbound: Object.freeze([
    streakVoiceLine('streakCasInbound', 'a10flyover.mp3', 2.638, STRIKER, 'This is Striker 3-1, good copy. Strike inbound.', '这里是"打击者"3-1，收到。空袭正在进入。'),
  ]),
  cas_hit: Object.freeze([
    streakVoiceLine('streakCasHit1', 'a10shoot.mp3', 1.176, STRIKER, 'Splash, good kill.', '命中，确认击杀。'),
  ]),
  cas_miss: Object.freeze([
    streakVoiceLine('streakCasMiss1', 'a10shoot.mp3', 1.332, STRIKER, 'No hits on that run.', '本轮攻击未命中。'),
  ]),
  uav_inbound: Object.freeze([
    streakVoiceLine('streakUavInbound', 'uavjoin.mp3', 2.064, UAV_OPERATOR, 'UAV entering the AO.', '无人机正在进入作战区域。'),
  ]),
  uav_outbound: Object.freeze([
    streakVoiceLine('streakUavOutbound', 'uavleave.mp3', 4.232, UAV_OPERATOR, 'Be advised, UAV is bingo fuel, RTB for resupply.', '注意，无人机燃料不足，正在返航补给。'),
  ]),
  enemy_uav_inbound: Object.freeze([
    streakVoiceLine('streakEnemyUavInbound', 'enemyuavjoin.mp3', 1.907, SQUAD_LEADER, 'Enemy UAV overhead!', '敌方UAV已上线！'),
  ]),
  firebomb_inbound: Object.freeze([
    streakVoiceLine('streakFirebombInbound', 'incendiary-bomb-air-raid-join.mp3', 3.396, STRIKER, 'This is Striker 3-1, dropping Whiskey Pete on your mark.', '这里是"打击者"3-1，正在按你的标记投放白磷燃烧弹。'),
  ]),
  attack_helicopter_inbound: Object.freeze([
    streakVoiceLine('streakHelicopterInbound', 'helicopterjoin1.mp3', 2.377, HUNTER, 'Hunter 2-2 on station, weapons hot.', '"猎杀者"2-2已抵达，武器已解锁。'),
    streakVoiceLine('streakHelicopterInbound2', 'helicopterjoin2.mp3', 2.377, HUNTER, 'Hunter 2-2 in position.', '"猎杀者"2-2就位。'),
  ]),
  attack_helicopter_outbound: Object.freeze([
    streakVoiceLine('streakHelicopterOutbound1', 'helicopterleave1.mp3', 3.03, HUNTER, 'This is Hunter 2, we are bingo fuel, returning to base.', '这里是"猎杀者"2，燃料不足，正在返回基地。'),
    streakVoiceLine('streakHelicopterOutbound2', 'helicopterleave2.mp3', 1.985, HUNTER, 'Hunter 2, resuming patrol.', '"猎杀者"2，恢复巡逻。'),
  ]),
  tv_missile_inbound: Object.freeze([
    streakVoiceLine('streakTvMissileInbound', 'missile.mp3', 2.821, JAGUAR, 'Cruise missile inbound.', '巡航导弹正在进入。'),
  ]),
  enemy_tv_missile_inbound: Object.freeze([
    streakVoiceLine('streakEnemyTvMissileInbound', 'missile.mp3', 1.802, SQUAD_LEADER, 'Enemy missile inbound!', '敌方导弹来袭！'),
  ]),
  juggernaut_inbound: Object.freeze([
    streakVoiceLine('streakJuggernautInbound', 'fearless-helicopter.mp3', 2.821, AW101_PILOT, 'Juggernaut armor is on the way.', '无畏战士装甲正在运抵。'),
  ]),
});

const ALL_STREAK_LINES = Object.freeze(Object.values(STREAK_VOICE_LINES).flat());

export const STREAK_VOICE_SAMPLE_URLS = Object.freeze(
  Object.fromEntries(ALL_STREAK_LINES.map((line) => [line.sample, line.url]))
);

export function randomStreakVoiceSeed() {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

export function streakVoiceLineFor(cue, seed = 0) {
  const lines = STREAK_VOICE_LINES[cue];
  if (!lines?.length) return null;
  const finiteSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 0;
  const index = ((finiteSeed % lines.length) + lines.length) % lines.length;
  return lines[index];
}

export function casOutcomeVoiceCue(enemyKills) {
  return Number(enemyKills) > 0 ? 'cas_hit' : 'cas_miss';
}
