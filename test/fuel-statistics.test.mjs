import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage, vehicleStats } from '../public/assets/js/garage.js';
import { spendingHistory } from '../public/assets/js/statistics.js';
import { fuelStatistics } from '../public/assets/js/fuel-statistics.js';
import { fuelMarkup } from '../public/assets/js/fuel-view.js';
import { moveRecordToTrash, restoreTrashedRecord } from '../public/assets/js/record-trash.js';
import { backupBlob, readBackupFile } from '../public/assets/js/backups.js';

const fill = (id, date, odometer, litres, fullTank, totalAmount = null, extra = {}) => ({ id, title: `Carburant fictif ${id}`, type: 'fuel', date, odometer, fuel: { litres, fullTank }, totalAmount, ...extra });
const reading = (id, date, odometer) => ({ id, title: `Relevé fictif ${id}`, type: 'reading', date, odometer });
const garageOf = (records) => parseGarage(JSON.stringify({ version: 2, activeId: 'fiction', vehicles: [{ id: 'fiction', name: 'Véhicule fictif', components: [], records }] }));
const vehicleOf = (records) => garageOf(records).vehicles[0];
const options = { date: '2026-11-08' };
const sequence = () => [
  fill('a', '2026-01-01', 10000, '50', true, '80'),
  fill('b', '2026-01-15', 10400, '20', false, '30'),
  fill('c', '2026-02-01', 11000, '40', true, '60'),
  fill('d', '2026-02-15', 11600, '15', false, '24'),
  fill('e', '2026-02-28', 12500, '50', true, '75'),
];

test('full-to-full cycles include intermediate partial fills and omit the initial tank volume', () => {
  const vehicle = vehicleOf(sequence()), original = structuredClone(vehicle);
  const data = fuelStatistics(vehicle, options);
  assert.deepEqual(data.cycles.map(({ litres, distance, consumption }) => ({ litres, distance, consumption })), [
    { litres: '60', distance: 1000, consumption: 6 },
    { litres: '65', distance: 1500, consumption: 65 / 1500 * 100 },
  ]);
  assert.equal(data.consumption, 5);
  assert.equal(data.cycleDistance, 2500);
  assert.equal(data.distance, 2500);
  assert.equal(data.cost, '269');
  assert.deepEqual(vehicle, original);
});

test('two mileage observations enclosing unnumbered full tanks yield a labelled estimate', () => {
  const vehicle = vehicleOf([
    reading('before', '2026-01-01', 10000),
    fill('start', '2026-01-06', null, '50', true),
    fill('end', '2026-01-16', null, '30', true),
    reading('after', '2026-01-21', 11000),
  ]);
  const before = structuredClone(vehicle), data = fuelStatistics(vehicle, options);
  assert.deepEqual(data.cycles.map(({ distance, consumption, estimated }) => ({ distance, consumption, estimated })), [
    { distance: 500, consumption: 6, estimated: true },
  ]);
  assert.equal(data.estimatedCycles, 1);
  assert.equal(data.buckets[0].estimatedCycles, 1);
  assert.deepEqual(vehicle, before);
});

test('known full tank counters remain exact while only a missing boundary is interpolated', () => {
  const data = fuelStatistics(vehicleOf([
    reading('before', '2026-01-01', 10000),
    fill('a', '2026-01-06', 10250, '50', true),
    fill('b', '2026-01-16', null, '40', true),
    reading('after', '2026-01-21', 11000),
  ]), options);
  assert.equal(data.cycles[0].distance, 500);
  assert.equal(data.cycles[0].consumption, 8);
  assert.equal(data.cycles[0].estimated, true);
  const exact = fuelStatistics(vehicleOf([
    fill('a', '2026-01-06', 10250, '50', true),
    fill('b', '2026-01-16', 10750, '40', true),
  ]), options);
  assert.equal(exact.cycles[0].distance, 500);
  assert.equal(exact.cycles[0].estimated, false);
  assert.equal(exact.estimatedCycles, 0);
});

