import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installDomStub } from './domstub.mjs';

const { makeCanvas } = installDomStub();
const {
  STREAK_VOICE_LINES,
  STREAK_VOICE_SAMPLE_URLS,
  casOutcomeVoiceCue,
  streakVoiceLineFor,
} = await import('../src/game/streak-voice.js');
const {
  AudioEngine,
  JUGGERNAUT_BREATH_LOOP_GAP_SECONDS,
  JUGGERNAUT_BREATH_LOOP_OFFSET_SECONDS,
  SAMPLE_URLS,
} = await import('../src/core/audio.js');
const { Hud } = await import('../src/ui/hud.js');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nkillstreak radio voice audit\n');

const allLines = Object.values(STREAK_VOICE_LINES).flat();
check('all fifteen radio recordings have immutable subtitle records',
  allLines.length === 15
    && new Set(allLines.map((line) => line.sample)).size === 15
    && allLines.every(Object.isFrozen));
check('every killstreak recording exists and is preloaded',
  allLines.every((line) =>
    STREAK_VOICE_SAMPLE_URLS[line.sample] === line.url
      && SAMPLE_URLS[line.sample] === line.url
      && existsSync(fileURLToPath(line.url))));
check('every line owns English and Chinese speakers plus matching subtitles',
  allLines.every((line) =>
    line.speaker.en && line.speaker.zh
      && line.captions.en && line.captions.zh
      && Number(line.duration) > 0));
check('the requested radio callsigns are localized exactly once',
  STREAK_VOICE_LINES.cas_inbound[0].speaker.zh === '“打击者”3-1'
    && STREAK_VOICE_LINES.uav_inbound[0].speaker.zh === 'UAV操作员'
    && STREAK_VOICE_LINES.attack_helicopter_inbound[0].speaker.zh === '“猎杀者”2-2'
    && STREAK_VOICE_LINES.tv_missile_inbound[0].speaker.zh === '“美洲豹”3-1'
    && STREAK_VOICE_LINES.enemy_uav_inbound[0].speaker.zh === '小队指挥官'
    && STREAK_VOICE_LINES.enemy_tv_missile_inbound[0].speaker.zh === '小队指挥官');
check('TV missile and Juggernaut helicopter use their dedicated recordings',
  streakVoiceLineFor('tv_missile_inbound')?.sample === 'streakTvMissileInbound'
    && streakVoiceLineFor('juggernaut_inbound')?.sample === 'streakJuggernautInbound'
    && streakVoiceLineFor('enemy_uav_inbound')?.sample === 'streakEnemyUavInbound'
    && streakVoiceLineFor('enemy_tv_missile_inbound')?.sample
      === 'streakEnemyTvMissileInbound');
check('random A-10 result and helicopter departure variants are deterministic',
  streakVoiceLineFor('cas_hit', 0)?.sample === 'streakCasHit1'
    && streakVoiceLineFor('cas_hit', 1)?.sample === 'streakCasHit2'
    && streakVoiceLineFor('cas_miss', 1)?.sample === 'streakCasMiss2'
    && streakVoiceLineFor('attack_helicopter_outbound', 1)?.sample
      === 'streakHelicopterOutbound2');
check('A-10 outcome routing depends only on whether an enemy was killed',
  casOutcomeVoiceCue(0) === 'cas_miss'
    && casOutcomeVoiceCue(1) === 'cas_hit'
    && casOutcomeVoiceCue(12) === 'cas_hit');

const audio = new AudioEngine({ volume: 1 });
audio.ready = true;
const sampleCalls = [];
let releaseFirst = null;
audio._sample = (name, options) => {
  sampleCalls.push({ name, options });
  if (!releaseFirst) releaseFirst = options.onEnded;
  return true;
};
const firstAccepted = audio.operatorVoice('voiceSelfReload1');
const overlapRejected = !audio.streakVoice('streakCasInbound');
releaseFirst?.();
const streakAccepted = audio.streakVoice('streakCasInbound');
check('all character and killstreak lines share one non-overlapping channel',
  firstAccepted && overlapRejected && streakAccepted && sampleCalls.length === 2);
check('quiet killstreak recordings receive the requested radio gain lift',
  sampleCalls[1]?.options?.gain === 1.35
    && sampleCalls[1]?.options?.distanceAttenuation === false);

