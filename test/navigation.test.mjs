import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationKey, defaultFilters, normalizeFilters, normalizeNavigation, readNavigation, writeNavigation, resolveSection } from '../public/assets/js/navigation.js';
import { storageKey, exampleGarage } from '../public/assets/js/garage.js';
import { suiteLinks } from '../public/assets/js/app-switcher.js';
import { initHeaderMenus } from '../public/assets/js/header-menus.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const year = '2026';
test('explicit routes win, a return without a fragment resumes, and invalid routes are safe', () => {
  assert.equal(resolveSection('#composants', 'interventions'), 'composants');
  assert.equal(resolveSection('#statistiques', 'garage'), 'statistiques');
  assert.equal(resolveSection('', 'statistiques'), 'statistiques');
  assert.equal(resolveSection('', 'interventions'), 'interventions');
  for (const hash of ['#unknown', '#__proto__', '#interventions?share=example']) assert.equal(resolveSection(hash, 'depenses'), 'garage');
  for (const saved of ['unknown', '__proto__', null]) assert.equal(resolveSection('', saved), 'garage');
});

test('each vehicle retains its own useful list filters without modifying garage data', () => {
  const garage = exampleGarage('2026-11-06');
  const before = structuredClone(garage);
  const input = { section: 'interventions', filters: {
    first: { recordSearch: 'filtre fictif', recordType: 'entretien', expenseYear: 'all', statisticsPeriod: '12m', statisticsScope: 'all' },
    second: { componentSearch: 'batterie fictive', componentStatus: 'attention', componentView: 'list', expenseScope: 'all' },
  } };
  const state = normalizeNavigation(input, year);
  assert.equal(state.filters.first.recordSearch, 'filtre fictif');
  assert.equal(state.filters.second.componentStatus, 'attention');
  assert.equal(state.filters.second.componentView, 'list');
  assert.equal(state.filters.first.componentView, 'exploded');
  assert.equal(state.filters.second.recordSearch, '');
  assert.equal(state.filters.first.statisticsPeriod, '12m');
  assert.equal(state.filters.first.statisticsScope, 'all');
  assert.equal(state.filters.second.statisticsPeriod, 'all');
  assert.deepEqual(garage, before);
  assert.equal(state.vehicles, undefined);
});

test('invalid navigation preferences and inaccessible storage fall back without blocking use', () => {
  for (const raw of ['{invalid', 'null', '[]', '"text"', '{"section":"unknown","filters":[]}']) {
    const state = readNavigation({ getItem: () => raw }, 'test', year);
    assert.equal(state.section, 'garage'); assert.equal(Object.keys(state.filters).length, 0);
  }
  const unavailable = { getItem: () => { throw Error('Unavailable'); }, setItem: () => { throw Error('Quota'); } };
  assert.equal(readNavigation(unavailable, 'test', year).section, 'garage');
  assert.equal(writeNavigation(unavailable, 'test', normalizeNavigation(null, year)), false);
});

test('malformed filters are bounded and fall back independently', () => {
  assert.deepEqual(normalizeFilters({ recordSearch: {}, recordType: [], componentStatus: 'invalid', expenseYear: {}, expenseScope: 'invalid' }, year), defaultFilters(year));
  assert.equal(normalizeFilters({ recordSearch: 'x'.repeat(1000) }, year).recordSearch.length, 256);
  assert.equal(normalizeFilters({ expenseYear: 'undated' }, year).expenseYear, 'undated');
  assert.equal(normalizeFilters({ statisticsPeriod: 'invalid', statisticsScope: 'invalid' }, year).statisticsPeriod, 'all');
  assert.equal(normalizeFilters({ statisticsScope: 'invalid' }, year).statisticsScope, 'maintenance');
  const state = normalizeNavigation(JSON.parse('{"section":"composants","filters":{"__proto__":{"recordSearch":"fictif"}}}'), year);
  assert.equal(Object.getPrototypeOf(state.filters), null);
  assert.equal(state.filters.__proto__.recordSearch, 'fictif');
});

test('main and dev keep independent navigation and business namespaces', () => {
  const main = 'https://sinikebe.github.io/Garapp/';
  const dev = main + 'dev/';
  assert.notEqual(navigationKey(main), navigationKey(dev));
  assert.notEqual(navigationKey(main), storageKey(main));
  for (const path of [main, dev]) {
    const links = suiteLinks(path + '?vehicle=private-value#interventions');
    for (const app of links.apps) { assert.equal(new URL(app.href).search, ''); assert.equal(new URL(app.href).hash, ''); }
  }
});

class Menu extends EventTarget {
  constructor(root) {
    super(); this.open = false; this.root = root;
    this.trigger = { menu: this, focus: () => { root.activeElement = this.trigger; } };
  }
  contains(element) { return element?.menu === this; }
  querySelector() { return this.trigger; }
}
class Root extends EventTarget {
  constructor() { super(); this.menus = [new Menu(this), new Menu(this)]; this.activeElement = null; }
  querySelectorAll() { return this.menus; }
}
function keyEvent(key) { const event = new Event('keydown', { cancelable: true }); Object.defineProperty(event, 'key', { value: key }); return event; }
function clickEvent(target) { const event = new Event('click'); Object.defineProperty(event, 'target', { value: target }); return event; }

test('opening a header disclosure closes its sibling and Escape restores trigger focus', () => {
  const root = new Root(); initHeaderMenus(root);
  const [first, second] = root.menus;
  first.open = true; first.dispatchEvent(new Event('toggle'));
  second.open = true; second.dispatchEvent(new Event('toggle'));
  assert.equal(first.open, false); assert.equal(second.open, true);
  root.activeElement = { menu: second };
  const escape = keyEvent('Escape'); root.dispatchEvent(escape);
  assert.equal(second.open, false); assert.equal(root.activeElement, second.trigger); assert.equal(escape.defaultPrevented, true);
  const anotherEscape = keyEvent('Escape'); root.dispatchEvent(anotherEscape);
  assert.equal(anotherEscape.defaultPrevented, false);
});

test('outside dismissal recovers hidden focus without stealing focus from another control', () => {
  const root = new Root(); initHeaderMenus(root); const [menu] = root.menus;
  menu.open = true; root.activeElement = { menu };
  root.dispatchEvent(clickEvent({ closest: () => null }));
  assert.equal(menu.open, false); assert.equal(root.activeElement, menu.trigger);
  menu.open = true;
  const control = { closest: () => control }; root.activeElement = control;
  root.dispatchEvent(clickEvent(control));
  assert.equal(menu.open, false); assert.equal(root.activeElement, control);
});

test('the bundled foundation matches the published finapps UI v1.0.0 asset', () => {
  const bytes = readFileSync(new URL('../public/assets/css/finapps-ui.css', import.meta.url));
  const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(hash, 'f339a70ec34623add08024d97aea4396f3aff01e');
});
