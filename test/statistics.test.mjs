import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exampleGarage, parseGarage, recordCost } from '../public/assets/js/garage.js';
import { sumAmounts } from '../public/assets/js/amounts.js';
import { mileageHistory, mileageGeometry, spendingHistory, statisticsRange, chartScale } from '../public/assets/js/statistics.js';
import { statisticsMarkup } from '../public/assets/js/statistics-view.js';

const date = '2026-11-07';
const vehicle = (records = [], fields = {}) => parseGarage(JSON.stringify({ version: 2, vehicles: [{ id: 'fiction', name: 'Véhicule fictif de test', records, components: [], ...fields }] })).vehicles[0];
const record = (id, fields = {}) => ({ id, title: `Fiche fictive ${id}`, type: 'entretien', ...fields });

test('mileage uses dated actual readings including zero, without guessing dates or planned values', () => {
  const current = vehicle([
    record('zero', { date: '2026-01-01', odometer: 0, status: 'incomplete' }),
    record('planned', { date: '2026-01-02', odometer: 900, status: 'planned' }),
    record('undated', { odometer: 999 }), record('unknown', { date: '2026-01-03' }),
    record('future', { date: '2027-01-01', odometer: 2000 }),
  ], { odometer: 200, odometerDate: '2026-01-03', custom: { source: 'synthetic-preserved' } });
  const before = structuredClone(current), history = mileageHistory(current, { date });
  assert.deepEqual(history.readings.map((one) => one.odometer), [0, 200]);
  assert.equal(history.distance, 200); assert.equal(history.days, 2); assert.equal(history.annualized, null);
  assert.deepEqual(history.omitted, { planned: 1, missingDate: 1, missingOdometer: 1, future: 1, outsidePeriod: 0 });
  assert.deepEqual(current, before);
  const undatedCurrent = mileageHistory(vehicle([], { odometer: 1234 }), { date });
  assert.equal(undatedCurrent.readings.length, 0); assert.equal(undatedCurrent.distance, null);
});

test('equal same-day readings retain every source and different values remain ambiguous', () => {
  const same = vehicle([record('a', { date: '2026-01-01', odometer: 100 }), record('b', { date: '2026-01-01', odometer: 100 })], { odometer: 100, odometerDate: '2026-01-01' });
  const result = mileageHistory(same, { date });
  assert.equal(result.groups.length, 1); assert.equal(result.readings.length, 3); assert.equal(result.conflicts.length, 0); assert.equal(result.distance, null);
  const different = vehicle([...same.records, record('next', { date: '2026-02-01', odometer: 200 })], { odometer: 110, odometerDate: '2026-01-01' });
  const history = mileageHistory(different, { date });
  assert.equal(history.conflicts.length, 1); assert.deepEqual(history.groups[0].values, [100, 110]);
  assert.equal(history.distance, null); assert.equal(history.annualized, null);
  const { html } = statisticsMarkup(different, { date });
  assert.match(html, /Relevés à vérifier/); assert.doesNotMatch(html, /class="chart-line"/);
});

test('a decreasing counter stays visible and prevents misleading distance and annualized estimates', () => {
  const current = vehicle([record('first', { date: '2026-01-01', odometer: 1000 }), record('second', { date: '2026-03-01', odometer: 900 }), record('third', { date: '2026-05-01', odometer: 1200 })]);
  const result = mileageHistory(current, { date });
  assert.equal(result.decreases.length, 1); assert.equal(result.distance, null); assert.equal(result.annualized, null);
  assert.deepEqual(result.groups.map((group) => group.values[0]), [1000, 900, 1200]);
  assert.match(statisticsMarkup(current, { date }).html, /chart-warning-line/);
});

test('the chart uses elapsed days rather than observation indexes and calendar calculations ignore DST', () => {
  const current = vehicle([record('first', { date: '2026-01-01', odometer: 0 }), record('close', { date: '2026-01-02', odometer: 10 }), record('far', { date: '2026-04-11', odometer: 1000 })]);
  const history = mileageHistory(current, { date }), plot = mileageGeometry(history);
  assert.equal(history.days, 100); assert.equal(history.annualized, 3652.425);
  assert.ok(Math.abs((plot.points[1].x - plot.points[0].x) / (plot.points[2].x - plot.points[0].x) - .01) < 1e-10);
  const leap = mileageHistory(vehicle([record('a', { date: '2024-02-28', odometer: 0 }), record('b', { date: '2024-03-01', odometer: 20 })]), { date });
  assert.equal(leap.days, 2);
});

test('periods include complete earlier calendar months and only actual observations inside the interval', () => {
  assert.deepEqual(statisticsRange('12m', date), { period: '12m', start: '2025-12-01', end: date });
  assert.equal(statisticsRange('36m', date).start, '2023-12-01');
  assert.equal(statisticsRange('invalid', date).period, 'all');
  const result = mileageHistory(vehicle([record('outside', { date: '2025-11-30', odometer: 0 }), record('inside', { date: '2025-12-01', odometer: 10 }), record('last', { date, odometer: 100 })]), { date, period: '12m' });
  assert.equal(result.omitted.outsidePeriod, 1); assert.equal(result.distance, 90); assert.equal(result.first.date, '2025-12-01');
});