test('intermediate readings improve each interpolation rather than averaging over the entire span', () => {
  const data = fuelStatistics(vehicleOf([
    reading('before', '2026-01-01', 10000),
    fill('a', '2026-01-03', null, '50', true),
    reading('middle', '2026-01-11', 10500),
    fill('b', '2026-01-13', null, '35', true),
    reading('after', '2026-01-21', 12000),
  ]), options);
  assert.equal(data.cycles[0].distance, 700);
  assert.equal(data.cycles[0].consumption, 5);
  assert.equal(data.cycles[0].estimated, true);
});

test('estimated and exact cycles combine by distance and flag only affected months', () => {
  const vehicle = vehicleOf([
    fill('a', '2026-01-01', 1000, '50', true),
    fill('b', '2026-01-11', 1500, '30', true),
    fill('c', '2026-02-10', null, '40', true),
    reading('after', '2026-03-12', 2500),
  ]);
  const data = fuelStatistics(vehicle, options);
  assert.ok(Math.abs(data.consumption - 7) < 1e-10);
  assert.equal(data.cycleDistance, 1000);
  assert.equal(data.estimatedCycles, 1);
  assert.equal(data.buckets.find((month) => month.key === '2026-01').estimatedCycles, 0);
  assert.equal(data.buckets.find((month) => month.key === '2026-02').estimatedCycles, 1);
  const estimatedMarkup = fuelMarkup(vehicle, options);
  assert.match(estimatedMarkup, /fuel-estimated-card/);
  assert.match(estimatedMarkup, /fuel-estimated-point/);
  assert.match(estimatedMarkup, /≈/);
  assert.match(estimatedMarkup, /Estimation/);
  assert.doesNotMatch(fuelMarkup(vehicleOf(sequence()), options), /fuel-estimated-card|fuel-estimated-value|fuel-estimated-point/);
});

test('missing brackets, contradictory readings and zero estimated distance remain unknown', () => {
  const cases = [
    [reading('before', '2026-01-01', 10000)],
    [reading('before', '2026-01-01', 10000), reading('conflict-a', '2026-01-11', 10500), reading('conflict-b', '2026-01-11', 10600), reading('after', '2026-01-21', 11000)],
    [reading('before', '2026-01-01', 10000), reading('decrease', '2026-01-11', 9000), reading('after', '2026-01-21', 11000)],
    [reading('before', '2026-01-01', 10000), reading('after', '2026-01-21', 10000)],
  ];
  for (const readings of cases) {
    const data = fuelStatistics(vehicleOf([
      ...readings,
      fill('a', '2026-01-06', null, '50', true),
      fill('b', '2026-01-16', null, '40', true),
    ]), options);
    assert.equal(data.consumption, null);
    assert.equal(data.estimatedCycles, 0);
    assert.ok(data.issues.length);
  }
});

test('partial fills need no counter when their date orders them between complete tanks', () => {
  const data = fuelStatistics(vehicleOf([
    fill('a', '2026-01-01', 10000, '50', true),
    fill('partial', '2026-01-05', null, '20', false),
    fill('b', '2026-01-10', 11000, '40', true),
  ]), options);
  assert.equal(data.consumption, 6);
  assert.equal(data.cycles[0].estimated, false);
  assert.equal(data.issues.length, 0);
  const ambiguous = fuelStatistics(vehicleOf([
    fill('a', '2026-01-01', 10000, '50', true),
    fill('partial', '2026-01-10', null, '20', false),
    fill('b', '2026-01-10', 11000, '40', true),
  ]), options);
  assert.equal(ambiguous.consumption, null);
  assert.ok(ambiguous.issues.some(({ reason }) => reason === 'ambiguous'));
});

test('monthly costs follow purchase dates while cycles and distances follow their final reading', () => {
  const data = fuelStatistics(vehicleOf(sequence()), options);
  const [january, february] = data.buckets;
  assert.deepEqual({ key: january.key, cost: january.cost, litres: january.litres, distance: january.distance, consumption: january.consumption }, { key: '2026-01', cost: '110', litres: '70', distance: 400, consumption: null });
  assert.deepEqual({ key: february.key, cost: february.cost, litres: february.litres, distance: february.distance, consumption: february.consumption }, { key: '2026-02', cost: '159', litres: '105', distance: 2100, consumption: 5 });
  assert.equal(february.cycles.length, 2);
});

