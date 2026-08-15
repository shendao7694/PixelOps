// Minimal static server - ES modules need http://, they will not run from file://
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import {
  attachPvpServer,
  clientIpFromRequest,
  getPvpStatus,
  isRoutableIp,
  onCommand
} from './server/pvp-server.mjs';
import { handleAuthHttp } from './server/auth.mjs';
import { lookupIpCountry, publicRegionResult } from './server/client-region.mjs';

const ROOT = resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
global.PORT = (global?.istest ?? false) ? 7695 : 7694;
const HOST = '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
};

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const url = decodeURIComponent(requestUrl.pathname);
    if (await handleAuthHttp(req, res, requestUrl)) return;
    if (url === '/api/pvp/rooms') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(getPvpStatus()));
      return;
    }
    if (url === '/api/pvp/region') {
      const ip = clientIpFromRequest(req);
      const country = isRoutableIp(ip) ? await lookupIpCountry(ip) : null;
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(publicRegionResult(country)));
      return;
    }
    const requested = url === '/' ? 'index.html' : url.replace(/^[/\\]+/, '');
    const requestedKey = requested.replaceAll('\\', '/').toLowerCase();
    if (requestedKey === '.runtime' || requestedKey.startsWith('.runtime/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found');
      return;
    }
    let path = resolve(ROOT, requested);
    const rel = relative(ROOT, path);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(path).catch(() => null);
    if (info && info.isDirectory()) path = join(path, 'index.html');
    const data = await readFile(path);
    const extension = extname(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.glb'
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found');
  }
});

attachPvpServer(server);

server.listen(PORT, HOST, () => {
  const { tickRate, roomCount, capacityPerRoom } = getPvpStatus();
  console.log('');
  console.log(`  PIXEL OPS running at  http://${HOST}:${PORT}/`);
  console.log(`  PVP: ${roomCount} rooms x ${capacityPerRoom} players, authoritative ${tickRate} tick/s`);
  console.log('  press Ctrl+C to stop');
  console.log('');
  
  let input = '';
  
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  
  const renderPrompt = () => {
    process.stdout.write('> ');
  };
  
  const clearLine = () => {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  };
  
  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
      console.log('\n');
      process.exit();
      return;
    }
    
    if (key.name === 'return') {
      clearLine();
      const cmd = input.trim();
      input = '';
      if (cmd) {
        onCommand(cmd);
      }
      renderPrompt();
      return;
    }
    
    if (key.name === 'backspace') {
      if (input.length > 0) {
        input = input.slice(0, -1);
        clearLine();
        process.stdout.write('> ' + input);
      }
      return;
    }
    
    if (str && str.length === 1 && str.charCodeAt(0) >= 32 && !key.ctrl && !key.meta) {
      input += str;
      process.stdout.write(str);
    }
  });
  
  renderPrompt();
});
