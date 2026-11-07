import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readFile, mkdtemp, cp, appendFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderServiceWorker } from '../tools/build-pwa.mjs';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const worker = await readFile(join(root, 'sw.js'), 'utf8');
const assets = JSON.parse(worker.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
const release = worker.match(/const RELEASE = '([^']+)'/)[1];
const bodies = new Map(await Promise.all(assets.map(async (asset) => [asset.path, await readFile(join(root, asset.path))])));

function memoryCaches() {
  const stores = new Map();
  const failures = { writes: false };
  const key = (request) => typeof request === 'string' ? request : request.href ?? request.url;
  return {
    stores, failures,
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        entries,
        async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, response) { if (failures.writes) throw Error('Quota exceeded'); entries.set(key(request), response.clone()); },
      };
    },
  };
}

function runtime(scope = 'https://example.test/Garapp/dev/', caches = memoryCaches()) {
  const listeners = new Map();
  const state = { offline: false, corrupt: null, fetches: [], skipped: 0, claimed: 0 };
  const context = {
    URL, Request, Response, Uint8Array, crypto: webcrypto, caches,
    self: {
      registration: { scope },
      clients: { async claim() { state.claimed++; } },
      async skipWaiting() { state.skipped++; },
      addEventListener(type, listener) { listeners.set(type, listener); },
    },
    async fetch(request) {
      state.fetches.push(request.url);
      if (state.offline) throw Error('Offline');
      const url = new URL(request.url);
      assert.equal(url.origin, new URL(scope).origin);
      assert.equal(url.searchParams.get('garapp-cache'), release);
      const path = decodeURIComponent(url.pathname.slice(new URL(scope).pathname.length));
      if (!bodies.has(path)) return new Response('Not found', { status: 404 });
      return new Response(state.corrupt === path ? 'Wrong release' : bodies.get(path));
    },
  };
  // A cache lifecycle must never reach garage databases or other business storage.
  for (const name of ['indexedDB', 'localStorage']) Object.defineProperty(context, name, { get() { throw Error(`Unexpected garage storage access: ${name}`); } });
  vm.runInNewContext(worker, context);
  const prefix = `garapp.shell:${encodeURIComponent(new URL(scope).pathname)}:`;
  const cacheName = prefix + release;
  return {
    state, caches, scope, prefix, cacheName,
    async lifecycle(type) {
      const tasks = [];
      listeners.get(type)({ waitUntil(promise) { tasks.push(promise); } });
      await Promise.all(tasks);
    },
    async message(type, source = scope) {
      const tasks = []; let result;
      listeners.get('message')({ data: { type }, source: { url: source }, ports: [{ postMessage(value) { result = value; } }], waitUntil(promise) { tasks.push(promise); } });
      await Promise.all(tasks);
      return result;
    },
    fetch(path, { navigate = false, method = 'GET' } = {}) {
      let response;
      listeners.get('fetch')({ request: { url: new URL(path, scope).href, method, mode: navigate ? 'navigate' : 'cors' }, respondWith(value) { response = value; } });
      return response;
    },
  };
}

test('the committed worker exactly covers the current public application', async () => {
  assert.equal(worker, await renderServiceWorker());
  assert.ok(assets.some((asset) => asset.path === 'index.html'));
  assert.ok(assets.some((asset) => asset.path === 'assets/js/backups.js'));
  assert.ok(assets.some((asset) => asset.path === 'manifest-dev.webmanifest'));
  assert.equal(assets.some((asset) => asset.path === 'sw.js'), false);
  assert.equal(assets.some((asset) => /docs\/examples|test\//.test(asset.path)), false);
});

test('a source change creates a different offline generation without a manual version bump', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'garapp-offline-'));
  try {
    await cp(root, directory, { recursive: true });
    await appendFile(join(directory, 'assets/css/app.css'), '\n/* Synthetic offline-generation test. */\n');
    const changed = await renderServiceWorker(directory);
    assert.notEqual(changed.match(/const RELEASE = '([^']+)'/)[1], release);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('manifest identities, start URLs and icons remain portable and main/dev stay distinct', async () => {
  const main = JSON.parse(await readFile(join(root, 'manifest.webmanifest')));
  const dev = JSON.parse(await readFile(join(root, 'manifest-dev.webmanifest')));
  assert.equal(main.display, 'standalone');
  assert.equal(dev.display, 'standalone');
  assert.notEqual(main.name, dev.name);
  // Without id, the manifest standard uses start_url, including its publication path.
  assert.equal(main.id, undefined); assert.equal(dev.id, undefined);
  assert.equal(new URL(main.start_url, 'https://example.test/Garapp/manifest.webmanifest').href, 'https://example.test/Garapp/');
  assert.equal(new URL(dev.start_url, 'https://example.test/Garapp/dev/manifest-dev.webmanifest').href, 'https://example.test/Garapp/dev/');
  assert.equal(main.scope, './'); assert.equal(dev.scope, './');
  for (const icon of main.icons) {
    const data = await readFile(join(root, icon.src));
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(data.readUInt32BE(16), width); assert.equal(data.readUInt32BE(20), height);
  }
  const apple = await readFile(join(root, 'assets/icons/apple-touch-icon.png'));
  assert.equal(apple.readUInt32BE(16), 180); assert.equal(apple.readUInt32BE(20), 180);
  assert.ok(main.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512'));
});

test('a fully verified install serves the shell and every static asset with the network unavailable', async () => {
  const app = runtime();
  await app.lifecycle('install');
  assert.equal(app.state.skipped, 0);
  await app.lifecycle('activate');
  assert.equal(app.state.claimed, 1);
  assert.equal((await app.message('OFFLINE_STATUS')).ready, true);
  app.state.offline = true;
  assert.equal(await (await app.fetch('./?launch=home', { navigate: true })).text(), bodies.get('index.html').toString());
  for (const asset of assets) {
    const response = await app.fetch(asset.path);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bodies.get(asset.path));
  }
});

