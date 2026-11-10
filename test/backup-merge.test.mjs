import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareGarages, mergeGarages } from '../public/assets/js/backup-merge.js';
import { parseGarage, lineComponentIds } from '../public/assets/js/garage.js';
import { backupBlob, readBackupFile } from '../public/assets/js/backups.js';
import { moveRecordToTrash } from '../public/assets/js/record-trash.js';
import { reconcileInsurance } from '../public/assets/js/insurance.js';

const normalize = (data) => parseGarage(JSON.stringify(data));
const component = (id, name = `Composant fictif ${id}`) => ({ id, name });
const record = (id, extra = {}) => ({ id, title: `Fiche fictive ${id}`, lines: [], ...extra });
const fixture = () => normalize({ version: 2, activeId: 'car', vehicles: [{
  id: 'car', name: 'Véhicule fictif', odometer: 20000,
  components: [component('left'), component('right')],
  records: [record('service', { lines: [{ id: 'bundle', label: 'Forfait fictif', kind: 'bundle', amount: '120.125000000000000001', componentId: 'left', componentIds: ['left', 'right'], effect: 'replace' }] })],
}] });
const choose = (comparison, side) => Object.fromEntries(comparison.differences.filter((difference) => difference.conflict).map(({ id }) => [id, side]));
const firstRecord = (garage) => garage.vehicles[0].records[0];
const doc = (id, text = 'Fichier fictif\n') => ({ id, name: `${id}.txt`, mimeType: 'text/plain', dataUrl: `data:text/plain;base64,${Buffer.from(text).toString('base64')}` });
const insured = () => {
  const garage = fixture();
  garage.vehicles[0].insurances = [{ id: 'policy', provider: 'Assureur fictif', firstDate: '2026-01-01', endDate: '2026-01-01', debitDay: 1, tariffs: [{ from: '2026-01', amount: '49.9901' }] }];
  return garage;
};
const payment = (id, extra = {}) => record(id, { type: 'insurance', status: 'done', date: '2026-01-01', totalAmount: '49.9901', insurance: { contractId: 'policy', period: '2026-01', generated: true, autoStatus: true }, ...extra });

test('identical backups and property order changes produce no differences', () => {
  const local = fixture();
  local.source = { preserved: true, nested: { nullable: null, zero: 0 } };
  const incoming = structuredClone(local);
  incoming.source = { nested: { zero: 0, nullable: null }, preserved: true };
  incoming.vehicles[0].components.reverse();
  const comparison = compareGarages(local, incoming);
  assert.deepEqual(comparison.differences, []);
  assert.equal(comparison.conflictCount, 0);
  assert.deepEqual(mergeGarages(comparison), local);
});

test('disjoint records, components and documents are kept by stable ID without treating absence as deletion', () => {
  const local = fixture(), incoming = fixture();
  local.vehicles[0].components.push(component('local-part'));
  local.vehicles[0].records.push(record('local', { componentIds: ['local-part'], documents: [doc('local-doc')] }));
  incoming.vehicles[0].components.push(component('incoming-part'));
  incoming.vehicles[0].records.push(record('incoming', { componentIds: ['incoming-part'], documents: [doc('incoming-doc')] }));
  const comparison = compareGarages(local, incoming), merged = mergeGarages(comparison);
  assert.equal(comparison.conflictCount, 0);
  assert.deepEqual(comparison.counts, { localOnly: 2, incomingOnly: 2, changed: 0 });
  assert.deepEqual(merged.vehicles[0].records.map(({ id }) => id), ['service', 'local', 'incoming']);
  assert.deepEqual(merged.vehicles[0].components.map(({ id }) => id), ['left', 'right', 'local-part', 'incoming-part']);
  assert.equal(merged.vehicles[0].records[2].documents[0].dataUrl, incoming.vehicles[0].records[1].documents[0].dataUrl);
});

