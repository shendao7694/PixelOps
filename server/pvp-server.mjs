import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { WebSocket, WebSocketServer } from 'ws';
import { Player } from '../public/src/game/player.js';
import { automaticRespawnReady } from '../public/src/game/respawn.js';
import {
  advanceFireCooldown,
  beginFireCooldown,
  fireCooldownReady,
} from '../public/src/game/fire-cadence.js';
import { SENTRY_CONFIG } from '../public/src/game/sentry.js';
import { createMartyrdomGrenade } from '../public/src/game/martyrdom.js';
import {
  readyForActionActive,
  readyForActionMovementMultiplier,
  readyForActionUntil,
} from '../public/src/game/ready-for-action.js';
import {
  GRENADES_PER_LIFE,
  GRENADE_FUSE_SECONDS,
  advanceGrenade,
  grenadeBlastOccluded,
  grenadeCreatesFire,
  grenadeDamage,
  grenadeDetonatesOnImpact,
  grenadeKind,
  grenadeRestSyncNeeded,
  grenadeThrowVelocity,
} from '../public/src/game/grenade.js';
import {
  operatorVoiceActionForGrenade,
  randomOperatorVoiceSeed,
} from '../public/src/game/operator-voice.js';
import {
  casOutcomeVoiceCue,
  randomStreakVoiceSeed,
} from '../public/src/game/streak-voice.js';
import {
  INCENDIARY_TICK_SECONDS,
  AIRSTRIKE_INCENDIARY_KIND,
  incendiaryDamage,
  incendiaryDuration,
  incendiaryOccluded,
  incendiaryRadius,
} from '../public/src/game/incendiary.js';
import {
  activateServerUav,
  advanceServerUav,
  createUavDroneState,
  createTeamUavStates,
  deactivateServerUav,
  serverUavRevealSeconds,
  updateUavDroneState,
  UAV_DRONE_HEALTH,
  UAV_DURATION_SECONDS,
} from '../public/src/game/uav.js';
import {
  WEAPON_DEFS,
  WEAPON_ORDER,
  playerWeaponSpread,
} from '../public/src/game/weapons.js';
import {
  LASER_CANNON_CHARGE_SECONDS,
  LASER_CANNON_ID,
  LASER_CANNON_SHOTS,
  laserCannonChargeInputValid,
} from '../public/src/game/laser-cannon.js';
import {
  PASSIVE_IDS,
  createDefaultLoadout,
  loadoutArmorCapacity,
  loadoutAllowsWeapon,
  loadoutExplosiveDamage,
  loadoutHasPassive,
  loadoutHasStreak,
  loadoutHealthRegenDelay,
  loadoutMovementMultiplier,
  loadoutStreakCrossings,
  sanitizeLoadout,
} from '../public/src/game/loadout.js';
import {
  chooseCombatKnifeTarget,
  combatKnifeTargetPoint,
} from '../public/src/game/melee.js';
import {
  advanceTvMissile,
  createTvMissile,
  steerTvMissile,
  triggerTvMissileBoost,
} from '../public/src/game/tvmissile.js';
import {
  CAS_BLAST_RADIUS,
  CAS_FLIGHT_SECONDS,
  CAS_ROUNDS,
  casDamage,
  casImpactPoint,
  casRoundTime,
  normalizeCasPlan,
} from '../public/src/game/close-air-support.js';
import {
  FIREBOMB_BOMB_COUNT,
  firebombBlastOccluded,
  firebombDamage,
  firebombImpactPoint,
  firebombImpactTime,
  firebombRunLifetimeSeconds,
  normalizeFirebombPlan,
} from '../public/src/game/firebomb-airstrike.js';
import {
  ATTACK_HELICOPTER_APPROACH_SECONDS,
  ATTACK_HELICOPTER_BURST_COOLDOWN_SECONDS,
  ATTACK_HELICOPTER_BURST_ROUNDS,
  ATTACK_HELICOPTER_DAMAGE,
  ATTACK_HELICOPTER_FIRE_ALIGNMENT,
  ATTACK_HELICOPTER_HEALTH,
  ATTACK_HELICOPTER_LIFETIME_SECONDS,
  ATTACK_HELICOPTER_ON_STATION_SECONDS,
  ATTACK_HELICOPTER_SHOT_INTERVAL_SECONDS,
  attackHelicopterLockDelay,
  attackHelicopterOnStation,
  attackHelicopterPose,
  attackHelicopterTargetEligible,
  attackHelicopterYaw,
  turnAttackHelicopterYaw,
} from '../public/src/game/attack-helicopter.js';
import {
  AIRDROP_IMPACT_SECONDS,
  JUGGERNAUT_CRATE_LIFETIME_SECONDS,
  JUGGERNAUT_INTERACT_SECONDS,
  JUGGERNAUT_MAX_ARMOR,
  JUGGERNAUT_MAX_HEALTH,
  airdropClaimableBy,
  characterHitIsHeadshot,
  characterHitMultiplier,
  createJuggernautAirdrop,
  juggernautCanUseKillstreak,
} from '../public/src/game/juggernaut.js';
import { clamp, damp, lerp, angleDamp, angleDelta } from '../public/src/core/math.js';
import {
  PVP_MAX_MESSAGE_BYTES,
  PVP_MAP_VOTE_DURATION_MS,
  PVP_MATCH_SCORE_LIMIT,
  PVP_CHAT_COOLDOWN_MS,
  PVP_MOVEMENT_SUBSTEPS,
  PVP_PROTOCOL,
  PVP_RESPAWN_MS,
  PVP_SPAWN_PROTECTION_MS,
  PVP_ROOM_CAPACITY,
  PVP_ROOM_IDS,
  PVP_TEAM_CAPACITY,
  PVP_TICK_MS,
  PVP_TICK_RATE,
  PVP_VOTE_KICK_BAN_MS,
  PVP_VOTE_KICK_COOLDOWN_MS,
  PVP_VOTE_KICK_DURATION_MS,
  canDamagePvpTarget,
  sanitizeChatMessage,
  sanitizeClientId,
  sanitizePlayerName,
} from '../public/src/net/protocol.js';
import {
  PVP_MAP_OPTIONS,
  isPvpMapOption,
  mapVoteCounts,
  resolveMapVote,
} from '../public/src/net/map-vote.js';
import { MAP_IDS } from '../public/src/world/mapstore.js';
import {
  aimDirection,
  buildServerLevel,
  coneDirection,
  pickServerSpawn,
  rayPlayer,
  rayAttackHelicopter,
  rayGrenadeWorld,
  raySentry,
  rayUavDrone,
  rayWorld,
} from './world.mjs';
import { authUserFromRequest } from './auth.mjs';
import {
  decodeInputPacket,
  encodeSnapshotPacket,
} from '../public/src/net/pvp-wire.js';

const NOTFIGHTROOMS = [4]
const TICK_DT = 1 / PVP_TICK_RATE;
const TICK_PUMP_MS = Math.max(4, PVP_TICK_MS / 2);
const MAX_TICK_CATCHUP = 4;
// Network snapshots stay at 45 Hz while movement uses deterministic substeps
// shared with client prediction, keeping ramp and ledge collision stable.
const MOVEMENT_DT = TICK_DT / PVP_MOVEMENT_SUBSTEPS;
const ASSIST_SCORE = 30;
const ASSIST_WINDOW_MS = 10_000;
const STRIKE_RADIUS = 32;
const PASSWORD = "761234";
const SERVER_SETTINGS = Object.freeze({
  fov: 80,
  sensitivity: 1,
  viewBob: 1,
});
const BAN_FILE = process.env.PVP_BAN_FILE
  || fileURLToPath(new URL('../.runtime/pvp-bans.json', import.meta.url));
const BAN_PERSISTENCE = process.env.PVP_DISABLE_BAN_PERSISTENCE !== '1';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const TEST_START_UAV_CHARGES = process.env.NODE_ENV === 'test'
  && process.env.PVP_TEST_START_UAV_CHARGES === '1'
  ? 1
  : 0;
const TEST_START_STRIKE_CHARGES = process.env.NODE_ENV === 'test'
  && process.env.PVP_TEST_START_STRIKE_CHARGES === '1'
  ? 1
  : 0;
const TEST_START_CAS_CHARGES = process.env.NODE_ENV === 'test'
  && process.env.PVP_TEST_START_CAS_CHARGES === '1'
  ? 1
  : 0;
const TEST_START_FIREBOMB_CHARGES = process.env.NODE_ENV === 'test'
  && process.env.PVP_TEST_START_FIREBOMB_CHARGES === '1'
  ? 1
  : 0;
const TEST_START_ATTACK_HELICOPTER_CHARGES = process.env.NODE_ENV === 'test'
  && process.env.PVP_TEST_START_ATTACK_HELICOPTER_CHARGES === '1'
  ? 1
  : 0;
const TEST_START_SENTRY_CHARGES = process.env.NODE_ENV === 'test'
  && process.env.PVP_TEST_START_SENTRY_CHARGES === '1'
  ? 1
  : 0;
const TEST_START_JUGGERNAUT_CHARGES = process.env.NODE_ENV === 'test'
  && process.env.PVP_TEST_START_JUGGERNAUT_CHARGES === '1'
  ? 1
  : 0;
const TEST_START_LASER_CANNON_CHARGES = process.env.NODE_ENV === 'test'
  && process.env.PVP_TEST_START_LASER_CANNON_CHARGES === '1'
  ? 1
  : 0;
const UAV_STARTING_HEALTH = process.env.NODE_ENV === 'test'
  && Number.isFinite(Number(process.env.PVP_TEST_UAV_HEALTH))
  ? clamp(Number(process.env.PVP_TEST_UAV_HEALTH), 1, UAV_DRONE_HEALTH)
  : UAV_DRONE_HEALTH;
const SENTRY_LIFETIME_MS = process.env.NODE_ENV === 'test'
  && Number.isFinite(Number(process.env.PVP_TEST_SENTRY_LIFETIME_MS))
  ? clamp(Number(process.env.PVP_TEST_SENTRY_LIFETIME_MS), 50, 10_000)
  : SENTRY_CONFIG.lifetimeSeconds * 1000;
const voteKickCooldowns = new Map();
const bans = new Map();
let banWriteChain = Promise.resolve();

if (BAN_PERSISTENCE) {
  try {
    const stored = JSON.parse(await readFile(BAN_FILE, 'utf8'));
    const now = Date.now();
    for (const entry of Array.isArray(stored?.bans) ? stored.bans : []) {
      if (!/^(client|ip|linuxdo):[a-f0-9]{64}$/.test(entry?.key || '')) continue;
      const until = Number(entry.until);
      if (!Number.isFinite(until) || until <= now) continue;
      bans.set(entry.key, {
        until,
        name: sanitizePlayerName(entry.name, 'PLAYER'),
      });
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('PVP ban list could not be loaded:', error?.message || error);
    }
  }
}

const levels = new Map(MAP_IDS.map((mapId) => [mapId, buildServerLevel(mapId)]));
const rooms = PVP_ROOM_IDS.map((id, index) => createRoom(id, index + 1, MAP_IDS[index % MAP_IDS.length]));
const sockets = new Set();
let tickTimer = null;
let tickLastAt = 0;
let tickAccumulator = 0;
let roomListTimer = null;
let heartbeatTimer = null;

function createRoom(id, number, mapId) {
  return {
    id,
    number,
    mapId,
    level: levels.get(mapId),
    rosterVersion: 0,
    players: new Map(),
    sentries: new Map(),
    grenades: new Map(),
    incendiaries: new Map(),
    missiles: new Map(),
    casRuns: new Map(),
    firebombRuns: new Map(),
    attackHelicopters: new Map(),
    pendingStreakVoices: [],
    airdrops: new Map(),
    uavDrones: new Map(),
    teamUav: createTeamUavStates(),
    voteKick: null,
    mapVote: null,
    tick: 0,
    round: 1,
    match: {
      // Legacy wire field names now carry team kill scores (first to 75).
      blueTickets: 0,
      redTickets: 0,
      maxTickets: PVP_MATCH_SCORE_LIMIT,
      over: false,
      winner: null,
    },
  };
}

function roomList() {
  return rooms.map((room) => ({
    id: room.id,
    number: room.number,
    players: room.players.size,
    capacity: PVP_ROOM_CAPACITY,
    mapId: room.mapId,
  }));
}

function send(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sendBinary(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(payload, { binary: true });
}

function broadcast(room, payload, except = null) {
  const data = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (player.ws === except || player.ws.readyState !== WebSocket.OPEN) continue;
    player.ws.send(data);
  }
}

function broadcastTeam(room, team, payload) {
  const data = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (player.team !== team || player.ws.readyState !== WebSocket.OPEN) continue;
    player.ws.send(data);
  }
}

function broadcastStreakActivated(room, player, reward) {
  broadcastTeam(room, player.team, {
    type: 'streak_activated',
    reward,
    ownerId: player.id,
    name: player.name,
    team: player.team,
  });
}

function broadcastOperatorVoice(room, player, action, now, {
  teamWide = false,
} = {}) {
  if (!room || !player?.actor?.alive) return;
  broadcastTeam(room, player.team, {
    type: 'operator_voice',
    actorId: player.id,
    name: player.name,
    team: player.team,
    action,
    seed: randomOperatorVoiceSeed(),
    p: [
      player.actor.position.x,
      player.actor.position.y,
      player.actor.position.z,
    ],
    serverTime: now,
    teamWide: Boolean(teamWide),
  });
}

function scheduleStreakVoice(room, {
  cue,
  dueAt = Date.now(),
  ownerId = null,
  team = null,
  seed = randomStreakVoiceSeed(),
} = {}) {
  if (!room || !cue || (!ownerId && !team)) return false;
  if (room.pendingStreakVoices.length >= 64) room.pendingStreakVoices.shift();
  room.pendingStreakVoices.push({
    cue,
    dueAt: Number(dueAt) || Date.now(),
    ownerId,
    team,
    seed,
  });
  return true;
}

function processStreakVoices(room, now) {
  const due = [];
  const waiting = [];
  for (const pending of room.pendingStreakVoices) {
    if (pending.dueAt <= now) due.push(pending);
    else waiting.push(pending);
  }
  room.pendingStreakVoices = waiting;
  // Modern ECMAScript sort is stable, so equal timestamps retain insertion
  // order while delayed calls that became ready earlier are dispatched first.
  due.sort((a, b) => a.dueAt - b.dueAt);
  for (const pending of due) {
    const payload = {
      type: 'streak_voice',
      cue: pending.cue,
      seed: pending.seed,
      serverTime: now,
    };
    if (pending.team) broadcastTeam(room, pending.team, payload);
    else {
      const owner = room.players.get(pending.ownerId);
      if (owner) send(owner.ws, payload);
    }
  }
}

function broadcastRooms() {
  const payload = { type: 'rooms', rooms: roomList() };
  for (const ws of sockets) send(ws, payload);
}

function identityHash(kind, value) {
  return `${kind}:${createHash('sha256').update(`${kind}\0${value}`).digest('hex')}`;
}

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return null;
  if (ip.startsWith('[')) {
    const end = ip.indexOf(']');
    if (end > 0) ip = ip.slice(1, end);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(':'));
  }
  ip = ip.split('%')[0].toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return isIP(ip) ? ip : null;
}

export function isRoutableIp(ip) {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return !(
      a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224
    );
  }
  if (family === 6) {
    return ip !== '::'
      && ip !== '::1'
      && !ip.startsWith('fc')
      && !ip.startsWith('fd')
      && !/^fe[89ab]/.test(ip)
      && !ip.startsWith('2001:db8:');
  }
  return false;
}

export function clientIpFromRequest(request) {
  const forwarded = TRUST_PROXY
    ? String(request.headers['x-forwarded-for'] || '').split(',')[0]
    : '';
  return normalizeIp(forwarded || request.socket.remoteAddress);
}

function identityKeys(clientId, ip, linuxdoId = null) {
  const keys = [identityHash('client', clientId)];
  if (ip && isRoutableIp(ip)) keys.push(identityHash('ip', ip));
  if (linuxdoId) keys.push(identityHash('linuxdo', String(linuxdoId)));
  return keys;
}

function activeBan(keys, now = Date.now()) {
  let result = null;
  let removedExpired = false;
  for (const key of keys) {
    const entry = bans.get(key);
    if (!entry) continue;
    if (entry.until <= now) {
      bans.delete(key);
      removedExpired = true;
      continue;
    }
    if (!result || entry.until > result.until) result = entry;
  }
  if (removedExpired) persistBans();
  return result;
}

function persistBans() {
  if (!BAN_PERSISTENCE) return;
  const now = Date.now();
  const entries = [];
  for (const [key, entry] of bans) {
    if (entry.until <= now) {
      bans.delete(key);
      continue;
    }
    entries.push({ key, until: entry.until, name: entry.name });
  }
  entries.sort((a, b) => a.key.localeCompare(b.key));
  const body = JSON.stringify({ version: 1, bans: entries }, null, 2) + '\n';
  banWriteChain = banWriteChain
    .then(async () => {
      await mkdir(dirname(BAN_FILE), { recursive: true });
      await writeFile(BAN_FILE, body, 'utf8');
    })
    .catch((error) => {
      console.warn('PVP ban list could not be saved:', error?.message || error);
    });
}

function banIdentity(keys, name, until) {
  for (const key of keys) bans.set(key, { until, name });
  persistBans();
}

function pruneVoteKickState(now) {
  for (const [key, until] of voteKickCooldowns) {
    if (until <= now) voteKickCooldowns.delete(key);
  }
  let bansChanged = false;
  for (const [key, entry] of bans) {
    if (entry.until > now) continue;
    bans.delete(key);
    bansChanged = true;
  }
  if (bansChanged) persistBans();
}

function publicVoteKick(room, player) {
  const vote = room.voteKick;
  if (!vote) return null;
  const yourVote = vote.yes.has(player.id)
    ? 'yes'
    : vote.no.has(player.id)
      ? 'no'
      : null;
  return {
    id: vote.id,
    targetId: vote.targetId,
    targetName: vote.targetName,
    initiatorName: vote.initiatorName,
    yes: vote.yes.size,
    no: vote.no.size,
    required: vote.required,
    endsAt: vote.endsAt,
    yourVote,
    canVote: vote.electorate.has(player.id) && yourVote === null,
  };
}

