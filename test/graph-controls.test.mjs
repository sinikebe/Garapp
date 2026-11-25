import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage } from '../public/assets/js/garage.js';
import { GRAPH_MEASURES } from '../public/assets/js/graph-data.js';
import { renderGraphExplorer, renderGraphs } from '../public/assets/js/graph-view.js';
import { renderStatistics } from '../public/assets/js/statistics-view.js';

// Minimal event/element boundary for controller tests, without a browser or storage.
class Element {
  constructor(dataset = {}, id = '') { this.dataset = dataset; this.id = id; this.children = []; this.attributes = {}; this.handlers = {}; this.innerHTML = ''; this.value = ''; this.hidden = false; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } return this; }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const attribute = /^\[data-([\w-]+)\]$/.exec(selector);
    if (attribute) return Object.hasOwn(this.dataset, attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()));
    return selector === 'small' && this.tag === 'small';
  }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  querySelectorAll(selector) { const selectors = selector.split(',').map(one => one.trim()); return this.children.flatMap(child => [...(selectors.some(one => child.matches(one)) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); }
  fire(type, extra = {}) { for (const handler of this.handlers[type] ?? []) handler({ target: this, preventDefault() {}, ...extra }); }
  focus() { this.focused = true; }
  checkValidity() { return /^\d{4}-\d{2}-\d{2}$/.test(this.value); }
}
const fixture = (typeCount = 1) => {
  const root = new Element();
  const plot = new Element({ explorerPlot: '' }).append(new Element({ explorerGuide: '' }));
  const select = new Element({ explorerDateSelect: '' }), detail = new Element({ explorerDetail: '' });
  const from = new Element({ explorerFrom: '' }), to = new Element({ explorerTo: '' }), error = new Element({ explorerError: '' });
  const all = new Element({ explorerAll: '' }), reset = new Element({ explorerReset: '' });
  const measures = GRAPH_MEASURES.map(measure => new Element({ graphMeasure: measure.key }));
  const types = Array.from({ length: typeCount }, (_, index) => { const count = new Element(); count.tag = 'small'; return new Element({ graphType: String(index) }).append(count); });
  root.append(plot, select, detail, from, to, error, all, reset, ...measures, ...types);
  return { root, plot, select, detail, from, to, error, all, reset, measures, types,
    click(element) { root.fire('click', { target: element }); } };
};
const vehicleOf = records => parseGarage(JSON.stringify({ version: 2, vehicles: [{ id: 'fiction', name: 'Véhicule fictif', components: [], records }] })).vehicles[0];
const sample = () => vehicleOf([
  { id: 'a', type: 'reparation', title: 'Réparation fictive', date: '2026-01-01', odometer: 1000, totalAmount: '100' },
  { id: 'b', type: 'reparation', title: 'Autre réparation fictive', date: '2026-02-01', odometer: 1500, totalAmount: '50' },
]);
const options = { date: '2026-11-25' };

test('legend button handlers redraw lanes and operation markers while preserving source data and focus targets', () => {
  const view = fixture(), state = {}, vehicle = sample(), snapshot = structuredClone(vehicle);
  renderGraphExplorer(view.root, vehicle, options, state);
  assert.match(view.plot.innerHTML, /data-series-key="spending"/);
  const spending = view.measures.find(button => button.dataset.graphMeasure === 'spending');
  view.click(spending);
  assert.equal(spending.attributes['aria-pressed'], 'false');
  assert.doesNotMatch(view.plot.innerHTML, /data-series-key="spending"/);
  assert.ok(view.root.innerHTML.includes('Repères des opérations'));
  view.click(view.types[0]);
  assert.equal(view.types[0].attributes['aria-pressed'], 'false');
  assert.match(view.plot.innerHTML, /Opérations · 0/);
  assert.match(view.plot.innerHTML, /data-series-key="mileage"/);
  view.click(view.all);
  assert.equal(state.measures.length, GRAPH_MEASURES.length);
  assert.deepEqual(state.hiddenTypes, []);
  view.select.value = '2026-01-01'; view.select.fire('change');
  assert.match(view.detail.innerHTML, /data-record="a"/);
  assert.deepEqual(vehicle, snapshot);
});

test('date input handlers reject reversed windows, apply a valid zoom and restore the original period', () => {
  const view = fixture(), state = {};
  renderGraphExplorer(view.root, sample(), options, state);
  view.from.value = '2026-02-01'; view.to.value = '2026-01-01'; view.from.fire('change');
  assert.equal(view.error.hidden, false);
  assert.equal(state.from, undefined);
  view.from.value = '2026-01-01'; view.to.value = '2026-01-15'; view.to.fire('change');
  assert.equal(view.error.hidden, true);
  assert.equal(state.to, '2026-01-15');
  assert.doesNotMatch(view.plot.innerHTML, /data-record="b"/);
  view.click(view.reset);
  assert.equal(state.from, ''); assert.equal(state.to, '');
  assert.match(view.plot.innerHTML, /data-record="b"/);
});

test('the dedicated graph view retains per-vehicle legend choices across filter changes', () => {
  const root = new Element(), widget = fixture(0);
  widget.root.dataset.graphExplorer = ''; root.append(widget.root);
  renderGraphs(root, vehicleOf([]), options);
  assert.match(widget.root.innerHTML, /Explorer les mesures/);
  const mileage = widget.measures.find(button => button.dataset.graphMeasure === 'mileage');
  widget.click(mileage);
  assert.equal(mileage.attributes['aria-pressed'], 'false');
  renderGraphs(root, vehicleOf([]), { ...options, period: '12m' });
  assert.equal(mileage.attributes['aria-pressed'], 'false');
  const other = vehicleOf([]); other.id = 'another-fiction';
  renderGraphs(root, other, options);
  assert.equal(mileage.attributes['aria-pressed'], 'true');
});

test('statistics keeps its summary and links directly to the graph route without nested tabs', () => {
  const root = new Element();
  renderStatistics(root, vehicleOf([]), options);
  assert.match(root.innerHTML, /href="#graphiques"/);
  assert.doesNotMatch(root.innerHTML, /role="tablist"/);
});
