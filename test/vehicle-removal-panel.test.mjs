import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleRemovalPanel } from '../public/assets/js/vehicle-removal-panel.js';

class Element extends EventTarget {
  constructor() { super(); this.disabled = false; this.hidden = false; this.textContent = ''; this.focused = false; }
  focus() { this.focused = true; }
}

function frontend(remove = async () => {}) {
  let garage = { vehicles: [{ id: 'first', name: 'Véhicule de démonstration' }, { id: 'second', name: '<img src=x onerror=alert(1)>' }] };
  const dialog = new Element();
  dialog.id = 'vehicle-delete-dialog'; dialog.open = false;
  const form = new Element(), description = new Element(), error = new Element();
  const close = new Element(), cancel = new Element(), confirm = new Element();
  const buttons = [close, cancel, confirm];
  dialog.querySelector = (selector) => ({ form, '#vehicle-delete-description': description, '#vehicle-delete-error': error, '#vehicle-delete-cancel': cancel })[selector];
  dialog.querySelectorAll = (selector) => selector === 'button' ? buttons : [];
  dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event('close')); };
  const calls = { opened: [], removed: 0 };
  const panel = new VehicleRemovalPanel({ dialog, getGarage: () => garage, remove,
    showDialog(id) { calls.opened.push(id); dialog.open = true; },
    onRemoved() { calls.removed++; assert.equal(dialog.open, false); },
  });
  return { panel, dialog, form, description, error, buttons, cancel, calls, getGarage: () => garage, setGarage: (value) => { garage = value; } };
}

test('opening a confirmation captures the named vehicle and renders its name only as text', () => {
  const app = frontend();
  app.panel.open('second');
  assert.equal(app.dialog.open, true);
  assert.equal(app.cancel.focused, true);
  assert.equal(app.description.textContent, '« <img src=x onerror=alert(1)> » sera retiré du garage avec ses interventions, composants, assurances et documents.');
  assert.equal(Object.hasOwn(app.description, 'innerHTML'), false);
  assert.equal(app.panel.pending.garage, app.getGarage());
  assert.equal(app.panel.pending.vehicleId, 'second');
  assert.equal(app.error.hidden, true);
  assert.equal(app.calls.removed, 0);
});

test('missing vehicles never open a confirmation or request removal', async () => {
  const app = frontend(() => assert.fail('No vehicle was selected'));
  app.panel.open('missing');
  await app.panel.confirm();
  assert.equal(app.dialog.open, false);
  assert.deepEqual(app.calls.opened, []);
});

test('confirming uses the reviewed garage and vehicle, and waits for persistence before closing', async () => {
  let finish, received;
  const app = frontend((garage, vehicleId) => { received = { garage, vehicleId }; return new Promise((resolve) => { finish = resolve; }); });
  const reviewed = app.getGarage();
  app.panel.open('first');
  app.setGarage({ vehicles: [{ id: 'replacement', name: 'Autre garage fictif' }] });
  const pending = app.panel.confirm();
  assert.equal(received.garage, reviewed);
  assert.equal(received.vehicleId, 'first');
  assert.equal(app.dialog.open, true);
  assert.equal(app.calls.removed, 0);
  finish(); await pending;
  assert.equal(app.dialog.open, false);
  assert.equal(app.panel.pending, null);
  assert.equal(app.calls.removed, 1);
});

test('pending removal locks buttons and Escape and prevents duplicate submissions or retargeting', async () => {
  let finish, writes = 0;
  const app = frontend(() => { writes++; return new Promise((resolve) => { finish = resolve; }); });
  app.buttons[0].disabled = true;
  app.panel.open('first');
  const pending = app.panel.confirm();
  assert.ok(app.buttons.every((button) => button.disabled));
  const escape = new Event('cancel', { cancelable: true });
  app.dialog.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  app.panel.open('second');
  await app.panel.confirm();
  assert.equal(app.panel.pending.vehicleId, 'first');
  assert.equal(writes, 1);
  finish(); await pending;
  assert.deepEqual(app.buttons.map((button) => button.disabled), [true, false, false]);
});

test('a storage failure keeps the confirmation open, reports the error and allows a retry', async () => {
  let attempts = 0;
  const app = frontend(async () => { if (++attempts === 1) throw Error('Stockage fictif indisponible.'); });
  app.panel.open('first');
  await app.panel.confirm();
  assert.equal(app.dialog.open, true);
  assert.equal(app.error.hidden, false);
  assert.match(app.error.textContent, /Stockage fictif indisponible/);
  assert.equal(app.calls.removed, 0);
  assert.equal(app.panel.busy, false);
  assert.ok(app.buttons.every((button) => !button.disabled));
  await app.panel.confirm();
  assert.equal(attempts, 2);
  assert.equal(app.calls.removed, 1);
  assert.equal(app.error.hidden, true);
});

test('closing without confirmation cancels the pending target and later submit does nothing', async () => {
  const app = frontend(() => assert.fail('Cancelled removal must not write'));
  app.panel.open('first');
  const escape = new Event('cancel', { cancelable: true });
  app.dialog.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, false);
  app.dialog.close();
  await app.panel.confirm();
  assert.equal(app.panel.pending, null);
  assert.equal(app.calls.removed, 0);
});

test('form submission prevents native navigation and starts the reviewed removal', async () => {
  let finish, calls = 0;
  const app = frontend(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  app.panel.open('first');
  const submit = new Event('submit', { cancelable: true });
  app.form.dispatchEvent(submit);
  assert.equal(submit.defaultPrevented, true);
  assert.equal(calls, 1);
  assert.equal(app.panel.busy, true);
  finish(); await Promise.resolve();
  assert.equal(app.calls.removed, 1);
});
