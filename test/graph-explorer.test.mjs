import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage } from '../public/assets/js/garage.js';
import { graphData, graphLayout, graphOperations, GRAPH_MEASURES } from '../public/assets/js/graph-data.js';
import { explorerSvg, explorerSelection, graphOperationMarkers } from '../public/assets/js/graph-view.js';
import { statisticsMarkup } from '../public/assets/js/statistics-view.js';

const options = { date: '2026-11-25', scope: 'all' };
const vehicleOf = (records, extra = {}) => parseGarage(JSON.stringify({ version: 2, vehicles: [{ id: 'fiction', name: 'Véhicule fictif', components: [], records, ...extra }] })).vehicles[0];
const event = (id, date, odometer, extra = {}) => ({ id, title: `Événement fictif ${id}`, date, odometer, type: 'reparation', ...extra });
const fuel = (id, date, odometer, litres, totalAmount) => event(id, date, odometer, { type: 'fuel', fuel: { litres, fullTank: true }, totalAmount });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('operation markers use actual dates, exclude planned/future/undated entries and retain unknown counters', () => {
  const vehicle = vehicleOf([
    event('known', '2026-01-01', 1000), event('unknown', '2026-01-02', null),
    event('planned', '2026-01-03', 1100, { status: 'planned' }),
    event('future', '2027-01-01', 1300), event('undated', null, 1400),
  ]);
  const snapshot = structuredClone(vehicle), data = graphData(vehicle, options);
  assert.deepEqual(graphOperations(vehicle, options).map(record => record.id), ['known', 'unknown']);
  assert.equal(data.operations[1].odometer, null);
  const layout = graphLayout(data, { measures: ['mileage'] }), svg = explorerSvg(layout);
  const mileageLane = graphOperationMarkers(layout, layout.lanes[0]);
  assert.match(mileageLane, /data-record="known"/);
  assert.doesNotMatch(mileageLane, /data-record="unknown"/);
  assert.match(svg, /data-record="unknown"/);
  assert.equal(data.omitted, 3);
  assert.deepEqual(vehicle, snapshot);
});

test('independent lane scales, date spacing and zoom keep different magnitudes readable', () => {
  const data = graphData(vehicleOf([
    event('a', '2026-01-01', 100000, { totalAmount: '10000' }),
    event('b', '2026-01-02', 100100, { totalAmount: '-25' }),
    event('c', '2026-01-11', 101000, { totalAmount: '0' }),
    event('d', '2026-03-01', 150000, { totalAmount: '1' }),
  ]), options);
  const all = graphLayout(data, { measures: ['mileage', 'spending'] });
  near((all.x('2026-01-02') - all.x('2026-01-01')) / (all.x('2026-01-11') - all.x('2026-01-01')), .1);
  assert.ok(all.lanes[0].max > 100000);
  assert.ok(all.lanes[1].max < 100000);
  assert.ok(all.lanes[1].min <= 0);
  const zoom = graphLayout(data, { measures: ['mileage'], from: '2026-01-01', to: '2026-01-11' });
  assert.ok(zoom.lanes[0].max < all.lanes[0].max);
  assert.equal(zoom.lanes.length, 1);
  assert.equal(zoom.lanes[0].points.length, 3);
  assert.ok(zoom.height < all.height);
  assert.ok(zoom.lanes[0].points.every(point => point.values.every(value => Number.isFinite(zoom.lanes[0].y(value)))));
});

test('legend type filters affect operation markers without recalculating the underlying measures', () => {
  const data = graphData(vehicleOf([
    event('repair', '2026-01-01', 1000, { totalAmount: '100' }),
    fuel('fill', '2026-01-02', 1200, '20', '40'),
  ]), options);
  const before = structuredClone(data);
  const filtered = graphLayout(data, { measures: ['mileage', 'spending'], hiddenTypes: ['fuel'] });
  assert.deepEqual(filtered.operations.map(record => record.id), ['repair']);
  assert.equal(filtered.lanes[0].points.length, 2);
  assert.equal(filtered.lanes[1].points[0].exact, '140\u00a0€');
  const empty = graphLayout(data, { measures: [], hiddenTypes: ['fuel', 'reparation'] });
  assert.match(explorerSvg(empty), /Activez une mesure/);
  assert.deepEqual(data, before);
});

test('monthly spending retains exact decimals, refunds, known zeros, incomplete subtotals and unknown months', () => {
  const data = graphData(vehicleOf([
    event('precise', '2026-01-01', null, { totalAmount: '12.123456789012345678' }),
    event('refund', '2026-01-02', null, { totalAmount: '-0.123456789012345678' }),
    event('unknown', '2026-02-01', null),
    event('zero', '2026-04-01', null, { totalAmount: '0' }),
    event('partial', '2026-05-01', null, { partsAmount: '10.5', laborAmount: null }),
  ]), options);
  const points = data.series.spending.points;
  assert.equal(points[0].exact, '12\u00a0€');
  assert.deepEqual(points[1].values, []);
  assert.deepEqual(points[2].values, []);
  assert.deepEqual(points[3].values, [0]);
  assert.equal(points[4].partial, true);
  assert.equal(points[4].estimated, undefined);
  const layout = graphLayout(data, { measures: ['spending'] });
  assert.match(explorerSelection(data, layout, '2026-05-31'), /10,5.*sous-total connu/);
});

