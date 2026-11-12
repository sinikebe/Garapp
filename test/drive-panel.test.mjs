import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { DriveAuthorization, validClientId } from '../public/assets/js/drive-auth.js';
import { consumeWorkerFailure } from '../public/assets/js/drive-worker-auth.js';
import { DRIVE_SCOPE } from '../public/assets/js/drive-format.js';
import { MergeComparisonView } from '../public/assets/js/backup-merge-view.js';

const source = await readFile(new URL('../public/assets/js/drive-panel.js', import.meta.url), 'utf8');
const clientId = '1234567890-synthetic-client.apps.googleusercontent.com';
const oldClientId = '1234567890-synthetic-previous-client.apps.googleusercontent.com';

class Element extends EventTarget {
  constructor(tag = 'div') { super(); this.tag = tag; this.children = []; this.hidden = false; this.disabled = false; this.textContent = ''; this.value = ''; this.dataset = {}; this.attributes = {}; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelectorAll(selector) { return this.children.flatMap((child) => [...(selector.split(',').map((value) => value.trim()).includes(child.tag) ? [child] : []), ...child.querySelectorAll(selector)]); }
}

async function frontend({ appClientId = clientId, localClientId = '', connectedBefore = false, development = true, loader, restoreGate, origin = 'https://example.test', workerClass, search = '', hash = '' } = {}) {
  const elements = new Map(), calls = { loads: 0, popups: 0, connected: 0, localReads: 0, opened: 0 };
  const path = development ? '/Garapp/dev/' : '/Garapp/';
  const key = `garapp.workspace.v1:${path}`;
  const storage = new Map();
  if (localClientId) storage.set(key.replace('workspace', 'drive-client'), localClientId);
  if (connectedBefore) storage.set(key.replace('workspace', 'drive-connected-before'), '1');
  const get = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const oauth = {
    initTokenClient(options) { calls.options = options; return { requestAccessToken() { calls.popups++; } }; },
    hasGrantedAllScopes(response, scope) { return response.scope === scope; },
  };
  const window = new EventTarget(), document = new EventTarget();
  document.getElementById = get;
  document.createElement = (tag) => new Element(tag);
  const location = { origin, pathname: path, search, hash, href: `${origin}${path}${search}${hash}` };
  const history = { state: { route: 'synthetic' }, replaceState(state, _title, url) { calls.replaced = { state, url }; } };
  class Engine {
    constructor() { this.state = { auto: false }; this.graph = { nodes: [], heads: [] }; this.api = null; this.busy = false; this.status = ''; }
    async restore() { if (restoreGate) await restoreGate; }
    disconnect() { this.api = null; }
  }
  const context = {
    window, document, location, history, Date, URL, WorkerDriveAuthorization: workerClass, consumeWorkerFailure,
    localStorage: { getItem(name) { if (name.includes('drive-client')) calls.localReads++; return storage.get(name) ?? null; }, setItem(name, value) { storage.set(name, value); }, removeItem(name) { storage.delete(name); } },
    DRIVE_CLIENT_IDS: { dev: appClientId, main: appClientId }, validClientId, DriveAuthorization, MergeComparisonView,
    BackupSettings: class {}, DriveSync: Engine, driveNamespace: async () => 'synthetic-namespace',
    async loadGoogleIdentity() { calls.loads++; return loader ? loader(oauth) : oauth; },
    setInterval() { return 1; }, setTimeout() { return 1; }, clearTimeout() {},
  };
  vm.runInNewContext(source.replace(/^import .*\n/gm, '').replace('export class DrivePanel', 'class DrivePanel') + '\nglobalThis.TestDrivePanel = DrivePanel;', context);
  const panel = new context.TestDrivePanel({ key, base: `${origin}${path}`, development, getGarage: () => ({ vehicles: [] }), canSync: () => true, canApply: () => true, openBackups: () => { calls.opened++; } });
  panel.onConnected = () => { calls.connected++; panel.engine.api = {}; panel.render(); };
  const ready = panel.restore();
  if (!restoreGate) await ready;
  return { panel, calls, storage, ready, get, click(id) { get(id).dispatchEvent(new Event('click')); } };
}

test('clicking the profile while Drive settings restore waits for readiness, then prepares OAuth', async () => {
  let finishRestore;
  const restoreGate = new Promise((resolve) => { finishRestore = resolve; });
  const app = await frontend({ restoreGate });
  assert.equal(app.panel.initialized, false);
  app.click('drive-profile');
  assert.equal(app.calls.opened, 1); assert.equal(app.calls.loads, 0); assert.equal(app.calls.popups, 0);
  finishRestore(); await app.ready;
  await app.panel.prepare();
  assert.equal(app.calls.loads, 1); assert.equal(app.calls.popups, 0);
  app.click('drive-profile');
  assert.equal(app.calls.popups, 1);
});

test('the profile opens backups and reconnects from a click without storing the access token', async () => {
  const app = await frontend();
  assert.equal(app.get('drive-profile').hidden, false);
  assert.equal(app.get('drive-profile').dataset.state, 'disconnected');
  assert.equal(app.get('drive-profile-badge').textContent, '!');
  assert.match(app.get('drive-profile').attributes['aria-label'], /déconnecté/);
  app.click('drive-profile');
  assert.equal(app.calls.opened, 1); assert.equal(app.calls.popups, 0);
  await app.panel.prepare();
  app.click('drive-profile');
  assert.equal(app.calls.opened, 2); assert.equal(app.calls.popups, 1);
  app.calls.options.callback({ access_token: 'synthetic-memory-token', scope: DRIVE_SCOPE, expires_in: 3600 });
  assert.equal(app.storage.get(app.panel.previousConnectionKey), '1');
  assert.equal([...app.storage.values()].includes('synthetic-memory-token'), false);
  assert.equal(app.get('drive-profile').dataset.state, 'connected');
  assert.equal(app.get('drive-profile-badge').textContent, '✓');
  assert.equal(app.get('drive-account').hidden, false);
  const api = { async getAccount() { return { name: 'Compte fictif', email: 'example@example.test' }; } };
  app.panel.engine.api = api;
  await app.panel.loadAccount(api);
  assert.equal(app.get('drive-profile-name').textContent, 'Compte fictif');
  assert.match(app.get('drive-account').textContent, /example@example\.test/);
  app.panel.disconnect();
  assert.equal(app.get('drive-profile').dataset.state, 'disconnected');
  assert.equal(app.get('drive-profile-badge').textContent, '!');
  assert.equal(app.get('drive-account').hidden, true);
  assert.equal(app.storage.has(app.panel.previousConnectionKey), false);
});

test('a previous connection only preloads Google and never opens its chooser without a click', async () => {
  const app = await frontend({ connectedBefore: true, development: false });
  await app.panel.prepare();
  assert.equal(app.calls.loads, 1);
  assert.equal(app.calls.popups, 0);
  app.click('drive-profile');
  assert.equal(app.calls.popups, 1);
});

test('the production hostname resumes its Worker session without a Google popup', async () => {
  const redirects = [];
  class WorkerAuth {
    constructor() { this.kind = 'worker'; this.connected = true; this.pending = false; }
    async restore() { return true; }
    connect(url) { redirects.push(url); }
  }
  const app = await frontend({ development: false, origin: 'https://garapp.siniverse.cc', workerClass: WorkerAuth });
  assert.equal(app.panel.useWorker, true);
  assert.equal(app.calls.connected, 1);
  assert.equal(app.calls.loads, 0);
  assert.equal(app.calls.popups, 0);
  assert.equal(app.get('drive-profile').dataset.state, 'connected');
  assert.deepEqual(redirects, []);
});

test('a signed-out Worker needs a click, and an unavailable Worker keeps the manual flow', async () => {
  const redirects = [];
  class SignedOutAuth {
    constructor() { this.kind = 'worker'; this.connected = false; this.pending = false; }
    async restore() { return false; }
    connect(url) { redirects.push(url); }
  }
  const app = await frontend({ development: false, origin: 'https://garapp.siniverse.cc', workerClass: SignedOutAuth });
  assert.equal(app.calls.loads, 0);
  assert.equal(app.calls.popups, 0);
  app.click('drive-connect');
  assert.deepEqual(redirects, ['https://garapp.siniverse.cc/Garapp/']);

  class OfflineWorker { constructor() { this.kind = 'worker'; } async restore() { throw Error('Unreachable'); } }
  const fallback = await frontend({ development: false, origin: 'https://garapp.siniverse.cc', workerClass: OfflineWorker });
  await fallback.panel.prepare();
  assert.equal(fallback.panel.workerUnavailable, true);
  assert.equal(fallback.calls.loads, 1);
  assert.equal(fallback.calls.popups, 0);
  fallback.click('drive-connect');
  assert.equal(fallback.calls.popups, 1);
});

test('an OAuth cancellation clears the Worker marker, preserves the route and shows a neutral message', async () => {
  class SignedOutAuth {
    constructor() { this.kind = 'worker'; this.connected = false; this.pending = false; }
    async restore() { return false; }
  }
  const app = await frontend({ development: false, origin: 'https://garapp.siniverse.cc', workerClass: SignedOutAuth,
    search: '?drive_auth=failed&view=synthetic', hash: '#garage' });
  assert.equal(app.calls.replaced.url, '/Garapp/?view=synthetic#garage');
  assert.equal(app.calls.replaced.state.route, 'synthetic');
  assert.equal(app.get('drive-status').textContent, 'Connexion Google non terminée.');
  assert.equal(app.calls.popups, 0);
});

test('opening backups prepares Google without a popup; one connection click requests OAuth synchronously', async () => {
  const app = await frontend();
  assert.equal(app.calls.loads, 0); assert.equal(app.calls.popups, 0);
  assert.equal(app.get('drive-connect').disabled, true);
  await app.panel.prepare(); await app.panel.prepare();
  assert.equal(app.calls.loads, 1); assert.equal(app.calls.popups, 0);
  assert.equal(app.get('drive-connect').disabled, false);
  assert.equal(app.get('drive-connect').textContent, 'Se connecter à Google Drive');
  app.click('drive-connect');
  assert.equal(app.calls.popups, 1); assert.equal(app.get('drive-connect').disabled, true);
  app.calls.options.callback({ access_token: 'synthetic-memory-token', scope: DRIVE_SCOPE, expires_in: 3600 });
  assert.equal(app.calls.connected, 1); assert.equal(app.get('drive-connect').hidden, true);
  app.panel.auth.clearToken(); app.panel.render();
  assert.equal(app.get('drive-connect').disabled, false);
  app.click('drive-connect'); assert.equal(app.calls.popups, 2); assert.equal(app.calls.loads, 1);
});

test('the application client replaces old device overrides and hides technical configuration', async () => {
  const app = await frontend({ localClientId: oldClientId });
  assert.equal(app.panel.clientId, clientId); assert.equal(app.calls.localReads, 0);
  assert.equal(app.get('drive-config').hidden, true);
  app.get('drive-client-id').value = oldClientId;
  await app.panel.configure(); assert.equal(app.panel.clientId, clientId);
});

test('an unconfigured application opens no Google connection and the dev fallback prepares automatically after configuration', async () => {
  const app = await frontend({ appClientId: '' });
  assert.equal(app.get('drive-profile').hidden, true);
  await app.panel.prepare();
  assert.equal(app.calls.loads, 0); assert.equal(app.get('drive-connect').disabled, true);
  assert.equal(app.get('drive-config').hidden, false);
  app.get('drive-client-id').value = clientId;
  await app.panel.configure();
  assert.equal(app.calls.loads, 1); assert.equal(app.calls.popups, 0);
  assert.equal(app.get('drive-connect').disabled, false);
  assert.equal(app.get('drive-profile').hidden, false);
  app.click('drive-connect'); assert.equal(app.calls.popups, 1);
});

test('a failed SDK load can be retried without ever opening an unsolicited login popup', async () => {
  let failed = true;
  const app = await frontend({ loader(oauth) { if (failed) throw Error('Réseau fictif indisponible'); return oauth; } });
  await app.panel.prepare();
  assert.match(app.get('drive-status').textContent, /indisponible/);
  assert.equal(app.get('drive-connect').textContent, 'Réessayer le chargement Google');
  assert.equal(app.get('drive-connect').disabled, false); assert.equal(app.calls.popups, 0);
  failed = false; await app.panel.prepare();
  assert.equal(app.calls.loads, 2); assert.equal(app.calls.popups, 0);
  app.click('drive-connect'); assert.equal(app.calls.popups, 1);
});

const savedVersion = (index, hash = 'same-content') => ({
  id: `file-${index}`, revision: `revision-${index}`, wire: `wire-${index}`, hash,
  at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(), counts: [1, 2, 3, 0, 4], size: 1024,
});

async function connectedFrontend() {
  const app = await frontend();
  await app.panel.prepare(); app.click('drive-connect');
  app.calls.options.callback({ access_token: 'synthetic-memory-token', scope: DRIVE_SCOPE, expires_in: 3600 });
  return app;
}

test('Drive setup is explicit and collapses after a binding without hiding a later manual opening', async () => {
  const app = await connectedFrontend();
  assert.equal(app.get('drive-folder-settings').open, true);
  assert.equal(app.get('drive-existing-folders').hidden, true);
  assert.equal(app.get('drive-binding').hidden, true);
  app.panel.folders = [{ id: 'folder', name: 'Garage fictif' }];
  app.panel.engine.state.binding = { id: 'folder', name: 'Garage fictif' };
  app.panel.render();
  assert.equal(app.get('drive-existing-folders').hidden, false);
  assert.equal(app.get('drive-binding').hidden, false);
  assert.equal(app.get('drive-folder-settings').open, false);
  app.get('drive-folder-settings').open = true;
  app.panel.render();
  assert.equal(app.get('drive-folder-settings').open, true);
  assert.match(app.get('drive-folder-settings-label').textContent, /Changer/);
});

test('a first Drive binding exposes a comparison outside the collapsed history', async () => {
  const app = await connectedFrontend(), version = savedVersion(0);
  app.panel.engine.state.binding = { id: 'folder', name: 'Garage fictif' };
  app.panel.engine.graph = { nodes: [version], heads: [version] };
  app.panel.render();
  assert.equal(app.get('drive-review').hidden, false);
  assert.equal(app.get('drive-review-versions').children.length, 1);
  assert.notEqual(app.get('drive-history').open, true);
  let selected;
  app.panel.compare = async (revision) => { selected = revision; };
  app.get('drive-review-versions').querySelectorAll('button')[0].dispatchEvent(new Event('click'));
  assert.equal(selected, version.revision);
  app.panel.engine.state.baseline = { hash: version.hash };
  app.panel.render();
  assert.equal(app.get('drive-review').hidden, true);
  assert.equal(app.get('drive-versions').children.length, 1);
  const newer = savedVersion(1, 'new-content');
  app.panel.engine.graph = { nodes: [version, newer], heads: [newer] };
  app.panel.render();
  assert.equal(app.get('drive-review').hidden, false);
  assert.equal(app.get('drive-review-versions').children.length, 1);
  app.get('drive-review-versions').querySelectorAll('button')[0].dispatchEvent(new Event('click'));
  assert.equal(selected, newer.revision);
});

test('older concurrent Drive heads stay actionable and busy states lock both comparison lists', async () => {
  const app = await connectedFrontend();
  const nodes = Array.from({ length: 25 }, (_, index) => savedVersion(index, `hash-${index}`));
  app.panel.engine.state.binding = { id: 'folder', name: 'Garage fictif' };
  app.panel.engine.state.baseline = { hash: nodes.at(-1).hash };
  app.panel.engine.graph = { nodes, heads: [nodes[0], nodes.at(-1)] };
  app.panel.render();
  assert.equal(app.get('drive-review').hidden, false);
  assert.equal(app.get('drive-review-versions').children.length, 2);
  assert.equal(app.get('drive-versions').children.length, 21);
  assert.equal(app.get('drive-versions').children.some((row) => row.children[0].textContent.includes('revision-')), false);
  app.panel.engine.busy = true; app.panel.render();
  for (const id of ['drive-review-versions', 'drive-versions']) assert.ok(app.get(id).querySelectorAll('button').every((button) => button.disabled));
  app.panel.engine.error = 'Erreur de transfert fictive'; app.panel.render();
  assert.equal(app.get('drive-status').textContent, 'Erreur de transfert fictive');
  app.panel.auth.clearToken(); app.panel.render();
  assert.equal(app.get('drive-review').hidden, true);
  assert.equal(app.get('drive-review-versions').children.length, 0);
  assert.equal(app.get('drive-versions').children.length, 0);
});
