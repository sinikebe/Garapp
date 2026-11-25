/** Fuel costs follow purchase dates; consumption follows complete tank-to-tank cycles. */
import { today, recordCost } from './garage.js';
import { sumAmounts } from './amounts.js';
import { mileageHistory, statisticsRange } from './statistics.js';

const inRange = (date, range) => (!range.start || date >= range.start) && date <= range.end;
const sumKnown = (values) => values.some((value) => value !== null) ? sumAmounts(values) : null;
const ratio = (litres, distance) => distance > 0 ? Number(litres) / distance * 100 : null;
const fuelPrice = (purchases) => {
  const known = purchases.map((record) => ({ cost: recordCost(record).total, litres: record.fuel?.litres ?? null }))
    .filter(({ cost, litres }) => cost !== null && Number(cost) >= 0 && Number.isFinite(Number(cost)) && litres !== null && Number(litres) > 0 && Number.isFinite(Number(litres)));
  const litres = sumAmounts(known.map((entry) => entry.litres));
  return { value: known.length ? Number(sumAmounts(known.map((entry) => entry.cost))) / Number(litres) : null, excluded: purchases.length - known.length };
};
const day = (date) => Date.parse(`${date}T12:00:00Z`) / 86400000;
const byMonth = (items, date) => {
  const grouped = new Map();
  for (const item of items) { const key = date(item).slice(0, 7); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(item); }
  return grouped;
};

/** Largest active, dated fuel addition used as the tank capacity reference. */
export function largestRecordedRefuel(vehicle, date = today()) {
  return vehicle.records.reduce((largest, record) => {
    if (record.type !== 'fuel' || record.status === 'planned' || !record.date || record.date > date) return largest;
    const litres = record.fuel?.litres;
    return Number(litres) > Number(largest) && Number(litres) <= 10000 ? litres : largest;
  }, null);
}

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

const purchasePrice = (record) => {
  const cost = recordCost(record).total, litres = Number(record.fuel?.litres);
  const price = cost !== null && Number(cost) >= 0 && litres > 0 && Number.isFinite(litres) ? Number(cost) / litres : NaN;
  return Number.isFinite(price) ? price : null;
};

/** Rebuild the moving tank price from active history; never persist derived stock. */
function valueCycles(history, cycles, capacity, readings) {
  const byEnd = new Map(cycles.map((cycle) => [cycle.to.id, cycle]));
  let previousFull = null, tankPrice = null;
  for (let index = 0; index < history.length; index++) {
    const end = history[index];
    if (end.fuel?.fullTank !== true) continue;
    const endPrice = purchasePrice(end);
    if (previousFull === null) {
      // The existing fuel is initially valued at this first full tank's own price.
      tankPrice = endPrice;
      previousFull = index;
      continue;
    }
    const cycle = byEnd.get(end.id);
    let cost = 0, stock = capacity, price = tankPrice, valid = capacity > 0;
    if (!cycle || cycle.from.id !== history[previousFull].id) valid = false;
    if (valid) {
      const additions = history.slice(previousFull + 1, index + 1);
      let previous = cycle.from;
      for (const addition of additions) {
        // Partial fills need an observable or admissibly interpolated distance too.
        const segment = additions.length === 1 ? { distance: cycle.distance } : measureCycleDistance(previous, addition, readings);
        const consumed = segment.reason ? NaN : Number(cycle.litres) * segment.distance / cycle.distance;
        const added = Number(addition.fuel?.litres);
        const remaining = stock - consumed;
        const tolerance = Math.max(1, capacity) * 1e-9;
        if (!Number.isFinite(consumed) || consumed < 0 || remaining < -tolerance || !(added > 0) || remaining + added > capacity + tolerance) {
          valid = false; break;
        }
        // Unknown prices propagate until no fuel from the unknown stock remains.
        if (consumed > 0 && price === null) cost = null;
        else if (cost !== null) cost += consumed * (price ?? 0);
        const left = Math.max(0, remaining), boughtPrice = purchasePrice(addition);
        stock = left + added;
        price = left <= tolerance ? boughtPrice : price === null || boughtPrice === null ? null : (left * price + added * boughtPrice) / stock;
        previous = addition;
      }
    }
    if (cycle) {
      cycle.estimatedFuelCost = valid && Number.isFinite(cost) ? cost : null;
      const value = cycle.estimatedFuelCost === null ? NaN : cycle.estimatedFuelCost / cycle.distance;
      cycle.estimatedCostPerKm = Number.isFinite(value) ? value : null;
    }
    // A complete replacement can recover a known stock after a broken cycle.
    const emptied = capacity > 0 && Math.abs(Number(end.fuel?.litres) - capacity) <= Math.max(1, capacity) * 1e-9;
    tankPrice = valid && Number.isFinite(price) ? price : emptied ? endPrice : null;
    previousFull = index;
  }
}

