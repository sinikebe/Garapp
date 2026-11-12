import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MessageChannel } from 'node:worker_threads';
import { deploymentFor } from '../public/assets/js/deployment-config.js';

const source = await readFile(new URL('../public/assets/js/pwa.js', import.meta.url), 'utf8');
const flush = async () => { for (let index = 0; index < 8; index++) await new Promise(setImmediate); };

class Element extends EventTarget {
  constructor() { super(); this.hidden = false; this.disabled = false; this.textContent = ''; this.open = false; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function frontend({ waiting = true, controlled = true, ready = true, baseUrl = 'https://example.test/Garapp/dev/', environment = 'legacy' } = {}) {
  const elements = new Map();
  const get = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const window = new EventTarget();
  Object.assign(window, { isSecureContext: true, matchMedia: () => ({ matches: false, addEventListener() {} }) });
  const document = new EventTarget();
  Object.assign(document, {
    getElementById: get,
    documentElement: { dataset: ready ? { garappReady: 'true' } : {} },
    querySelectorAll: () => [], querySelector: () => ({}),
  });
  const serviceWorker = new EventTarget();
  const makeWorker = (state) => Object.assign(new EventTarget(), {
    state, scriptURL: `${baseUrl}sw.js`, messages: [],
    postMessage(message, ports) {
      this.messages.push(message);
      if (ports?.[0]) { ports[0].postMessage({ ok: true, ready: true, release: 'synthetic-release' }); ports[0].close(); }
    },
  });
  const active = makeWorker('activated'), next = makeWorker('installed');
  const registration = Object.assign(new EventTarget(), { active, waiting: waiting ? next : null, installing: null, async update() {} });
  serviceWorker.controller = controlled ? active : null;
  const calls = { registrations: [], reloads: 0 };
  serviceWorker.register = async (url, options) => { calls.registrations.push({ url: String(url), ...options }); return registration; };
  const navigator = { serviceWorker, onLine: true };
  const timers = new Set();
  const context = {
    window, document, navigator, URL, Event, MessageChannel,
    deploymentFor: (base) => deploymentFor(base, { environment }),
    location: { reload() { calls.reloads++; } },
    setTimeout(callback, delay) { const timer = setTimeout(callback, delay); timer.unref(); timers.add(timer); return timer; },
    clearTimeout(timer) { clearTimeout(timer); timers.delete(timer); },
  };
  for (const name of ['indexedDB', 'localStorage']) Object.defineProperty(context, name, { get() { throw Error('The installation interface must not change garage storage.'); } });
  vm.runInNewContext(source.replace("import { deploymentFor } from './deployment-config.js';", '')
    .replace('import.meta.url', JSON.stringify(`${baseUrl}assets/js/pwa.js`)), context);
  return {
    window, document, get, navigator, registration, active, next, calls,
    click(id) { get(id).dispatchEvent(new Event('click')); },
    activate() { registration.active = next; registration.waiting = null; serviceWorker.controller = next; serviceWorker.dispatchEvent(new Event('controllerchange')); },
    close() { for (const timer of timers) clearTimeout(timer); },
  };
}

test('the installation interface registers only its own publication scope and selects the dev manifest', async (t) => {
  const app = frontend({ waiting: false }); t.after(() => app.close());
  await flush();
  assert.equal(app.calls.registrations.length, 1);
  assert.equal(app.calls.registrations[0].url, 'https://example.test/Garapp/dev/sw.js');
  assert.equal(app.calls.registrations[0].scope, 'https://example.test/Garapp/dev/');
  assert.equal(app.calls.registrations[0].updateViaCache, 'none');
  assert.equal(app.get('app-manifest').href, 'https://example.test/Garapp/dev/manifest-dev.webmanifest');
  assert.match(app.get('pwa-offline').textContent, /prêt à être rouvert sans connexion/);
  assert.equal(app.get('pwa-update-banner').hidden, true);
});

test('a dev branch served at a distinct hostname root keeps its dev manifest and worker scope', async (t) => {
  const app = frontend({ baseUrl: 'https://dev.garapp.example.test/', environment: 'dev', waiting: false });
  t.after(() => app.close()); await flush();
  assert.equal(app.calls.registrations[0].url, 'https://dev.garapp.example.test/sw.js');
  assert.equal(app.calls.registrations[0].scope, 'https://dev.garapp.example.test/');
  assert.equal(app.get('app-manifest').href, 'https://dev.garapp.example.test/manifest-dev.webmanifest');
});

test('an update blocked by a garage edit or pending save neither activates nor reloads', async (t) => {
  const app = frontend(); t.after(() => app.close()); await flush();
  app.document.addEventListener('garapp:before-update', (event) => event.preventDefault());
  app.click('pwa-update');
  assert.equal(app.next.messages.filter((message) => message.type === 'ACTIVATE_UPDATE').length, 0);
  assert.equal(app.calls.reloads, 0);
  assert.match(app.get('pwa-update-message').textContent, /saisie en cours/);
});

test('an accepted update reloads only when the new worker takes control', async (t) => {
  const app = frontend(); t.after(() => app.close()); await flush();
  app.click('pwa-update');
  assert.equal(app.next.messages.filter((message) => message.type === 'ACTIVATE_UPDATE').length, 1);
  assert.equal(app.calls.reloads, 0);
  app.activate();
  assert.equal(app.calls.reloads, 1);
});

test('a form opened during activation prevents the final reload and can be completed first', async (t) => {
  const app = frontend(); t.after(() => app.close()); await flush();
  let editing = false;
  app.document.addEventListener('garapp:before-update', (event) => { if (editing) event.preventDefault(); });
  app.click('pwa-update');
  editing = true; app.activate();
  assert.equal(app.calls.reloads, 0);
  assert.match(app.get('pwa-update-message').textContent, /saisie en cours/);
  editing = false; app.click('pwa-update');
  assert.equal(app.calls.reloads, 1);
});

test('an update activated in another tab does not force a reload in this page', async (t) => {
  const app = frontend(); t.after(() => app.close()); await flush();
  app.activate();
  assert.equal(app.calls.reloads, 0);
  assert.equal(app.get('pwa-update-banner').hidden, false);
  assert.equal(app.get('pwa-update').textContent, 'Recharger l’application');
});

test('first activation prepares offline access without an unnecessary update banner or reload', async (t) => {
  const app = frontend({ waiting: false, controlled: false }); t.after(() => app.close()); await flush();
  app.activate(); await flush();
  assert.equal(app.calls.reloads, 0);
  assert.equal(app.get('pwa-update-banner').hidden, true);
});

test('loading garage data must finish before an update is allowed', async (t) => {
  const app = frontend({ ready: false }); t.after(() => app.close()); await flush();
  app.click('pwa-update');
  assert.equal(app.calls.reloads, 0);
  assert.equal(app.next.messages.length, 0);
});

test('native installation requires a user action and actual confirmation changes the installed state', async (t) => {
  const app = frontend({ waiting: false }); t.after(() => app.close()); await flush();
  let prompts = 0;
  const offer = new Event('beforeinstallprompt', { cancelable: true });
  offer.prompt = async () => { prompts++; };
  offer.userChoice = Promise.resolve({ outcome: 'accepted' });
  app.window.dispatchEvent(offer);
  assert.equal(offer.defaultPrevented, true);
  assert.equal(prompts, 0);
  assert.equal(app.get('pwa-install').hidden, false);
  app.click('pwa-install'); await flush();
  assert.equal(prompts, 1);
  assert.equal(app.get('pwa-installed').hidden, true);
  app.window.dispatchEvent(new Event('appinstalled'));
  assert.equal(app.get('pwa-installed').hidden, false);
  assert.equal(app.get('pwa-open').textContent, 'Application et mises à jour');
});
