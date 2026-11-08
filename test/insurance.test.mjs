import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage, inventory, vehicleStats, componentLife } from '../public/assets/js/garage.js';
import { dueDate, premiumAt, reconcileInsurance, changeInsurancePayment, insuranceRows, insuranceSummary } from '../public/assets/js/insurance.js';
import { moveRecordToTrash, restoreTrashedRecord, discardTrashedRecord } from '../public/assets/js/record-trash.js';
import { recordDiscoveries, knownComponents } from '../public/assets/js/component-knowledge.js';
import { backupBlob, readBackupFile, fingerprint } from '../public/assets/js/backups.js';
import { mileageHistory, spendingHistory } from '../public/assets/js/statistics.js';
import { resolveSection, normalizeFilters } from '../public/assets/js/navigation.js';

const asOf = '2026-11-08';
const roundTrip = (value) => parseGarage(JSON.stringify(value));
const fixture = (fields = {}) => roundTrip({ version: 2, activeId: 'car', vehicles: [{ id: 'car', name: 'Véhicule fictif', components: [], records: [], insurances: [{ id: 'contract', provider: 'Assureur fictif', reference: 'EXEMPLE', firstDate: '2026-01-31', debitDay: 31, tariffs: [{ from: '2026-01', amount: '50' }], ...fields }] }] });
const catchUp = (garage = fixture(), date = asOf) => reconcileInsurance(garage, date).garage;
const payment = (garage, period, id = 'contract') => garage.vehicles[0].records.find((record) => record.insurance?.period === period && record.insurance.contractId === id);
const contract = (garage) => garage.vehicles[0].insurances[0];

test('monthly dates clamp to short months without drifting and keep the exact first debit', () => {
  const entry = contract(fixture());
  assert.equal(dueDate(entry, '2026-02'), '2026-02-28');
  assert.equal(dueDate(entry, '2026-03'), '2026-03-31');
  assert.equal(dueDate(entry, '2028-02'), '2028-02-29');
  assert.equal(dueDate(entry, '2025-12'), null);
  assert.equal(dueDate({ ...entry, firstDate: '2026-01-20', debitDay: 5 }, '2026-01'), '2026-01-20');
  assert.equal(dueDate({ ...entry, firstDate: '2026-01-20', debitDay: 5 }, '2026-02'), '2026-02-05');
  assert.equal(dueDate(entry, '2026-13'), null);
});

test('opening catches up due months only, idempotently and identically on two devices', async () => {
  const garage = fixture(), original = structuredClone(garage);
  const first = reconcileInsurance(garage, asOf), second = reconcileInsurance(structuredClone(garage), asOf);
  assert.equal(first.added, 10); assert.equal(first.changed, true);
  assert.deepEqual(first.garage, second.garage); assert.deepEqual(garage, original);
  assert.equal(await fingerprint(backupBlob(first.garage)), await fingerprint(backupBlob(second.garage)));
  const again = reconcileInsurance(first.garage, asOf);
  assert.equal(again.garage, first.garage); assert.equal(again.changed, false);
  assert.equal(payment(first.garage, '2026-11'), undefined);
  assert.equal(payment(first.garage, '2026-02').date, '2026-02-28');
  assert.ok(first.garage.vehicles[0].records.every((record) => record.odometer === null && record.status === 'done'));
  assert.deepEqual(roundTrip(first.garage), first.garage);
});

test('a one-off correction preserves the recurring premium and all other months', () => {
  const original = catchUp();
  const next = changeInsurancePayment(original, 'car', 'contract', '2026-03', { amount: '45.123456789', notes: 'Ajustement fictif', date: '2026-03-28' }, 'one', asOf);
  assert.equal(payment(next, '2026-03').totalAmount, '45.123456789');
  assert.equal(payment(next, '2026-03').date, '2026-03-28');
  assert.equal(payment(next, '2026-03').insurance.overridden, true);
  assert.deepEqual(payment(next, '2026-04'), payment(original, '2026-04'));
  assert.deepEqual(contract(next), contract(original));
  assert.equal(premiumAt(contract(next), '2026-12'), '50');
  assert.equal(payment(original, '2026-03').totalAmount, '50');
});

