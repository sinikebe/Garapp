import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage } from '../public/assets/js/garage.js';
import { graphData, graphLayout, distanceColumns, graphExpenseCategories } from '../public/assets/js/graph-data.js';
import { explorerSvg, explorerSelection } from '../public/assets/js/graph-view.js';
import { expensesMarkup, expenseCategoriesMarkup } from '../public/assets/js/overview-view.js';
import { statisticsMarkup } from '../public/assets/js/statistics-view.js';

const options = { date: '2026-11-26' };
const reading = (id, date, odometer, extra = {}) => ({ id, title: `Relevé fictif ${id}`, type: 'reading', date, odometer, ...extra });
const vehicle = (records) => parseGarage(JSON.stringify({ version: 2, vehicles: [{ id: 'fiction', name: 'Véhicule fictif', components: [], records }] })).vehicles[0];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('annual columns are the default and combine all observed intervals without changing source data', () => {
  const source = vehicle([reading('a', '2025-01-01', 10000), reading('b', '2026-01-01', 22000), reading('c', '2026-11-01', 32000)]);
  const before = structuredClone(source), data = graphData(source, options), layout = graphLayout(data);
  assert.equal(layout.grouping, 'year');
  assert.deepEqual(layout.columns.map(column => column.key), ['2025', '2026']);
  near(layout.columns[0].value, 12000); near(layout.columns[1].value, 10000);
  assert.equal(layout.columns[0].partial, false); assert.equal(layout.columns[1].partial, true);
  assert.equal(layout.lanes.some(lane => lane.key === 'distance'), false);
  assert.match(explorerSvg(layout), /data-distance-period="2025"/);
  assert.match(explorerSelection(data, layout, '2026-01-01'), /Kilomètres parcourus/);
  assert.deepEqual(source, before);
});

test('monthly splits use real elapsed days, conserve the interval distance and disclose estimation', () => {
  const data = graphData(vehicle([reading('a', '2026-01-01', 10000), reading('b', '2026-03-01', 15900)]), options);
  const columns = distanceColumns(data, 'month');
  assert.deepEqual(columns.map(column => column.key), ['2026-01', '2026-02']);
  near(columns[0].value, 3100); near(columns[1].value, 2800);
  near(columns.reduce((sum, column) => sum + column.value, 0), 5900);
  assert.ok(columns.every(column => column.estimated));
  const layout = graphLayout(data, { grouping: 'month' });
  assert.match(explorerSvg(layout), /explorer-distance-column is-estimated/);
  assert.match(explorerSelection(data, layout, '2026-02-01'), /≈.*3[\s\u202f]100/);
});

test('leap years and zoomed periods use bracketing history without extrapolation', () => {
  const data = graphData(vehicle([reading('a', '2024-01-01', 1000), reading('b', '2024-03-01', 7000)]), options);
  const columns = distanceColumns(data, 'month'); near(columns[0].value, 3100); near(columns[1].value, 2900);
  const zoom = graphLayout(data, { from: '2024-02-01', to: '2024-02-15', grouping: 'month', measures: ['mileage', 'distance'] });
  near(zoom.columns[0].value, 1400); assert.equal(zoom.columns[0].partial, true);
  assert.match(explorerSvg(zoom), /data-distance-period="2024-02"/);
  assert.match(explorerSelection(data, zoom, '2024-02-15'), /data-record="a"/);
  assert.match(explorerSelection(data, zoom, '2024-02-15'), /data-record="b"/);
  assert.equal(distanceColumns(data, 'year', '2025-01-01', '2026-01-01').length, 0);
});

test('conflicts and decreases stay unknown, known zero stays zero and incomplete years retain their limits', () => {
  const conflict = graphData(vehicle([reading('a', '2026-01-01', 1000), reading('conflict', '2026-01-01', 1100), reading('b', '2026-02-01', 2000)]), options);
  const unknown = distanceColumns(conflict)[0]; assert.equal(unknown.value, null); assert.ok(unknown.issues > 0);
  const decreasing = graphData(vehicle([reading('a', '2026-01-01', 2000), reading('b', '2026-02-01', 1000)]), options);
  assert.equal(distanceColumns(decreasing)[0].value, null);
  const zero = graphData(vehicle([reading('a', '2026-01-01', 1000), reading('b', '2026-02-01', 1000)]), options);
  assert.equal(distanceColumns(zero)[0].value, 0);
  assert.match(explorerSvg(graphLayout(zero)), /data-distance-period="2026"/);
  assert.equal(distanceColumns(graphData(vehicle([reading('single', '2026-01-01', 1000)]), options)).length, 0);
});

test('distance is drawn in its own lane if the odometer is hidden and hiding distance removes its columns', () => {
  const data = graphData(vehicle([reading('a', '2026-01-01', 1000), reading('b', '2026-03-01', 3000)]), options);
  const separate = graphLayout(data, { measures: ['distance'], grouping: 'month' });
  assert.equal(separate.columns.length, 0); assert.equal(separate.lanes[0].key, 'distance'); assert.equal(separate.lanes[0].mode, 'bars');
  const hidden = graphLayout(data, { measures: ['mileage'] }); assert.equal(hidden.columns.length, 0);
});

test('the financial breakdown follows graph dates and exact scope totals while other views retain numbers only', () => {
  const source = vehicle([
    reading('a', '2026-01-01', 1000, { type: 'entretien', totalAmount: '12.123456789012345678' }),
    reading('b', '2026-01-02', 1500, { type: 'entretien', totalAmount: '-0.123456789012345678' }),
    reading('c', '2026-02-01', 2000, { type: 'fuel', totalAmount: '50' }),
  ]);
  const categories = graphExpenseCategories(graphData(source, options), '2026-01-01', '2026-01-31');
  assert.deepEqual(categories, [{ type: 'entretien', amount: '12' }]);
  assert.match(expenseCategoriesMarkup(categories, true), /expense-track/);
  assert.doesNotMatch(expensesMarkup(source, { period: 'all' }), /expense-track/);
  assert.doesNotMatch(statisticsMarkup(source, options).html, /<svg|data-mileage-operations/);
});
