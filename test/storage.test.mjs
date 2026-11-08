import test from 'node:test';
import assert from 'node:assert/strict';
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
  }, '{invalid json');
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
