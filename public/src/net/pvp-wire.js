import { WEAPON_ORDER } from '../game/weapons.js';
import { PASSIVE_TUNING } from '../game/loadout.js';
import { JUGGERNAUT_MAX_ARMOR, JUGGERNAUT_MAX_HEALTH } from '../game/juggernaut.js';
import { uavDroneId, UAV_DRONE_HEALTH } from '../game/uav.js';
import { ATTACK_HELICOPTER_HEALTH } from '../game/attack-helicopter.js';
import { PVP_PROTOCOL, PVP_ROOM_CAPACITY } from './protocol.js';
import { customConfig } from '../fx/custom.js'

const MAGIC = 0x50;
const INPUT_PACKET = 1;
const SNAPSHOT_PACKET = 2;
const SNAPSHOT_HAS_ROSTER = 1;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const INPUT_JUMP = 1 << 0;
const INPUT_CROUCH = 1 << 1;
const INPUT_SLIDE = 1 << 2;
const INPUT_SPRINT = 1 << 3;
const INPUT_AIM = 1 << 4;
const INPUT_TRIGGER = 1 << 5;
const INPUT_RELOAD = 1 << 6;
const INPUT_GRENADE = 1 << 7;

const PLAYER_ALIVE = 1 << 0;
const PLAYER_CROUCH = 1 << 1;
const PLAYER_SPRINT = 1 << 2;
const PLAYER_SLIDE = 1 << 3;
const PLAYER_GROUNDED = 1 << 4;
const PLAYER_AIMING = 1 << 5;
const PLAYER_INVULNERABLE = 1 << 6;
const PLAYER_JUGGERNAUT = 1 << 7;
const PLAYER_ORINGLEHP = customConfig.hp;

const INPUT_MODE_MISSILE = 1 << 0;
const INPUT_MODE_INTERACT = 1 << 1;
// One-shot grenade actions live in the otherwise spare mode byte. They are
// queued by the authority when the packet arrives, so a following neutral
// input cannot erase a quick click before the next 45 Hz simulation tick.
const INPUT_MODE_GRENADE_PIN = 1 << 2;
const INPUT_MODE_GRENADE_THROW = 1 << 3;
const INPUT_MODE_MELEE_ATTACK = 1 << 4;
const INPUT_MODE_GRENADE_AIM = 1 << 5;
const YOU_READY_FOR_ACTION = 1 << 1;

const PLAYER_WEAPON_MASK = 0x0f;
const PLAYER_THROWABLE_SHIFT = 4;
const PLAYER_THROWABLE_MASK = 0x70;
const PLAYER_CERAMIC = 0x80;

/**
 * Bits 4..6 of the existing player weapon byte carry the active throwable:
 * 0 none, then carry/aim pairs for frag, incendiary and Molotov. The one-shot
 * release animation is driven by the reliable grenade_throw event.
 */
export function throwablePresentationCode(kind, state) {
  if (state !== 'carry' && state !== 'aim') return 0;
  const base = kind === 'incendiary' ? 3 : kind === 'molotov' ? 5 : 1;
  return base + (state === 'aim' ? 1 : 0);
}

export function decodeThrowablePresentation(code) {
  const value = unsigned(code, 7);
  if (value < 1 || value > 6) {
    return { throwableKind: 'frag', throwableState: 'none' };
  }
  const throwableKind = value >= 5
    ? 'molotov'
    : value >= 3
      ? 'incendiary'
      : 'frag';
  return {
    throwableKind,
    throwableState: value % 2 === 0 ? 'aim' : 'carry',
  };
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value)));
}

function unsigned(value, max) {
  return Math.round(clamp(value, 0, max));
}

function signed(value, min, max) {
  return Math.round(clamp(value, min, max));
}

function teamCode(team) {
  return team === 'red' ? 1 : 0;
}

function decodeTeam(code) {
  return (code & 1) === 1 ? 'red' : 'blue';
}

function winnerCode(team) {
  return team === 'blue' ? 1 : team === 'red' ? 2 : 0;
}

function decodeWinner(code) {
  return code === 1 ? 'blue' : code === 2 ? 'red' : null;
}

