import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { DriveAuthorization, validClientId } from '../public/assets/js/drive-auth.js';
import { DRIVE_SCOPE } from '../public/assets/js/drive-format.js';

const source = await readFile(new URL('../public/assets/js/drive-panel.js', import.meta.url), 'utf8');
const clientId = '1234567890-synthetic-client.apps.googleusercontent.com';
const oldClientId = '1234567890-synthetic-previous-client.apps.googleusercontent.com';

class Element extends EventTarget {
  constructor() { super(); this.hidden = false; this.disabled = false; this.textContent = ''; this.value = ''; this.dataset = {}; }
  replaceChildren() {}
  querySelectorAll() { return []; }
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
  class Engine {
    constructor() { this.state = { auto: false }; this.graph = { nodes: [], heads: [] }; this.api = null; this.busy = false; this.status = ''; }
    async restore() {}
  }
  const context = {
    window, document, location: { origin: 'https://example.test' }, Date, URL,
    localStorage: { getItem() { calls.localReads++; return localClientId; }, setItem(_key, value) { localClientId = value; }, removeItem() { localClientId = ''; } },
    DRIVE_CLIENT_IDS: { dev: appClientId, main: appClientId }, validClientId, DriveAuthorization,
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
