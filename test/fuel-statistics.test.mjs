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

const withCapacity = (records, capacity = '50') => {
  const garage = garageOf(records);
  garage.vehicles[0].fuelTankCapacity = capacity;
  return parseGarage(JSON.stringify(garage)).vehicles[0];
};
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('estimated cost uses the previous tank mixture and carries it across cycles and period filters', () => {
  const vehicle = withCapacity([
    fill('a', '2025-12-01', 1000, '35', true, '70'),
    fill('b', '2026-01-01', 1500, '30', true, '45'),
    fill('c', '2026-02-01', 2000, '25', true, '50'),
  ]);
  const original = structuredClone(vehicle), data = fuelStatistics(vehicle, options);
  near(data.cycles[0].estimatedCostPerKm, 0.12);
  near(data.cycles[1].estimatedCostPerKm, 0.085);
  near(data.estimatedCostPerKm, 0.1025);
  assert.equal(data.costedCycles, 2);
  assert.equal(data.uncostedCycles, 0);
  assert.equal(data.costedCycleDistance, 1000);
  const filtered = fuelStatistics(vehicle, { ...options, period: '12m', date: '2027-01-15' });
  near(filtered.estimatedCostPerKm, 0.085);
  assert.equal(filtered.costedCycles, 1);
  assert.equal(filtered.effectiveTankCapacity, 50);
  assert.deepEqual(vehicle, original);
  vehicle.records[2].odometer = 2500;
  near(fuelStatistics(vehicle, options).estimatedCostPerKm, (60 + 42.5) / 1500);
  vehicle.fuelTankCapacity = '20';
  assert.equal(fuelStatistics(vehicle, { ...options, period: '12m', date: '2027-01-15' }).effectiveTankCapacity, 35);
});

test('capacity is derived from all admissible fills and falls again after corrections or trash', () => {
  const records = [
    fill('a', '2026-01-01', 1000, '35', true, '70'),
    fill('b', '2026-02-01', 1500, '30', true, '45'),
    fill('c', '2026-03-01', 2000, '25', true, '50'),
    fill('record', '2026-04-01', 2500, '70', true, '140'),
    fill('future', '2026-12-01', 3000, '90', true, '180'),
    fill('plan', '2026-06-01', 3000, '95', true, '190', { status: 'planned' }),
  ];
  const vehicle = withCapacity(records);
  assert.equal(fuelStatistics(vehicle, options).effectiveTankCapacity, 70);
  assert.equal(vehicle.fuelTankCapacity, '50');
  vehicle.records.find((record) => record.id === 'record').fuel.litres = '40';
  const corrected = fuelStatistics(vehicle, options);
  assert.equal(corrected.effectiveTankCapacity, 50);
  near(corrected.cycles[1].estimatedCostPerKm, 0.085);
  const garage = garageOf(records);
  const trashed = moveRecordToTrash(garage, 'fiction', 'record', '2026-11-08T10:20:30.000Z');
  assert.equal(fuelStatistics(trashed.vehicles[0], options).effectiveTankCapacity, 35);
  assert.equal(fuelStatistics(restoreTrashedRecord(trashed, 'fiction', 'record').vehicles[0], options).effectiveTankCapacity, 70);
  const withoutTheory = fuelStatistics(vehicleOf(records.slice(0, 3)), options);
  assert.equal(withoutTheory.effectiveTankCapacity, 35);
  assert.equal(withoutTheory.theoreticalTankCapacity, null);
});

