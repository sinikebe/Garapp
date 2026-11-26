/** Read-only chart data. Each measure keeps its own unit and historical rules. */
import { today, typeLabel } from './garage.js';
import { mileageHistory, spendingHistory, statisticsRange, chartScale } from './statistics.js';
import { fuelStatistics } from './fuel-statistics.js';
import { sumAmounts, formatExactAmount } from './amounts.js';

export const GRAPH_MEASURES = Object.freeze([
  { key: 'mileage', label: 'Compteur', unit: 'km', mode: 'line' },
  { key: 'spending', label: 'Dépenses mensuelles', unit: '€', mode: 'bars' },
  { key: 'distance', label: 'Kilomètres parcourus', unit: 'km', mode: 'bars' },
  { key: 'litres', label: 'Carburant ajouté', unit: 'L', mode: 'bars' },
  { key: 'consumption', label: 'Consommation', unit: 'L/100 km', mode: 'line' },
  { key: 'price', label: 'Prix d’achat du carburant', unit: '€/L', mode: 'line' },
  { key: 'costkm', label: 'Coût carburant estimé', unit: '€/km', mode: 'line', estimated: true },
]);

export const graphDay = (date) => Date.parse(`${date}T12:00:00Z`) / 86400000;
const validDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(graphDay(date)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
export const graphPointDate = (key, end) => {
  const last = new Date(`${key}-01T12:00:00Z`); last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const date = last.toISOString().slice(0, 10); return date > end ? end : date;
};
const valuesOf = (value) => Number.isFinite(value) ? [value] : [];
const distancePoint = (column) => ({ ...column, values: valuesOf(column.value), warning: column.issues > 0 });

export function graphOperations(vehicle, options = {}) {
  const range = statisticsRange(options.period, options.date ?? today());
  return vehicle.records.filter((record) => record.status !== 'planned' && record.date
    && record.date <= range.end && (!range.start || record.date >= range.start))
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function graphData(vehicle, options = {}) {
  const date = options.date ?? today(), range = statisticsRange(options.period, date);
  const operations = graphOperations(vehicle, { ...options, date });
  const mileage = mileageHistory(vehicle, { ...options, date });
  const spending = spendingHistory(vehicle, { ...options, date });
  const fuel = fuelStatistics(vehicle, { ...options, date });
  const candidates = [...operations.map((record) => record.date), ...mileage.groups.map((group) => group.date)];
  const start = range.start ?? candidates.toSorted()[0] ?? date;
  const end = range.start ? date : candidates.toSorted().at(-1) ?? date;
  const months = [];
  if (candidates.length) {
    let cursor = start.slice(0, 7);
    while (cursor <= end.slice(0, 7)) {
      months.push(cursor);
      const next = new Date(`${cursor}-01T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
      cursor = next.toISOString().slice(0, 7);
    }
  }
  const purchases = new Map(fuel.buckets.map((bucket) => [bucket.key, bucket]));
  const costs = new Map();
  for (const entry of spending.records) {
    const key = entry.record.date.slice(0, 7);
    if (!costs.has(key)) costs.set(key, []);
    costs.get(key).push(entry);
  }
  const series = Object.fromEntries(GRAPH_MEASURES.map((measure) => [measure.key, { ...measure, points: [] }]));
  series.mileage.points = mileage.groups.map((group) => ({
    date: group.date, values: group.values, readings: group.readings, label: group.date,
    warning: group.values.length !== 1,
  }));
  series.litres.points = operations.filter((record) => record.type === 'fuel').map((record) => ({
    date: record.date, values: valuesOf(record.fuel?.litres == null ? null : Number(record.fuel.litres)),
    records: [record], label: record.title, exact: record.fuel?.litres ?? null,
  }));
  for (const key of months) {
    const bucket = purchases.get(key), entries = costs.get(key) ?? [];
    const known = entries.filter((entry) => entry.amount !== null);
    const total = known.length ? sumAmounts(known.map((entry) => entry.amount)) : null;
    const point = { date: graphPointDate(key, date), key, label: key };
    series.spending.points.push({ ...point, values: valuesOf(total === null ? null : Number(total)),
      exact: total === null ? null : formatExactAmount(total), records: entries.map((entry) => entry.record),
      partial: entries.some((entry) => entry.partial),
    });
    for (const [name, field, estimated] of [
      ['consumption', 'consumption', !!bucket?.estimatedCycles],
      ['price', 'averagePricePerLitre', false], ['costkm', 'estimatedCostPerKm', true],
    ]) series[name].points.push({ ...point, values: valuesOf(bucket?.[field]), estimated,
      records: name === 'costkm' || name === 'consumption' ? bucket?.cycles.flatMap((cycle) => [cycle.from, cycle.to]) ?? [] : bucket?.records ?? [],
      excluded: name === 'costkm' ? bucket?.uncostedCycles ?? 0 : name === 'price' ? bucket?.priceExcluded ?? 0 : 0,
      excludedLabel: name === 'costkm' ? 'cycle(s) sans coût estimable' : 'achat(s) sans prix calculable',
    });
  }
  const typeCounts = new Map();
  for (const record of operations) typeCounts.set(record.type, (typeCounts.get(record.type) ?? 0) + 1);
  const result = { range, start, end: months.length ? graphPointDate(months.at(-1), date) : end, series, operations,
    distanceReadings: mileageHistory(vehicle, { date }).groups,
    expenses: spending.records,
    types: [...typeCounts].map(([key, count]) => ({ key, label: typeLabel(key), count })),
    omitted: vehicle.records.length - operations.length,
    scope: options.scope === 'all' ? 'Tous les événements' : 'Interventions',
  };
  result.series.distance.points = distanceColumns(result).map(distancePoint);
  return result;
}

/** Calendar distances split observed intervals at boundaries, without extrapolating outside readings. */
export function distanceColumns(data, grouping = 'year', first = data.start, last = data.end) {
  const monthly = grouping === 'month', groups = data.distanceReadings;
  const periodIndex = (date) => Number(date.slice(0, 4)) * (monthly ? 12 : 1) + (monthly ? Number(date.slice(5, 7)) - 1 : 0);
  const columns = [];
  for (let index = periodIndex(first); index <= periodIndex(last); index++) {
    const year = monthly ? Math.floor(index / 12) : index, month = monthly ? index % 12 : 0;
    const key = String(year).padStart(4, '0') + (monthly ? '-' + String(month + 1).padStart(2, '0') : '');
    const periodStart = key + (monthly ? '-01' : '-01-01');
    const next = new Date(`${periodStart}T12:00:00Z`);
    if (monthly) next.setUTCMonth(next.getUTCMonth() + 1); else next.setUTCFullYear(next.getUTCFullYear() + 1);
    const periodEnd = next.getUTCFullYear() > 9999 ? '9999-12-31' : next.toISOString().slice(0, 10);
    const start = periodStart < first ? first : periodStart, end = periodEnd > last ? last : periodEnd;
    if (end <= start) continue;
    let value = 0, observed = 0, known = 0, issues = 0, estimated = false;
    const readings = new Map();
    for (let n = 1; n < groups.length; n++) {
      const from = groups[n - 1], to = groups[n];
      const left = from.date > start ? from.date : start, right = to.date < end ? to.date : end;
      if (right <= left) continue;
      for (const reading of [...from.readings, ...to.readings]) readings.set(`${reading.source}:${reading.id}`, reading);
      if (from.values.length !== 1 || to.values.length !== 1 || to.values[0] < from.values[0]) { issues++; continue; }
      const days = graphDay(right) - graphDay(left), duration = graphDay(to.date) - graphDay(from.date);
      value += (to.values[0] - from.values[0]) * days / duration; observed += days; known++;
      estimated ||= left !== from.date || right !== to.date;
    }
    if (known || issues) columns.push({ key, start, end, date: end, value: known ? value : null, estimated, issues,
      partial: start !== periodStart || end !== periodEnd || observed < graphDay(end) - graphDay(start),
      readings: [...readings.values()],
    });
  }
  return columns;
}

export function graphExpenseCategories(data, first, last) {
  const groups = new Map();
  for (const entry of data.expenses) {
    if (entry.record.date < first || entry.record.date > last || entry.amount === null) continue;
    const type = entry.record.type;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(entry.amount);
  }
  return [...groups].map(([type, values]) => ({ type, amount: sumAmounts(values) }));
}

export function graphLayout(data, { measures = GRAPH_MEASURES.map((measure) => measure.key), hiddenTypes = [], from = '', to = '', grouping = 'year' } = {}) {
  const first = validDate(from) && from >= data.start && from <= data.end ? from : data.start;
  const last = validDate(to) && to >= first && to <= data.end ? to : data.end;
  const inside = (point) => point.date >= first && point.date <= last;
  const operations = data.operations.filter((record) => !hiddenTypes.includes(record.type) && inside(record));
  const distance = measures.includes('distance') ? distanceColumns(data, grouping, first, last) : [];
  const columns = measures.includes('mileage') ? distance : [];
  const selected = GRAPH_MEASURES.filter((measure) => measures.includes(measure.key) && !(measure.key === 'distance' && measures.includes('mileage')));
  const left = 94, right = 90, width = 860, laneHeight = 160;
  const duration = graphDay(last) - graphDay(first);
  const x = (date) => duration ? left + (graphDay(date) - graphDay(first)) / duration * (width - left - right) : (left + width - right) / 2;
  const lanes = selected.map((measure, index) => {
    const points = measure.key === 'distance' ? distance.map(distancePoint) : data.series[measure.key].points.filter(inside);
    const top = 32 + index * laneHeight, bottom = top + 108;
    const scale = chartScale(points.flatMap((point) => point.values), { height: bottom, top, bottom: 0 },
      { nonnegative: measure.key !== 'spending', includeZero: measure.mode === 'bars' });
    return { ...measure, points, top, bottom, ...scale };
  });
  const eventTop = 32 + lanes.length * laneHeight;
  const distanceScale = chartScale(columns.filter((column) => column.value !== null).map((column) => column.value), { height: 140, top: 32, bottom: 0 }, { nonnegative: true, includeZero: true });
  return { first, last, left, right, width, x, lanes, operations, eventTop, height: eventTop + 94, columns, distanceScale, grouping,
    dates: [...new Set([...operations.map((record) => record.date), ...columns.map((column) => column.date), ...lanes.flatMap((lane) => lane.points.filter((point) => point.values.length).map((point) => point.date))])].toSorted(),
  };
}
