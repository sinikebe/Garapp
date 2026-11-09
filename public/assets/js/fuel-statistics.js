/** Fuel costs follow purchase dates; consumption follows complete tank-to-tank cycles. */
import { today, recordCost } from './garage.js';
import { sumAmounts } from './amounts.js';
import { mileageHistory, statisticsRange } from './statistics.js';

const inRange = (date, range) => (!range.start || date >= range.start) && date <= range.end;
const sumKnown = (values) => values.some((value) => value !== null) ? sumAmounts(values) : null;
const ratio = (litres, distance) => distance > 0 ? Number(litres) / distance * 100 : null;
const day = (date) => Date.parse(`${date}T12:00:00Z`) / 86400000;
const byMonth = (items, date) => {
  const grouped = new Map();
  for (const item of items) { const key = date(item).slice(0, 7); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(item); }
  return grouped;
};

/** An undated or contradictory observation cannot support an estimated counter. */
function counterAt(record, groups) {
  if (record.odometer !== null) return { value: record.odometer, estimated: false, first: record.date, last: record.date };
  let before = null, after = null;
  for (const group of groups) {
    if (group.date <= record.date) before = group;
    if (group.date >= record.date) { after = group; break; }
  }
  if (!before || !after) return { reason: 'missingOdometer' };
  if (before.values.length !== 1 || after.values.length !== 1 || after.values[0] < before.values[0]) return { reason: 'ambiguous' };
  const elapsed = day(after.date) - day(before.date);
  const portion = elapsed ? (day(record.date) - day(before.date)) / elapsed : 0;
  return {
    value: before.values[0] + (after.values[0] - before.values[0]) * portion,
    estimated: true, first: before.date, last: after.date,
  };
}

function measureCycleDistance(from, to, groups) {
  const start = counterAt(from, groups), end = counterAt(to, groups);
  if (start.reason || end.reason) return { reason: start.reason ?? end.reason };
  const estimated = start.estimated || end.estimated;
  if (estimated) {
    // Every observation used between the outermost interpolation bounds must agree.
    const first = start.first < end.first ? start.first : end.first;
    const last = start.last > end.last ? start.last : end.last;
    const span = groups.filter((group) => group.date >= first && group.date <= last);
    if (span.some((group, index) => group.values.length !== 1 || index > 0 && group.values[0] < span[index - 1].values[0])) return { reason: 'ambiguous' };
  }
  const distance = end.value - start.value;
  if (distance <= 0) return { reason: distance === 0 ? 'zeroDistance' : 'decrease' };
  return { distance, estimated };
}

export function fuelStatistics(vehicle, { period = 'all', date = today() } = {}) {
  const range = statisticsRange(period, date);
  const actual = vehicle.records.filter((record) => record.type === 'fuel' && record.status !== 'planned');
  const undated = actual.filter((record) => !record.date).length;
  const future = actual.filter((record) => record.date > date).length;
  const history = actual.filter((record) => record.date && record.date <= date).sort((a, b) => a.date.localeCompare(b.date) || (a.odometer ?? Infinity) - (b.odometer ?? Infinity) || a.id.localeCompare(b.id));
  const records = history.filter((record) => inRange(record.date, range));
  const cycles = [], issues = [];
  const readings = mileageHistory(vehicle, { date }).groups;
  const daily = new Map();
  for (const record of history) {
    if (!daily.has(record.date)) daily.set(record.date, []);
    daily.get(record.date).push(record);
  }
  const ambiguousDays = new Set([...daily].filter(([, entries]) => {
    const seen = new Set();
    const duplicate = entries.some((entry) => {
      if (entry.odometer === null) return false;
      if (seen.has(entry.odometer)) return true;
      seen.add(entry.odometer); return false;
    });
    return duplicate || entries.length > 1 && entries.some((entry) => entry.fuel?.fullTank === true) && entries.some((entry) => entry.odometer === null);
  }).map(([entryDate]) => entryDate));
  let anchor = null, previousKnown = null, litres = '0', complete = true;
  for (const record of history) {
    if (ambiguousDays.has(record.date)) {
      issues.push({ id: record.id, date: record.date, reason: 'ambiguous' });
      anchor = previousKnown = null; litres = '0'; complete = true;
      continue;
    }
    if (record.odometer !== null && previousKnown !== null && record.odometer < previousKnown) {
      issues.push({ id: record.id, date: record.date, reason: 'decrease' });
      anchor = null; litres = '0'; complete = true;
    }
    if (record.odometer !== null) previousKnown = record.odometer;
    if (anchor) {
      if (record.fuel?.litres == null) complete = false;
      else litres = sumAmounts([litres, record.fuel.litres]);
    }
    if (record.fuel?.fullTank === true) {
      if (anchor && complete && !undated) {
        const result = measureCycleDistance(anchor, record, readings);
        if (result.reason) issues.push({ id: record.id, date: record.date, reason: result.reason });
        else cycles.push({ from: anchor, to: record, litres, distance: result.distance, consumption: ratio(litres, result.distance), estimated: result.estimated });
      }
      anchor = record; litres = '0'; complete = true;
    }
  }
  const selectedCycles = cycles.filter((cycle) => inRange(cycle.to.date, range));
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
      estimatedCycles: finished.filter((cycle) => cycle.estimated).length,
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
    estimatedCycles: selectedCycles.filter((cycle) => cycle.estimated).length,
    cost: sumKnown(costs.map((cost) => cost.total ?? cost.subtotal)), partialCost: costs.filter((cost) => cost.total === null).length,
    distance: knownDistances.length ? knownDistances.reduce((sum, interval) => sum + interval.distance, 0) : null,
    distanceIssues: intervals.length - knownDistances.length,
    consumption: ratio(sumAmounts(selectedCycles.map((cycle) => cycle.litres)), cycleDistance), cycleDistance,
  };
}

