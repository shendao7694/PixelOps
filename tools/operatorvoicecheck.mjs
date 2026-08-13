import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installDomStub } from './domstub.mjs';

const { makeCanvas } = installDomStub();
const {
  OPERATOR_SUBTITLE_FADE_SECONDS,
  OPERATOR_SUBTITLE_LIMIT,
  OPERATOR_VOICE_LINES,
  OPERATOR_VOICE_MAX_DISTANCE,
  OPERATOR_VOICE_SAMPLE_URLS,
  SELF_OPERATOR_VOICE_CHANCE,
  TEAMMATE_OPERATOR_VOICE_COOLDOWN_SECONDS,
  operatorVoiceActionForGrenade,
  operatorVoiceGain,
  operatorVoiceLine,
  operatorVoiceShouldTrigger,
  teammateOperatorVoiceReady,
} = await import('../src/game/operator-voice.js');
const { AudioEngine, SAMPLE_URLS } = await import('../src/core/audio.js');
const { Hud } = await import('../src/ui/hud.js');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\noperator voice and subtitle audit\n');

const allLines = Object.values(OPERATOR_VOICE_LINES)
  .flatMap((audience) => Object.values(audience).flat());
check('all twenty supplied voice files have one immutable subtitle record',
  allLines.length === 20 && new Set(allLines.map((line) => line.sample)).size === 20);
check('every declared voice sample exists and is preloaded by the audio engine',
  allLines.every((line) =>
    OPERATOR_VOICE_SAMPLE_URLS[line.sample] === line.url
      && SAMPLE_URLS[line.sample] === line.url
      && existsSync(fileURLToPath(line.url))));
check('every audio record carries matching non-empty English and Chinese captions',
  allLines.every((line) =>
    typeof line.captions.en === 'string' && line.captions.en.length > 0
      && typeof line.captions.zh === 'string' && line.captions.zh.length > 0));
check('incendiary and frag share grenade callouts while Molotov stays separate',
  operatorVoiceActionForGrenade('frag') === 'grenade'
    && operatorVoiceActionForGrenade('incendiary') === 'grenade'
    && operatorVoiceActionForGrenade('molotov') === 'molotov');
check('one seed deterministically selects the exact audio/subtitle record',
  operatorVoiceLine('grenade', 'self', 1)?.sample === 'voiceSelfGrenade2'
    && operatorVoiceLine('grenade', 'teammate', 4)?.sample === 'voiceTeamGrenade2'
    && operatorVoiceLine('molotov', 'teammate', 1)?.captions.en === 'Use the Molotov!');
check('sentry placement and Juggernaut request are self operator callouts',
  operatorVoiceLine('sentry', 'self', 0)?.sample === 'voiceSelfSentry'
    && operatorVoiceLine('juggernaut', 'self', 0)?.sample === 'voiceSelfJuggernautCall'
    && !OPERATOR_VOICE_LINES.teammate.sentry
    && !OPERATOR_VOICE_LINES.teammate.juggernaut);
check('laser-cannon draw callouts own exact self and teammate subtitle records',
  operatorVoiceLine('laser_cannon', 'self', 0)?.sample === 'voiceSelfLaserCannon1'
    && operatorVoiceLine('laser_cannon', 'self', 1)?.captions.en
      === 'Shoot at me! I shoot you back!'
    && operatorVoiceLine('laser_cannon', 'teammate', 0)?.captions.en
      === "You ask for my life, here's my answer!"
    && operatorVoiceLine('laser_cannon', 'teammate', 1)?.captions.zh
      === '游戏时间到了！');
check('self callouts are guaranteed regardless of the old chance roll',
  SELF_OPERATOR_VOICE_CHANCE === 1
    && operatorVoiceShouldTrigger('self', 0)
    && operatorVoiceShouldTrigger('self', 0.999999)
    && operatorVoiceShouldTrigger('self', 1)
    && operatorVoiceShouldTrigger('self', Number.NaN)
    && operatorVoiceShouldTrigger('teammate', 0.99));
check('consecutive self variants cannot repeat when alternatives exist',
  operatorVoiceLine('reload', 'self', 0, 'voiceSelfReload1')?.sample
    !== 'voiceSelfReload1'
    && operatorVoiceLine('grenade', 'self', 1, 'voiceSelfGrenade2')?.sample
      === 'voiceSelfGrenade1');
check('each teammate has an exact thirty-second voice cooldown',
  TEAMMATE_OPERATOR_VOICE_COOLDOWN_SECONDS === 30
    && !teammateOperatorVoiceReady(10, 39.999)
    && teammateOperatorVoiceReady(10, 40)
    && teammateOperatorVoiceReady(undefined, 0));

check('squad voice loses exactly 1.5 percentage points per metre',
  operatorVoiceGain(0) === 1
    && Math.abs(operatorVoiceGain(1) - 0.985) < 1e-9
    && Math.abs(operatorVoiceGain(10) - 0.85) < 1e-9
    && Math.abs(operatorVoiceGain(OPERATOR_VOICE_MAX_DISTANCE) - 0.55) < 1e-9);