function weaponCode(id) {
  const index = WEAPON_ORDER.indexOf(id);
  return index < 0 ? 0 : index;
}

function decodeWeapon(index) {
  return WEAPON_ORDER[index] || WEAPON_ORDER[0];
}

class Writer {
  constructor(capacity = 1024) {
    this.bytes = new Uint8Array(capacity);
    this.view = new DataView(this.bytes.buffer);
    this.offset = 0;
  }

  ensure(size) {
    if (this.offset + size <= this.bytes.length) return;
    let capacity = this.bytes.length;
    while (capacity < this.offset + size) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.bytes);
    this.bytes = next;
    this.view = new DataView(next.buffer);
  }

  u8(value) {
    this.ensure(1);
    this.view.setUint8(this.offset, unsigned(value, 0xff));
    this.offset += 1;
  }

  i8(value) {
    this.ensure(1);
    this.view.setInt8(this.offset, signed(value, -0x80, 0x7f));
    this.offset += 1;
  }

  u16(value) {
    this.ensure(2);
    this.view.setUint16(this.offset, unsigned(value, 0xffff), true);
    this.offset += 2;
  }

  u32(value) {
    this.ensure(4);
    this.view.setUint32(this.offset, unsigned(value, 0xffffffff), true);
    this.offset += 4;
  }

  i32(value) {
    this.ensure(4);
    this.view.setInt32(this.offset, signed(value, -0x80000000, 0x7fffffff), true);
    this.offset += 4;
  }

  f32(value) {
    this.ensure(4);
    this.view.setFloat32(this.offset, finite(value), true);
    this.offset += 4;
  }

  f64(value) {
    this.ensure(8);
    this.view.setFloat64(this.offset, finite(value), true);
    this.offset += 8;
  }

  string(value) {
    const encoded = textEncoder.encode(String(value || ''));
    const length = Math.min(0xff, encoded.length);
    this.u8(length);
    this.ensure(length);
    this.bytes.set(encoded.subarray(0, length), this.offset);
    this.offset += length;
  }

  finish() {
    return this.bytes.slice(0, this.offset);
  }
}

class Reader {
  constructor(data) {
    if (data instanceof ArrayBuffer) {
      this.bytes = new Uint8Array(data);
    } else if (ArrayBuffer.isView(data)) {
      this.bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
      throw new TypeError('binary PVP packet required');
    }
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.offset = 0;
  }

  take(size) {
    if (this.offset + size > this.bytes.byteLength) throw new RangeError('truncated PVP packet');
    const at = this.offset;
    this.offset += size;
    return at;
  }

  u8() { return this.view.getUint8(this.take(1)); }
  i8() { return this.view.getInt8(this.take(1)); }
  u16() { return this.view.getUint16(this.take(2), true); }
  u32() { return this.view.getUint32(this.take(4), true); }
  i32() { return this.view.getInt32(this.take(4), true); }
  f32() { return this.view.getFloat32(this.take(4), true); }
  f64() { return this.view.getFloat64(this.take(8), true); }

  string() {
    const length = this.u8();
    const at = this.take(length);
    return textDecoder.decode(this.bytes.subarray(at, at + length));
  }

  done() {
    return this.offset === this.bytes.byteLength;
  }
}

function packetHeader(reader, kind) {
  if (reader.u8() !== MAGIC || reader.u8() !== kind) {
    throw new TypeError('unknown PVP binary packet');
  }
  if (reader.u8() !== PVP_PROTOCOL) {
    throw new TypeError('PVP binary protocol mismatch');
  }
}