const breathingAudio = new AudioEngine({ volume: 1 });
breathingAudio.ready = true;
const breathingCalls = [];
breathingAudio._sample = (name, options) => {
  breathingCalls.push({ name, options });
  return true;
};
const breathingStarted = breathingAudio.startJuggernautBreathing();
breathingCalls[0]?.options.onEnded?.();
check('Juggernaut respirator repeats from 1.5 seconds after an exact 0.4-second gap',
  breathingStarted
    && breathingCalls[0]?.name === 'juggernautBreathing'
    && breathingCalls[0].options.offset === 0
    && breathingCalls[0].options.delay === 0
    && breathingCalls[1]?.name === 'juggernautBreathing'
    && breathingCalls[1].options.offset === JUGGERNAUT_BREATH_LOOP_OFFSET_SECONDS
    && JUGGERNAUT_BREATH_LOOP_OFFSET_SECONDS === 1.5
    && breathingCalls[1].options.delay === JUGGERNAUT_BREATH_LOOP_GAP_SECONDS
    && JUGGERNAUT_BREATH_LOOP_GAP_SECONDS === 0.4
    && breathingCalls.every((call) => call.options.loop !== true)
    && SAMPLE_URLS.juggernautBreathing
    && existsSync(fileURLToPath(SAMPLE_URLS.juggernautBreathing)));
breathingAudio.stopJuggernautBreathing();
breathingCalls[1]?.options.onEnded?.();
check('stopping the respirator invalidates an already-ended repeat callback',
  breathingCalls.length === 2 && !breathingAudio.juggernautBreathingActive);

const hud = new Hud(makeCanvas(480, 270), { language: 'en' });
const line = STREAK_VOICE_LINES.cas_inbound[0];
hud.pushOperatorSubtitle({
  speakerNames: line.speaker,
  speakerColor: '#ffcc66',
  captions: line.captions,
  duration: line.duration + 0.45,
});
const draws = [];
const originalText = hud.text.bind(hud);
hud.text = (text, x, y, options = {}) => {
  draws.push({ text: String(text), color: options.color });
  return originalText(text, x, y, options);
};
hud.drawOperatorSubtitles({});
hud.settings.language = 'zh-CN';
hud.drawOperatorSubtitles({});
check('radio subtitles switch both callsign and body between English and Chinese',
  draws.some((draw) => draw.text === '“STRIKER” 3-1:' && draw.color === '#ffcc66')
    && draws.some((draw) => draw.text === '“打击者”3-1：' && draw.color === '#ffcc66')
    && draws.some((draw) => draw.text.includes('Strike inbound'))
    && draws.some((draw) => draw.text.includes('空袭正在进入')));

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/pvp-server.mjs', import.meta.url), 'utf8');
check('PVE schedules the two 0.2-second inbound calls and evaluates A-10 kills',
  /scheduleStreakVoice\('cas_inbound', 0\.2\)/.test(mainSource)
    && /scheduleStreakVoice\('firebomb_inbound', 0\.2\)/.test(mainSource)
    && /casOutcomeVoiceCue\(run\.enemyKills\)/.test(mainSource));
check('TV missile radio waits 0.3 seconds after tablet entry',
  /call\.type === 'strike'[\s\S]{0,120}call\.age >= 0\.3[\s\S]{0,120}playStreakVoice\('tv_missile_inbound'\)/.test(mainSource));
check('Juggernaut character call starts with the radio animation before its helicopter radio',
  /call\.type === 'juggernaut' && !call\.operatorVoiceAttempted[\s\S]{0,220}action: 'juggernaut'/.test(mainSource)
    && /playStreakVoice\('juggernaut_inbound'\)/.test(mainSource)
    && /cue: 'juggernaut_inbound'[\s\S]{0,100}ownerId: player\.id/.test(serverSource));
check('failed operator or killstreak playback remains queued instead of being discarded',
  /updatePendingDialogueVoices\(\)[\s\S]{0,900}if \(!played\) return false;[\s\S]{0,100}next\.queue\.splice/.test(mainSource));
check('PVP scopes friendly UAV radio and enemy threat warnings to the correct team',
  /cue: 'uav_inbound'[\s\S]{0,100}team: player\.team/.test(serverSource)
    && /cue: 'uav_outbound'[\s\S]{0,100}team/.test(serverSource)
    && /cue: 'enemy_uav_inbound'[\s\S]{0,140}player\.team === 'blue' \? 'red' : 'blue'/.test(serverSource)
    && /cue: 'enemy_tv_missile_inbound'[\s\S]{0,140}player\.team === 'blue' \? 'red' : 'blue'/.test(serverSource)
    && /cue: 'cas_inbound'[\s\S]{0,100}ownerId: player\.id/.test(serverSource)
    && /cue: 'firebomb_inbound'[\s\S]{0,100}ownerId: player\.id/.test(serverSource)
    && /cue: 'attack_helicopter_outbound'[\s\S]{0,100}ownerId: heli\.ownerId/.test(serverSource));
check('natural UAV expiry and helicopter departure own their radio calls',
  /timedOut[\s\S]{0,240}cue: 'uav_outbound'/.test(serverSource)
    && /departureStarted[\s\S]{0,320}cue: 'attack_helicopter_outbound'/.test(serverSource));

if (failures) {
  console.log(`\n${failures} killstreak voice check(s) failed\n`);
  process.exit(1);
}
console.log('\nkillstreak voices, scoping, timing and subtitles verified\n');
