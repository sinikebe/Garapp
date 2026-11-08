import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGarage, inventory, exampleGarage, vehicleStats, componentLife, componentHistory } from '../public/assets/js/garage.js';
import { mileageHistory, spendingHistory } from '../public/assets/js/statistics.js';
import { backupBlob, readBackupFile } from '../public/assets/js/backups.js';
import { moveRecordToTrash, restoreTrashedRecord, discardTrashedRecord } from '../public/assets/js/record-trash.js';

const at = '2026-11-08T10:20:30.456Z';
const fixture = () => parseGarage(readFileSync(new URL('../docs/examples/garage-v2.json', import.meta.url), 'utf8'));
const roundTrip = (garage) => parseGarage(JSON.stringify(garage));

test('trashing and restoring preserves the complete record, its position and the original garage', () => {
  const garage = fixture(), original = structuredClone(garage), vehicle = garage.vehicles[0];
  const record = vehicle.records[0];
  const next = moveRecordToTrash(garage, vehicle.id, record.id, at);
  const entry = next.vehicles[0].trashedRecords[0];
  assert.deepEqual(garage, original);
  assert.deepEqual(entry, { record, deletedAt: at, position: 0 });
  assert.equal(next.vehicles[0].records.some((one) => one.id === record.id), false);
  assert.equal(next.vehicles[0].odometer, vehicle.odometer);
  assert.equal(next.activeId, garage.activeId);
  assert.deepEqual(roundTrip(next), next);
  const restored = restoreTrashedRecord(roundTrip(next), vehicle.id, record.id);
  assert.deepEqual(restored.vehicles[0].records, vehicle.records);
  assert.deepEqual(restored.vehicles[0].trashedRecords, []);
  assert.deepEqual(next.vehicles[0].trashedRecords, [entry]);
});

test('exports and imports retain trash metadata, nested documents, exact amounts and unknown fields', async () => {
  const original = fixture(), vehicle = original.vehicles[0], record = vehicle.records[0];
  const garage = moveRecordToTrash(original, vehicle.id, record.id, at);
  garage.vehicles[0].trashedRecords[0].source = { example: 'Fiction conservée' };
  const imported = await readBackupFile(new File([backupBlob(garage)], 'corbeille-fictive.json'));
  assert.deepEqual(imported.garage, garage);
  const copy = restoreTrashedRecord(imported.garage, vehicle.id, record.id).vehicles[0].records[0];
  assert.deepEqual(copy, record);
  assert.equal(copy.lines[0].amount, '12.345');
  assert.equal(copy.lines[1].amount, null);
  assert.equal(copy.lines[0].documents[0].dataUrl, record.lines[0].documents[0].dataUrl);
});

test('backup inventory separates active and trashed records without dropping lines or embedded bytes', () => {
  const garage = fixture(), vehicle = garage.vehicles[0];
  const before = inventory(garage);
  const after = inventory(moveRecordToTrash(garage, vehicle.id, vehicle.records[0].id, at));
  assert.deepEqual(after, { ...before, records: before.records - 1, trashedRecords: 1 });
});

test('expenses, mileage and component intervals exclude trash and return after restoration', () => {
  const garage = exampleGarage('2026-11-06'), vehicle = garage.vehicles[0];
  const oil = vehicle.components.find((part) => part.id === 'oil');
  const options = { date: '2026-11-06' };
  const beforeStats = vehicleStats(vehicle, 'all');
  const beforeMileage = mileageHistory(vehicle, options);
  const beforeSpending = spendingHistory(vehicle, options);
  const beforeLife = componentLife(vehicle, oil, options.date);
  const next = moveRecordToTrash(garage, vehicle.id, 'service', at);
  const after = next.vehicles[0];
  assert.equal(vehicleStats(after, 'all').total, beforeStats.total - 18900);
  assert.equal(componentLife(after, oil, options.date).status, 'unknown');
  assert.deepEqual(componentHistory(after, oil.id), []);
  assert.equal(mileageHistory(after, options).readings.some((reading) => reading.id === 'service'), false);
  assert.equal(spendingHistory(after, options).records.some((record) => record.id === 'service'), false);
  const restored = restoreTrashedRecord(next, vehicle.id, 'service').vehicles[0];
  assert.deepEqual(vehicleStats(restored, 'all'), beforeStats);
  assert.deepEqual(mileageHistory(restored, options), beforeMileage);
  assert.deepEqual(spendingHistory(restored, options), beforeSpending);
  assert.deepEqual(componentLife(restored, oil, options.date), beforeLife);
});

test('planned, incomplete, undated and zero-valued records keep their original meaning', () => {
  for (const status of ['done', 'planned', 'incomplete']) {
    const garage = fixture(), vehicle = garage.vehicles[0], record = vehicle.records[0];
    Object.assign(record, { date: null, odometer: null, status, totalAmount: '0', custom: { text: ' Texte fictif avec espaces. ' } });
    const moved = roundTrip(moveRecordToTrash(garage, vehicle.id, record.id, at));
    assert.deepEqual(restoreTrashedRecord(moved, vehicle.id, record.id).vehicles[0].records[0], record);
  }
});

