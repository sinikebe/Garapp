import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGarage } from '../public/assets/js/garage.js';
import { removeVehicle } from '../public/assets/js/vehicle-removal.js';
import { commitVehicleRemoval } from '../public/assets/js/workspace-transactions.js';
import { compareGarages, mergeGarages } from '../public/assets/js/backup-merge.js';
import { WorkspaceStorage } from '../public/assets/js/storage.js';

const completeGarage = () => parseGarage(readFileSync(new URL('./fixtures/backups/v2-complete.json', import.meta.url), 'utf8'));
const vehicles = (activeId = 'second') => parseGarage(JSON.stringify({
  version: 2, activeId,
  vehicles: ['first', 'second', 'third'].map((id) => ({ id, name: `Synthetic ${id}`, components: [], records: [] })),
}));

test('removing a vehicle preserves every remaining document, exact value and extension without mutating the source', () => {
  const current = completeGarage();
  current.vehicles.unshift({ ...structuredClone(current.vehicles[0]), id: 'vehicle-to-remove', name: 'Synthetic removable vehicle' });
  current.activeId = 'complete-car';
  const original = structuredClone(current);
  const next = removeVehicle(current, 'vehicle-to-remove');
  assert.deepEqual(current, original);
  assert.deepEqual(next, completeGarage());
  assert.deepEqual(parseGarage(JSON.stringify(next)), next);
  next.vehicles[0].records[0].notes = 'Later synthetic change';
  next.documents[0].source.scope = 'Later synthetic scope';
  assert.deepEqual(current, original);
});

test('active vehicle selection moves to a neighbor only when its own vehicle is removed', () => {
  for (const [activeId, removedId, nextActive] of [
    ['first', 'first', 'second'], ['second', 'second', 'third'],
    ['third', 'third', 'second'], ['second', 'first', 'second'],
  ]) {
    const next = removeVehicle(vehicles(activeId), removedId);
    assert.equal(next.activeId, nextActive);
    assert.equal(next.vehicles.length, 2);
    assert.ok(next.vehicles.some((vehicle) => vehicle.id === next.activeId));
  }
});

test('removing the final vehicle leaves a valid empty garage with its shared documents and metadata', () => {
  const current = completeGarage();
  const next = removeVehicle(current, current.activeId);
  assert.deepEqual(next, { ...current, activeId: null, vehicles: [] });
  assert.deepEqual(parseGarage(JSON.stringify(next)), next);
});

test('an unknown or already removed vehicle cannot create recovery copies or write data', async () => {
  const repository = { checkpoint: () => assert.fail('No checkpoint expected'), save: () => assert.fail('No save expected') };
  const current = vehicles();
  assert.throws(() => removeVehicle(current, 'missing'), /introuvable/);
  await assert.rejects(commitVehicleRemoval(repository, current, 'missing'), /introuvable/);
  await assert.rejects(commitVehicleRemoval(repository, removeVehicle(current, 'second'), 'second'), /introuvable/);
});

test('vehicle removal validates the remaining garage before creating a checkpoint', async () => {
  const current = vehicles();
  current.vehicles[0].records = null;
  const repository = { checkpoint: () => assert.fail('Invalid data must not be archived'), save: () => assert.fail('Invalid data must not be saved') };
  await assert.rejects(commitVehicleRemoval(repository, current, 'second'));
});

test('removal becomes available only after the complete original has been archived and the new garage saved', async () => {
  const current = completeGarage(), original = structuredClone(current), calls = [];
  let finishSave;
  const repository = {
    checkpoint: async (garage, reason) => { calls.push(['checkpoint', garage, reason]); },
    save: (garage) => { calls.push(['save', garage]); return new Promise((resolve) => { finishSave = resolve; }); },
  };
  let completed = false;
  const pending = commitVehicleRemoval(repository, current, current.activeId).then((result) => { completed = true; return result; });
  await Promise.resolve();
  assert.deepEqual(calls.map(([action]) => action), ['checkpoint', 'save']);
  assert.equal(calls[0][1], current);
  assert.equal(calls[0][2], 'vehicle-delete');
  assert.equal(completed, false);
  finishSave();
  const result = await pending;
  assert.deepEqual(result, { ...current, activeId: null, vehicles: [] });
  assert.deepEqual(current, original);
});

test('a failed checkpoint or save aborts removal and leaves the open model untouched', async () => {
  for (const failure of ['checkpoint', 'save']) {
    const current = completeGarage(), original = structuredClone(current), calls = [];
    const operation = (name) => async () => { calls.push(name); if (name === failure) throw Error('Synthetic quota failure'); };
    await assert.rejects(commitVehicleRemoval({ checkpoint: operation('checkpoint'), save: operation('save') }, current, current.activeId), /quota/);
    assert.deepEqual(calls, failure === 'checkpoint' ? ['checkpoint'] : ['checkpoint', 'save']);
    assert.deepEqual(current, original);
  }
});

