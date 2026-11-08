/** Fuel costs follow purchase dates; consumption follows complete tank-to-tank cycles. */
import { today, recordCost } from './garage.js';
import { sumAmounts } from './amounts.js';
import { mileageHistory, statisticsRange } from './statistics.js';

const inRange = (date, range) => (!range.start || date >= range.start) && date <= range.end;
const sumKnown = (values) => values.some((value) => value !== null) ? sumAmounts(values) : null;
const ratio = (litres, distance) => distance > 0 ? Number(litres) / distance * 100 : null;
const byMonth = (items, date) => {
  const grouped = new Map();
  for (const item of items) { const key = date(item).slice(0, 7); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(item); }
  return grouped;
};

export function fuelStatistics(vehicle, { period = 'all', date = today() } = {}) {
  const range = statisticsRange(period, date);
  const actual = vehicle.records.filter((record) => record.type === 'fuel' && record.status !== 'planned');
  const undated = actual.filter((record) => !record.date).length;
  const future = actual.filter((record) => record.date > date).length;
  const history = actual.filter((record) => record.date && record.date <= date).sort((a, b) => a.date.localeCompare(b.date) || (a.odometer ?? Infinity) - (b.odometer ?? Infinity) || a.id.localeCompare(b.id));
  const records = history.filter((record) => inRange(record.date, range));
  const cycles = [], issues = [];
  const uncertainDays = new Set(history.filter((record) => record.odometer == null).map((record) => record.date));
  const duplicates = new Map();
  for (const record of history) {
    const key = `${record.date}/${record.odometer}`;
    duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
  }
  let anchor = null, previous = null, litres = '0', complete = true;
  for (const record of history) {
    const ambiguous = uncertainDays.has(record.date) || duplicates.get(`${record.date}/${record.odometer}`) > 1;
    if (ambiguous) {
      issues.push({ id: record.id, date: record.date, reason: record.odometer == null ? 'missingOdometer' : 'ambiguous' });
      anchor = previous = null; litres = '0'; complete = true;
      continue;
    }
    if (previous && record.odometer < previous.odometer) {
      issues.push({ id: record.id, date: record.date, reason: 'decrease' });
      anchor = null; litres = '0'; complete = true;
    }
    if (anchor) {
      if (record.fuel?.litres == null) complete = false;
      else litres = sumAmounts([litres, record.fuel.litres]);
    }
    if (record.fuel?.fullTank === true) {
      if (anchor && record.odometer === anchor.odometer) issues.push({ id: record.id, date: record.date, reason: 'zeroDistance' });
      if (anchor && complete && !undated && record.odometer > anchor.odometer) {
        const distance = record.odometer - anchor.odometer;
        cycles.push({ from: anchor, to: record, litres, distance, consumption: ratio(litres, distance) });
      }
      anchor = record; litres = '0'; complete = true;
    }
    previous = record;
  }
  const selectedCycles = cycles.filter((cycle) => inRange(cycle.to.date, range));
  const readings = mileageHistory(vehicle, { date }).groups;
  const intervals = [];
  for (let i = 1; i < readings.length; i++) {
    const from = readings[i - 1], to = readings[i];
    if (!inRange(from.date, range) || !inRange(to.date, range)) continue;
    const valid = from.values.length === 1 && to.values.length === 1 && to.values[0] >= from.values[0];
    intervals.push({ from: from.date, to: to.date, distance: valid ? to.values[0] - from.values[0] : null });
  }
  const dates = [...records.map((record) => record.date), ...intervals.map((interval) => interval.to)].sort();
  const months = [];
  if (dates.length) {
    let cursor = (range.start ?? dates[0]).slice(0, 7);
    const end = (range.period === 'all' ? dates.at(-1) : range.end).slice(0, 7);
    while (cursor <= end) {
      months.push(cursor);
      const year = Number(cursor.slice(0, 4)), month = Number(cursor.slice(5));
      cursor = `${String(month === 12 ? year + 1 : year).padStart(4, '0')}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
    }
  }
  const purchasesByMonth = byMonth(records, (record) => record.date), cyclesByMonth = byMonth(selectedCycles, (cycle) => cycle.to.date), distancesByMonth = byMonth(intervals, (interval) => interval.to);
  const buckets = months.map((key) => {
    const purchases = purchasesByMonth.get(key) ?? [];
    const finished = cyclesByMonth.get(key) ?? [];
    const distances = distancesByMonth.get(key) ?? [];
    const costs = purchases.map(recordCost), known = distances.filter((interval) => interval.distance !== null);
    const cycleDistance = finished.reduce((sum, cycle) => sum + cycle.distance, 0);
    return {
      key, records: purchases, cycles: finished, intervals: distances,
      cost: sumKnown(costs.map((cost) => cost.total ?? cost.subtotal)), partialCost: costs.filter((cost) => cost.total === null).length,
      litres: sumKnown(purchases.map((record) => record.fuel?.litres ?? null)), missingLitres: purchases.filter((record) => record.fuel?.litres == null).length,
      distance: known.length ? known.reduce((sum, interval) => sum + interval.distance, 0) : null,
      distanceIssues: distances.length - known.length,
      consumption: ratio(sumAmounts(finished.map((cycle) => cycle.litres)), cycleDistance),
    };
  });
  const costs = records.map(recordCost), knownDistances = intervals.filter((interval) => interval.distance !== null);
  const cycleDistance = selectedCycles.reduce((sum, cycle) => sum + cycle.distance, 0);
  return {
    range, records, buckets, cycles: selectedCycles, issues: issues.filter((issue) => inRange(issue.date, range)), undated, future,
    cost: sumKnown(costs.map((cost) => cost.total ?? cost.subtotal)), partialCost: costs.filter((cost) => cost.total === null).length,
    distance: knownDistances.length ? knownDistances.reduce((sum, interval) => sum + interval.distance, 0) : null,
    distanceIssues: intervals.length - knownDistances.length,
    consumption: ratio(sumAmounts(selectedCycles.map((cycle) => cycle.litres)), cycleDistance), cycleDistance,
  };
}