test('expense charts preserve exact invoice totals, refunds, partial subtotals, unknowns and known zeros', () => {
  const current = vehicle([
    record('invoice', { date: '2026-01-02', totalAmount: '12.123456789012345678', lines: [{ id: 'detail', label: 'Ligne fictive', amount: '1' }] }),
    record('refund', { date: '2026-01-03', totalAmount: '-0.123456789012345678' }),
    record('unknown', { date: '2026-02-02' }),
    record('zero', { date: '2026-04-02', totalAmount: '0' }),
    record('partial', { date: '2026-05-02', lines: [{ id: 'known', label: 'Ligne connue fictive', amount: '10.5' }, { id: 'unknown', label: 'Ligne à compléter fictive', amount: null }] }),
  ]);
  const result = spendingHistory(current, { date });
  assert.equal(result.amount, '22.5'); assert.equal(result.partial, 2);
  assert.equal(result.buckets[0].amount, '12');
  assert.equal(result.buckets[1].amount, null); assert.equal(result.buckets[1].records.length, 1);
  assert.equal(result.buckets[2].amount, null); assert.equal(result.buckets[2].records.length, 0);
  assert.equal(result.buckets[3].amount, '0'); assert.equal(result.buckets[4].amount, '10.5');
  assert.match(statisticsMarkup(current, { date }).html, /chart-bar-partial/);
});

test('expense scope excludes planned records, future dates and undated entries without inventing a timeline', () => {
  const current = vehicle([
    record('past', { date: '2026-01-01', totalAmount: '10' }),
    record('planned', { date: '2026-01-01', totalAmount: '20', status: 'planned' }),
    record('future', { date: '2027-01-01', totalAmount: '30' }),
    record('undated', { totalAmount: '40' }),
    record('reading', { date: '2026-02-01', totalAmount: '50', type: 'reading' }),
  ]);
  const result = spendingHistory(current, { date });
  assert.equal(result.amount, '10'); assert.equal(result.records.length, 1);
  assert.deepEqual(result.omitted, { undated: 1, future: 1, planned: 1, outsidePeriod: 0 });
  assert.equal(spendingHistory(current, { date, scope: 'all' }).amount, '60');
});

test('long histories aggregate annually while partial years and empty years retain their meaning', () => {
  const current = vehicle([record('old', { date: '2020-10-01', totalAmount: '1' }), record('recent', { date: '2026-02-01', totalAmount: '2' })]);
  const all = spendingHistory(current, { date });
  assert.equal(all.unit, 'year'); assert.equal(all.buckets.length, 7); assert.equal(all.amount, '3');
  assert.equal(all.buckets[1].amount, null);
  const recent = spendingHistory(current, { date, period: '12m' });
  assert.equal(recent.unit, 'month'); assert.equal(recent.amount, '2'); assert.equal(recent.buckets.length, 12); assert.equal(recent.buckets[0].key, '2025-12');
});

test('invoices associated with multiple components count once and original portable data remains intact', async () => {
  const garage = parseGarage(await readFile(new URL('../docs/examples/garage-v2.json', import.meta.url), 'utf8'));
  const before = structuredClone(garage);
  for (const current of garage.vehicles) {
    const expected = sumAmounts(current.records.filter((one) => one.status !== 'planned' && one.date && one.date <= date).map((one) => { const cost = recordCost(one); return cost.total ?? cost.subtotal; }));
    const result = spendingHistory(current, { date, scope: 'all' });
    assert.equal(result.amount, result.records.length ? expected : null);
    statisticsMarkup(current, { date });
  }
  assert.deepEqual(garage, before);
});

test('empty, flat and single-point charts remain finite and source labels are escaped', () => {
  const cases = [vehicle(), vehicle([record('flat', { date, odometer: 0, totalAmount: '0' })]), vehicle([record('unsafe', { title: '<img src=x onerror=alert(1)>', date, odometer: 500, totalAmount: '-10' })]), exampleGarage(date).vehicles[0]];
  for (const current of cases) {
    const result = statisticsMarkup(current, { date });
    assert.doesNotMatch(result.html, /NaN|Infinity|<img|<script/);
    for (const point of result.plot.points) { assert.ok(Number.isFinite(point.x)); for (const y of point.ys) assert.ok(Number.isFinite(y)); }
  }
  assert.match(statisticsMarkup(cases[2], { date }).html, /&lt;img/);
  const frame = { height: 200, top: 10, bottom: 20 };
  for (const values of [[], [0], [500, 500], [-30, 50]]) {
    const scale = chartScale(values, frame, { includeZero: true });
    assert.ok(scale.max > scale.min); assert.ok(scale.ticks.every((tick) => Number.isFinite(tick.y)));
  }
});
