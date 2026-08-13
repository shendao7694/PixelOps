import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { WebSocket } from 'ws';

const PORT = 18326;
const HTTP = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}/pvp`;
const TEST_SECRET = 'local-auth-test-secret-that-is-long-enough-for-hmac';
process.env.NODE_ENV = 'test';
process.env.LINUXDO_CLIENT_ID = 'local-test-client';
process.env.LINUXDO_CLIENT_SECRET = 'local-test-client-secret';
process.env.LINUXDO_REDIRECT_URI = `${HTTP}/auth/linuxdo/callback`;
process.env.AUTH_COOKIE_SECRET = TEST_SECRET;
delete process.env.PVP_TEST_AUTH_BYPASS;

const {
  authConfigured,
  authUserFromCookieHeader,
  createSessionCookieValue,
} = await import('../server/auth.mjs');
const { PVP_PROTOCOL } = await import('../src/net/protocol.js');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('  ok   ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (detail ? `\n       ${detail}` : ''));
  }
}

console.log('\nLinuxDO authentication audit\n');

const now = Date.now();
const session = createSessionCookieValue({
  id: 1189,
  username: 'LinuxUser',
  name: 'Linux User',
  trust_level: 3,
  active: true,
}, now);
const cookieHeader = `pixelops_auth=${encodeURIComponent(session)}`;
const parsed = authUserFromCookieHeader(cookieHeader, now + 1000);
check('signed session preserves the public LinuxDO identity',
  authConfigured()
    && parsed?.id === '1189'
    && parsed?.username === 'LinuxUser'
    && parsed?.trustLevel === 3);

const tampered = `${session.slice(0, -1)}${session.endsWith('a') ? 'b' : 'a'}`;
check('tampered session signatures are rejected',
  authUserFromCookieHeader(`pixelops_auth=${encodeURIComponent(tampered)}`, now + 1000) === null);
check('expired sessions are rejected',
  authUserFromCookieHeader(cookieHeader, now + 31 * 24 * 60 * 60 * 1000) === null);

const child = spawn(process.execPath, ['serve.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    PVP_TEST_AUTH_BYPASS: '0',
    PVP_DISABLE_BAN_PERSISTENCE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverError = '';
child.stderr.on('data', (chunk) => { serverError += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`${HTTP}/api/auth/session`);
      if (response.ok) return;
    } catch {}
    await wait(50);
  }
  throw new Error(`authentication test server did not start: ${serverError}`);
}

function unauthenticatedSocketResult() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    let authMessage = null;
    const timer = setTimeout(() => reject(new Error('unauthenticated socket timeout')), 3000);
    ws.on('message', (raw) => { authMessage = JSON.parse(raw); });
    ws.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, authMessage });
    });
    ws.on('error', reject);
  });
}

function authenticatedJoinResult() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS, { headers: { Cookie: cookieHeader } });
    const timer = setTimeout(() => reject(new Error('authenticated join timeout')), 3000);
    ws.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.type === 'hello') {
        ws.send(JSON.stringify({
          type: 'join',
          protocol: PVP_PROTOCOL,
          roomId: 'room-1',
          name: 'SPOOFED-NAME',
          clientId: '00000000000000000000000000001189',
        }));
      }
      if (message.type === 'joined' || message.type === 'join_error') {
        clearTimeout(timer);
        ws.close();
        resolve(message);
      }
    });
    ws.on('error', reject);
  });
}

try {
  await waitForServer();

  const anonymous = await fetch(`${HTTP}/api/auth/session`).then((response) => response.json());
  check('anonymous session endpoint reports login required',
    anonymous.configured === true && anonymous.authenticated === false && anonymous.user === null);

  const authenticated = await fetch(`${HTTP}/api/auth/session`, {
    headers: { Cookie: cookieHeader },
  }).then((response) => response.json());
  check('valid session endpoint exposes only the public profile',
    authenticated.authenticated === true
      && authenticated.user?.id === '1189'
      && authenticated.user?.username === 'LinuxUser'
      && authenticated.user?.trustLevel === 3);

  const authorize = await fetch(`${HTTP}/auth/linuxdo`, { redirect: 'manual' });
  const authorizeUrl = new URL(authorize.headers.get('location'));
  const stateCookie = authorize.headers.get('set-cookie') || '';
  check('OAuth entry redirects to LinuxDO with callback and signed state',
    authorize.status === 302
      && authorizeUrl.origin === 'https://connect.linux.do'
      && authorizeUrl.pathname === '/oauth2/authorize'
      && authorizeUrl.searchParams.get('client_id') === 'local-test-client'
      && authorizeUrl.searchParams.get('redirect_uri') === `${HTTP}/auth/linuxdo/callback`
      && authorizeUrl.searchParams.get('state')?.length >= 32
      && stateCookie.includes('HttpOnly')
      && stateCookie.includes('Secure')
      && stateCookie.includes('SameSite=Lax')
      && !authorize.headers.get('location').includes('local-test-client-secret'));

  const rejected = await unauthenticatedSocketResult();
  check('unauthenticated PVP sockets are rejected by the server',
    rejected.authMessage?.type === 'auth_required' && rejected.code === 4001);

  const joined = await authenticatedJoinResult();
  check('authenticated PVP joins and ignores a spoofed client nickname',
    joined.type === 'joined' && joined.name === 'LINUXUSER',
    JSON.stringify(joined));
} catch (error) {
  failures++;
  console.log(`  FAIL authentication integration\n       ${error?.stack || error}`);
} finally {
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(1000),
  ]);
}

console.log(failures ? `\n${failures} authentication problem(s)\n` : '\nLinuxDO authentication verified\n');
process.exit(failures ? 1 : 0);