test('only changed fields are listed and choices combine fields from the same record', () => {
  const local = fixture(), incoming = fixture();
  firstRecord(local).notes = 'Note locale fictive';
  firstRecord(incoming).title = 'Titre entrant fictif';
  firstRecord(incoming).lines[0].amount = '199.990100000000000001';
  const comparison = compareGarages(local, incoming);
  assert.deepEqual(new Set(comparison.differences.map(({ path }) => path.at(-1))), new Set(['notes', 'title', 'amount']));
  assert.throws(() => mergeGarages(comparison), /Choisir une valeur/);
  const choices = Object.fromEntries(comparison.differences.map(({ id, path }) => [id, path.at(-1) === 'notes' ? 'local' : 'incoming']));
  const merged = mergeGarages(comparison, choices);
  assert.equal(firstRecord(merged).title, 'Titre entrant fictif');
  assert.equal(firstRecord(merged).notes, 'Note locale fictive');
  assert.equal(firstRecord(merged).lines[0].amount, '199.990100000000000001');
  assert.equal(firstRecord(merged).id, 'service');
  assert.equal(comparison.differences.find(({ path }) => path.at(-1) === 'amount').context.at(-1), 'Ligne « Forfait fictif »');
});

test('different values require explicit valid choices, including false, null and empty text', () => {
  const local = fixture(), incoming = fixture();
  local.custom = { flag: false, value: null, text: '' };
  incoming.custom = { flag: true, value: 0, text: 'Nouveau' };
  const comparison = compareGarages(local, incoming), choices = choose(comparison, 'incoming');
  assert.equal(comparison.conflictCount, 3);
  assert.throws(() => mergeGarages(comparison, { ...choices, [comparison.differences[0].id]: 'both' }), /choix de fusion/);
  assert.throws(() => mergeGarages(comparison, null), /choix de fusion/);
  assert.deepEqual(mergeGarages(comparison, choose(comparison, 'local')).custom, local.custom);
  assert.deepEqual(mergeGarages(comparison, choices).custom, incoming.custom);
});

test('equal names never collapse different IDs and shared IDs expose identity conflicts', () => {
  const local = fixture(), incoming = fixture();
  local.vehicles[0].components.push(component('same-name-local', 'Même nom fictif'));
  incoming.vehicles[0].components.push(component('same-name-incoming', 'Même nom fictif'));
  incoming.vehicles[0].components[0].name = 'Autre composant fictif';
  const comparison = compareGarages(local, incoming);
  assert.equal(comparison.conflictCount, 1);
  const merged = mergeGarages(comparison, choose(comparison, 'incoming'));
  assert.equal(merged.vehicles[0].components.filter(({ name }) => name === 'Même nom fictif').length, 2);
  assert.equal(merged.vehicles[0].components.find(({ id }) => id === 'left').name, 'Autre composant fictif');
});

test('unknown objects merge recursively while unknown arrays remain explicit whole-value conflicts', () => {
  const local = fixture(), incoming = fixture();
  local.source = JSON.parse('{"local":1,"nested":{"left":false,"__proto__":{"preserved":true}},"items":[{"id":"same","value":"local"}]}');
  incoming.source = { incoming: 2, nested: { right: null }, items: [{ id: 'same', value: 'incoming' }] };
  const comparison = compareGarages(local, incoming), merged = mergeGarages(comparison, choose(comparison, 'incoming'));
  assert.equal(comparison.conflictCount, 1);
  assert.deepEqual(merged.source.items, incoming.source.items);
  assert.deepEqual(merged.source.nested, JSON.parse('{"left":false,"__proto__":{"preserved":true},"right":null}'));
  assert.equal(merged.source.local, 1);
  assert.equal(merged.source.incoming, 2);
  assert.equal(Object.prototype.preserved, undefined);
});

test('prototype-like JSON keys remain ordinary preserved data at every schema level', () => {
  const local = fixture(), incoming = fixture();
  Object.defineProperty(local, '__proto__', { enumerable: true, value: { local: 'Fictif' } });
  Object.defineProperty(incoming, '__proto__', { enumerable: true, value: { incoming: 'Fictif' } });
  local.vehicles[0].constructor = { local: true };
  incoming.vehicles[0].constructor = { incoming: false };
  firstRecord(local).prototype = { retained: null };
  const comparison = compareGarages(local, incoming), merged = mergeGarages(comparison);
  assert.equal(Object.hasOwn(merged, '__proto__'), true);
  assert.deepEqual(merged.__proto__, { local: 'Fictif', incoming: 'Fictif' });
  assert.deepEqual(merged.vehicles[0].constructor, { local: true, incoming: false });
  assert.deepEqual(firstRecord(merged).prototype, { retained: null });
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal(Object.prototype.local, undefined);
  assert.equal(Object.prototype.incoming, undefined);
});