test('record IDs may belong to different vehicles, with independent recycle bins', () => {
  const garage = fixture(), first = garage.vehicles[0];
  garage.vehicles.push({ ...structuredClone(first), id: 'another-fictional-vehicle' });
  const next = moveRecordToTrash(garage, first.id, first.records[0].id, at);
  assert.deepEqual(next.vehicles[1], garage.vehicles[1]);
  assert.equal(next.vehicles[0].trashedRecords.length, 1);
  assert.equal(next.vehicles[1].trashedRecords, undefined);
});

test('missing records, duplicate moves and colliding restores never mutate the original data', () => {
  const garage = fixture(), vehicle = garage.vehicles[0], id = vehicle.records[0].id;
  assert.throws(() => moveRecordToTrash(garage, 'absent', id, at));
  assert.throws(() => moveRecordToTrash(garage, vehicle.id, 'absent', at));
  assert.throws(() => moveRecordToTrash(garage, vehicle.id, id, 'invalid'));
  assert.throws(() => discardTrashedRecord(garage, vehicle.id, id));
  const moved = moveRecordToTrash(garage, vehicle.id, id, at), original = structuredClone(moved);
  assert.throws(() => moveRecordToTrash(moved, vehicle.id, id, at));
  assert.throws(() => restoreTrashedRecord(moved, vehicle.id, 'absent'));
  assert.deepEqual(moved, original);
  const collision = structuredClone(moved);
  collision.vehicles[0].records.push(vehicle.records[0]);
  assert.throws(() => restoreTrashedRecord(collision, vehicle.id, id), /identifiant/);
  assert.throws(() => roundTrip(collision), /identifiant/);
  assert.deepEqual(collision.vehicles[0].trashedRecords, moved.vehicles[0].trashedRecords);
});

test('trash contents receive the same validation as active records before any import', () => {
  const source = fixture(), vehicle = source.vehicles[0];
  const moved = moveRecordToTrash(source, vehicle.id, vehicle.records[0].id, at);
  for (const change of [
    (entry) => { entry.deletedAt = '2026-02-30T10:20:30.456Z'; },
    (entry) => { entry.position = -1; },
    (entry) => { entry.record.lines[0].componentId = 'absent'; },
    (entry) => { entry.record.lines[0].documents[0].dataUrl = 'https://example.com/fiction.txt'; },
    (entry) => { entry.record.lines[0].amount = 'invalid'; },
    (entry) => { entry.record.id = 'invalid id'; },
    (entry) => { entry.record = null; },
  ]) { const copy = structuredClone(moved); change(copy.vehicles[0].trashedRecords[0]); assert.throws(() => roundTrip(copy)); }
  for (const invalid of [null, {}, 'invalid', [null]]) {
    const copy = structuredClone(moved); copy.vehicles[0].trashedRecords = invalid;
    assert.throws(() => roundTrip(copy));
  }
  const duplicate = structuredClone(moved);
  duplicate.vehicles[0].trashedRecords.push(duplicate.vehicles[0].trashedRecords[0]);
  assert.throws(() => roundTrip(duplicate), /identifiant/);
});

test('older v2 files omit the optional bin and imported entries can omit a position', () => {
  const garage = fixture(), vehicle = garage.vehicles[0], record = vehicle.records[0];
  assert.equal(Object.hasOwn(roundTrip(garage).vehicles[0], 'trashedRecords'), false);
  const next = moveRecordToTrash(garage, vehicle.id, record.id, at);
  delete next.vehicles[0].trashedRecords[0].position;
  assert.deepEqual(restoreTrashedRecord(roundTrip(next), vehicle.id, record.id).vehicles[0].records.at(-1), record);
});

test('permanent deletion removes only the requested trashed record and leaves earlier copies intact', () => {
  const garage = fixture(), vehicle = garage.vehicles[0];
  const first = moveRecordToTrash(garage, vehicle.id, vehicle.records[0].id, at);
  const both = moveRecordToTrash(first, vehicle.id, vehicle.records[1].id, at);
  const copy = structuredClone(both);
  const removed = roundTrip(discardTrashedRecord(both, vehicle.id, vehicle.records[0].id));
  assert.deepEqual(both, copy);
  assert.deepEqual(removed.vehicles[0].records, both.vehicles[0].records);
  assert.deepEqual(removed.vehicles[0].trashedRecords, [both.vehicles[0].trashedRecords[1]]);
  assert.ok(inventory(removed).documents < inventory(both).documents);
  assert.throws(() => restoreTrashedRecord(removed, vehicle.id, vehicle.records[0].id));
});
