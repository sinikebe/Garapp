/** Deterministic, offline insurance scheduling. Forecasts are not recorded expenses. */
import { today, recordCost } from './garage.js';
import { isAmount, sumAmounts } from './amounts.js';
import { isInsuranceDate, isInsurancePeriod, isPremium } from './insurance-schema.js';

export const contractLabel = (contract) => contract.provider || 'Assurance';
export function nextPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  return `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
}
export function premiumAt(contract, period) {
  let current = null;
  for (const tariff of contract.tariffs) if (tariff.from <= period && (!current || tariff.from >= current.from)) current = tariff;
  return current?.amount ?? null;
}
export function dueDate(contract, period) {
  if (!isInsurancePeriod(period) || period < contract.firstDate.slice(0, 7) || contract.skippedPeriods?.includes(period)) return null;
  const [year, month] = period.split('-').map(Number);
  const day = Math.min(contract.debitDay, new Date(Date.UTC(year, month, 0)).getUTCDate());
  const date = period === contract.firstDate.slice(0, 7) ? contract.firstDate : `${period}-${String(day).padStart(2, '0')}`;
  return contract.endDate && date > contract.endDate ? null : date;
}
const linked = (record, contractId, period) => record.insurance?.contractId === contractId && record.insurance.period === period;
const periodKey = (record) => record.insurance ? `${record.insurance.contractId}:${record.insurance.period}` : null;

/** Stable IDs let two devices catch up the same contract without introducing random copies. */
function paymentId(contract, period) {
  let hash = 14695981039346656037n;
  for (const character of contract.id) hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0))) * 1099511628211n);
  return `ins-${contract.id.slice(0, 60)}-${hash.toString(16)}-${period}`;
}
function newPayment(vehicle, contract, period, date, asOf, ids = new Set([...vehicle.records, ...(vehicle.trashedRecords ?? []).map((entry) => entry.record)].map((record) => record.id))) {
  const stem = paymentId(contract, period);
  let id = stem, suffix = 0;
  while (ids.has(id)) id = `${stem}-${++suffix}`;
  ids.add(id);
  return {
    id, title: `Assurance · ${contractLabel(contract)}`, type: 'insurance', status: date <= asOf ? 'done' : 'planned',
    date, odometer: null, partsAmount: null, laborAmount: null, totalAmount: premiumAt(contract, period),
    componentIds: [], lines: [], notes: '', content: '', documents: [],
    insurance: { contractId: contract.id, period, generated: true, overridden: false, autoStatus: true },
  };
}

/** Generate only due debits, atomically; missed months are caught up on the next opening. */
export function reconcileInsurance(garage, date = today()) {
  if (!isInsuranceDate(date)) throw Error('La date de calcul des assurances est invalide.');
  const updates = new Map();
  let added = 0;
  for (const vehicle of garage.vehicles) {
    if (!vehicle.insurances?.length) continue;
    const records = [...vehicle.records];
    const ids = new Set([...records, ...(vehicle.trashedRecords ?? []).map((entry) => entry.record)].map((record) => record.id));
    const occupied = new Set([...records, ...(vehicle.trashedRecords ?? []).map((entry) => entry.record)].map(periodKey).filter(Boolean));
    let changed = false;
    for (let index = 0; index < records.length; index++) {
      const record = records[index], contract = vehicle.insurances.find((one) => one.id === record.insurance?.contractId);
      if (contract && record.status === 'planned' && record.insurance.generated && record.insurance.autoStatus !== false && record.date && record.date <= date && dueDate(contract, record.insurance.period)) {
        records[index] = { ...record, status: 'done' }; changed = true;
      }
    }
    for (const contract of [...vehicle.insurances].sort((a, b) => a.id.localeCompare(b.id))) {
      for (let period = contract.firstDate.slice(0, 7); period <= date.slice(0, 7); period = nextPeriod(period)) {
        const due = dueDate(contract, period), key = `${contract.id}:${period}`;
        if (!due || due > date || occupied.has(key)) continue;
        if (records.length + (vehicle.trashedRecords?.length ?? 0) >= 20000) throw Error('Les assurances dépasseraient la limite de 20 000 fiches par véhicule. Aucune échéance supplémentaire n’a été créée.');
        const record = newPayment(vehicle, contract, period, due, date, ids);
        record.status = 'done'; records.push(record); occupied.add(key); added++; changed = true;
      }
    }
    if (changed) updates.set(vehicle.id, { ...vehicle, records });
  }
  return { garage: updates.size ? { ...garage, vehicles: garage.vehicles.map((vehicle) => updates.get(vehicle.id) ?? vehicle) } : garage, changed: updates.size > 0, added };
}

/** Correct one debit or set a tariff from that month, retaining all original metadata. */
export function changeInsurancePayment(garage, vehicleId, contractId, period, fields, scope = 'one', date = today()) {
  if (!isInsuranceDate(date)) throw Error('La date de calcul des assurances est invalide.');
  if (!isInsurancePeriod(period) || !['one', 'forward'].includes(scope) || fields.amount == null || !isAmount(fields.amount) || scope === 'forward' && !isPremium(fields.amount)) throw Error('Indiquez un mois et un montant valides. Une cotisation récurrente doit être positive ou nulle.');
  if (fields.date !== undefined && !isInsuranceDate(fields.date)) throw Error('La date du prélèvement est invalide.');
  const next = structuredClone(garage), vehicle = next.vehicles.find((one) => one.id === vehicleId), contract = vehicle?.insurances?.find((one) => one.id === contractId);
  if (!contract) throw Error('Le contrat d’assurance est introuvable.');
  if (contract.skippedPeriods?.includes(period) || vehicle.trashedRecords?.some((entry) => linked(entry.record, contractId, period))) throw Error('Cette échéance est exclue ou dans la corbeille. Restaurer sa fiche avant de la modifier.');
  let record = vehicle.records.find((one) => linked(one, contractId, period));
  const scheduled = dueDate(contract, period);
  if (!record && !scheduled) throw Error('Ce mois ne comporte pas d’échéance pour ce contrat.');
  if (scope === 'forward') {
    if (contract.tariffs.length >= 1000) throw Error('La limite de 1 000 tarifs par contrat est atteinte.');
    // Cancel superseded future changes without removing their history or extra fields.
    // Appending equal-month entries keeps previous amounts available in the backup.
    const future = [...new Set(contract.tariffs.filter((tariff) => tariff.from > period).map((tariff) => tariff.from))];
    if (contract.tariffs.length + future.length + 1 > 1000) throw Error('La limite de 1 000 tarifs par contrat serait dépassée.');
    contract.tariffs.push({ from: period, amount: fields.amount }, ...future.map((from) => ({ from, amount: fields.amount })));
    for (const item of vehicle.records) if (item.insurance?.contractId === contractId && item.insurance.period >= period) {
      item.totalAmount = fields.amount; item.insurance.overridden = false;
    }
  }
  if (!record) {
    if (vehicle.records.length + (vehicle.trashedRecords?.length ?? 0) >= 20000) throw Error('La limite de 20 000 fiches par véhicule est atteinte.');
    record = newPayment(vehicle, contract, period, scheduled, date); vehicle.records.push(record);
  }
  record.totalAmount = fields.amount;
  record.insurance.overridden = scope === 'one';
  if (fields.date !== undefined) record.date = fields.date;
  if (fields.notes !== undefined) record.notes = fields.notes;
  if (fields.date !== undefined && record.insurance.generated && record.insurance.autoStatus !== false) record.status = record.date <= date && scheduled ? 'done' : 'planned';
  return next;
}

/** A year combines immutable recorded facts, future forecasts and deletion markers. */
export function insuranceRows(vehicle, year, date = today()) {
  const rows = [];
  const records = new Map(vehicle.records.filter((record) => record.insurance).map((record) => [periodKey(record), record]));
  const trashEntries = new Map((vehicle.trashedRecords ?? []).filter((entry) => entry.record.insurance).map((entry) => [periodKey(entry.record), entry]));
  for (const contract of vehicle.insurances ?? []) {
    for (let month = 1; month <= 12; month++) {
      const period = `${year}-${String(month).padStart(2, '0')}`, scheduled = dueDate(contract, period);
      const key = `${contract.id}:${period}`, record = records.get(key), trash = trashEntries.get(key);
      const skipped = contract.skippedPeriods?.includes(period);
      if (!scheduled && !record && !trash && !skipped) continue;
      const actual = record ?? trash?.record;
      rows.push({ contract, period, record, trash, date: actual ? actual.date : scheduled, amount: actual ? recordCost(actual).total : skipped ? null : premiumAt(contract, period),
        state: trash ? 'Corbeille' : skipped ? 'Exclu' : record && record.status !== 'planned' ? record.status === 'incomplete' ? 'À compléter' : 'Enregistré' : record && !scheduled ? 'Hors calendrier' : record && !record.date ? 'Date à renseigner' : (actual?.date ?? scheduled) <= date ? 'À enregistrer' : 'À venir' });
    }
  }
  return rows.sort((a, b) => a.period.localeCompare(b.period) || contractLabel(a.contract).localeCompare(contractLabel(b.contract)));
}

export function insuranceSummary(vehicle, year, date = today()) {
  const records = vehicle.records.filter((record) => record.type === 'insurance' && record.status !== 'planned' && record.date?.startsWith(String(year)));
  const years = new Set([Number(date.slice(0, 4)), Number(date.slice(0, 4)) + 1]);
  for (const contract of vehicle.insurances ?? []) {
    years.add(Number(contract.firstDate.slice(0, 4)));
    for (const period of contract.skippedPeriods ?? []) years.add(Number(period.slice(0, 4)) + 1);
  }
  for (const record of vehicle.records) if (record.insurance && record.status === 'planned') years.add(Number(record.insurance.period.slice(0, 4)));
  const upcoming = [...years].filter((year) => year >= 1900 && year <= 2199).flatMap((year) => insuranceRows(vehicle, String(year), date)).filter((row) => !row.trash && row.state !== 'Exclu' && row.state !== 'Hors calendrier' && row.date > date && (!row.record || row.record.status === 'planned')).sort((a, b) => a.date.localeCompare(b.date));
  return { amount: sumAmounts(records.map((record) => { const cost = recordCost(record); return cost.total ?? cost.subtotal; })), count: records.length, incomplete: records.some((record) => recordCost(record).incomplete), next: upcoming[0] ?? null };
}