test('merging an unrelated field preserves absent optional extensions and legacy line shape', () => {
  const local = fixture();
  delete firstRecord(local).lines[0].componentIds;
  const incoming = structuredClone(local);
  firstRecord(incoming).notes = 'Note entrante fictive';
  const comparison = compareGarages(local, incoming), merged = mergeGarages(comparison, choose(comparison, 'incoming'));
  assert.equal(comparison.differences.length, 1);
  assert.equal(Object.hasOwn(merged.vehicles[0], 'trashedRecords'), false);
  assert.equal(Object.hasOwn(merged.vehicles[0], 'insurances'), false);
  assert.equal(Object.hasOwn(firstRecord(merged).lines[0], 'componentIds'), false);
  assert.equal(firstRecord(merged).lines[0].componentId, 'left');
  assert.equal(firstRecord(merged).notes, incoming.vehicles[0].records[0].notes);
});

test('documents are atomic conflicts and their exact bytes and extra metadata survive export', async () => {
  const local = fixture(), incoming = fixture();
  local.documents = [doc('shared', 'Ancien document fictif'), doc('only-local')];
  incoming.documents = [{ ...doc('shared', 'Nouveau document fictif'), source: { retained: ['original', null] } }, doc('only-incoming')];
  const comparison = compareGarages(local, incoming);
  const shared = comparison.differences.find(({ conflict }) => conflict);
  assert.equal(shared.entity, 'document');
  assert.equal(comparison.conflictCount, 1);
  const merged = mergeGarages(comparison, choose(comparison, 'incoming'));
  assert.equal(merged.documents.length, 3);
  assert.deepEqual(merged.documents[0], normalize(incoming).documents[0]);
  const restored = (await readBackupFile(new File([backupBlob(merged)], 'synthetic-merge.json'))).garage;
  assert.deepEqual(restored, merged);
});

test('active and trashed versions of one record have a lifecycle choice and preserve selected metadata', () => {
  const local = fixture(), incoming = moveRecordToTrash(fixture(), 'car', 'service', '2026-11-10T10:00:00.000Z');
  incoming.vehicles[0].trashedRecords[0].source = { reason: 'Exemple fictif' };
  incoming.vehicles[0].trashedRecords[0].record.notes = 'Note de la copie entrante';
  const comparison = compareGarages(local, incoming);
  assert.equal(comparison.differences.filter(({ lifecycle }) => lifecycle).length, 1);
  assert.throws(() => mergeGarages(comparison), /Choisir une valeur/);
  const trashed = mergeGarages(comparison, choose(comparison, 'incoming')).vehicles[0];
  assert.deepEqual(trashed.records, []);
  assert.deepEqual(trashed.trashedRecords, incoming.vehicles[0].trashedRecords);
  const choices = choose(comparison, 'incoming');
  choices[comparison.differences.find(({ lifecycle }) => lifecycle).id] = 'local';
  const active = mergeGarages(comparison, choices).vehicles[0];
  assert.equal(active.records.length, 1);
  assert.equal(active.records[0].notes, 'Note de la copie entrante');
  assert.deepEqual(active.trashedRecords, []);
});

test('trash-only additions retain record documents, original position and unknown entry metadata', () => {
  const local = fixture(), incoming = fixture();
  incoming.vehicles[0].records.push(record('archived', { documents: [doc('archived-document')] }));
  const trashed = moveRecordToTrash(incoming, 'car', 'archived', '2026-11-10T10:00:00.000Z');
  trashed.vehicles[0].trashedRecords[0].source = { original: true };
  const merged = mergeGarages(compareGarages(local, trashed));
  assert.deepEqual(merged.vehicles[0].trashedRecords, normalize(trashed).vehicles[0].trashedRecords);
  assert.equal(merged.vehicles[0].records.length, 1);
});

