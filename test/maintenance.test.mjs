import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage, componentLife } from '../public/assets/js/garage.js';
import { maintenanceSummary, checkLife, saveMaintenanceCheck, completeMaintenanceCheck } from '../public/assets/js/maintenance.js';
import { maintenanceMarkup } from '../public/assets/js/maintenance-view.js';
import { compareGarages, mergeGarages } from '../public/assets/js/backup-merge.js';
import { moveRecordToTrash, restoreTrashedRecord } from '../public/assets/js/record-trash.js';

const asOf = '2026-11-26';
const check = (extra = {}) => ({ id: 'pressure', name: 'Pression fictive', intervalDays: 30, firstDate: asOf, enabled: true, notes: '', ...extra });
const garage = (extra = {}) => parseGarage(JSON.stringify({ version: 2, activeId: 'fiction', vehicles: [{ id: 'fiction', name: 'Véhicule fictif', odometer: 18000, components: [], records: [], maintenanceChecks: [check()], ...extra }] }));
const roundTrip = (data) => parseGarage(JSON.stringify(data));

test('the first recurring deadline distinguishes upcoming, soon, due and late without inventing a completion', () => {
  const vehicle = garage().vehicles[0];
  assert.equal(checkLife(vehicle, check(), '2026-11-18').status, 'ok');
  assert.equal(checkLife(vehicle, check(), '2026-11-19').status, 'soon');
  assert.equal(checkLife(vehicle, check(), asOf).status, 'due');
  assert.equal(checkLife(vehicle, check(), '2026-11-28').days, -2);
  assert.equal(checkLife(vehicle, check(), asOf).last, null);
  assert.equal(checkLife(vehicle, check({ enabled: false }), asOf).status, 'paused');
});

test('completing a check creates an independent journal record and starts the next cycle at the actual control date', () => {
  const source = garage(), before = structuredClone(source);
  const result = roundTrip(completeMaintenanceCheck(source, 'fiction', 'pressure', { id: 'done', date: '2026-11-25', odometer: 17700, notes: 'Observation fictive' }, asOf));
  const vehicle = result.vehicles[0], life = checkLife(vehicle, vehicle.maintenanceChecks[0], asOf);
  assert.equal(life.dueDate, '2026-12-25'); assert.equal(life.status, 'ok');
  assert.equal(vehicle.records[0].type, 'controle'); assert.equal(vehicle.records[0].maintenanceCheckId, 'pressure');
  assert.equal(vehicle.records[0].notes, 'Observation fictive');
  assert.equal(vehicle.odometer, 18000); assert.deepEqual(source, before);
  assert.equal(checkLife({ ...vehicle, records: [{ ...vehicle.records[0], date: '2024-02-01' }] }, check({ intervalDays: 29 }), '2024-02-01').dueDate, '2024-03-01');
});

test('planned, incomplete, future, undated and unrelated records do not dismiss a recurring alert', () => {
  const vehicle = garage({ records: [
    { id: 'planned', title: 'Prévision fictive', type: 'controle', status: 'planned', date: asOf, maintenanceCheckId: 'pressure' },
    { id: 'incomplete', title: 'Fiche incomplète fictive', type: 'controle', status: 'incomplete', date: asOf, maintenanceCheckId: 'pressure' },
    { id: 'future', title: 'Fiche future fictive', type: 'controle', date: '2027-01-01', maintenanceCheckId: 'pressure' },
    { id: 'undated', title: 'Fiche non datée fictive', type: 'controle', maintenanceCheckId: 'pressure' },
    { id: 'other', title: 'Autre contrôle fictif', type: 'controle', date: asOf, maintenanceCheckId: 'other' },
    { id: 'reading', title: 'Relevé fictif', type: 'reading', date: asOf, maintenanceCheckId: 'pressure' },
  ] }).vehicles[0];
  assert.equal(checkLife(vehicle, check(), asOf).last, null);
  assert.equal(maintenanceSummary(vehicle, asOf).alerts.length, 1);
});

test('removing and restoring a completion recomputes the reminder from active history only', () => {
  const done = roundTrip(completeMaintenanceCheck(garage(), 'fiction', 'pressure', { id: 'done', date: asOf }, asOf));
  assert.equal(maintenanceSummary(done.vehicles[0], asOf).alerts.length, 0);
  const trashed = moveRecordToTrash(done, 'fiction', 'done');
  assert.equal(maintenanceSummary(trashed.vehicles[0], asOf).alerts.length, 1);
  const restored = restoreTrashedRecord(trashed, 'fiction', 'done');
  assert.equal(maintenanceSummary(restored.vehicles[0], asOf).alerts.length, 0);
});

