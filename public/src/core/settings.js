import { clamp } from './math.js';
import { DEFAULT_LANGUAGE, normalizeLanguage } from './i18n.js';

const KEY = 'pixelops.settings.v1';

const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const DEFAULTS = {
  language: DEFAULT_LANGUAGE,
  sensitivity: 1.0,
  fov: 80,
  pixelHeight: 540,
  paletteLevels: 24,
  scanlines: true,
  volume: 0.7,
  viewBob: 1.0,
  botCount: 5,
};

export const SETTING_DEFS = [
  {
    key: 'language',
    label: 'LANGUAGE',
    choices: ['en', 'zh-CN'],
    fmt: (v) => (normalizeLanguage(v) === 'zh-CN' ? 'CHINESE' : 'ENGLISH'),
  },
  { key: 'sensitivity', label: 'SENSITIVITY', min: 0.15, max: 3.0, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: 'fov', label: 'FIELD OF VIEW', min: 65, max: 105, step: 1, fmt: (v) => String(Math.round(v)) },
  { key: 'pixelHeight', label: 'PIXEL SCALE', min: 180, max: 540, step: 18, fmt: (v) => Math.round(v) + 'P' },
  { key: 'paletteLevels', label: 'COLOR DEPTH', min: 6, max: 48, step: 2, fmt: (v) => Math.round(v) + ' LV' },
  { key: 'scanlines', label: 'SCANLINES', bool: true, fmt: (v) => (v ? 'ON' : 'OFF') },
  { key: 'viewBob', label: 'VIEW BOB', min: 0, max: 1.6, step: 0.1, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'volume', label: 'VOLUME', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'botCount', label: 'BOTS PER TEAM', min: 2, max: 8, step: 1, fmt: (v) => String(Math.round(v)) },
];

export function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
  } catch (e) {}
  for (const def of SETTING_DEFS) {
    if (def.choices) s[def.key] = normalizeLanguage(s[def.key]);
    else if (def.bool) s[def.key] = !!s[def.key];
    else s[def.key] = clamp(Number(s[def.key]) || DEFAULTS[def.key], def.min, def.max);
  }
  if (isMobile && s.pixelHeight < 360) {
    s.pixelHeight = 360;
  }
  return s;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {}
}

export function adjustSetting(settings, key, dir) {
  const def = SETTING_DEFS.find((d) => d.key === key);
  if (!def) return;
  if (def.choices) {
    const current = Math.max(0, def.choices.indexOf(normalizeLanguage(settings[key])));
    const step = dir < 0 ? -1 : 1;
    settings[key] = def.choices[
      (current + step + def.choices.length) % def.choices.length
    ];
  } else if (def.bool) settings[key] = !settings[key];
  else settings[key] = clamp(Math.round((settings[key] + dir * def.step) * 1000) / 1000, def.min, def.max);
  if (isMobile && key === 'pixelHeight' && settings[key] < 360) {
    settings[key] = 360;
  }
  saveSettings(settings);
}