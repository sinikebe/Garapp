import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGarage, inventory, recordCost, componentLife, componentHistory, exampleGarage, vehicleStats, validateDocument } from '../public/assets/js/garage.js';
import { amountInput, sumAmounts, cents, formatExactAmount } from '../public/assets/js/amounts.js';
const fixtureText = readFileSync(new URL('../docs/examples/garage-v2.json', import.meta.url), 'utf8');
const fixture = () => parseGarage(fixtureText);
const roundTrip = (data) => parseGarage(JSON.stringify(data));
const doc = () => ({ id: 'doc', name: 'fiction.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,' + Buffer.from('Fiction\n').toString('base64'), source: { originalReference: 'example' } });

test('the documented v2 example preserves every field, nested source, occurrence and embedded document', () => {
  const data = fixture();
  assert.deepEqual(roundTrip(data), JSON.parse(fixtureText));
  const counts = inventory(data);
  assert.deepEqual({ ...counts, bytes: undefined }, { vehicles: 1, records: 3, components: 1, lines: 2, documents: 4, bytes: undefined });
  assert.ok(counts.bytes > 0);
  const lines = data.vehicles[0].records[0].lines;
  assert.equal(lines[0].label, lines[1].label);
  assert.notEqual(lines[0].id, lines[1].id);
  assert.equal(lines[0].amount, '12.345');
  assert.equal(lines[1].amount, null);
  assert.equal(lines[0].sourceProperties.originalId, 'source-line-one');
  assert.deepEqual(Buffer.from(lines[0].documents[0].dataUrl.split(',')[1], 'base64'), Buffer.from(JSON.parse(fixtureText).vehicles[0].records[0].lines[0].documents[0].dataUrl.split(',')[1], 'base64'));
});

test('legacy v1 upgrades exact cent values while keeping all additional fields', () => {
  const legacy = { version: 1, activeId: 'vehicle', original: { label: 'Archive fictive' }, vehicles: [{ id: 'vehicle', name: 'Véhicule fictif', year: 2020, engine: 'Exemple', odometer: 15000, components: [{ id: 'part', name: 'Pièce fictive', group: 'Exemple', intervalKm: null, intervalMonths: null, description: 'Description source' }], records: [{ id: 'record', title: 'Entretien fictif', type: 'entretien', date: '2025-01-01', odometer: 10000, partsCents: 12345, laborCents: 0, componentIds: ['part'], notes: ' Texte conservé avec ses espaces. ', custom: ['a', 'b'] }] }] };
  const migrated = roundTrip(legacy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.vehicles[0].records[0].partsAmount, '123.45');
  assert.equal(migrated.vehicles[0].records[0].laborAmount, '0.00');
  assert.equal(migrated.vehicles[0].records[0].notes, legacy.vehicles[0].records[0].notes);
  assert.deepEqual(migrated.original, legacy.original);
  assert.deepEqual(migrated.vehicles[0].records[0].custom, ['a', 'b']);
  assert.equal(migrated.vehicles[0].components[0].description, 'Description source');
  assert.deepEqual(roundTrip(migrated), migrated);
});

test('unknowns, nonmaintenance events and contradictory readings remain representable', () => {
  const data = fixture(); const vehicle = data.vehicles[0];
  vehicle.year = null; vehicle.engine = ''; vehicle.odometer = null;
  vehicle.records[0].date = null; vehicle.records[0].odometer = null;
  assert.deepEqual(roundTrip(data), data);
  assert.equal(componentLife(vehicle, vehicle.components[0]).status, 'unknown');
  assert.equal(recordCost(vehicle.records[1]).total, null);
  const withZero = { ...vehicle.records[1], totalAmount: '0' };
  assert.equal(recordCost(withZero).total, '0');
  const unknownCategory = { ...vehicle.records[1], type: 'Catégorie personnalisée' };
  vehicle.records.push({ ...unknownCategory, id: 'custom' });
  assert.equal(roundTrip(data).vehicles[0].records.at(-1).type, unknownCategory.type);
});

test('precise amounts add before display rounding, including discounts and tiny values', () => {
  assert.equal(sumAmounts(['1.005', '1.005']), '2.01');
  assert.equal(cents(sumAmounts(['1.005', '1.005'])), 201n);
  assert.equal(sumAmounts(['0.1', '0.2', '-0.15']), '0.15');
  assert.equal(sumAmounts(['0.000000000000000001', '0.000000000000000002']), '0.000000000000000003');
  assert.equal(cents('-1.005'), -101n);
  assert.equal(amountInput(' 1 234,567 '), '1234.567');
  assert.equal(amountInput(''), null);
  assert.match(formatExactAmount('12.345'), /12,345/);
  assert.throws(() => amountInput('12oops'));
  assert.throws(() => amountInput('1e3'));
});