test('partial fills distribute consumption by distance and blend prices successively', () => {
  const vehicle = withCapacity([
    fill('a', '2026-01-01', 1000, '30', true, '60'),
    fill('partial', '2026-01-11', 1250, '10', false, '10'),
    fill('b', '2026-01-21', 1500, '30', true, '90'),
    fill('c', '2026-02-01', 2000, '20', true, '20'),
  ]);
  const data = fuelStatistics(vehicle, options);
  // First 20 L at 2 €/L, then 20 L at (30*2+10*1)/40 = 1.75 €/L.
  near(data.cycles[0].estimatedFuelCost, 75);
  near(data.cycles[0].estimatedCostPerKm, 0.15);
  near(data.cycles[1].estimatedFuelCost, 50);
  assert.equal(data.consumption, 6);
  vehicle.records[1].odometer = null;
  near(fuelStatistics(vehicle, options).cycles[0].estimatedFuelCost, 75);
  for (const missingPrice of [null, '-10']) {
    vehicle.records[1].totalAmount = missingPrice;
    const incomplete = fuelStatistics(vehicle, options);
    assert.equal(incomplete.cycles[0].estimatedCostPerKm, null);
    assert.equal(incomplete.consumption, 6);
  }
});

test('impossible partial allocation invalidates only the new cost and not existing consumption', () => {
  for (const [partialCounter, litres] of [[1010, '30'], [1490, '5']]) {
    const data = fuelStatistics(withCapacity([
      fill('a', '2026-01-01', 1000, '30', true, '60'),
      fill('partial', '2026-01-10', partialCounter, litres, false, '10'),
      fill('b', '2026-02-01', 1500, '50', true, '100'),
    ]), options);
    assert.notEqual(data.consumption, null);
    assert.equal(data.estimatedCostPerKm, null);
    assert.equal(data.uncostedCycles, 1);
  }
  const data = fuelStatistics(withCapacity([
    fill('a', '2026-01-01', 1000, '30', true, '60'),
    fill('partial', '2026-01-10', null, '10', false, '10'),
    fill('b', '2026-01-10', 1500, '30', true, '60'),
  ]), options);
  assert.equal(data.estimatedCostPerKm, null);
});

test('unknown purchase prices propagate but do not affect fuel consumed before that purchase', () => {
  const vehicle = withCapacity([
    fill('a', '2026-01-01', 1000, '30', true, '60'),
    fill('b', '2026-02-01', 1500, '30', true),
    fill('c', '2026-03-01', 2000, '25', true, '50'),
    fill('d', '2026-04-01', 2500, '50', true, '100'),
    fill('e', '2026-05-01', 3000, '25', true, '0'),
  ]);
  const data = fuelStatistics(vehicle, options);
  near(data.cycles[0].estimatedCostPerKm, 0.12);
  assert.equal(data.cycles[1].estimatedCostPerKm, null);
  assert.equal(data.cycles[2].estimatedCostPerKm, null);
  near(data.cycles[3].estimatedCostPerKm, 0.1);
  near(data.estimatedCostPerKm, 0.11);
  assert.equal(data.uncostedCycles, 2);
  vehicle.records[0].totalAmount = null;
  assert.equal(fuelStatistics(vehicle, options).cycles[0].estimatedCostPerKm, null);
  vehicle.records[0].totalAmount = '0';
  assert.equal(fuelStatistics(vehicle, options).cycles[0].estimatedCostPerKm, 0);
});

test('missing quantities, dates and broken chronology never borrow a later purchase price', () => {
  for (const extra of [ { fuel: { litres: null, fullTank: false } }, { date: null }, { odometer: 900 } ]) {
    const data = fuelStatistics(withCapacity([
      fill('a', '2026-01-01', 1000, '30', true, '60'),
      fill('partial', '2026-01-15', 1200, '10', false, '20', extra),
      fill('b', '2026-02-01', 1500, '25', true, '50'),
      fill('c', '2026-03-01', 2000, '25', true, '50'),
    ]), options);
    assert.equal(data.estimatedCostPerKm, null);
  }
  const data = fuelStatistics(withCapacity([
    fill('a', '2026-01-01', 1000, '30', true),
    fill('b', '2026-02-01', 1500, '25', true, '50'),
  ]), options);
  assert.equal(data.estimatedCostPerKm, null);
});

