/**
 * serve.mjs — a dependency-free static server for local development.
 *
 * A service worker only registers over http(s), so `npm start` is the way to
 * exercise the PWA locally: http://localhost:4173
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const option = (name) => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const PORT = Number(option('--port') || process.env.PORT || 4173);
const HOST = option('--host') || process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function inRoot(path) {
  return path === ROOT || path.startsWith(ROOT + sep);
}

/** Lexical path check; returns null for anything that escapes the root. */
function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null; // a malformed percent-escape is a bad request, not a crash
  }
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const target = resolve(join(ROOT, relative));
  return inRoot(target) ? target : null;
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }

  let target = safePath(request.url || '/');
  if (!target) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    let info = await stat(target);
    if (info.isDirectory()) {
      target = join(target, 'index.html');
      info = await stat(target);
    }
    // The lexical check can't see through a symlink, so re-check the real path.
    if (!inRoot(await realpath(target))) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    response.writeHead(200, {
      'content-type': TYPES[extname(target)] || 'application/octet-stream',
      'content-length': info.size,
      // Development only: never let the browser hold a stale shell.
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Garapp dev server on http://${HOST}:${PORT}\n`);
});
