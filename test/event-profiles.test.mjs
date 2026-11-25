import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../public/assets/js/garage.js';
import { eventProfile, eventEditorLayout } from '../public/assets/js/event-profiles.js';

test('every event type has a contextual form and a safe journal identity', () => {
  for (const type of Object.keys(TYPES)) {
    const profile = eventProfile(type);
    assert.equal(profile.kind, type);
    for (const field of ['icon', 'title', 'date', 'help']) assert.ok(profile[field].length > 0);
    assert.match(profile.icon, /^[a-z]+$/);
    assert.equal(typeof profile.maintenance, 'boolean');
  }
  for (const type of ['legacy-custom', '__proto__', 'constructor', 'x" onmouseover="bad']) assert.equal(eventProfile(type).kind, 'other');
  const changed = eventProfile('reading'); changed.title = 'Changed';
  assert.equal(eventProfile('reading').title, 'Intitulé du relevé');
});

test('a plain mileage observation needs no amount, maintenance section or generated title field', () => {
  const layout = eventEditorLayout('reading', { title: 'Relevé kilométrique' });
  assert.equal(layout.showTitle, false);
  assert.equal(layout.showAmount, false);
  assert.equal(layout.showDetail, false);
  assert.equal(eventEditorLayout('reading', { title: 'Relevé fictif personnalisé' }).showTitle, true);
  assert.equal(eventEditorLayout('revision').showDetail, true);
  assert.equal(eventEditorLayout('insurance').showDetail, false);
  assert.equal(eventEditorLayout('registration', { title: 'Mise en circulation' }).showTitle, false);
});

test('historical zero amounts and detailed associations remain accessible even on simple event types', () => {
  const original = { title: 'Relevé fictif', totalAmount: '0', partsAmount: '0', laborAmount: null, componentIds: ['part'], observedComponentIds: [], lines: [{ id: 'line' }] };
  const snapshot = structuredClone(original), layout = eventEditorLayout('reading', original);
  assert.equal(layout.showAmount, true);
  assert.equal(layout.showDetail, true);
  assert.deepEqual(original, snapshot);
  assert.equal(eventEditorLayout('registration', { totalAmount: null, partsAmount: null, laborAmount: null }).showDetail, false);
});
