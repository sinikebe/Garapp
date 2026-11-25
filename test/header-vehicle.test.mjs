import test from 'node:test';
import assert from 'node:assert/strict';
import { initHeaderVehicle } from '../public/assets/js/header-vehicle.js';

function fixture() {
  let resize;
  const menu = { open: false };
  const select = { value: 'fiction', focused: false, focus() { this.focused = true; } };
  const picker = { contains: (target) => target === select };
  const slot = { hidden: false, querySelector: () => picker, append(child) { child.parentElement = this; } };
  const menuSlot = { hidden: true, closest: () => menu, append(child) { child.parentElement = this; } };
  picker.parentElement = slot;
  const brand = { getBoundingClientRect: () => ({ width: 110 }) };
  const actions = { getBoundingClientRect: () => ({ width: 160 }) };
  const nodes = { '[data-vehicle-slot]': slot, '[data-vehicle-menu-slot]': menuSlot, '.brand': brand, '.app-bar-actions': actions };
  const header = { clientWidth: 900, querySelector: (selector) => nodes[selector] };
  const root = { activeElement: null, querySelector: () => header, defaultView: {
    getComputedStyle: (element) => element === slot ? { minWidth: '180px' } : { paddingLeft: '16px', paddingRight: '16px', columnGap: '8px' },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
  } };
  initHeaderVehicle(root);
  return { root, header, slot, menuSlot, picker, select, menu, resize: (width) => { header.clientWidth = width; resize(); } };
}

test('the same vehicle selector folds into Tools without losing its selection and returns when room is available', () => {
  const view = fixture();
  assert.equal(view.picker.parentElement, view.slot);
  view.resize(375);
  assert.equal(view.picker.parentElement, view.menuSlot);
  assert.equal(view.slot.hidden, true); assert.equal(view.menuSlot.hidden, false);
  assert.equal(view.select.value, 'fiction'); assert.equal(view.menu.open, false);
  view.resize(900);
  assert.equal(view.picker.parentElement, view.slot);
  assert.equal(view.slot.hidden, false); assert.equal(view.menuSlot.hidden, true);
  assert.equal(view.select.value, 'fiction');
});

test('a focused vehicle selector stays reachable when resizing moves it into Tools', () => {
  const view = fixture(); view.root.activeElement = view.select;
  view.resize(375);
  assert.equal(view.menu.open, true);
  assert.equal(view.select.focused, true);
  assert.equal(view.picker.parentElement, view.menuSlot);
});
