import { TYPES, LINE_TYPES, EFFECTS, VERSION, MAX_DOCUMENT_BYTES, today, uid, chronological, associatedComponentIds, replacementHistory, componentHistory, componentLife, recordCost, vehicleStats, exampleGarage, parseGarage, storageKey, inventory, typeLabel, validateDocument } from './garage.js';
import { amountInput, formatAmount as euros, formatExactAmount, sumAmounts, cents } from './amounts.js';
import { WorkspaceStorage } from './storage.js';
import { suiteLinks } from './app-switcher.js';
import { navigationKey, defaultFilters, normalizeFilters, normalizeNavigation, readNavigation, writeNavigation, resolveSection } from './navigation.js';
import { initHeaderMenus } from './header-menus.js';
import { BackupPanel } from './backup-panel.js';
import { readBackupFile, fingerprint, backupErrorMessage } from './backups.js';
import { DrivePanel } from './drive-panel.js';
import { renderStatistics } from './statistics-view.js';
import { COMPONENT_KINDS, COMPONENT_ZONES, COMPONENT_SIDES, componentSpatial, spatialLabel, inferSpatial, detectComponents } from './component-catalog.js';
import { knownComponents, proposedDiscoveries, applyDiscoveries } from './component-knowledge.js';
import { renderComponentView, newSceneState } from './component-view.js';
import { moveRecordToTrash, restoreTrashedRecord, discardTrashedRecord } from './record-trash.js';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const number = (value) => value === null || value === undefined ? 'Non renseigné' : new Intl.NumberFormat('fr-FR').format(value);
const mileage = (value) => value === null || value === undefined ? 'Kilométrage inconnu' : `${number(value)} km`;
const dateText = (date, options = { day: 'numeric', month: 'short', year: 'numeric' }) => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', options) : 'Date inconnue';
const icon = (name) => `<svg class="icon ui-icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const labels = { due: 'Échéance atteinte', soon: 'À prévoir', ok: 'Repère non atteint', unknown: 'Suivi à compléter' };
const base = new URL('../../', import.meta.url);
const key = storageKey(base);
const preferenceKey = key.replace('workspace', 'preferences');
const navigationStorageKey = navigationKey(base);
let navigation = normalizeNavigation(null, today().slice(0, 4));
try { navigation = readNavigation(localStorage, navigationStorageKey, today().slice(0, 4)); } catch { /* Navigation remains usable without storage access. */ }
const repository = new WorkspaceStorage(key);
let garage;
let unsaved = false;
let pendingImport = null;
let importGeneration = 0;
let editingVehicle = null;
let editingRecord = null;
let editingComponent = null;
let editingEvidenceSources = [];
let discoveryCandidates = [];
let disposeComponentView = null;
const sceneStates = new Map();
let editingLines = [];
let toastTimer;
let saving = false;
let localConflict = false;
let applyingRemote = false;
let changingRecord = false;
let pendingDiscard = null;
let preferences = { layout: 'horizon', theme: 'auto' };
const documentDrafts = new Map();
const documentExtraDrafts = new Map();
const downloadableDocuments = new Map();
let commandReturnFocus = null;
const openDialogs = () => [...document.querySelectorAll('dialog[open]')];
const vehicle = () => garage.vehicles.find((one) => one.id === garage.activeId);
const closeMenus = initHeaderMenus(document);
const announce = (message) => { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000); };
function storageWarning(message) { $('storage-warning').hidden = false; $('storage-message').textContent = message; $('save-status').textContent = 'Modifications non enregistrées'; }
try {
  garage = await repository.load() ?? exampleGarage();
  if (!garage.vehicles.some((one) => one.example)) $('save-status').textContent = 'Enregistré sur cet appareil';
} catch {
  garage = exampleGarage();
  unsaved = true;
  storageWarning('Le garage enregistré est illisible ou inaccessible. Son contenu est conservé. La copie ouverte reste exportable.');
}
try {
  const saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
  if (['horizon', 'atelier', 'parcours'].includes(saved?.layout)) preferences.layout = saved.layout;
  if (['auto', 'light', 'dark'].includes(saved?.theme)) preferences.theme = saved.theme;
} catch { /* Appearance preferences are independent of garage data. */ }

const backups = new BackupPanel({
  key, development: suiteLinks(base).preview, getGarage: () => garage,
  canAutoSave: () => !unsaved && !saving && !localConflict && !repository.invalid,
  download, announce, showDialog, openFile: prepareImport,
});
await backups.restore();

const canDriveSync = () => !unsaved && !saving && !localConflict && !repository.invalid && !backups.files.busy && !backups.picking && !$('import-confirm').dataset.importing && !openDialogs().some((dialog) => dialog.querySelector('form') || dialog.id === 'import-dialog');
const canDriveApply = (explicit = false) => canDriveSync() && document.hasFocus() && !openDialogs().some((dialog) => dialog.id === 'drive-preview-dialog' && !explicit);
const drive = new DrivePanel({
  key, base, development: suiteLinks(base).preview, getGarage: () => garage,
  canSync: canDriveSync, canApply: canDriveApply, applyRemote: applyDriveGarage,
  download, announce, showDialog,
});
try { await drive.restore(); }
catch { drive.problem = 'La synchronisation Drive nécessite un navigateur récent, HTTPS et le stockage local. Les sauvegardes JSON restent disponibles.'; drive.render(); }

/** Persist a verified remote copy before changing the garage visible in the UI. */
async function applyDriveGarage(incoming, expected, explicit) {
  if (garage !== expected || !canDriveApply(explicit)) throw Error('Le garage est occupé ou a changé. La copie locale est conservée ; relancer la synchronisation.');
  const next = parseGarage(JSON.stringify(incoming));
  if (next.vehicles.some((one) => one.id === garage.activeId)) next.activeId = garage.activeId;
  saving = true; applyingRemote = true;
  try {
    await repository.save(next);
    garage = next; unsaved = false;
    if (!localConflict) { $('storage-warning').hidden = true; $('save-status').textContent = 'Enregistré sur cet appareil'; }
  } catch (error) { throw Error(`La version Drive est conservée, mais son enregistrement sur cet appareil a échoué. Le garage ouvert reste inchangé. ${error.message}`); }
  finally { saving = false; applyingRemote = false; }
  render(); void backups.update();
}

// Block new edits only during the atomic local commit of an incoming copy.
for (const type of ['click', 'change', 'input', 'submit', 'keydown']) document.addEventListener(type, (event) => {
  if (applyingRemote) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);

async function save(next) {
  if (saving) throw Error('Un enregistrement est déjà en cours.');
  next = parseGarage(JSON.stringify(next));
  saving = true;
  garage = next;
  unsaved = true;
  try {
    await repository.save(next);
    unsaved = false;
    localConflict = false;
    $('storage-warning').hidden = true;
    $('save-status').textContent = 'Enregistré sur cet appareil';
  } catch (error) { storageWarning(error.message.includes('onglet') || error.message.includes('illisible') ? error.message : 'L’enregistrement local a échoué. La copie ouverte contient les modifications et les documents ; exportez-la avant de quitter.'); }
  finally { saving = false; }
  render();
  if (unsaved) backups.suspend();
  void backups.update(!unsaved);
  drive.changed();
}
function applyPreferences() {
  document.body.dataset.layout = preferences.layout;
  if (preferences.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preferences.theme;
  $('layout-select').value = preferences.layout;
  const names = { auto: 'automatique', light: 'claire', dark: 'sombre' };
  const next = { auto: 'claire', light: 'sombre', dark: 'automatique' };
  $('appearance-value').textContent = { auto: 'Auto', light: 'Clair', dark: 'Sombre' }[preferences.theme];
  $('theme-toggle').setAttribute('aria-label', `Apparence ${names[preferences.theme]}. Passer à l’apparence ${next[preferences.theme]}.`);
  const descriptions = {
    horizon: 'Horizon : tableau de bord aéré et composants en grille sur grand écran.',
    atelier: 'Atelier : cartes plus rapprochées et composants en deux colonnes sur grand écran.',
    parcours: 'Panorama : espace centré et navigation en haut sur grand écran, sans étapes imposées.',
  };
  $('presentation-description').textContent = descriptions[preferences.layout];
  try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Optional preferences. */ }
}
function pill(life) { return `<span class="status-pill" data-status="${life.status}">${labels[life.status]}</span>`; }
function remaining(life) {
  if (life.percent === null) return life.last ? 'Complétez les repères, dates ou kilométrages pour suivre ce composant.' : 'Ajoutez son dernier remplacement pour démarrer le suivi.';
  if (life.status === 'due') return 'Le repère d’entretien est atteint.';
  return [life.km === null ? null : `${number(life.km)} km`, life.months === null ? null : `${life.months} mois`].filter(Boolean).join(' ou ') + ' avant le repère';
}
function empty(title, message, action, label) { return `<div class="panel empty-state">${icon('car')}<h2>${esc(title)}</h2><p class="hint">${esc(message)}</p>${action ? `<button type="button" class="primary-button" data-action="${action}">${esc(label)}</button>` : ''}</div>`; }
function costMarkup(record) {
  const cost = recordCost(record);
  return `<span>${euros(cost.total)}${cost.total === null && cost.subtotal !== null ? `<small class="cost-note">${euros(cost.subtotal)} connus</small>` : ''}</span>`;
}
function recordsMarkup(records, current = vehicle()) {
  if (!records.length) return empty('Rien à afficher pour le moment', 'Ajoutez une intervention ou ajustez les filtres.', 'new-record', 'Ajouter une intervention');
  return `<div class="record-list">${chronological(records).map((record) => {
    const parts = associatedComponentIds(record).map((id) => current.components.find((part) => part.id === id)?.name).filter(Boolean);
    return `<article class="record-row"><span class="record-date">${record.date ? `<time datetime="${record.date}"><strong>${esc(dateText(record.date, { day: 'numeric', month: 'short' }))}</strong>${record.date.slice(0, 4)}</time>` : 'Date inconnue'}</span><div><button type="button" class="record-title" data-record="${record.id}">${esc(record.title)}</button><div class="record-meta"><span>${esc(typeLabel(record.type))}</span><span>${mileage(record.odometer)}</span>${record.status !== 'done' ? `<span>${record.status === 'planned' ? 'Prévu' : 'À compléter'}</span>` : ''}${parts.length ? `<span>${esc(parts.join(' · '))}</span>` : ''}${record.documents.length ? `<span>${record.documents.length} document(s)</span>` : ''}</div></div><span class="record-cost">${costMarkup(record)}</span><button type="button" class="icon-button" data-record="${record.id}" aria-label="Voir ${esc(record.title)}">${icon('arrow')}</button></article>`;
  }).join('')}</div>`;
}
function carDrawing() {
  return `<svg class="car-drawing" viewBox="0 0 520 200" role="img" aria-label="Illustration d’une voiture"><ellipse cx="263" cy="174" rx="215" ry="8" fill="var(--surface-2)"/><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M55 147v-26q0-15 18-19l54-10 42-40q12-12 36-12h102q19 0 33 15l45 42 49 12q25 6 29 23l3 19-25 8h-27q-3-38-35-38t-36 38H174q-3-38-36-38t-36 38H74q-19 0-19-12Z" fill="var(--accent-wash)"/><path d="m148 92 37-36h43v36Zm94-36h58q12 0 23 12l25 24H242ZM241 97v50m-73-47v27m190-28 15 25M67 113h28l-3 12H58m367-12-4 16h35M210 107h14m103 0h14M185 145h145"/><circle cx="138" cy="155" r="27" fill="var(--surface-1)"/><circle cx="378" cy="155" r="27" fill="var(--surface-1)"/><circle cx="138" cy="155" r="14" stroke="var(--text-secondary)"/><circle cx="378" cy="155" r="14" stroke="var(--text-secondary)"/><path d="M128 155h20m-10-10v20m230-10h20m-10-10v20" stroke="var(--text-secondary)"/></g></svg>`;
}