function estimatedCostSummary(cycles) {
  const known = cycles.filter((cycle) => Number.isFinite(cycle.estimatedCostPerKm));
  const distance = known.reduce((sum, cycle) => sum + cycle.distance, 0);
  const value = distance > 0 ? known.reduce((sum, cycle) => sum + cycle.estimatedFuelCost, 0) / distance : NaN;
  return {
    estimatedCostPerKm: Number.isFinite(value) ? value : null,
    costedCycleDistance: distance, costedCycles: known.length, uncostedCycles: cycles.length - known.length,
  };
}

export function fuelStatistics(vehicle, { period = 'all', date = today() } = {}) {
  const range = statisticsRange(period, date);
  const actual = vehicle.records.filter((record) => record.type === 'fuel' && record.status !== 'planned');
  const undated = actual.filter((record) => !record.date).length;
  const future = actual.filter((record) => record.date > date).length;
  const history = actual.filter((record) => record.date && record.date <= date).sort((a, b) => a.date.localeCompare(b.date) || (a.odometer ?? Infinity) - (b.odometer ?? Infinity) || a.id.localeCompare(b.id));
  const theoreticalTankCapacity = vehicle.fuelTankCapacity ?? null;
  const effectiveTankCapacity = Math.max(Number(theoreticalTankCapacity), Number(largestRecordedRefuel(vehicle, date)));
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
  valueCycles(history, cycles, effectiveTankCapacity, readings);
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
    const price = fuelPrice(purchases);
    return {
      key, records: purchases, cycles: finished, intervals: distances,
      ...estimatedCostSummary(finished),
      estimatedCycles: finished.filter((cycle) => cycle.estimated).length,
      cost: sumKnown(costs.map((cost) => cost.total ?? cost.subtotal)), partialCost: costs.filter((cost) => cost.total === null).length,
      averagePricePerLitre: price.value, priceExcluded: price.excluded,
      litres: sumKnown(purchases.map((record) => record.fuel?.litres ?? null)), missingLitres: purchases.filter((record) => record.fuel?.litres == null).length,
      distance: known.length ? known.reduce((sum, interval) => sum + interval.distance, 0) : null,
      distanceIssues: distances.length - known.length,
      consumption: ratio(sumAmounts(finished.map((cycle) => cycle.litres)), cycleDistance),
    };
  });
  const costs = records.map(recordCost), knownDistances = intervals.filter((interval) => interval.distance !== null);
  const cycleDistance = selectedCycles.reduce((sum, cycle) => sum + cycle.distance, 0);
  const price = fuelPrice(records);
  return {
    range, records, buckets, cycles: selectedCycles, issues: issues.filter((issue) => inRange(issue.date, range)), undated, future,
    theoreticalTankCapacity, effectiveTankCapacity: effectiveTankCapacity || null,
    ...estimatedCostSummary(selectedCycles),
    estimatedCycles: selectedCycles.filter((cycle) => cycle.estimated).length,
    cost: sumKnown(costs.map((cost) => cost.total ?? cost.subtotal)), partialCost: costs.filter((cost) => cost.total === null).length,
    averagePricePerLitre: price.value, priceExcluded: price.excluded,
    distance: knownDistances.length ? knownDistances.reduce((sum, interval) => sum + interval.distance, 0) : null,
    distanceIssues: intervals.length - knownDistances.length,
    consumption: ratio(sumAmounts(selectedCycles.map((cycle) => cycle.litres)), cycleDistance), cycleDistance,
  };
}

