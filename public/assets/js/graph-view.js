import { graphData, graphLayout, graphExpenseCategories, GRAPH_MEASURES } from './graph-data.js';
import { expenseCategoriesMarkup } from './overview-view.js';
import { eventProfile } from './event-profiles.js';
import { escapeHtml as esc, formatDate, formatMileage, icon } from './ui-format.js';
import { recordCost } from './garage.js';
import { formatExactAmount } from './amounts.js';

const number = (value, digits = 2) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
const axisNumber = (value, digits) => {
  const absolute = Math.abs(value);
  if (absolute > 0 && absolute < .0001) return new Intl.NumberFormat('fr-FR', { notation: 'scientific', maximumFractionDigits: 2 }).format(value);
  return absolute >= 10000 ? new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : number(value, digits);
};
const labelDate = (point) => point.key?.length === 4 ? point.key : point.key ? new Date(`${point.key}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : formatDate(point.date);
const valueText = (point, lane) => {
  if (!point.values.length) return 'Inconnu';
  if (point.exact != null) return lane.key === 'spending' ? point.exact : point.exact.replace('.', ',') + ' ' + lane.unit;
  return point.values.map((value) => number(value, lane.key === 'costkm' ? 4 : lane.key === 'price' ? 3 : lane.unit === 'km' ? 0 : 2) + ' ' + lane.unit + (lane.key === 'costkm' ? ` (${number(value * 100)} €/100 km)` : '')).join(' / ');
};
const sourceButton = (record) => `<button type="button" class="text-button" data-record="${esc(record.id)}">${esc(record.title)}</button>`;
const groupedDates = (records) => {
  const groups = new Map();
  for (const record of records) { if (!groups.has(record.date)) groups.set(record.date, []); groups.get(record.date).push(record); }
  return [...groups];
};

function operationTitle(records) {
  return records.map((record) => `${record.title} · ${formatDate(record.date)} · ${formatMileage(record.odometer)}`).join('\n');
}

export function graphOperationMarkers(layout, mileage) {
  const groups = new Map();
  for (const record of layout.operations) {
    if (record.odometer === null) continue;
    const key = `${record.date}:${record.odometer}`;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(record);
  }
  return [...groups.values()].map((records) => {
    const record = records[0], x = layout.x(record.date), y = mileage.y(record.odometer);
    const kind = records.every((one) => one.type === record.type) ? eventProfile(record.type).kind : 'other';
    return `<g class="explorer-operation" data-event-kind="${kind}" data-explorer-date="${record.date}"${records.length === 1 ? ` data-record="${esc(record.id)}"` : ''}><title>${esc(operationTitle(records))}</title><path d="M${x} ${y - 6}l6 6-6 6-6-6Z"/>${records.length > 1 ? `<text class="explorer-marker-count" x="${x + 9}" y="${y + 4}">${records.length}</text>` : ''}</g>`;
  }).join('');
}

export function explorerSvg(layout) {
  if (!layout.lanes.length && !layout.operations.length) return '<div class="chart-empty"><p>Activez une mesure ou un type d’opération pour afficher le graphique.</p></div>';
  if (!layout.operations.length && !layout.columns.some((column) => column.value !== null) && !layout.lanes.some((lane) => lane.points.some((point) => point.values.length))) return '<div class="chart-empty"><p>Aucune valeur ni opération affichable sur cet intervalle.</p><p class="hint" data-help-keep>Élargissez la période ou ajoutez une fiche datée. Les valeurs manquantes restent inconnues.</p></div>';
  const columns = layout.columns.filter((column) => column.value !== null).map((column) => {
    const left = layout.x(column.start), right = layout.x(column.end), span = Math.max(2, right - left);
    const width = Math.max(1, span * .72), x = (left + right - width) / 2;
    const y = layout.distanceScale.y(column.value), bottom = layout.distanceScale.y(0);
    return `<rect class="explorer-distance-column${column.estimated || column.partial ? ' is-estimated' : ''}" data-explorer-date="${column.date}" data-distance-period="${column.key}" x="${x}" y="${y}" width="${width}" height="${Math.max(1, bottom - y)}"><title>${column.key} : ${column.estimated ? 'environ ' : ''}${number(column.value, 2)} km parcourus${column.partial ? ' · période partiellement observée' : ''}${column.issues ? ' · relevés à vérifier' : ''}</title></rect>`;
  }).join('');
  const labelStep = Math.max(1, Math.ceil(layout.columns.length / 6));
  const columnLabels = layout.columns.map((column, index) => {
    if (index !== layout.columns.length - 1 && (index % labelStep || layout.columns.length - 1 - index < labelStep)) return '';
    return `<text class="chart-axis-label explorer-period-label" x="${(layout.x(column.start) + layout.x(column.end)) / 2}" y="160" text-anchor="middle">${esc(labelDate(column))}</text>`;
  }).join('');
  const distanceAxis = layout.columns.length ? `<g class="explorer-distance-axis"><text class="explorer-lane-title" x="${layout.width - layout.right}" y="20" text-anchor="end">Parcourus · km</text>${layout.distanceScale.ticks.map((tick) => `<text class="chart-axis-label" x="${layout.width - layout.right + 10}" y="${tick.y + 4}">${axisNumber(tick.value, 1)}</text>`).join('')}${columnLabels}</g>` : '';
  const lanes = layout.lanes.map((lane) => {
    const known = lane.points.flatMap((point) => point.values);
    const ticks = known.length ? lane.ticks.map((tick) => `<path class="chart-gridline" d="M${layout.left} ${tick.y}H${layout.width - layout.right}"/><text class="chart-axis-label" x="${layout.left - 12}" y="${tick.y + 4}" text-anchor="end">${esc(axisNumber(tick.value, lane.key === 'costkm' ? 5 : lane.key === 'price' ? 3 : 2))}</text>`).join('') : '';
    const segments = lane.mode !== 'line' ? '' : lane.points.map((point, index) => {
      const previous = lane.points[index - 1];
      if (!index || point.values.length !== 1 || previous.values.length !== 1 || point.warning || previous.warning) return '';
      const warning = lane.key === 'mileage' && point.values[0] < previous.values[0];
      return `<path class="explorer-line${point.estimated || previous.estimated ? ' is-estimated' : ''}${warning ? ' is-warning' : ''}" d="M${layout.x(previous.date)} ${lane.y(previous.values[0])}L${layout.x(point.date)} ${lane.y(point.values[0])}"/>`;
    }).join('');
    const points = lane.points.map((point) => point.values.map((value) => {
      const x = layout.x(point.date), y = lane.y(value);
      const title = `${labelDate(point)} : ${point.estimated ? 'environ ' : ''}${valueText({ ...point, values: [value] }, lane)}${point.partial ? lane.key === 'distance' ? ' · période partiellement observée' : ' · sous-total connu' : ''}${point.warning ? ' · relevés à vérifier' : ''}${point.excluded ? ` · ${point.excluded} ${point.excludedLabel}` : ''}`;
      const shape = lane.mode === 'bars' && value !== 0 ? `<path class="explorer-bar${point.partial ? ' is-partial' : ''}" d="M${x} ${lane.y(0)}V${y}"/>` : '';
      return `<g data-explorer-date="${point.date}"><title>${esc(title)}</title>${shape}<circle class="explorer-point${point.estimated ? ' is-estimated' : ''}${point.warning ? ' is-warning' : ''}" cx="${x}" cy="${y}" r="3.5"/></g>`;
    }).join('')).join('');
    return `<g class="explorer-lane" data-series-key="${lane.key}"><text class="explorer-lane-title" x="${layout.left}" y="${lane.top - 12}">${esc(lane.label)} · ${esc(lane.unit)}</text>${ticks}${lane.key === 'mileage' ? columns + distanceAxis : ''}${segments}${points}${lane.key === 'mileage' ? graphOperationMarkers(layout, lane) : ''}${!known.length ? `<text class="chart-axis-label" x="${layout.left}" y="${lane.top + 55}">Aucune valeur calculable sur cet intervalle</text>` : ''}</g>`;
  }).join('');
  const events = groupedDates(layout.operations).map(([date, records]) => {
    const x = layout.x(date), y = layout.eventTop + 27;
    const kind = records.every((record) => record.type === records[0].type) ? eventProfile(records[0].type).kind : 'other';
    return `<g class="explorer-operation" data-event-kind="${kind}" data-explorer-date="${date}"${records.length === 1 ? ` data-record="${esc(records[0].id)}"` : ''}><title>${esc(operationTitle(records))}</title><circle cx="${x}" cy="${y}" r="${records.length > 1 ? 8 : 5}"/>${records.length > 1 ? `<text class="explorer-marker-count" x="${x}" y="${y + 4}" text-anchor="middle">${records.length}</text>` : ''}</g>`;
  }).join('');
  const labelDates = [...new Set([layout.first, layout.last])];
  return `<svg class="explorer-chart" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="explorer-svg-title explorer-svg-desc"><title id="explorer-svg-title">Mesures et opérations du véhicule dans le temps</title><desc id="explorer-svg-desc">Chaque piste conserve son unité et son échelle automatique. Le compteur et les kilomètres parcourus partagent la première piste : courbe et axe gauche pour le compteur, colonnes et axe droit pour la distance. Les distances par année ou par mois sont estimées au prorata du temps quand les relevés chevauchent les limites de période. Toutes les pistes partagent les mêmes dates réelles. Les losanges identifient les opérations avec un compteur connu ; le bandeau inférieur inclut aussi celles sans compteur. Les points orange pointillés signalent les estimations ou les relevés à vérifier. Les données inconnues interrompent les courbes. Le sélecteur sous le graphique donne accès aux valeurs exactes et aux fiches.</desc>${lanes}<text class="explorer-lane-title" x="${layout.left}" y="${layout.eventTop - 4}">Opérations · ${layout.operations.length}</text><path class="chart-gridline" d="M${layout.left} ${layout.eventTop + 27}H${layout.width - layout.right}"/>${events}<path class="chart-guide" data-explorer-guide d=""/>${labelDates.map((date, index) => `<text class="chart-axis-label" x="${layout.x(date)}" y="${layout.height - 12}" text-anchor="${labelDates.length === 1 ? 'middle' : index === 0 ? 'start' : 'end'}">${esc(formatDate(date))}</text>`).join('')}</svg>`;
}

export function explorerSelection(data, layout, date) {
  const facts = layout.lanes.flatMap((lane) => lane.points.filter((point) => point.date === date && point.values.length).map((point) => ({ lane, point })));
  for (const column of layout.columns.filter((one) => one.date === date)) facts.unshift({ lane: { key: 'distance', label: 'Kilomètres parcourus', unit: 'km' }, point: { ...column, values: column.value === null ? [] : [column.value], warning: column.issues > 0 } });
  const operations = layout.operations.filter((record) => record.date === date);
  const records = new Map(operations.map((record) => [record.id, record]));
  const sources = new Map(data.operations.map((record) => [record.id, record]));
  let vehicleSource = false;
  for (const { point } of facts) {
    for (const record of point.records ?? []) records.set(record.id, record);
    for (const reading of point.readings ?? []) {
      if (reading.source === 'vehicle') vehicleSource = true;
      else { const record = sources.get(reading.id); if (record) records.set(record.id, record); }
    }
  }
  return `<h3>${esc(formatDate(date))}</h3>${facts.length ? `<dl class="explorer-facts">${facts.map(({ lane, point }) => `<div><dt>${esc(lane.label)}${point.key ? ` · ${esc(labelDate(point))}` : ''}</dt><dd>${point.estimated ? '≈ ' : ''}${esc(valueText(point, lane))}${point.partial ? lane.key === 'distance' ? ' · période partiellement observée' : ' · sous-total connu' : ''}${point.warning ? ' · relevés à vérifier' : ''}${point.excluded ? ` · ${point.excluded} ${point.excludedLabel}` : ''}</dd></div>`).join('')}</dl>` : ''}${operations.length ? `<p>${operations.length} opération(s) à cette date</p>` : ''}<div class="stats-sources">${vehicleSource ? '<button type="button" class="text-button" data-action="edit-vehicle">Relevé de la fiche véhicule</button>' : ''}${[...records.values()].map((record) => `<div>${sourceButton(record)}<small>${esc(formatDate(record.date))} · ${esc(formatMileage(record.odometer))} · ${esc(formatExactAmount(recordCost(record).total))}</small></div>`).join('')}</div>`;
}

export function renderGraphExplorer(container, vehicle, options = {}, state = {}) {
  const data = graphData(vehicle, options);
  state.measures ??= GRAPH_MEASURES.map((measure) => measure.key); state.hiddenTypes ??= []; state.grouping ??= 'year';
  let layout = graphLayout(data, state);
  container.innerHTML = `<section class="panel stats-panel explorer-panel" aria-labelledby="explorer-title"><h2 id="explorer-title" class="sr-only">Explorer les mesures et les opérations</h2>
    <details class="explorer-options"><summary>Éléments affichés</summary><button type="button" class="ghost-button" data-explorer-all>Tout afficher</button>
    <fieldset class="explorer-legend"><legend>Mesures</legend>${GRAPH_MEASURES.map((measure) => `<button type="button" class="explorer-legend-item" data-graph-measure="${measure.key}" data-series-key="${measure.key}" aria-pressed="${state.measures.includes(measure.key)}"><span class="explorer-swatch" aria-hidden="true"></span>${esc(measure.label)} <small>${esc(measure.unit)}</small></button>`).join('')}</fieldset>
    <fieldset class="explorer-legend"><legend>Repères des opérations</legend>${data.types.map((type, index) => `<button type="button" class="explorer-legend-item" data-graph-type="${index}" data-event-kind="${eventProfile(type.key).kind}" aria-pressed="${!state.hiddenTypes.includes(type.key)}">${icon(eventProfile(type.key).icon)}${esc(type.label)} <small data-graph-type-count="${index}">${type.count}</small></button>`).join('') || '<p class="hint">Aucune opération datée dans la période choisie.</p>'}</fieldset>
    <p class="hint" data-help-keep>Mêmes dates, échelles indépendantes. Chaque piste s’ajuste aux valeurs affichées. Les types d’opérations filtrent les repères ; les mesures conservent leur historique de calcul. Dépenses : ${esc(data.scope)}. Les indicateurs mensuels sont placés en fin de mois. Les prévisions, dates futures, fiches sans date et corbeille sont exclues.</p></details>
    <div class="explorer-range"><label>Du<input type="date" data-explorer-from min="${data.start}" max="${data.end}" value="${layout.first}"></label><label>Au<input type="date" data-explorer-to min="${data.start}" max="${data.end}" value="${layout.last}"></label><button type="button" class="text-button" data-explorer-reset>Rétablir la période</button><label>Kilomètres parcourus<select data-explorer-grouping><option value="year"${state.grouping === 'year' ? ' selected' : ''}>Par an</option><option value="month"${state.grouping === 'month' ? ' selected' : ''}>Par mois</option></select></label></div><p class="hint">Courbe : compteur (axe gauche, km). Colonnes : kilomètres parcourus (axe droit, km), avec une échelle indépendante. Les intervalles qui chevauchent plusieurs périodes sont répartis au prorata du temps : ≈ indique cette estimation. Le pointillé signale une estimation ou une période incomplète.</p><p class="form-error" role="alert" data-explorer-error hidden></p>
    <div class="explorer-scroll" data-explorer-plot></div><div class="chart-selection explorer-selection"><label>Valeurs et opérations à consulter<select data-explorer-date-select aria-label="Date à consulter"></select></label><div data-explorer-detail aria-live="polite"></div></div><p class="hint" data-help-keep>Les opérations sans compteur sont dans le bandeau inférieur. Cliquez sur un repère pour consulter sa fiche ; les groupes chiffrés regroupent plusieurs opérations à la même date. Aucune distance n’est extrapolée avant le premier relevé ou après le dernier. Les périodes sans distance calculable restent inconnues.</p></section><section class="panel stats-panel"><h2>Répartition des dépenses par type</h2><div data-explorer-expenses></div><p class="hint" data-help-keep>Montants connus dans la période affichée, selon le périmètre choisi. Les remboursements gardent leur signe ; les barres se comparent en valeur absolue.</p></section>`;
  const plot = container.querySelector('[data-explorer-plot]'), select = container.querySelector('[data-explorer-date-select]');
  const showDate = (date) => {
    state.selectedDate = date; select.value = date;
    container.querySelector('[data-explorer-detail]').innerHTML = date ? explorerSelection(data, layout, date) : '<p class="hint">Aucune valeur ni opération sur cet intervalle.</p>';
    plot.querySelector('[data-explorer-guide]')?.setAttribute('d', date ? `M${layout.x(date)} 20V${layout.height - 42}` : '');
  };
  const draw = () => {
    layout = graphLayout(data, state); plot.innerHTML = explorerSvg(layout);
    container.querySelector('[data-explorer-expenses]').innerHTML = expenseCategoriesMarkup(graphExpenseCategories(data, layout.first, layout.last), true);
    select.innerHTML = layout.dates.map((date) => `<option value="${date}">${esc(formatDate(date))}</option>`).join(''); select.disabled = !layout.dates.length;
    showDate(layout.dates.includes(state.selectedDate) ? state.selectedDate : layout.dates.at(-1) ?? '');
    for (const button of container.querySelectorAll('[data-graph-measure]')) button.setAttribute('aria-pressed', String(state.measures.includes(button.dataset.graphMeasure)));
    for (const button of container.querySelectorAll('[data-graph-type]')) {
      const type = data.types[Number(button.dataset.graphType)];
      button.setAttribute('aria-pressed', String(!state.hiddenTypes.includes(type.key)));
      button.querySelector('small').textContent = data.operations.filter((record) => record.type === type.key && record.date >= layout.first && record.date <= layout.last).length;
    }
  };
  container.addEventListener('click', (event) => {
    const measure = event.target.closest('[data-graph-measure]'), type = event.target.closest('[data-graph-type]');
    if (measure) {
      const key = measure.dataset.graphMeasure;
      state.measures = state.measures.includes(key) ? state.measures.filter((one) => one !== key) : [...state.measures, key]; draw();
    } else if (type) {
      const key = data.types[Number(type.dataset.graphType)].key;
      state.hiddenTypes = state.hiddenTypes.includes(key) ? state.hiddenTypes.filter((one) => one !== key) : [...state.hiddenTypes, key]; draw();
    } else if (event.target.closest('[data-explorer-all]')) { state.measures = GRAPH_MEASURES.map((one) => one.key); state.hiddenTypes = []; draw(); }
    else if (event.target.closest('[data-explorer-reset]')) {
      state.from = ''; state.to = '';
      container.querySelector('[data-explorer-from]').value = data.start; container.querySelector('[data-explorer-to]').value = data.end;
      container.querySelector('[data-explorer-error]').hidden = true; draw();
    } else {
      const marker = event.target.closest('[data-explorer-date]');
      if (marker) return showDate(marker.dataset.explorerDate);
      const svg = event.target.closest('svg.explorer-chart'), matrix = svg?.getScreenCTM();
      if (!matrix || !layout.dates.length) return;
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const x = point.matrixTransform(matrix.inverse()).x;
      showDate(layout.dates.reduce((best, date) => Math.abs(layout.x(date) - x) < Math.abs(layout.x(best) - x) ? date : best));
    }
  });
  select.addEventListener('change', () => showDate(select.value));
  container.querySelector('[data-explorer-grouping]').addEventListener('change', (event) => { state.grouping = event.target.value === 'month' ? 'month' : 'year'; draw(); });
  for (const input of container.querySelectorAll('[data-explorer-from], [data-explorer-to]')) input.addEventListener('change', () => {
    const from = container.querySelector('[data-explorer-from]'), to = container.querySelector('[data-explorer-to]'), error = container.querySelector('[data-explorer-error]');
    if (!from.value || !to.value || !from.checkValidity() || !to.checkValidity() || from.value > to.value) {
      error.textContent = 'Choisissez un intervalle valide dans la période des statistiques, avec une date de début avant la date de fin.'; error.hidden = false; return;
    }
    error.hidden = true; state.from = from.value; state.to = to.value; draw();
  });
  draw();
}

const graphStates = new WeakMap();
export function renderGraphs(container, vehicle, options = {}) {
  let states = graphStates.get(container);
  if (!states) { states = new Map(); graphStates.set(container, states); }
  if (!states.has(vehicle.id)) states.set(vehicle.id, {});
  container.innerHTML = '<div data-graph-explorer></div>';
  renderGraphExplorer(container.querySelector('[data-graph-explorer]'), vehicle, options, states.get(vehicle.id));
}