test('forward corrections update the selected and subsequent prices, including scheduled increases', () => {
  let garage = catchUp(fixture({ tariffs: [{ from: '2026-01', amount: '50', source: { fictive: true } }, { from: '2026-12', amount: '80', source: 'Exemple conservé' }] }));
  garage = changeInsurancePayment(garage, 'car', 'contract', '2026-03', { amount: '45' }, 'one', asOf);
  garage = changeInsurancePayment(garage, 'car', 'contract', '2026-12', { amount: '60', notes: 'Exception fictive' }, 'one', asOf);
  const previous = structuredClone(garage), december = payment(garage, '2026-12');
  garage = changeInsurancePayment(garage, 'car', 'contract', '2026-06', { amount: '55' }, 'forward', asOf);
  assert.deepEqual(payment(garage, '2026-05'), payment(previous, '2026-05'));
  assert.equal(payment(garage, '2026-03').totalAmount, '45');
  assert.equal(payment(garage, '2026-06').totalAmount, '55');
  assert.equal(payment(garage, '2026-12').totalAmount, '55');
  assert.equal(payment(garage, '2026-12').notes, december.notes);
  assert.equal(payment(garage, '2026-12').date, december.date);
  assert.equal(payment(garage, '2026-12').status, 'planned');
  assert.equal(premiumAt(contract(garage), '2026-12'), '55');
  assert.equal(premiumAt(contract(garage), '2027-08'), '55');
  assert.deepEqual(contract(garage).tariffs.slice(0, 2), contract(previous).tariffs);
  assert.equal(insuranceSummary(garage.vehicles[0], '2026', asOf).amount, '520');
});

test('changing the tariff twice in one month retains prior rates and the latest wins', () => {
  let garage = changeInsurancePayment(catchUp(), 'car', 'contract', '2026-06', { amount: '55' }, 'forward', asOf);
  garage = changeInsurancePayment(garage, 'car', 'contract', '2026-06', { amount: '53.50' }, 'forward', asOf);
  assert.equal(premiumAt(contract(garage), '2026-05'), '50');
  assert.equal(premiumAt(contract(garage), '2026-06'), '53.50');
  assert.equal(premiumAt(contract(garage), '2026-12'), '53.50');
  assert.deepEqual(contract(garage).tariffs.map((tariff) => tariff.amount), ['50', '55', '53.50']);
});

test('future exceptions remain planned, count once when due, and respect explicit manual status', () => {
  let garage = changeInsurancePayment(catchUp(), 'car', 'contract', '2026-12', { amount: '60' }, 'one', asOf);
  assert.equal(payment(garage, '2026-12').status, 'planned');
  assert.equal(vehicleStats(garage.vehicles[0], '2026', 'all').amount, '500');
  assert.equal(insuranceRows(garage.vehicles[0], '2026', asOf).find((row) => row.period === '2026-12').amount, '60');
  garage = catchUp(garage, '2027-01-01');
  assert.equal(garage.vehicles[0].records.length, 12);
  assert.equal(payment(garage, '2026-12').totalAmount, '60');
  assert.equal(payment(garage, '2026-12').status, 'done');
  assert.equal(vehicleStats(garage.vehicles[0], '2026', 'all').amount, '610');
  const manual = changeInsurancePayment(fixture(), 'car', 'contract', '2026-12', { amount: '10' }, 'one', asOf);
  payment(manual, '2026-12').insurance.autoStatus = false;
  assert.equal(payment(catchUp(manual, '2027-01-01'), '2026-12').status, 'planned');
});

test('moving one debit into the next month delays automatic recording without duplicates', () => {
  let garage = catchUp(fixture(), '2026-02-01');
  garage = changeInsurancePayment(garage, 'car', 'contract', '2026-01', { amount: '50', date: '2026-02-05' }, 'one', '2026-02-01');
  assert.equal(payment(garage, '2026-01').status, 'planned');
  assert.equal(payment(catchUp(garage, '2026-02-04'), '2026-01').status, 'planned');
  const due = catchUp(garage, '2026-02-05');
  assert.equal(payment(due, '2026-01').status, 'done');
  assert.equal(due.vehicles[0].records.length, 1);
});