export function encodeInputPacket(input) {
  const writer = new Writer(21);
  let flags = 0;
  if (input.jump) flags |= INPUT_JUMP;
  if (input.crouch) flags |= INPUT_CROUCH;
  if (input.slide) flags |= INPUT_SLIDE;
  if (input.sprint) flags |= INPUT_SPRINT;
  if (input.aim) flags |= INPUT_AIM;
  // During missile control the existing trigger bit carries the one-shot
  // terminal-boost request. This keeps the packet at 20 bytes.
  if (input.trigger || input.missileBoost) flags |= INPUT_TRIGGER;
  if (input.reload) flags |= INPUT_RELOAD;
  if (input.grenade) flags |= INPUT_GRENADE;
  writer.u8(MAGIC);
  writer.u8(INPUT_PACKET);
  writer.u8(PVP_PROTOCOL);
  writer.u32(input.seq);
  writer.i8(clamp(input.moveX, -1, 1) * 127);
  writer.i8(clamp(input.moveZ, -1, 1) * 127);
  writer.u8(flags);
  writer.u8(weaponCode(input.weapon));
  // While a TV missile is in the air the same yaw/pitch steer it instead of
  // the body. One byte of mode is far cheaper than a second pair of axes, and
  // it makes steering the missile and the player mutually exclusive by
  // construction rather than by convention.
  writer.u8(
    (input.missileControl ? INPUT_MODE_MISSILE : 0)
      | (input.interact ? INPUT_MODE_INTERACT : 0)
      | (input.grenadePin ? INPUT_MODE_GRENADE_PIN : 0)
      | (input.grenadeThrow ? INPUT_MODE_GRENADE_THROW : 0)
      | (input.meleeAttack ? INPUT_MODE_MELEE_ATTACK : 0)
      | (input.grenadeAim ? INPUT_MODE_GRENADE_AIM : 0)
  );
  writer.f32(input.yaw);
  writer.f32(input.pitch);
  return writer.finish();
}

export function decodeInputPacket(data) {
  const reader = new Reader(data);
  packetHeader(reader, INPUT_PACKET);
  const seq = reader.u32();
  const moveX = reader.i8() / 127;
  const moveZ = reader.i8() / 127;
  const flags = reader.u8();
  const weapon = decodeWeapon(reader.u8());
  const mode = reader.u8();
  const missileControl = Boolean(mode & INPUT_MODE_MISSILE);
  const interact = Boolean(mode & INPUT_MODE_INTERACT);
  const grenadePin = Boolean(mode & INPUT_MODE_GRENADE_PIN);
  const grenadeThrow = Boolean(mode & INPUT_MODE_GRENADE_THROW);
  const meleeAttack = Boolean(mode & INPUT_MODE_MELEE_ATTACK);
  const grenadeAim = Boolean(mode & INPUT_MODE_GRENADE_AIM);
  const yaw = reader.f32();
  const pitch = reader.f32();
  if (!reader.done()) throw new TypeError('invalid PVP input packet length');
  const trigger = Boolean(flags & INPUT_TRIGGER);
  return {
    type: 'input',
    seq,
    moveX,
    moveZ,
    jump: Boolean(flags & INPUT_JUMP),
    crouch: Boolean(flags & INPUT_CROUCH),
    slide: Boolean(flags & INPUT_SLIDE),
    sprint: Boolean(flags & INPUT_SPRINT),
    aim: Boolean(flags & INPUT_AIM),
    trigger,
    reload: Boolean(flags & INPUT_RELOAD),
    grenade: Boolean(flags & INPUT_GRENADE),
    grenadePin,
    grenadeThrow,
    grenadeAim,
    meleeAttack,
    missileControl,
    missileBoost: missileControl && trigger,
    interact,
    weapon,
    yaw,
    pitch,
  };
}

function writeAmmo(writer, ammo) {
  for (const id of WEAPON_ORDER) {
    writer.u16(ammo?.[id]?.mag);
    writer.u16(ammo?.[id]?.reserve);
  }
}

function readAmmo(reader) {
  const ammo = {};
  for (const id of WEAPON_ORDER) {
    ammo[id] = { mag: reader.u16(), reserve: reader.u16() };
  }
  return ammo;
}

