import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WorkspaceStorage } from '../public/assets/js/storage.js';
import { exampleGarage, parseGarage } from '../public/assets/js/garage.js';
import { moveRecordToTrash, restoreTrashedRecord } from '../public/assets/js/record-trash.js';

async function withStorage(run, initial = null) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map(initial === null ? [] : [['test-garage', initial]]);
  const state = { failWrites: false };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (state.failWrites) throw Error('Quota exceeded'); values.set(key, value); },
  } });
  const stores = [];
  const open = () => { const store = new WorkspaceStorage('test-garage'); stores.push(store); return store; };
  try { await run({ open, values, state }); }
  finally { for (const store of stores) store.channel?.close(); if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; }
}

test('a stale tab cannot silently overwrite a garage saved by another tab', async () => {
  await withStorage(async ({ open, values }) => {
    const first = open(), second = open();
    await first.load(); await second.load();
    const data = exampleGarage('2026-11-06');
    await first.save(data);
    const saved = values.get('test-garage');
    await assert.rejects(second.save({ ...data, notes: 'Une autre copie fictive' }), /autre onglet/);
    assert.equal(values.get('test-garage'), saved);
    assert.deepEqual(parseGarage(saved), data);
  });
});

test('quota failures preserve the stored original and allow a later retry', async () => {
  await withStorage(async ({ open, values, state }) => {
    const store = open(); await store.load();
    const data = exampleGarage('2026-11-06'); await store.save(data);
    const original = values.get('test-garage');
    state.failWrites = true;
    await assert.rejects(store.save({ ...data, notes: 'Modification fictive' }), /Quota/);
    assert.equal(values.get('test-garage'), original);
    state.failWrites = false;
    await store.save({ ...data, notes: 'Modification fictive' });
    assert.equal(parseGarage(values.get('test-garage')).notes, 'Modification fictive');
  });
});

test('unreadable existing storage is never replaced with demonstration data', async () => {
  await withStorage(async ({ open, values }) => {
    const store = open();
    await assert.rejects(store.load());
    await assert.rejects(store.save(exampleGarage()), /illisible/);
    assert.equal(values.get('test-garage'), '{invalid json');
    assert.equal(await store.readStoredRaw(), '{invalid json');
  }, '{invalid json');
});

test('the first localStorage migration archives the original bytes before replacing them', async () => {
  const raw = readFileSync(new URL('./fixtures/backups/v1.json', import.meta.url), 'utf8');
  await withStorage(async ({ open, values }) => {
    const store = open(), migrated = await store.load();
    await store.save(migrated);
    const points = await store.recoveryPoints();
    assert.equal(points.length, 1);
    assert.equal(points[0].reason, 'migration');
    assert.equal(await store.readRecovery(points[0].id), raw);
    assert.equal(JSON.parse(values.get('test-garage')).version, 2);
    await store.save({ ...migrated, notes: 'Later synthetic edit' });
    assert.equal((await store.recoveryPoints()).length, 1);
  }, raw);
});

test('failed migration archival cannot replace the previous localStorage format', async () => {
  const raw = readFileSync(new URL('./fixtures/backups/v1.json', import.meta.url), 'utf8');
  await withStorage(async ({ open, values, state }) => {
    const store = open(), migrated = await store.load();
    state.failWrites = true;
    await assert.rejects(store.save(migrated), /Quota/);
    assert.equal(values.get('test-garage'), raw);
    state.failWrites = false;
    await store.save(migrated);
    const [point] = await store.recoveryPoints();
    assert.equal(await store.readRecovery(point.id), raw);
  }, raw);
});

// Transaction fixture: queued requests share a draft and failed writes roll it
// back. This exercises storage's transaction boundaries without a browser API.
function transactionalDatabase(entries = []) {
  const values = new Map(entries), state = { failKey: null };
  return { values, state, transaction() {
    const draft = new Map(values);
    let pending = 0, aborted = false;
    const transaction = {
      error: null,
      abort() { if (aborted) return; aborted = true; queueMicrotask(() => transaction.onabort?.()); },
      objectStore() { return {
        get(key) {
          const request = {}; pending++;
          queueMicrotask(() => {
            if (aborted) return;
            try { request.result = structuredClone(draft.get(key)); request.onsuccess?.(); }
            catch (error) { transaction.error = error; transaction.abort(); }
            pending--;
            if (!pending && !aborted) {
              values.clear(); for (const [entryKey, value] of draft) values.set(entryKey, value);
              transaction.oncomplete?.();
            }
          });
          return request;
        },
        put(value) {
          if (state.failKey?.(value.key)) throw Error('Synthetic quota exceeded');
          draft.set(value.key, structuredClone(value));
        },
      }; },
    };
    return transaction;
  } };
}

test('IndexedDB commits the original migration archive and new model in one transaction', async () => {
  const original = JSON.parse(readFileSync(new URL('./fixtures/backups/v1.json', import.meta.url), 'utf8'));
  await withStorage(async ({ open }) => {
    const database = transactionalDatabase([['test-garage', { key: 'test-garage', revision: 'legacy', garage: original }]]);
    const store = open(); await store.ready; store.database = database;
    const migrated = await store.load();
    database.state.failKey = (key) => key.includes(':recoveries:');
    await assert.rejects(store.save(migrated), /quota/);
    assert.deepEqual(database.values.get('test-garage').garage, original);
    assert.equal(database.values.get('test-garage').revision, 'legacy');
    assert.equal(store.revision, 'legacy');
    assert.equal(database.values.size, 1);
    database.state.failKey = null;
    await store.save(migrated);
    const [point] = await store.recoveryPoints();
    assert.equal(await store.readRecovery(point.id), JSON.stringify(original));
    assert.deepEqual(database.values.get('test-garage').garage, migrated);
    assert.equal(database.values.get('test-garage').revision, store.revision);
    assert.notEqual(store.revision, 'legacy');
  });
});