test('ending a contract stops new debits, keeps earlier facts and freezes out-of-calendar previews', () => {
  let garage = changeInsurancePayment(catchUp(), 'car', 'contract', '2026-12', { amount: '60' }, 'one', asOf);
  contract(garage).endDate = '2026-11-30';
  garage = catchUp(garage, '2027-03-01');
  assert.equal(garage.vehicles[0].records.length, 12);
  assert.equal(payment(garage, '2026-11').status, 'done');
  assert.equal(payment(garage, '2026-12').status, 'planned');
  assert.equal(insuranceRows(garage.vehicles[0], '2026', '2027-03-01').at(-1).state, 'Hors calendrier');
  assert.equal(vehicleStats(garage.vehicles[0], '2026', 'all').amount, '550');
  assert.equal(dueDate(contract(fixture({ endDate: '2026-02-28' })), '2026-02'), '2026-02-28');
  assert.equal(dueDate(contract(fixture({ endDate: '2026-02-27' })), '2026-02'), null);
});

test('trash blocks regeneration and forward edits leave the entire trashed payment untouched', () => {
  const garage = catchUp(), record = payment(garage, '2026-07');
  let next = moveRecordToTrash(garage, 'car', record.id, '2026-11-08T12:00:00.000Z');
  const entry = structuredClone(next.vehicles[0].trashedRecords[0]);
  next = catchUp(next);
  assert.equal(payment(next, '2026-07'), undefined);
  next = changeInsurancePayment(next, 'car', 'contract', '2026-06', { amount: '55' }, 'forward', asOf);
  assert.deepEqual(next.vehicles[0].trashedRecords[0], entry);
  assert.throws(() => changeInsurancePayment(next, 'car', 'contract', '2026-07', { amount: '5' }, 'one', asOf), /corbeille/);
  next = catchUp(restoreTrashedRecord(next, 'car', record.id));
  assert.deepEqual(payment(next, '2026-07'), record);
  assert.equal(payment(next, '2026-08').totalAmount, '55');
});

test('permanent deletion records an exclusion so opening the app never resurrects the debit', () => {
  const garage = catchUp(), record = payment(garage, '2026-04');
  let next = discardTrashedRecord(moveRecordToTrash(garage, 'car', record.id), 'car', record.id);
  assert.deepEqual(contract(next).skippedPeriods, ['2026-04']);
  next = catchUp(roundTrip(next), '2027-01-01');
  assert.equal(payment(next, '2026-04'), undefined);
  assert.equal(insuranceRows(next.vehicles[0], '2026', asOf).find((row) => row.period === '2026-04').state, 'Exclu');
  assert.equal(next.vehicles[0].records.length, 11);
});

test('multiple contracts and vehicles keep independent calendars and edits', () => {
  const garage = fixture();
  garage.vehicles[0].insurances.push({ ...structuredClone(contract(garage)), id: 'second', tariffs: [{ from: '2026-01', amount: '10' }], endDate: '2026-03-31' });
  garage.vehicles.push({ ...structuredClone(garage.vehicles[0]), id: 'other-car' });
  const due = catchUp(roundTrip(garage));
  assert.equal(due.vehicles[0].records.length, 13); assert.equal(due.vehicles[1].records.length, 13);
  const next = changeInsurancePayment(due, 'car', 'contract', '2026-02', { amount: '20' }, 'forward', asOf);
  assert.deepEqual(next.vehicles[1], due.vehicles[1]);
  assert.deepEqual(payment(next, '2026-02', 'second'), payment(due, '2026-02', 'second'));
});

test('insurance is counted once in all expenses, without maintenance, mileage or component evidence', () => {
  const garage = catchUp(), vehicle = garage.vehicles[0];
  vehicle.components.push({ id: 'engine', name: 'Moteur fictif', spatial: { presenceOrigin: 'record' }, intervalMonths: 1 });
  const record = vehicle.records[0]; record.title = 'Assurance moteur et roues'; record.componentIds = ['engine'];
  record.lines.push({ id: 'line', label: 'Moteur', kind: 'part', effect: 'replace', componentId: 'engine', amount: '50' });
  assert.equal(vehicleStats(vehicle, '2026').amount, '0');
  assert.equal(vehicleStats(vehicle, '2026', 'all').amount, '500');
  assert.equal(componentLife(vehicle, vehicle.components[0], asOf).status, 'unknown');
  assert.deepEqual(recordDiscoveries(record), []); assert.deepEqual(knownComponents(vehicle, asOf), []);
  assert.equal(mileageHistory(vehicle, { date: asOf }).groups.length, 0);
  assert.equal(spendingHistory(vehicle, { date: asOf, scope: 'all' }).amount, '500');
});

