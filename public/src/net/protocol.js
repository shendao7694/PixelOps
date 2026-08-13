// Shared PVP wire constants. Keeping these in a browser/server-neutral module
// prevents the client UI and the authoritative simulation from drifting.
// Protocol 27 removes the obsolete rank/progress fields from every snapshot.
// Protocol 29 adds room maps, authoritative post-match map voting and assists.
export const PVP_PROTOCOL = 29;
export const PVP_TICK_RATE = 45;
export const PVP_TICK_MS = 1000 / PVP_TICK_RATE;
export const PVP_MOVEMENT_SUBSTEPS = 2;
export const PVP_ROOM_COUNT = 5;
export const PVP_ROOM_CAPACITY = 12;
export const PVP_TEAM_CAPACITY = PVP_ROOM_CAPACITY / 2;
export const PVP_RESPAWN_MS = 4500;
export const PVP_SPAWN_PROTECTION_MS = 3000;
export const PVP_MAX_MESSAGE_BYTES = 8192;
export const PVP_VOTE_KICK_COOLDOWN_MS = 2 * 60 * 1000;
export const PVP_VOTE_KICK_DURATION_MS = 30 * 1000;
export const PVP_VOTE_KICK_BAN_MS = 6 * 60 * 60 * 1000;
export const PVP_CHAT_MAX_CHARS = 80;
export const PVP_CHAT_COOLDOWN_MS = 800;
export const PVP_MATCH_SCORE_LIMIT = 75;
export const PVP_MAP_VOTE_DURATION_MS = 10 * 1000;

export const PVP_ROOM_IDS = Object.freeze(
  Array.from({ length: PVP_ROOM_COUNT }, (_, i) => `room-${i + 1}`)
);

export function roomNumber(id) {
  const index = PVP_ROOM_IDS.indexOf(id);
  return index < 0 ? 0 : index + 1;
}

export function sanitizePlayerName(value, fallback = 'PLAYER') {
  const clean = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 14);
  return clean || fallback;
}

export function sanitizeClientId(value) {
  const clean = String(value || '').trim().toLowerCase();
  return /^[a-f0-9-]{16,64}$/.test(clean) ? clean : null;
}

/** Room chat accepts Unicode but strips control/format characters and spammy whitespace. */
export function sanitizeChatMessage(value) {
  const clean = String(value || '')
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(clean).slice(0, PVP_CHAT_MAX_CHARS).join('');
}

export function hasPvpChatMessage(value) {
  return sanitizeChatMessage(value).length > 0;
}

/** Friendly fire is disabled; explosive owners may still damage themselves. */
export function canDamagePvpTarget(attacker, target, allowSelf = false) {
  if (!attacker || !target || !attacker.team || !target.team) return false;
  if (attacker.id && target.id && attacker.id === target.id) return allowSelf;
  return attacker.team !== target.team;
}