function renderDashboard(current) {
  const year = today().slice(0, 4);
  const stats = vehicleStats(current, year);
  const attention = current.components.map((part) => ({ part, life: componentLife(current, part) })).filter(({ life }) => ['soon', 'due'].includes(life.status)).sort((a, b) => a.life.percent - b.life.percent);
  $('dashboard').innerHTML = `<div class="dashboard-grid"><section class="panel vehicle-hero"><div class="hero-top"><div><p class="eyebrow">VOTRE VÉHICULE</p><h2>${esc(current.name)}</h2><p class="vehicle-subtitle">${esc([current.engine, current.year].filter(Boolean).join(' · ') || 'Informations à compléter')}</p></div><span class="hero-tag">${current.example ? 'Véhicule d’exemple' : 'Mon véhicule'}</span></div>${carDrawing()}<div class="hero-bottom"><div><span class="odometer-label">Kilométrage actuel</span><span class="odometer-value">${number(current.odometer)}${current.odometer === null ? '' : ' <small>km</small>'}</span>${current.odometerDate ? `<p class="hint">Relevé du ${esc(dateText(current.odometerDate))}</p>` : ''}</div><button type="button" class="text-button" data-action="vehicle-details">Fiche du véhicule ${icon('arrow')}</button></div></section><section class="panel attention-panel"><div class="panel-heading"><h2>À garder en tête</h2><span class="hero-tag">${attention.length} repère(s)</span></div><div class="attention-list">${attention.length ? attention.slice(0, 3).map(({ part, life }) => `<button class="attention-row" type="button" data-component="${part.id}"><span class="attention-mark" aria-hidden="true">${life.status === 'due' ? '!' : '◇'}</span><span><strong>${esc(part.name)}</strong><small>${esc(remaining(life))}</small></span>${icon('arrow')}</button>`).join('') : '<p class="hint">Aucun repère atteint ou proche parmi les composants renseignés.</p><button class="text-button" type="button" data-route="composants">Consulter les composants</button>'}</div><p class="hint">Des repères personnalisés pour anticiper l’entretien.</p></section></div><div class="stat-grid"><section class="panel stat-card"><p class="stat-label">Interventions en ${year}</p><p class="stat-value">${euros(stats.amount)}</p><p class="stat-foot">${stats.incomplete ? 'Sous-total connu · montants à compléter' : 'Dépenses enregistrées'}</p></section><section class="panel stat-card"><p class="stat-label">Historique du véhicule</p><p class="stat-value">${current.records.length}</p><p class="stat-foot">Interventions et événements</p></section><section class="panel stat-card"><p class="stat-label">Pièces et consommables</p><p class="stat-value">${current.components.length}</p><p class="stat-foot">Composants suivis</p></section></div><section class="panel"><div class="panel-heading"><h2>Dernières interventions et événements</h2><button type="button" class="text-button" data-route="interventions">Tout l’historique ${icon('arrow')}</button></div>${recordsMarkup(chronological(current.records).slice(0, 3), current)}<div class="panel-end"><button type="button" class="text-button" data-action="new-record">${icon('plus')} Ajouter une intervention</button></div></section>`;
}
const searchText = (text) => text.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{Diacritic}/gu, '');
function renderRecords() {
  const current = vehicle();
  if (!current) return;
  const query = searchText($('record-search').value);
  const type = $('record-type').value;
  const records = current.records.filter((record) => (type === 'all' || record.type === type) && searchText(`${record.title} ${record.notes} ${record.content} ${record.lines.map((line) => `${line.label} ${line.description}`).join(' ')} ${associatedComponentIds(record).map((id) => current.components.find((part) => part.id === id)?.name ?? '').join(' ')}`).includes(query));
  $('records-list').innerHTML = `<section class="panel"><div class="panel-heading"><h2>${records.length} fiche(s)</h2><span class="hint">Les fiches sans date restent accessibles en fin de liste</span></div>${recordsMarkup(records, current)}</section>`;
}
function renderComponents() {
  disposeComponentView?.(); disposeComponentView = null;
  const current = vehicle();
  if (!current) return;
  const mode = $('component-view-mode').value;
  $('component-scene-content').hidden = mode !== 'exploded';
  $('components-list').hidden = mode === 'exploded';
  if (section !== 'composants') { $('component-scene-content').replaceChildren(); return; }
  const query = searchText($('component-search').value), filter = $('component-status').value;
  const rows = knownComponents(current).filter((part) => {
    const life = componentLife(current, part);
    return searchText(`${part.name} ${part.group} ${part.description} ${part.notes}`).includes(query) && (filter === 'all' || (filter === 'attention' ? ['soon', 'due'].includes(life.status) : life.status === filter));
  });
  if (mode === 'exploded') {
    if (!sceneStates.has(current.id)) sceneStates.set(current.id, newSceneState());
    disposeComponentView = renderComponentView($('component-scene-content'), rows, current, sceneStates.get(current.id));
    return;
  }
  $('component-scene-content').replaceChildren();
  $('components-list').innerHTML = rows.length ? rows.map((part) => {
    const life = componentLife(current, part);
    return `<article class="panel component-card"><div class="component-top"><div><p class="component-category">${esc(part.group || 'Non classé')}</p><button type="button" class="component-name" data-component="${part.id}">${esc(part.name)}</button></div>${icon('parts')}</div>${pill(life)}<p class="hint">${esc(spatialLabel(part.spatial))}</p>${!part.stored ? '<p class="component-inferred">Repéré dans l’historique</p>' : ''}<div class="reference-track"${life.percent === null ? '' : ` role="meter" aria-label="Repère restant pour ${esc(part.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${life.percent}"`}><span style="width:${life.percent ?? 0}%"></span></div><p class="component-reading">${esc(remaining(life))}</p><div class="component-last">Dernier remplacement${life.last ? `<button type="button" data-record="${life.last.id}">${esc(dateText(life.last.date))} · ${mileage(life.last.odometer)}<br>${esc(life.last.title)} ↗</button>` : '<p>Non renseigné</p>'}</div></article>`;
  }).join('') : empty('Aucun composant dans cette sélection', 'Ajoutez une pièce ou ajustez les filtres.', 'new-component', 'Ajouter un composant');
}
function renderExpenses() {
  const current = vehicle();
  if (!current) return;
  const period = $('expense-year').value || today().slice(0, 4);
  const scope = $('expense-scope').value;
  const stats = vehicleStats(current, period, scope);
  const caption = period === 'all' ? 'Tout l’historique' : period === 'undated' ? 'Fiches sans date' : `En ${period}`;
  const categories = stats.categories.filter((one) => one.total !== 0);
  $('expense-content').innerHTML = `<section class="panel expense-hero"><p class="eyebrow">${caption.toLocaleUpperCase('fr')}</p><h2 class="stat-label">${stats.incomplete ? 'Sous-total des montants connus' : 'Dépenses enregistrées'}</h2><p class="stat-value">${euros(stats.amount)}</p><p class="hint">${stats.count} fiche(s)${stats.incomplete ? ` · ${stats.incomplete} total(aux) inconnu(s)` : ''}. Les événements prévus sont exclus.</p></section><div class="stat-grid"><section class="panel stat-card"><p class="stat-label">Pièces</p><p class="stat-value">${euros(stats.partsAmount)}</p><p class="stat-foot">Ventilation connue</p></section><section class="panel stat-card"><p class="stat-label">Main-d’œuvre</p><p class="stat-value">${euros(stats.laborAmount)}</p><p class="stat-foot">Ventilation connue</p></section><section class="panel stat-card"><p class="stat-label">Prestations, forfaits et frais</p><p class="stat-value">${euros(stats.otherAmount)}</p><p class="stat-foot">Montants détaillés connus</p></section></div><section class="panel"><h2>Répartition par type</h2>${stats.breakdownIncomplete ? '<p class="hint">Certaines ventilations sont incomplètes. Un total de justificatif peut différer de la somme des lignes.</p>' : ''}${categories.length ? `<ul class="expense-bars">${categories.map((one) => `<li><div class="bar-heading"><span>${esc(typeLabel(one.type))}</span><strong>${euros(one.amount)}</strong></div><div class="expense-track" aria-hidden="true"><span style="width:${Math.min(100, Math.abs(one.total / (stats.total || 1) * 100))}%"></span></div></li>`).join('')}</ul>` : '<p class="hint">Aucun montant connu sur cette période.</p>'}</section>`;
}
const views = {
  garage: ['Votre véhicule, en un coup d’œil.', 'L’essentiel aujourd’hui. L’historique quand vous en avez besoin.'],
  interventions: ['Une histoire qui se conserve.', 'Interventions, documents et événements, reliés au véhicule.'],
  composants: ['Chaque pièce a son histoire.', 'Retrouvez les remplacements, les contrôles et les repères d’entretien.'],
  depenses: ['Savoir où va votre budget.', 'Les dépenses connues et les montants à compléter.'],
  statistiques: ['Le véhicule au fil du temps.', 'Kilométrage, rythme de roulage et dépenses, à partir des informations enregistrées.'],
};
let section = resolveSection(location.hash, navigation.section);