function playerIsInvulnerable(player, now = Date.now()) {
  return player.actor.alive && player.invulnerableUntil > now;
}

function publicPlayer(player, now) {
  const a = player.actor;
  const throwableActive = a.alive && !player.juggernaut && (
    player.input.grenade
      || player.grenadePinAt > 0
      || player.grenadePinQueued
      || player.grenadeThrowQueued
  );
  const throwableState = throwableActive
    ? (player.input.grenadeAim || player.grenadePinAt > 0 ? 'aim' : 'carry')
    : 'none';
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    p: [round3(a.position.x), round3(a.position.y), round3(a.position.z)],
    v: [round3(a.velocity.x), round3(a.velocity.y), round3(a.velocity.z)],
    yaw: round4(a.yaw),
    pitch: round4(a.pitch),
    health: round2(a.health),
    maxHealth: a.maxHealth,
    armor: round2(a.armor),
    maxArmor: a.maxArmor,
    alive: a.alive,
    crouch: a.crouching,
    sprinting: a.sprinting,
    sliding: a.sliding,
    grounded: a.grounded,
    aiming: player.adsBlend > 0.45,
    invulnerable: playerIsInvulnerable(player, now),
    juggernaut: !!player.juggernaut,
    weapon: player.weaponId,
    throwableKind: grenadeKind(player.loadout.grenade),
    throwableState,
    firing: player.firingSeq,
    kills: player.kills,
    deaths: player.deaths,
    score: player.score,
    respawnAt: player.respawnAt,
  };
}

function snapshotFor(room, player, now) {
  const ownSentry = [...room.sentries.values()].find((s) => s.ownerId === player.id);
  const teamUav = room.teamUav[player.team];
  const uavActive = teamUav.uavUntil > now;
  const uavRevealTime = serverUavRevealSeconds(teamUav, now);
  const voteKickCooldown = Math.max(
    0,
    ((voteKickCooldowns.get(player.clientKey) || 0) - now) / 1000
  );
  return {
    type: 'snapshot',
    protocol: PVP_PROTOCOL,
    tick: room.tick,
    serverTime: now,
    room: {
      id: room.id,
      number: room.number,
      players: room.players.size,
      capacity: PVP_ROOM_CAPACITY,
      round: room.round,
      mapId: room.mapId,
    },
    match: room.match,
    ack: player.lastSeq,
    you: {
      id: player.id,
      team: player.team,
      readyActive: readyForActionActive(
        player.loadout,
        player.readyForActionUntil,
        now
      ),
      ammo: player.ammo,
      weapon: player.weaponId,
      reloading: player.reload
        ? {
          weapon: player.reload.weapon,
          startedAt: player.reload.startedAt,
          endsAt: player.reload.endsAt,
        }
        : null,
      kills: player.kills,
      deaths: player.deaths,
      score: player.score,
      streak: player.streak,
      grenades: player.grenades,
      voteKickCooldown,
      streaks: {
        uav: player.uavCharges,
        strike: player.strikeCharges,
        sentry: player.sentryCharges,
        cas: player.casCharges,
        firebomb: player.firebombCharges,
        attack_helicopter: player.attackHelicopterCharges,
        juggernaut: player.juggernautCharges,
        railgun: player.railgunCharges,
        uavTime: Math.max(0, (teamUav.uavUntil - now) / 1000),
        uavSweepSeq: teamUav.uavSweepSeq,
        uavRevealTime,
        sentryHp: ownSentry ? ownSentry.health : 0,
      },
      // Enemy positions only leave the server during a real sweep window.
      // A modified client therefore cannot turn one UAV into 20 seconds of
      // continuous wall tracking.
      uavMarks: uavActive && uavRevealTime > 0
        ? [...room.players.values()]
          .filter((p) => p.team !== player.team
            && p.actor.alive
            && !loadoutHasPassive(p.loadout, PASSIVE_IDS.ELECTRONIC_STEALTH))
          .map((p) => [round2(p.actor.position.x), round2(p.actor.position.y + 1.55), round2(p.actor.position.z)])
        : [],
    },
    players: [...room.players.values()].map((state) => publicPlayer(state, now)),
    voteKick: publicVoteKick(room, player),
    sentries: [...room.sentries.values()].map((s) => ({
      id: s.id,
      ownerId: s.ownerId,
      team: s.team,
      p: [round3(s.position.x), round3(s.position.y), round3(s.position.z)],
      yaw: round4(s.yaw),
      pitch: round4(s.pitch),
      health: round2(s.health),
      maxHealth: SENTRY_CONFIG.health,
      targetId: s.targetId,
    })),
    uavDrones: [...room.uavDrones.values()].map((drone) => ({
      id: drone.id,
      ownerId: drone.ownerId,
      team: drone.team,
      health: round2(drone.health),
      maxHealth: UAV_DRONE_HEALTH,
    })),
    missiles: [...room.missiles.values()].map((m) => ({
      id: m.id,
      ownerId: m.ownerId,
      team: m.team,
      p: [round3(m.position.x), round3(m.position.y), round3(m.position.z)],
      yaw: round4(m.yaw),
      pitch: round4(m.pitch),
      diving: m.diving,
    })),
    casRuns: [...room.casRuns.values()].map((run) => ({
      id: run.id,
      ownerId: run.ownerId,
      team: run.team,
      start: [round2(run.start.x), round2(run.start.z)],
      end: [round2(run.end.x), round2(run.end.z)],
      startedAt: run.startedAt,
      seed: run.seed,
    })),
    firebombRuns: [...room.firebombRuns.values()].map((run) => ({
      id: run.id,
      ownerId: run.ownerId,
      team: run.team,
      start: [round2(run.start.x), round2(run.start.z)],
      end: [round2(run.end.x), round2(run.end.z)],
      startedAt: run.startedAt,
    })),
    attackHelicopters: [...room.attackHelicopters.values()].map((heli) => ({
      id: heli.id,
      ownerId: heli.ownerId,
      team: heli.team,
      call: heli.call.map(round2),
      entryYaw: round4(heli.entryYaw),
      startedAt: heli.startedAt,
      targetId: heli.targetId,
      health: round2(heli.health),
    })),
    airdrops: [...room.airdrops.values()].map((drop) => ({
      id: drop.id,
      ownerId: drop.ownerId,
      team: drop.team,
      target: drop.target.map(round3),
      yaw: round4(drop.yaw),
      startedAt: drop.startedAt,
    })),
  };
}

function sendSnapshot(player, now) {
  const room = player.room;
  const includeRoster = player.ws.pvpRosterVersion !== room.rosterVersion;
  sendBinary(player.ws, encodeSnapshotPacket(snapshotFor(room, player, now), {
    includeRoster,
    rosterVersion: room.rosterVersion,
  }));
  if (includeRoster) player.ws.pvpRosterVersion = room.rosterVersion;
}

function chooseTeam(room) {
  let blue = 0;
  let red = 0;
  for (const p of room.players.values()) {
    if (p.team === 'blue') blue++;
    else red++;
  }
  if (blue >= PVP_TEAM_CAPACITY && red >= PVP_TEAM_CAPACITY) return null;
  if (blue >= PVP_TEAM_CAPACITY) return 'red';
  if (red >= PVP_TEAM_CAPACITY) return 'blue';
  return blue <= red ? 'blue' : 'red';
}

function makeAmmo() {
  return Object.fromEntries(WEAPON_ORDER.map((id) => [
    id,
    { mag: WEAPON_DEFS[id].mag, reserve: WEAPON_DEFS[id].reserve },
  ]));
}

function playerAllowsWeapon(player, weaponId) {
  if (player.juggernaut) return weaponId === 'minigun';
  if (player.railgunActive) return weaponId === LASER_CANNON_ID;
  return loadoutAllowsWeapon(player.loadout, weaponId);
}

function endLaserCannon(player, { restoreWeapon = true } = {}) {
  const wasActive = player.railgunActive;
  player.railgunActive = false;
  player.railgunChargeStartedAt = 0;
  if (!wasActive || !restoreWeapon) return;
  const fallback = loadoutAllowsWeapon(player.loadout, player.railgunReturnWeapon)
    ? player.railgunReturnWeapon
    : player.loadout.primary;
  player.weaponId = fallback;
  player.input.weapon = fallback;
  player.weaponSwitch = null;
  player.reload = null;
  player.autoReloadAt = 0;
  player.triggerBlockedUntilRelease = true;
}

function configurePlayerPassiveEffects(player, { fillArmor = false } = {}) {
  const baseArmor = player.juggernaut ? JUGGERNAUT_MAX_ARMOR : 50;
  player.actor.maxArmor = loadoutArmorCapacity(player.loadout, baseArmor);
  player.actor.healthRegenDelay = loadoutHealthRegenDelay(player.loadout);
  if (fillArmor) player.actor.armor = player.actor.maxArmor;
  else player.actor.armor = Math.min(player.actor.armor, player.actor.maxArmor);
}

function makePlayer(ws, room, name, clientId, playerIdentityKeys) {
  const team = chooseTeam(room);
  if (!team) return null;
  const id = randomUUID().slice(0, 12);
  const loadout = createDefaultLoadout();
  const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 600);
  const actor = new Player({ camera, level: room.level, settings: SERVER_SETTINGS, audio: null });
  actor.team = team;
  actor.name = name;
  actor.respawn(pickServerSpawn(room.level, team, room.players.values()));
  // Joining reserves a room/team slot but does not create a target in the
  // arena. The authoritative actor appears only after a validated deploy.
  actor.alive = false;
  actor.health = 0;
  actor.armor = 0;
  actor.deathAnim = null;

  if (NOTFIGHTROOMS.includes(room.number)) {
    actor.maxHealth = 999999;
    actor.health = 999999;
  }

  return {
    id,
    ws,
    room,
    name,
    team,
    clientId,
    clientKey: identityHash('client', clientId),
    identityKeys: playerIdentityKeys,
    actor,
    input: neutralInput(loadout.primary),
    lastSeq: 0,
    lastInputAt: Date.now(),
    lastChatAt: 0,
    jumpQueued: false,
    jumpQueuedUntil: 0,
    slideQueued: false,
    reloadQueued: false,
    grenadePinQueued: false,
    grenadeThrowQueued: false,
    meleeQueued: false,
    weaponId: loadout.primary,
    weaponSwitch: null,
    ammo: makeAmmo(),
    loadout,
    fireCooldown: 0,
    reload: null,
    autoReloadAt: 0,
    lastTrigger: false,
    lastGrenadeTrigger: false,
    triggerBlockedUntilRelease: false,
    spinUpStartedAt: 0,
    adsBlend: 0,
    recoil: 0,
    firingSeq: 0,
    respawnAt: 0,
    loadoutRequested: true,
    invulnerableUntil: 0,
    readyForActionUntil: 0,
    kills: 0,
    deaths: 0,
    score: 0,
    streak: 0,
    streakScore: 0,
    damageContributors: new Map(),
    hasDeployed: false,
    uavCharges: TEST_START_UAV_CHARGES,
    strikeCharges: TEST_START_STRIKE_CHARGES,
    sentryCharges: TEST_START_SENTRY_CHARGES,
    casCharges: TEST_START_CAS_CHARGES,
    firebombCharges: TEST_START_FIREBOMB_CHARGES,
    attackHelicopterCharges: TEST_START_ATTACK_HELICOPTER_CHARGES,
    juggernautCharges: TEST_START_JUGGERNAUT_CHARGES,
    railgunCharges: TEST_START_LASER_CANNON_CHARGES,
    railgunActive: false,
    railgunReturnWeapon: loadout.primary,
    railgunChargeStartedAt: 0,
    juggernaut: false,
    airdropInteractId: null,
    airdropInteractStartedAt: 0,
    grenades: GRENADES_PER_LIFE,
    grenadePinAt: 0,
    missileId: null,
  };
}

function neutralInput(weapon = 'rifle') {
  return {
    moveX: 0,
    moveZ: 0,
    jump: false,
    crouch: false,
    sprint: false,
    aim: false,
    trigger: false,
    grenade: false,
    grenadeAim: false,
    interact: false,
    yaw: 0,
    pitch: 0,
    weapon,
  };
}

