import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { setTimeout as wait } from 'node:timers/promises';
import { WebSocket } from 'ws';
import {
  PVP_PROTOCOL,
  PVP_TICK_MS,
  PVP_TICK_RATE,
} from '../src/net/protocol.js';
import {
  createSnapshotDecodeState,
  decodeSnapshotPacket,
  encodeInputPacket,
  PVP_INPUT_PACKET_BYTES,
} from '../src/net/pvp-wire.js';
import { createDefaultLoadout } from '../src/game/loadout.js';

const PORT = 18328;
const HTTP = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}/pvp`;
const SAMPLE_MS = 1400;
const child = spawn(process.execPath, ['serve.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    PVP_TEST_AUTH_BYPASS: '1',
    PVP_DISABLE_BAN_PERSISTENCE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverError = '';
child.stderr.on('data', (chunk) => { serverError += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${HTTP}/api/pvp/rooms`)).ok) return;
    } catch {}
    await wait(40);
  }
  throw new Error(`bandwidth test server did not start: ${serverError}`);
}

function clientId(index) {
  return Math.max(1, index).toString(16).padStart(32, '0');
}

function connectClient(index) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    const decodeState = createSnapshotDecodeState();
    const stats = {
      snapshotBytes: 0,
      snapshotCount: 0,
      inputBytes: 0,
      inputCount: 0,
      measuring: false,
    };
    let seq = 0;
    let inputTimer = null;
    let inputLastAt = 0;
    let inputAccumulator = 0;
    let joinedId = '';
    let settled = false;
    const seenTypes = [];
    const startInputLoop = () => {
      const sendInput = () => {
        const input = encodeInputPacket({
          seq: ++seq,
          moveX: index % 2 ? 1 : 0,
          moveZ: index % 3 ? -1 : 0,
          jump: false,
          crouch: false,
          slide: false,
          sprint: true,
          aim: false,
          trigger: false,
          reload: false,
          weapon: 'rifle',
          yaw: 1.23456789,
          pitch: -0.12345678,
        });
        if (stats.measuring) {
          stats.inputBytes += input.byteLength;
          stats.inputCount++;
        }
        ws.send(input);
      };
      inputLastAt = performance.now();
      inputAccumulator = 0;
      inputTimer = setInterval(() => {
        const now = performance.now();
        inputAccumulator += Math.max(0, now - inputLastAt);
        inputLastAt = now;
        while (inputAccumulator + 0.001 >= PVP_TICK_MS) {
          sendInput();
          inputAccumulator -= PVP_TICK_MS;
        }
      }, Math.max(4, PVP_TICK_MS / 2));
    };
    const resolveAlive = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      startInputLoop();
      resolve({
        ws,
        stats,
        close() {
          clearInterval(inputTimer);
          ws.close();
        },
      });
    };
    const timeout = setTimeout(() => reject(new Error(
      `join timeout ${index}; messages=${seenTypes.join(',')}; server=${serverError}`
    )), 6000);
    ws.on('message', (raw, isBinary) => {
      const message = isBinary
        ? decodeSnapshotPacket(raw, decodeState)
        : JSON.parse(raw.toString());
      seenTypes.push(message.type);
      if (message.type === 'hello') {
        ws.send(JSON.stringify({
          type: 'join',
          protocol: PVP_PROTOCOL,
          roomId: 'room-1',
          name: `BAND-${String(index).padStart(2, '0')}`,
          clientId: clientId(index),
        }));
      } else if (message.type === 'joined') {
        decodeState.playerId = message.id;
        joinedId = message.id;
        ws.send(JSON.stringify({
          type: 'deploy',
          loadout: createDefaultLoadout(),
        }));
      } else if (message.type === 'join_error') {
        clearTimeout(timeout);
        reject(new Error(`join ${index} failed: ${message.code}`));
      } else if (message.type === 'snapshot' && stats.measuring) {
        stats.snapshotBytes += Buffer.byteLength(raw);
        stats.snapshotCount++;
      }
      if (message.type === 'snapshot'
        && message.players?.some((player) => player.id === joinedId && player.alive)) {
        resolveAlive();
      }
    });
    ws.on('error', reject);
  });
}

async function sample(client, players) {
  Object.assign(client.stats, {
    snapshotBytes: 0,
    snapshotCount: 0,
    inputBytes: 0,
    inputCount: 0,
    measuring: true,
  });
  const started = performance.now();
  await wait(SAMPLE_MS);
  const elapsed = (performance.now() - started) / 1000;
  client.stats.measuring = false;
  return {
    players,
    seconds: elapsed,
    downBytesPerSecond: client.stats.snapshotBytes / elapsed,
    upBytesPerSecond: client.stats.inputBytes / elapsed,
    snapshotsPerSecond: client.stats.snapshotCount / elapsed,
    inputsPerSecond: client.stats.inputCount / elapsed,
    averageSnapshotBytes: client.stats.snapshotCount
      ? client.stats.snapshotBytes / client.stats.snapshotCount
      : 0,
    averageInputBytes: client.stats.inputCount
      ? client.stats.inputBytes / client.stats.inputCount
      : 0,
  };
}

const clients = [];
const results = [];
try {
  await waitForServer();
  for (let i = 1; i <= 12; i++) {
    clients.push(await connectClient(i));
    if ([1, 6, 12].includes(i)) {
      await wait(250);
      results.push(await sample(clients[0], i));
    }
  }
  console.log('\nPVP payload bandwidth audit\n');
  for (const result of results) {
    console.log(
      `  ${String(result.players).padStart(2)} players`
      + `  down ${(result.downBytesPerSecond * 8 / 1000).toFixed(1)} kbit/s`
      + `  up ${(result.upBytesPerSecond * 8 / 1000).toFixed(1)} kbit/s`
      + `  snapshot ${result.averageSnapshotBytes.toFixed(0)} B`
      + `  input ${result.averageInputBytes.toFixed(0)} B`
      + `  rate ${result.snapshotsPerSecond.toFixed(1)}/${result.inputsPerSecond.toFixed(1)} Hz`
    );
  }
} finally {
  for (const client of clients) client.close();
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(1000),
  ]);
}

let failures = 0;
const one = results.find((result) => result.players === 1);
const six = results.find((result) => result.players === 6);
const twelve = results.find((result) => result.players === 12);
if (!one || !six || !twelve) failures++;
const minimumObservedRate = PVP_TICK_RATE * 0.8;
if (results.some((result) => result.averageInputBytes !== PVP_INPUT_PACKET_BYTES
  || result.inputsPerSecond < minimumObservedRate
  || result.snapshotsPerSecond < minimumObservedRate)) failures++;
if ((one?.downBytesPerSecond || Infinity) * 8 >= 75000) failures++;
if ((six?.downBytesPerSecond || Infinity) * 8 >= 190000) failures++;
if ((twelve?.downBytesPerSecond || Infinity) * 8 >= 330000
  || (twelve?.upBytesPerSecond || Infinity) * 8 >= 10000
  || (twelve?.averageSnapshotBytes || Infinity) >= 900) failures++;

const downReduction = twelve
  ? (1 - twelve.downBytesPerSecond / (1132300 / 8)) * 100
  : 0;
const upReduction = twelve
  ? (1 - twelve.upBytesPerSecond / (51000 / 8)) * 100
  : 0;
console.log(
  failures
    ? `\n${failures} PVP bandwidth regression(s)\n`
    : `\nPVP payload reduced ${downReduction.toFixed(1)}% down / ${upReduction.toFixed(1)}% up at 12 players\n`
);
process.exit(failures ? 1 : 0);