function writePlayer(writer, state, rosterIndex, serverTime) {
  let flags = 0;
  if (state.alive) flags |= PLAYER_ALIVE;
  if (state.crouch) flags |= PLAYER_CROUCH;
  if (state.sprinting) flags |= PLAYER_SPRINT;
  if (state.sliding) flags |= PLAYER_SLIDE;
  if (state.grounded) flags |= PLAYER_GROUNDED;
  if (state.aiming) flags |= PLAYER_AIMING;
  if (state.invulnerable) flags |= PLAYER_INVULNERABLE;
  if (state.juggernaut) flags |= PLAYER_JUGGERNAUT;
  writer.u8(rosterIndex);
  for (const value of state.p || [0, 0, 0]) writer.f32(value);
  for (const value of state.v || [0, 0, 0]) writer.f32(value);
  writer.f32(state.yaw);
  writer.f32(state.pitch);
  writer.u16(clamp(state.health, 0, 655.35) * 100);
  writer.u16(clamp(state.armor, 0, 655.35) * 100);
  writer.u8(flags);
  const baseArmor = state.juggernaut ? JUGGERNAUT_MAX_ARMOR : 50;
  const ceramic = finite(state.maxArmor, baseArmor) >= baseArmor
    + PASSIVE_TUNING.ceramicArmorBonus - 0.01;
  // Nine weapon ids fit in the low nibble. Bits 4..6 carry the throwable
  // presentation and the high bit retains Ceramic Plates, all at zero
  // steady-state bandwidth cost.
  const weapon = weaponCode(state.weapon);
  if (weapon > PLAYER_WEAPON_MASK) {
    throw new RangeError('PVP compact player weapon code exceeds four bits');
  }
  const throwable = throwablePresentationCode(
    state.throwableKind,
    state.throwableState
  );
  writer.u8(
    weapon
      | (throwable << PLAYER_THROWABLE_SHIFT)
      | (ceramic ? PLAYER_CERAMIC : 0)
  );
  writer.u32(state.firing);
  writer.u16(state.kills);
  writer.u16(state.deaths);
  writer.u32(state.score);
  writer.u16(state.alive ? 0 : clamp(finite(state.respawnAt) - serverTime, 0, 0xffff));
}

function readPlayer(reader, roster, serverTime) {
  const meta = roster[reader.u8()];
  if (!meta) throw new TypeError('PVP snapshot references an unknown roster entry');
  const p = [reader.f32(), reader.f32(), reader.f32()];
  const v = [reader.f32(), reader.f32(), reader.f32()];
  const yaw = reader.f32();
  const pitch = reader.f32();
  const health = reader.u16() / 100;
  const armor = reader.u16() / 100;
  const flags = reader.u8();
  const weaponAndPassive = reader.u8();
  const weapon = decodeWeapon(weaponAndPassive & PLAYER_WEAPON_MASK);
  const throwable = decodeThrowablePresentation(
    (weaponAndPassive & PLAYER_THROWABLE_MASK) >> PLAYER_THROWABLE_SHIFT
  );
  const juggernaut = Boolean(flags & PLAYER_JUGGERNAUT);
  const ceramic = Boolean(weaponAndPassive & PLAYER_CERAMIC);
  const maxHealth = juggernaut ? JUGGERNAUT_MAX_HEALTH : 100;
  const maxArmor = (juggernaut ? JUGGERNAUT_MAX_ARMOR : 50)
    + (ceramic ? PASSIVE_TUNING.ceramicArmorBonus : 0);
  const firing = reader.u32();
  const kills = reader.u16();
  const deaths = reader.u16();
  const score = reader.u32();
  const respawnDelay = reader.u16();
  return {
    ...meta,
    p,
    v,
    yaw,
    pitch,
    health,
    maxHealth,
    armor,
    maxArmor,
    alive: Boolean(flags & PLAYER_ALIVE),
    crouch: Boolean(flags & PLAYER_CROUCH),
    sprinting: Boolean(flags & PLAYER_SPRINT),
    sliding: Boolean(flags & PLAYER_SLIDE),
    grounded: Boolean(flags & PLAYER_GROUNDED),
    aiming: Boolean(flags & PLAYER_AIMING),
    invulnerable: Boolean(flags & PLAYER_INVULNERABLE),
    juggernaut,
    weapon,
    ...throwable,
    firing,
    kills,
    deaths,
    score,
    respawnAt: respawnDelay ? serverTime + respawnDelay : 0,
  };
}