function joinRoom(ws, message) {
  if (message.protocol !== PVP_PROTOCOL) {
    send(ws, {
      type: 'join_error',
      code: 'PROTOCOL_MISMATCH',
      message: 'CLIENT VERSION MISMATCH',
      protocol: PVP_PROTOCOL,
    });
    return;
  }
  const clientId = sanitizeClientId(message.clientId);
  if (!clientId) {
    send(ws, {
      type: 'join_error',
      code: 'CLIENT_ID_REQUIRED',
      message: 'CLIENT ID REQUIRED - REFRESH THE PAGE',
    });
    return;
  }
  const linuxdoId = ws.authUser?.testBypass ? null : ws.authUser?.id;
  const playerIdentityKeys = identityKeys(clientId, ws.clientIp, linuxdoId);
  const ban = activeBan(playerIdentityKeys);
  if (ban) {
    send(ws, {
      type: 'join_error',
      code: 'BANNED',
      message: `VOTE KICK LOCKOUT - ${Math.ceil((ban.until - Date.now()) / 60000)} MIN REMAINING`,
      retryAfter: Math.max(1, Math.ceil((ban.until - Date.now()) / 1000)),
      banUntil: ban.until,
    });
    return;
  }
  const room = rooms.find((r) => r.id === message.roomId);
  if (!room) {
    send(ws, { type: 'join_error', code: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' });
    return;
  }
  if (room.players.size >= PVP_ROOM_CAPACITY) {
    send(ws, { type: 'join_error', code: 'ROOM_FULL', message: 'ROOM IS FULL' });
    return;
  }
  leaveRoom(ws);
  const fallback = ws.authUser?.id
    ? `LDO-${String(ws.authUser.id).slice(-8)}`
    : `PLAYER-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const requestedName = ws.authUser?.testBypass ? message.name : ws.authUser?.username;
  const isAdmin = (ws.authUser?.group ?? "user" ) === "admin";
  const name = sanitizePlayerName(requestedName, fallback);
  const player = makePlayer(ws, room, name, clientId, playerIdentityKeys);
  if (!player) {
    send(ws, { type: 'join_error', code: 'ROOM_FULL', message: 'ROOM IS FULL' });
    return;
  }
  player.isAdmin = isAdmin;
  ws.pvpPlayer = player;
  room.players.set(player.id, player);
  room.rosterVersion = (room.rosterVersion + 1) >>> 0;
  send(ws, {
    type: 'joined',
    protocol: PVP_PROTOCOL,
    id: player.id,
    name: player.name,
    team: player.team,
    room: {
      id: room.id,
      number: room.number,
      capacity: PVP_ROOM_CAPACITY,
      mapId: room.mapId,
    },
    tickRate: PVP_TICK_RATE,
    snapshot: snapshotFor(room, player, Date.now()),
  });
  broadcast(room, {
    type: 'chat',
    system: true,
    kind: 'join',
    text: `${isAdmin ? "[Admin]" : "[User]"}${player.name} JOINED`,
    serverTime: Date.now(),
  });
  if (room.mapVote) send(ws, publicMapVote(room));
  broadcastRooms();
}

function leaveRoom(ws, kind = 'leave') {
  const player = ws.pvpPlayer;
  if (!player) return;
  const room = player.room;
  room.players.delete(player.id);
  if (room.mapVote?.votes.delete(player.id)) broadcastMapVoteUpdate(room);
  room.rosterVersion = (room.rosterVersion + 1) >>> 0;
  for (const [id, sentry] of room.sentries) {
    if (sentry.ownerId === player.id) room.sentries.delete(id);
  }
  // An orphaned missile has nobody to steer it and nobody to credit the kill
  // to, so it leaves with its operator rather than flying on unguided.
  for (const [id, missile] of room.missiles) {
    if (missile.ownerId === player.id) room.missiles.delete(id);
  }
  // A called crate may be stolen after its owner leaves, but an empty room
  // must not retain aircraft/crates for the next group of players.
  if (room.players.size === 0) {
    room.airdrops.clear();
    room.firebombRuns.clear();
    room.attackHelicopters.clear();
  }
  ws.pvpPlayer = null;
  broadcast(room, {
    type: 'chat',
    system: true,
    kind,
    text: kind === 'kicked'
      ? `${player.name} WAS KICKED`
      : `${player.name} LEFT`,
    serverTime: Date.now(),
  });
  evaluateVoteKick(room, Date.now());
  broadcastRooms();
}

function handleChat(player, value, now) {
  const parse = s => s?.startsWith('/') ? ((t=s.trim().slice(1), i=t.indexOf(' ')) => ({ cmd: i===-1 ? t : t.slice(0,i), arg: i===-1 ? null : t.slice(i+1) }))() : null;
  const text = sanitizeChatMessage(value);
  if (!text) {
    send(player.ws, {
      type: 'chat_error',
      code: 'EMPTY',
      text: 'MESSAGE IS EMPTY',
    });
    return;
  }
  const retryAfter = PVP_CHAT_COOLDOWN_MS - (now - (player.lastChatAt || 0));
  if (retryAfter > 0) {
    send(player.ws, {
      type: 'chat_error',
      code: 'RATE_LIMIT',
      text: 'CHAT COOLDOWN',
      retryAfter: Math.max(1, Math.ceil(retryAfter / 1000)),
    });
    return;
  }
  let cmd = (parse(text)?.cmd ?? undefined);
  let arg = (parse(text)?.arg ?? undefined);
  if(cmd === "rename" && arg != null) { //modify point
    player.name = arg;
    send(player.ws, {
      type: 'chat',
      text: `Name update to ${arg}`,
    });
    return ;
  }

  if(cmd === `hpset` && arg != null && parseInt(arg) != NaN) {
    if(!player.isAdmin) {
      send(player.ws, {type: 'chat',text: `Insufficient permissions`,});return;
    }
    player.actor.health = arg;
    player.actor.maxHealth = arg;
    send(player.ws, {
      type: 'chat',
      text: `Hp update to ${arg}`,
    });
    return ;
  }

  if(cmd === `kick` && arg != null && parseInt(arg) != NaN) {
    if(!player.isAdmin) {
      send(player.ws, {type: 'chat',text: `Insufficient permissions`,});return;
    }
    banIdentity()
    send(player.ws, {
      type: 'chat',
      text: `Kick the player : ${arg}`,
    });
    broadcast(player.room, {
      type: 'chat',
      playerId: "PubMsg",
      name: "PubMsg",
      team: player.team,
      text: `Kick the player : ${arg} by ${player.name}`,
      serverTime: now,
    });
    return ;
  }

  player.lastChatAt = now;
  broadcast(player.room, {
    type: 'chat',
    playerId: player.id,
    name: player.name,
    team: player.team,
    text,
    serverTime: now,
  });
}

function sendVoteKickError(player, code, text, retryAfter = 0) {
  send(player.ws, {
    type: 'vote_kick_error',
    code,
    text,
    retryAfter: Math.max(0, Math.ceil(retryAfter / 1000)),
  });
}

function startVoteKick(player, targetId, now) {
  const room = player.room;
  evaluateVoteKick(room, now);
  if (room.voteKick) {
    sendVoteKickError(player, 'ACTIVE', 'A VOTE IS ALREADY IN PROGRESS');
    return;
  }
  const cooldownUntil = voteKickCooldowns.get(player.clientKey) || 0;
  if (cooldownUntil > now) {
    sendVoteKickError(
      player,
      'COOLDOWN',
      `NEXT VOTE AVAILABLE IN ${Math.ceil((cooldownUntil - now) / 1000)} SEC`,
      cooldownUntil - now
    );
    return;
  }
  if (room.players.size < 3) {
    sendVoteKickError(player, 'NEED_PLAYERS', 'AT LEAST 3 PLAYERS ARE REQUIRED');
    return;
  }
  const target = typeof targetId === 'string' ? room.players.get(targetId) : null;
  if (!target) {
    sendVoteKickError(player, 'TARGET_NOT_FOUND', 'PLAYER IS NO LONGER IN THE ROOM');
    return;
  }
  if (target.id === player.id) {
    sendVoteKickError(player, 'SELF', 'YOU CANNOT VOTE KICK YOURSELF');
    return;
  }

  const vote = {
    id: randomUUID().slice(0, 12),
    initiatorId: player.id,
    initiatorName: player.name,
    targetId: target.id,
    targetName: target.name,
    targetClientKey: target.clientKey,
    targetIdentityKeys: [...target.identityKeys],
    electorate: new Set(
      [...room.players.keys()].filter((id) => id !== target.id)
    ),
    yes: new Set([player.id]),
    no: new Set(),
    required: Math.floor(room.players.size / 2) + 1,
    startedAt: now,
    endsAt: now + PVP_VOTE_KICK_DURATION_MS,
  };
  room.voteKick = vote;
  voteKickCooldowns.set(player.clientKey, now + PVP_VOTE_KICK_COOLDOWN_MS);
  broadcast(room, {
    type: 'vote_kick_started',
    id: vote.id,
    initiatorId: player.id,
    initiatorName: player.name,
    targetId: target.id,
    targetName: target.name,
    required: vote.required,
    endsAt: vote.endsAt,
  });
  evaluateVoteKick(room, now);
}

function castVoteKick(player, choice, now) {
  const room = player.room;
  evaluateVoteKick(room, now);
  const vote = room.voteKick;
  if (!vote) {
    sendVoteKickError(player, 'NO_ACTIVE_VOTE', 'NO ACTIVE VOTE');
    return;
  }
  if (!vote.electorate.has(player.id)) {
    sendVoteKickError(player, 'NOT_ELIGIBLE', 'THE TARGET PLAYER CANNOT VOTE');
    return;
  }
  if (vote.yes.has(player.id) || vote.no.has(player.id)) {
    sendVoteKickError(player, 'ALREADY_VOTED', 'YOUR VOTE IS ALREADY LOCKED');
    return;
  }
  if (choice !== 'yes' && choice !== 'no') return;
  (choice === 'yes' ? vote.yes : vote.no).add(player.id);
  evaluateVoteKick(room, now);
}

function evaluateVoteKick(room, now) {
  const vote = room.voteKick;
  if (!vote) return;
  if (vote.yes.size >= vote.required) {
    finishVoteKick(room, true, 'majority', now);
    return;
  }
  if (now >= vote.endsAt) {
    finishVoteKick(room, false, 'timeout', now);
    return;
  }
  let remainingPossibleYes = 0;
  for (const id of vote.electorate) {
    if (vote.yes.has(id) || vote.no.has(id)) continue;
    if (room.players.has(id)) remainingPossibleYes++;
  }
  if (vote.yes.size + remainingPossibleYes < vote.required) {
    finishVoteKick(room, false, 'insufficient', now);
  }
}

function finishVoteKick(room, passed, reason, now) {
  const vote = room.voteKick;
  if (!vote) return;
  room.voteKick = null;
  const banUntil = passed ? now + PVP_VOTE_KICK_BAN_MS : 0;
  broadcast(room, {
    type: 'vote_kick_result',
    id: vote.id,
    targetId: vote.targetId,
    targetName: vote.targetName,
    yes: vote.yes.size,
    no: vote.no.size,
    required: vote.required,
    passed,
    reason,
    banUntil,
  });
  if (!passed) return;

  banIdentity(vote.targetIdentityKeys, vote.targetName, banUntil);
  const kickedSockets = [...sockets].filter(
    (ws) => ws.pvpPlayer?.clientKey === vote.targetClientKey
  );
  for (const ws of kickedSockets) {
    send(ws, {
      type: 'kicked',
      reason: 'VOTE_KICK',
      message: 'REMOVED BY VOTE - LOCKED OUT FOR 6 HOURS',
      banUntil,
    });
    leaveRoom(ws, 'kicked');
    const closeTimer = setTimeout(() => ws.close(4003, 'VOTE KICK'), 25);
    closeTimer.unref?.();
  }
}

function handleInput(player, message) {
  const seq = Number(message.seq);
  if (!Number.isSafeInteger(seq) || seq <= player.lastSeq || seq - player.lastSeq > 10000) return;
  player.lastSeq = seq;
  player.lastInputAt = Date.now();
  const moveX = finiteClamp(message.moveX, -1, 1, 0);
  const moveZ = finiteClamp(message.moveZ, -1, 1, 0);
  const len = Math.hypot(moveX, moveZ);

  // While the operator is flying a missile their body is frozen and their look
  // angles steer the warhead instead. This is the whole anti-cheat story: the
  // client sends a requested heading, never a position, and the server decides
  // where the missile actually goes.
  const missile = player.missileId ? player.room.missiles.get(player.missileId) : null;
  if (missile && message.missileControl === true) {
    if (message.missileBoost === true) triggerTvMissileBoost(missile);
    const requestedYaw = wrapAngle(
      finiteClamp(message.yaw, -Math.PI * 4, Math.PI * 4, missile.lastInputYaw)
    );
    const requestedPitch = finiteClamp(
      message.pitch,
      -Math.PI / 2,
      Math.PI / 2,
      missile.lastInputPitch
    );
    const changed = Math.abs(angleDelta(missile.lastInputYaw, requestedYaw)) > 1e-5
      || Math.abs(requestedPitch - missile.lastInputPitch) > 1e-5;
    missile.lastInputYaw = requestedYaw;
    missile.lastInputPitch = requestedPitch;
    if (changed) {
      missile.wantYaw = requestedYaw;
      missile.wantPitch = requestedPitch;
      missile.steerPending = true;
    }
    missile.lastControlAt = player.lastInputAt;
    player.input.moveX = 0;
    player.input.moveZ = 0;
    player.input.jump = false;
    player.input.crouch = false;
    player.input.sprint = false;
    player.input.aim = false;
    player.input.trigger = false;
    player.input.grenade = false;
    player.input.grenadeAim = false;
    player.input.interact = false;
    if (playerAllowsWeapon(player, message.weapon)) player.input.weapon = message.weapon;
    return;
  }

  player.input.moveX = len > 1 ? moveX / len : moveX;
  player.input.moveZ = len > 1 ? moveZ / len : moveZ;
  const jumpDown = message.jump === true;
  if (jumpDown && !player.input.jump) {
    // Jump is an edge-triggered action. Buffer it briefly so a tap cannot
    // vanish between authoritative ticks or while the feet are a few
    // milliseconds from touching a ramp.
    player.jumpQueued = true;
    player.jumpQueuedUntil = player.lastInputAt + 180;
  }
  player.input.jump = jumpDown;
  player.input.crouch = message.crouch === true;
  player.input.sprint = message.sprint === true;
  player.input.aim = message.aim === true;
  player.input.trigger = message.trigger === true;
  player.input.grenade = message.grenade === true;
  player.input.grenadeAim = message.grenadeAim === true;
  player.input.interact = message.interact === true;
  if (message.grenadePin === true) player.grenadePinQueued = true;
  if (message.grenadeThrow === true) player.grenadeThrowQueued = true;
  if (message.meleeAttack === true
    && !player.juggernaut
    && message.weapon === player.loadout.melee
    && playerAllowsWeapon(player, message.weapon)) {
    player.meleeQueued = true;
  }
  player.input.yaw = wrapAngle(finiteClamp(message.yaw, -Math.PI * 4, Math.PI * 4, player.actor.yaw));
  player.input.pitch = finiteClamp(
    message.pitch,
    -Math.PI / 2 + 0.02,
    Math.PI / 2 - 0.02,
    player.actor.pitch
  );
  if (playerAllowsWeapon(player, message.weapon)) player.input.weapon = message.weapon;
  if (message.slide === true) player.slideQueued = true;
  if (message.reload === true) player.reloadQueued = true;
}

function pruneUnselectedStreakCharges(player) {
  if (!loadoutHasStreak(player.loadout, 'uav')) player.uavCharges = 0;
  if (!loadoutHasStreak(player.loadout, 'strike')) player.strikeCharges = 0;
  if (!loadoutHasStreak(player.loadout, 'sentry')) player.sentryCharges = 0;
  if (!loadoutHasStreak(player.loadout, 'cas')) player.casCharges = 0;
  if (!loadoutHasStreak(player.loadout, 'firebomb')) player.firebombCharges = 0;
  if (!loadoutHasStreak(player.loadout, 'attack_helicopter')) {
    player.attackHelicopterCharges = 0;
  }
  if (!loadoutHasStreak(player.loadout, 'juggernaut')) player.juggernautCharges = 0;
  if (!loadoutHasStreak(player.loadout, LASER_CANNON_ID)) player.railgunCharges = 0;
}

function handleDeploy(player, message) {
  if (player.room.mapVote) return;
  if (player.actor.alive) {
    send(player.ws, {
      type: 'deploy_error',
      code: 'ALREADY_DEPLOYED',
      message: 'PLAYER IS ALREADY DEPLOYED',
      retryAfter: 0,
    });
    return;
  }
  const now = Date.now();
  const remainingMs = Math.max(0, player.respawnAt - now);
  if (remainingMs > 0) {
    send(player.ws, {
      type: 'deploy_error',
      code: 'RESPAWN_WAIT',
      message: 'REINFORCEMENT WINDOW NOT READY',
      retryAfter: remainingMs / 1000,
    });
    return;
  }

  player.loadout = sanitizeLoadout(message.loadout);
  pruneUnselectedStreakCharges(player);
  player.hasDeployed = true;
  respawnPlayer(player.room, player, now);
  send(player.ws, {
    type: 'deploy_ok',
    weapon: player.weaponId,
  });
}

function handleRespawnLoadout(player) {
  if (player.actor.alive || !player.actor.deathAnim) return;
  player.loadoutRequested = true;
  send(player.ws, {
    type: 'respawn_loadout_ok',
    respawnAt: player.respawnAt,
  });
}

function handleAbility(player, message) {
  if (player.room.mapVote) return;
  if (!player.actor.alive) return;
  if (!juggernautCanUseKillstreak(player)) return;
  if (player.railgunActive) return;
  if (!loadoutHasStreak(player.loadout, message.ability)) return;
  const room = player.room;
  const now = Date.now();
  const teamUav = room.teamUav[player.team];
  if (message.ability === LASER_CANNON_ID && player.railgunCharges > 0) {
    player.railgunCharges--;
    player.railgunReturnWeapon = loadoutAllowsWeapon(
      player.loadout,
      player.weaponId
    )
      ? player.weaponId
      : player.loadout.primary;
    player.railgunActive = true;
    player.railgunChargeStartedAt = 0;
    player.ammo[LASER_CANNON_ID] = {
      mag: 1,
      reserve: LASER_CANNON_SHOTS - 1,
    };
    player.weaponId = LASER_CANNON_ID;
    player.input.weapon = LASER_CANNON_ID;
    player.input.trigger = false;
    player.input.grenade = false;
    player.input.grenadeAim = false;
    player.weaponSwitch = null;
    player.reload = null;
    player.autoReloadAt = 0;
    player.grenadePinQueued = false;
    player.grenadeThrowQueued = false;
    player.meleeQueued = false;
    player.lastTrigger = false;
    player.triggerBlockedUntilRelease = true;
    broadcastStreakActivated(room, player, LASER_CANNON_ID);
    broadcastOperatorVoice(room, player, 'laser_cannon', now, {
      teamWide: true,
    });
    return;
  }
  if (message.ability === 'uav' && player.uavCharges > 0 && teamUav.uavUntil <= now) {
    room.uavDrones.delete(player.team);
    player.uavCharges--;
    activateServerUav(teamUav, now);
    const drone = createUavDroneState({
      ownerId: player.id,
      team: player.team,
      now,
      groundY: 0,
    });
    drone.health = UAV_STARTING_HEALTH;
    room.uavDrones.set(player.team, drone);
    broadcastTeam(room, player.team, {
      type: 'ability',
      ability: 'uav',
      ok: true,
      duration: UAV_DURATION_SECONDS,
      ownerId: player.id,
      name: player.name,
      team: player.team,
    });
    broadcastStreakActivated(room, player, 'uav');
    scheduleStreakVoice(room, {
      cue: 'uav_inbound',
      dueAt: now,
      team: player.team,
    });
    scheduleStreakVoice(room, {
      cue: 'enemy_uav_inbound',
      dueAt: now,
      team: player.team === 'blue' ? 'red' : 'blue',
    });
    return;
  }
  if (message.ability === 'juggernaut' && player.juggernautCharges > 0) {
    player.juggernautCharges--;
    const id = randomUUID().slice(0, 10);
    const drop = createJuggernautAirdrop({
      id,
      ownerId: player.id,
      team: player.team,
      target: [
        player.actor.position.x,
        player.actor.position.y,
        player.actor.position.z,
      ],
      yaw: player.actor.yaw,
      startedAt: now,
    });
    room.airdrops.set(id, drop);
    broadcast(room, {
      type: 'juggernaut_airdrop',
      id,
      ownerId: player.id,
      name: player.name,
      team: player.team,
      target: drop.target.map(round2),
      yaw: round4(drop.yaw),
      startedAt: now,
    });
    broadcastStreakActivated(room, player, 'juggernaut');
    scheduleStreakVoice(room, {
      cue: 'juggernaut_inbound',
      dueAt: now,
      ownerId: player.id,
    });
    return;
  }
  if (message.ability === 'strike' && player.strikeCharges > 0) {
    // One missile per operator. Without this an operator could stack charges
    // and end up steering two cameras at once.
    for (const [id, live] of room.missiles) {
      if (live.ownerId === player.id) room.missiles.delete(id);
    }
    player.strikeCharges--;
    const missile = createTvMissile({
      ownerId: player.id,
      team: player.team,
      groundY: 0,
      // Nose it toward whatever the operator was facing, so the first frame of
      // the camera is not a disorienting snap.
      yaw: player.actor.yaw,
    });
    missile.id = randomUUID().slice(0, 10);
    // Steering starts from the missile's own pose rather than the player's
    // look angles, or the first input tick would yank it hard off-axis.
    missile.wantYaw = missile.yaw;
    missile.wantPitch = missile.pitch;
    missile.lastInputYaw = missile.yaw;
    missile.lastInputPitch = missile.pitch;
    missile.steerPending = false;
    missile.lastControlAt = now;
    room.missiles.set(missile.id, missile);
    player.missileId = missile.id;
    broadcast(room, {
      type: 'strike_launch',
      id: missile.id,
      ownerId: player.id,
      team: player.team,
    });
    broadcastStreakActivated(room, player, 'strike');
    scheduleStreakVoice(room, {
      cue: 'enemy_tv_missile_inbound',
      dueAt: now,
      team: player.team === 'blue' ? 'red' : 'blue',
    });
    return;
  }
  if (message.ability === 'cas' && player.casCharges > 0) {
    const plan = normalizeCasPlan(message.start, message.end, room.level.bounds);
    if (!plan) return;
    player.casCharges--;
    const id = randomUUID().slice(0, 10);
    const seed = Number.parseInt(randomUUID().replaceAll('-', '').slice(0, 8), 16) >>> 0;
    const run = {
      id,
      ownerId: player.id,
      team: player.team,
      start: plan.start,
      end: plan.end,
      startedAt: now,
      seed,
      nextRound: 0,
      enemyKills: 0,
      outcomeVoiceQueued: false,
    };
    room.casRuns.set(id, run);
    broadcast(room, {
      type: 'cas_run',
      id,
      ownerId: player.id,
      team: player.team,
      start: [round2(run.start.x), round2(run.start.z)],
      end: [round2(run.end.x), round2(run.end.z)],
      startedAt: now,
      seed,
    });
    broadcastStreakActivated(room, player, 'cas');
    scheduleStreakVoice(room, {
      cue: 'cas_inbound',
      dueAt: now + 200,
      ownerId: player.id,
    });
    return;
  }
  if (message.ability === 'firebomb' && player.firebombCharges > 0) {
    const plan = normalizeFirebombPlan(message.z, room.level.bounds);
    if (!plan) return;
    player.firebombCharges--;
    const id = randomUUID().slice(0, 10);
    const run = {
      id,
      ownerId: player.id,
      team: player.team,
      start: plan.start,
      end: plan.end,
      startedAt: now,
      nextImpact: 0,
    };
    room.firebombRuns.set(id, run);
    broadcast(room, {
      type: 'firebomb_run',
      id,
      ownerId: player.id,
      team: player.team,
      start: [round2(run.start.x), round2(run.start.z)],
      end: [round2(run.end.x), round2(run.end.z)],
      startedAt: now,
    });
    broadcastStreakActivated(room, player, 'firebomb');
    scheduleStreakVoice(room, {
      cue: 'firebomb_inbound',
      dueAt: now + 200,
      ownerId: player.id,
    });
    return;
  }
  if (message.ability === 'attack_helicopter'
    && player.attackHelicopterCharges > 0) {
    player.attackHelicopterCharges--;
    const id = randomUUID().slice(0, 10);
    const heli = {
      id,
      ownerId: player.id,
      team: player.team,
      call: [
        round2(player.actor.position.x),
        round2(player.actor.position.y),
        round2(player.actor.position.z),
      ],
      entryYaw: player.actor.yaw + Math.PI,
      startedAt: now,
      targetId: null,
      health: ATTACK_HELICOPTER_HEALTH,
      maxHealth: ATTACK_HELICOPTER_HEALTH,
      alive: true,
      position: new THREE.Vector3(),
      yaw: 0,
      aimYaw: 0,
      lastPoseAt: now,
      roundsInBurst: 0,
      nextShotAt: now,
      nextBurstAt: now,
      outboundVoiceQueued: false,
    };
    const initialPose = attackHelicopterPose(heli, 0);
    if (initialPose.position) {
      heli.position.set(
        initialPose.position.x,
        initialPose.position.y,
        initialPose.position.z
      );
      const flightTarget = {
        x: initialPose.position.x + initialPose.direction.x,
        y: initialPose.position.y + initialPose.direction.y,
        z: initialPose.position.z + initialPose.direction.z,
      };
      heli.yaw = attackHelicopterYaw(initialPose.position, flightTarget);
      heli.aimYaw = heli.yaw;
    }
    room.attackHelicopters.set(id, heli);
    const voiceSeed = randomStreakVoiceSeed();
    broadcast(room, {
      type: 'attack_helicopter_call',
      id,
      ownerId: player.id,
      name: player.name,
      team: player.team,
      call: heli.call,
      entryYaw: round4(heli.entryYaw),
      startedAt: now,
      voiceSeed,
    });
    broadcastStreakActivated(room, player, 'attack_helicopter');
    return;
  }
  if (message.ability === 'sentry' && player.sentryCharges > 0) {
    const existing = [...room.sentries.values()].find((s) => s.ownerId === player.id);
    if (existing) room.sentries.delete(existing.id);
    player.sentryCharges--;
    const fwd = new THREE.Vector3(
      -Math.sin(player.actor.yaw),
      0,
      -Math.cos(player.actor.yaw)
    );
    const pos = player.actor.position.clone().addScaledVector(fwd, 1.5);
    pos.x = clamp(pos.x, -room.level.bounds.x, room.level.bounds.x);
    pos.z = clamp(pos.z, -room.level.bounds.z, room.level.bounds.z);
    const sentry = {
      id: randomUUID().slice(0, 10),
      ownerId: player.id,
      team: player.team,
      position: pos,
      yaw: player.actor.yaw,
      pitch: -0.04,
      health: SENTRY_CONFIG.health,
      alive: true,
      targetId: null,
      scanTimer: 0,
      fireCooldown: 0,
      expiresAt: now + SENTRY_LIFETIME_MS,
    };
    room.sentries.set(sentry.id, sentry);
    broadcast(room, {
      type: 'sentry_deploy',
      id: sentry.id,
      ownerId: player.id,
      team: player.team,
      p: [round2(pos.x), round2(pos.y), round2(pos.z)],
    });
    broadcastStreakActivated(room, player, 'sentry');
  }
}

function tickRoom(room, now) {
  room.tick++;
  evaluateVoteKick(room, now);
  if (room.mapVote) {
    evaluateMapVote(room, now);
    for (const player of room.players.values()) sendSnapshot(player, now);
    return;
  }
  processMissiles(room, now);
  processCasRuns(room, now);
  processFirebombRuns(room, now);
  processAttackHelicopters(room, now);
  advanceServerUav(room.teamUav.blue, now);
  advanceServerUav(room.teamUav.red, now);
  processUavDrones(room, now);

  for (const player of room.players.values()) {
    tickPlayer(room, player, now);
  }
  processJuggernautAirdrops(room, now);
  processGrenades(room, now);
  processIncendiaries(room, now);
  for (const sentry of [...room.sentries.values()]) {
    tickSentry(room, sentry, now);
  }
  processStreakVoices(room, now);

  for (const player of room.players.values()) {
    sendSnapshot(player, now);
  }
}

function processUavDrones(room, now) {
  for (const [team, drone] of [...room.uavDrones]) {
    const uavState = room.teamUav[team];
    const timedOut = now >= drone.expiresAt
      || Boolean(uavState && uavState.uavUntil <= now);
    if (!drone.alive || drone.health <= 0
      || timedOut || !uavState) {
      if (timedOut && drone.alive && drone.health > 0) {
        scheduleStreakVoice(room, {
          cue: 'uav_outbound',
          dueAt: now,
          team,
        });
      }
      room.uavDrones.delete(team);
      continue;
    }
    updateUavDroneState(drone, now, 0);
  }
}

function nearestClaimableAirdrop(room, player, now) {
  let nearest = null;
  let bestDistance = Infinity;
  for (const drop of room.airdrops.values()) {
    if (!airdropClaimableBy(drop, {
      alive: player.actor.alive,
      juggernaut: player.juggernaut,
      position: player.actor.position,
    }, now)) continue;
    const dx = player.actor.position.x - drop.target[0];
    const dz = player.actor.position.z - drop.target[2];
    const distance = dx * dx + dz * dz;
    if (distance >= bestDistance) continue;
    nearest = drop;
    bestDistance = distance;
  }
  return nearest;
}

function tickJuggernautInteraction(room, player, now) {
  if (!player.input.interact || player.juggernaut) {
    player.airdropInteractId = null;
    player.airdropInteractStartedAt = 0;
    return false;
  }
  const drop = nearestClaimableAirdrop(room, player, now);
  if (!drop) {
    player.airdropInteractId = null;
    player.airdropInteractStartedAt = 0;
    return false;
  }

  // Claiming is an exclusive action: cancel a magazine cycle instead of
  // letting its client animation finish while authoritative firing is paused.
  player.reload = null;
  player.autoReloadAt = 0;
  player.reloadQueued = false;
  const stopped = Math.hypot(player.input.moveX, player.input.moveZ) <= 0.04
    && Math.hypot(player.actor.velocity.x, player.actor.velocity.z) <= 0.20
    && !player.input.jump
    && !player.input.sprint
    && !player.input.trigger
    && !player.input.grenade;
  if (!stopped) {
    player.airdropInteractId = drop.id;
    player.airdropInteractStartedAt = 0;
    return true;
  }
  if (player.airdropInteractId !== drop.id || !player.airdropInteractStartedAt) {
    player.airdropInteractId = drop.id;
    player.airdropInteractStartedAt = now;
    return true;
  }
  if (now - player.airdropInteractStartedAt < JUGGERNAUT_INTERACT_SECONDS * 1000) {
    return true;
  }

  room.airdrops.delete(drop.id);
  player.airdropInteractId = null;
  player.airdropInteractStartedAt = 0;
  player.juggernaut = true;
  player.actor.juggernaut = true;
  player.actor.maxHealth = JUGGERNAUT_MAX_HEALTH;
  player.actor.health = 100//JUGGERNAUT_MAX_HEALTH;
  configurePlayerPassiveEffects(player, { fillArmor: true });
  player.weaponId = 'minigun';
  player.input.weapon = 'minigun';
  player.weaponSwitch = null;
  player.reload = null;
  player.autoReloadAt = 0;
  player.meleeQueued = false;
  player.fireCooldown = 0.2;
  player.recoil = 0;
  player.lastTrigger = false;
  player.triggerBlockedUntilRelease = true;
  player.spinUpStartedAt = 0;
  player.ammo.minigun = {
    mag: WEAPON_DEFS.minigun.mag,
    reserve: WEAPON_DEFS.minigun.reserve,
  };
  player.grenades = 0;
  player.grenadePinAt = 0;
  player.input.grenade = false;
  player.input.grenadeAim = false;
  broadcast(room, {
    type: 'juggernaut_claimed',
    id: drop.id,
    playerId: player.id,
    name: player.name,
    team: player.team,
  });
  return true;
}

function processJuggernautAirdrops(room, now) {
  const expiresAfter = (AIRDROP_IMPACT_SECONDS + JUGGERNAUT_CRATE_LIFETIME_SECONDS) * 1000;
  for (const [id, drop] of room.airdrops) {
    if (now - drop.startedAt > expiresAfter) room.airdrops.delete(id);
  }
}

function tickPlayer(room, player, now) {
  const a = player.actor;
  if (!a.alive) {
    // A newly joined player reserves a team/room slot but deliberately has no
    // body until their loadout is deployed. Only an actually killed player
    // owns deathAnim and needs the corpse/camera physics advanced.
    if (!a.deathAnim) return;
    a.update(TICK_DT, {
      move: { x: 0, z: 0 },
      jump: false,
      crouch: false,
      slide: false,
      sprint: false,
      aim: false,
      aimBlend: 0,
      speedMult: 1,
    });
    if (automaticRespawnReady({
      alive: a.alive,
      deathAnimation: a.deathAnim,
      remaining: player.respawnAt - now,
      loadoutRequested: player.loadoutRequested,
    })) {
      respawnPlayer(room, player, now);
    }
    return;
  }

  if (now - player.lastInputAt > 1800) {
    player.input.moveX = 0;
    player.input.moveZ = 0;
    player.input.jump = false;
    player.input.sprint = false;
    player.input.trigger = false;
    player.input.grenadeAim = false;
    if (player.grenadePinAt <= 0) player.input.grenade = false;
    player.input.interact = false;
  }

  const input = player.input;
  a.yaw = input.yaw;
  a.pitch = input.pitch;
  const desiredWeapon = player.juggernaut
    ? 'minigun'
    : player.railgunActive
      ? LASER_CANNON_ID
      : playerAllowsWeapon(player, input.weapon)
        ? input.weapon
        : player.loadout.primary;
  const usingGrenade = !player.juggernaut && !player.railgunActive && (
    input.grenade || player.grenadePinAt > 0
      || player.grenadePinQueued || player.grenadeThrowQueued
  );
  if (!usingGrenade && input.weapon !== player.weaponId
    && input.weapon === desiredWeapon
    && player.weaponSwitch?.to !== input.weapon) {
    player.weaponSwitch = {
      to: input.weapon,
      applyAt: now + 210,
      endsAt: now + 420,
    };
    player.reload = null;
    player.spinUpStartedAt = 0;
  }
  if (player.weaponSwitch && now >= player.weaponSwitch.applyAt
    && player.weaponId !== player.weaponSwitch.to) {
    player.weaponId = player.weaponSwitch.to;
  }
  if (player.weaponSwitch && now >= player.weaponSwitch.endsAt) {
    player.weaponSwitch = null;
  }
  const def = WEAPON_DEFS[player.weaponId];
  player.adsBlend = damp(
    player.adsBlend,
    !def.melee && !usingGrenade && input.aim && !input.sprint
      && !player.reload ? 1 : 0,
    1 / Math.max(0.04, def.adsTime * 0.35),
    TICK_DT
  );
  a.adsBlend = player.adsBlend;
  const cmd = {
    move: { x: input.moveX, z: input.moveZ },
    crouch: input.crouch,
    slide: player.slideQueued,
    sprint: input.sprint,
    aim: !def.melee && !usingGrenade && input.aim,
    aimBlend: player.adsBlend,
    speedMult: (usingGrenade ? 0.95 : def.moveMult * (1 - player.adsBlend * 0.12))
      * loadoutMovementMultiplier(player.loadout)
      * readyForActionMovementMultiplier(readyForActionActive(
        player.loadout,
        player.readyForActionUntil,
        now
      )),
  };
  player.slideQueued = false;
  if (now > player.jumpQueuedUntil) player.jumpQueued = false;
  for (let i = 0; i < PVP_MOVEMENT_SUBSTEPS; i++) {
    const useJump = player.jumpQueued && a.grounded;
    if (useJump) player.jumpQueued = false;
    a.update(MOVEMENT_DT, {
      ...cmd,
      jump: useJump,
      // Slide is an edge-triggered action and must only be consumed once.
      slide: i === 0 && cmd.slide,
    });
  }
  if (!a.alive) {
    registerDeath(room, player, null, 'gravity', false);
    return;
  }

  if (tickJuggernautInteraction(room, player, now)) return;
  if (!tickGrenadeInput(room, player, now)) tickWeapon(room, player, now);
}

function tickGrenadeInput(room, player, now) {
  if (player.railgunActive) {
    player.grenadePinQueued = false;
    player.grenadeThrowQueued = false;
    player.input.grenade = false;
    player.input.grenadeAim = false;
    player.grenadePinAt = 0;
    player.lastGrenadeTrigger = false;
    return false;
  }
  const input = player.input;
  const selectedKind = grenadeKind(player.loadout.grenade);
  const impactFused = grenadeDetonatesOnImpact(selectedKind);
  const queuedPin = player.grenadePinQueued;
  const queuedThrow = player.grenadeThrowQueued;
  player.grenadePinQueued = false;
  player.grenadeThrowQueued = false;
  const selected = input.grenade || player.grenadePinAt > 0 || queuedPin || queuedThrow;
  if (!selected) {
    player.lastGrenadeTrigger = false;
    return false;
  }

  player.reload = null;
  player.autoReloadAt = 0;
  player.weaponSwitch = null;
  player.lastTrigger = false;
  player.meleeQueued = false;
  player.reloadQueued = false;

  if (player.grenadePinAt > 0
    && now >= player.grenadePinAt + GRENADE_FUSE_SECONDS * 1000) {
    const at = grenadeHandPosition(player);
    player.grenadePinAt = 0;
    player.input.grenade = false;
    player.input.grenadeAim = false;
    player.lastGrenadeTrigger = input.trigger;
    explodeGrenade(room, {
      id: randomUUID().slice(0, 10),
      ownerId: player.id,
      team: player.team,
      kind: grenadeKind(player.loadout.grenade),
      position: at,
    }, now);
    return true;
  }

  // `input.aim` remains as a compatibility path for an already-open older
  // client, while new clients use the buffered one-shot command.
  if (!impactFused && (queuedPin || input.aim)
    && player.grenadePinAt <= 0 && player.grenades > 0) {
    player.grenades--;
    player.grenadePinAt = now;
    send(player.ws, {
      type: 'grenade_pin',
      remaining: player.grenades,
      fuseAt: now + GRENADE_FUSE_SECONDS * 1000,
    });
  }

  const freshThrow = queuedThrow || (input.trigger && !player.lastGrenadeTrigger);
  if (freshThrow && (player.grenadePinAt > 0 || player.grenades > 0)) {
    if (player.grenadePinAt <= 0) {
      player.grenades--;
      player.grenadePinAt = now;
    }
    throwGrenade(room, player, now);
  }
  player.lastGrenadeTrigger = input.trigger;
  return true;
}

function grenadeHandPosition(player) {
  const direction = aimDirection(player.actor.yaw, player.actor.pitch);
  const right = new THREE.Vector3(
    Math.cos(player.actor.yaw),
    0,
    -Math.sin(player.actor.yaw)
  );
  return player.actor.eyePosition(new THREE.Vector3())
    .addScaledVector(direction, 0.42)
    .addScaledVector(right, 0.3)
    .addScaledVector(new THREE.Vector3(0, 1, 0), -0.18);
}

function throwGrenade(room, player, now) {
  const direction = aimDirection(player.actor.yaw, player.actor.pitch);
  const position = grenadeHandPosition(player);
  const detonateAt = player.grenadePinAt + GRENADE_FUSE_SECONDS * 1000;
  const grenade = {
    id: randomUUID().slice(0, 10),
    ownerId: player.id,
    team: player.team,
    kind: grenadeKind(player.loadout.grenade),
    position,
    velocity: grenadeThrowVelocity(direction, player.actor.velocity),
    detonateAt,
    impactFused: grenadeDetonatesOnImpact(player.loadout.grenade),
    bounces: 0,
    thrownAt: now,
    lastPhysicsAt: now,
    physicsRemainder: 0,
    physicsLifeRemaining: Math.max(0, (detonateAt - now) / 1000),
  };
  player.grenadePinAt = 0;
  player.input.grenade = false;
  player.input.grenadeAim = false;
  room.grenades.set(grenade.id, grenade);
  broadcast(room, {
    type: 'grenade_throw',
    id: grenade.id,
    ownerId: grenade.ownerId,
    team: grenade.team,
    kind: grenade.kind,
    p: grenadeVec3(grenade.position),
    v: grenadeVec3(grenade.velocity),
    thrownAt: grenade.thrownAt,
    detonateAt: grenade.detonateAt,
    remaining: player.grenades,
    source: 'throw',
  });
  broadcastOperatorVoice(
    room,
    player,
    operatorVoiceActionForGrenade(grenade.kind),
    now
  );
}

function dropPinnedGrenade(room, player, now) {
  if (player.grenadePinAt <= 0) return;
  const detonateAt = player.grenadePinAt + GRENADE_FUSE_SECONDS * 1000;
  const grenade = {
    id: randomUUID().slice(0, 10),
    ownerId: player.id,
    team: player.team,
    kind: grenadeKind(player.loadout.grenade),
    position: player.actor.eyePosition(new THREE.Vector3()),
    velocity: player.actor.velocity.clone().multiplyScalar(0.3),
    detonateAt,
    impactFused: grenadeDetonatesOnImpact(player.loadout.grenade),
    bounces: 0,
    thrownAt: now,
    lastPhysicsAt: now,
    physicsRemainder: 0,
    physicsLifeRemaining: Math.max(0, (detonateAt - now) / 1000),
  };
  player.grenadePinAt = 0;
  room.grenades.set(grenade.id, grenade);
  broadcast(room, {
    type: 'grenade_throw',
    id: grenade.id,
    ownerId: grenade.ownerId,
    team: grenade.team,
    kind: grenade.kind,
    p: grenadeVec3(grenade.position),
    v: grenadeVec3(grenade.velocity),
    thrownAt: grenade.thrownAt,
    detonateAt: grenade.detonateAt,
    remaining: player.grenades,
    source: 'death_drop',
  });
}

function dropMartyrdomGrenade(room, player, now) {
  const grenade = createMartyrdomGrenade({
    id: randomUUID().slice(0, 10),
    ownerId: player.id,
    team: player.team,
    position: player.actor.position,
    loadout: player.loadout,
    now,
    timeUnitsPerSecond: 1000,
  });
  if (!grenade) return null;
  grenade.thrownAt = now;
  grenade.lastPhysicsAt = now;
  grenade.physicsRemainder = 0;
  grenade.physicsLifeRemaining = Math.max(
    0,
    (grenade.detonateAt - now) / 1000
  );
  room.grenades.set(grenade.id, grenade);
  broadcast(room, {
    type: 'grenade_throw',
    id: grenade.id,
    ownerId: grenade.ownerId,
    team: grenade.team,
    kind: grenade.kind,
    source: grenade.source,
    p: grenadeVec3(grenade.position),
    v: grenadeVec3(grenade.velocity),
    thrownAt: grenade.thrownAt,
    droppedAt: now,
    detonateAt: grenade.detonateAt,
    remaining: player.grenades,
  });
  return grenade;
}

function tickWeapon(room, player, now) {
  const input = player.input;
  const def = WEAPON_DEFS[player.weaponId];
  const ammo = player.ammo[player.weaponId];
  const unlimitedAmmo = !def.limitedRewardAmmo && readyForActionActive(
    player.loadout,
    player.readyForActionUntil,
    now
  );
  player.fireCooldown = advanceFireCooldown(
    player.fireCooldown,
    TICK_DT,
    player.lastTrigger
  );
  player.recoil = Math.max(
    0,
    player.recoil - TICK_DT * (fireCooldownReady(player.fireCooldown) ? 7 : 1.2)
  );
  if (!input.trigger) player.triggerBlockedUntilRelease = false;
  const queuedMelee = player.meleeQueued;
  player.meleeQueued = false;

  if (unlimitedAmmo) {
    player.reload = null;
    player.autoReloadAt = 0;
    player.reloadQueued = false;
  } else {
    if (player.reload && now >= player.reload.endsAt) completeReload(player, now);
    if (player.autoReloadAt && now >= player.autoReloadAt) {
      player.autoReloadAt = 0;
      startReload(room, player, now);
    }
    if (player.reloadQueued) {
      startReload(room, player, now);
      player.reloadQueued = false;
    }
  }

  const fresh = input.trigger && !player.lastTrigger;
  let rawWants = def.melee ? queuedMelee : def.auto ? input.trigger : fresh;
  if (def.chargeTime) {
    const validCharge = laserCannonChargeInputValid({
      weaponId: def.id,
      active: player.railgunActive,
      trigger: input.trigger,
      aim: input.aim,
      adsBlend: player.adsBlend,
      sprinting: player.actor.sprinting,
      reloading: Boolean(player.reload),
      switching: Boolean(player.weaponSwitch),
      blocked: player.triggerBlockedUntilRelease,
      canAct: player.actor.alive,
    });
    if (!validCharge) {
      player.railgunChargeStartedAt = 0;
      rawWants = false;
    } else {
      if (!player.railgunChargeStartedAt) player.railgunChargeStartedAt = now;
      rawWants = now - player.railgunChargeStartedAt
        >= LASER_CANNON_CHARGE_SECONDS * 1000;
    }
  } else {
    player.railgunChargeStartedAt = 0;
  }
  const wants = rawWants && !player.triggerBlockedUntilRelease;
  const spinUpMs = Math.max(0, Number(def.spinUpTime) || 0) * 1000;
  if (spinUpMs > 0) {
    if (wants) {
      if (!player.spinUpStartedAt) player.spinUpStartedAt = now;
    } else {
      player.spinUpStartedAt = 0;
    }
  } else {
    player.spinUpStartedAt = 0;
  }
  const spunUp = spinUpMs <= 0
    || (player.spinUpStartedAt > 0 && now - player.spinUpStartedAt >= spinUpMs);
  if (!spunUp) player.fireCooldown = Math.max(0, player.fireCooldown);
  if (!def.melee && wants && player.reload && def.shellReload && ammo.mag > 0) {
    player.reload = null;
  }
  const canFire = player.actor.alive
    && (def.melee || !player.actor.sprinting)
    && !player.weaponSwitch
    && player.fireCooldown <= 0
    && !player.reload
    && spunUp
    && (def.melee || unlimitedAmmo || ammo.mag > 0);
  if (wants && canFire) {
    firePlayerWeapon(room, player, def, unlimitedAmmo);
    if (def.chargeTime && player.railgunActive) {
      player.railgunChargeStartedAt = now;
    }
  }
  if (!unlimitedAmmo && !def.melee && fresh && ammo.mag === 0
    && !player.reload && ammo.reserve > 0) startReload(room, player, now);
  player.lastTrigger = input.trigger;
}

function startReload(room, player, now) {
  if (player.reload || player.weaponSwitch) return;
  if (readyForActionActive(player.loadout, player.readyForActionUntil, now)) return;
  const def = WEAPON_DEFS[player.weaponId];
  if (def.melee || def.noReload) return;
  const ammo = player.ammo[player.weaponId];
  if (ammo.reserve <= 0 || ammo.mag >= def.mag) return;
  const duration = (def.shellReload
    ? def.reloadTime
    : ammo.mag === 0 ? def.reloadEmptyTime : def.reloadTime) * 1000;
  player.reload = {
    weapon: player.weaponId,
    startedAt: now,
    endsAt: now + duration,
    duration,
  };
  // Never let a stale/held trigger fire an invisible round on the exact tick
  // a magazine reload completes. A release clears this latch in tickWeapon.
  if (!def.shellReload) player.triggerBlockedUntilRelease = true;
  broadcastOperatorVoice(room, player, 'reload', now);
}

function completeReload(player, now) {
  const reload = player.reload;
  if (!reload) return;
  const def = WEAPON_DEFS[reload.weapon];
  const ammo = player.ammo[reload.weapon];
  if (def.shellReload) {
    const take = Math.min(1, ammo.reserve, def.mag - ammo.mag);
    ammo.mag += take;
    ammo.reserve -= take;
    if (ammo.mag < def.mag && ammo.reserve > 0) {
      reload.startedAt = now;
      reload.endsAt = now + def.reloadTime * 1000;
      return;
    }
  } else {
    const take = Math.min(def.mag - ammo.mag, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
  }
  player.reload = null;
}

function weaponSpread(player, def) {
  return playerWeaponSpread(def, {
    adsBlend: player.adsBlend,
    moveSpeed: player.actor.speed2D,
    grounded: player.actor.grounded,
    crouching: player.actor.crouching,
    recoilAccum: player.recoil,
  });
}

function firePlayerMelee(room, shooter, def) {
  shooter.fireCooldown = beginFireCooldown(shooter.fireCooldown, 60 / def.rpm);
  shooter.recoil = 0;
  shooter.firingSeq++;

  const origin = shooter.actor.eyePosition(new THREE.Vector3());
  const forward = aimDirection(shooter.actor.yaw, shooter.actor.pitch);
  const candidates = [];
  for (const target of room.players.values()) {
    if (target === shooter || !target.actor.alive) continue;
    candidates.push({
      kind: 'player',
      player: target,
      damageable: canDamagePvpTarget(shooter, target),
      point: combatKnifeTargetPoint(target.actor, new THREE.Vector3()),
      radius: target.juggernaut ? 0.57 : 0.43,
      surface: 'flesh',
    });
  }
  for (const sentry of room.sentries.values()) {
    if (!sentry.alive) continue;
    candidates.push({
      kind: 'sentry',
      sentry,
      damageable: canDamagePvpTarget(shooter, sentry),
      point: sentry.position.clone().add(new THREE.Vector3(0, 0.92, 0)),
      radius: 0.50,
      surface: 'metal',
    });
  }

  const target = chooseCombatKnifeTarget(
    origin,
    forward,
    candidates,
    (from, point, distance) => {
      const direction = point.clone().sub(from).normalize();
      const obstruction = rayWorld(room.level, from, direction, distance);
      return Boolean(obstruction && obstruction.distance < distance - 0.10);
    }
  );
  const end = target
    ? target.point.clone()
    : origin.clone().addScaledVector(forward, def.range);
  const impacts = [];
  let anyHit = false;
  let armorBroke = false;
  let killed = 0;
  let totalDamage = 0;
  const targetVitals = [];

  if (target?.damageable) {
    const hit = {
      distance: target.distance,
      point: target.point.clone(),
      normal: forward.clone().negate(),
      surface: target.surface,
      part: 'chest',
      mult: 1,
    };
    const shielded = target.kind === 'player' && playerIsInvulnerable(target.player);
    impacts.push({
      p: vec3(hit.point),
      n: vec3(hit.normal),
      surface: hit.surface,
      actor: true,
      shielded,
    });
    if (target.kind === 'player') {
      const result = damagePlayer(
        room,
        shooter,
        target.player,
        hit,
        def,
        forward,
        1
      );
      if (!result.blocked) {
        anyHit = true;
        armorBroke = result.armorBroke;
        killed = result.killed ? 1 : 0;
        totalDamage = result.damage;
        if (result.target) targetVitals.push(result.target);
      }
    } else {
      const result = damageSentry(room, shooter, target.sentry, hit, def, 1);
      anyHit = result.damage > 0;
      killed = result.killed ? 1 : 0;
      totalDamage = result.damage;
    }
  }

  broadcast(room, {
    type: 'shot',
    shooterId: shooter.id,
    shooterKind: 'player',
    team: shooter.team,
    weapon: def.id,
    origin: vec3(origin),
    traces: [vec3(end)],
    impacts,
    firing: shooter.firingSeq,
  });
  if (anyHit) {
    send(shooter.ws, {
      type: 'feedback',
      headshot: false,
      armorBroke,
      killed,
      damage: round2(totalDamage),
      uavDestroyed: false,
      targets: targetVitals,
    });
  }
}

function firePlayerWeapon(room, shooter, def, unlimitedAmmo = false) {
  if (def.melee) {
    firePlayerMelee(room, shooter, def);
    return;
  }
  const ammo = shooter.ammo[def.id];
  if (!unlimitedAmmo) ammo.mag--;
  shooter.fireCooldown = beginFireCooldown(shooter.fireCooldown, 60 / def.rpm);
  shooter.recoil = Math.min(shooter.recoil + (def.recoilV * 0.55 + 0.25), 9);
  shooter.firingSeq++;
  // Capture the settled optic cone before reloadEachShot deliberately drops
  // ADS. Computing this after the drop would turn every charged beam into a
  // hip-fire ray even though the authority correctly required a full scope.
  const spread = weaponSpread(shooter, def);
  if (def.reloadEachShot) {
    shooter.adsBlend = 0;
    shooter.triggerBlockedUntilRelease = true;
    if (ammo.reserve > 0) startReload(room, shooter, Date.now());
  } else if (!unlimitedAmmo && ammo.mag === 0 && ammo.reserve > 0) {
    shooter.autoReloadAt = Date.now() + ((def.boltTime || def.pumpTime || 0.12) + 0.1) * 1000;
  }

  const origin = shooter.actor.eyePosition(new THREE.Vector3());
  const aim = aimDirection(shooter.actor.yaw, shooter.actor.pitch);
  const traces = [];
  const impacts = [];
  let anyHit = false;
  let anyHead = false;
  let armorBroke = false;
  let killed = 0;
  let totalDamage = 0;
  let uavDestroyed = false;
  let attackHelicopterDestroyed = false;
  const targetVitals = new Map();

  for (let i = 0; i < def.pellets; i++) {
    const dir = coneDirection(aim, spread);
    const maxDistance = def.range * 2.2;
    const hits = def.piercesWorld
      ? castRoomPiercingRay(room, shooter, origin, dir, maxDistance)
      : [castRoomRay(room, shooter, shooter.team, origin, dir, maxDistance)]
        .filter(Boolean);
    const end = def.piercesWorld
      ? origin.clone().addScaledVector(dir, maxDistance)
      : hits[0]?.point
        || origin.clone().addScaledVector(dir, def.range * 1.6);
    traces.push(vec3(end));
    for (const hit of hits) {
      const shielded = hit.kind === 'player' && playerIsInvulnerable(hit.player);
      impacts.push({
        p: vec3(hit.point),
        n: vec3(hit.normal),
        surface: hit.surface,
        actor: hit.kind !== 'world',
        shielded,
      });
      if (hit.kind === 'player' && canDamagePvpTarget(shooter, hit.player)) {
        const result = damagePlayer(room, shooter, hit.player, hit, def, dir, 1);
        if (result.blocked) continue;
        anyHit = true;
        anyHead ||= result.headshot;
        armorBroke ||= result.armorBroke;
        killed += result.killed ? 1 : 0;
        totalDamage += result.damage;
        if (result.target) {
          const previous = targetVitals.get(result.target.id);
          targetVitals.set(result.target.id, previous
            ? {
                ...result.target,
                beforeHealth: previous.beforeHealth,
                beforeArmor: previous.beforeArmor,
              }
            : result.target);
        }
      } else if (hit.kind === 'sentry' && canDamagePvpTarget(shooter, hit.sentry)) {
        const result = damageSentry(room, shooter, hit.sentry, hit, def, 1);
        anyHit = true;
        killed += result.killed ? 1 : 0;
        totalDamage += result.damage;
      } else if (hit.kind === 'uav' && canDamagePvpTarget(shooter, hit.drone)) {
        const result = damageUavDrone(room, shooter, hit.drone, hit, def, 1);
        anyHit = true;
        uavDestroyed ||= result.killed;
        totalDamage += result.damage;
      } else if (hit.kind === 'attack_helicopter'
        && canDamagePvpTarget(shooter, hit.heli)) {
        const result = damageAttackHelicopter(
          room,
          shooter,
          hit.heli,
          hit,
          def,
          1
        );
        anyHit = true;
        attackHelicopterDestroyed ||= result.killed;
        totalDamage += result.damage;
      }
    }
  }

  broadcast(room, {
    type: 'shot',
    shooterId: shooter.id,
    shooterKind: 'player',
    team: shooter.team,
    weapon: def.id,
    origin: vec3(origin),
    traces,
    impacts,
    firing: shooter.firingSeq,
  });
  if (anyHit) {
    send(shooter.ws, {
      type: 'feedback',
      headshot: anyHead,
      armorBroke,
      killed,
      damage: round2(totalDamage),
      uavDestroyed,
      attackHelicopterDestroyed,
      targets: [...targetVitals.values()],
    });
  }
  if (def.id === LASER_CANNON_ID && ammo.mag <= 0 && ammo.reserve <= 0) {
    endLaserCannon(shooter);
  }
}

function castRoomPiercingRay(room, shooter, origin, dir, maxDistance) {
  const hits = [];
  for (const target of room.players.values()) {
    if (target === shooter || !target.actor.alive
      || !canDamagePvpTarget(shooter, target)) continue;
    const hit = rayPlayer(target, origin, dir, maxDistance);
    if (hit) hits.push(hit);
  }
  for (const sentry of room.sentries.values()) {
    if (!sentry.alive || !canDamagePvpTarget(shooter, sentry)) continue;
    const hit = raySentry(sentry, origin, dir, maxDistance);
    if (hit) hits.push(hit);
  }
  for (const drone of room.uavDrones.values()) {
    if (!canDamagePvpTarget(shooter, drone)) continue;
    const hit = rayUavDrone(drone, origin, dir, maxDistance);
    if (hit) hits.push(hit);
  }
  for (const heli of room.attackHelicopters.values()) {
    if (!canDamagePvpTarget(shooter, heli)) continue;
    const hit = rayAttackHelicopter(heli, origin, dir, maxDistance);
    if (hit) hits.push(hit);
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

function castRoomRay(room, shooter, team, origin, dir, maxDistance) {
  let best = rayWorld(room.level, origin, dir, maxDistance);
  for (const target of room.players.values()) {
    if (target === shooter || !target.actor.alive) continue;
    const hit = rayPlayer(target, origin, dir, maxDistance);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  for (const sentry of room.sentries.values()) {
    if (!sentry.alive || sentry.ownerId === shooter?.id) continue;
    const hit = raySentry(sentry, origin, dir, maxDistance);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  for (const drone of room.uavDrones.values()) {
    const hit = rayUavDrone(drone, origin, dir, maxDistance);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  for (const heli of room.attackHelicopters.values()) {
    const hit = rayAttackHelicopter(heli, origin, dir, maxDistance);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  return best;
}

function damagePlayer(room, attacker, victim, hit, def, dir, sourceScale) {
  if (!canDamagePvpTarget(attacker, victim)) {
    return { killed: false, armorBroke: false, damage: 0 };
  }
  if (!victim.actor.alive) return { killed: false, armorBroke: false, damage: 0 };
  if (playerIsInvulnerable(victim)) {
    return { killed: false, armorBroke: false, damage: 0, blocked: true };
  }
  const fixedRailgunDamage = def.id === LASER_CANNON_ID;
  const fall = fixedRailgunDamage ? 0 : clamp((hit.distance - def.range * 0.35) / (def.range * 0.75), 0, 1);
  const headshot = fixedRailgunDamage ? false : characterHitIsHeadshot(victim, hit.part);
  const hitMult = fixedRailgunDamage ? 1 : characterHitMultiplier(victim, hit.part, hit.mult);
  const damage = fixedRailgunDamage
    ? 300
    : def.damage * hitMult * lerp(1, def.minDamage, fall) * sourceScale;
  const beforeHealth = victim.actor.health;
  const beforeArmor = victim.actor.armor;
  const killed = victim.actor.takeDamage(damage, attacker.actor?.position || attacker.position, attacker);
  recordDamageContribution(victim, attacker, damage);
  const armorBroke = beforeArmor > 0 && victim.actor.armor <= 0;
  send(victim.ws, {
    type: 'damage',
    amount: round2(damage),
    armorBroke,
    from: vec3(attacker.actor?.position || attacker.position),
    attackerId: attacker.id,
    weapon: def.id,
  });
  if (killed) registerDeath(room, victim, attacker, def.id, headshot);
  return {
    killed,
    headshot,
    armorBroke,
    damage,
    target: {
      id: victim.id,
      team: victim.team,
      beforeHealth: round2(beforeHealth),
      beforeArmor: round2(beforeArmor),
      health: round2(victim.actor.health),
      maxHealth: victim.actor.maxHealth,
      armor: round2(victim.actor.armor),
      maxArmor: victim.actor.maxArmor,
      alive: victim.actor.alive,
      p: vec3(victim.actor.position),
      crouch: victim.actor.crouching,
    },
  };
}

function damageSentry(room, attacker, sentry, hit, def, sourceScale) {
  if (!canDamagePvpTarget(attacker, sentry)) return { killed: false, damage: 0 };
  if (!sentry.alive) return { killed: false, damage: 0 };
  const fall = clamp((hit.distance - def.range * 0.35) / (def.range * 0.75), 0, 1);
  const damage = def.id === LASER_CANNON_ID
    ? 300
    : def.damage * hit.mult * lerp(1, def.minDamage, fall) * sourceScale;
  sentry.health -= damage;
  const killed = sentry.health <= 0;
  if (killed) {
    sentry.alive = false;
    room.sentries.delete(sentry.id);
    broadcast(room, { type: 'sentry_destroyed', id: sentry.id });
  }
  return { killed, damage };
}

function damageUavDrone(room, attacker, drone, hit, def, sourceScale) {
  if (!canDamagePvpTarget(attacker, drone)) return { killed: false, damage: 0 };
  if (!drone.alive || drone.health <= 0) return { killed: false, damage: 0 };
  const fall = clamp((hit.distance - def.range * 0.35) / (def.range * 0.75), 0, 1);
  const damage = def.id === LASER_CANNON_ID
    ? 300
    : def.damage * hit.mult * lerp(1, def.minDamage, fall) * sourceScale;
  drone.health = Math.max(0, drone.health - damage);
  const killed = drone.health <= 0;
  if (killed) {
    drone.alive = false;
    room.uavDrones.delete(drone.team);
    deactivateServerUav(room.teamUav[drone.team]);
    broadcast(room, {
      type: 'uav_destroyed',
      id: drone.id,
      team: drone.team,
      killerId: attacker.id || null,
      killerName: attacker.name || 'ENEMY',
    });
  }
  return { killed, damage };
}

function damageAttackHelicopter(
  room,
  attacker,
  heli,
  hit,
  def,
  sourceScale
) {
  if (!canDamagePvpTarget(attacker, heli)) {
    return { killed: false, damage: 0 };
  }
  if (!heli.alive || heli.health <= 0) {
    return { killed: false, damage: 0 };
  }
  const fall = clamp(
    (hit.distance - def.range * 0.35) / (def.range * 0.75),
    0,
    1
  );
  const damage = def.id === LASER_CANNON_ID
    ? 300
    : def.damage * hit.mult * lerp(1, def.minDamage, fall) * sourceScale;
  heli.health = Math.max(0, heli.health - damage);
  const killed = heli.health <= 0;
  if (killed) {
    heli.alive = false;
    room.attackHelicopters.delete(heli.id);
    broadcast(room, {
      type: 'attack_helicopter_destroyed',
      id: heli.id,
      team: heli.team,
      killerId: attacker.id || null,
      killerName: attacker.name || 'ENEMY',
    });
  }
  return { killed, damage };
}

function recordDamageContribution(victim, attacker, damage, now = Date.now()) {
  if (!victim?.damageContributors || !attacker?.id || attacker.id === victim.id
    || attacker.team === victim.team || damage <= 0) return;
  const previous = victim.damageContributors.get(attacker.id);
  victim.damageContributors.set(attacker.id, {
    damage: (previous?.damage || 0) + damage,
    at: now,
  });
}

function awardDeathAssists(room, victim, killer, now = Date.now()) {
  for (const [attackerId, contribution] of victim.damageContributors) {
    if (attackerId === killer?.id || now - contribution.at > ASSIST_WINDOW_MS) continue;
    const assistant = room.players.get(attackerId);
    if (!assistant?.ws || assistant.team === victim.team) continue;
    awardScore(assistant, ASSIST_SCORE);
    send(assistant.ws, {
      type: 'score_award',
      amount: ASSIST_SCORE,
      label: 'KILL ASSIST',
      victimId: victim.id,
      victim: victim.name,
    });
  }
  victim.damageContributors.clear();
}

function registerDeath(room, victim, attacker, weapon, headshot) {
  const now = Date.now();
  if (victim.respawnAt > now) return;
  dropPinnedGrenade(room, victim, now);
  dropMartyrdomGrenade(room, victim, now);
  victim.deaths++;
  victim.streak = 0;
  victim.streakScore = 0;
  victim.respawnAt = now + PVP_RESPAWN_MS;
  victim.loadoutRequested = false;
  victim.invulnerableUntil = 0;
  victim.readyForActionUntil = 0;
  victim.actor.health = 0;
  if (victim.actor.alive && !victim.actor.deathAnim) {
    victim.actor.die(attacker?.actor?.position || attacker?.position || null, attacker);
  }
  victim.actor.alive = false;
  victim.jumpQueued = false;
  victim.jumpQueuedUntil = 0;
  victim.grenadePinQueued = false;
  victim.grenadeThrowQueued = false;
  victim.meleeQueued = false;
  victim.input.grenade = false;
  victim.input.grenadeAim = false;
  victim.lastGrenadeTrigger = false;
  victim.lastTrigger = false;
  victim.spinUpStartedAt = 0;
  endLaserCannon(victim);

  awardDeathAssists(room, victim, attacker, now);
  if (attacker && attacker.id !== victim.id && attacker.ws) {
    const teamKey = attacker.team === 'blue' ? 'blueTickets' : 'redTickets';
    room.match[teamKey] = Math.min(
      PVP_MATCH_SCORE_LIMIT,
      room.match[teamKey] + 1
    );
    attacker.kills++;
    const rewardKill = weapon === 'strike'
      || weapon === 'sentry'
      || weapon === 'cas'
      || weapon === 'firebomb'
      || weapon === 'attack_helicopter'
      || weapon === LASER_CANNON_ID;
    awardScore(attacker, 100 + (headshot ? 50 : 0));
    if (loadoutHasPassive(attacker.loadout, PASSIVE_IDS.PREDATORY_INSTINCT)
      && attacker.actor.alive) {
      attacker.actor.armor = attacker.actor.maxArmor;
    }
    if (!rewardKill) {
      const def = WEAPON_DEFS[attacker.weaponId];
      const ammo = attacker.ammo[attacker.weaponId];
      ammo.reserve = Math.min(def.reserve, ammo.reserve + Math.ceil(def.mag * 0.75));
      const beforeStreakKills = attacker.streak;
      attacker.streak++;
      attacker.streakScore = attacker.streak;
      grantKillstreakRewards(attacker, beforeStreakKills, attacker.streak);
      if (attacker.streak > 0 && attacker.streak % 3 === 0) awardScore(attacker, 50);
    }
  }

  broadcast(room, {
    type: 'kill',
    killerId: attacker?.id || null,
    killer: attacker?.name || 'WORLD',
    killerTeam: attacker?.team || (victim.team === 'blue' ? 'red' : 'blue'),
    victimId: victim.id,
    victim: victim.name,
    victimTeam: victim.team,
    weapon,
    headshot,
  });
  checkRound(room);
}

function grantKillstreakRewards(player, beforeKills, afterKills) {
  const rewards = [
    ['uav', 'uavCharges'],
    [LASER_CANNON_ID, 'railgunCharges'],
    ['strike', 'strikeCharges'],
    ['juggernaut', 'juggernautCharges'],
    ['sentry', 'sentryCharges'],
    ['cas', 'casCharges'],
    ['firebomb', 'firebombCharges'],
    ['attack_helicopter', 'attackHelicopterCharges'],
  ];
  for (const [reward, chargeKey] of rewards) {
    if (!loadoutHasStreak(player.loadout, reward)) continue;
    const count = loadoutStreakCrossings(
      player.loadout,
      reward,
      beforeKills,
      afterKills
    );
    if (count <= 0) continue;
    player[chargeKey] += count;
    send(player.ws, {
      type: 'reward',
      reward,
      count,
      streak: player.streak,
      score: player.streakScore,
    });
  }
}

function awardScore(player, amount) {
  player.score += amount;
}

function publicMapVote(room) {
  if (!room.mapVote) return null;
  return {
    type: 'map_vote_started',
    options: PVP_MAP_OPTIONS,
    counts: mapVoteCounts(room.mapVote.votes),
    endsAt: room.mapVote.endsAt,
    round: room.round,
  };
}

function broadcastMapVoteUpdate(room) {
  if (!room.mapVote) return;
  broadcast(room, {
    type: 'map_vote_update',
    counts: mapVoteCounts(room.mapVote.votes),
    endsAt: room.mapVote.endsAt,
  });
}

function startMapVote(room, winner, now = Date.now()) {
  if (room.mapVote) return;
  room.match.over = true;
  room.match.winner = winner;
  room.mapVote = {
    startedAt: now,
    endsAt: now + PVP_MAP_VOTE_DURATION_MS,
    votes: new Map(),
  };
  for (const player of room.players.values()) {
    player.input = neutralInput(player.weaponId);
    player.lastTrigger = false;
    player.spinUpStartedAt = 0;
    endLaserCannon(player);
  }
  broadcast(room, { type: 'round_end', winner, round: room.round });
  broadcast(room, publicMapVote(room));
}

function castMapVote(player, mapId, now = Date.now()) {
  const vote = player.room.mapVote;
  if (!vote || now >= vote.endsAt || !isPvpMapOption(mapId)) return;
  vote.votes.set(player.id, mapId);
  broadcastMapVoteUpdate(player.room);
}

function clearRoomWorld(room) {
  room.sentries.clear();
  room.grenades.clear();
  room.incendiaries.clear();
  room.missiles.clear();
  room.casRuns.clear();
  room.firebombRuns.clear();
  room.attackHelicopters.clear();
  room.pendingStreakVoices.length = 0;
  room.airdrops.clear();
  room.uavDrones.clear();
  room.teamUav = createTeamUavStates();
}

function resetPlayerForNextMatch(room, player, now) {
  player.actor.level = room.level;
  player.kills = 0;
  player.deaths = 0;
  player.score = 0;
  player.streak = 0;
  player.streakScore = 0;
  player.damageContributors.clear();
  player.uavCharges = 0;
  player.strikeCharges = 0;
  player.sentryCharges = 0;
  player.casCharges = 0;
  player.firebombCharges = 0;
  player.attackHelicopterCharges = 0;
  player.juggernautCharges = 0;
  player.railgunCharges = 0;
  player.missileId = null;
  player.respawnAt = 0;
  player.loadoutRequested = !player.hasDeployed;
  if (player.hasDeployed) {
    respawnPlayer(room, player, now);
  } else {
    player.actor.alive = false;
    player.actor.health = 0;
    player.actor.armor = 0;
  }
}

function finishMapVote(room, now = Date.now()) {
  if (!room.mapVote) return;
  const { mapId, counts } = resolveMapVote(room.mapVote.votes);
  room.mapId = mapId;
  room.level = levels.get(mapId);
  room.mapVote = null;
  room.round++;
  clearRoomWorld(room);
  room.match = {
    blueTickets: 0,
    redTickets: 0,
    maxTickets: PVP_MATCH_SCORE_LIMIT,
    over: false,
    winner: null,
  };
  for (const player of room.players.values()) resetPlayerForNextMatch(room, player, now);
  broadcast(room, {
    type: 'map_vote_result',
    mapId,
    mapName: PVP_MAP_OPTIONS.find((option) => option.id === mapId)?.name || mapId,
    counts,
    round: room.round,
  });
  broadcastRooms();
}

function evaluateMapVote(room, now = Date.now()) {
  if (room.mapVote && now >= room.mapVote.endsAt) finishMapVote(room, now);
}

function checkRound(room) {
  if (room.match.over || (
    room.match.blueTickets < PVP_MATCH_SCORE_LIMIT
    && room.match.redTickets < PVP_MATCH_SCORE_LIMIT
  )) return;
  const winner = room.match.blueTickets > room.match.redTickets ? 'blue' : 'red';
  startMapVote(room, winner);
}

function respawnPlayer(room, player, now = Date.now()) {
  endLaserCannon(player, { restoreWeapon: false });
  player.damageContributors.clear();
  player.actor.level = room.level;
  player.actor.respawn(pickServerSpawn(room.level, player.team, room.players.values()));
  player.actor.team = player.team;
  player.juggernaut = false;
  player.actor.juggernaut = false;
  configurePlayerPassiveEffects(player, { fillArmor: true });
  player.respawnAt = 0;
  player.loadoutRequested = false;
  player.invulnerableUntil = now + PVP_SPAWN_PROTECTION_MS;
  player.readyForActionUntil = readyForActionUntil(
    player.loadout,
    now,
    1000
  );
  player.ammo = makeAmmo();
  player.weaponId = player.loadout.primary;
  player.weaponSwitch = null;
  player.input.weapon = player.loadout.primary;
  player.input.jump = false;
  player.jumpQueued = false;
  player.jumpQueuedUntil = 0;
  player.reload = null;
  player.autoReloadAt = 0;
  player.fireCooldown = 0.15;
  player.recoil = 0;
  player.lastTrigger = false;
  player.spinUpStartedAt = 0;
  player.railgunChargeStartedAt = 0;
  player.lastGrenadeTrigger = false;
  player.grenadePinQueued = false;
  player.grenadeThrowQueued = false;
  player.meleeQueued = false;
  player.triggerBlockedUntilRelease = false;
  player.grenades = GRENADES_PER_LIFE;
  player.grenadePinAt = 0;
  player.input.grenade = false;
  player.input.grenadeAim = false;
  player.input.interact = false;
  player.airdropInteractId = null;
  player.airdropInteractStartedAt = 0;
}

function tickSentry(room, sentry, now) {
  if (now >= sentry.expiresAt) {
    sentry.alive = false;
    room.sentries.delete(sentry.id);
    broadcast(room, { type: 'sentry_destroyed', id: sentry.id, reason: 'timeout' });
    return;
  }
  sentry.scanTimer -= TICK_DT;
  sentry.fireCooldown = Math.max(0, sentry.fireCooldown - TICK_DT);
  if (sentry.scanTimer <= 0) {
    sentry.scanTimer = 0.25;
    sentry.targetId = findSentryTarget(room, sentry)?.id || null;
  }
  const target = sentry.targetId ? room.players.get(sentry.targetId) : null;
  if (!target || !target.actor.alive || target.team === sentry.team
    || loadoutHasPassive(target.loadout, PASSIVE_IDS.ELECTRONIC_STEALTH)) {
    sentry.targetId = null;
    sentry.yaw += TICK_DT * 0.5;
    sentry.pitch = damp(sentry.pitch, -0.04, 5, TICK_DT);
    return;
  }

  const tx = target.actor.position.x;
  const ty = target.actor.position.y + 1.2;
  const tz = target.actor.position.z;
  const wantYaw = Math.atan2(-(tx - sentry.position.x), -(tz - sentry.position.z));
  const pivotY = sentry.position.y + 1.46;
  const horizontal = Math.hypot(tx - sentry.position.x, tz - sentry.position.z);
  const wantPitch = clamp(
    Math.atan2(ty - pivotY, Math.max(horizontal, 0.01)),
    SENTRY_CONFIG.pitchMin,
    SENTRY_CONFIG.pitchMax
  );
  sentry.yaw = angleDamp(sentry.yaw, wantYaw, 10, TICK_DT);
  sentry.pitch = damp(sentry.pitch, wantPitch, 12, TICK_DT);
  if (Math.abs(angleDelta(sentry.yaw, wantYaw)) < 0.12
    && Math.abs(sentry.pitch - wantPitch) < 0.06
    && sentry.fireCooldown <= 0) {
    sentry.fireCooldown = 60 / WEAPON_DEFS.rifle.rpm;
    fireSentry(room, sentry, target);
  }
}

function findSentryTarget(room, sentry) {
  let best = null;
  let bestDistance = SENTRY_CONFIG.range;
  const origin = sentry.position.clone().add(new THREE.Vector3(0, 1.46, 0));
  for (const player of room.players.values()) {
    if (!player.actor.alive || player.team === sentry.team) continue;
    if (loadoutHasPassive(player.loadout, PASSIVE_IDS.ELECTRONIC_STEALTH)) continue;
    const target = player.actor.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const dir = target.sub(origin);
    const distance = dir.length();
    if (distance >= bestDistance) continue;
    dir.multiplyScalar(1 / distance);
    const world = rayWorld(room.level, origin, dir, distance);
    if (world && world.distance < distance - 0.25) continue;
    best = player;
    bestDistance = distance;
  }
  return best;
}

function fireSentry(room, sentry, target) {
  const def = { ...WEAPON_DEFS.rifle, id: 'sentry' };
  const pivot = sentry.position.clone().add(new THREE.Vector3(0, 1.46, 0));
  const forward = aimDirection(sentry.yaw, sentry.pitch);
  const origin = pivot.clone().addScaledVector(forward, 2.05);
  const dir = coneDirection(forward, SENTRY_CONFIG.spread);
  const owner = room.players.get(sentry.ownerId);
  const hit = castRoomRay(room, owner || sentry, sentry.team, origin, dir, def.range);
  const end = hit ? hit.point : origin.clone().addScaledVector(dir, def.range);
  let feedback = null;
  if (hit?.kind === 'player' && canDamagePvpTarget(sentry, hit.player)) {
    feedback = damagePlayer(
      room,
      owner || sentry,
      hit.player,
      hit,
      def,
      dir,
      SENTRY_CONFIG.damageScale
    );
    if (feedback.blocked) feedback = null;
  }
  broadcast(room, {
    type: 'shot',
    shooterId: sentry.id,
    ownerId: sentry.ownerId,
    shooterKind: 'sentry',
    team: sentry.team,
    weapon: 'sentry',
    origin: vec3(origin),
    traces: [vec3(end)],
    impacts: hit
      ? [{
          p: vec3(hit.point),
          n: vec3(hit.normal),
          surface: hit.surface,
          actor: hit.kind !== 'world',
          shielded: hit.kind === 'player' && playerIsInvulnerable(hit.player),
        }]
      : [],
  });
  if (feedback && owner) {
    send(owner.ws, {
      type: 'feedback',
      headshot: feedback.headshot,
      armorBroke: feedback.armorBroke,
      killed: feedback.killed ? 1 : 0,
      damage: round2(feedback.damage),
      reward: 'sentry',
    });
  }
}

function processGrenades(room, now) {
  for (const grenade of [...room.grenades.values()]) {
    const previousPhysicsAt = Number(grenade.lastPhysicsAt);
    const elapsed = Number.isFinite(previousPhysicsAt)
      ? Math.max(0, (now - previousPhysicsAt) / 1000)
      : TICK_DT;
    grenade.lastPhysicsAt = now;
    advanceGrenade(grenade, elapsed, (origin, direction, distance) =>
      rayGrenadeWorld(room.level, origin, direction, distance));
    // The browser already runs the exact PVE grenade simulation locally.
    // Replacing its state at every bounce made an otherwise natural rebound
    // visibly pull backwards. Authority only needs to lock the final resting
    // point; moving grenades remain server-owned for damage and detonation.
    if (grenadeRestSyncNeeded(grenade)) {
      grenade.restSyncSent = true;
      broadcast(room, {
        type: 'grenade_sync',
        id: grenade.id,
        p: grenadeVec3(grenade.position),
        v: grenadeVec3(grenade.velocity),
        bounces: grenade.bounces || 0,
        resting: Boolean(grenade.resting),
        remainder: round4(grenade.physicsRemainder || 0),
        serverTime: now,
      });
    }
    if (!grenade.impactThisStep && now < grenade.detonateAt) continue;
    room.grenades.delete(grenade.id);
    explodeGrenade(room, grenade, now);
  }
}

function incendiaryGroundPoint(room, at) {
  const origin = at.clone().add(new THREE.Vector3(0, 1.2, 0));
  const hit = rayGrenadeWorld(
    room.level,
    origin,
    new THREE.Vector3(0, -1, 0),
    24
  );
  return hit
    ? hit.point.clone().add(new THREE.Vector3(0, 0.025, 0))
    : at.clone();
}

function explodeGrenade(room, grenade, now) {
  const kind = grenadeKind(grenade.kind);
  const at = grenadeCreatesFire(kind)
    ? incendiaryGroundPoint(room, grenade.position)
    : grenade.position.clone();
  const owner = room.players.get(grenade.ownerId);
  if (grenadeCreatesFire(kind)) {
    const duration = incendiaryDuration(kind);
    const zone = {
      id: grenade.id,
      ownerId: grenade.ownerId,
      team: grenade.team,
      kind,
      position: at,
      expiresAt: now + duration * 1000,
      nextDamageAt: now,
      nextBroadcastAt: now + 1000,
    };
    room.incendiaries.set(zone.id, zone);
    broadcast(room, {
      type: 'grenade_explode',
      id: grenade.id,
      ownerId: grenade.ownerId,
      team: grenade.team,
      kind,
      p: grenadeVec3(at),
      explodedAt: now,
      expiresAt: zone.expiresAt,
    });
    return;
  }
  broadcast(room, {
    type: 'grenade_explode',
    id: grenade.id,
    ownerId: grenade.ownerId,
    team: grenade.team,
    kind,
    p: grenadeVec3(at),
    explodedAt: now,
  });
  if (!owner) return;

  let anyEnemyHit = false;
  let armorBroke = false;
  let killed = 0;
  let totalDamage = 0;
  const targets = [];
  for (const target of room.players.values()) {
    if (!target.actor.alive || !canDamagePvpTarget(owner, target, true)) continue;
    if (playerIsInvulnerable(target, now)) continue;
    const targetPoint = new THREE.Vector3(
      target.actor.position.x,
      target.actor.position.y + 0.9,
      target.actor.position.z
    );
    const distance = targetPoint.distanceTo(at);
    const occluded = target.id !== owner.id && grenadeBlastOccluded(
      at,
      targetPoint,
      (origin, direction, maxDistance) =>
        rayGrenadeWorld(room.level, origin, direction, maxDistance)
    );
    const damage = loadoutExplosiveDamage(
      target.loadout,
      grenadeDamage(distance, occluded)
    );
    if (damage <= 0.01) continue;
    const beforeHealth = target.actor.health;
    const beforeArmor = target.actor.armor;
    const died = target.actor.takeDamage(damage, at, owner);
    recordDamageContribution(target, owner, damage, now);
    const broke = beforeArmor > 0 && target.actor.armor <= 0;
    if (died) registerDeath(room, target, owner, 'grenade', false);
    send(target.ws, {
      type: 'damage',
      amount: round2(damage),
      armorBroke: broke,
      from: vec3(at),
      attackerId: owner.id,
      weapon: 'grenade',
    });
    if (target.id === owner.id) continue;
    anyEnemyHit = true;
    armorBroke ||= broke;
    killed += died ? 1 : 0;
    totalDamage += damage;
    targets.push({
      id: target.id,
      team: target.team,
      beforeHealth: round2(beforeHealth),
      beforeArmor: round2(beforeArmor),
      health: round2(target.actor.health),
      maxHealth: target.actor.maxHealth,
      armor: round2(target.actor.armor),
      maxArmor: target.actor.maxArmor,
      alive: target.actor.alive,
      p: vec3(target.actor.position),
      crouch: target.actor.crouching,
    });
  }

  for (const sentry of [...room.sentries.values()]) {
    if (!canDamagePvpTarget(owner, sentry)) continue;
    const targetPoint = sentry.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const distance = targetPoint.distanceTo(at);
    const occluded = grenadeBlastOccluded(
      at,
      targetPoint,
      (origin, direction, maxDistance) =>
        rayGrenadeWorld(room.level, origin, direction, maxDistance)
    );
    sentry.health -= grenadeDamage(distance, occluded);
    if (sentry.health > 0) continue;
    room.sentries.delete(sentry.id);
    broadcast(room, { type: 'sentry_destroyed', id: sentry.id });
  }

  if (anyEnemyHit) {
    send(owner.ws, {
      type: 'feedback',
      headshot: false,
      armorBroke,
      killed,
      damage: round2(totalDamage),
      targets,
    });
  }
}

function processIncendiaries(room, now) {
  const dueZones = [];
  for (const zone of [...room.incendiaries.values()]) {
    if (now >= zone.expiresAt) {
      room.incendiaries.delete(zone.id);
      broadcast(room, { type: 'incendiary_end', id: zone.id });
      continue;
    }
    if (now >= zone.nextBroadcastAt) {
      zone.nextBroadcastAt = now + 1000;
      broadcast(room, {
        type: 'incendiary_zone',
        id: zone.id,
        ownerId: zone.ownerId,
        team: zone.team,
        kind: zone.kind,
        p: vec3(zone.position),
        expiresAt: zone.expiresAt,
      });
    }
    if (now < zone.nextDamageAt) continue;
    zone.nextDamageAt = now + INCENDIARY_TICK_SECONDS * 1000;
    dueZones.push(zone);
  }
  if (!dueZones.length) return;

  // Build player/sentry target points once per 0.5 s fire sweep. Previously
  // every one of twelve B-2 fields allocated the same vectors again and ran a
  // complete nested entity pass. Zone order is retained, so damage, armor and
  // death semantics remain identical.
  const playerTargets = [...room.players.values()].map((target) => ({
    target,
    point: new THREE.Vector3(
      target.actor.position.x,
      target.actor.position.y + 0.82,
      target.actor.position.z
    ),
  }));
  const sentryTargets = [...room.sentries.values()].map((sentry) => ({
    sentry,
    point: sentry.position.clone().add(new THREE.Vector3(0, 0.9, 0)),
  }));

  for (const zone of dueZones) {
    const owner = room.players.get(zone.ownerId);
    const source = owner || {
      id: zone.ownerId,
      team: zone.team,
      name: 'INCENDIARY',
    };
    const radius = incendiaryRadius(zone.kind);
    let anyEnemyHit = false;
    let armorBroke = false;
    let killed = 0;
    let totalDamage = 0;
    const targets = [];

    for (const entry of playerTargets) {
      const { target, point: targetPoint } = entry;
      if (!target.actor.alive || !canDamagePvpTarget(source, target, true)) continue;
      if (playerIsInvulnerable(target, now)) continue;
      const distance = targetPoint.distanceTo(zone.position);
      if (distance > radius) continue;
      if (target.id !== zone.ownerId && incendiaryOccluded(
        zone.position,
        targetPoint,
        (origin, direction, maxDistance) =>
          rayWorld(room.level, origin, direction, maxDistance)
      )) continue;
      const damage = incendiaryDamage(distance, zone.kind);
      if (damage <= 0.01) continue;
      const beforeHealth = target.actor.health;
      const beforeArmor = target.actor.armor;
      const died = target.actor.takeDamage(damage, zone.position, owner || null);
      recordDamageContribution(target, owner, damage, now);
      const broke = beforeArmor > 0 && target.actor.armor <= 0;
      if (died) registerDeath(room, target, owner || null, zone.kind, false);
      send(target.ws, {
        type: 'damage',
        amount: round2(damage),
        armorBroke: broke,
        from: vec3(zone.position),
        attackerId: zone.ownerId,
        weapon: zone.kind,
      });
      if (target.id === zone.ownerId) continue;
      anyEnemyHit = true;
      armorBroke ||= broke;
      killed += died ? 1 : 0;
      totalDamage += damage;
      targets.push({
        id: target.id,
        team: target.team,
        beforeHealth: round2(beforeHealth),
        beforeArmor: round2(beforeArmor),
        health: round2(target.actor.health),
        maxHealth: target.actor.maxHealth,
        armor: round2(target.actor.armor),
        maxArmor: target.actor.maxArmor,
        alive: target.actor.alive,
        p: vec3(target.actor.position),
        crouch: target.actor.crouching,
      });
    }

    for (const entry of sentryTargets) {
      const { sentry, point: targetPoint } = entry;
      if (!room.sentries.has(sentry.id)) continue;
      if (!canDamagePvpTarget(source, sentry)) continue;
      const distance = targetPoint.distanceTo(zone.position);
      if (distance > radius) continue;
      if (incendiaryOccluded(
        zone.position,
        targetPoint,
        (origin, direction, maxDistance) =>
          rayWorld(room.level, origin, direction, maxDistance)
      )) continue;
      sentry.health -= incendiaryDamage(distance, zone.kind);
      if (sentry.health > 0) continue;
      room.sentries.delete(sentry.id);
      broadcast(room, { type: 'sentry_destroyed', id: sentry.id });
    }

    if (owner && anyEnemyHit) {
      send(owner.ws, {
        type: 'feedback',
        headshot: false,
        armorBroke,
        killed,
        damage: round2(totalDamage),
        targets,
      });
    }
  }
}

/** Radius damage shared by every warhead that lands. */
function applyStrikeBlast(room, owner, at, now) {
  for (const target of room.players.values()) {
    if (!target.actor.alive) continue;
    if (!canDamagePvpTarget(owner, target, true)) continue;
    if (playerIsInvulnerable(target, now)) continue;
    const distance = Math.hypot(
      target.actor.position.x - at.x,
      target.actor.position.y + 1 - at.y,
      target.actor.position.z - at.z
    );
    if (distance > STRIKE_RADIUS) continue;
    const u = 1 - distance / STRIKE_RADIUS;
    const damage = loadoutExplosiveDamage(
      target.loadout,
      20 + 300 * u * u
    );
    const beforeArmor = target.actor.armor;
    const killed = target.actor.takeDamage(damage, at, owner);
    recordDamageContribution(target, owner, damage, now);
    if (killed) registerDeath(room, target, owner, 'strike', false);
    send(target.ws, {
      type: 'damage',
      amount: round2(damage),
      armorBroke: beforeArmor > 0 && target.actor.armor <= 0,
      from: vec3(at),
      attackerId: owner.id,
      weapon: 'strike',
    });
  }
  for (const sentry of [...room.sentries.values()]) {
    if (!canDamagePvpTarget(owner, sentry)) continue;
    const distance = sentry.position.distanceTo(at);
    if (distance > STRIKE_RADIUS) continue;
    const u = 1 - distance / STRIKE_RADIUS;
    sentry.health -= 20 + 300 * u * u;
    if (sentry.health <= 0) {
      room.sentries.delete(sentry.id);
      broadcast(room, { type: 'sentry_destroyed', id: sentry.id });
    }
  }
}

/**
 * Integrate every live TV missile one authoritative tick. The client only ever
 * asks for a heading; this decides where the warhead really is and where it
 * lands, so a modified client cannot pick its own impact point.
 */
function processMissiles(room, now) {
  for (const [id, missile] of [...room.missiles]) {
    // An operator who stops sending input (alt-tab, lag, disconnect) must not
    // freeze a missile in the sky. It keeps its last heading and flies on.
    const controlStale = now - missile.lastControlAt > 1800;
    if (controlStale) {
      missile.wantPitch = Math.min(missile.wantPitch, -0.5);
      steerTvMissile(missile, missile.wantYaw, missile.wantPitch, TICK_DT);
    } else if (missile.steerPending) {
      // One fresh requested heading gets one authoritative steering step.
      // Repeated packets with the same angles cannot keep turning the missile.
      steerTvMissile(missile, missile.wantYaw, missile.wantPitch, TICK_DT);
    }
    missile.steerPending = false;
    const result = advanceTvMissile(missile, TICK_DT, null, 0, room.level.bounds);
    if (result === 'flying') continue;

    room.missiles.delete(id);
    const owner = room.players.get(missile.ownerId);
    if (owner) owner.missileId = null;
    const at = new THREE.Vector3(missile.position.x, missile.position.y, missile.position.z);
    broadcast(room, {
      type: 'strike_impact',
      id,
      ownerId: missile.ownerId,
      x: round2(at.x),
      z: round2(at.z),
    });
    if (!owner) continue;
    applyStrikeBlast(room, owner, at, now);
  }
}

function casGroundPoint(room, x, z) {
  const origin = new THREE.Vector3(x, 90, z);
  const down = new THREE.Vector3(0, -1, 0);
  const hit = rayWorld(room.level, origin, down, 130);
  return new THREE.Vector3(x, hit?.point?.y ?? 0, z);
}

function casImpactOccluded(room, at, targetPoint) {
  const origin = at.clone().add(new THREE.Vector3(0, 0.18, 0));
  const direction = targetPoint.clone().sub(origin);
  const distance = direction.length();
  if (distance <= 0.2) return false;
  direction.multiplyScalar(1 / distance);
  const world = rayWorld(room.level, origin, direction, distance);
  return Boolean(world && world.distance < distance - 0.2);
}

/** One server-owned GAU-8 shell: tight radial damage with real cover blocking. */
function applyCasImpact(room, run, at, now) {
  const owner = room.players.get(run.ownerId);
  if (!owner) return;
  let armorBroke = false;
  let killed = 0;
  let totalDamage = 0;
  const targets = [];

  for (const target of room.players.values()) {
    if (!target.actor.alive || !canDamagePvpTarget(owner, target, true)) continue;
    if (playerIsInvulnerable(target, now)) continue;
    const targetPoint = target.actor.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const distance = targetPoint.distanceTo(at);
    const damage = loadoutExplosiveDamage(
      target.loadout,
      casDamage(distance)
    );
    if (damage <= 0 || casImpactOccluded(room, at, targetPoint)) continue;
    const beforeHealth = target.actor.health;
    const beforeArmor = target.actor.armor;
    const died = target.actor.takeDamage(damage, at, owner);
    recordDamageContribution(target, owner, damage, now);
    const broke = beforeArmor > 0 && target.actor.armor <= 0;
    if (died) registerDeath(room, target, owner, 'cas', false);
    if (died && target.team !== run.team) run.enemyKills++;
    send(target.ws, {
      type: 'damage',
      amount: round2(damage),
      armorBroke: broke,
      from: vec3(at),
      attackerId: owner.id,
      weapon: 'cas',
    });
    if (target.id === owner.id) continue;
    armorBroke ||= broke;
    killed += died ? 1 : 0;
    totalDamage += damage;
    targets.push({
      id: target.id,
      team: target.team,
      beforeHealth: round2(beforeHealth),
      beforeArmor: round2(beforeArmor),
      health: round2(target.actor.health),
      maxHealth: target.actor.maxHealth,
      armor: round2(target.actor.armor),
      maxArmor: target.actor.maxArmor,
      alive: target.actor.alive,
      p: vec3(target.actor.position),
      crouch: target.actor.crouching,
    });
  }

  for (const sentry of [...room.sentries.values()]) {
    if (!canDamagePvpTarget(owner, sentry)) continue;
    const targetPoint = sentry.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const distance = targetPoint.distanceTo(at);
    const damage = casDamage(distance);
    if (damage <= 0 || casImpactOccluded(room, at, targetPoint)) continue;
    sentry.health -= damage;
    if (sentry.health <= 0) {
      room.sentries.delete(sentry.id);
      broadcast(room, { type: 'sentry_destroyed', id: sentry.id });
    }
  }

  if (targets.length) {
    send(owner.ws, {
      type: 'feedback',
      headshot: false,
      armorBroke,
      killed,
      damage: round2(totalDamage),
      reward: 'cas',
      targets,
    });
  }
}

function processCasRuns(room, now) {
  for (const [id, run] of [...room.casRuns]) {
    const age = (now - run.startedAt) / 1000;
    while (run.nextRound < CAS_ROUNDS && age >= casRoundTime(run.nextRound)) {
      const point = casImpactPoint(run, run.nextRound);
      run.nextRound++;
      if (!point) continue;
      applyCasImpact(room, run, casGroundPoint(room, point.x, point.z), now);
    }
    if (run.nextRound >= CAS_ROUNDS && !run.outcomeVoiceQueued) {
      run.outcomeVoiceQueued = true;
      scheduleStreakVoice(room, {
        cue: casOutcomeVoiceCue(run.enemyKills),
        dueAt: now + 200,
        ownerId: run.ownerId,
      });
    }
    if (age > CAS_FLIGHT_SECONDS + 0.2) room.casRuns.delete(id);
  }
}

function applyFirebombImpact(room, run, at, now) {
  const owner = room.players.get(run.ownerId);
  const source = owner || {
    id: run.ownerId,
    team: run.team,
    name: 'B-2',
  };
  let armorBroke = false;
  let killed = 0;
  let totalDamage = 0;
  const targets = [];

  for (const target of room.players.values()) {
    if (!target.actor.alive || !canDamagePvpTarget(source, target, true)) continue;
    if (playerIsInvulnerable(target, now)) continue;
    const targetPoint = target.actor.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const distance = targetPoint.distanceTo(at);
    const occluded = target.id !== run.ownerId && firebombBlastOccluded(
      at,
      targetPoint,
      (origin, direction, maxDistance) =>
        rayWorld(room.level, origin, direction, maxDistance)
    );
    const damage = loadoutExplosiveDamage(
      target.loadout,
      firebombDamage(distance, occluded)
    );
    if (damage <= 0.01) continue;
    const beforeHealth = target.actor.health;
    const beforeArmor = target.actor.armor;
    const died = target.actor.takeDamage(damage, at, owner || null);
    recordDamageContribution(target, owner, damage, now);
    const broke = beforeArmor > 0 && target.actor.armor <= 0;
    if (died) registerDeath(room, target, owner || null, 'firebomb', false);
    send(target.ws, {
      type: 'damage',
      amount: round2(damage),
      armorBroke: broke,
      from: vec3(at),
      attackerId: run.ownerId,
      weapon: 'firebomb',
    });
    if (target.id === run.ownerId) continue;
    armorBroke ||= broke;
    killed += died ? 1 : 0;
    totalDamage += damage;
    targets.push({
      id: target.id,
      team: target.team,
      beforeHealth: round2(beforeHealth),
      beforeArmor: round2(beforeArmor),
      health: round2(target.actor.health),
      maxHealth: target.actor.maxHealth,
      armor: round2(target.actor.armor),
      maxArmor: target.actor.maxArmor,
      alive: target.actor.alive,
      p: vec3(target.actor.position),
      crouch: target.actor.crouching,
    });
  }

  for (const sentry of [...room.sentries.values()]) {
    if (!canDamagePvpTarget(source, sentry)) continue;
    const targetPoint = sentry.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const distance = targetPoint.distanceTo(at);
    const occluded = firebombBlastOccluded(
      at,
      targetPoint,
      (origin, direction, maxDistance) =>
        rayWorld(room.level, origin, direction, maxDistance)
    );
    sentry.health -= firebombDamage(distance, occluded);
    if (sentry.health > 0) continue;
    room.sentries.delete(sentry.id);
    broadcast(room, { type: 'sentry_destroyed', id: sentry.id });
  }

  if (owner && targets.length) {
    send(owner.ws, {
      type: 'feedback',
      headshot: false,
      armorBroke,
      killed,
      damage: round2(totalDamage),
      reward: 'firebomb',
      targets,
    });
  }
}

function createFirebombZone(room, run, index, at, now) {
  const id = `${run.id}-${index}`;
  const duration = incendiaryDuration(AIRSTRIKE_INCENDIARY_KIND);
  const zone = {
    id,
    ownerId: run.ownerId,
    team: run.team,
    kind: AIRSTRIKE_INCENDIARY_KIND,
    position: at,
    expiresAt: now + duration * 1000,
    nextDamageAt: now,
    nextBroadcastAt: now + 1000,
  };
  room.incendiaries.set(id, zone);
  broadcast(room, {
    type: 'firebomb_impact',
    runId: run.id,
    index,
    zoneId: id,
    ownerId: run.ownerId,
    team: run.team,
    p: vec3(at),
    explodedAt: now,
    expiresAt: zone.expiresAt,
  });
  return zone;
}

function processFirebombRuns(room, now) {
  for (const [id, run] of [...room.firebombRuns]) {
    const age = (now - run.startedAt) / 1000;
    while (run.nextImpact < FIREBOMB_BOMB_COUNT
      && age >= firebombImpactTime(run, run.nextImpact)) {
      const index = run.nextImpact++;
      const point = firebombImpactPoint(run, index);
      if (!point) continue;
      const at = incendiaryGroundPoint(room, casGroundPoint(room, point.x, point.z));
      applyFirebombImpact(room, run, at, now);
      createFirebombZone(room, run, index, at, now);
    }
    if (age > firebombRunLifetimeSeconds(run)) room.firebombRuns.delete(id);
  }
}

function attackHelicopterTargetPoint(player) {
  return player.actor.position.clone().add(new THREE.Vector3(0, 1.0, 0));
}

function attackHelicopterHasLineOfSight(room, origin, targetPoint) {
  const direction = targetPoint.clone().sub(origin);
  const distance = direction.length();
  if (distance <= 0.1) return true;
  direction.multiplyScalar(1 / distance);
  const world = rayWorld(room.level, origin, direction, distance);
  return !world || world.distance >= distance - 0.2;
}

function attackHelicopterCanTarget(room, heli, target, age, now) {
  if (!target?.actor?.alive || target.team === heli.team) return false;
  if (playerIsInvulnerable(target, now)) return false;
  if (loadoutHasPassive(target.loadout, PASSIVE_IDS.ELECTRONIC_STEALTH)) {
    return false;
  }
  const targetPoint = attackHelicopterTargetPoint(target);
  if (!attackHelicopterTargetEligible(heli.call, targetPoint)) return false;
  const pose = attackHelicopterPose(heli, age);
  if (!pose.visible || !pose.onStation || !pose.position) return false;
  const origin = new THREE.Vector3(
    pose.position.x,
    pose.position.y,
    pose.position.z
  );
  return attackHelicopterHasLineOfSight(room, origin, targetPoint);
}

function chooseAttackHelicopterTarget(room, heli, age, now) {
  let best = null;
  let bestDistance = Infinity;
  const pose = attackHelicopterPose(heli, age);
  if (!pose.position) return null;
  for (const target of room.players.values()) {
    if (!attackHelicopterCanTarget(room, heli, target, age, now)) continue;
    const distance = target.actor.position.distanceToSquared(pose.position);
    if (distance >= bestDistance) continue;
    best = target;
    bestDistance = distance;
  }
  return best;
}

function fireAttackHelicopterRound(room, heli, target, age, now) {
  const targetPoint = attackHelicopterTargetPoint(target);
  const pose = attackHelicopterPose(heli, age);
  if (!pose.position) return false;
  const origin = new THREE.Vector3(
    pose.position.x,
    pose.position.y,
    pose.position.z
  );
  if (!attackHelicopterHasLineOfSight(room, origin, targetPoint)) return false;

  const owner = room.players.get(heli.ownerId);
  const beforeHealth = target.actor.health;
  const beforeArmor = target.actor.armor;
  const died = target.actor.takeDamage(
    ATTACK_HELICOPTER_DAMAGE,
    origin,
    owner || null
  );
  recordDamageContribution(target, owner, ATTACK_HELICOPTER_DAMAGE, now);
  const broke = beforeArmor > 0 && target.actor.armor <= 0;
  if (died) {
    registerDeath(
      room,
      target,
      owner || null,
      'attack_helicopter',
      false
    );
  }
  send(target.ws, {
    type: 'damage',
    amount: ATTACK_HELICOPTER_DAMAGE,
    armorBroke: broke,
    from: vec3(origin),
    attackerId: heli.ownerId,
    weapon: 'attack_helicopter',
  });
  broadcast(room, {
    type: 'attack_helicopter_fire',
    id: heli.id,
    ownerId: heli.ownerId,
    targetId: target.id,
    origin: vec3(origin),
    target: vec3(targetPoint),
    hit: true,
  });
  if (owner) {
    send(owner.ws, {
      type: 'feedback',
      headshot: false,
      armorBroke: broke,
      killed: died ? 1 : 0,
      damage: ATTACK_HELICOPTER_DAMAGE,
      reward: 'attack_helicopter',
      targets: [{
        id: target.id,
        team: target.team,
        beforeHealth: round2(beforeHealth),
        beforeArmor: round2(beforeArmor),
        health: round2(target.actor.health),
        maxHealth: target.actor.maxHealth,
        armor: round2(target.actor.armor),
        maxArmor: target.actor.maxArmor,
        alive: target.actor.alive,
        p: vec3(target.actor.position),
        crouch: target.actor.crouching,
      }],
    });
  }
  return true;
}

function processAttackHelicopters(room, now) {
  for (const [id, heli] of [...room.attackHelicopters]) {
    const age = (now - heli.startedAt) / 1000;
    const departureStarted = age >= ATTACK_HELICOPTER_APPROACH_SECONDS
      + ATTACK_HELICOPTER_ON_STATION_SECONDS;
    if (departureStarted && !heli.outboundVoiceQueued
      && heli.alive && heli.health > 0) {
      heli.outboundVoiceQueued = true;
      scheduleStreakVoice(room, {
        cue: 'attack_helicopter_outbound',
        dueAt: now,
        ownerId: heli.ownerId,
      });
    }
    const timedOut = age >= ATTACK_HELICOPTER_LIFETIME_SECONDS;
    if (!heli.alive || heli.health <= 0
      || timedOut) {
      room.attackHelicopters.delete(id);
      continue;
    }
    const pose = attackHelicopterPose(heli, age);
    if (!pose.position) continue;
    heli.position.set(pose.position.x, pose.position.y, pose.position.z);
    if (!attackHelicopterOnStation(age)) {
      if (age >= ATTACK_HELICOPTER_APPROACH_SECONDS
        + ATTACK_HELICOPTER_ON_STATION_SECONDS) {
        heli.targetId = null;
      }
      const flightTarget = {
        x: pose.position.x + pose.direction.x,
        y: pose.position.y + pose.direction.y,
        z: pose.position.z + pose.direction.z,
      };
      const flightYaw = attackHelicopterYaw(
        heli.position,
        flightTarget,
        heli.aimYaw
      );
      const poseDt = Math.max(
        0,
        Math.min(0.1, (now - heli.lastPoseAt) / 1000)
      );
      heli.aimYaw = turnAttackHelicopterYaw(
        heli.aimYaw,
        flightYaw,
        poseDt
      );
      heli.yaw = heli.aimYaw;
      heli.lastPoseAt = now;
      continue;
    }

    let target = heli.targetId ? room.players.get(heli.targetId) : null;
    if (target && !attackHelicopterCanTarget(room, heli, target, age, now)) {
      target = null;
      heli.targetId = null;
      heli.roundsInBurst = 0;
      heli.nextBurstAt = now;
    }
    if (!target && now >= heli.nextBurstAt) {
      target = chooseAttackHelicopterTarget(room, heli, age, now);
      if (target) {
        heli.targetId = target.id;
        heli.roundsInBurst = 0;
        const targetYaw = attackHelicopterYaw(
          heli.position,
          attackHelicopterTargetPoint(target),
          heli.aimYaw
        );
        heli.nextShotAt = now
          + attackHelicopterLockDelay(heli.aimYaw, targetYaw) * 1000;
      }
    }

    const flightTarget = {
      x: pose.position.x + pose.direction.x,
      y: pose.position.y + pose.direction.y,
      z: pose.position.z + pose.direction.z,
    };
    const desiredYaw = target
      ? attackHelicopterYaw(
        heli.position,
        attackHelicopterTargetPoint(target),
        heli.aimYaw
      )
      : attackHelicopterYaw(heli.position, flightTarget, heli.aimYaw);
    const poseDt = Math.max(0, Math.min(0.1, (now - heli.lastPoseAt) / 1000));
    heli.aimYaw = turnAttackHelicopterYaw(heli.aimYaw, desiredYaw, poseDt);
    heli.yaw = heli.aimYaw;
    heli.lastPoseAt = now;

    if (!target || now < heli.nextShotAt) continue;
    if (Math.abs(angleDelta(heli.aimYaw, desiredYaw))
      > ATTACK_HELICOPTER_FIRE_ALIGNMENT) {
      heli.nextShotAt = now + 40;
      continue;
    }
    if (!fireAttackHelicopterRound(room, heli, target, age, now)) {
      heli.targetId = null;
      heli.roundsInBurst = 0;
      heli.nextBurstAt = now;
      continue;
    }

    heli.roundsInBurst++;
    if (heli.roundsInBurst >= ATTACK_HELICOPTER_BURST_ROUNDS
      || !target.actor.alive) {
      if (!target.actor.alive) heli.targetId = null;
      heli.roundsInBurst = 0;
      heli.nextBurstAt = now
        + ATTACK_HELICOPTER_BURST_COOLDOWN_SECONDS * 1000;
      heli.nextShotAt = heli.nextBurstAt;
    } else {
      heli.nextShotAt = now
        + ATTACK_HELICOPTER_SHOT_INTERVAL_SECONDS * 1000;
    }
  }
}

function handleMessage(ws, raw, isBinary) {
  const now = Date.now();
  if (now - ws.rateWindowAt >= 1000) {
    ws.rateWindowAt = now;
    ws.rateCount = 0;
  }
  ws.rateCount++;
  if (ws.rateCount > 160) {
    ws.close(1008, 'RATE LIMIT');
    return;
  }

  let message;
  if (isBinary) {
    try {
      message = decodeInputPacket(raw);
    } catch {
      ws.close(1003, 'INVALID BINARY PACKET');
      return;
    }
  } else {
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
  }
  if (!message || typeof message !== 'object') return;
  if (message.type === 'rooms') {
    send(ws, { type: 'rooms', rooms: roomList() });
    return;
  }
  if (message.type === 'join') {
    joinRoom(ws, message);
    return;
  }
  if (message.type === 'leave') {
    leaveRoom(ws);
    send(ws, { type: 'left' });
    return;
  }
  if (message.type === 'ping') {
    send(ws, { type: 'pong', at: message.at, serverTime: now });
    return;
  }
  const player = ws.pvpPlayer;
  if (!player) return;
  if (message.type === 'input') handleInput(player, message);
  else if (message.type === 'deploy') handleDeploy(player, message);
  else if (message.type === 'respawn_loadout') handleRespawnLoadout(player);
  else if (message.type === 'ability') handleAbility(player, message);
  else if (message.type === 'chat') handleChat(player, message.text, now);
  else if (message.type === 'map_vote') castMapVote(player, message.mapId, now);
  else if (message.type === 'vote_kick_start') startVoteKick(player, message.targetId, now);
  else if (message.type === 'vote_kick_vote') castVoteKick(player, message.vote, now);
}

export function attachPvpServer(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/pvp',
    maxPayload: PVP_MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
    clientTracking: true,
  });

  wss.on('connection', (ws, request) => {
    const authUser = authUserFromRequest(request);
    if (!authUser) {
      ws.on('error', () => {});
      send(ws, {
        type: 'auth_required',
        message: 'LINUXDO LOGIN REQUIRED',
      });
      const closeTimer = setTimeout(() => ws.close(4001, 'LOGIN REQUIRED'), 20);
      closeTimer.unref?.();
      return;
    }
    sockets.add(ws);
    ws.authUser = authUser;
    ws.isAlive = true;
    ws.rateWindowAt = Date.now();
    ws.rateCount = 0;
    ws.pvpPlayer = null;
    ws.pvpRosterVersion = null;
    ws.clientIp = clientIpFromRequest(request);
    send(ws, {
      type: 'hello',
      protocol: PVP_PROTOCOL,
      tickRate: PVP_TICK_RATE,
      rooms: roomList(),
    });
    ws.on('message', (raw, isBinary) => handleMessage(ws, raw, isBinary));
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => {
      leaveRoom(ws);
      sockets.delete(ws);
    });
    ws.on('error', () => {});
  });

  if (!tickTimer) {
    tickLastAt = performance.now();
    tickAccumulator = 0;
    tickTimer = setInterval(() => {
      const clock = performance.now();
      const elapsed = Math.min(
        Math.max(0, clock - tickLastAt),
        PVP_TICK_MS * MAX_TICK_CATCHUP
      );
      tickLastAt = clock;
      tickAccumulator += elapsed;

      let catchup = 0;
      while (tickAccumulator + 0.001 >= PVP_TICK_MS && catchup < MAX_TICK_CATCHUP) {
        const now = Date.now();
        for (const room of rooms) {
          if (room.players.size) tickRoom(room, now);
        }
        tickAccumulator -= PVP_TICK_MS;
        catchup++;
      }
      // If a genuinely overloaded process falls farther than the bounded
      // catch-up window, discard whole overdue ticks rather than spiralling.
      if (catchup === MAX_TICK_CATCHUP && tickAccumulator >= PVP_TICK_MS) {
        tickAccumulator %= PVP_TICK_MS;
      }
    }, TICK_PUMP_MS);
    tickTimer.unref?.();
  }
  if (!roomListTimer) {
    roomListTimer = setInterval(broadcastRooms, 2000);
    roomListTimer.unref?.();
  }
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      pruneVoteKickState(Date.now());
      for (const ws of wss.clients) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);
    heartbeatTimer.unref?.();
  }
  wss.on('close', () => {
    clearInterval(tickTimer);
    clearInterval(roomListTimer);
    clearInterval(heartbeatTimer);
    tickTimer = null;
    tickLastAt = 0;
    tickAccumulator = 0;
    roomListTimer = null;
    heartbeatTimer = null;
  });
  return wss;
}

export function getPvpStatus() {
  return {
    tickRate: PVP_TICK_RATE,
    roomCount: rooms.length,
    capacityPerRoom: PVP_ROOM_CAPACITY,
    rooms: roomList(),
  };
}

function finiteClamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function wrapAngle(value) {
  return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function vec3(v) {
  return [round3(v.x), round3(v.y), round3(v.z)];
}

function grenadeVec3(v) {
  return [v.x, v.y, v.z];
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}
