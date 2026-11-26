import test from 'node:test';
import assert from 'node:assert/strict';
import { MaintenanceNotifications } from '../public/assets/js/maintenance-notifications.js';

const vehicle = { id: 'fiction', name: 'Véhicule fictif' };
const alert = (extra = {}) => ({ name: 'Contrôle fictif', status: 'soon', token: 'cycle:soon', ...extra });
function fixture() {
  const memory = new Map(), delivered = []; let requested = 0, opened = 0;
  class Notification {
    static permission = 'default';
    static async requestPermission() { requested++; return Notification.permission; }
    constructor(title, options) { this.title = title; this.options = options; delivered.push(this); }
    close() { this.closed = true; }
  }
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const platform = { Notification, isSecureContext: true, focus() {}, navigator: {} };
  const args = { key: 'garage:dev', base: new URL('https://example.test/dev/'), storage, platform, onOpen() { opened++; } };
  return { memory, storage, platform, Notification, delivered, args, create: () => new MaintenanceNotifications(args), requested: () => requested, opened: () => opened };
}

test('delivery never requests permission automatically and stays off until explicit activation', async () => {
  const view = fixture(), notifications = view.create();
  await notifications.notify(vehicle, [alert()]);
  assert.equal(view.requested(), 0); assert.equal(view.delivered.length, 0);
  assert.equal(await notifications.enable(), false); assert.equal(view.requested(), 1);
  view.Notification.permission = 'granted'; await notifications.enable();
  await notifications.notify(vehicle, [alert()]); assert.equal(view.delivered.length, 1);
  view.delivered[0].onclick(); assert.equal(view.opened(), 1); assert.equal(view.delivered[0].closed, true);
});

test('the same alert is deduplicated across reloads but reaching its deadline or a new cycle may notify again', async () => {
  const view = fixture(); view.Notification.permission = 'granted'; const notifications = view.create(); await notifications.enable();
  await notifications.notify(vehicle, [alert()]);
  await view.create().notify(vehicle, [alert()]); assert.equal(view.delivered.length, 1);
  await notifications.notify(vehicle, [alert({ token: 'cycle:due', status: 'due' })]); assert.equal(view.delivered.length, 2);
  await notifications.notify(vehicle, [alert({ token: 'next-cycle:soon' })]); assert.equal(view.delivered.length, 3);
  await notifications.notify({ ...vehicle, id: 'another' }, [alert()]); assert.equal(view.delivered.length, 4);
});

test('disabling notifications and permission revocation stop subsequent deliveries', async () => {
  const view = fixture(); view.Notification.permission = 'granted'; const notifications = view.create(); await notifications.enable();
  notifications.disable(); await notifications.notify(vehicle, [alert()]); assert.equal(view.delivered.length, 0);
  await notifications.enable(); view.Notification.permission = 'denied';
  await notifications.notify(vehicle, [alert()]); assert.equal(view.delivered.length, 0);
  assert.equal(notifications.enabled, false);
});

test('an active service worker handles delivery without constructing desktop-only notifications', async () => {
  const view = fixture(); view.Notification.permission = 'granted'; const workerMessages = [];
  view.platform.navigator.serviceWorker = { async getRegistration() { return { active: true, async showNotification(title, options) { workerMessages.push({ title, options }); } }; } };
  const notifications = view.create(); await notifications.enable(); await notifications.notify(vehicle, [alert(), alert({ token: 'another', name: 'Autre contrôle fictif' })]);
  assert.equal(workerMessages.length, 1); assert.equal(view.delivered.length, 0);
  assert.match(workerMessages[0].title, /2 alertes/); assert.equal(workerMessages[0].options.data.type, 'GARAPP_MAINTENANCE');
});

test('failed deliveries are not marked sent and storage failure still allows session deduplication', async () => {
  const view = fixture(); view.Notification.permission = 'granted'; let failed = true;
  view.platform.navigator.serviceWorker = { async getRegistration() { return { active: true, async showNotification() { if (failed) throw Error('Unavailable'); } }; } };
  const notifications = view.create(); await notifications.enable(); await notifications.notify(vehicle, [alert()]);
  assert.ok(notifications.problem); assert.equal(notifications.state.sent.length, 0);
  failed = false; await notifications.notify(vehicle, [alert()]); assert.equal(notifications.state.sent.length, 1);
  view.storage.getItem = () => { throw Error('Storage disabled'); }; view.storage.setItem = view.storage.getItem;
  const session = view.create(); await session.enable(); await session.notify(vehicle, [alert()]); await session.notify(vehicle, [alert()]);
  assert.equal(session.state.sent.length, 1);
});

test('a second tab shares the latest ledger inside the deployment lock', async () => {
  const view = fixture(); view.Notification.permission = 'granted'; let queue = Promise.resolve();
  view.platform.navigator.locks = { request(key, callback) { const task = queue.then(callback); queue = task; return task; } };
  const first = view.create(), second = view.create(); await first.enable();
  await Promise.all([first.notify(vehicle, [alert()]), second.notify(vehicle, [alert()])]);
  assert.equal(view.delivered.length, 1);
});

test('development and production notification preferences remain isolated and unsupported contexts fail quietly', async () => {
  const view = fixture(); view.Notification.permission = 'granted'; const notifications = view.create(); await notifications.enable();
  const production = new MaintenanceNotifications({ ...view.args, key: 'garage:main' });
  assert.equal(production.enabled, false);
  view.platform.isSecureContext = false; assert.equal(notifications.supported, false);
  await notifications.notify(vehicle, [alert()]); assert.equal(view.delivered.length, 0);
});