test('frequency edits apply to the last completed control and pausing preserves history and unknown fields', () => {
  const done = roundTrip(completeMaintenanceCheck(garage({ maintenanceChecks: [check({ origin: { text: 'Source fictive' } })] }), 'fiction', 'pressure', { id: 'done', date: asOf }, asOf));
  const updated = roundTrip(saveMaintenanceCheck(done, 'fiction', { intervalDays: 10, enabled: false }, 'pressure'));
  assert.equal(checkLife(updated.vehicles[0], updated.vehicles[0].maintenanceChecks[0], asOf).dueDate, '2026-12-06');
  assert.equal(maintenanceSummary(updated.vehicles[0], asOf).alerts.length, 0);
  assert.deepEqual(updated.vehicles[0].maintenanceChecks[0].origin, { text: 'Source fictive' });
  assert.equal(updated.vehicles[0].records.length, 1);
});

test('definitions and completion boundaries reject invalid or stale edits without mutating the garage', () => {
  const source = garage();
  for (const patch of [{ intervalDays: 0 }, { intervalDays: 1.5 }, { firstDate: '2026-02-30' }, { enabled: 'yes' }, { name: ' ' }]) assert.throws(() => roundTrip({ ...source, vehicles: [{ ...source.vehicles[0], maintenanceChecks: [check(patch)] }] }));
  assert.throws(() => roundTrip({ ...source, vehicles: [{ ...source.vehicles[0], maintenanceChecks: [check(), check()] }] }));
  assert.throws(() => saveMaintenanceCheck(source, 'fiction', { name: 'Modification fictive' }, 'missing'));
  assert.throws(() => completeMaintenanceCheck(source, 'fiction', 'pressure', { id: 'done', date: '2026-11-27' }, asOf));
  assert.throws(() => completeMaintenanceCheck(source, 'fiction', 'pressure', { id: 'done', date: '2026-02-30' }, asOf));
  assert.equal(source.vehicles[0].records.length, 0);
  const added = saveMaintenanceCheck(source, 'fiction', check({ id: 'lights' }), 'lights');
  assert.equal(added.vehicles[0].maintenanceChecks.length, 2);
});

test('piece alerts use the earliest existing time or distance limit, exclude future replacements and report unknown follow-up separately', () => {
  const source = garage({ maintenanceChecks: [], components: [
    { id: 'part', name: 'Pièce fictive', intervalKm: 10000, intervalMonths: 12 },
    { id: 'unknown', name: 'Pièce sans repère' },
  ], records: [
    { id: 'last', title: 'Remplacement fictif', date: '2026-01-01', odometer: 10000, componentIds: ['part'] },
    { id: 'future', title: 'Remplacement futur fictif', date: '2027-01-01', odometer: 17000, componentIds: ['part'] },
  ] }).vehicles[0];
  assert.equal(componentLife(source, source.components[0], asOf).last.id, 'last');
  const summary = maintenanceSummary(source, asOf);
  assert.equal(summary.alerts.length, 1); assert.equal(summary.alerts[0].status, 'soon'); assert.equal(summary.unknown, 1);
  assert.equal(maintenanceSummary({ ...source, odometer: 20000 }, asOf).alerts[0].status, 'due');
  assert.equal(maintenanceSummary(null, asOf).alerts.length, 0);
});

test('backup merging combines independently added check definitions and requires choices for conflicting frequencies', () => {
  const local = garage(), incoming = garage({ maintenanceChecks: [check({ id: 'lights', name: 'Éclairage fictif' })] });
  const combined = mergeGarages(compareGarages(local, incoming));
  assert.equal(combined.vehicles[0].maintenanceChecks.length, 2);
  const edited = structuredClone(local); edited.vehicles[0].maintenanceChecks[0].intervalDays = 15;
  const comparison = compareGarages(local, edited);
  assert.equal(comparison.conflictCount, 1); assert.throws(() => mergeGarages(comparison));
  assert.equal(mergeGarages(comparison, { [comparison.differences.find((item) => item.conflict).id]: 'incoming' }).vehicles[0].maintenanceChecks[0].intervalDays, 15);
});

test('alert markup escapes names and notes while keeping source actions available and avoiding false reassurance', () => {
  const vehicle = garage({ maintenanceChecks: [check({ name: '<img src=x onerror=alert(1)>', notes: '<script>fiction</script>' })] }).vehicles[0];
  const html = maintenanceMarkup(vehicle, asOf);
  assert.match(html, /&lt;img/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /data-complete-check="pressure"/);
  assert.match(html, /pas une mesure de l’état réel/);
});
