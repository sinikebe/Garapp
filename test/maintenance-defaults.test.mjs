import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage } from '../public/assets/js/garage.js';
import { ensureMaintenanceDefaults, MAINTENANCE_PRESETS } from '../public/assets/js/maintenance-defaults.js';
import { checkLife, maintenanceSummary, completeMaintenanceCheck, saveMaintenanceCheck } from '../public/assets/js/maintenance.js';
import { maintenanceMarkup } from '../public/assets/js/maintenance-view.js';
import { compareGarages, mergeGarages } from '../public/assets/js/backup-merge.js';

const date = '2026-11-26';
const garage = (fields = {}) => parseGarage(JSON.stringify({ version: 2, activeId: 'fiction', vehicles: [{ id: 'fiction', name: 'Véhicule fictif', components: [], records: [], ...fields }] }));
const normalized = (source) => parseGarage(JSON.stringify(source));
const seeded = (source = garage()) => normalized(ensureMaintenanceDefaults(source, date).garage);
const check = (source, key) => source.vehicles[0].maintenanceChecks.find((one) => one.presetKey === key);

test('French prevention defaults carry actual month and kilometre frequencies without inventing a completed check', () => {
  const source = garage(), before = structuredClone(source), result = seeded(source);
  assert.equal(result.vehicles[0].maintenanceChecks.length, 4);
  assert.equal(check(result, 'fr-tyre-pressure').intervalMonths, 1);
  assert.equal(check(result, 'fr-engine-oil').intervalKm, 2500);
  assert.equal(check(result, 'fr-coolant').intervalMonths, 3);
  assert.equal(check(result, 'fr-brake-fluid').intervalMonths, 3);
  assert.equal(result.vehicles[0].records.length, 0);
  assert.ok(result.vehicles[0].maintenanceChecks.every((one) => one.firstDate === date));
  assert.equal(maintenanceSummary(result.vehicles[0], date).alerts.length, 4);
  assert.deepEqual(source, before);
  assert.ok(MAINTENANCE_PRESETS.every((preset) => new URL(preset.source).hostname.endsWith('.gouv.fr')));
});

test('seeding is idempotent and never overwrites a matching custom pressure reminder, including a pause', () => {
  const custom = { id: 'custom-pressure', name: 'Pression pneumatiques personnalisée', intervalDays: 14, firstDate: '2026-10-01', enabled: false, notes: 'Note fictive', source: { text: 'À conserver' } };
  const first = seeded(garage({ maintenanceChecks: [custom] }));
  assert.equal(first.vehicles[0].maintenanceChecks.length, 4);
  assert.deepEqual(first.vehicles[0].maintenanceChecks[0], custom);
  const repeat = ensureMaintenanceDefaults(first, '2026-12-01');
  assert.equal(repeat.changed, false); assert.equal(repeat.garage, first);
  const pressure = first.vehicles[0].maintenanceChecks[0]; pressure.intervalDays = 7;
  assert.equal(ensureMaintenanceDefaults(first, date).garage.vehicles[0].maintenanceChecks[0].intervalDays, 7);
});

test('electric motor descriptions pause only the new engine-oil preset while hybrids keep it', () => {
  assert.equal(check(seeded(garage({ engine: '100 % électrique' })), 'fr-engine-oil').enabled, false);
  assert.equal(check(seeded(garage({ engine: 'Hybride essence électrique' })), 'fr-engine-oil').enabled, true);
  const custom = { id: 'oil', name: 'Niveau huile moteur', intervalDays: 5, firstDate: date, enabled: true };
  const result = seeded(garage({ engine: 'Électrique', maintenanceChecks: [custom] }));
  assert.equal(result.vehicles[0].maintenanceChecks[0].enabled, true);
});

test('calendar months clamp at month ends and daily schedules retain their original duration', () => {
  const records = [{ id: 'done', title: 'Contrôle fictif', type: 'controle', date: '2025-01-31', maintenanceCheckId: 'monthly' }];
  const source = garage({ records, maintenanceChecks: [{ id: 'monthly', name: 'Contrôle mensuel fictif', intervalMonths: 1, firstDate: '2025-01-01' }] }).vehicles[0];
  assert.equal(checkLife(source, source.maintenanceChecks[0], '2025-02-27').dueDate, '2025-02-28');
  assert.equal(checkLife(source, source.maintenanceChecks[0], '2025-02-28').status, 'due');
  const leap = { ...source, records: [{ ...source.records[0], date: '2024-01-31' }] };
  assert.equal(checkLife(leap, source.maintenanceChecks[0], '2024-02-28').dueDate, '2024-02-29');
  assert.equal(checkLife(source, { ...source.maintenanceChecks[0], intervalMonths: null, intervalDays: 30 }, '2025-02-01').dueDate, '2025-03-02');
});

test('kilometre reminders follow the latest coherent dated observations and require a completion counter', () => {
  const source = seeded(); const oil = check(source, 'fr-engine-oil');
  assert.throws(() => completeMaintenanceCheck(source, 'fiction', oil.id, { id: 'bad', date }, date), /compteur observé/);
  const done = normalized(completeMaintenanceCheck(source, 'fiction', oil.id, { id: 'done', date: '2026-11-01', odometer: 20000 }, date));
  const vehicle = done.vehicles[0];
  vehicle.records.push({ id: 'reading', type: 'reading', title: 'Relevé fictif', date: '2026-11-25', odometer: 22000, status: 'done' });
  let life = checkLife(vehicle, oil, date);
  assert.equal(life.dueDate, null); assert.equal(life.dueOdometer, 22500); assert.equal(life.km, 500); assert.equal(life.status, 'soon');
  vehicle.records.at(-1).odometer = 22500;
  life = checkLife(vehicle, oil, date); assert.equal(life.status, 'due');
  vehicle.records.at(-1).status = 'planned'; assert.equal(checkLife(vehicle, oil, date).status, 'ok');
  vehicle.records.at(-1).status = 'done'; vehicle.records.at(-1).date = '2027-01-01'; assert.equal(checkLife(vehicle, oil, date).status, 'ok');
  vehicle.records.at(-1).date = '2026-11-25'; vehicle.records.at(-1).odometer = 19000;
  assert.equal(checkLife(vehicle, oil, date).status, 'unknown');
});

test('cadence edits preserve presets and metadata, reject ambiguous units and round-trip through backup merging', () => {
  const source = seeded(), pressure = check(source, 'fr-tyre-pressure');
  const changed = normalized(saveMaintenanceCheck(source, 'fiction', { intervalMonths: null, intervalDays: 15, enabled: false }, pressure.id));
  assert.equal(check(changed, 'fr-tyre-pressure').presetKey, 'fr-tyre-pressure');
  assert.throws(() => normalized(saveMaintenanceCheck(source, 'fiction', { intervalDays: 15 }, pressure.id)));
  const comparison = compareGarages(source, changed), choices = Object.fromEntries(comparison.differences.filter((one) => one.conflict).map((one) => [one.id, 'incoming']));
  const merged = mergeGarages(comparison, choices);
  assert.equal(check(merged, 'fr-tyre-pressure').enabled, false); assert.equal(merged.vehicles[0].maintenanceDefaultsVersion, 1);
  const html = maintenanceMarkup(changed.vehicles[0], date);
  assert.match(html, /Fréquence personnalisée/); assert.match(html, /pas des échéances légales/); assert.doesNotMatch(html, /pression.*2,5 bar/);
});
