import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage, recordCost } from '../public/assets/js/garage.js';
import { updateFuelEntry, fuelUnitPrice } from '../public/assets/js/fuel-entry.js';

const values = () => ({ date: '2026-01-04', odometer: '12500', litres: '42,5', totalAmount: '76,50', fullTank: 'true', notes: '', documents: [] });
const parsed = (record) => parseGarage(JSON.stringify({ version: 2, vehicles: [{ id: 'fiction', name: 'Véhicule fictif', components: [], records: [record] }] })).vehicles[0].records[0];

test('a small fuel entry keeps decimal precision, full and partial states, zero and unknown values', () => {
  const full = parsed(updateFuelEntry({ id: 'fuel' }, values()));
  assert.equal(full.title, 'Plein de carburant');
  assert.equal(full.fuel.litres, '42.5');
  assert.equal(full.totalAmount, '76.50');
  assert.equal(full.odometer, 12500);
  assert.equal(full.fuel.fullTank, true);
  assert.equal(fuelUnitPrice(full), 1.8);
  const partial = parsed(updateFuelEntry(full, { ...values(), fullTank: 'false', totalAmount: '0' }));
  assert.equal(partial.fuel.fullTank, false);
  assert.equal(fuelUnitPrice(partial), 0);
  const unknown = parsed(updateFuelEntry(full, { ...values(), date: '', odometer: '', litres: '', fullTank: '', totalAmount: '' }));
  assert.equal(unknown.date, null);
  assert.equal(unknown.odometer, null);
  assert.deepEqual(unknown.fuel, { litres: null, fullTank: null });
  assert.equal(unknown.totalAmount, null);
  assert.equal(fuelUnitPrice(unknown), null);
});

test('editing a historical fuel entry preserves hidden detail, extensions, documents and its existing cost breakdown', () => {
  const original = parsed({
    id: 'historical', title: 'Ravitaillement fictif', type: 'fuel', status: 'planned', date: '2026-01-04', odometer: 12500,
    partsAmount: '76.500000000000000001', laborAmount: '0', totalAmount: null,
    fuel: { litres: '42.5', fullTank: true, source: { station: 'Station fictive' } },
    content: 'Contenu fictif conservé', componentIds: [], observedComponentIds: [],
    documents: [{ id: 'receipt', name: 'Justificatif fictif.txt', mimeType: 'text/plain', size: 7, dataUrl: 'data:text/plain;base64,ZmljdGlmIQ==', description: 'Justificatif fictif' }],
    extension: { untouched: ['001', null] },
  });
  const snapshot = structuredClone(original);
  const updated = parsed(updateFuelEntry(original, { ...values(), totalAmount: recordCost(original).total, notes: 'Note fictive', documents: original.documents }));
  assert.equal(updated.totalAmount, null);
  assert.equal(updated.partsAmount, original.partsAmount);
  assert.equal(updated.status, 'planned');
  assert.equal(updated.title, original.title);
  assert.equal(updated.content, original.content);
  assert.deepEqual(updated.fuel.source, original.fuel.source);
  assert.deepEqual(updated.extension, original.extension);
  assert.deepEqual(updated.documents, original.documents);
  assert.deepEqual(original, snapshot);
  const recorded = updateFuelEntry(updated, { ...values(), status: 'done' });
  assert.equal(recorded.status, 'done');
  assert.equal(recorded.totalAmount, '76.50');
  const detailed = parsed({ ...original, lines: [{ id: 'line', label: 'Achat fictif', kind: 'other', amount: '76.5', effect: 'none' }] });
  const retained = parsed(updateFuelEntry(detailed, { ...values(), documents: detailed.documents }));
  assert.deepEqual(retained.lines, detailed.lines);
});

test('invalid fuel quantities and counters cannot be saved through the small editor', () => {
  for (const litres of ['0', '-1', '10001', '1e2', 'pas un nombre']) assert.throws(() => updateFuelEntry({ id: 'fuel' }, { ...values(), litres }));
  for (const odometer of ['-1', '1.5', 'Infinity', '5000001']) assert.throws(() => updateFuelEntry({ id: 'fuel' }, { ...values(), odometer }));
  assert.throws(() => updateFuelEntry({ id: 'fuel' }, { ...values(), fullTank: 'yes' }));
  assert.throws(() => updateFuelEntry({ id: 'fuel' }, { ...values(), totalAmount: '1e3' }));
});