test('a confirmation that is already stale cannot create a checkpoint or save a removal', async () => {
  const current = completeGarage();
  const repository = { checkpoint: () => assert.fail('Stale confirmation must not be archived'), save: () => assert.fail('Stale confirmation must not be saved') };
  await assert.rejects(commitVehicleRemoval(repository, current, current.activeId, () => false), /garage a changé/);
});

for (const change of ['replacement', 'conflict']) {
  test(`a ${change} while the recovery checkpoint is pending prevents the removal write`, async () => {
    const expected = completeGarage(), original = structuredClone(expected);
    let current = expected, localConflict = false, finishCheckpoint;
    const repository = {
      checkpoint: () => new Promise((resolve) => { finishCheckpoint = resolve; }),
      save: () => assert.fail('A changed garage must not be overwritten'),
    };
    const pending = commitVehicleRemoval(repository, expected, expected.activeId, () => current === expected && !localConflict);
    if (change === 'replacement') current = { ...expected, notes: 'Synthetic replacement while archiving' };
    else localConflict = true;
    finishCheckpoint();
    await assert.rejects(pending, /garage a changé/);
    assert.deepEqual(expected, original);
  });
}

async function withStorage(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map(), stores = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  } });
  const open = () => { const store = new WorkspaceStorage('synthetic-vehicle-removal'); stores.push(store); return store; };
  try { await run(open); }
  finally {
    for (const store of stores) store.channel?.close();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
  }
}

test('a removed vehicle can be recovered by merging its archived copy without losing later vehicles', async () => {
  await withStorage(async (open) => {
    const store = open(); await store.load();
    const original = completeGarage(); await store.save(original);
    const empty = await commitVehicleRemoval(store, original, original.activeId);
    assert.deepEqual(await open().load(), empty);
    const [point] = await store.recoveryPoints();
    assert.equal(point.reason, 'vehicle-delete');
    const archived = parseGarage(await store.readRecovery(point.id));
    assert.deepEqual(archived, original);
    const later = { ...empty, activeId: 'first', vehicles: vehicles('first').vehicles };
    await store.save(later);
    const comparison = compareGarages(later, archived);
    assert.ok(comparison.differences.every((difference) => !difference.conflict));
    const restored = mergeGarages(comparison);
    assert.deepEqual(restored.vehicles.find((vehicle) => vehicle.id === original.activeId), original.vehicles[0]);
    assert.deepEqual(restored.vehicles.filter((vehicle) => vehicle.id !== original.activeId), later.vehicles);
    assert.deepEqual(restored.documents, original.documents);
    assert.equal(restored.activeId, later.activeId);
  });
});

test('a removal from a stale tab never overwrites a newer garage saved by another tab', async () => {
  await withStorage(async (open) => {
    const first = open(); await first.load();
    const original = completeGarage(); await first.save(original);
    const second = open(); const newer = await second.load();
    newer.vehicles[0].notes = 'Synthetic newer tab change'; await second.save(newer);
    await assert.rejects(commitVehicleRemoval(first, original, original.activeId), /autre onglet/);
    assert.deepEqual(await open().load(), newer);
    assert.deepEqual(original, completeGarage());
  });
});

test('reloading the same repository during a checkpoint cannot authorize an obsolete removal', async () => {
  await withStorage(async (open) => {
    const first = open(); await first.load();
    const expected = completeGarage(); await first.save(expected);
    let current = expected, finishCheckpoint, signalCheckpoint;
    const checkpointReady = new Promise((resolve) => { signalCheckpoint = resolve; });
    const checkpoint = first.checkpoint.bind(first);
    first.checkpoint = async (...args) => {
      const point = await checkpoint(...args);
      await new Promise((resolve) => { finishCheckpoint = resolve; signalCheckpoint(); });
      return point;
    };
    const pending = commitVehicleRemoval(first, expected, expected.activeId, () => current === expected);
    await checkpointReady;
    const second = open(); const newer = await second.load();
    newer.vehicles[0].notes = 'Synthetic newer change during checkpoint'; await second.save(newer);
    // This updates the first repository's revision, so its storage-level stale
    // write protection alone would now accept an old removal result.
    current = await first.load();
    finishCheckpoint();
    await assert.rejects(pending, /garage a changé/);
    assert.deepEqual(await open().load(), newer);
    const [point] = await first.recoveryPoints();
    assert.deepEqual(parseGarage(await first.readRecovery(point.id)), expected);
  });
});