test('exact contract, tariff, payment and document metadata survive corrections and backup sync payloads', async () => {
  const garage = catchUp(fixture({ source: { fictive: ['Préservé'] }, tariffs: [{ from: '2026-01', amount: '50.123456789', source: { currency: 'EUR' } }] }));
  const document = { id: 'doc', name: 'contrat-fictif.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,RmljdGlm', size: 6, description: '', source: 'Exemple' };
  contract(garage).documents.push(document); payment(garage, '2026-06').documents.push({ ...document, id: 'debit-doc' });
  payment(garage, '2026-06').insurance.source = { fictive: true };
  payment(garage, '2026-06').custom = { preserved: [1, 'Exemple'] };
  const next = roundTrip(changeInsurancePayment(garage, 'car', 'contract', '2026-06', { amount: '55.000000000001' }, 'forward', asOf));
  assert.deepEqual(contract(next).source, contract(garage).source);
  assert.deepEqual(contract(next).tariffs[0], contract(garage).tariffs[0]);
  assert.deepEqual(payment(next, '2026-06').insurance.source, { fictive: true });
  assert.deepEqual(payment(next, '2026-06').documents, payment(garage, '2026-06').documents);
  assert.deepEqual(payment(next, '2026-06').custom, { preserved: [1, 'Exemple'] });
  assert.equal(inventory(next).insurances, 1); assert.equal(inventory(next).documents, 2); assert.equal(inventory(next).bytes, 12);
  const imported = await readBackupFile(new File([backupBlob(next)], 'assurance-fictive.json'));
  assert.deepEqual(imported.garage, next);
  assert.equal(await fingerprint(backupBlob(imported.garage)), await fingerprint(backupBlob(next)));
});

test('refunds are possible for a single debit; recurring premiums reject negative or unknown values', () => {
  const garage = catchUp();
  const next = changeInsurancePayment(garage, 'car', 'contract', '2026-06', { amount: '-5.25' }, 'one', asOf);
  assert.equal(vehicleStats(next.vehicles[0], '2026', 'all').amount, '444.75');
  assert.throws(() => changeInsurancePayment(garage, 'car', 'contract', '2026-06', { amount: '-5' }, 'forward', asOf));
  for (const amount of [null, 50, '-1', 'NaN', '1e2']) assert.throws(() => fixture({ tariffs: [{ from: '2026-01', amount }] }));
  assert.equal(vehicleStats(catchUp(fixture({ tariffs: [{ from: '2026-01', amount: '0' }] })).vehicles[0], '2026', 'all').amount, '0');
});

test('malformed schedules, dangling links and duplicate periods are rejected before replacement', () => {
  for (const fields of [{ firstDate: '2026-02-30' }, { firstDate: '1899-01-01' }, { debitDay: 0 }, { debitDay: 32 }, { endDate: '2025-01-01' }, { tariffs: [] }, { tariffs: [{ from: '2026-02', amount: '10' }] }, { skippedPeriods: ['2026-13'] }, { skippedPeriods: ['2026-01', '2026-01'] }]) assert.throws(() => fixture(fields));
  const garage = catchUp();
  for (const mutate of [
    (record) => { record.insurance.contractId = 'absent'; },
    (record) => { record.insurance.period = '2026-13'; },
    (record) => { record.insurance.autoStatus = 'yes'; },
    (record) => { record.type = 'other'; },
  ]) { const next = structuredClone(garage); mutate(next.vehicles[0].records[0]); assert.throws(() => roundTrip(next)); }
  const duplicate = structuredClone(garage); duplicate.vehicles[0].records.push({ ...duplicate.vehicles[0].records[0], id: 'duplicate' });
  assert.throws(() => roundTrip(duplicate), /même contrat et le même mois/);
  const duplicateTrash = moveRecordToTrash(garage, 'car', garage.vehicles[0].records[0].id);
  duplicateTrash.vehicles[0].records.push({ ...garage.vehicles[0].records[0], id: 'duplicate' });
  assert.throws(() => roundTrip(duplicateTrash), /corbeille comprise/);
});

