import { installDomStub } from './domstub.mjs';
import {
  applyDocumentLanguage,
  localizeText,
  normalizeLanguage,
} from '../src/core/i18n.js';
import {
  SETTING_DEFS,
  adjustSetting,
  loadSettings,
} from '../src/core/settings.js';
import {
  LOADOUT_OPTIONS,
  createDefaultLoadout,
  sanitizeLoadout,
} from '../src/game/loadout.js';
import { drawText, textWidth } from '../src/ui/pixelfont.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nEnglish / Chinese localization audit\n');

const store = new Map();
globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); },
};

const defaults = loadSettings();
check('English is the default language for a fresh browser',
  defaults.language === 'en');
check('settings expose exactly one two-choice language row',
  SETTING_DEFS.filter((def) => def.key === 'language').length === 1
    && SETTING_DEFS.find((def) => def.key === 'language')?.choices?.join(',') === 'en,zh-CN');

adjustSetting(defaults, 'language', 1);
check('the settings arrows switch to Chinese and persist it',
  defaults.language === 'zh-CN'
    && JSON.parse(store.get('pixelops.settings.v1')).language === 'zh-CN');
adjustSetting(defaults, 'language', -1);
check('the language setting cycles back to English',
  defaults.language === 'en');
check('unsupported stored language values fall back to English',
  normalizeLanguage('de-DE') === 'en');

check('fixed menu and equipment copy has complete Chinese output',
  localizeText('SETTINGS', 'zh-CN') === '设置'
    && localizeText('SELECT SECONDARY WEAPON', 'zh-CN') === '选择副武器'
    && localizeText('Reduces all incoming explosive damage by 40%.', 'zh-CN')
      === '受到的所有爆炸伤害降低 40%。');
check('dynamic combat copy preserves names and translates the surrounding UI',
  localizeText('ALPHA-2 ACTIVATED UAV', 'zh-CN') === 'ALPHA-2 开启了 UAV'
    && localizeText('AUTO RESPAWN IN 4', 'zh-CN') === '4 秒后自动复活'
    && localizeText('PLAYER-8 // ONLINE // MAX 12', 'zh-CN')
      === 'PLAYER-8 // 在线 // 最多 12 人');
const streakContributionLabels = Object.freeze({
  UAV: 'UAV',
  'TV MISSILE': 'TV 导弹',
  JUGGERNAUT: '无畏战士',
  'SENTRY GUN': '哨兵机枪',
  'A-10 STRIKE': 'A-10 空袭',
  'INCENDIARY AIRSTRIKE': '燃烧弹空袭',
  'ATTACK HELICOPTER': '攻击直升机',
});
check('PVP killstreak contribution subtitles preserve player IDs in both languages',
  Object.entries(streakContributionLabels).every(([english, chinese]) =>
    localizeText(`ALPHA-2 USED ${english}`, 'zh-CN') === `ALPHA-2 使用了 ${chinese}`
      && localizeText(`ALPHA-2 USED ${english}`, 'en') === `ALPHA-2 USED ${english}`));
check('dynamic killstreak, vote and aircraft copy is fully translated',
  localizeText('KILLSTREAK 1', 'zh-CN') === '连杀奖励 1'
    && localizeText('KILLSTREAK X3', 'zh-CN') === '连杀 x3'
    && localizeText('ALPHA-2 SHOT IT DOWN', 'zh-CN') === 'ALPHA-2 将其击落'
    && localizeText('ALPHA-2 // 4 YES 1 NO', 'zh-CN') === 'ALPHA-2 // 4 票同意 1 票反对'
    && localizeText('+2 CHARGES // PRESS 5 TO DEPLOY', 'zh-CN')
      === '+2 次使用 // 按 5 部署');
check('English mode returns source text byte-for-byte',
  localizeText('AUTO RESPAWN IN 4', 'en') === 'AUTO RESPAWN IN 4');

const loadout = createDefaultLoadout();
const migrated = sanitizeLoadout({ ...loadout, secondary: 'm1911' });
check('removed sidearm placeholders cannot survive catalogue validation',
  LOADOUT_OPTIONS.secondary.length === 2
    && LOADOUT_OPTIONS.secondary.every((option) => option.live)
    && !LOADOUT_OPTIONS.secondary.some((option) =>
      ['p9', 'm1911', 'r8'].includes(option.id))
    && migrated.secondary === 'machine_pistol');
check('catalogue data is English-first and localizes only at display time',
  LOADOUT_OPTIONS.passives[0].name === 'BLAST PADDING'
    && localizeText(LOADOUT_OPTIONS.passives[0].name, 'zh-CN') === '防爆垫料');

const fakeDocument = { documentElement: { lang: '', dataset: {} } };
applyDocumentLanguage('zh-CN', fakeDocument);
check('document language metadata follows the active selection',
  fakeDocument.documentElement.lang === 'zh-CN'
    && fakeDocument.documentElement.dataset.language === 'zh-CN');

let nativeFillTextCalls = 0;
const nativeRects = [];
const nativeContext = {
  fillStyle: '',
  font: '',
  textAlign: 'left',
  textBaseline: 'top',
  save() {},
  restore() {},
  measureText(value) { return { width: String(value).length * 8 }; },
  fillText() { nativeFillTextCalls++; },
  fillRect(x, y, width, height) { nativeRects.push([x, y, width, height]); },
};
const chineseWidth = drawText(nativeContext, '设置', 20, 10, {
  align: 'center',
  shadow: false,
});
check('Chinese HUD labels use hard integer pixels without fillText antialiasing',
  nativeFillTextCalls === 0
    && nativeRects.length > 0
    && nativeRects.flat().every(Number.isInteger)
    && chineseWidth > 0
    && textWidth('设置') > 0);

const { makeCanvas, calls } = installDomStub();
const { Hud } = await import('../src/ui/hud.js');
const hudSettings = { ...loadSettings(), language: 'zh-CN' };
const canvas = makeCanvas(480, 270);
let hudFillTextCalls = 0;
canvas.getContext('2d').fillText = () => { hudFillTextCalls++; };
const hud = new Hud(canvas, hudSettings);
const rectsBeforeLocalizedText = calls.fillRect;
hud.text('SETTINGS', 10, 10, { shadow: false });
check('the shared HUD text sink localizes canvas menus automatically',
  hudFillTextCalls === 0 && calls.fillRect > rectsBeforeLocalizedText);

if (failures) {
  console.error(`\n${failures} localization check(s) failed`);
  process.exit(1);
}
console.log('\nLocalization verified\n');
