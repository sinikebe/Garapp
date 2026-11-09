import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage, lineComponentIds, associatedComponentIds, replacementComponentIds, componentHistory, replacementHistory, componentLife, recordCost, vehicleStats, inventory } from '../public/assets/js/garage.js';
import { applyDiscoveries, knownComponents, proposedDiscoveries, recordDiscoveries } from '../public/assets/js/component-knowledge.js';
import { backupBlob, readBackupFile } from '../public/assets/js/backups.js';
import { makeSnapshot, readSnapshot } from '../public/assets/js/drive-format.js';
import { moveRecordToTrash, restoreTrashedRecord } from '../public/assets/js/record-trash.js';

const roundTrip = (garage) => parseGarage(JSON.stringify(garage));
const line = (extra = {}) => ({ id: 'bundle', label: 'Forfait fictif', kind: 'bundle', amount: '120.125', effect: 'replace', componentIds: ['left', 'right'], ...extra });
const record = (extra = {}) => ({ id: 'service', title: 'Intervention fictive', type: 'entretien', status: 'done', date: '2026-01-01', odometer: 20000, componentIds: [], lines: [line()], ...extra });
const fixture = (records = [record()]) => roundTrip({ version: 2, activeId: 'fiction', vehicles: [{
  id: 'fiction', name: 'Véhicule fictif', odometer: 25000,
  components: [
    { id: 'left', name: 'Pneu avant gauche', intervalKm: 20000 },
    { id: 'right', name: 'Pneu avant droit', intervalKm: 30000 },
  ], records,
}] });

test('historical single-component lines retain their shape and effective links', () => {
  const legacy = line({ componentId: 'left' });
  delete legacy.componentIds;
  const garage = fixture([record({ lines: [legacy] })]);
  const saved = garage.vehicles[0].records[0].lines[0];
  assert.equal(saved.componentId, 'left');
  assert.equal(Object.hasOwn(saved, 'componentIds'), false);
  assert.deepEqual(lineComponentIds(saved), ['left']);
  assert.deepEqual(roundTrip(garage), garage);
});

test('a grouped price line links every component while counting its amount only once', () => {
  const garage = fixture(), vehicle = garage.vehicles[0], service = vehicle.records[0];
  assert.deepEqual(service.lines[0].componentIds, ['left', 'right']);
  assert.equal(service.lines[0].componentId, 'left');
  assert.deepEqual(associatedComponentIds(service), ['left', 'right']);
  assert.deepEqual(replacementComponentIds(service), ['left', 'right']);
  assert.equal(recordCost(service).total, '120.125');
  assert.equal(recordCost(service).other, '120.125');
  assert.equal(vehicleStats(vehicle, 'all').amount, '120.125');
  assert.equal(inventory(garage).lines, 1);
  for (const part of vehicle.components) {
    assert.deepEqual(componentHistory(vehicle, part.id).map(({ id }) => id), ['service']);
    assert.deepEqual(replacementHistory(vehicle, part.id).map(({ id }) => id), ['service']);
    assert.equal(componentLife(vehicle, part, '2026-05-01').last.id, 'service');
  }
  assert.equal(componentLife(vehicle, vehicle.components[0], '2026-05-01').km, 15000);
  assert.equal(componentLife(vehicle, vehicle.components[1], '2026-05-01').km, 25000);
});

test('mixed historical and grouped links preserve both associations and normalize idempotently', () => {
  const garage = fixture([record({ lines: [line({ componentId: 'right', componentIds: ['left'] })] })]);
  const saved = garage.vehicles[0].records[0].lines[0];
  assert.deepEqual(saved.componentIds, ['right', 'left']);
  assert.equal(saved.componentId, 'right');
  assert.deepEqual(roundTrip(garage), garage);
  assert.deepEqual(lineComponentIds({ componentId: 'left', componentIds: ['left', 'right'] }), ['left', 'right']);
});

test('the same record appears once per component even with overlapping record and line links', () => {
  const garage = fixture([record({ componentIds: ['left'], observedComponentIds: ['right'], lines: [line(), line({ id: 'second', amount: '10', componentIds: ['left'] })] })]);
  const vehicle = garage.vehicles[0];
  assert.deepEqual(associatedComponentIds(vehicle.records[0]), ['left', 'right']);
  assert.equal(componentHistory(vehicle, 'left').length, 1);
  assert.equal(replacementHistory(vehicle, 'left').length, 1);
  assert.equal(vehicleStats(vehicle, 'all').amount, '130.125');
});

test('the shared action applies to every linked part without treating inspections or plans as replacements', () => {
  for (const effect of ['none', 'inspect', 'service']) {
    const vehicle = fixture([record({ lines: [line({ effect })] })]).vehicles[0];
    for (const part of vehicle.components) {
      assert.equal(componentHistory(vehicle, part.id).length, 1);
      assert.equal(replacementHistory(vehicle, part.id).length, 0);
      assert.equal(componentLife(vehicle, part).status, 'unknown');
    }
  }
  const planned = fixture([record({ status: 'planned' })]).vehicles[0];
  assert.equal(componentHistory(planned, 'right').length, 1);
  assert.equal(replacementHistory(planned, 'right').length, 0);
});

