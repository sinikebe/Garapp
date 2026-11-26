import { componentLife, today } from './garage.js';
import { validateMaintenanceCheck } from './maintenance-schema.js';
import { mileageHistory } from './statistics.js';

const day = (date) => Date.parse(`${date}T12:00:00Z`);
const addDays = (date, days) => new Date(day(date) + days * 86400000).toISOString().slice(0, 10);
const addMonths = (date, months) => {
  const value = new Date(day(date)), originalDay = value.getUTCDate();
  value.setUTCDate(1); value.setUTCMonth(value.getUTCMonth() + months);
  const end = new Date(value); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  value.setUTCDate(Math.min(originalDay, end.getUTCDate()));
  return value.toISOString().slice(0, 10);
};
const actual = (record, date) => record.status === 'done' && record.date && record.date <= date;

export function checkLife(vehicle, check, date = today()) {
  const last = vehicle.records.filter((record) => record.type === 'controle' && record.maintenanceCheckId === check.id && actual(record, date))
    .toSorted((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))[0] ?? null;
  let dueDate = last ? check.intervalKm ? null : check.intervalMonths ? addMonths(last.date, check.intervalMonths) : addDays(last.date, check.intervalDays) : check.firstDate;
  const days = dueDate ? Math.round((day(dueDate) - day(date)) / 86400000) : null;
  const span = check.intervalMonths ? Math.round((day(addMonths(last?.date ?? check.firstDate, check.intervalMonths)) - day(last?.date ?? check.firstDate)) / 86400000) : check.intervalDays;
  const lead = Math.min(7, Math.max(1, Math.ceil(span / 4)));
  let status = days !== null ? days <= 0 ? 'due' : days <= lead ? 'soon' : 'ok' : 'unknown';
  let dueOdometer = null, km = null;
  if (last && check.intervalKm) {
    dueOdometer = last.odometer == null ? null : last.odometer + check.intervalKm;
    const readings = mileageHistory(vehicle, { date }).groups.filter((group) => group.date >= last.date);
    const latest = readings.at(-1);
    const coherent = dueOdometer !== null && latest && readings.every((group, index) => group.values.length === 1 && group.values[0] >= (index ? readings[index - 1].values[0] : last.odometer));
    if (coherent) {
      km = Math.max(0, dueOdometer - latest.values[0]);
      status = km === 0 ? 'due' : km <= check.intervalKm / 4 ? 'soon' : 'ok';
    }
  }
  if (check.enabled === false) status = 'paused';
  return { check, last, dueDate, days, dueOdometer, km, status };
}

/** Repères d'entretien, never a measurement of a component's physical condition. */
export function maintenanceSummary(vehicle, date = today()) {
  if (!vehicle) return { components: [], checks: [], alerts: [], unknown: 0 };
  const components = vehicle.components.map((part) => ({ part, life: componentLife(vehicle, part, date) }));
  const checks = (vehicle.maintenanceChecks ?? []).map((check) => checkLife(vehicle, check, date));
  const alerts = [
    ...components.filter(({ life }) => ['soon', 'due'].includes(life.status)).map(({ part, life }) => ({
      kind: 'component', id: part.id, name: part.name, status: life.status,
      token: JSON.stringify(['component', part.id, life.last.id, life.last.date, life.last.odometer, part.intervalKm, part.intervalMonths, life.status]),
    })),
    ...checks.filter((life) => ['soon', 'due', 'unknown'].includes(life.status)).map((life) => ({
      kind: 'check', id: life.check.id, name: life.check.name, status: life.status,
      token: life.check.intervalKm ? JSON.stringify(['check-km', life.check.id, life.dueOdometer, life.last?.id, life.status]) : JSON.stringify(['check', life.check.id, life.dueDate, life.status]),
    })),
  ].sort((a, b) => Number(b.status === 'due') - Number(a.status === 'due') || a.name.localeCompare(b.name, 'fr'));
  return { components, checks, alerts, unknown: components.filter(({ life }) => life.status === 'unknown').length };
}

export function saveMaintenanceCheck(garage, vehicleId, values, checkId) {
  const next = structuredClone(garage), vehicle = next.vehicles.find((one) => one.id === vehicleId);
  if (!vehicle) throw Error('Le véhicule a changé. Rouvrez les alertes.');
  const checks = vehicle.maintenanceChecks ??= [];
  const index = checks.findIndex((one) => one.id === checkId);
  if (index < 0 && values.id !== checkId) throw Error('Le contrôle a changé. Rouvrez sa fiche.');
  const check = validateMaintenanceCheck({ ...(checks[index] ?? {}), ...values, id: checkId });
  if (index < 0) checks.push(check); else checks[index] = check;
  return next;
}

export function completeMaintenanceCheck(garage, vehicleId, checkId, { id, date, odometer = null, notes = '' }, asOf = today()) {
  const next = structuredClone(garage), vehicle = next.vehicles.find((one) => one.id === vehicleId);
  const check = vehicle?.maintenanceChecks?.find((one) => one.id === checkId);
  if (!check || check.enabled === false) throw Error('Ce contrôle a changé ou est en pause. Rouvrez les alertes.');
  if (check.intervalKm && (!Number.isInteger(odometer) || odometer < 0 || odometer > 5000000)) throw Error('Renseignez le compteur observé pour ce contrôle suivi en kilomètres.');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day(date)) || new Date(day(date)).toISOString().slice(0, 10) !== date || date > asOf) throw Error('Choisissez une date de contrôle valide, au plus tard aujourd’hui.');
  if (vehicle.records.some((record) => record.id === id)) throw Error('Ce contrôle est déjà enregistré.');
  vehicle.records.push({ id, title: `Contrôle · ${check.name}`, type: 'controle', status: 'done', date, odometer,
    maintenanceCheckId: check.id, notes, componentIds: [], lines: [], totalAmount: null });
  return next;
}