test('a closed IndexedDB primary cannot silently fall back to older localStorage data', async () => {
  await withStorage(async ({ open, values }) => {
    const store = open(); await store.load();
    const garage = exampleGarage('2026-11-06'); await store.save(garage);
    const point = await store.checkpoint(garage);
    const original = new Map(values);
    // This is the state set by the IndexedDB versionchange handler.
    store.database = null; store.primaryClosed = true;
    for (const action of [
      () => store.load(), () => store.save(garage), () => store.checkpoint(garage),
      () => store.recoveryPoints(), () => store.readRecovery(point.id), () => store.readStoredRaw(),
    ]) await assert.rejects(action(), /stockage a changé/);
    assert.deepEqual(values, original);
  });
});

test('recovery lookup stays within its workspace even when the identifier is known', async () => {
  await withStorage(async ({ open }) => {
    const store = open(); await store.load();
    const point = await store.checkpoint(exampleGarage('2026-11-06'));
    const other = new WorkspaceStorage('other-garage');
    try {
      assert.deepEqual(await other.recoveryPoints(), []);
      await assert.rejects(other.readRecovery(point.id), /introuvable/);
      await assert.rejects(store.readRecovery(`other-garage:recoveries:${point.id}`), /introuvable/);
    } finally { other.channel?.close(); }
  });
});

test('fallback recovery archives remain available after IndexedDB becomes usable', async () => {
  await withStorage(async ({ open }) => {
    const store = open(); await store.load();
    const garage = exampleGarage('2026-11-06');
    const old = await store.checkpoint(garage);
    store.database = transactionalDatabase();
    const current = await store.checkpoint({ ...garage, notes: 'New synthetic revision' });
    assert.deepEqual((await store.recoveryPoints()).map((point) => point.id), [current.id, old.id]);
    assert.deepEqual(JSON.parse(await store.readRecovery(old.id)), garage);
    assert.equal(JSON.parse(await store.readRecovery(current.id)).notes, 'New synthetic revision');
  });
});

test('trash survives reopening storage and a failed write preserves the saved record', async () => {
  await withStorage(async ({ open, values, state }) => {
    const first = open(); await first.load();
    const garage = exampleGarage('2026-11-06'), vehicle = garage.vehicles[0];
    await first.save(garage);
    const next = moveRecordToTrash(garage, vehicle.id, 'service', '2026-11-08T10:20:30.000Z');
    state.failWrites = true;
    await assert.rejects(first.save(next));
    assert.deepEqual(parseGarage(values.get('test-garage')), garage);
    state.failWrites = false;
    await first.save(next);
    const reopened = open();
    assert.deepEqual(await reopened.load(), next);
    await reopened.save(restoreTrashedRecord(next, vehicle.id, 'service'));
    assert.deepEqual(parseGarage(values.get('test-garage')).vehicles[0].records, vehicle.records);
  });
});

test('invalid and future models never overwrite a valid stored garage', async () => {
  await withStorage(async ({ open, values }) => {
    const store = open(); await store.load();
    const data = exampleGarage('2026-11-06'); await store.save(data);
    const original = values.get('test-garage');
    await assert.rejects(store.save({ ...data, version: 999 }), /Version/);
    await assert.rejects(store.save({ ...data, vehicles: null }));
    assert.equal(values.get('test-garage'), original);
  });
});

test('a save captures its complete source before yielding to another task', async () => {
  await withStorage(async ({ open, values }) => {
    const store = open(); await store.load();
    const data = exampleGarage('2026-11-06'), original = structuredClone(data);
    const saving = store.save(data);
    data.vehicles[0].records.length = 0;
    await saving;
    assert.deepEqual(parseGarage(values.get('test-garage')), original);
  });
});

test('pre-import recovery copies remain independently exportable after later replacements', async () => {
  await withStorage(async ({ open }) => {
    const store = open(); await store.load();
    const first = exampleGarage('2026-11-06');
    const second = { ...first, notes: 'Second synthetic garage' };
    await store.save(first);
    const firstPoint = await store.checkpoint(first);
    await store.save(second);
    const secondPoint = await store.checkpoint(second);
    await store.save({ ...second, notes: 'Third synthetic garage' });
    const reopened = open(); await reopened.load();
    assert.deepEqual(await reopened.recoveryPoints(), [secondPoint, firstPoint]);
    assert.deepEqual(JSON.parse(await reopened.readRecovery(firstPoint.id)), first);
    assert.deepEqual(JSON.parse(await reopened.readRecovery(secondPoint.id)), second);
    await assert.rejects(reopened.readRecovery('missing'), /introuvable/);
  });
});

test('a checkpoint quota failure preserves the current garage and previous recoveries', async () => {
  await withStorage(async ({ open, values, state }) => {
    const store = open(); await store.load();
    const first = exampleGarage('2026-11-06'); await store.save(first);
    const point = await store.checkpoint(first), original = values.get('test-garage');
    state.failWrites = true;
    await assert.rejects(store.checkpoint({ ...first, notes: 'Unsaved synthetic copy' }), /Quota/);
    assert.equal(values.get('test-garage'), original);
    assert.deepEqual(await store.recoveryPoints(), [point]);
    assert.deepEqual(JSON.parse(await store.readRecovery(point.id)), first);
  });
});