test('a tank baseline before the selected period remains available without including its purchase cost', () => {
  const data = fuelStatistics(vehicleOf([
    fill('a', '2025-11-20', 10000, '50', true, '80'),
    fill('b', '2025-12-20', 10400, '20', false, '30'),
    fill('c', '2026-01-20', 11000, '40', true, '60'),
    fill('future', '2026-12-01', 12000, '60', true, '100'),
    fill('plan', '2026-10-01', 12000, '60', true, '100', { status: 'planned' }),
  ]), { ...options, period: '12m' });
  assert.equal(data.consumption, 6);
  assert.equal(data.cost, '90');
  assert.equal(data.records.length, 2);
  assert.equal(data.future, 1);
  assert.equal(data.buckets.length, 12);
  assert.equal(data.buckets[0].key, '2025-12');
  assert.equal(data.buckets[0].distance, null);
  assert.equal(data.buckets[1].distance, 600);
  assert.equal(data.distance, 600);
  assert.equal(data.buckets.at(-1).cost, null);
});

test('missing quantities break a cycle but a subsequent complete tank can start a new one', () => {
  const data = fuelStatistics(vehicleOf([
    fill('a', '2026-01-01', 10000, null, true),
    fill('unknown', '2026-01-05', 10500, null, false),
    fill('b', '2026-01-10', 11000, '30', true),
    fill('middle', '2026-01-15', 11500, '20', null),
    fill('c', '2026-01-20', 12000, '40', true),
  ]), options);
  assert.equal(data.cycles.length, 1);
  assert.equal(data.cycles[0].from.id, 'b');
  assert.equal(data.cycles[0].litres, '60');
  assert.equal(data.consumption, 6);
});

test('undated actual fuel entries keep consumption unknown until their chronology is resolved', () => {
  const garage = garageOf([...sequence(), fill('undated', null, null, '10', false)]);
  assert.equal(fuelStatistics(garage.vehicles[0], options).consumption, null);
  assert.equal(fuelStatistics(garage.vehicles[0], options).undated, 1);
  const trashed = moveRecordToTrash(garage, 'fiction', 'undated', '2026-11-08T10:20:30.000Z');
  assert.equal(fuelStatistics(trashed.vehicles[0], options).consumption, 5);
  assert.equal(fuelStatistics(restoreTrashedRecord(trashed, 'fiction', 'undated').vehicles[0], options).consumption, null);
});

test('decreasing, zero-distance and ambiguous counters never produce fabricated consumption', () => {
  for (const records of [
    [fill('a', '2026-01-01', 10000, '50', true), fill('b', '2026-01-05', 9000, '40', true)],
    [fill('a', '2026-01-01', 10000, '50', true), fill('b', '2026-01-05', 10000, '40', true)],
    [fill('a', '2026-01-01', 10000, '50', true), fill('b', '2026-01-05', 11000, '40', true), fill('duplicate', '2026-01-05', 11000, '40', true)],
    [fill('a', '2026-01-01', 10000, '50', true), fill('b', '2026-01-05', 11000, '40', true), fill('unknown', '2026-01-05', null, '10', false)],
  ]) {
    const data = fuelStatistics(vehicleOf(records), options);
    assert.equal(data.consumption, null);
    assert.ok(data.issues.length);
    assert.doesNotMatch(fuelMarkup(vehicleOf(records), options), /NaN|Infinity/);
  }
});

test('multiple fills in one day can be ordered by distinct known odometer readings', () => {
  const data = fuelStatistics(vehicleOf([
    fill('a', '2026-01-01', 10000, '50', true),
    fill('b', '2026-01-05', 10500, '20', false),
    fill('c', '2026-01-05', 11000, '40', true),
  ]), options);
  assert.equal(data.consumption, 6);
  assert.equal(data.cycles.length, 1);
});