check('squad voice is inaudible beyond thirty metres',
  operatorVoiceGain(OPERATOR_VOICE_MAX_DISTANCE + 0.001) === 0);

const audio = new AudioEngine({ volume: 1 });
audio.ready = true;
let sampleCall = null;
audio._sample = (name, options) => {
  sampleCall = { name, options };
  return true;
};
audio.operatorVoice('voiceTeamReload1', {
  pos: { x: 10, y: 0, z: 0 },
  gain: operatorVoiceGain(10),
});
check('operator audio bypasses generic inverse-square attenuation without losing world pan',
  sampleCall?.name === 'voiceTeamReload1'
    && sampleCall.options.pos.x === 10
    && sampleCall.options.distanceAttenuation === false
    && Math.abs(sampleCall.options.gain - 0.86 * 0.85) < 1e-9,
  JSON.stringify(sampleCall));

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/pvp-server.mjs', import.meta.url), 'utf8');
check('local operator lines enter the shared FIFO and leave it only after playback starts',
  /this\.pendingSelfOperatorVoices\.push\(\{[\s\S]{0,220}sequence: \+\+this\.dialogueSequence/.test(mainSource)
    && /consider\('operator', this\.pendingSelfOperatorVoices\)/.test(mainSource)
    && /if \(!played\) return false;[\s\S]{0,100}next\.queue\.splice/.test(mainSource)
    && /tryPlaySelfOperatorVoice[\s\S]{0,300}pushOperatorSubtitle/.test(mainSource));
check('laser-cannon draw voice is local in PVE and team-wide in PVP',
  /viewModel\.equip\(LASER_CANNON_ID\);[\s\S]{0,320}action: 'laser_cannon'/.test(mainSource)
    && mainSource.includes('if (!self && !teamWide)')
    && mainSource.includes('teamWide: Boolean(message.teamWide)')
    && serverSource.includes("broadcastOperatorVoice(room, player, 'laser_cannon', now, {")
    && /broadcastOperatorVoice\(room, player, 'laser_cannon', now,[\s\S]{0,120}teamWide: true/.test(serverSource));

const hud = new Hud(makeCanvas(480, 270), { language: 'en' });
for (let i = 1; i <= 4; i++) {
  hud.pushOperatorSubtitle({
    self: i === 4,
    speakerName: `ALLY-${i}`,
    captions: { en: `LINE ${i}`, zh: `第${i}行` },
  });
}
check('HUD keeps no more than three subtitles and evicts the oldest',
  hud.subtitles.length === OPERATOR_SUBTITLE_LIMIT
    && hud.subtitles.map((line) => line.captions.en).join(',') === 'LINE 2,LINE 3,LINE 4');

const englishDraws = [];
const originalText = hud.text.bind(hud);
hud.text = (text, x, y, options = {}) => {
  englishDraws.push({
    text: String(text),
    x,
    y,
    color: options.color,
    alpha: hud.ctx.globalAlpha,
  });
  return originalText(text, x, y, options);
};
hud.drawOperatorSubtitles({});
const englishBodies = englishDraws.filter((draw) => draw.text.startsWith('LINE'));
check('older subtitles render above newer subtitles',
  englishBodies.length === 3
    && englishBodies[0].text === 'LINE 2'
    && englishBodies[0].y < englishBodies[1].y
    && englishBodies[1].y < englishBodies[2].y);
check('English self and teammate prefixes use the requested green and blue colors',
  englishDraws.some((draw) => draw.text === 'ME:' && draw.color === '#7de08a')
    && englishDraws.some((draw) => draw.text === 'ALLY-2:' && draw.color === '#4fa3ff'));

hud.settings.language = 'zh-CN';
hud.subtitles.at(-1).t = OPERATOR_SUBTITLE_FADE_SECONDS * 0.5;
const chineseDraws = [];
hud.text = (text, x, y, options = {}) => {
  chineseDraws.push({
    text: String(text),
    y,
    color: options.color,
    alpha: hud.ctx.globalAlpha,
  });
  return originalText(text, x, y, options);
};
hud.drawOperatorSubtitles({});
check('Chinese mode switches both the self prefix and each subtitle body',
  chineseDraws.some((draw) => draw.text === '我：' && draw.color === '#7de08a')
    && chineseDraws.some((draw) => draw.text === '第4行'));
check('subtitles fade out instead of disappearing on the final frame',
  chineseDraws
    .filter((draw) => draw.text === '我：' || draw.text === '第4行')
    .every((draw) => Math.abs(draw.alpha - 0.5) < 1e-9));

if (failures) {
  console.log(`\n${failures} operator voice check(s) failed\n`);
  process.exit(1);
}
console.log('\noperator voices, distance falloff and bilingual subtitles verified\n');