test('record limits fail atomically without mutating a garage or partially returning catch-up', () => {
  const garage = fixture();
  garage.vehicles[0].records = Array.from({ length: 19999 }, (_, index) => ({ id: `manual-${index}`, type: 'other' }));
  const before = structuredClone(garage);
  assert.throws(() => reconcileInsurance(garage, asOf), /20 000/);
  assert.deepEqual(garage, before);
});

test('payment IDs remain bounded and deterministic when a legacy record occupies the preferred ID', () => {
  const garage = fixture({ id: 'a'.repeat(128) });
  const first = catchUp(garage, '2026-02-01');
  const id = first.vehicles[0].records[0].id;
  garage.vehicles[0].records.push({ id, title: 'Fiche fictive', type: 'other' });
  const next = catchUp(garage, '2026-02-01');
  assert.equal(next.vehicles[0].records[1].id, id + '-1');
  assert.ok(next.vehicles[0].records[1].id.length <= 128);
  assert.deepEqual(next, catchUp(structuredClone(garage), '2026-02-01'));
});

test('older backups remain unchanged; assurance navigation and year filters are independent', () => {
  const garage = fixture(); delete garage.vehicles[0].insurances;
  const parsed = roundTrip(garage);
  assert.equal(Object.hasOwn(parsed.vehicles[0], 'insurances'), false);
  assert.equal(reconcileInsurance(parsed, asOf).garage, parsed);
  assert.equal(resolveSection('#assurance'), 'assurance');
  assert.equal(normalizeFilters({ insuranceYear: '2027' }, '2026').insuranceYear, '2027');
  assert.equal(normalizeFilters({ insuranceYear: 'invalid' }, '2026').insuranceYear, '2026');
});

test('a future contract or a calendar with excluded years still exposes the next real forecast', () => {
  const future = fixture({ firstDate: '2030-02-28', tariffs: [{ from: '2030-02', amount: '70' }] });
  assert.equal(insuranceSummary(future.vehicles[0], '2026', asOf).next.date, '2030-02-28');
  const skipped = [];
  for (const year of ['2026', '2027']) for (let month = 1; month <= 12; month++) skipped.push(`${year}-${String(month).padStart(2, '0')}`);
  const garage = fixture({ skippedPeriods: skipped });
  assert.equal(insuranceSummary(garage.vehicles[0], '2026', asOf).next.date, '2028-01-31');
});

test('unlinked insurance expenses and incomplete debits stay visible without inventing an amount', () => {
  const garage = catchUp();
  const first = garage.vehicles[0].records[0]; first.status = 'incomplete'; first.totalAmount = null;
  garage.vehicles[0].records.push({ id: 'standalone', title: 'Frais fictifs', type: 'insurance', status: 'done', date: '2026-01-10', totalAmount: '10', lines: [] });
  const current = roundTrip(garage).vehicles[0], summary = insuranceSummary(current, '2026', asOf);
  assert.equal(summary.amount, '460'); assert.equal(summary.incomplete, true); assert.equal(summary.count, 11);
  assert.equal(insuranceRows(current, '2026', asOf)[0].state, 'À compléter');
  assert.equal(insuranceRows(current, '2026', asOf)[0].amount, null);
});

test('amount-only corrections retain unknown dates and pre-existing incomplete statuses', () => {
  const garage = catchUp();
  payment(garage, '2026-02').date = null;
  payment(garage, '2026-03').status = 'incomplete';
  let next = changeInsurancePayment(garage, 'car', 'contract', '2026-02', { amount: '42' }, 'one', asOf);
  assert.equal(payment(next, '2026-02').date, null);
  assert.equal(payment(next, '2026-02').status, 'done');
  assert.equal(insuranceRows(next.vehicles[0], '2026', asOf).find((row) => row.period === '2026-02').date, null);
  next = changeInsurancePayment(next, 'car', 'contract', '2026-03', { amount: '45' }, 'one', asOf);
  assert.equal(payment(next, '2026-03').status, 'incomplete');
  assert.equal(payment(catchUp(next), '2026-02').date, null);
  assert.equal(payment(catchUp(next), '2026-03').status, 'incomplete');
});