test('non-finite purchase prices cannot enter estimated costs or their weighted average', () => {
  const vehicle = withCapacity([
    fill('a', '2026-01-01', 1000, '30', true, '60'),
    fill('b', '2026-02-01', 1500, '30', true, '60'),
    fill('c', '2026-03-01', 2000, '25', true, '50'),
  ]);
  // Defense in depth if an unvalidated caller bypasses the portable schema.
  vehicle.records[0].totalAmount = '1' + '0'.repeat(400);
  const data = fuelStatistics(vehicle, options);
  assert.equal(data.estimatedCostPerKm, null);
  assert.equal(data.costedCycles, 0);
  assert.equal(data.uncostedCycles, 2);
  for (const cycle of data.cycles) {
    assert.equal(cycle.estimatedFuelCost, null);
    assert.equal(cycle.estimatedCostPerKm, null);
  }
  assert.doesNotMatch(fuelMarkup(vehicle, options), /NaN|Infinity/);
});

test('optional tank capacity preserves portable precision, unknown fields and legacy absence', async () => {
  const original = garageOf(sequence());
  assert.equal(Object.hasOwn(original.vehicles[0], 'fuelTankCapacity'), false);
  assert.equal(Object.hasOwn(parseGarage(JSON.stringify(original)).vehicles[0], 'fuelTankCapacity'), false);
  original.vehicles[0].fuelTankCapacity = '50.123456789012345678';
  original.vehicles[0].tankSource = { label: 'Example specification' };
  const imported = await readBackupFile(new File([backupBlob(original)], 'example-tank.json'));
  assert.equal(imported.garage.vehicles[0].fuelTankCapacity, '50.123456789012345678');
  assert.deepEqual(imported.garage.vehicles[0].tankSource, original.vehicles[0].tankSource);
  for (const invalid of ['0', '-1', '10001', 50, '1e2', {}, true]) {
    original.vehicles[0].fuelTankCapacity = invalid;
    assert.throws(() => parseGarage(JSON.stringify(original)), /capacité théorique/);
  }
  original.vehicles[0].fuelTankCapacity = null;
  assert.equal(parseGarage(JSON.stringify(original)).vehicles[0].fuelTankCapacity, null);
});

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

test('monthly fuel prices are weighted by litres from the same complete purchases', () => {
  const vehicle = vehicleOf([
    fill('cheap', '2026-01-02', null, '20', false, '40'),
    fill('expensive', '2026-01-09', null, '80', false, '240'),
    fill('free', '2026-01-11', null, '10', false, '0'),
    fill('unknown-cost', '2026-01-14', null, '50', false),
    fill('partial-cost', '2026-01-17', null, '30', false, null, { partsAmount: '15', laborAmount: null }),
    fill('unknown-litres', '2026-01-21', null, null, false, '30'),
    fill('refund', '2026-01-25', null, '5', false, '-2'),
    fill('next-month', '2026-02-04', null, '20', false, '40'),
  ]);
  const original = structuredClone(vehicle), data = fuelStatistics(vehicle, options);
  const [january, february] = data.buckets;
  assert.equal(january.averagePricePerLitre, 280 / 110);
  assert.equal(january.priceExcluded, 4);
  assert.equal(february.averagePricePerLitre, 2);
  assert.equal(february.priceExcluded, 0);
  assert.equal(data.averagePricePerLitre, 320 / 130);
  assert.equal(data.priceExcluded, 4);
  assert.equal(data.consumption, null);
  assert.deepEqual(vehicle, original);
});

test('price stays unknown if no purchase has both a complete cost and litres', () => {
  const data = fuelStatistics(vehicleOf([
    fill('cost-only', '2026-01-03', null, null, false, '25'),
    fill('litres-only', '2026-01-08', null, '20', false),
  ]), options);
  assert.equal(data.buckets[0].averagePricePerLitre, null);
  assert.equal(data.buckets[0].priceExcluded, 2);
  assert.equal(data.averagePricePerLitre, null);
});

