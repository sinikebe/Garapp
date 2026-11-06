import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BackupSettings, FileBackup, backupKey, backupBlob, backupFilename, fingerprint, readBackupFile } from '../public/assets/js/backups.js';
import { exampleGarage, MAX_BACKUP_BYTES, parseGarage } from '../public/assets/js/garage.js';

const garage = () => exampleGarage('2026-11-06');

function settings(initial = null) {
  return { value: initial, fail: false, async load() { return this.value; }, async save(value) { if (this.fail) throw Error('Quota exceeded'); this.value = { ...value }; return true; } };
}

function fileHandle(text = '', name = 'garage-fictif.json') {
  const file = { text, permission: 'granted', writes: 0, aborted: 0, failWrite: false, failClose: false, duringOpen: null, afterClose: null };
  file.handle = {
    kind: 'file', name,
    async queryPermission() { return file.permission; },
    async requestPermission() { return file.permission; },
    async getFile() { return new File([file.text], name, { type: 'application/json', lastModified: 1 }); },
    async createWritable(options) {
      assert.equal(options.mode, 'exclusive');
      file.duringOpen?.();
      let pending = '';
      return {
        async write(blob) { file.writes++; if (file.failWrite) throw Error('Disque plein'); pending = await blob.text(); },
        async close() { if (file.failClose) throw Error('Écriture interrompue'); file.text = pending; file.afterClose?.(); },
        async abort() { file.aborted++; },
      };
    },
  };
  return file;
}

test('portable copies retain all fixture data, embedded bytes and exact amounts', async () => {
  const raw = await readFile(new URL('../docs/examples/garage-v2.json', import.meta.url), 'utf8');
  const data = parseGarage(raw);
  const original = structuredClone(data);
  const blob = backupBlob(data);
  const imported = await readBackupFile(new File([blob], 'exemple-fictif.json'));
  assert.deepEqual(imported.garage, original);
  assert.deepEqual(data, original);
  assert.equal(imported.fileHash, await fingerprint(blob));
  assert.equal(imported.size, blob.size);
});

test('copy names are distinct, portable and distinguish development and pre-import copies', () => {
  const date = new Date('2026-11-06T12:34:56.789Z');
  const first = backupFilename({ date, development: true, beforeImport: true });
  assert.match(first, /^garapp-dev-2026-11-06T12-34-56.789Z-avant-import-[a-z0-9-]+\.json$/);
  assert.notEqual(first, backupFilename({ date, development: true, beforeImport: true }));
  assert.doesNotMatch(backupFilename({ date }), /dev|avant-import/);
});

test('oversize, invalid and future files are refused before replacing any garage', async () => {
  await assert.rejects(readBackupFile({ size: MAX_BACKUP_BYTES + 1, text() { throw Error('Must not read'); } }), /512 Mio/);
  await assert.rejects(readBackupFile(new File(['{invalid'], 'invalide.json')), /JSON valide/);
  await assert.rejects(readBackupFile(new File(['{"version":999}'], 'future.json')), /Version/);
});

test('a new linked file is written, closed, read back and remembered after verification', async () => {
  const file = fileHandle(), store = settings();
  const backup = new FileBackup(store, { locks: null });
  await backup.create(file.handle, garage());
  assert.deepEqual(parseGarage(file.text), garage());
  assert.equal(backup.handle, file.handle);
  assert.equal(backup.state.fileHash, await fingerprint(await file.handle.getFile()));
  assert.equal(store.value.garageHash, backup.state.fileHash);
  assert.ok(store.value.at);
  assert.equal(backup.verified, true);
  assert.equal(backup.auto, false);
});

test('creating a backup refuses every nonempty existing file without writing', async () => {
  for (const text of ['un fichier quelconque', await backupBlob(garage()).text()]) {
    const file = fileHandle(text), backup = new FileBackup(settings(), { locks: null });
    await assert.rejects(backup.create(file.handle, garage()), /déjà des données/);
    assert.equal(file.writes, 0);
    assert.equal(file.text, text);
    assert.equal(backup.handle, null);
  }
});

