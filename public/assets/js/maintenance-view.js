import { maintenanceSummary } from './maintenance.js';
import { MAINTENANCE_PRESETS, MAINTENANCE_GUIDE, TYRE_LAW } from './maintenance-defaults.js';
import { remaining, pill } from './overview-view.js';
import { escapeHtml as esc, formatDate, formatNumber, icon } from './ui-format.js';

const statusLabel = { due: 'À faire', soon: 'Bientôt', unknown: 'À compléter', ok: 'À jour', paused: 'En pause' };
const frequency = (check) => check.intervalKm ? `tous les ${formatNumber(check.intervalKm)} km` : check.intervalMonths ? check.intervalMonths === 1 ? 'chaque mois' : `tous les ${check.intervalMonths} mois` : check.intervalDays === 1 ? 'chaque jour' : `tous les ${check.intervalDays} jours`;
function checkRow(life) {
  const { check, last } = life;
  const preset = MAINTENANCE_PRESETS.find((one) => one.key === check.presetKey);
  const customized = preset && ['intervalDays', 'intervalMonths', 'intervalKm'].some((field) => (check[field] ?? null) !== (preset[field] ?? null));
  const deadline = life.status === 'paused' ? 'Rappel désactivé' : life.status === 'unknown' ? 'Complétez ou corrigez les compteurs du contrôle et des relevés suivants.'
    : life.dueOdometer !== null ? `Échéance à ${formatNumber(life.dueOdometer)} km · ${formatNumber(life.km)} km restants`
    : `${life.days < 0 ? `${-life.days} jour(s) de retard · ` : ''}${last ? 'Échéance' : 'Première échéance'} le ${formatDate(life.dueDate)}`;
  return `<article class="maintenance-row" data-status="${life.status}"><div><div class="maintenance-row-heading"><h3>${esc(check.name)}</h3><span class="status-pill" data-status="${life.status}">${statusLabel[life.status]}</span></div>
    <p class="hint" data-help-keep>${esc(deadline)} · ${frequency(check)}</p>
    ${last ? `<p class="hint" data-help-keep>Dernier contrôle : <button type="button" class="text-button" data-record="${esc(last.id)}">${esc(formatDate(last.date))}</button></p>` : '<p class="hint" data-help-keep>Premier contrôle à renseigner : aucune vérification passée n’est présumée.</p>'}
    ${check.notes ? `<p class="detail-notes">${esc(check.notes)}</p>` : ''}
    ${preset ? `<p class="hint" data-help-keep>${customized ? 'Fréquence personnalisée · ' : ''}<a href="${preset.source}" target="_blank" rel="noopener noreferrer">Conseil de la Sécurité routière</a></p>` : ''}
    </div><div class="maintenance-row-actions">${check.enabled !== false ? `<button type="button" class="primary-button" data-complete-check="${check.id}">${icon('check')} Noter le contrôle</button>` : ''}<button type="button" class="ghost-button" data-edit-check="${check.id}">Modifier</button></div></article>`;
}

export function maintenanceMarkup(vehicle, date) {
  if (!vehicle) return '<p class="hint">Ajoutez un véhicule pour préparer ses alertes d’entretien.</p><button type="button" class="primary-button" data-action="new-vehicle">Ajouter un véhicule</button>';
  const summary = maintenanceSummary(vehicle, date);
  const parts = summary.components.filter(({ life }) => ['soon', 'due'].includes(life.status)).sort((a, b) => a.life.percent - b.life.percent);
  const order = { due: 0, soon: 1, unknown: 2, ok: 3, paused: 4 };
  const checks = summary.checks.toSorted((a, b) => order[a.status] - order[b.status] || (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  return `<div class="maintenance-summary"><strong>${summary.alerts.length} alerte(s)</strong><span>${summary.alerts.filter((alert) => alert.status === 'due').length} à faire · ${summary.alerts.filter((alert) => alert.status === 'soon').length} à prévoir${summary.alerts.some((alert) => alert.status === 'unknown') ? ` · ${summary.alerts.filter((alert) => alert.status === 'unknown').length} à compléter` : ''}</span></div>
    <section class="maintenance-section" aria-labelledby="maintenance-parts-title"><div class="panel-heading"><h3 id="maintenance-parts-title">Pièces à surveiller</h3><button type="button" class="text-button" data-action="alert-components">Régler les intervalles</button></div>
    ${parts.map(({ part, life }) => `<button type="button" class="maintenance-part" data-component="${part.id}"><span>${icon('parts')}<strong>${esc(part.name)}</strong></span>${pill(life)}<small>${esc(remaining(life))}</small>${icon('arrow')}</button>`).join('') || '<p class="hint">Aucun repère atteint ou proche parmi les pièces suivies.</p>'}
    <p class="hint">Alerte à partir de 75 % de l’intervalle choisi, ou dès son échéance. Ce sont des repères d’entretien, pas une mesure de l’état réel des pièces.${summary.unknown ? ` ${summary.unknown} pièce(s) ont un suivi à compléter.` : ''}</p></section>
    <section class="maintenance-section" aria-labelledby="maintenance-checks-title"><div class="panel-heading"><h3 id="maintenance-checks-title">Vérifications régulières</h3><button type="button" class="ghost-button" data-action="new-check">${icon('plus')} Ajouter</button></div>
    <details class="maintenance-advice"><summary>Références françaises et conseils avant un trajet</summary><p class="hint" data-help-keep>Les rappels standard reprennent des conseils de prévention de la Sécurité routière, pas des échéances légales. Les consignes du constructeur restent la référence pour ce véhicule.</p><p class="hint" data-help-keep>Avant un long trajet, vérifier aussi la pression, l’huile si applicable, le lave-glace et la visibilité.</p><p><a href="${MAINTENANCE_GUIDE}" target="_blank" rel="noopener noreferrer">Guide du bon conducteur · entretien</a> · <a href="${TYRE_LAW}" target="_blank" rel="noopener noreferrer">Code de la route · pneumatiques</a></p></details>
    ${checks.length ? checks.map(checkRow).join('') : '<div class="maintenance-empty"><p>Pression des pneus, niveaux, éclairage…</p><p class="hint">Choisissez les contrôles et leur fréquence pour ce véhicule.</p><button type="button" class="primary-button" data-action="new-check">Préparer un rappel</button></div>'}
    <p class="hint">Un contrôle noté crée une fiche dans le journal. La prochaine échéance part de la date ou du compteur du dernier contrôle réalisé. Les rappels en pause restent conservés.</p></section>`;
}

export function notificationStatus(notifications) {
  if (!notifications.supported) return 'Notifications indisponibles dans ce navigateur ou ce contexte. Les alertes restent consultables ici.';
  if (notifications.permission === 'denied') return 'Notifications bloquées. Pour les autoriser, utilisez les réglages de ce site dans le navigateur.';
  return notifications.problem || (notifications.enabled ? 'Notifications activées sur cet appareil pour le véhicule sélectionné.' : 'Notifications du navigateur désactivées sur cet appareil.');
}