export function encodeSnapshotPacket(snapshot, options = {}) {
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const includeRoster = options.includeRoster !== false;
  const rosterVersion = unsigned(options.rosterVersion, 0xffffffff);
  const writer = new Writer(256 + players.length * 64);
  const now = finite(snapshot.serverTime);
  writer.u8(MAGIC);
  writer.u8(SNAPSHOT_PACKET);
  writer.u8(PVP_PROTOCOL);
  writer.u8(includeRoster ? SNAPSHOT_HAS_ROSTER : 0);
  writer.u32(snapshot.tick);
  writer.f64(now);
  writer.u8(snapshot.room?.number);
  writer.u8(snapshot.room?.players);
  writer.u8(snapshot.room?.capacity ?? PVP_ROOM_CAPACITY);
  writer.u16(snapshot.room?.round);
  writer.u32(rosterVersion);
  writer.u16(snapshot.match?.blueTickets);
  writer.u16(snapshot.match?.redTickets);
  writer.u16(snapshot.match?.maxTickets);
  writer.u8(snapshot.match?.over ? 1 : 0);
  writer.u8(winnerCode(snapshot.match?.winner));
  writer.u32(snapshot.ack);

  if (includeRoster) {
    writer.u8(players.length);
    for (const state of players) {
      writer.string(state.id);
      writer.string(state.name);
      writer.u8(teamCode(state.team));
    }
  }

  writer.u8(
    teamCode(snapshot.you?.team)
      | (snapshot.you?.readyActive ? YOU_READY_FOR_ACTION : 0)
  );
  writeAmmo(writer, snapshot.you?.ammo);
  writer.u8(weaponCode(snapshot.you?.weapon));
  if (snapshot.you?.reloading) {
    writer.u8(1);
    writer.u8(weaponCode(snapshot.you.reloading.weapon));
    writer.i32(finite(snapshot.you.reloading.startedAt) - now);
    writer.i32(finite(snapshot.you.reloading.endsAt) - now);
  } else {
    writer.u8(0);
  }
  writer.u16(snapshot.you?.kills);
  writer.u16(snapshot.you?.deaths);
  writer.u32(snapshot.you?.score);
  writer.u16(snapshot.you?.streak);
  writer.u8(snapshot.you?.grenades);
  writer.f32(snapshot.you?.voteKickCooldown);
  const streaks = snapshot.you?.streaks || {};
  writer.u8(streaks.uav);
  writer.u8(streaks.strike);
  writer.u8(streaks.sentry);
  writer.u8(streaks.cas);
  writer.u8(streaks.firebomb);
  writer.u8(streaks.attack_helicopter);
  writer.u8(streaks.juggernaut);
  writer.u8(streaks.railgun);
  writer.f32(streaks.uavTime);
  writer.u32(streaks.uavSweepSeq);
  writer.f32(streaks.uavRevealTime);
  writer.f32(streaks.sentryHp);
  const marks = Array.isArray(snapshot.you?.uavMarks) ? snapshot.you.uavMarks : [];
  writer.u8(marks.length);
  for (const mark of marks) {
    writer.f32(mark?.[0]);
    writer.f32(mark?.[1]);
    writer.f32(mark?.[2]);
  }

  writer.u8(players.length);
  for (let i = 0; i < players.length; i++) writePlayer(writer, players[i], i, now);

  const vote = snapshot.voteKick;
  writer.u8(vote ? 1 : 0);
  if (vote) {
    writer.string(vote.id);
    writer.string(vote.targetId);
    writer.string(vote.targetName);
    writer.string(vote.initiatorName);
    writer.u8(vote.yes);
    writer.u8(vote.no);
    writer.u8(vote.required);
    writer.u32(clamp(finite(vote.endsAt) - now, 0, 0xffffffff));
    writer.u8(vote.yourVote === 'yes' ? 1 : vote.yourVote === 'no' ? 2 : 0);
    writer.u8(vote.canVote ? 1 : 0);
  }

  const sentries = Array.isArray(snapshot.sentries) ? snapshot.sentries : [];
  writer.u8(sentries.length);
  for (const sentry of sentries) {
    writer.string(sentry.id);
    writer.string(sentry.ownerId);
    writer.u8(teamCode(sentry.team));
    for (const value of sentry.p || [0, 0, 0]) writer.f32(value);
    writer.f32(sentry.yaw);
    writer.f32(sentry.pitch);
    writer.u16(clamp(sentry.health, 0, 655.35) * 100);
    writer.u16(clamp(sentry.maxHealth, 0, 0xffff));
    writer.string(sentry.targetId);
  }

  // There can only be one drone per team, so a two-bit presence mask plus one
  // health word per active aircraft is enough. Its orbit is reconstructed
  // from server time and costs no transform bytes at all.
  const droneByTeam = new Map(
    (Array.isArray(snapshot.uavDrones) ? snapshot.uavDrones : [])
      .filter((drone) => drone?.team === 'blue' || drone?.team === 'red')
      .map((drone) => [drone.team, drone])
  );
  const droneMask = (droneByTeam.has('blue') ? 1 : 0)
    | (droneByTeam.has('red') ? 2 : 0);
  writer.u8(droneMask);
  if (droneMask & 1) {
    writer.u16(clamp(droneByTeam.get('blue').health, 0, UAV_DRONE_HEALTH) * 100);
  }
  if (droneMask & 2) {
    writer.u16(clamp(droneByTeam.get('red').health, 0, UAV_DRONE_HEALTH) * 100);
  }

  // TV missiles. Costs one zero byte per snapshot when nothing is in the air,
  // which is the overwhelmingly common case.
  const missiles = Array.isArray(snapshot.missiles) ? snapshot.missiles : [];
  writer.u8(missiles.length);
  for (const missile of missiles) {
    writer.string(missile.id);
    writer.string(missile.ownerId);
    writer.u8(teamCode(missile.team));
    for (const value of missile.p || [0, 0, 0]) writer.f32(value);
    writer.f32(missile.yaw);
    writer.f32(missile.pitch);
    writer.u8(missile.diving ? 1 : 0);
  }

  // Active A-10 runs are rare and short. Streaming only their immutable plan
  // lets late joiners reconstruct the whole deterministic visual for ~38 B.
  const casRuns = Array.isArray(snapshot.casRuns) ? snapshot.casRuns : [];
  writer.u8(casRuns.length);
  for (const run of casRuns) {
    writer.string(run.id);
    writer.string(run.ownerId);
    writer.u8(teamCode(run.team));
    writer.f32(run.start?.[0]);
    writer.f32(run.start?.[1]);
    writer.f32(run.end?.[0]);
    writer.f32(run.end?.[1]);
    writer.i32(finite(run.startedAt) - now);
    writer.u32(run.seed);
  }

  // B-2 passes are reconstructed from one horizontal map-spanning line.
  const firebombRuns = Array.isArray(snapshot.firebombRuns)
    ? snapshot.firebombRuns
    : [];
  writer.u8(firebombRuns.length);
  for (const run of firebombRuns) {
    writer.string(run.id);
    writer.string(run.ownerId);
    writer.u8(teamCode(run.team));
    writer.f32(run.start?.[0]);
    writer.f32(run.start?.[1]);
    writer.f32(run.end?.[0]);
    writer.f32(run.end?.[1]);
    writer.i32(finite(run.startedAt) - now);
  }

  // Apache motion is deterministic. Only the immutable call point plus the
  // current target id are needed for late joiners and synchronized aiming.
  const attackHelicopters = Array.isArray(snapshot.attackHelicopters)
    ? snapshot.attackHelicopters
    : [];
  writer.u8(attackHelicopters.length);
  for (const heli of attackHelicopters) {
    writer.string(heli.id);
    writer.string(heli.ownerId);
    writer.u8(teamCode(heli.team));
    for (const value of heli.call || [0, 0, 0]) writer.f32(value);
    writer.f32(heli.entryYaw);
    writer.i32(finite(heli.startedAt) - now);
    writer.string(heli.targetId);
    writer.u16(finite(heli.health, ATTACK_HELICOPTER_HEALTH) * 10);
  }

  // Juggernaut drops stream only their immutable call plan. Both the AW101
  // flight and the crate fall are reconstructed from server time.
  const airdrops = Array.isArray(snapshot.airdrops) ? snapshot.airdrops : [];
  writer.u8(airdrops.length);
  for (const drop of airdrops) {
    writer.string(drop.id);
    writer.string(drop.ownerId);
    writer.u8(teamCode(drop.team));
    for (const value of drop.target || [0, 0, 0]) writer.f32(value);
    writer.f32(drop.yaw);
    writer.i32(finite(drop.startedAt) - now);
  }
  return writer.finish();
}

