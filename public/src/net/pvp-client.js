import {
  PVP_PROTOCOL,
  PVP_ROOM_IDS,
  sanitizeChatMessage,
  sanitizeClientId,
  sanitizePlayerName,
} from './protocol.js';
import {
  createSnapshotDecodeState,
  decodeSnapshotPacket,
  encodeInputPacket,
} from './pvp-wire.js';

const CLIENT_ID_KEY = 'pixelops:pvpClientId';

function loadClientId() {
  try {
    const stored = sanitizeClientId(localStorage.getItem(CLIENT_ID_KEY));
    if (stored) return stored;
    const generated = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    localStorage.setItem(CLIENT_ID_KEY, generated);
    return generated;
  } catch {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

export class PvpClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.socket = null;
    this.state = 'offline';
    this.rooms = PVP_ROOM_IDS.map((id, i) => ({
      id,
      number: i + 1,
      players: 0,
      capacity: 12,
    }));
    this.playerId = null;
    this.roomId = null;
    this.team = null;
    this.name = null;
    this.clientId = loadClientId();
    this.latency = 0;
    this.clockOffset = null;
    this.bestClockRtt = Infinity;
    this.pendingJoin = null;
    this.wantConnection = false;
    this.reconnectTimer = 0;
    this.pingTimer = 0;
    this.lastSnapshotTick = -1;
    this.authRequiredNotified = false;
    this.snapshotDecodeState = createSnapshotDecodeState();
  }

  url() {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${location.host}/pvp`;
  }

  connect() {
    this.wantConnection = true;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'rooms' });
      return;
    }
    if (this.socket?.readyState === WebSocket.CONNECTING) return;

    this.setState('connecting');
    const socket = new WebSocket(this.url());
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.setState('online');
      this.send({ type: 'rooms' });
      if (this.pendingJoin) this.sendJoin();
      clearInterval(this.pingTimer);
      this.sendPing();
      this.pingTimer = setInterval(() => this.sendPing(), 2000);
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event.data);
    });
    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return;
      const wasJoined = Boolean(this.playerId);
      this.socket = null;
      this.playerId = null;
      this.roomId = null;
      this.team = null;
      this.lastSnapshotTick = -1;
      this.snapshotDecodeState = createSnapshotDecodeState();
      clearInterval(this.pingTimer);
      if (event.code === 4001) {
        this.requireAuth();
        return;
      }
      this.setState('offline');
      if (wasJoined) {
        this.handlers.disconnected?.({
          code: event.code,
          reason: event.reason || '',
          reconnecting: this.wantConnection,
        });
      }
      if (this.wantConnection) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 1400);
      }
    });
    socket.addEventListener('error', () => {
      if (this.socket === socket) this.setState('error');
    });
  }

  setState(state) {
    this.state = state;
    this.handlers.status?.(state);
  }

  requireAuth() {
    this.wantConnection = false;
    this.pendingJoin = null;
    clearTimeout(this.reconnectTimer);
    this.setState('auth_required');
    if (this.authRequiredNotified) return;
    this.authRequiredNotified = true;
    this.handlers.authRequired?.();
  }

  join(roomId, name) {
    if (!PVP_ROOM_IDS.includes(roomId)) return;
    this.pendingJoin = {
      roomId,
      name: sanitizePlayerName(name, `PLAYER-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`),
    };
    this.connect();
    if (this.socket?.readyState === WebSocket.OPEN) this.sendJoin();
  }

  sendJoin() {
    if (!this.pendingJoin) return;
    this.setState('joining');
    this.send({
      type: 'join',
      ...this.pendingJoin,
      protocol: PVP_PROTOCOL,
      clientId: this.clientId,
    });
  }

  leave() {
    if (this.playerId) this.send({ type: 'leave' });
    this.pendingJoin = null;
    this.playerId = null;
    this.roomId = null;
    this.team = null;
    this.lastSnapshotTick = -1;
    this.snapshotDecodeState = createSnapshotDecodeState();
    this.setState(this.socket?.readyState === WebSocket.OPEN ? 'online' : 'offline');
  }

  close() {
    this.wantConnection = false;
    this.pendingJoin = null;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    this.socket?.close(1000, 'CLIENT CLOSED');
    this.socket = null;
    this.playerId = null;
    this.roomId = null;
    this.team = null;
    this.lastSnapshotTick = -1;
    this.snapshotDecodeState = createSnapshotDecodeState();
    this.setState('offline');
  }

  sendInput(input) {
    if (!this.playerId) return false;
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(encodeInputPacket(input));
    return true;
  }

  sendPing() {
    this.send({ type: 'ping', at: performance.now() });
  }

  clientEpochForServerTime(serverTime, receivedAt = Date.now()) {
    if (Number.isFinite(serverTime) && Number.isFinite(this.clockOffset)) {
      return serverTime - this.clockOffset;
    }
    return receivedAt - Math.max(0, this.latency) * 0.5;
  }

  useAbility(ability, data = {}) {
    if (!this.playerId) return;
    this.send({ type: 'ability', ability, ...data });
  }

  deploy(loadout) {
    if (!this.playerId) return false;
    return this.send({ type: 'deploy', loadout });
  }

  requestRespawnLoadout() {
    if (!this.playerId) return false;
    return this.send({ type: 'respawn_loadout' });
  }

  startVoteKick(targetId) {
    if (!this.playerId || typeof targetId !== 'string') return false;
    return this.send({ type: 'vote_kick_start', targetId });
  }

  castVoteKick(approve) {
    if (!this.playerId) return false;
    return this.send({ type: 'vote_kick_vote', vote: approve ? 'yes' : 'no' });
  }

  sendChat(value) {
    if (!this.playerId) return false;
    const text = sanitizeChatMessage(value);
    return text ? this.send({ type: 'chat', text }) : false;
  }

  castMapVote(mapId) {
    if (!this.playerId || typeof mapId !== 'string') return false;
    return this.send({ type: 'map_vote', mapId });
  }

  async checkRegion(timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('/api/pvp/region', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const result = await response.json();
      return {
        country: typeof result?.country === 'string' ? result.country : null,
        outsideChina: result?.outsideChina === true,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async checkAuth(timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('/api/auth/session', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (result?.authenticated) this.authRequiredNotified = false;
      return {
        authenticated: result?.authenticated === true,
        configured: result?.configured === true,
        localTest: result?.localTest === true,
        user: result?.user && typeof result.user === 'object' ? result.user : null,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  send(payload) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  acceptSnapshot(snapshot) {
    const tick = Number(snapshot?.tick);
    if (Number.isSafeInteger(tick)) {
      if (tick <= this.lastSnapshotTick) return false;
      this.lastSnapshotTick = tick;
    }
    this.handlers.snapshot?.(snapshot);
    return true;
  }

  handleMessage(raw) {
    let message;
    if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
      try {
        message = decodeSnapshotPacket(raw, this.snapshotDecodeState);
      } catch {
        this.handlers.error?.('INVALID SERVER SNAPSHOT');
        this.close();
        return;
      }
    } else {
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
    }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'auth_required') {
      this.requireAuth();
      return;
    }
    if (message.protocol !== undefined && message.protocol !== PVP_PROTOCOL) {
      this.handlers.error?.('PROTOCOL VERSION MISMATCH');
      this.close();
      return;
    }
    if (message.type === 'hello' || message.type === 'rooms') {
      if (Array.isArray(message.rooms)) {
        this.rooms = message.rooms;
        this.handlers.rooms?.(this.rooms);
      }
      return;
    }
    if (message.type === 'joined') {
      this.pendingJoin = null;
      this.playerId = message.id;
      this.snapshotDecodeState.playerId = message.id;
      this.roomId = message.room?.id;
      this.team = message.team;
      this.name = message.name;
      this.lastSnapshotTick = -1;
      this.setState('joined');
      this.handlers.joined?.(message);
      if (message.snapshot) this.acceptSnapshot(message.snapshot);
      return;
    }
    if (message.type === 'join_error') {
      this.pendingJoin = null;
      if (message.code === 'BANNED') {
        this.setState('banned');
        this.handlers.event?.(message);
        return;
      }
      this.setState('online');
      this.handlers.error?.(message.message || 'COULD NOT JOIN ROOM');
      return;
    }
    if (message.type === 'snapshot') {
      this.acceptSnapshot(message);
      return;
    }
    if (message.type === 'pong') {
      const sentAt = Number(message.at);
      if (Number.isFinite(sentAt)) {
        this.latency = Math.max(0, performance.now() - sentAt);
        const serverTime = Number(message.serverTime);
        if (Number.isFinite(serverTime)) {
          // NTP-style midpoint estimate. Prefer the least congested samples,
          // then gently smooth equally good ones so queueing spikes do not
          // move the reconciliation time backwards and forwards.
          const sample = serverTime - (Date.now() - this.latency * 0.5);
          if (this.clockOffset === null || this.latency <= this.bestClockRtt * 1.25) {
            this.clockOffset = this.clockOffset === null
              ? sample
              : this.clockOffset * 0.8 + sample * 0.2;
          }
          this.bestClockRtt = Math.min(this.bestClockRtt, this.latency);
        }
        this.handlers.latency?.(this.latency);
      }
      return;
    }
    if (message.type === 'left') {
      this.playerId = null;
      this.roomId = null;
      this.team = null;
      this.lastSnapshotTick = -1;
      this.snapshotDecodeState = createSnapshotDecodeState();
      this.setState('online');
      return;
    }
    if (message.type === 'kicked') {
      this.pendingJoin = null;
      this.playerId = null;
      this.roomId = null;
      this.team = null;
      this.lastSnapshotTick = -1;
      this.snapshotDecodeState = createSnapshotDecodeState();
      this.setState('banned');
      this.handlers.event?.(message);
      return;
    }
    this.handlers.event?.(message);
  }
}