test('grouped line validation rejects malformed, duplicate and missing component references', () => {
  for (const componentIds of [null, false, 'left', {}, ['left', 'left'], ['missing'], [null], [1]]) {
    assert.throws(() => fixture([record({ lines: [line({ componentIds })] })]), /composant/);
  }
  assert.throws(() => fixture([record({ lines: [line({ componentId: 'missing' })] })]), /composant/);
  assert.throws(() => fixture([record({ lines: [line({ componentIds: [], componentId: null })] })]), /remplacement/i);
  const empty = fixture([record({ lines: [line({ effect: 'none', componentIds: [], componentId: null })] })]);
  assert.deepEqual(associatedComponentIds(empty.vehicles[0].records[0]), []);
  const trashed = moveRecordToTrash(fixture(), 'fiction', 'service', '2026-05-01T12:00:00.000Z');
  trashed.vehicles[0].trashedRecords[0].record.lines[0].componentIds.push('missing');
  assert.throws(() => roundTrip(trashed), /composant/);
});

test('grouped lines preserve unknown fields, exact amounts and document bytes through JSON, Drive and trash', async () => {
  const source = { reference: 'Synthetic bundle', details: ['first', { unchanged: true }] };
  const documents = [{ id: 'invoice', name: 'synthetic.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,' + Buffer.from('Synthetic invoice\n').toString('base64'), metadata: { example: true } }];
  const garage = fixture([record({ lines: [line({ amount: '120.125000000000000001', source, documents, description: 'Description fictive', notes: ' Notes conservées. ', content: 'Contenu fictif' })] })]);
  const moved = moveRecordToTrash(garage, 'fiction', 'service', '2026-05-01T12:00:00.000Z');
  const imported = (await readBackupFile(new File([backupBlob(moved)], 'synthetic-bundle.json'))).garage;
  assert.deepEqual(imported, moved);
  const snapshot = await makeSnapshot(imported, [], 'synthetic-namespace', 'synthetic-folder');
  const restored = await readSnapshot(snapshot.blob, { size: snapshot.blob.size, wire: snapshot.metadata.appProperties.wire, hash: snapshot.hash });
  assert.deepEqual(restored, moved);
  const active = restoreTrashedRecord(restored, 'fiction', 'service');
  assert.deepEqual(active.vehicles[0].records[0], garage.vehicles[0].records[0]);
  const saved = active.vehicles[0].records[0].lines[0];
  assert.deepEqual(saved.source, source);
  assert.equal(saved.amount, '120.125000000000000001');
  assert.equal(saved.documents[0].dataUrl, documents[0].dataUrl);
  assert.equal(recordCost(active.vehicles[0].records[0]).total, saved.amount);
});

test('explicit grouped lines do not infer an extra assembly or discard either source of evidence', () => {
  const vehicle = fixture([record({ lines: [line({ label: 'Pneus avant', kind: 'part', effect: 'inspect' })] })]).vehicles[0];
  assert.deepEqual(recordDiscoveries(vehicle.records[0]), []);
  assert.deepEqual(proposedDiscoveries(vehicle, vehicle.records[0]), []);
  const parts = knownComponents(vehicle, '2026-05-01');
  assert.deepEqual(parts.map(({ id }) => id), ['left', 'right']);
  assert.ok(parts.every((part) => part.sources.length === 1 && part.sources[0].id === 'service'));
});

test('several inline components append to one priced line without leaving record-level replacement links', () => {
  const vehicle = fixture([]).vehicles[0];
  const draft = record({ lines: [line({ componentId: 'left', componentIds: ['left'] })] });
  const before = structuredClone({ vehicle, draft });
  const choices = ['Capteur fictif A', 'Capteur fictif B'].map((name) => ({ name, group: 'Exemple', spatial: { kind: 'unknown', zone: 'unknown', side: 'unknown' }, effect: 'replace', lineId: 'bundle', forceNew: true }));
  let sequence = 0;
  const resolved = applyDiscoveries(vehicle, draft, choices, () => `created-${++sequence}`);
  assert.deepEqual({ vehicle, draft }, before);
  assert.deepEqual(resolved.record.componentIds, []);
  assert.deepEqual(resolved.record.observedComponentIds, []);
  assert.deepEqual(resolved.record.lines[0].componentIds, ['left', 'created-1', 'created-2']);
  assert.equal(resolved.record.lines[0].componentId, 'left');
  assert.equal(recordCost(resolved.record).total, '120.125');
  assert.deepEqual(replacementComponentIds(resolved.record), ['left', 'created-1', 'created-2']);
  resolved.record.lines[0].effect = 'inspect';
  assert.deepEqual(replacementComponentIds(resolved.record), []);
  resolved.record.lines[0].componentId = null;
  resolved.record.lines[0].componentIds = [];
  assert.deepEqual(associatedComponentIds(resolved.record), []);
});

test('inline linking preserves separately chosen record associations and avoids duplicate component IDs', () => {
  const vehicle = fixture([]).vehicles[0];
  const draft = record({ componentIds: ['right'], observedComponentIds: ['left'], lines: [line({ componentId: 'left', componentIds: ['left'], effect: 'inspect' })] });
  const choice = { name: 'Pneu avant gauche', targetId: 'left', spatial: { kind: 'tire', zone: 'front', side: 'left' }, effect: 'inspect', lineId: 'bundle' };
  const resolved = applyDiscoveries(vehicle, draft, [choice, choice]);
  assert.deepEqual(resolved.record.lines[0].componentIds, ['left']);
  assert.deepEqual(resolved.record.componentIds, ['right']);
  assert.deepEqual(resolved.record.observedComponentIds, ['left']);
  assert.deepEqual(replacementComponentIds(resolved.record), ['right']);
});