test('fuel curves reuse the carried tank price outside the visible period, including estimated zero costs', () => {
  const vehicle = vehicleOf([
    fuel('a', '2025-12-01', 1000, '35', '70'),
    fuel('b', '2026-01-01', 1500, '30', '45'),
    fuel('c', '2026-02-01', 2000, '25', '50'),
  ], { fuelTankCapacity: '50' });
  const data = graphData(vehicle, { ...options, period: '12m', date: '2027-01-15' });
  const february = data.series.costkm.points.find(point => point.key === '2026-02');
  near(february.values[0], .085);
  assert.equal(february.estimated, true);
  const layout = graphLayout(data, { measures: ['costkm'], from: '2026-02-01', to: '2026-02-28' });
  assert.match(explorerSvg(layout), /0,085 €\/km/);
  assert.match(explorerSelection(data, layout, '2026-02-28'), /data-record="b"/);
  assert.match(explorerSelection(data, layout, '2026-02-28'), /data-record="c"/);
  const zero = graphData(vehicleOf([fuel('a', '2026-01-01', 0, '30', '0'), fuel('b', '2026-02-01', 500, '30', '0')]), options);
  assert.deepEqual(zero.series.costkm.points.find(point => point.key === '2026-02').values, [0]);
});

test('monthly distance links the dated odometer sources rather than unrelated purchases', () => {
  const data = graphData(vehicleOf([
    event('reading-a', '2026-01-01', 1000, { type: 'reading' }),
    event('reading-b', '2026-02-01', 1500, { type: 'reading' }),
  ]), options);
  const layout = graphLayout(data, { measures: ['distance'] });
  const detail = explorerSelection(data, layout, '2026-02-28');
  assert.match(detail, /500 km/);
  assert.match(detail, /data-record="reading-a"/);
  assert.match(detail, /data-record="reading-b"/);
});

test('missing months and contradictory counters break lines while duplicate operations remain accessible', () => {
  const data = graphData(vehicleOf([
    fuel('a', '2026-01-01', 1000, '30', '60'),
    fuel('b', '2026-02-01', 1500, '30', '60'),
    fuel('c', '2026-04-01', 2000, '30', '60'),
    event('conflict', '2026-04-01', 2100), event('same-day', '2026-04-01', 2100),
  ]), options);
  const layout = graphLayout(data, { measures: ['costkm', 'mileage'] }), svg = explorerSvg(layout);
  assert.equal(data.series.mileage.points.at(-1).warning, true);
  const costLane = svg.match(/<g class="explorer-lane" data-series-key="costkm"[\s\S]*?<\/g>/)[0];
  assert.doesNotMatch(costLane, /class="explorer-line/);
  const detail = explorerSelection(data, layout, '2026-04-01');
  assert.match(detail, /data-record="conflict"/);
  assert.match(detail, /data-record="same-day"/);
  assert.match(detail, /3 opération\(s\)/);
});

test('empty data, invalid windows and all measures together keep finite geometry and escape user labels', () => {
  const cases = [vehicleOf([]), vehicleOf([event('single', '2026-01-01', 0, { totalAmount: '0', title: '<img src=x onerror=bad()>' })])];
  for (const vehicle of cases) {
    const data = graphData(vehicle, options), snapshot = structuredClone(vehicle);
    const layout = graphLayout(data, { measures: GRAPH_MEASURES.map(one => one.key), from: '2026-02-31', to: 'invalid' });
    const svg = explorerSvg(layout);
    assert.doesNotMatch(svg, /NaN|Infinity|<img|<script/);
    assert.ok(layout.lanes.every(lane => lane.ticks.every(tick => Number.isFinite(tick.y))));
    if (layout.dates.length) assert.doesNotMatch(explorerSelection(data, layout, layout.dates[0]), /<img|<script/);
    assert.deepEqual(vehicle, snapshot);
  }
});

test('summary mileage operations are optional and never add an inferred counter', () => {
  const vehicle = vehicleOf([event('known', '2026-01-01', 1000), event('unknown', '2026-01-02', null)]);
  const plain = statisticsMarkup(vehicle, options).html;
  assert.doesNotMatch(plain, /class="explorer-operation"/);
  const enabled = statisticsMarkup(vehicle, { ...options, showOperations: true }).html;
  assert.match(enabled, /class="explorer-operation"/);
  assert.match(enabled, /data-record="known"/);
  assert.match(enabled, /L’explorateur montre aussi les opérations sans compteur/);
});
