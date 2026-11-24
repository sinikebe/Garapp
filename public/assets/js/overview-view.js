/** Pure overview, history and expense markup; interactions stay in app.js. */
import { associatedComponentIds, chronological, componentLife, recordCost, today, typeLabel, vehicleStats } from './garage.js';
import { formatAmount as euros } from './amounts.js';
import { vehicleVisualMarkup } from './vehicle-visual.js';
import { escapeHtml as esc, formatNumber as number, formatMileage as mileage, formatDate as dateText, icon } from './ui-format.js';
import { fuelUnitPrice } from './fuel-entry.js';
import { eventProfile } from './event-profiles.js';

const unitPrice = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const insuranceMonth = (period) => new Date(`${period}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function eventMeta(record, current, parts) {
  const details = [];
  if (record.type === 'insurance') {
    const contract = current.insurances?.find((one) => one.id === record.insurance?.contractId);
    if (contract?.provider) details.push(contract.provider);
    details.push(record.insurance ? `Cotisation de ${insuranceMonth(record.insurance.period)}` : 'Cotisation ponctuelle');
  } else if (record.type === 'plan') details.push('Programme de suivi');
  else if (record.type === 'acquisition') details.push('Transaction du véhicule');
  else if (record.type === 'reading') details.push('Relevé du compteur');
  if (record.type !== 'reading' && (record.odometer !== null || eventProfile(record.type).maintenance)) details.push(mileage(record.odometer));
  if (parts.length) details.push(`Composants : ${parts.join(' · ')}`);
  if (record.lines.length) details.push(`${record.lines.length} poste(s) détaillé(s)`);
  if (record.status !== 'done') details.push(record.status === 'planned' ? 'Prévu' : 'À compléter');
  if (record.documents.length) details.push(`${record.documents.length} justificatif(s)`);
  if (record.type === 'reading' && recordCost(record).total !== null) details.push(`Montant associé : ${euros(recordCost(record).total)}`);
  return details.map((value) => `<span>${esc(value)}</span>`).join('');
}

const labels = { due: 'Échéance atteinte', soon: 'À prévoir', ok: 'Repère non atteint', unknown: 'Suivi à compléter' };

export function pill(life) { return `<span class="status-pill" data-status="${life.status}">${labels[life.status]}</span>`; }
export function remaining(life) {
  if (life.percent === null) return life.last ? 'Complétez les repères, dates ou kilométrages pour suivre ce composant.' : 'Ajoutez son dernier remplacement pour démarrer le suivi.';
  if (life.status === 'due') return 'Le repère d’entretien est atteint.';
  return [life.km === null ? null : `${number(life.km)} km`, life.months === null ? null : `${life.months} mois`].filter(Boolean).join(' ou ') + ' avant le repère';
}
export function empty(title, message, action, label) { return `<div class="panel empty-state">${icon('car')}<h2>${esc(title)}</h2><p class="hint">${esc(message)}</p>${action ? `<button type="button" class="primary-button" data-action="${action}">${esc(label)}</button>` : ''}</div>`; }
function costMarkup(record) {
  const cost = recordCost(record);
  return `<span>${euros(cost.total)}${cost.total === null && cost.subtotal !== null ? `<small class="cost-note">${euros(cost.subtotal)} connus</small>` : ''}</span>`;
}
export function recordsMarkup(records, current) {
  if (!records.length) return empty('Rien à afficher pour le moment', 'Ajoutez un événement ou ajustez les filtres.', 'new-record', 'Ajouter un événement');
  return `<div class="record-list">${chronological(records).map((record) => {
    const parts = associatedComponentIds(record).map((id) => current.components.find((part) => part.id === id)?.name).filter(Boolean);
    if (record.type === 'fuel') {
      const price = fuelUnitPrice(record);
      const filling = record.fuel?.fullTank == null ? 'Remplissage non précisé' : record.fuel.fullTank ? 'Plein complet' : 'Ajout partiel';
      return `<article class="record-row record-row-fuel"><span class="record-date">${record.date ? `<time datetime="${record.date}"><strong>${esc(dateText(record.date, { day: 'numeric', month: 'short' }))}</strong>${record.date.slice(0, 4)}</time>` : 'Date inconnue'}</span><div><span class="fuel-record-label">${icon('fuel')} Carburant</span><button type="button" class="record-title" data-record="${record.id}">${esc(record.title)}</button><div class="record-meta"><span class="fuel-record-volume">${record.fuel?.litres == null ? 'Quantité inconnue' : esc(record.fuel.litres.replace('.', ',')) + ' L'}</span><span>${filling}</span><span>${price === null ? 'Prix au litre inconnu' : unitPrice.format(price) + ' €/L'}</span><span>${mileage(record.odometer)}</span>${record.status !== 'done' ? `<span>${record.status === 'planned' ? 'Prévu' : 'À compléter'}</span>` : ''}${record.documents.length ? `<span>${record.documents.length} justificatif(s)</span>` : ''}</div></div><span class="record-cost">${costMarkup(record)}</span><button type="button" class="icon-button" data-record="${record.id}" aria-label="Voir ${esc(record.title)}">${icon('arrow')}</button></article>`;
    }
    const profile = eventProfile(record.type);
    const reading = record.type === 'reading';
    const costLabel = record.type === 'plan' ? 'Budget' : record.type === 'registration' ? 'Frais' : record.type === 'insurance' ? 'Cotisation' : record.type === 'acquisition' ? 'Transaction' : 'Montant';
    return `<article class="record-row record-row-event" data-event-kind="${profile.kind}"><span class="record-date">${record.date ? `<time datetime="${record.date}"><strong>${esc(dateText(record.date, { day: 'numeric', month: 'short' }))}</strong>${record.date.slice(0, 4)}</time>` : 'Date inconnue'}</span><div><span class="event-record-label">${icon(profile.icon)} ${esc(typeLabel(record.type))}</span><button type="button" class="record-title" data-record="${record.id}">${esc(record.title)}</button><div class="record-meta">${eventMeta(record, current, parts)}</div></div><span class="record-cost">${reading ? mileage(record.odometer) : costMarkup(record)}${reading ? '' : `<small class="cost-note">${costLabel}</small>`}</span><button type="button" class="icon-button" data-record="${record.id}" aria-label="Voir ${esc(record.title)}">${icon('arrow')}</button></article>`;
  }).join('')}</div>`;
}
export function dashboardMarkup(current, date = today()) {
  const year = date.slice(0, 4);
  const stats = vehicleStats(current, year);
  const visual = vehicleVisualMarkup(current);
  const statCards = `<div class="stat-grid"><section class="panel stat-card"><p class="stat-label">Interventions en ${year}</p><p class="stat-value">${euros(stats.amount)}</p><p class="stat-foot">${stats.incomplete ? 'Sous-total connu · montants à compléter' : 'Dépenses enregistrées'}</p></section><section class="panel stat-card"><p class="stat-label">Historique du véhicule</p><p class="stat-value">${current.records.length}</p><p class="stat-foot">Interventions et événements</p></section><section class="panel stat-card"><p class="stat-label">Pièces et consommables</p><p class="stat-value">${current.components.length}</p><p class="stat-foot">Composants suivis</p></section></div>`;
  const attention = current.components.map((part) => ({ part, life: componentLife(current, part, date) })).filter(({ life }) => ['soon', 'due'].includes(life.status)).sort((a, b) => a.life.percent - b.life.percent);
  return `<div class="dashboard-grid">${!visual ? '<div class="dashboard-summary">' : ''}<section class="panel vehicle-hero"><div class="hero-top"><div><p class="eyebrow">VOTRE VÉHICULE</p><h2>${esc(current.name)}</h2><p class="vehicle-subtitle">${esc([current.engine, current.year].filter(Boolean).join(' · ') || 'Informations à compléter')}</p></div><span class="hero-tag">${current.example ? 'Véhicule d’exemple' : 'Mon véhicule'}</span></div>${visual}<div class="hero-bottom"><div><span class="odometer-label">Kilométrage actuel</span><span class="odometer-value">${number(current.odometer)}${current.odometer === null ? '' : ' <small>km</small>'}</span>${current.odometerDate ? `<p class="hint">Relevé du ${esc(dateText(current.odometerDate))}</p>` : ''}</div><button type="button" class="text-button" data-action="vehicle-details">Fiche du véhicule ${icon('arrow')}</button></div></section>${!visual ? statCards + '</div>' : ''}<section class="panel attention-panel"><div class="panel-heading"><h2>À garder en tête</h2><span class="hero-tag">${attention.length} repère(s)</span></div><div class="attention-list">${attention.length ? attention.slice(0, 3).map(({ part, life }) => `<button class="attention-row" type="button" data-component="${part.id}"><span class="attention-mark" aria-hidden="true">${life.status === 'due' ? '!' : '◇'}</span><span><strong>${esc(part.name)}</strong><small>${esc(remaining(life))}</small></span>${icon('arrow')}</button>`).join('') : '<p class="hint">Aucun repère atteint ou proche parmi les composants renseignés.</p><button class="text-button" type="button" data-route="composants">Consulter les composants</button>'}</div><p class="hint">Des repères personnalisés pour anticiper l’entretien.</p></section></div>${visual ? statCards : ''}<section class="panel"><div class="panel-heading"><h2>Dernières interventions et événements</h2><button type="button" class="text-button" data-route="interventions">Tout l’historique ${icon('arrow')}</button></div>${recordsMarkup(chronological(current.records).slice(0, 3), current)}<div class="panel-end"><button type="button" class="text-button" data-action="new-record">${icon('plus')} Ajouter un événement</button></div></section>`;
}
export function expensesMarkup(current, { period = today().slice(0, 4), scope = 'maintenance' } = {}) {
  const stats = vehicleStats(current, period, scope);
  const caption = period === 'all' ? 'Tout l’historique' : period === 'undated' ? 'Fiches sans date' : `En ${period}`;
  const categories = stats.categories.filter((one) => one.total !== 0);
  return `<section class="panel expense-hero"><p class="eyebrow">${caption.toLocaleUpperCase('fr')}</p><h2 class="stat-label">${stats.incomplete ? 'Sous-total des montants connus' : 'Dépenses enregistrées'}</h2><p class="stat-value">${euros(stats.amount)}</p><p class="hint">${stats.count} fiche(s)${stats.incomplete ? ` · ${stats.incomplete} total(aux) inconnu(s)` : ''}. Les événements prévus sont exclus.</p></section><div class="stat-grid"><section class="panel stat-card"><p class="stat-label">Pièces</p><p class="stat-value">${euros(stats.partsAmount)}</p><p class="stat-foot">Ventilation connue</p></section><section class="panel stat-card"><p class="stat-label">Main-d’œuvre</p><p class="stat-value">${euros(stats.laborAmount)}</p><p class="stat-foot">Ventilation connue</p></section><section class="panel stat-card"><p class="stat-label">Prestations, forfaits et frais</p><p class="stat-value">${euros(stats.otherAmount)}</p><p class="stat-foot">Montants détaillés connus</p></section></div><section class="panel"><h2>Répartition par type</h2>${stats.breakdownIncomplete ? '<p class="hint">Certaines ventilations sont incomplètes. Un total de justificatif peut différer de la somme des lignes.</p>' : ''}${categories.length ? `<ul class="expense-bars">${categories.map((one) => `<li><div class="bar-heading"><span>${esc(typeLabel(one.type))}</span><strong>${euros(one.amount)}</strong></div><div class="expense-track" aria-hidden="true"><span style="width:${Math.min(100, Math.abs(one.total / (stats.total || 1) * 100))}%"></span></div></li>`).join('')}</ul>` : '<p class="hint">Aucun montant connu sur cette période.</p>'}</section>`;
}