test('line links are chosen together so the historical alias cannot restore a removed component', () => {
  const local = fixture(), incoming = fixture();
  firstRecord(incoming).lines[0].componentId = 'right';
  firstRecord(incoming).lines[0].componentIds = ['right'];
  const comparison = compareGarages(local, incoming);
  assert.equal(comparison.differences.length, 1);
  assert.equal(comparison.differences[0].componentLinks, true);
  assert.deepEqual(comparison.differences[0].displayIncoming, ['Composant fictif right [right]']);
  const line = firstRecord(mergeGarages(comparison, choose(comparison, 'incoming'))).lines[0];
  assert.equal(line.componentId, 'right');
  assert.deepEqual(line.componentIds, ['right']);
  assert.deepEqual(lineComponentIds(line), ['right']);
});

test('excluding a one-sided entity is explicit and broken component references prevent a merge', () => {
  const local = fixture(), incoming = fixture();
  local.vehicles[0].components.push(component('added'));
  local.vehicles[0].records.push(record('dependent', { componentIds: ['added'] }));
  const comparison = compareGarages(local, incoming);
  const part = comparison.differences.find(({ path }) => path.at(-1) === 'added');
  const dependent = comparison.differences.find(({ path }) => path.at(-1) === 'dependent');
  assert.throws(() => mergeGarages(comparison, { [part.id]: 'incoming' }), /composants.*liés/);
  assert.deepEqual(mergeGarages(comparison, { [part.id]: 'incoming', [dependent.id]: 'incoming' }), incoming);
});

test('insurance unions validate contract links and reject duplicate months from distinct record IDs', () => {
  const local = fixture(), incoming = fixture();
  const contract = { id: 'policy', provider: 'Assureur fictif', firstDate: '2026-01-01', debitDay: 1, tariffs: [{ from: '2026-01', amount: '49.9901' }] };
  for (const garage of [local, incoming]) garage.vehicles[0].insurances = [structuredClone(contract)];
  local.vehicles[0].records.push(record('local-payment', { type: 'insurance', insurance: { contractId: 'policy', period: '2026-01' }, totalAmount: '49.9901' }));
  incoming.vehicles[0].records.push(record('incoming-payment', { type: 'insurance', insurance: { contractId: 'policy', period: '2026-01' }, totalAmount: '49.9901' }));
  const comparison = compareGarages(local, incoming);
  assert.throws(() => mergeGarages(comparison), /même contrat et le même mois/);
  const duplicate = comparison.differences.find(({ path }) => path.at(-1) === 'incoming-payment');
  const merged = mergeGarages(comparison, { [duplicate.id]: 'local' });
  assert.equal(merged.vehicles[0].records.filter(({ type }) => type === 'insurance').length, 1);
  assert.equal(Object.hasOwn(merged.vehicles[0].insurances[0], 'skippedPeriods'), false);
});

test('excluding an insurance payment keeps it excluded after calendar reconciliation', () => {
  const local = insured(), incoming = insured();
  local.vehicles[0].records.push(payment('local-payment'));
  const comparison = compareGarages(local, incoming);
  const difference = comparison.differences.find(({ path }) => path.at(-1) === 'local-payment');
  assert.match(difference.consequence, /ne sera pas recréée/);
  const merged = mergeGarages(comparison, { [difference.id]: 'incoming' });
  assert.deepEqual(merged.vehicles[0].insurances[0].skippedPeriods, ['2026-01']);
  assert.equal(merged.vehicles[0].records.filter(({ insurance }) => insurance).length, 0);
  assert.deepEqual(reconcileInsurance(merged, '2026-02-01').garage, merged);
  assert.equal(Object.hasOwn(local.vehicles[0].insurances[0], 'skippedPeriods'), false);
});