test('external changes with identical size and timestamp stop automatic writes', async () => {
  const file = fileHandle(), backup = new FileBackup(settings(), { locks: null });
  await backup.create(file.handle, garage());
  const savedHash = backup.state.fileHash;
  const originalSize = new Blob([file.text]).size;
  file.text = file.text.replace('"version": 2', '"version": 1');
  assert.equal(new Blob([file.text]).size, originalSize);
  const changed = file.text;
  backup.auto = true;
  await assert.rejects(backup.write({ ...garage(), notes: 'Autre modification fictive' }), /changé ailleurs/);
  assert.equal(file.text, changed);
  assert.equal(file.writes, 1);
  assert.equal(backup.state.fileHash, savedHash);
  assert.equal(backup.auto, false);
  assert.equal(backup.verified, false);
});

test('a change while acquiring the writable stream aborts without overwriting it', async () => {
  const file = fileHandle(), backup = new FileBackup(settings(), { locks: null });
  await backup.create(file.handle, garage());
  file.duringOpen = () => { file.text = 'Modification externe fictive'; };
  await assert.rejects(backup.write({ ...garage(), notes: 'Modification locale fictive' }), /changé ailleurs/);
  assert.equal(file.text, 'Modification externe fictive');
  assert.equal(file.aborted, 1);
  assert.equal(file.writes, 1);
});

test('permission and disk failures keep the last verified checkpoint and disable automatic writes', async () => {
  const file = fileHandle(), backup = new FileBackup(settings(), { locks: null });
  await backup.create(file.handle, garage());
  const original = file.text, savedAt = backup.state.at, savedHash = backup.state.fileHash;
  for (const failure of ['permission', 'failWrite', 'failClose']) {
    file.permission = failure === 'permission' ? 'denied' : 'granted';
    file.failWrite = failure === 'failWrite'; file.failClose = failure === 'failClose';
    backup.auto = true;
    await assert.rejects(backup.write({ ...garage(), notes: 'Modification fictive' }, true));
    assert.equal(file.text, original);
    assert.equal(backup.state.fileHash, savedHash);
    assert.equal(backup.state.at, savedAt);
    assert.equal(backup.auto, false);
    assert.equal(backup.busy, false);
  }
  file.failClose = false;
  await backup.write({ ...garage(), notes: 'Modification fictive' }, true);
  assert.equal(parseGarage(file.text).notes, 'Modification fictive');
  assert.equal(backup.verified, true);
});

test('a failed read-back is never reported as a successful saved checkpoint', async () => {
  const file = fileHandle(), backup = new FileBackup(settings(), { locks: null });
  await backup.create(file.handle, garage());
  const savedHash = backup.state.fileHash;
  file.afterClose = () => { file.text = 'Contenu modifié par un autre programme'; };
  await assert.rejects(backup.write({ ...garage(), notes: 'Modification fictive' }), /après écriture/);
  assert.equal(backup.state.fileHash, savedHash);
  assert.equal(backup.verified, false);
});

test('a platform-level denial keeps the file intact and offers the portable fallback', async () => {
  const file = fileHandle(), backup = new FileBackup(settings(), { locks: null });
  await backup.create(file.handle, garage());
  const original = file.text, checkpoint = backup.state.fileHash;
  file.handle.requestPermission = async () => { throw new DOMException('Platform access denied', 'SecurityError'); };
  backup.auto = true;
  await assert.rejects(backup.write({ ...garage(), notes: 'Modification fictive' }, true), /téléchargement et l’import JSON/);
  assert.equal(file.text, original);
  assert.equal(backup.state.fileHash, checkpoint);
  assert.equal(backup.auto, false);
  assert.match(backup.error, /ce navigateur/);
});