test('a stale CDN asset rejects a new generation and leaves the existing cache usable', async () => {
  const app = runtime();
  const previous = await app.caches.open(app.prefix + 'previous');
  await previous.put(app.scope, new Response('Working previous version'));
  app.state.corrupt = 'assets/js/garage.js';
  await assert.rejects(app.lifecycle('install'), /version attendue/);
  assert.equal((await previous.match(app.scope)).status, 200);
  assert.equal(await (await previous.match(app.scope)).text(), 'Working previous version');
  assert.equal((await app.caches.keys()).includes(app.cacheName), false);
  assert.equal(app.state.skipped, 0);
});

test('a quota failure discards only a new incomplete generation', async () => {
  const app = runtime();
  const previous = await app.caches.open(app.prefix + 'previous');
  await previous.put(app.scope, new Response('Working previous version'));
  app.caches.failures.writes = true;
  await assert.rejects(app.lifecycle('install'), /Quota/);
  assert.deepEqual(await app.caches.keys(), [app.prefix + 'previous']);
  assert.equal(await (await previous.match(app.scope)).text(), 'Working previous version');
});

test('activation cleans only generations belonging to the exact Garapp publication path', async () => {
  const app = runtime();
  const keep = ['finapp.assets.v1', 'garapp.shell:%2FGarapp%2F:main-old', 'unrelated-cache'];
  for (const name of [...keep, app.prefix + 'previous']) await app.caches.open(name);
  await app.lifecycle('install'); await app.lifecycle('activate');
  assert.deepEqual((await app.caches.keys()).sort(), [...keep, app.cacheName].sort());
});

test('the main worker does not intercept dev, Finapp, unknown files or garage exports', async () => {
  const app = runtime('https://example.test/Garapp/');
  await app.lifecycle('install');
  for (const path of ['/Garapp/dev/', '/finapp/', '/Garapp/unknown/']) assert.equal(app.fetch(path, { navigate: true }), undefined);
  for (const path of ['/Garapp/garage-prive.json', '/Garapp/sw.js', 'https://other.test/Garapp/']) assert.equal(app.fetch(path), undefined);
  assert.equal(app.fetch('index.html', { method: 'POST' }), undefined);
  assert.equal(app.fetch('assets/js/app.js?unexpected=1'), undefined);
  assert.equal(await app.message('ACTIVATE_UPDATE', 'https://example.test/finapp/'), undefined);
  assert.equal(app.state.skipped, 0);
  await app.message('ACTIVATE_UPDATE');
  assert.equal(app.state.skipped, 1);
});

test('missing cache files are reported and can be repaired without deleting usable entries', async () => {
  const app = runtime();
  await app.lifecycle('install');
  const cache = await app.caches.open(app.cacheName);
  cache.entries.delete(new URL('assets/js/garage.js', app.scope).href);
  assert.equal((await app.message('OFFLINE_STATUS')).ready, false);
  app.caches.failures.writes = true;
  assert.equal((await app.message('PREPARE_OFFLINE')).ok, false);
  assert.ok(await cache.match(new URL('index.html', app.scope).href));
  app.caches.failures.writes = false;
  assert.equal((await app.message('PREPARE_OFFLINE')).ready, true);
  app.state.offline = true;
  assert.equal((await app.fetch('assets/js/garage.js')).status, 200);
});

test('two pages preparing the same missing cache share one verified download', async () => {
  const app = runtime();
  const results = await Promise.all([app.message('PREPARE_OFFLINE'), app.message('PREPARE_OFFLINE')]);
  assert.equal(results.every((result) => result.ready), true);
  assert.equal(app.state.fetches.length, assets.length);
  app.state.offline = true;
  assert.equal((await app.fetch('./', { navigate: true })).status, 200);
});
