import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomBytes } from 'node:crypto';

const PSTEAM_OAUTH_URL = 'https://psteam.pages.dev/oauth';
const PSTEAM_API_BASE = 'https://psteam.pages.dev';
const SESSION_COOKIE = 'pixelops_auth';
const SESSION_SECONDS = 30 * 24 * 60 * 60;

const CLIENT_NAME = '像素作战';
const CLIENT_ICON = '';
const COOKIE_SECRET = 'my-super-secret-cookie-key-change-me-12345';
const TEST_BYPASS = (global?.istest ?? false);

function parseCookies(header) {
  const result = {};
  for (const part of String(header || '').split(';')) {
    const split = part.indexOf('=');
    if (split <= 0) continue;
    const key = part.slice(0, split).trim();
    const value = part.slice(split + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function signature(value) {
  return createHmac('sha256', COOKIE_SECRET).update(value).digest('base64url');
}

function encodeSigned(payload) {
  if (!COOKIE_SECRET) return null;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signature(body)}`;
}

function decodeSigned(value) {
  if (!COOKIE_SECRET || typeof value !== 'string') return null;
  const split = value.lastIndexOf('.');
  if (split <= 0) return null;
  const body = value.slice(0, split);
  const supplied = Buffer.from(value.slice(split + 1));
  const expected = Buffer.from(signature(body));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function cookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path || '/'}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.secure === true) {
    parts.push('Secure');
  }
  if (Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  return parts.join('; ');
}

function clearCookie(name, path = '/') {
  return cookie(name, '', { path, maxAge: 0 });
}

function publicUser(profile) {
  const id = String(profile?.id || '').trim().slice(0, 64);
  const name = String(profile?.name || '').trim().slice(0, 64);
  const email = String(profile?.email || '').trim().slice(0, 128);
  
  if (!id || !name) return null;

  return {
    id: id,
    username: name,
    name: name,
    email: email,
    group: String(profile?.group || 'user').trim().slice(0, 20),
  };
}

export function authConfigured() {
  return Boolean(COOKIE_SECRET);
}

export function createSessionCookieValue(user, now = Date.now()) {
  const clean = publicUser(user);
  if (!clean) return null;
  return encodeSigned({
    type: 'session',
    user: clean,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_SECONDS,
  });
}

export function authUserFromCookieHeader(header, now = Date.now()) {
  const value = parseCookies(header)[SESSION_COOKIE];
  const payload = decodeSigned(value);
  if (payload?.type !== 'session' || !Number.isFinite(payload.exp)
    || payload.exp <= Math.floor(now / 1000)) return null;
  return publicUser(payload.user);
}

export function authUserFromRequest(request) {
  if (TEST_BYPASS) {
    return {
      id: 'test-user',
      username: 'TEST-PLAYER',
      name: 'Test Player',
      email: 'test@test.local',
      group: 'user',
      testBypass: true,
    };
  }
  return authUserFromCookieHeader(request?.headers?.cookie);
}

async function fetchPsteamUser(token, session) {
  const response = await fetch(`${PSTEAM_API_BASE}/api/data/user`, {
    headers: {
      Cookie: `token=${token}; session=${session}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`PSteam API 返回错误: ${response.status}`);
  }
  
  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error('PSteam API 返回数据无效');
  }
  
  return result.data;
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function redirect(res, location, cookies = []) {
  const headers = {
    Location: location,
    'Cache-Control': 'no-store',
  };
  if (cookies.length) headers['Set-Cookie'] = cookies;
  res.writeHead(302, headers);
  res.end();
}

function errorPage(res, status, message, cookies = []) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'X-Content-Type-Options': 'nosniff',
  };
  if (cookies.length) headers['Set-Cookie'] = cookies;
  res.writeHead(status, headers);
  res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8">
    <title>登录失败</title>
    <body style="background:#05070a;color:#e8eef2;font:16px monospace;padding:32px">
    <h1 style="color:#ffcc55">登录失败</h1><p>${message}</p>
    <p><a style="color:#7de08a" href="/">返回游戏</a></p></body></html>`);
}

export async function handleAuthHttp(req, res, requestUrl) {
  const path = requestUrl.pathname;

  if (path === '/api/auth/session') {
    const user = authUserFromRequest(req);
    json(res, 200, {
      authenticated: Boolean(user),
      configured: authConfigured() || TEST_BYPASS,
      localTest: user?.testBypass === true,
      user: user ? {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        group: user.group,
      } : null,
    });
    return true;
  }

  if (path === '/auth/logout') {
    redirect(res, '/', [clearCookie(SESSION_COOKIE)]);
    return true;
  }

  if (path === '/auth/linuxdo') {
    if (req.method !== 'GET') {
      json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
      return true;
    }

    if (!authConfigured()) {
      errorPage(res, 503, '服务器尚未配置登录服务。');
      return true;
    }

    if (authUserFromRequest(req)) {
      redirect(res, '/?pvp=1');
      return true;
    }

    const redirectUri = `${requestUrl.protocol}//${requestUrl.host}:${PORT}/auth/linuxdo/callback`;
    const authorizeUrl = new URL(PSTEAM_OAUTH_URL);
    authorizeUrl.searchParams.set('uri', redirectUri);
    authorizeUrl.searchParams.set('scope', 'user:all');
    authorizeUrl.searchParams.set('name', CLIENT_NAME);
    if (CLIENT_ICON) {
      authorizeUrl.searchParams.set('icon', CLIENT_ICON);
    }

    redirect(res, authorizeUrl.toString());
    return true;
  }

  if (path === '/auth/linuxdo/callback') {
    if (req.method !== 'GET') {
      json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
      return true;
    }

    if (!authConfigured()) {
      errorPage(res, 503, '服务器尚未配置登录服务。');
      return true;
    }

    const urlParams = requestUrl.searchParams;
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (error) {
      console.warn(`PSteam OAuth 授权失败: ${error} - ${errorDescription || '无详情'}`);
      redirect(res, '/?pvp=1&auth_error=' + encodeURIComponent(error), [
        clearCookie(SESSION_COOKIE),
      ]);
      return true;
    }

    const name = urlParams.get('name');
    const email = urlParams.get('email');
    const group = urlParams.get('group');
    const token = urlParams.get('token');
    const session = urlParams.get('session');

    if (!name || !email || !token || !session) {
      errorPage(res, 400, '授权回调信息不完整，请重试。');
      return true;
    }

    try {
      const userData = await fetchPsteamUser(token, session);
      
      const userProfile = {
        id: userData.name,
        username: userData.name,
        email: userData.email,
        name: userData.name,
        group: userData.group || 'user',
      };

      const sessionCookieValue = createSessionCookieValue(userProfile);
      if (!sessionCookieValue) {
        errorPage(res, 500, '创建会话失败，请重试。');
        return true;
      }

      redirect(res, '/?pvp=1', [
        cookie(SESSION_COOKIE, sessionCookieValue, { maxAge: SESSION_SECONDS }),
      ]);
    } catch (err) {
      console.error('获取 PSteam 用户信息失败:', err.message);
      errorPage(res, 502, '无法获取用户信息，请稍后重试。');
    }
    return true;
  }

  return false;
}