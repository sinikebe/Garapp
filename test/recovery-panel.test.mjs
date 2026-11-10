import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryPanel } from '../public/assets/js/recovery-panel.js';
import { parseGarage } from '../public/assets/js/garage.js';

function panel(repository, openFile) {
  const previous = globalThis.document;
  const list = new EventTarget(), dialog = new EventTarget(), message = { textContent: '' };
  globalThis.document = { getElementById: (id) => ({ 'recovery-list': list, 'recovery-message': message, 'recovery-dialog': dialog })[id] };
  try { return { view: new RecoveryPanel({ repository, openFile }), message, dialog }; }
  finally { globalThis.document = previous; }
}

test('opening a recovery passes original bytes to the normal import preview without persisting data', async () => {
  const raw = '{\n  "version": 2, "vehicles": [], "source": {"amount": "120.0000000001"}\n}';
  let received, readId;
  const { view } = panel({ readRecovery: async (id) => { readId = id; return raw; }, save: () => assert.fail('Preview must not save') }, async (file) => { received = file; });
  const button = { disabled: false, dataset: { recoveryOpen: 'synthetic-recovery' } };
  await view.openCopy(button);
  assert.equal(readId, 'synthetic-recovery');
  assert.equal(await received.text(), raw);
  assert.equal(received.type, 'application/json');
  assert.equal(button.disabled, false);
});

test('a rejected recovery remains available and can be retried through normal validation', async () => {
  let raw = '{"version":999,"vehicles":[]}', attempts = 0;
  const { view, message } = panel({ readRecovery: async () => raw }, async (file) => { attempts++; parseGarage(await file.text()); });
  const button = { disabled: false, dataset: { recoveryOpen: 'synthetic-future' } };
  await view.openCopy(button);
  assert.match(message.textContent, /Ouverture impossible/);
  assert.equal(button.disabled, false);
  raw = '{"version":2,"vehicles":[]}';
  await view.openCopy(button);
  assert.equal(attempts, 2);
});

test('repeated recovery clicks cannot open competing previews while a read is pending', async () => {
  let finishRead, reads = 0, previews = 0;
  const { view } = panel({ readRecovery: () => { reads++; return new Promise((resolve) => { finishRead = resolve; }); } }, async () => { previews++; });
  const first = { disabled: false, dataset: { recoveryOpen: 'first' } };
  const second = { disabled: false, dataset: { recoveryOpen: 'second' } };
  const opening = view.openCopy(first);
  await view.openCopy(second);
  finishRead('{"version":2,"vehicles":[]}');
  await opening;
  assert.equal(reads, 1);
  assert.equal(previews, 1);
});

test('closing recovery while reading a copy does not reopen another dialog', async () => {
  let finishRead;
  const { view, dialog } = panel({ readRecovery: () => new Promise((resolve) => { finishRead = resolve; }) }, () => assert.fail('Cancelled preview must stay closed'));
  const button = { disabled: false, dataset: { recoveryOpen: 'synthetic-copy' } };
  const opening = view.openCopy(button);
  dialog.dispatchEvent(new Event('close'));
  finishRead('{"version":2,"vehicles":[]}');
  await opening;
  assert.equal(button.disabled, false);
  assert.equal(view.opening, false);
});

test('closing recovery also cancels a preview that is already validating the file', async () => {
  let finishValidation, isCurrent;
  const { view, dialog } = panel({ readRecovery: async () => '{"version":2,"vehicles":[]}' }, async (file, current) => {
    isCurrent = current;
    await new Promise((resolve) => { finishValidation = resolve; });
    assert.equal(current(), false);
  });
  const opening = view.openCopy({ disabled: false, dataset: { recoveryOpen: 'synthetic-copy' } });
  await Promise.resolve();
  assert.equal(isCurrent(), true);
  dialog.dispatchEvent(new Event('close'));
  finishValidation();
  await opening;
  assert.equal(view.opening, false);
});