test('detailed lines never double-count summary costs and an invoice total can override rounding', () => {
  const record = fixture().vehicles[0].records[0];
  record.partsAmount = '999'; record.laborAmount = '999';
  record.lines[1].amount = '1.005';
  assert.equal(recordCost(record).total, '13.35');
  record.totalAmount = '13.34';
  assert.equal(recordCost(record).total, '13.34');
  record.totalAmount = null; record.lines[1].amount = null;
  assert.equal(recordCost(record).total, null);
  assert.equal(recordCost(record).subtotal, '12.345');
});

test('inspections and planned replacements link to a component without resetting its interval', () => {
  const vehicle = exampleGarage('2026-11-06').vehicles[0];
  const part = vehicle.components.find((one) => one.id === 'oil');
  const original = componentLife(vehicle, part, '2026-11-06');
  vehicle.records.push({ id: 'inspection', title: 'Contrôle fictif', type: 'controle', date: '2026-10-01', odometer: 127000, lines: [{ id: 'inspect-line', label: 'Contrôle', kind: 'service', amount: '0', componentId: part.id, effect: 'inspect' }] });
  vehicle.records.push({ id: 'planned', title: 'Remplacement prévu', type: 'entretien', status: 'planned', date: '2026-11-01', odometer: 128000, lines: [{ id: 'planned-line', label: 'Remplacement', kind: 'part', amount: '100', componentId: part.id, effect: 'replace' }] });
  assert.equal(componentHistory(vehicle, part.id).length, 3);
  assert.equal(componentLife(vehicle, part, '2026-11-06').last.id, original.last.id);
  assert.equal(componentLife(vehicle, part, '2026-11-06').km, original.km);
});

test('administrative costs and undated records have explicit expense scopes', () => {
  const vehicle = fixture().vehicles[0];
  vehicle.records[0].totalAmount = '20';
  vehicle.records[1].totalAmount = '1000';
  assert.equal(vehicleStats(vehicle, 'all').amount, '20');
  assert.equal(vehicleStats(vehicle, 'all', 'all').amount, '1020');
  assert.equal(vehicleStats(vehicle, 'undated', 'all').amount, '1000');
  vehicle.records[0].totalAmount = null;
  assert.equal(vehicleStats(vehicle, 'all').incomplete, 1);
  assert.equal(vehicleStats(vehicle, 'all').amount, '12.345');
});

test('documents reject remote-only references, corrupt encodings, mismatched MIME and byte counts', () => {
  assert.equal(validateDocument(doc()).size, 8);
  for (const change of [
    value => { delete value.dataUrl; value.url = 'https://example.com/document'; },
    value => { value.dataUrl = 'data:text/plain;base64,%%%'; },
    value => { value.mimeType = 'application/pdf'; },
    value => { value.size = 12345; },
  ]) { const value = doc(); change(value); assert.throws(() => validateDocument(value)); }
});

test('embedded documents larger than the former two-megabyte limit survive round trips', () => {
  const data = fixture();
  const binary = Buffer.alloc(3 * 1024 * 1024, 65);
  data.documents = [validateDocument({ ...doc(), dataUrl: 'data:text/plain;base64,' + binary.toString('base64') })];
  const copy = roundTrip(data);
  assert.equal(copy.documents[0].size, binary.length);
  assert.deepEqual(Buffer.from(copy.documents[0].dataUrl.split(',')[1], 'base64'), binary);
});

test('invalid versions, links, replacement effects and active vehicles fail before import', () => {
  for (const change of [
    data => { data.version = 99; },
    data => { data.activeId = 'missing'; },
    data => { data.vehicles[0].records[0].lines[0].componentId = 'missing'; },
    data => { data.vehicles[0].records[0].lines[0].componentId = null; },
    data => { data.vehicles[0].records[0].date = '2026-02-30'; },
    data => { data.vehicles[0].records[0].lines[1].id = data.vehicles[0].records[0].lines[0].id; },
  ]) { const data = fixture(); change(data); assert.throws(() => roundTrip(data)); }
});
