import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { DriveAuthorization, validClientId } from '../public/assets/js/drive-auth.js';
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

async function frontend({ appClientId = clientId, localClientId = '', loader } = {}) {
  const elements = new Map(), calls = { loads: 0, popups: 0, connected: 0, localReads: 0 };
  const get = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const oauth = {
    initTokenClient(options) { calls.options = options; return { requestAccessToken() { calls.popups++; } }; },
    hasGrantedAllScopes(response, scope) { return response.scope === scope; },
  };
  const window = new EventTarget(), document = new EventTarget();
  document.getElementById = get;
  document.createElement = (tag) => new Element(tag);
  class Engine {
    constructor() { this.state = { auto: false }; this.graph = { nodes: [], heads: [] }; this.api = null; this.busy = false; this.status = ''; }
    async restore() {}
  }
  const context = {
    window, document, location: { origin: 'https://example.test' }, Date, URL,
    localStorage: { getItem() { calls.localReads++; return localClientId; }, setItem(_key, value) { localClientId = value; }, removeItem() { localClientId = ''; } },
    DRIVE_CLIENT_IDS: { dev: appClientId, main: appClientId }, validClientId, DriveAuthorization, MergeComparisonView,
    BackupSettings: class {}, DriveSync: Engine, driveNamespace: async () => 'synthetic-namespace',
    async loadGoogleIdentity() { calls.loads++; return loader ? loader(oauth) : oauth; },
    setInterval() { return 1; }, setTimeout() { return 1; }, clearTimeout() {},
  };
  vm.runInNewContext(source.replace(/^import .*\n/gm, '').replace('export class DrivePanel', 'class DrivePanel') + '\nglobalThis.TestDrivePanel = DrivePanel;', context);
  const panel = new context.TestDrivePanel({ key: 'garapp.workspace.v1:/Garapp/dev/', base: 'https://example.test/Garapp/dev/', development: true, getGarage: () => ({ vehicles: [] }), canSync: () => true, canApply: () => true });
  panel.onConnected = () => { calls.connected++; panel.engine.api = {}; panel.render(); };
  await panel.restore();
  return { panel, calls, get, click(id) { get(id).dispatchEvent(new Event('click')); } };
}

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
  await app.panel.prepare();
  assert.equal(app.calls.loads, 0); assert.equal(app.get('drive-connect').disabled, true);
  assert.equal(app.get('drive-config').hidden, false);
  app.get('drive-client-id').value = clientId;
  await app.panel.configure();
  assert.equal(app.calls.loads, 1); assert.equal(app.calls.popups, 0);
  assert.equal(app.get('drive-connect').disabled, false);
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