test('the fuel chart and table show the price even without a calculable consumption', () => {
  const html = fuelMarkup(vehicleOf([
    fill('first', '2026-01-03', null, '20', false, '40'),
    fill('second', '2026-02-03', null, '30', false, '75'),
    fill('incomplete', '2026-02-10', null, '10', false),
  ]), options);
  assert.match(html, /Prix moyen \(€\/L\)/);
  assert.match(html, /fuel-price-line/);
  assert.match(html, /fuel-price-point/);
  assert.match(html, /axe droit, €\/L/);
  assert.match(html, /1 achat\(s\) sans prix calculable/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

const costChart = (html) => html.match(/<svg id="fuel-cost-chart"[\s\S]*?<\/svg>/)?.[0];

test('a separate cost chart uses the consumed tank mixture and exposes euros per km and per 100 km', () => {
  const vehicle = withCapacity([
    fill('a', '2025-12-01', 1000, '35', true, '70'),
    fill('b', '2026-01-01', 1500, '30', true, '45'),
    fill('c', '2026-02-01', 2000, '25', true, '50'),
  ]);
  const snapshot = structuredClone(vehicle), html = fuelMarkup(vehicle, options), chart = costChart(html);
  assert.match(html, /id="fuel-consumption-chart"/);
  assert.match(chart, /fuel-estimated-line fuel-cost-line/);
  assert.equal((chart.match(/class="chart-point fuel-cost-point"/g) ?? []).length, 2);
  assert.match(chart, /environ 0,12 €\/km \(12 €\/100 km\)/);
  assert.match(chart, /environ 0,085 €\/km \(8,5 €\/100 km\)/);
  assert.match(chart, /pondérée par les kilomètres/);
  assert.match(chart, /aria-labelledby="fuel-cost-chart-title fuel-cost-chart-desc"/);
  assert.deepEqual(vehicle, snapshot);
});

test('unknown months interrupt the cost curve while zero and isolated known costs remain visible', () => {
  const chart = costChart(fuelMarkup(withCapacity([
    fill('a', '2026-01-01', 1000, '35', true, '70'),
    fill('b', '2026-02-01', 1500, '30', true, '45'),
    fill('c', '2026-04-01', 2000, '25', true, '50'),
  ]), options));
  assert.equal((chart.match(/class="chart-point fuel-cost-point"/g) ?? []).length, 2);
  assert.doesNotMatch(chart, /class="chart-line fuel-estimated-line fuel-cost-line"/);
  const zeroChart = costChart(fuelMarkup(withCapacity([
    fill('a', '2026-01-01', 1000, '35', true, '0'),
    fill('b', '2026-02-01', 1500, '30', true, '0'),
  ]), options));
  assert.match(zeroChart, /environ 0 €\/km \(0 €\/100 km\)/);
  assert.equal((zeroChart.match(/class="chart-point fuel-cost-point"/g) ?? []).length, 1);
  assert.doesNotMatch(zeroChart, /NaN|Infinity|class="chart-line fuel-estimated-line fuel-cost-line"/);
  const missing = fuelMarkup(withCapacity([
    fill('a', '2026-01-01', 1000, '35', true),
    fill('b', '2026-02-01', 1500, '30', true),
  ]), options);
  assert.equal(costChart(missing), undefined);
  assert.match(missing, /Aucun coût carburant au km estimable/);
  assert.match(missing, /id="fuel-consumption-chart"/);
});

test('both fuel charts use the same last 36 months while older months stay in the table', () => {
  const records = Array.from({ length: 41 }, (_, index) => {
    const year = 2023 + Math.floor(index / 12), month = String(index % 12 + 1).padStart(2, '0');
    return fill(`fill-${index}`, `${year}-${month}-01`, 1000 + index * 500, '20', true, '40');
  });
  const html = fuelMarkup(withCapacity(records), options), chart = costChart(html);
  assert.equal((chart.match(/class="chart-point fuel-cost-point"/g) ?? []).length, 36);
  assert.match(chart, /juin 2023/);
  assert.match(chart, /mai 2026/);
  assert.doesNotMatch(chart, /janv\. 2023/);
  assert.match(html, /janv\. 2023/);
  const consumptionChart = html.match(/<svg id="fuel-consumption-chart"[\s\S]*?<\/svg>/)[0];
  assert.match(consumptionChart, /juin 2023/);
  assert.match(consumptionChart, /mai 2026/);
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