test('opening an existing file never writes, and rechecks its content before linking', async () => {
  const file = fileHandle(JSON.stringify(garage())), backup = new FileBackup(settings(), { locks: null });
  const incoming = await readBackupFile(await file.handle.getFile());
  await backup.link(file.handle, incoming);
  assert.equal(file.writes, 0);
  assert.equal(backup.state.garageHash, await fingerprint(backupBlob(incoming.garage)));
  file.text += '\n';
  await assert.rejects(backup.link(file.handle, incoming), /changé ailleurs/);
  assert.equal(file.writes, 0);
});

test('page reload restores the link without restoring automatic write consent', async () => {
  const file = fileHandle(), store = settings();
  const first = new FileBackup(store, { locks: null });
  await first.create(file.handle, garage()); first.auto = true;
  const second = new FileBackup(store, { locks: null });
  await second.restore();
  assert.equal(second.handle, file.handle);
  assert.equal(second.auto, false);
  assert.equal(second.verified, false);
  await second.check();
  assert.equal(second.verified, true);
  assert.equal(file.writes, 1);
});

test('two sessions sharing one file refuse a stale write after the first session saves', async () => {
  let pending = Promise.resolve();
  const locks = { request(name, callback) { assert.equal(name, 'garapp.backup.file'); const next = pending.then(callback); pending = next.catch(() => {}); return next; } };
  const file = fileHandle(), first = new FileBackup(settings(), { locks });
  await first.create(file.handle, garage());
  const second = new FileBackup(settings({ ...first.state }), { locks });
  await second.restore();
  const results = await Promise.allSettled([
    first.write({ ...garage(), notes: 'Premier appareil fictif' }),
    second.write({ ...garage(), notes: 'Second appareil fictif' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(file.writes, 2);
});

test('unavailable settings storage does not lose a successfully written file', async () => {
  const file = fileHandle(), store = settings(); store.fail = true;
  const backup = new FileBackup(store, { locks: null });
  await backup.create(file.handle, garage());
  assert.deepEqual(parseGarage(file.text), garage());
  assert.match(backup.notice, /session/);
  assert.equal(backup.verified, true);
});

test('download tracking refers to the exported snapshot and never adds metadata to the JSON', async () => {
  const backup = new FileBackup(settings(), { locks: null });
  const data = garage(), blob = backupBlob(data);
  await backup.noteDownload(blob, 'copie-fictive.json', new Date('2026-11-06T12:00:00Z'));
  assert.equal(backup.state.download.hash, await fingerprint(blob));
  data.notes = 'Modification après export';
  assert.notEqual(backup.state.download.hash, await fingerprint(backupBlob(data)));
  assert.equal(Object.hasOwn(parseGarage(await blob.text()), 'download'), false);
  assert.equal(backup.state.download.at, '2026-11-06T12:00:00.000Z');
});

test('disconnecting preserves both the external file and download history', async () => {
  const file = fileHandle(), backup = new FileBackup(settings(), { locks: null });
  await backup.create(file.handle, garage());
  await backup.noteDownload(backupBlob(garage()), 'copie-fictive.json');
  const original = file.text;
  backup.auto = true;
  await backup.disconnect();
  assert.equal(file.text, original);
  assert.equal(backup.handle, null);
  assert.equal(backup.auto, false);
  assert.equal(backup.state.download.name, 'copie-fictive.json');
});

test('fallback settings stay path-scoped and do not serialize file access handles', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  try {
    const main = new BackupSettings(backupKey('garapp.workspace.v1:/Garapp/'));
    const dev = new BackupSettings(backupKey('garapp.workspace.v1:/Garapp/dev/'));
    assert.equal(await main.save({ handle: fileHandle().handle, fileHash: 'fictif', download: { name: 'copie-fictive.json' } }), false);
    assert.equal((await main.load()).handle, undefined);
    assert.equal((await main.load()).download.name, 'copie-fictive.json');
    assert.equal(await dev.load(), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
  }
});
