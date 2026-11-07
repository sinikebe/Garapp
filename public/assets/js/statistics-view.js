import { today } from './garage.js';
import { formatAmount, formatExactAmount } from './amounts.js';
import { mileageHistory, spendingHistory, mileageGeometry, chartScale } from './statistics.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const number = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
const compact = (value) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const dateText = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
const bucketLabel = (key) => key.length === 4 ? key : new Date(`${key}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const sourceButton = (reading) => reading.source === 'vehicle'
  ? '<button type="button" class="text-button" data-action="edit-vehicle">Fiche véhicule</button>'
  : `<button type="button" class="text-button" data-record="${esc(reading.id)}">${esc(reading.title)}</button>`;
const axes = (plot, unit) => `<text class="chart-unit" x="${plot.left}" y="16">${unit}</text>${plot.ticks.map((tick) => `<path class="chart-gridline" d="M${plot.left} ${tick.y}H${plot.width - plot.right}"/><text class="chart-axis-label" x="${plot.left - 10}" y="${tick.y + 4}" text-anchor="end">${esc(compact(tick.value))}</text>`).join('')}`;

function mileageChart(history, plot) {
  if (!history.groups.length) return '<div class="chart-empty"><p>Aucun relevé daté sur cette période.</p><p class="hint">Une date et un compteur renseignés suffisent pour afficher un point. Deux dates permettent de tracer une évolution.</p></div>';
  const segments = [];
  for (let i = 1; i < plot.points.length; i++) {
    if (history.groups[i - 1].values.length !== 1 || history.groups[i].values.length !== 1) continue;
    const a = plot.points[i - 1], b = plot.points[i];
    segments.push(`<path class="chart-line${history.groups[i].values[0] < history.groups[i - 1].values[0] ? ' chart-warning-line' : ''}" d="M${a.x} ${a.ys[0]}L${b.x} ${b.ys[0]}"/>`);
  }
  const indexes = [...new Set([0, Math.floor((plot.points.length - 1) / 2), plot.points.length - 1])].filter((index, _, all) => all.length <= 2 || index === 0 || index === plot.points.length - 1 || plot.points[index].x - plot.points[0].x > 110 && plot.points.at(-1).x - plot.points[index].x > 110);
  return `<svg id="stats-mileage-chart" class="stats-chart" viewBox="0 0 ${plot.width} ${plot.height}" role="img" aria-labelledby="stats-mileage-svg-title stats-mileage-svg-desc"><title id="stats-mileage-svg-title">Évolution du compteur kilométrique</title><desc id="stats-mileage-svg-desc">${history.groups.length} date(s) observée(s), de ${dateText(history.first.date)} à ${dateText(history.last.date)}. L’axe horizontal suit les dates réelles. Les points sont reliés comme repère visuel ; aucun kilométrage intermédiaire n’est enregistré. Les valeurs exactes et leurs sources sont disponibles sous le graphique.</desc>${axes(plot, 'km')}${segments.join('')}<path id="stats-mileage-guide" class="chart-guide" d=""/>${plot.points.map((point) => `<g data-mileage-group="${point.index}" class="${history.groups[point.index].values.length > 1 ? 'chart-conflict' : ''}">${point.ys.map((y, index) => `<circle class="chart-point" cx="${point.x}" cy="${y}" r="3"><title>${dateText(history.groups[point.index].date)} : ${number(history.groups[point.index].values[index])} km</title></circle>`).join('')}</g>`).join('')}${indexes.map((index) => `<text class="chart-axis-label" x="${plot.points[index].x}" y="${plot.height - 15}" text-anchor="${indexes.length === 1 ? 'middle' : index === 0 ? 'start' : index === plot.points.length - 1 ? 'end' : 'middle'}">${dateText(history.groups[index].date)}</text>`).join('')}</svg>`;
}

function spendingChart(history) {
  if (!history.records.length) return '<div class="chart-empty"><p>Aucune fiche datée sur cette période.</p><p class="hint">Les fiches prévues, futures ou sans date ne sont pas réparties dans le temps.</p></div>';
  if (history.amount === null) return '<div class="chart-empty"><p>Les montants restent à compléter.</p><p class="hint">Les fiches sont conservées dans le tableau, sans inventer de dépenses.</p></div>';
  const frame = { width: 720, height: 235, left: 76, right: 20, top: 22, bottom: 48 };
  const plot = { ...frame, ...chartScale(history.buckets.filter((bucket) => bucket.amount !== null).map((bucket) => Number(bucket.amount)), frame, { includeZero: true }) };
  const width = (plot.width - plot.left - plot.right) / history.buckets.length, zero = plot.y(0);
  const labelStep = Math.max(1, Math.ceil(history.buckets.length / 6));
  return `<svg class="stats-chart" viewBox="0 0 ${plot.width} ${plot.height}" role="img" aria-labelledby="stats-spending-svg-title stats-spending-svg-desc"><title id="stats-spending-svg-title">Dépenses enregistrées par ${history.unit === 'year' ? 'année' : 'mois'}</title><desc id="stats-spending-svg-desc">Somme des montants connus. Les barres hachurées comprennent des montants à compléter. Une période vide ne prouve pas l’absence de dépenses. Le tableau donne les montants exacts.</desc><defs><pattern id="stats-cost-partial" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M-2 2L2 -2M0 7L7 0M5 9L9 5" class="chart-hatch"/></pattern></defs>${axes(plot, '€')}<path class="chart-baseline" d="M${plot.left} ${zero}H${plot.width - plot.right}"/>${history.buckets.map((bucket, index) => {
    const x = plot.left + (index + .5) * width, amount = bucket.amount === null ? null : Number(bucket.amount);
    const title = `${bucketLabel(bucket.key)} : ${bucket.amount === null ? 'aucun montant connu' : formatExactAmount(bucket.amount)}${bucket.partial ? ' · montants à compléter' : ''}`;
    const bar = amount === null ? '' : amount === 0 ? `<path class="chart-zero" d="M${x - width * .3} ${zero}h${width * .6}"><title>${esc(title)}</title></path>` : `<rect class="chart-bar${bucket.partial ? ' chart-bar-partial' : ''}" x="${x - width * .3}" y="${Math.min(plot.y(amount), zero)}" width="${width * .6}" height="${Math.abs(plot.y(amount) - zero)}"><title>${esc(title)}</title></rect>`;
    return bar + (index % labelStep === 0 || index === history.buckets.length - 1 && history.buckets.length % labelStep !== 1 ? `<text class="chart-axis-label${index > 0 && index < history.buckets.length - 1 && Math.floor(index / labelStep) % 2 ? ' chart-secondary-label' : ''}" x="${x}" y="${plot.height - 15}" text-anchor="${index === 0 ? 'start' : index === history.buckets.length - 1 ? 'end' : 'middle'}">${esc(bucketLabel(bucket.key))}</text>` : '');
  }).join('')}</svg>`;
}

export function statisticsMarkup(vehicle, options = {}) {
  const date = options.date ?? today();
  const mileage = mileageHistory(vehicle, { ...options, date }), spending = spendingHistory(vehicle, { ...options, date });
  const plot = mileageGeometry(mileage);
  const interval = mileage.groups.length > 1 ? `Du ${dateText(mileage.first.date)} au ${dateText(mileage.last.date)}` : 'Deux dates distinctes sont nécessaires';
  const uncertain = mileage.conflicts.length || mileage.decreases.length;
  const warning = uncertain ? `<p class="stats-warning" role="status">Relevés à vérifier : ${mileage.conflicts.length} date(s) avec plusieurs compteurs différents et ${mileage.decreases.length} baisse(s) entre dates successives. Les valeurs restent affichées ; l’écart et le rythme ne sont pas calculés.</p>` : '';
  const selected = mileage.groups.length ? `<div class="chart-selection"><label for="stats-mileage-point">Relevé à consulter<select id="stats-mileage-point">${mileage.groups.map((group, index) => `<option value="${index}">${dateText(group.date)} · ${group.values.map((value) => number(value) + ' km').join(' / ')}</option>`).join('')}</select></label><div id="stats-mileage-selection" class="chart-selection-detail" aria-live="polite"></div></div>` : '';
  const mileageRows = mileage.readings.map((reading) => `<tr><td>${dateText(reading.date)}</td><td>${number(reading.odometer)} km</td><td>${sourceButton(reading)}</td></tr>`).join('');
  const spendingRows = spending.buckets.map((bucket) => `<tr><th scope="row">${esc(bucketLabel(bucket.key))}</th><td>${bucket.amount === null ? '—' : esc(formatExactAmount(bucket.amount))}${bucket.partial ? '<span class="stats-table-note">Sous-total connu</span>' : ''}</td><td>${bucket.records.length}</td><td>${bucket.partial}</td></tr>`).join('');
  const html = `<div class="stat-grid stats-overview"><section class="panel stat-card"><p class="stat-label">Dernier compteur daté</p><p class="stat-value">${mileage.last ? mileage.last.values.length === 1 ? `${number(mileage.last.values[0])} <small>km</small>` : 'À vérifier' : '—'}</p><p class="stat-foot">${mileage.last ? `Relevé du ${dateText(mileage.last.date)}` : 'Aucun relevé daté dans la période'}</p></section><section class="panel stat-card"><p class="stat-label">Écart de compteur observé</p><p class="stat-value">${mileage.distance === null ? '—' : `${number(mileage.distance)} <small>km</small>`}</p><p class="stat-foot">${uncertain ? 'Relevés à vérifier' : interval}</p></section><section class="panel stat-card"><p class="stat-label">Rythme annualisé estimé</p><p class="stat-value">${mileage.annualized === null ? '—' : `≈ ${number(Math.round(mileage.annualized))} <small>km/an</small>`}</p><p class="stat-foot">${uncertain ? 'Relevés à vérifier' : mileage.annualized === null ? 'Au moins deux relevés espacés de 30 jours' : 'Calculé entre les deux relevés extrêmes'}</p></section></div>
    <section class="panel stats-panel" aria-labelledby="stats-mileage-title"><div class="panel-heading"><div><h2 id="stats-mileage-title">Évolution du compteur</h2><p class="hint">${mileage.readings.length} source(s) sur ${mileage.groups.length} date(s), dans la période choisie.</p></div><button type="button" class="ghost-button" data-action="new-reading">Ajouter un relevé</button></div>${warning}${mileageChart(mileage, plot)}${selected}<p class="hint stats-method">Les relevés de la fiche véhicule et des fiches datées sont utilisés, sauf les fiches prévues et les dates futures. Le rythme annualisé décrit l’intervalle observé ; ce n’est pas une prévision.</p>${vehicle.odometer !== null && !vehicle.odometerDate ? '<p class="hint stats-method">Le compteur de la fiche véhicule n’a pas de date et ne figure pas sur la courbe. <button type="button" class="text-button" data-action="edit-vehicle">Dater ce relevé</button></p>' : ''}${mileage.omitted.missingDate || mileage.omitted.missingOdometer || mileage.omitted.future ? `<p class="hint stats-method">Informations non utilisées : ${mileage.omitted.missingDate} date(s) manquante(s), ${mileage.omitted.missingOdometer} compteur(s) manquant(s), ${mileage.omitted.future} date(s) future(s).</p>` : ''}${mileageRows ? `<details class="stats-data"><summary>Voir les relevés et leurs sources</summary><div class="stats-table-wrap" role="region" aria-label="Relevés kilométriques" tabindex="0"><table><caption>Tous les relevés retenus, y compris les doublons de sources</caption><thead><tr><th scope="col">Date</th><th scope="col">Compteur</th><th scope="col">Source</th></tr></thead><tbody>${mileageRows}</tbody></table></div></details>` : ''}</section>
    <section class="panel stats-panel" aria-labelledby="stats-spending-title"><div class="panel-heading"><div><h2 id="stats-spending-title">Dépenses dans le temps</h2><p class="hint">${spending.unit === 'year' ? 'Par année' : 'Par mois'} · ${options.scope === 'all' ? 'Tous les événements' : 'Interventions'} · ${spending.records.length} fiche(s) datée(s)</p></div><div class="stats-cost-total"><strong>${spending.amount === null ? '—' : esc(formatAmount(spending.amount))}</strong><span>${spending.partial ? 'Sous-total connu' : 'Total enregistré'}</span></div></div>${spendingChart(spending)}<p class="hint stats-method">${spending.range.start ? `Du ${dateText(spending.range.start)} au ${dateText(spending.range.end)}. ` : ''}Les barres hachurées signalent des montants à compléter. Une période sans montant connu reste inconnue ; les remboursements et montants négatifs sont conservés.</p><p class="hint stats-method">${spending.partial} fiche(s) avec un total à compléter · ${spending.omitted.undated} fiche(s) sans date et ${spending.omitted.future} fiche(s) future(s) hors graphique. Les fiches prévues sont exclues.</p>${spendingRows ? `<details class="stats-data"><summary>Voir les montants exacts par période</summary><div class="stats-table-wrap" role="region" aria-label="Dépenses par période" tabindex="0"><table><caption>— signifie qu’aucun montant connu n’est enregistré dans la période</caption><thead><tr><th scope="col">Période</th><th scope="col">Montant connu</th><th scope="col">Fiches</th><th scope="col">Totaux à compléter</th></tr></thead><tbody>${spendingRows}</tbody></table></div></details>` : ''}</section>`;
  return { html, mileage, spending, plot };
}

export function renderStatistics(container, vehicle, options = {}) {
  const { html, mileage, plot } = statisticsMarkup(vehicle, options);
  container.innerHTML = html;
  if (!mileage.groups.length) return;
  const svg = container.querySelector('#stats-mileage-chart'), select = container.querySelector('#stats-mileage-point');
  const showPoint = (index) => {
    const group = mileage.groups[index];
    if (!group) return;
    select.value = String(index);
    container.querySelector('#stats-mileage-selection').innerHTML = `<strong>${dateText(group.date)} · ${group.values.map((value) => number(value) + ' km').join(' / ')}</strong><div class="stats-sources">${group.readings.map(sourceButton).join('')}</div>`;
    svg.querySelector('#stats-mileage-guide').setAttribute('d', `M${plot.points[index].x} ${plot.top}V${plot.height - plot.bottom}`);
    svg.querySelectorAll('[data-mileage-group]').forEach((marker) => {
      const active = Number(marker.dataset.mileageGroup) === index;
      marker.classList.toggle('is-selected', active);
      marker.querySelectorAll('circle').forEach((circle) => circle.setAttribute('r', active ? '5' : '3'));
    });
  };
  select.addEventListener('change', () => showPoint(Number(select.value)));
  svg.addEventListener('click', (event) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const x = point.matrixTransform(matrix.inverse()).x;
    let closest = 0;
    for (let i = 1; i < plot.points.length; i++) if (Math.abs(plot.points[i].x - x) < Math.abs(plot.points[closest].x - x)) closest = i;
    showPoint(closest);
  });
  showPoint(mileage.groups.length - 1);
}