test('excluding a trash-only insurance payment does not recreate it and keeps existing exclusions', () => {
  const local = insured(), incoming = insured();
  local.vehicles[0].insurances[0].skippedPeriods = ['2025-12'];
  incoming.vehicles[0].insurances[0].skippedPeriods = ['2025-12'];
  local.vehicles[0].records.push(payment('trash-payment'));
  const archived = moveRecordToTrash(normalize(local), 'car', 'trash-payment', '2026-01-15T10:00:00.000Z');
  const comparison = compareGarages(archived, incoming);
  const difference = comparison.differences.find(({ path }) => path.at(-1) === 'trash-payment');
  const merged = mergeGarages(comparison, { [difference.id]: 'incoming' });
  assert.deepEqual(merged.vehicles[0].insurances[0].skippedPeriods, ['2025-12', '2026-01']);
  assert.deepEqual(merged.vehicles[0].trashedRecords, []);
  assert.deepEqual(reconcileInsurance(merged, '2026-02-01').garage, merged);
});

test('an explicitly chosen planned payment keeps its status after calendar reconciliation', () => {
  const local = insured(), incoming = insured();
  local.vehicles[0].records.push(payment('payment', { status: 'planned' }));
  incoming.vehicles[0].records.push(payment('payment'));
  const comparison = compareGarages(local, incoming);
  const difference = comparison.differences.find(({ path }) => path.at(-1) === 'status');
  assert.match(difference.consequence, /validation automatique sera désactivée/);
  const merged = mergeGarages(comparison, { [difference.id]: 'local' });
  const selected = merged.vehicles[0].records.find(({ id }) => id === 'payment');
  assert.equal(selected.status, 'planned');
  assert.equal(selected.insurance.autoStatus, false);
  assert.deepEqual(reconcileInsurance(merged, '2026-02-01').garage, merged);
  assert.equal(local.vehicles[0].records.at(-1).insurance.autoStatus, true);
});

test('contradictory explicit planned-status and auto-status choices cannot silently overwrite a choice', () => {
  const local = insured(), incoming = insured();
  local.vehicles[0].records.push(payment('payment', { status: 'planned' }));
  incoming.vehicles[0].records.push(payment('payment', { insurance: { contractId: 'policy', period: '2026-01', generated: true, autoStatus: false } }));
  const comparison = compareGarages(local, incoming), choices = choose(comparison, 'local');
  assert.throws(() => mergeGarages(comparison, choices), /contredit la validation automatique/);
  const flag = comparison.differences.find(({ path }) => path.at(-1) === 'autoStatus');
  choices[flag.id] = 'incoming';
  const merged = mergeGarages(comparison, choices);
  assert.deepEqual(reconcileInsurance(merged, '2026-02-01').garage, merged);
});

test('comparison snapshots remain independent of source, display and previous merged-result mutations', () => {
  const local = fixture(), incoming = fixture();
  incoming.vehicles[0].records.push(record('new'));
  const expected = normalize(incoming), comparison = compareGarages(local, incoming);
  incoming.vehicles.length = 0;
  local.vehicles[0].components.length = 0;
  comparison.differences[0].incoming.record.title = 'Changed display copy';
  const merged = mergeGarages(comparison);
  assert.deepEqual(merged, expected);
  merged.vehicles[0].records.length = 0;
  assert.deepEqual(mergeGarages(comparison), expected);
  assert.throws(() => mergeGarages({ ...comparison }), /comparaison a expiré/);
});

test('vehicle selection stays local and all historical fixture shapes remain importable after comparison', () => {
  const local = fixture(), incoming = fixture();
  const extra = { ...structuredClone(local.vehicles[0]), id: 'second' };
  local.vehicles.push(extra); incoming.vehicles.push(structuredClone(extra));
  incoming.activeId = 'second';
  const comparison = compareGarages(local, incoming);
  assert.deepEqual(comparison.differences, []);
  assert.equal(mergeGarages(comparison).activeId, 'car');
  for (const name of ['v1.json', 'v2-early.json', 'v2-complete.json', 'v2-grouped-lines.json']) {
    const fixtureData = parseGarage(readFileSync(new URL(`./fixtures/backups/${name}`, import.meta.url), 'utf8'));
    const identical = compareGarages(fixtureData, fixtureData);
    assert.deepEqual(identical.differences, []);
    assert.deepEqual(mergeGarages(identical), fixtureData);
  }
});
