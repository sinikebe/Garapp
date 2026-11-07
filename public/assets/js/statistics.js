/** Read-only statistics from dated, recorded facts. Missing values stay unknown. */
import { isMaintenanceRecord, recordCost, today } from './garage.js';
import { sumAmounts } from './amounts.js';

const day = (date) => Date.parse(`${date}T12:00:00Z`) / 86400000;
export const STAT_PERIODS = Object.freeze(['all', '12m', '36m']);

export function statisticsRange(period = 'all', date = today()) {
  period = STAT_PERIODS.includes(period) ? period : 'all';
  const start = new Date(`${date}T12:00:00Z`);
  start.setUTCDate(1);
  if (period !== 'all') start.setUTCMonth(start.getUTCMonth() - (period === '12m' ? 11 : 35));
  return { period, start: period === 'all' ? null : start.toISOString().slice(0, 10), end: date };
}

export function mileageHistory(vehicle, { period = 'all', date = today() } = {}) {
  const range = statisticsRange(period, date);
  const readings = [], omitted = { planned: 0, missingDate: 0, missingOdometer: 0, future: 0, outsidePeriod: 0 };
  const candidates = [
    { id: 'vehicle', source: 'vehicle', title: 'Relevé de la fiche véhicule', date: vehicle.odometerDate, odometer: vehicle.odometer },
    ...vehicle.records.map((record) => ({ id: record.id, source: 'record', title: record.title, date: record.date, odometer: record.odometer, status: record.status })),
  ];
  for (const reading of candidates) {
    if (reading.status === 'planned') { omitted.planned++; continue; }
    if (!reading.date) omitted.missingDate++;
    if (reading.odometer == null) omitted.missingOdometer++;
    if (!reading.date || reading.odometer == null) continue;
    if (reading.date > range.end) { omitted.future++; continue; }
    if (range.start && reading.date < range.start) { omitted.outsidePeriod++; continue; }
    readings.push(reading);
  }
  readings.sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  const byDate = new Map();
  for (const reading of readings) {
    if (!byDate.has(reading.date)) byDate.set(reading.date, []);
    byDate.get(reading.date).push(reading);
  }
  const groups = [...byDate].map(([date, sources]) => ({ date, readings: sources, values: [...new Set(sources.map((reading) => reading.odometer))] }));
  const conflicts = groups.filter((group) => group.values.length > 1);
  const decreases = [];
  for (let i = 1; i < groups.length; i++) {
    if (Math.min(...groups[i].values) < Math.max(...groups[i - 1].values)) decreases.push({ from: i - 1, to: i });
  }
  const first = groups[0] ?? null, last = groups.at(-1) ?? null;
  const days = groups.length > 1 ? day(last.date) - day(first.date) : 0;
  const reliable = groups.length > 1 && !conflicts.length && !decreases.length;
  const distance = reliable ? last.values[0] - first.values[0] : null;
  return {
    range, readings, groups, omitted, conflicts, decreases, first, last, days, distance,
    annualized: reliable && days >= 30 ? distance * 365.2425 / days : null,
  };
}

export function spendingHistory(vehicle, { period = 'all', scope = 'maintenance', date = today() } = {}) {
  const range = statisticsRange(period, date);
  const omitted = { undated: 0, future: 0, planned: 0, outsidePeriod: 0 };
  const records = [];
  for (const record of vehicle.records) {
    if (record.status === 'planned') { omitted.planned++; continue; }
    if (scope !== 'all' && !isMaintenanceRecord(record)) continue;
    if (!record.date) { omitted.undated++; continue; }
    if (record.date > range.end) { omitted.future++; continue; }
    if (range.start && record.date < range.start) { omitted.outsidePeriod++; continue; }
    const cost = recordCost(record);
    records.push({ record, amount: cost.total ?? cost.subtotal, partial: cost.total === null });
  }
  records.sort((a, b) => a.record.date.localeCompare(b.record.date) || a.record.id.localeCompare(b.record.id));
  const start = range.start ?? records[0]?.record.date;
  const end = range.period === 'all' ? records.at(-1)?.record.date : range.end;
  const months = start && end ? (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1 : 0;
  const unit = months > 24 ? 'year' : 'month';
  const grouped = new Map();
  if (records.length) {
    let cursor = start.slice(0, unit === 'year' ? 4 : 7);
    const final = end.slice(0, unit === 'year' ? 4 : 7);
    while (cursor <= final) {
      grouped.set(cursor, []);
      if (unit === 'year') cursor = String(Number(cursor) + 1).padStart(4, '0');
      else {
        const year = Number(cursor.slice(0, 4)), month = Number(cursor.slice(5, 7));
        cursor = `${String(month === 12 ? year + 1 : year).padStart(4, '0')}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
      }
    }
    for (const entry of records) grouped.get(entry.record.date.slice(0, unit === 'year' ? 4 : 7)).push(entry);
  }
  const buckets = [...grouped].map(([key, entries]) => {
    const known = entries.map((entry) => entry.amount).filter((amount) => amount !== null);
    return { key, records: entries.map((entry) => entry.record), amount: known.length ? sumAmounts(known) : null, partial: entries.filter((entry) => entry.partial).length };
  });
  const known = records.map((entry) => entry.amount).filter((amount) => amount !== null);
  return { range, unit, records, buckets, omitted, amount: known.length ? sumAmounts(known) : null, partial: records.filter((entry) => entry.partial).length };
}

/** Continuous date axis: irregularly spaced observations retain their spacing. */
export function mileageGeometry(history) {
  const frame = { width: 720, height: 260, left: 76, right: 20, top: 22, bottom: 48 };
  const values = history.groups.flatMap((group) => group.values);
  const scale = chartScale(values, frame, { nonnegative: true });
  const start = history.first ? day(history.first.date) : 0, span = history.days;
  const points = history.groups.map((group, index) => ({
    index, x: span ? frame.left + (day(group.date) - start) / span * (frame.width - frame.left - frame.right) : (frame.left + frame.width - frame.right) / 2,
    ys: group.values.map(scale.y),
  }));
  return { ...frame, ...scale, points };
}

export function chartScale(values, frame, { nonnegative = false, includeZero = false } = {}) {
  let min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 1;
  if (includeZero) { min = Math.min(0, min); max = Math.max(0, max); }
  if (max === min) { min -= Math.max(1, Math.abs(min) * .05); max += Math.max(1, Math.abs(max) * .05); }
  if (nonnegative) min = Math.max(0, min);
  const rough = (max - min) / 4, power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find((value) => value * power >= rough) * power;
  min = Math.floor(min / step) * step; max = Math.ceil(max / step) * step;
  const y = (value) => frame.height - frame.bottom - (value - min) / (max - min) * (frame.height - frame.top - frame.bottom);
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => ({ value: min + i * step, y: y(min + i * step) }));
  return { min, max, y, ticks };
}