export function createSnapshotDecodeState() {
  return {
    playerId: null,
    rosterVersion: null,
    roster: [],
  };
}

export function decodeSnapshotPacket(data, state = createSnapshotDecodeState()) {
  const reader = new Reader(data);
  packetHeader(reader, SNAPSHOT_PACKET);
  const packetFlags = reader.u8();
  const tick = reader.u32();
  const serverTime = reader.f64();
  const roomNumber = reader.u8();
  const roomPlayers = reader.u8();
  const roomCapacity = reader.u8();
  const roomRound = reader.u16();
  const rosterVersion = reader.u32();
  const match = {
    blueTickets: reader.u16(),
    redTickets: reader.u16(),
    maxTickets: reader.u16(),
    over: Boolean(reader.u8()),
    winner: decodeWinner(reader.u8()),
  };
  const ack = reader.u32();

  if (packetFlags & SNAPSHOT_HAS_ROSTER) {
    const count = reader.u8();
    const roster = [];
    for (let i = 0; i < count; i++) {
      roster.push({
        id: reader.string(),
        name: reader.string(),
        team: decodeTeam(reader.u8()),
      });
    }
    state.roster = roster;
    state.rosterVersion = rosterVersion;
  } else if (state.rosterVersion !== rosterVersion || !state.roster.length) {
    throw new TypeError('PVP snapshot roster is unavailable');
  }

  const teamAndFlags = reader.u8();
  const team = decodeTeam(teamAndFlags);
  const readyActive = Boolean(teamAndFlags & YOU_READY_FOR_ACTION);
  const ammo = readAmmo(reader);
  const weapon = decodeWeapon(reader.u8());
  let reloading = null;
  if (reader.u8()) {
    reloading = {
      weapon: decodeWeapon(reader.u8()),
      startedAt: serverTime + reader.i32(),
      endsAt: serverTime + reader.i32(),
    };
  }
  const kills = reader.u16();
  const deaths = reader.u16();
  const score = reader.u32();
  const streak = reader.u16();
  const grenades = reader.u8();
  const voteKickCooldown = reader.f32();
  const streaks = {
    uav: reader.u8(),
    strike: reader.u8(),
    sentry: reader.u8(),
    cas: reader.u8(),
    firebomb: reader.u8(),
    attack_helicopter: reader.u8(),
    juggernaut: reader.u8(),
    railgun: reader.u8(),
    uavTime: reader.f32(),
    uavSweepSeq: reader.u32(),
    uavRevealTime: reader.f32(),
    sentryHp: reader.f32(),
  };
  const markCount = reader.u8();
  const uavMarks = [];
  for (let i = 0; i < markCount; i++) {
    uavMarks.push([reader.f32(), reader.f32(), reader.f32()]);
  }

  const playerCount = reader.u8();
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    players.push(readPlayer(reader, state.roster, serverTime));
  }

  let voteKick = null;
  if (reader.u8()) {
    const id = reader.string();
    const targetId = reader.string();
    const targetName = reader.string();
    const initiatorName = reader.string();
    const yes = reader.u8();
    const no = reader.u8();
    const required = reader.u8();
    const endsAt = serverTime + reader.u32();
    const yourVoteCode = reader.u8();
    const canVote = Boolean(reader.u8());
    voteKick = {
      id,
      targetId,
      targetName,
      initiatorName,
      yes,
      no,
      required,
      endsAt,
      yourVote: yourVoteCode === 1 ? 'yes' : yourVoteCode === 2 ? 'no' : null,
      canVote,
    };
  }

  const sentryCount = reader.u8();
  const sentries = [];
  for (let i = 0; i < sentryCount; i++) {
    sentries.push({
      id: reader.string(),
      ownerId: reader.string(),
      team: decodeTeam(reader.u8()),
      p: [reader.f32(), reader.f32(), reader.f32()],
      yaw: reader.f32(),
      pitch: reader.f32(),
      health: reader.u16() / 100,
      maxHealth: reader.u16(),
      targetId: reader.string() || null,
    });
  }

  const droneMask = reader.u8();
  if (droneMask & ~3) throw new TypeError('invalid PVP UAV aircraft mask');
  const uavDrones = [];
  if (droneMask & 1) {
    uavDrones.push({
      id: uavDroneId('blue'),
      team: 'blue',
      health: reader.u16() / PLAYER_ORINGLEHP0,
      maxHealth: UAV_DRONE_HEALTH,
    });
  }
  if (droneMask & 2) {
    uavDrones.push({
      id: uavDroneId('red'),
      team: 'red',
      health: reader.u16() / 100,
      maxHealth: UAV_DRONE_HEALTH,
    });
  }

  const missileCount = reader.u8();
  const missiles = [];
  for (let i = 0; i < missileCount; i++) {
    missiles.push({
      id: reader.string(),
      ownerId: reader.string(),
      team: decodeTeam(reader.u8()),
      p: [reader.f32(), reader.f32(), reader.f32()],
      yaw: reader.f32(),
      pitch: reader.f32(),
      diving: reader.u8() === 1,
    });
  }

  const casRunCount = reader.u8();
  const casRuns = [];
  for (let i = 0; i < casRunCount; i++) {
    casRuns.push({
      id: reader.string(),
      ownerId: reader.string(),
      team: decodeTeam(reader.u8()),
      start: [reader.f32(), reader.f32()],
      end: [reader.f32(), reader.f32()],
      startedAt: serverTime + reader.i32(),
      seed: reader.u32(),
    });
  }

  const firebombRunCount = reader.u8();
  const firebombRuns = [];
  for (let i = 0; i < firebombRunCount; i++) {
    firebombRuns.push({
      id: reader.string(),
      ownerId: reader.string(),
      team: decodeTeam(reader.u8()),
      start: [reader.f32(), reader.f32()],
      end: [reader.f32(), reader.f32()],
      startedAt: serverTime + reader.i32(),
    });
  }

  const attackHelicopterCount = reader.u8();
  const attackHelicopters = [];
  for (let i = 0; i < attackHelicopterCount; i++) {
    attackHelicopters.push({
      id: reader.string(),
      ownerId: reader.string(),
      team: decodeTeam(reader.u8()),
      call: [reader.f32(), reader.f32(), reader.f32()],
      entryYaw: reader.f32(),
      startedAt: serverTime + reader.i32(),
      targetId: reader.string() || null,
      health: reader.u16() / 10,
      maxHealth: ATTACK_HELICOPTER_HEALTH,
    });
  }

  const airdropCount = reader.u8();
  const airdrops = [];
  for (let i = 0; i < airdropCount; i++) {
    airdrops.push({
      id: reader.string(),
      ownerId: reader.string(),
      team: decodeTeam(reader.u8()),
      target: [reader.f32(), reader.f32(), reader.f32()],
      yaw: reader.f32(),
      startedAt: serverTime + reader.i32(),
    });
  }
  if (!reader.done()) throw new TypeError('invalid PVP snapshot packet length');

  return {
    type: 'snapshot',
    protocol: PVP_PROTOCOL,
    tick,
    serverTime,
    room: {
      id: `room-${roomNumber}`,
      number: roomNumber,
      players: roomPlayers,
      capacity: roomCapacity,
      round: roomRound,
    },
    match,
    ack,
    you: {
      id: state.playerId,
      team,
      readyActive,
      ammo,
      weapon,
      reloading,
      kills,
      deaths,
      score,
      streak,
      grenades,
      voteKickCooldown,
      streaks,
      uavMarks,
    },
    players,
    voteKick,
    sentries,
    uavDrones,
    missiles,
    casRuns,
    firebombRuns,
    attackHelicopters,
    airdrops,
  };
}

export const PVP_INPUT_PACKET_BYTES = 20;