test('zero, refunds, unknown costs and exact decimal subtotals remain distinguishable', () => {
  const data = fuelStatistics(vehicleOf([
    fill('a', '2026-01-01', 10000, '10.000000000000000001', true, '10.005'),
    fill('b', '2026-01-05', 10100, '10.000000000000000002', false, '10.005'),
    fill('c', '2026-01-10', 10200, null, false, '-1.01'),
    fill('unknown', '2026-01-15', 10300, null, false),
    fill('zero', '2026-02-01', 10400, '10', false, '0'),
  ]), options);
  assert.equal(data.cost, '19');
  assert.equal(data.partialCost, 1);
  assert.equal(data.buckets[0].litres, '20.000000000000000003');
  assert.equal(data.buckets[0].missingLitres, 2);
  assert.equal(data.buckets[1].cost, '0');
  assert.equal(data.buckets[1].partialCost, 0);
});

test('monthly distances use all dated observations and distinguish a known zero from a gap', () => {
  const readings = [fill('a', '2026-01-01', 10000, null, null), fill('b', '2026-02-01', 10000, null, null)].map((record) => ({ ...record, type: 'reading' }));
  const data = fuelStatistics(vehicleOf(readings), { ...options, period: '12m' });
  assert.equal(data.cost, null);
  assert.equal(data.distance, 0);
  assert.equal(data.buckets.find((month) => month.key === '2026-02').distance, 0);
  assert.equal(data.buckets.find((month) => month.key === '2026-03').distance, null);
  assert.equal(data.buckets.find((month) => month.key === '2026-01').distance, null);
});

test('fuel stays separate from maintenance expenses and is counted once in all-event spending', () => {
  const vehicle = vehicleOf(sequence());
  assert.equal(vehicleStats(vehicle, 'all').amount, '0');
  assert.equal(vehicleStats(vehicle, 'all', 'all').amount, '269');
  assert.equal(spendingHistory(vehicle, options).amount, null);
  assert.equal(spendingHistory(vehicle, { ...options, scope: 'all' }).amount, '269');
});

test('fuel records and nested unknown fields survive portable backups, trash and restoration', async () => {
  const records = sequence(); records[0].fuel.source = { station: 'Station fictive', value: '001234' };
  const original = garageOf(records);
  const trash = moveRecordToTrash(original, 'fiction', 'a', '2026-11-08T10:20:30.000Z');
  const imported = await readBackupFile(new File([backupBlob(trash)], 'carburant-fictif.json'));
  const restored = restoreTrashedRecord(imported.garage, 'fiction', 'a');
  assert.deepEqual(restored.vehicles[0].records, original.vehicles[0].records);
  assert.equal(fuelStatistics(restored.vehicles[0], options).consumption, 5);
});

test('invalid litres or full-tank flags are rejected before importing active or trashed records', () => {
  for (const fuel of [{ litres: '-1' }, { litres: '0' }, { litres: 20 }, { litres: '10001' }, { litres: '1e2' }, { litres: '5', fullTank: 'true' }, null, []]) {
    assert.throws(() => vehicleOf([fill('a', '2026-01-01', 10000, '50', true, null, { fuel })]));
    const garage = moveRecordToTrash(garageOf(sequence()), 'fiction', 'a', '2026-11-08T10:20:30.000Z');
    garage.vehicles[0].trashedRecords[0].record.fuel = fuel;
    assert.throws(() => parseGarage(JSON.stringify(garage)));
  }
  assert.equal(fuelStatistics(vehicleOf([{ id: 'legacy', title: 'Carburant fictif ancien', type: 'fuel' }]), options).consumption, null);
});

test('empty and incomplete charts stay finite, retain gaps and escape record titles', () => {
  assert.deepEqual(fuelStatistics(vehicleOf([]), options).buckets, []);
  const records = sequence(); records[1].title = '<img src=x onerror=alert(1)>';
  const html = fuelMarkup(vehicleOf(records), options);
  assert.match(html, /&lt;img src=x/);
  assert.doesNotMatch(html, /<img|NaN|Infinity/);
  assert.match(html, /L\/100 km/);
  assert.match(html, /Distance relevée/);
});

