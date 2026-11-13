import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCloudflare } from '../scripts/prepare_cloudflare.mjs';
import { SECTIONS } from '../public/assets/js/navigation.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const templates = new URL('../scripts/legacy-pages/', import.meta.url);
const redirect = await readFile(new URL('redirect.js', templates), 'utf8');
const retirement = await readFile(new URL('sw.js', templates), 'utf8');
const destination = 'https://garapp.siniverse.cc/';

function redirected(href) {
  const calls = [];
  const link = { href: destination };
  const context = { URL, location: { href, replace(url) { calls.push(url); } }, document: { getElementById() { return link; } } };
  for (const name of ['localStorage', 'indexedDB', 'fetch']) Object.defineProperty(context, name, { get() { throw Error(`Unexpected access to ${name}`); } });
  vm.runInNewContext(redirect, context);
  return { calls, link };
}

test('main and dev historical entry points redirect to the fixed production hostname', () => {
  for (const path of ['/Garapp', '/Garapp/', '/Garapp/index.html', '/Garapp/dev', '/Garapp/dev/', '/Garapp/dev/index.html']) {
    for (const section of ['', ...SECTIONS]) {
      const expected = destination + (section ? `#${section}` : '');
      const result = redirected(`https://sinikebe.github.io${path}?next=https://other.test/&vehicle=private${section ? `#${section}` : ''}`);
      assert.deepEqual(result.calls, [expected]);
      assert.equal(result.link.href, expected);
    }
  }
  for (const hash of ['#record=private', '#https://other.test/', '#statistiques?record=private']) {
    assert.deepEqual(redirected(`https://sinikebe.github.io/Garapp/${hash}`).calls, [destination]);
  }
});

test('the target, recovery pages and other applications never redirect again', () => {
  for (const href of [destination, destination + '#garage', 'https://dev.garapp.siniverse.cc/',
    'https://sinikebe.github.io/finapp/', 'https://sinikebe.github.io/Garapp/recovery.html',
    'https://sinikebe.github.io/Garapp/dev/recovery.html', 'https://sinikebe.github.io/Garapp/unknown/',
    'https://other.test/Garapp/', 'http://sinikebe.github.io/Garapp/']) {
    assert.deepEqual(redirected(href).calls, [], href);
  }
});

test('the HTML link works without JavaScript and retains access to local export tools', async () => {
  const html = await readFile(new URL('index.html', templates), 'utf8');
  assert.match(html, /id="garapp-destination" href="https:\/\/garapp\.siniverse\.cc\/" rel="noreferrer"/);
  assert.match(html, /href="\.\/recovery\.html"/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
});

function retired(scope) {
  const events = new Map();
  const actions = [];
  const context = { self: {
    registration: { scope, async unregister() { actions.push('unregister-self'); } },
    clients: { async claim() { actions.push('claim'); }, navigate() { throw Error('Must not interrupt an open editor.'); } },
    async skipWaiting() { actions.push('skipWaiting'); },
    addEventListener(name, fn) { events.set(name, fn); },
  } };
  for (const name of ['caches', 'indexedDB', 'localStorage', 'fetch']) Object.defineProperty(context, name, { get() { throw Error(`Retirement must preserve ${name}`); } });
  vm.runInNewContext(retirement, context);
  return { events, actions, async run(type) { const jobs = []; events.get(type)?.({ waitUntil(promise) { jobs.push(promise); } }); await Promise.all(jobs); } };
}

test('the transition takes over and unregisters only its main or dev worker without touching storage', async () => {
  for (const scope of ['https://sinikebe.github.io/Garapp/', 'https://sinikebe.github.io/Garapp/dev/']) {
    const worker = retired(scope);
    await worker.run('install'); await worker.run('activate');
    assert.deepEqual(worker.actions, ['skipWaiting', 'claim', 'unregister-self']);
    assert.equal(worker.events.has('fetch'), false, 'navigation must reach the network after transition');
  }
  for (const scope of ['https://sinikebe.github.io/', 'https://sinikebe.github.io/finapp/', destination, 'https://other.test/Garapp/']) {
    const worker = retired(scope);
    await worker.run('install'); await worker.run('activate');
    assert.deepEqual(worker.actions, []);
    assert.equal(worker.events.size, 0);
  }
});

test('the Cloudflare package keeps the application and its original offline worker', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'garapp-pages-isolation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'worker');
  await prepareCloudflare({ source: root, output, branch: 'main', domain: 'siniverse.cc' });
  const html = await readFile(join(output, 'index.html'), 'utf8');
  const worker = await readFile(join(output, 'sw.js'), 'utf8');
  assert.match(html, /assets\/js\/app\.js/);
  assert.doesNotMatch(html, /redirect\.js|Garapp a déménagé/);
  assert.match(worker, /const ASSETS =/);
  assert.doesNotMatch(worker, /registration\.unregister/);
});