function rememberNavigation() {
  navigation.section = section;
  if (garage.activeId) navigation.filters[garage.activeId] = normalizeFilters({
    recordSearch: $('record-search').value, recordType: $('record-type').value,
    componentSearch: $('component-search').value, componentStatus: $('component-status').value, componentView: $('component-view-mode').value,
    expenseYear: $('expense-year').value, expenseScope: $('expense-scope').value,
    statisticsPeriod: $('statistics-period').value, statisticsScope: $('statistics-scope').value,
  }, today().slice(0, 4));
  try { writeNavigation(localStorage, navigationStorageKey, navigation); } catch { /* Optional UI context. */ }
}
function render() {
  const current = vehicle();
  document.body.dataset.section = section;
  $('view-title').textContent = views[section][0];
  $('view-description').textContent = views[section][1];
  for (const id of Object.keys(views)) $(`${id}-view`).hidden = id !== section;
  document.querySelectorAll('.workspace-nav a').forEach((link) => { if (link.hash === `#${section}`) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  $('vehicle-select').innerHTML = garage.vehicles.length ? garage.vehicles.map((one) => `<option value="${one.id}">${esc(one.name)}${one.example ? ' · exemple' : ''}</option>`).join('') : '<option>Aucun véhicule</option>';
  $('vehicle-select').value = garage.activeId;
  $('example-banner').hidden = !current?.example;
  $('trash-open').textContent = `Corbeille (${current?.trashedRecords?.length ?? 0})`;
  if ($('trash-dialog').open) renderTrash();
  if (!current) {
    for (const id of Object.keys(views)) $(`${id}-view`).hidden = true;
    $('garage-view').hidden = false;
    $('dashboard').innerHTML = empty('Votre garage commence ici.', 'Ajoutez un véhicule, puis ses interventions et ses composants.', 'new-vehicle', 'Ajouter un véhicule');
    return;
  }
  const filters = normalizeFilters(Object.hasOwn(navigation.filters, current.id) ? navigation.filters[current.id] : null, today().slice(0, 4));
  $('record-search').value = filters.recordSearch;
  $('component-search').value = filters.componentSearch;
  $('component-status').value = filters.componentStatus;
  $('component-view-mode').value = filters.componentView;
  $('expense-scope').value = filters.expenseScope;
  $('statistics-period').value = filters.statisticsPeriod;
  $('statistics-scope').value = filters.statisticsScope;
  const previousType = filters.recordType;
  const types = [...new Set([...Object.keys(TYPES), ...current.records.map((record) => record.type)])];
  $('record-type').innerHTML = '<option value="all">Tous les types</option>' + types.map((type) => `<option value="${esc(type)}">${esc(typeLabel(type))}</option>`).join('');
  $('record-type').value = types.includes(previousType) ? previousType : 'all';
  const previousYear = filters.expenseYear;
  const years = [...new Set([today().slice(0, 4), ...current.records.map((record) => record.date?.slice(0, 4)).filter(Boolean)])].sort().reverse();
  $('expense-year').innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('') + '<option value="undated">Sans date</option><option value="all">Tout l’historique</option>';
  $('expense-year').value = ['all', 'undated', ...years].includes(previousYear) ? previousYear : today().slice(0, 4);
  renderDashboard(current); renderRecords(); renderComponents(); renderExpenses();
  if (section === 'statistiques') renderStatistics($('statistics-content'), current, { period: filters.statisticsPeriod, scope: filters.statisticsScope });
  else $('statistics-content').replaceChildren();
  rememberNavigation();
}

const CORE = {
  garage: ['version', 'activeId', 'vehicles', 'documents'],
  document: ['id', 'name', 'mimeType', 'dataUrl', 'size', 'description'],
  vehicle: ['id', 'name', 'year', 'engine', 'odometer', 'odometerDate', 'example', 'notes', 'content', 'documents', 'components', 'records', 'trashedRecords'],
  component: ['id', 'name', 'group', 'description', 'intervalKm', 'intervalMonths', 'notes', 'content', 'documents', 'spatial'],
  record: ['id', 'title', 'type', 'status', 'date', 'odometer', 'partsAmount', 'laborAmount', 'totalAmount', 'componentIds', 'observedComponentIds', 'lines', 'notes', 'content', 'documents', 'fuel'],
  spatial: ['kind', 'zone', 'side', 'presenceOrigin'],
  fuel: ['litres', 'fullTank'],
  line: ['id', 'label', 'kind', 'amount', 'componentId', 'effect', 'description', 'notes', 'content', 'documents'],
};
const extrasOf = (entity, kind) => Object.fromEntries(Object.entries(entity ?? {}).filter(([name]) => !CORE[kind].includes(name)));
function extrasInput(input, kind) {
  let value;
  try { value = JSON.parse(input.value || '{}'); } catch { throw Error('Les données complémentaires doivent contenir un objet JSON valide.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((name) => CORE[kind].includes(name))) throw Error('Les données complémentaires doivent être un objet JSON sans champ réservé.');
  return value;
}
const editableBase = (entity, kind, extras) => ({ ...Object.fromEntries(Object.entries(entity ?? {}).filter(([name]) => CORE[kind].includes(name))), ...extras });
function extraMarkup(entity, kind) {
  const extra = extrasOf(entity, kind);
  return Object.keys(extra).length ? `<details class="supplemental"><summary>Autres informations conservées</summary><pre class="raw-data">${esc(JSON.stringify(extra, null, 2))}</pre></details>` : '';
}
function textMarkup(entity) {
  return `${entity.description ? `<h3>Description</h3><p class="detail-notes">${esc(entity.description)}</p>` : ''}${entity.notes ? `<h3>Notes</h3><p class="detail-notes">${esc(entity.notes)}</p>` : ''}${entity.content ? `<h3>Contenu de la fiche</h3><p class="detail-notes">${esc(entity.content)}</p>` : ''}`;
}
function documentsMarkup(documents) {
  if (!documents?.length) return '';
  return `<div class="document-list">${documents.map((doc) => {
    const token = uid(); downloadableDocuments.set(token, doc);
    const image = /^image\/(jpeg|png|gif|webp|avif)$/.test(doc.mimeType);
    return `<article class="document-card">${image ? `<img loading="lazy" src="${esc(doc.dataUrl)}" alt="${esc(doc.name)}">` : icon('parts')}<div><strong>${esc(doc.name)}</strong><p class="hint">${number(Math.ceil(doc.size / 1024))} Kio · ${esc(doc.mimeType)}</p>${doc.description ? `<p class="detail-notes">${esc(doc.description)}</p>` : ''}${extraMarkup(doc, 'document')}<button type="button" class="text-button" data-download="${token}">Télécharger le document</button></div></article>`;
  }).join('')}</div>`;
}
function showDialog(id) {
  closeMenus();
  for (const dialog of openDialogs()) if (dialog.id !== id) dialog.close();
  if (id === 'commands-dialog') { $('command-search').value = ''; filterCommands(); }
  if (!$(id).open) $(id).showModal();
  else { const heading = $(id).querySelector('h2'); heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}
function openCommands() {
  if (!$('commands-dialog').open) {
    const active = document.activeElement;
    commandReturnFocus = active?.closest('.tools-menu') ? document.querySelector('.tools-menu > summary') : active;
  }
  showDialog('commands-dialog');
  $('command-search').focus({ preventScroll: true });
}
$('commands-dialog').addEventListener('close', () => {
  if (openDialogs().length) return;
  const target = commandReturnFocus?.isConnected && commandReturnFocus.getClientRects().length ? commandReturnFocus : document.querySelector('.tools-menu > summary');
  target?.focus({ preventScroll: true });
});
function detailRecord(id, trashed = false) {
  const current = vehicle();
  const entry = trashed ? current?.trashedRecords?.find((one) => one.record.id === id) : null;
  const record = trashed ? entry?.record : current?.records.find((one) => one.id === id);
  if (!record) return;
  downloadableDocuments.clear();
  const cost = recordCost(record);
  const fuelDetail = record.type === 'fuel' || record.fuel ? `<dl class="detail-facts"><div><dt>Carburant ajouté</dt><dd>${record.fuel?.litres == null ? 'Non renseigné' : esc(record.fuel.litres.replace('.', ',')) + ' L'}</dd></div><div><dt>Plein complet</dt><dd>${record.fuel?.fullTank == null ? 'Non renseigné' : record.fuel.fullTank ? 'Oui' : 'Non · ajout partiel'}</dd></div></dl>${extraMarkup(record.fuel ?? {}, 'fuel')}` : '';
  $('detail-title').textContent = record.title;
  $('detail-eyebrow').textContent = `${typeLabel(record.type)}${record.status === 'done' ? '' : ' · ' + (record.status === 'planned' ? 'Prévu' : 'À compléter')}`;
  $('detail-content').innerHTML = `${trashed ? `<p class="reference-note">Dans la corbeille depuis le ${esc(new Date(entry.deletedAt).toLocaleString('fr-FR'))}. Cette fiche ne participe plus aux calculs.</p>` : ''}${fuelDetail}<dl class="detail-facts"><div><dt>Date</dt><dd>${esc(dateText(record.date))}</dd></div><div><dt>Kilométrage</dt><dd>${mileage(record.odometer)}</dd></div></dl><div class="detail-total"><span>${cost.incomplete ? 'Total inconnu' : 'Total'}</span><strong>${euros(cost.total)}</strong></div>${cost.incomplete && cost.subtotal !== null ? `<p class="hint">Sous-total connu : ${formatExactAmount(cost.subtotal)}</p>` : ''}${record.totalAmount !== null ? `<p class="hint">Montant indiqué sur le justificatif : ${formatExactAmount(record.totalAmount)}. Le détail peut être incomplet ou arrondi.</p>` : ''}${record.lines.length ? `<h3>Lignes de l’intervention</h3><div class="detail-lines">${record.lines.map((line) => `<article class="detail-line"><div class="bar-heading"><strong>${esc(line.label)}</strong><span>${formatExactAmount(line.amount)}</span></div><p class="hint">${LINE_TYPES[line.kind]}${line.componentId ? ' · ' + esc(current.components.find((part) => part.id === line.componentId)?.name) + ' · ' + EFFECTS[line.effect] : ''}</p>${textMarkup(line)}${documentsMarkup(line.documents)}${extraMarkup(line, 'line')}</article>`).join('')}</div>` : `<dl class="detail-facts"><div><dt>Pièces</dt><dd>${formatExactAmount(record.partsAmount)}</dd></div><div><dt>Main-d’œuvre / prestation</dt><dd>${formatExactAmount(record.laborAmount)}</dd></div></dl>`}<h3>Composants associés</h3><div class="part-links">${associatedComponentIds(record).map((partId) => `<button type="button" class="ghost-button" data-component="${partId}">${esc(current.components.find((part) => part.id === partId)?.name)}</button>`).join('') || '<p class="hint">Aucun composant associé.</p>'}</div>${textMarkup(record)}${documentsMarkup(record.documents)}${extraMarkup(record, 'record')}<div class="dialog-actions record-detail-actions">${trashed ? `<button class="ghost-button" type="button" data-action="trash">Retour à la corbeille</button><button class="primary-button" type="button" data-restore-record="${record.id}">Restaurer la fiche</button>` : `<button class="ghost-button danger-text" type="button" data-trash-record="${record.id}">Mettre à la corbeille</button><button class="primary-button" type="button" data-edit-record="${record.id}">Modifier la fiche</button>`}</div>`;
  showDialog('detail-dialog');
}

function renderTrash() {
  const current = vehicle();
  const entries = [...current?.trashedRecords ?? []].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  $('trash-description').textContent = `${current?.name ?? 'Aucun véhicule'} · ${entries.length} fiche(s) dans la corbeille`;
  $('trash-list').innerHTML = entries.length ? entries.map(({ record, deletedAt }) => `<article class="trash-record"><h3><button type="button" class="record-title" data-trashed-record="${record.id}">${esc(record.title)}</button></h3><p class="hint">${esc(typeLabel(record.type))} · ${esc(dateText(record.date))} · ${mileage(record.odometer)}</p><p class="hint">Mis à la corbeille le ${esc(new Date(deletedAt).toLocaleString('fr-FR'))}</p><div class="trash-record-actions"><button type="button" class="primary-button" data-restore-record="${record.id}">Restaurer</button><button type="button" class="text-button danger-text" data-discard-record="${record.id}">Supprimer définitivement</button></div></article>`).join('') : '<div class="trash-empty"><h3>La corbeille est vide.</h3><p class="hint">Les fiches supprimées apparaîtront ici avec leurs lignes et documents.</p></div>';
}
function openTrash() { renderTrash(); showDialog('trash-dialog'); }
async function changeRecord(id, restore = false) {
  if (changingRecord || saving) return;
  changingRecord = true;
  const inDetail = $('detail-dialog').open;
  try {
    await save((restore ? restoreTrashedRecord : moveRecordToTrash)(garage, garage.activeId, id));
    if (inDetail) {
      if (restore) detailRecord(id);
      else { $('detail-dialog').close(); downloadableDocuments.clear(); (section === 'interventions' ? $('trash-open') : $('view-title')).focus(); }
    }
    if (restore && !inDetail && $('trash-dialog').open) { $('trash-title').tabIndex = -1; $('trash-title').focus(); }
    announce(unsaved ? 'La copie ouverte a été modifiée. Exportez-la avant de quitter : l’enregistrement local a échoué.' : restore ? 'Fiche restaurée avec ses lignes et documents.' : 'Fiche placée dans la corbeille. Elle peut être restaurée depuis Interventions → Corbeille.');
  } catch (error) { announce(error.message); }
  finally { changingRecord = false; }
}
function confirmDiscard(id) {
  const record = vehicle()?.trashedRecords?.find((entry) => entry.record.id === id)?.record;
  if (!record || saving || changingRecord) return;
  pendingDiscard = { vehicleId: garage.activeId, recordId: id };
  $('discard-description').textContent = `« ${record.title} » et ses documents seront retirés de ce garage. Cette action ne peut pas être annulée dans Garapp. Les copies JSON et les anciennes versions Drive déjà conservées ne sont pas modifiées.`;
  $('discard-error').hidden = true;
  showDialog('discard-dialog');
  $('discard-cancel').focus();
}
$('discard-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingDiscard || changingRecord || saving) return;
  const target = pendingDiscard;
  changingRecord = true; $('discard-confirm').disabled = true;
  try {
    await save(discardTrashedRecord(garage, target.vehicleId, target.recordId));
    $('discard-dialog').close(); pendingDiscard = null;
    downloadableDocuments.clear(); $('detail-content').replaceChildren();
    openTrash();
    announce(unsaved ? 'Suppression dans la copie ouverte uniquement. L’enregistrement local a échoué ; exportez la copie avant de quitter.' : 'Fiche supprimée définitivement de ce garage.');
  } catch (error) { $('discard-error').textContent = error.message; $('discard-error').hidden = false; }
  finally { changingRecord = false; $('discard-confirm').disabled = false; }
});
$('discard-dialog').addEventListener('close', () => { pendingDiscard = null; });
function detailComponent(id) {
  const current = vehicle(); const part = current && (knownComponents(current).find((one) => one.id === id) ?? current.components.find((one) => one.id === id));
  if (!part) return;
  downloadableDocuments.clear();
  const life = componentLife(current, part);
  $('detail-title').textContent = part.name;
  $('detail-eyebrow').textContent = part.group || 'Non classé';
  $('detail-content').innerHTML = `<p class="hint">${esc(COMPONENT_KINDS[componentSpatial(part).kind])} · ${esc(spatialLabel(componentSpatial(part)))}</p>${pill(life)}<p class="hint">${esc(remaining(life))}</p><dl class="detail-facts"><div><dt>Intervalle choisi</dt><dd>${[part.intervalKm ? `${number(part.intervalKm)} km` : '', part.intervalMonths ? `${part.intervalMonths} mois` : ''].filter(Boolean).join(' ou ') || 'Non renseigné'}</dd></div><div><dt>Dernier remplacement</dt><dd>${life.last ? esc(dateText(life.last.date)) : 'Non renseigné'}</dd></div></dl>${textMarkup(part)}${documentsMarkup(part.documents)}${extraMarkup(current.components.find((one)=>one.id===id) ?? {}, 'component')}${extraMarkup(part.spatial ?? {}, 'spatial')}<h3>Interventions et contrôles associés</h3>${recordsMarkup([...new Map([...(part.sources ?? []), ...componentHistory(current, id)].map((record) => [record.id, record])).values()], current)}<div class="dialog-actions"><button class="ghost-button" type="button" data-edit-component="${part.id}">${current.components.some((one)=>one.id===id) ? 'Modifier le composant' : 'Enregistrer et préciser'}</button>${current.components.some((one)=>one.id===id) ? `<button class="primary-button" type="button" data-replace="${part.id}">Enregistrer un remplacement</button>` : ''}</div>`;
  showDialog('detail-dialog');
}
function detailVehicle() {
  const current = vehicle(); if (!current) return openVehicle();
  downloadableDocuments.clear();
  $('detail-title').textContent = current.name;
  $('detail-eyebrow').textContent = 'VÉHICULE';
  $('detail-content').innerHTML = `<dl class="detail-facts"><div><dt>Motorisation</dt><dd>${esc(current.engine || 'Non renseignée')}</dd></div><div><dt>Année</dt><dd>${current.year ?? 'Non renseignée'}</dd></div><div><dt>Kilométrage courant</dt><dd>${mileage(current.odometer)}</dd></div><div><dt>Date du relevé</dt><dd>${esc(dateText(current.odometerDate))}</dd></div></dl>${textMarkup(current)}${documentsMarkup(current.documents)}${extraMarkup(current, 'vehicle')}<p class="hint">Les relevés historiques sont conservés dans l’historique, sous le type « Relevé kilométrique ».</p><div class="dialog-actions"><button class="primary-button" type="button" data-action="edit-vehicle">Modifier le véhicule</button></div>`;
  showDialog('detail-dialog');
}

function setDocumentDraft(owner, documents = []) {
  for (const key of documentExtraDrafts.keys()) if (key.startsWith(owner + '/')) documentExtraDrafts.delete(key);
  documentDrafts.set(owner, { documents: structuredClone(documents) });
}
function documentEditor(owner) {
  const draft = documentDrafts.get(owner);
  return `<fieldset class="document-editor"><legend>Documents</legend><label>Ajouter des fichiers<input type="file" multiple data-document-owner="${owner}"></label><p class="hint">Fichiers intégrés à la sauvegarde, jusqu’à 64 Mio par fichier.</p><div class="draft-documents">${draft.documents.map((doc) => `<article class="draft-document"><label>Nom du fichier<input data-doc-name="${doc.id}" data-owner="${owner}" value="${esc(doc.name)}" required></label><label>Description<textarea rows="2" data-doc-description="${doc.id}" data-owner="${owner}">${esc(doc.description)}</textarea></label><p class="hint">${number(Math.ceil(doc.size / 1024))} Kio · ${esc(doc.mimeType)}</p><button type="button" class="text-button" data-draft-download="${doc.id}" data-owner="${owner}">Télécharger ce fichier</button><details class="supplemental"><summary>Autres données du document</summary><label>Données du document (JSON)<textarea data-doc-extras="${doc.id}" data-owner="${owner}" rows="3" spellcheck="false">${esc(documentExtraDrafts.get(owner + '/' + doc.id) ?? JSON.stringify(extrasOf(doc, 'document'), null, 2))}</textarea></label></details><button type="button" class="text-button" data-remove-document="${doc.id}" data-owner="${owner}">Retirer ce fichier</button></article>`).join('')}</div></fieldset>`;
}
function refreshDocuments(owner) {
  const container = owner.startsWith('line-') ? document.querySelector(`[data-line-id="${owner.slice(5)}"] .line-documents`) : $(`${owner}-documents`);
  if (container) container.innerHTML = documentEditor(owner);
}
function collectDocuments(owner) {
  const docs = documentDrafts.get(owner).documents;
  return docs.map((doc) => {
    const input = document.querySelector(`[data-doc-extras="${doc.id}"][data-owner="${owner}"]`);
    return input ? { ...editableBase(doc, 'document', extrasInput(input, 'document')) } : doc;
  });
}
function readCommon(form, kind) {
  return { notes: form.elements.notes.value, content: form.elements.content.value, documents: collectDocuments(kind) };
}
function prepareForm(kind, entity, defaults = {}) {
  const form = $(`${kind}-form`);
  form.reset();
  form.querySelector('.form-error').hidden = true;
  form.querySelectorAll('input').forEach((input) => input.setCustomValidity(''));
  for (const [name, value] of Object.entries({ ...defaults, ...entity })) {
    const input = form.elements.namedItem(name);
    if (input && !['componentIds', 'lines', 'documents'].includes(name)) input.value = value ?? '';
  }
  form.elements.extras.value = JSON.stringify(extrasOf(entity, kind), null, 2);
  setDocumentDraft(kind, entity?.documents);
  refreshDocuments(kind);
  return form;
}
function openVehicle(edit = false) {
  const current = edit ? vehicle() : null;
  editingVehicle = current?.id ?? null;
  prepareForm('vehicle', current ?? {}, { year: '', name: '', engine: '', odometer: '', odometerDate: '', notes: '', content: '' });
  $('vehicle-dialog-title').textContent = current ? 'Modifier le véhicule' : 'Ajouter un véhicule';
  showDialog('vehicle-dialog');
}
function lineEditor(line) {
  const options = (entries, selected) => Object.entries(entries).map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`).join('');
  return `<article class="line-editor" data-line-id="${line.id}"><div class="form-grid"><label class="full-width">Libellé de la ligne<input data-line-field="label" required value="${esc(line.label)}"></label><label>Nature<select data-line-field="kind">${options(LINE_TYPES, line.kind)}</select></label><label>Montant TTC de la ligne (€)<input data-line-field="amount" inputmode="decimal" placeholder="Inconnu" value="${esc(line.amount)}"></label><label>Composant concerné<select data-line-field="componentId"><option value="">Aucun</option>${vehicle().components.map((part) => `<option value="${part.id}"${part.id === line.componentId ? ' selected' : ''}>${esc(part.name)}</option>`).join('')}<option value="__new__">Créer un composant…</option></select></label><label>Action sur le composant<select data-line-field="effect">${options(EFFECTS, line.effect)}</select></label><div class="full-width line-new-component" hidden><label>Nom du nouveau composant<input data-line-field="componentName" maxlength="2000" placeholder="Ex. Capteur de pression arrière gauche"></label><p class="hint">Le composant sera créé avec la fiche. Son type et sa position pourront ensuite être précisés.</p></div><label class="full-width">Description de la ligne<textarea data-line-field="description" rows="2">${esc(line.description)}</textarea></label><details class="full-width supplemental"><summary>Notes, documents et autres informations de la ligne</summary><div class="form-grid"><label class="full-width">Notes de la ligne<textarea data-line-field="notes" rows="2">${esc(line.notes)}</textarea></label><label class="full-width">Contenu de la fiche de ligne<textarea data-line-field="content" rows="2">${esc(line.content)}</textarea></label><div class="full-width line-documents">${documentEditor('line-' + line.id)}</div><label class="full-width">Autres données de la ligne (JSON)<textarea data-line-field="extras" rows="3" spellcheck="false">${esc(JSON.stringify(extrasOf(line, 'line'), null, 2))}</textarea></label></div></details></div><button type="button" class="text-button" data-remove-line="${line.id}">Retirer cette ligne</button></article>`;
}
function lineFields(line) {
  return { id: line.id ?? uid(), label: '', kind: 'unclassified', amount: null, componentId: null, effect: 'none', description: '', notes: '', content: '', documents: [], ...line };
}
function appendLine(line = {}) {
  const value = lineFields(line);
  editingLines.push(value);
  setDocumentDraft('line-' + value.id, value.documents);
  $('line-editors').insertAdjacentHTML('beforeend', lineEditor(value));
  $('summary-costs').hidden = true;
  $('record-lines-details').open = true;
}
function refreshDiscoveries() {
  if (!vehicle()) return;
  const remembered = new Map([...$('record-discoveries').querySelectorAll('[data-discovery-key]')].map((row) => [row.dataset.discoveryKey, { checked: row.querySelector('input').checked, effect: row.querySelector('[data-discovery-effect]').value, target: row.querySelector('[data-discovery-target]').value }]));
  const form = $('record-form');
  const draft = { title: form.elements.title.value, componentIds: new FormData(form).getAll('componentIds'), observedComponentIds: new FormData(form).getAll('observedComponentIds'), lines: [...$('line-editors').querySelectorAll('[data-line-id]')].map((row) => ({ label: row.querySelector('[data-line-field="label"]').value, kind: row.querySelector('[data-line-field="kind"]').value, effect: row.querySelector('[data-line-field="effect"]').value, componentId: row.querySelector('[data-line-field="componentId"]').value || null })) };
  discoveryCandidates = form.elements.type.value === 'fuel' ? [] : proposedDiscoveries(vehicle(), draft);
  $('record-discoveries').innerHTML = discoveryCandidates.map((candidate, index) => {
    const previous = remembered.get(candidate.key), checked = previous?.checked ?? !candidate.ambiguous;
    const target = previous?.target ?? candidate.targetId ?? (candidate.ambiguous ? '' : '__new__');
    return `<div class="component-discovery" data-discovery-key="${candidate.key}"><input id="discovery-${index}" type="checkbox"${checked ? ' checked' : ''}><label for="discovery-${index}">${esc(candidate.name)}<small>${esc(spatialLabel(candidate.spatial))}${candidate.ambiguous ? ' · correspondance à préciser' : candidate.targetId ? ' · composant existant' : ' · nouveau composant'}</small></label><div><label class="sr-only" for="discovery-target-${index}">Composant pour ${esc(candidate.name)}</label><select id="discovery-target-${index}" data-discovery-target><option value="">Choisir un composant</option>${vehicle().components.map((part) => `<option value="${part.id}"${part.id === target ? ' selected' : ''}>${esc(part.name)}</option>`).join('')}<option value="__new__"${target === '__new__' ? ' selected' : ''}>Créer un composant</option></select><label class="sr-only" for="discovery-effect-${index}">Action sur ${esc(candidate.name)}</label><select id="discovery-effect-${index}" data-discovery-effect>${Object.entries(EFFECTS).map(([value, label]) => `<option value="${value}"${value === (previous?.effect ?? candidate.effect) ? ' selected' : ''}>${label}</option>`).join('')}</select></div></div>`;
  }).join('') || '<p class="hint">Aucun nouveau composant reconnu. Les lignes permettent aussi de créer un composant avec un nom libre.</p>';
}
function readDiscoveryChoices() {
  const choices = [...$('record-discoveries').querySelectorAll('[data-discovery-key]')].filter((row) => row.querySelector('input').checked).map((row) => {
    const candidate = discoveryCandidates.find((candidate) => candidate.key === row.dataset.discoveryKey);
    const target = row.querySelector('[data-discovery-target]').value;
    if (!target) throw Error(`Choisir le composant correspondant à « ${candidate.name} », ou décocher cette proposition.`);
    return { ...candidate, targetId: target === '__new__' ? null : target, forceNew: target === '__new__', effect: row.querySelector('[data-discovery-effect]').value };
  });
  for (const row of $('line-editors').querySelectorAll('[data-line-id]')) {
    if (row.querySelector('[data-line-field="componentId"]').value !== '__new__') continue;
    const name = row.querySelector('[data-line-field="componentName"]').value.trim();
    if (!name) throw Error('Renseigner le nom du nouveau composant.');
    const detected = detectComponents(name)[0];
    choices.push({ name, group: detected?.group ?? '', spatial: inferSpatial(name), effect: row.querySelector('[data-line-field="effect"]').value, lineId: row.dataset.lineId });
  }
  return choices;
}
$('record-form').addEventListener('input', (event) => { if (event.target.name === 'title' || event.target.dataset.lineField === 'label') refreshDiscoveries(); });
$('record-form').addEventListener('change', (event) => {
  if (event.target.dataset.lineField === 'componentId') {
    const row = event.target.closest('[data-line-id]'), active = event.target.value === '__new__';
    row.querySelector('.line-new-component').hidden = !active;
    const name = row.querySelector('[data-line-field="componentName"]'); name.required = active;
    if (active && !name.value) name.value = row.querySelector('[data-line-field="label"]').value;
  }
  if (event.target.name === 'componentIds' || event.target.name === 'observedComponentIds' || event.target.name === 'type' || ['componentId', 'kind', 'effect'].includes(event.target.dataset.lineField)) refreshDiscoveries();
});
function openRecord(componentId = null, id = null) {
  if (!vehicle()) return openVehicle();
  const record = vehicle().records.find((one) => one.id === id);
  editingRecord = record?.id ?? null;
  $('record-discoveries').replaceChildren(); discoveryCandidates = [];
  const types = [...new Set([...Object.keys(TYPES), ...(record ? [record.type] : [])])];
  $('record-form-type').innerHTML = types.map((type) => `<option value="${esc(type)}">${esc(typeLabel(type))}</option>`).join('');
  const form = prepareForm('record', record ?? {}, { title: '', type: 'revision', status: 'done', date: today(), odometer: vehicle().odometer, partsAmount: '', laborAmount: '', totalAmount: '', notes: '', content: '' });
  $('record-dialog-title').textContent = record ? 'Modifier la fiche' : 'Ajouter une intervention ou un événement';
  const selected = record?.componentIds ?? (componentId ? [componentId] : []);
  $('record-components').innerHTML = vehicle().components.length ? vehicle().components.map((part) => `<label><input type="checkbox" name="componentIds" value="${part.id}"${selected.includes(part.id) ? ' checked' : ''}>${esc(part.name)}</label>`).join('') : '<p class="hint">Aucun composant renseigné.</p>';
  const observed = record?.observedComponentIds ?? [];
  $('record-observed-components').innerHTML = vehicle().components.map((part) => `<label><input type="checkbox" name="observedComponentIds" value="${part.id}"${observed.includes(part.id) ? ' checked' : ''}>${esc(part.name)}</label>`).join('') || '<p class="hint">Les composants repérés ci-dessous seront ajoutés à l’enregistrement.</p>';
  editingLines = []; $('line-editors').innerHTML = '';
  for (const owner of [...documentDrafts.keys()]) if (owner.startsWith('line-')) documentDrafts.delete(owner);
  $('summary-costs').hidden = false;
  $('record-lines-details').open = false;
  for (const line of record?.lines ?? []) appendLine(line);
  form.elements.fuelLitres.value = record?.fuel?.litres ?? '';
  form.elements.fuelFullTank.value = record?.fuel?.fullTank == null ? '' : String(record.fuel.fullTank);
  form.elements.fuelExtras.value = JSON.stringify(extrasOf(record?.fuel, 'fuel'), null, 2);
  updateFuelFields();
  refreshDiscoveries();
  form.querySelector('[type="submit"]').textContent = 'Enregistrer la fiche';
  showDialog('record-dialog');
}
function updateFuelFields() {
  const form = $('record-form'), fuel = form.elements.type.value === 'fuel';
  $('record-fuel').hidden = !fuel;
  $('summary-costs').hidden = editingLines.length > 0 || fuel && form.elements.partsAmount.value === '' && form.elements.laborAmount.value === '';
  $('record-components-fieldset').hidden = fuel && !form.querySelector('[name="componentIds"]:checked');
}
$('record-form-type').addEventListener('change', updateFuelFields);
function readFuel(form, original) {
  if (form.elements.type.value !== 'fuel' && original.fuel === undefined) return {};
  let litres;
  try { litres = amountInput(form.elements.fuelLitres.value); }
  catch { throw Error('Saisissez une quantité décimale en litres, ou laissez-la inconnue.'); }
  if (litres !== null && (Number(litres) <= 0 || Number(litres) > 10000)) throw Error('La quantité de carburant doit être positive et ne pas dépasser 10 000 litres.');
  return { fuel: { ...extrasInput(form.elements.fuelExtras, 'fuel'), litres, fullTank: form.elements.fuelFullTank.value === '' ? null : form.elements.fuelFullTank.value === 'true' } };
}
function readLines() {
  return [...$('line-editors').querySelectorAll('[data-line-id]')].map((element) => {
    const original = editingLines.find((line) => line.id === element.dataset.lineId);
    const field = (name) => element.querySelector(`[data-line-field="${name}"]`);
    return { ...editableBase(original, 'line', extrasInput(field('extras'), 'line')), id: original.id, label: field('label').value, kind: field('kind').value, amount: amountInput(field('amount').value), componentId: field('componentId').value === '__new__' ? null : field('componentId').value || null, effect: field('effect').value, description: field('description').value, notes: field('notes').value, content: field('content').value, documents: collectDocuments('line-' + original.id) };
  });
}
function openComponent(id = null) {
  if (!vehicle()) return openVehicle();
  const stored = vehicle().components.find((one) => one.id === id);
  const inferred = id ? knownComponents(vehicle()).find((one) => one.id === id) : null;
  const part = stored ?? (inferred ? { name: inferred.name, group: inferred.group, spatial: inferred.spatial, notes: '', content: '', documents: [], description: '', intervalKm: null, intervalMonths: null } : null);
  editingComponent = stored?.id ?? null;
  editingEvidenceSources = inferred?.sources.map((record) => record.id) ?? [];
  const form = prepareForm('component', part ?? {}, { name: '', group: '', intervalKm: '', intervalMonths: '', description: '', notes: '', content: '' });
  const spatial = inferred?.spatial ?? componentSpatial(part ?? {});
  for (const [field, entries, value] of [['spatialKind', COMPONENT_KINDS, spatial.kind], ['spatialZone', COMPONENT_ZONES, spatial.zone], ['spatialSide', COMPONENT_SIDES, spatial.side]]) form.elements[field].innerHTML = Object.entries(entries).map(([key, label]) => `<option value="${key}"${key === value ? ' selected' : ''}>${label}</option>`).join('');
  form.elements.spatialExtras.value = JSON.stringify(extrasOf(part?.spatial, 'spatial'), null, 2);
  $('component-dialog-title').textContent = stored ? 'Modifier le composant' : inferred ? 'Enregistrer le composant repéré' : 'Ajouter un composant';
  showDialog('component-dialog');
}
function openGarage() {
  const form = $('garage-form');
  form.reset(); form.querySelector('.form-error').hidden = true;
  form.elements.extras.value = JSON.stringify(extrasOf(garage, 'garage'), null, 2);
  setDocumentDraft('garage', garage.documents); refreshDocuments('garage');
  showDialog('garage-dialog');
}
function download(blob, name) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.hidden = true; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function exportGarage(options) { backups.export(options); }
function downloadDocument(token, draftDocument = null) {
  const doc = draftDocument ?? downloadableDocuments.get(token); if (!doc) return;
  const binary = atob(doc.dataUrl.slice(doc.dataUrl.indexOf(',') + 1));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  download(new Blob([bytes], { type: doc.mimeType }), doc.name.replace(/[\\/]/g, '_'));
}
const nullableNumber = (value) => value === '' ? null : Number(value);
async function submitForm(form, build) {
  if (form.dataset.saving || form.dataset.loadingDocuments) return;
  if (!form.reportValidity()) return;
  form.dataset.saving = 'true';
  const button = form.querySelector('[type="submit"]'); button.disabled = true;
  const errorBox = form.querySelector('.form-error'); errorBox.hidden = true;
  try { await save(build()); form.closest('dialog').close(); announce(unsaved ? 'La copie ouverte a été modifiée. Exportez-la avant de quitter.' : 'Modifications enregistrées sur cet appareil.'); }
  catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
  finally { delete form.dataset.saving; button.disabled = false; }
}
$('vehicle-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  void submitForm(form, () => {
    const next = structuredClone(garage);
    const index = next.vehicles.findIndex((one) => one.id === editingVehicle);
    const original = next.vehicles[index] ?? { id: uid(), example: false, components: [], records: [] };
    const updated = { ...editableBase(original, 'vehicle', extrasInput(form.elements.extras, 'vehicle')), name: form.elements.name.value, year: nullableNumber(form.elements.year.value), engine: form.elements.engine.value, odometer: nullableNumber(form.elements.odometer.value), odometerDate: form.elements.odometerDate.value || null, ...readCommon(form, 'vehicle') };
    if (index < 0) next.vehicles.push(updated); else next.vehicles[index] = updated;
    next.activeId = updated.id; return next;
  });
});
$('record-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  void submitForm(form, () => {
    const next = structuredClone(garage); const current = next.vehicles.find((one) => one.id === next.activeId);
    const index = current.records.findIndex((one) => one.id === editingRecord);
    const original = current.records[index] ?? { id: uid() };
    const updated = { ...editableBase(original, 'record', extrasInput(form.elements.extras, 'record')), title: form.elements.title.value, type: form.elements.type.value, status: form.elements.status.value, date: form.elements.date.value || null, odometer: nullableNumber(form.elements.odometer.value), partsAmount: amountInput(form.elements.partsAmount.value), laborAmount: amountInput(form.elements.laborAmount.value), totalAmount: amountInput(form.elements.totalAmount.value), componentIds: new FormData(form).getAll('componentIds'), observedComponentIds: new FormData(form).getAll('observedComponentIds'), lines: readLines(), ...readCommon(form, 'record'), ...readFuel(form, original) };
    const resolved = applyDiscoveries(current, updated, readDiscoveryChoices());
    current.components = resolved.components;
    if (index < 0) current.records.push(resolved.record); else current.records[index] = resolved.record;
    return next;
  });
});
$('component-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  void submitForm(form, () => {
    const next = structuredClone(garage); const current = next.vehicles.find((one) => one.id === next.activeId);
    const index = current.components.findIndex((one) => one.id === editingComponent);
    const original = current.components[index] ?? { id: uid() };
    const updated = { ...editableBase(original, 'component', extrasInput(form.elements.extras, 'component')), name: form.elements.name.value, group: form.elements.group.value, description: form.elements.description.value, intervalKm: nullableNumber(form.elements.intervalKm.value), intervalMonths: nullableNumber(form.elements.intervalMonths.value), ...readCommon(form, 'component'), spatial: { ...extrasInput(form.elements.spatialExtras, 'spatial'), kind: form.elements.spatialKind.value, zone: form.elements.spatialZone.value, side: form.elements.spatialSide.value, presenceOrigin: original.spatial?.presenceOrigin ?? (index >= 0 ? 'manual' : editingEvidenceSources.length ? 'record' : 'manual') } };
    if (index < 0) current.components.push(updated); else current.components[index] = updated;
    for (const record of current.records) if (editingEvidenceSources.includes(record.id) && !associatedComponentIds(record).includes(updated.id)) record.observedComponentIds = [...record.observedComponentIds ?? [], updated.id];
    return next;
  });
});
$('garage-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  void submitForm(form, () => ({ ...editableBase(garage, 'garage', extrasInput(form.elements.extras, 'garage')), documents: collectDocuments('garage') }));
});
$('add-line').addEventListener('click', () => { appendLine(); refreshDiscoveries(); $('line-editors').lastElementChild.querySelector('input').focus(); });

async function readDocument(file) {
  if (file.size > MAX_DOCUMENT_BYTES) throw Error(`Le fichier ${file.name} dépasse 64 Mio.`);
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error(`Lecture impossible : ${file.name}`)); reader.readAsDataURL(file); });
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
  return validateDocument({ id: uid(), name: file.name, mimeType, size: file.size, dataUrl, description: '' });
}
document.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-document-owner]'); if (!input) return;
  const owner = input.dataset.documentOwner; const draft = documentDrafts.get(owner);
  const files = [...input.files]; input.value = ''; if (!files.length) return;
  const form = input.closest('form'); const button = form.querySelector('[type="submit"]');
  form.dataset.loadingDocuments = String(Number(form.dataset.loadingDocuments || 0) + 1); button.disabled = true;
  try { const documents = await Promise.all(files.map(readDocument)); if (documentDrafts.get(owner) === draft) { draft.documents.push(...documents); refreshDocuments(owner); } }
  catch (error) { const box = form.querySelector('.form-error'); box.textContent = error.message; box.hidden = false; }
  finally { const count = Number(form.dataset.loadingDocuments) - 1; if (count > 0) form.dataset.loadingDocuments = String(count); else { delete form.dataset.loadingDocuments; button.disabled = false; } }
});
document.addEventListener('input', (event) => {
  const input = event.target;
  if (input.dataset.docExtras) documentExtraDrafts.set(input.dataset.owner + '/' + input.dataset.docExtras, input.value);
  if (input.dataset.docName || input.dataset.docDescription) {
    const doc = documentDrafts.get(input.dataset.owner)?.documents.find((one) => one.id === (input.dataset.docName || input.dataset.docDescription));
    if (doc) doc[input.dataset.docName ? 'name' : 'description'] = input.value;
  }
});
const actions = {
  'new-vehicle': () => openVehicle(), 'edit-vehicle': () => openVehicle(true), 'vehicle-details': detailVehicle,
  'new-record': () => openRecord(), 'new-component': () => openComponent(), 'garage-details': openGarage,
  trash: openTrash,
  'new-fuel': () => {
    if (!vehicle()) return openVehicle();
    openRecord();
    const form = $('record-form');
    form.elements.title.value = 'Plein de carburant'; form.elements.type.value = 'fuel'; form.elements.odometer.value = '';
    $('record-dialog-title').textContent = 'Ajouter du carburant'; updateFuelFields(); form.elements.fuelLitres.focus();
  },
  'new-reading': () => {
    if (!vehicle()) return openVehicle();
    openRecord();
    const form = $('record-form');
    form.elements.title.value = 'Relevé kilométrique'; form.elements.type.value = 'reading'; form.elements.odometer.value = '';
    $('record-dialog-title').textContent = 'Ajouter un relevé kilométrique'; form.elements.odometer.focus();
  },
  commands: openCommands, backups: () => { backups.open(); void drive.prepare(); }, export: () => { try { exportGarage(); } catch { /* The backup panel reports export errors. */ } },
  import: () => $('backup-file').click(), 'backup-create': () => backups.create(), 'backup-open': () => backups.chooseExisting(),
  'backup-write': () => backups.write(), 'backup-unlink': () => backups.unlink(), print: () => window.print(), reload: () => location.reload(),
};
document.addEventListener('click', (event) => {
  const target = event.target;
  const close = target.closest('[data-close]'); if (close) return close.closest('dialog').close();
  const action = target.closest('[data-action]'); if (action) { closeMenus(); if (action.closest('#commands-dialog')) $('commands-dialog').close(); return actions[action.dataset.action]?.(); }
  for (const [attribute, handler] of [
    ['data-edit-record', (id) => openRecord(null, id)], ['data-edit-component', openComponent], ['data-record', detailRecord], ['data-component', detailComponent], ['data-replace', (id) => openRecord(id)], ['data-download', downloadDocument],
    ['data-trashed-record', (id) => detailRecord(id, true)], ['data-trash-record', (id) => { void changeRecord(id); }], ['data-restore-record', (id) => { void changeRecord(id, true); }], ['data-discard-record', confirmDiscard],
  ]) { const element = target.closest(`[${attribute}]`); if (element) return handler(element.getAttribute(attribute)); }
  const removeLine = target.closest('[data-remove-line]');
  if (removeLine) { editingLines = editingLines.filter((line) => line.id !== removeLine.dataset.removeLine); documentDrafts.delete('line-' + removeLine.dataset.removeLine); removeLine.closest('[data-line-id]').remove(); $('summary-costs').hidden = editingLines.length > 0; refreshDiscoveries(); return; }
  const draftDownload = target.closest('[data-draft-download]');
  if (draftDownload) return downloadDocument(null, documentDrafts.get(draftDownload.dataset.owner).documents.find((doc) => doc.id === draftDownload.dataset.draftDownload));
  const removeDoc = target.closest('[data-remove-document]');
  if (removeDoc) { const draft = documentDrafts.get(removeDoc.dataset.owner); draft.documents = draft.documents.filter((doc) => doc.id !== removeDoc.dataset.removeDocument); refreshDocuments(removeDoc.dataset.owner); return; }
  const route = target.closest('[data-route]'); if (route) location.hash = route.dataset.route;
});
$('vehicle-select').addEventListener('change', async (event) => { rememberNavigation(); try { await save({ ...garage, activeId: event.target.value }); } catch (error) { announce(error.message); } });
$('layout-select').addEventListener('change', (event) => { preferences.layout = event.target.value; applyPreferences(); });
$('theme-toggle').addEventListener('click', () => { preferences.theme = { auto: 'light', light: 'dark', dark: 'auto' }[preferences.theme]; applyPreferences(); });
$('commands-open').addEventListener('click', openCommands);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('commands-dialog').open) { event.preventDefault(); $('commands-dialog').close(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!openDialogs().some((dialog) => dialog.querySelector('form'))) openCommands(); }
});
for (const id of ['record-search', 'record-type']) $(id).addEventListener(id.endsWith('search') ? 'input' : 'change', () => { rememberNavigation(); renderRecords(); });
$('component-view-mode').addEventListener('change', () => { rememberNavigation(); renderComponents(); });
for (const id of ['component-search', 'component-status']) $(id).addEventListener(id.endsWith('search') ? 'input' : 'change', () => { rememberNavigation(); renderComponents(); });
for (const id of ['expense-year', 'expense-scope']) $(id).addEventListener('change', () => { rememberNavigation(); renderExpenses(); });
for (const id of ['statistics-period', 'statistics-scope']) $(id).addEventListener('change', () => {
  rememberNavigation();
  if (vehicle()) renderStatistics($('statistics-content'), vehicle(), { period: $('statistics-period').value, scope: $('statistics-scope').value });
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#main') return;
  rememberNavigation();
  section = resolveSection(location.hash, navigation.section);
  render(); $('view-title').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' });
});
function filterCommands() {
  const query = searchText($('command-search').value);
  const buttons = [...document.querySelectorAll('#commands-dialog .command-list button')];
  buttons.forEach((button) => { button.hidden = !searchText(button.textContent).includes(query); });
  $('command-empty').hidden = buttons.some((button) => !button.hidden);
}
$('command-search').addEventListener('input', filterCommands);
window.addEventListener('beforeunload', (event) => { if (unsaved || backups.needsFlush() || drive.busy()) { event.preventDefault(); event.returnValue = ''; } });
repository.subscribe(async () => {
  if (openDialogs().length || unsaved || saving) { localConflict = true; backups.suspend(); return storageWarning('Le garage a changé dans un autre onglet. Exportez les modifications ouvertes avant de recharger.'); }
  try { garage = await repository.load() ?? exampleGarage(); render(); void backups.update(); drive.changed(); }
  catch { storageWarning('Une modification provenant d’un autre onglet est illisible. La copie ouverte est conservée.'); }
});
async function prepareImport(file, handle = null) {
  if ($('import-confirm').dataset.importing) throw Error('Un import est déjà en cours.');
  const generation = ++importGeneration;
  pendingImport = null;
  backups.suspend();
  drive.pauseForImport();
  const incoming = await readBackupFile(file);
  if (generation !== importGeneration) return;
  pendingImport = { ...incoming, handle };
  const before = inventory(garage), after = inventory(incoming.garage);
  $('import-description').textContent = `${file.name} · ${number(Math.ceil(file.size / 1024))} Kio. Le contenu a été vérifié, y compris les documents intégrés et les relations entre les fiches.`;
  $('import-counts').innerHTML = [['vehicles', 'Véhicules'], ['records', 'Fiches actives'], ['trashedRecords', 'Fiches dans la corbeille'], ['components', 'Composants'], ['lines', 'Lignes détaillées'], ['documents', 'Documents']].map(([field, label]) => `<tr><th scope="row">${label}</th><td>${number(before[field])}</td><td>${number(after[field])}</td></tr>`).join('');
  $('import-vehicles').textContent = `Véhicules du fichier : ${incoming.garage.vehicles.map((one) => one.name).join(' · ') || 'aucun'}. Les champs complémentaires sont conservés.`;
  $('import-link-note').textContent = handle ? 'Après confirmation, ce fichier sera lié au garage. L’écriture automatique restera désactivée.' : 'Toute liaison au fichier précédent sera détachée pour préserver son contenu.';
  $('import-error').hidden = true;
  showDialog('import-dialog');
}
$('backup-file').addEventListener('change', async (event) => {
  const file = event.target.files[0]; event.target.value = ''; pendingImport = null; if (!file) return;
  try { await prepareImport(file); }
  catch (error) { backups.announce(`Import refusé. ${backupErrorMessage(error)}`); }
});
$('import-confirm').addEventListener('click', async () => {
  if (!pendingImport || saving || backups.files.busy || $('import-confirm').dataset.importing) return;
  const button = $('import-confirm'); button.disabled = true;
  button.dataset.importing = 'true';
  $('import-error').hidden = true;
  try {
    const incoming = pendingImport;
    if (incoming.handle && await fingerprint(await incoming.handle.getFile()) !== incoming.fileHash) throw Error('Le fichier a changé depuis sa vérification. Ouvrez-le à nouveau avant d’importer. Le garage actuel est conservé.');
    exportGarage({ beforeImport: true });
    backups.suspend(); await backups.files.disconnect();
    await save(incoming.garage); pendingImport = null; $('import-dialog').close();
    let linkError = '';
    if (incoming.handle && !unsaved) {
      try { await backups.files.link(incoming.handle, incoming); }
      catch (error) { linkError = ` Le garage a été importé, mais le fichier n’a pas été lié : ${backupErrorMessage(error)}`; }
    }
    await backups.update(false);
    announce(unsaved ? 'Garage importé dans la copie ouverte. Exportez-le avant de quitter : l’enregistrement local a échoué.' : `Garage et documents importés. Le téléchargement de la copie précédente a été demandé.${linkError}`);
  } catch (error) { $('import-error').textContent = backupErrorMessage(error); $('import-error').hidden = false; }
  finally { delete button.dataset.importing; backups.render(); }
});
const suite = suiteLinks(base);
$('dev-banner').hidden = !suite.preview;
document.querySelector('[data-finapp-link]').href = suite.apps.find((one) => one.id === 'finapp').href;
applyPreferences(); render();
document.addEventListener('garapp:before-update', (event) => {
  if (unsaved || saving || localConflict || backups.needsFlush() || backups.picking || drive.busy() || $('import-confirm').dataset.importing || openDialogs().some((dialog) => dialog.querySelector('form') || ['import-dialog', 'drive-preview-dialog'].includes(dialog.id))) event.preventDefault();
});
document.documentElement.dataset.garappReady = 'true';
