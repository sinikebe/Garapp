import { TYPES, today, uid, recordTotal, chronological, componentHistory, componentLife, vehicleStats, exampleGarage, parseGarage, storageKey, moneyInput } from './garage.js';
import { suiteLinks } from './app-switcher.js';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const number = (value) => new Intl.NumberFormat('fr-FR').format(value);
const euros = (cents) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
const dateText = (date, options = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', options);
const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const labels = { due: 'Échéance atteinte', soon: 'À prévoir', ok: 'Repère non atteint', unknown: 'Suivi à compléter' };
const base = new URL('../../', import.meta.url);
const key = storageKey(base);
const preferenceKey = key.replace('workspace', 'preferences');
let previousRaw = null;
let unsaved = false;
let garage;
let editVehicleId = null;
let pendingImport = null;
let toastTimer;
let preferences = { layout: 'horizon', theme: 'auto' };

function storageWarning(message) {
  $('storage-warning').hidden = false;
  $('storage-message').textContent = message;
  $('save-status').textContent = 'Modifications non enregistrées';
}

try {
  previousRaw = localStorage.getItem(key);
  garage = previousRaw ? parseGarage(previousRaw) : exampleGarage();
  if (previousRaw) $('save-status').textContent = 'Enregistré sur cet appareil';
} catch {
  garage = exampleGarage();
  storageWarning('Le stockage local est indisponible ou illisible. Vous pouvez explorer le garage et exporter vos modifications. Le contenu déjà enregistré sera conservé.');
}
try {
  const savedPreferences = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
  if (['horizon', 'atelier', 'parcours'].includes(savedPreferences?.layout)) preferences.layout = savedPreferences.layout;
  if (['auto', 'light', 'dark'].includes(savedPreferences?.theme)) preferences.theme = savedPreferences.theme;
} catch { /* A malformed appearance preference must never replace garage data. */ }

const vehicle = () => garage.vehicles.find((one) => one.id === garage.activeId);
const openDialogs = () => [...document.querySelectorAll('dialog[open]')];
const announce = (message) => {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
};
const closeMenus = () => document.querySelectorAll('.tools-menu[open], [data-suite-switcher][open]').forEach((menu) => { menu.open = false; });

/** Keep the open copy exportable if saving fails or another tab has changed it. */
async function save(next) {
  try { next = parseGarage(JSON.stringify(next)); }
  catch (error) { announce(error.message); return false; }
  garage = next;
  unsaved = true;
  const write = () => {
    const current = localStorage.getItem(key);
    if (current !== previousRaw) throw Error('Le garage a changé dans un autre onglet. Exportez vos modifications avant de recharger.');
    // Preserve an unreadable original rather than replacing somebody's only copy.
    if (current) parseGarage(current);
    const text = JSON.stringify(next);
    localStorage.setItem(key, text);
    previousRaw = text;
  };
  try {
    if (navigator.locks) await navigator.locks.request(key, write);
    else write();
    unsaved = false;
    $('storage-warning').hidden = true;
    $('save-status').textContent = 'Enregistré sur cet appareil';
  } catch (error) {
    storageWarning(error.message.includes('autre onglet') ? error.message : 'L’enregistrement local a échoué. Vos modifications restent ouvertes et peuvent être exportées.');
  }
  render();
  return true;
}

function applyPreferences() {
  document.body.dataset.layout = preferences.layout;
  if (preferences.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preferences.theme;
  $('layout-select').value = preferences.layout;
  const names = { auto: 'automatique', light: 'claire', dark: 'sombre' };
  const next = { auto: 'clair', light: 'sombre', dark: 'automatique' };
  $('theme-toggle').setAttribute('aria-label', `Apparence ${names[preferences.theme]}. Passer au mode ${next[preferences.theme]}.`);
  $('theme-toggle').title = `Apparence ${names[preferences.theme]}`;
  try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* The interface remains usable without preference storage. */ }
}

function pill(life) {
  const mark = life.status === 'due' ? '!' : life.status === 'soon' ? '◇' : life.status === 'ok' ? '✓' : '—';
  return `<span class="status-pill" data-status="${life.status}"><span aria-hidden="true">${mark}</span>${labels[life.status]}</span>`;
}

function remaining(life) {
  if (life.percent === null) return life.last ? 'Ajoutez un intervalle pour suivre ce composant.' : 'Ajoutez son dernier remplacement pour démarrer le suivi.';
  if (life.status === 'due') return 'Votre repère d’entretien est atteint.';
  return [life.km === null ? null : `${number(life.km)} km`, life.months === null ? null : `${life.months} mois`].filter(Boolean).join(' ou ') + ' avant le repère';
}

function empty(title, message, action, label) {
  return `<div class="panel empty-state">${icon('car')}<h2>${esc(title)}</h2><p class="hint">${esc(message)}</p>${action ? `<button type="button" class="primary-button" data-action="${action}">${esc(label)}</button>` : ''}</div>`;
}

function recordsMarkup(records, current = vehicle()) {
  if (!records.length) return empty('Rien à afficher pour le moment', 'Ajoutez une intervention ou ajustez les filtres pour retrouver votre historique.', 'new-record', 'Ajouter une intervention');
  return `<div class="record-list">${chronological(records).map((record) => {
    const parts = record.componentIds.map((id) => current.components.find((part) => part.id === id)?.name).filter(Boolean);
    return `<article class="record-row"><time class="record-date" datetime="${record.date}"><strong>${esc(dateText(record.date, { day: 'numeric', month: 'short' }))}</strong>${record.date.slice(0, 4)}</time><div><button type="button" class="record-title" data-record="${record.id}">${esc(record.title)}</button><div class="record-meta"><span>${TYPES[record.type]}</span><span>${number(record.odometer)} km</span>${parts.length ? `<span>${esc(parts.join(' · '))}</span>` : ''}</div></div><span class="record-cost">${euros(recordTotal(record))}</span><button type="button" class="icon-button" data-record="${record.id}" aria-label="Voir ${esc(record.title)}">${icon('arrow')}</button></article>`;
  }).join('')}</div>`;
}

function carDrawing() {
  return `<svg class="car-drawing" viewBox="0 0 520 200" role="img" aria-label="Illustration d’une voiture"><ellipse cx="263" cy="174" rx="215" ry="8" fill="var(--surface-2)"/><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M55 147v-26q0-15 18-19l54-10 42-40q12-12 36-12h102q19 0 33 15l45 42 49 12q25 6 29 23l3 19-25 8h-27q-3-38-35-38t-36 38H174q-3-38-36-38t-36 38H74q-19 0-19-12Z" fill="var(--accent-wash)"/><path d="m148 92 37-36h43v36Zm94-36h58q12 0 23 12l25 24H242ZM241 97v50m-73-47v27m190-28 15 25M67 113h28l-3 12H58m367-12-4 16h35M210 107h14m103 0h14M185 145h145"/><circle cx="138" cy="155" r="27" fill="var(--surface-1)"/><circle cx="378" cy="155" r="27" fill="var(--surface-1)"/><circle cx="138" cy="155" r="14" stroke="var(--text-secondary)"/><circle cx="378" cy="155" r="14" stroke="var(--text-secondary)"/><path d="M128 155h20m-10-10v20m230-10h20m-10-10v20" stroke="var(--text-secondary)"/></g></svg>`;
}

function renderDashboard(current) {
  const year = today().slice(0, 4);
  const stats = vehicleStats(current, year);
  const attention = current.components.map((part) => ({ part, life: componentLife(current, part) })).filter(({ life }) => ['soon', 'due'].includes(life.status)).sort((a, b) => a.life.percent - b.life.percent);
  $('dashboard').innerHTML = `<div class="dashboard-grid"><section class="panel vehicle-hero"><div class="hero-top"><div><p class="eyebrow">VOTRE VÉHICULE</p><h2>${esc(current.name)}</h2><p class="vehicle-subtitle">${esc(current.engine)} <span aria-hidden="true">·</span> ${current.year}</p></div><span class="hero-tag">${current.example ? 'Véhicule d’exemple' : 'Mon véhicule'}</span></div>${carDrawing()}<div class="hero-bottom"><div><span class="odometer-label">Kilométrage actuel</span><span class="odometer-value">${number(current.odometer)} <small>km</small></span></div><button type="button" class="text-button" data-action="edit-vehicle">Mettre à jour ${icon('arrow')}</button></div></section><section class="panel attention-panel"><div class="panel-heading"><h2>À garder en tête</h2><span class="hero-tag">${attention.length} repère${attention.length > 1 ? 's' : ''}</span></div><div class="attention-list">${attention.length ? attention.slice(0, 3).map(({ part, life }) => `<button class="attention-row" type="button" data-component="${part.id}"><span class="attention-mark" aria-hidden="true">${life.status === 'due' ? '!' : '◇'}</span><span><strong>${esc(part.name)}</strong><small>${esc(remaining(life))}</small></span>${icon('arrow')}</button>`).join('') : `<p class="hint">Aucun repère atteint ou proche parmi les composants renseignés.</p><button class="text-button" type="button" data-route="composants">Consulter les composants ${icon('arrow')}</button>`}</div><p class="hint">Des repères pour anticiper l’entretien, à ajuster avec votre professionnel.</p></section></div><div class="stat-grid"><section class="panel stat-card"><p class="stat-label">Interventions en ${year}</p><p class="stat-value">${euros(stats.total)}</p><p class="stat-foot">Dépenses enregistrées</p></section><section class="panel stat-card"><p class="stat-label">Historique du véhicule</p><p class="stat-value">${current.records.length}</p><p class="stat-foot">Intervention${current.records.length > 1 ? 's' : ''} conservée${current.records.length > 1 ? 's' : ''}</p></section><section class="panel stat-card"><p class="stat-label">Pièces et consommables</p><p class="stat-value">${current.components.length}</p><p class="stat-foot">Composant${current.components.length > 1 ? 's' : ''} suivi${current.components.length > 1 ? 's' : ''}</p></section></div><section class="panel"><div class="panel-heading"><h2>Dernières interventions</h2><button type="button" class="text-button" data-route="interventions">Tout l’historique ${icon('arrow')}</button></div>${recordsMarkup(chronological(current.records).slice(0, 3), current)}<div class="panel-end"><button type="button" class="text-button" data-action="new-record">${icon('plus')} Ajouter une intervention</button></div></section>`;
}

const searchText = (text) => text.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{Diacritic}/gu, '');

function renderRecords() {
  const current = vehicle();
  if (!current) return;
  const query = searchText($('record-search').value);
  const type = $('record-type').value;
  const records = current.records.filter((record) => (type === 'all' || record.type === type) && searchText(`${record.title} ${record.notes} ${record.componentIds.map((id) => current.components.find((part) => part.id === id)?.name ?? '').join(' ')}`).includes(query));
  $('records-list').innerHTML = `<section class="panel"><div class="panel-heading"><h2>${records.length} intervention${records.length > 1 ? 's' : ''}</h2><span class="hint">De la plus récente à la plus ancienne</span></div>${recordsMarkup(records, current)}</section>`;
}

function renderComponents() {
  const current = vehicle();
  if (!current) return;
  const query = searchText($('component-search').value);
  const filter = $('component-status').value;
  const components = current.components.map((part) => ({ part, life: componentLife(current, part) })).filter(({ part, life }) => searchText(`${part.name} ${part.group}`).includes(query) && (filter === 'all' || (filter === 'attention' ? ['soon', 'due'].includes(life.status) : life.status === filter)));
  $('components-list').innerHTML = components.length ? components.map(({ part, life }) => `<article class="panel component-card"><div class="component-top"><div><p class="component-category">${esc(part.group)}</p><button type="button" class="component-name" data-component="${part.id}">${esc(part.name)}</button></div>${icon('parts')}</div>${pill(life)}${life.percent !== null ? `<div class="reference-track" role="meter" aria-label="Part du repère restant pour ${esc(part.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${life.percent}" aria-valuetext="${life.percent} % de l’intervalle restant"><span style="width:${life.percent}%"></span></div>` : '<div class="reference-track"></div>'}<p class="component-reading">${esc(remaining(life))}</p><div class="component-last">Dernier remplacement${life.last ? `<button type="button" data-record="${life.last.id}">${esc(dateText(life.last.date))} · ${number(life.last.odometer)} km<br>${esc(life.last.title)} ↗</button>` : '<p>Non renseigné</p>'}</div></article>`).join('') : empty('Aucun composant dans cette sélection', 'Ajoutez une pièce ou ajustez les filtres pour retrouver son suivi.', 'new-component', 'Ajouter un composant');
}

function renderExpenses() {
  const current = vehicle();
  if (!current) return;
  const period = $('expense-year').value || today().slice(0, 4);
  const stats = vehicleStats(current, period);
  const caption = period === 'all' ? 'Depuis le début du suivi' : `En ${period}`;
  const categories = stats.categories.filter((one) => one.total > 0);
  const records = current.records.filter((record) => period === 'all' || record.date.startsWith(period));
  $('expense-content').innerHTML = `<section class="panel expense-hero"><p class="eyebrow">${caption.toLocaleUpperCase('fr')}</p><h2 class="stat-label">Coût des interventions</h2><p class="stat-value">${euros(stats.total)}</p><p class="hint">${stats.count} intervention${stats.count > 1 ? 's' : ''} enregistrée${stats.count > 1 ? 's' : ''} · hors carburant, assurance et frais non saisis</p></section><div class="stat-grid"><section class="panel stat-card"><p class="stat-label">Pièces</p><p class="stat-value">${euros(stats.parts)}</p><p class="stat-foot">Montants saisis</p></section><section class="panel stat-card"><p class="stat-label">Main-d’œuvre et prestations</p><p class="stat-value">${euros(stats.labor)}</p><p class="stat-foot">Montants saisis</p></section><section class="panel stat-card"><p class="stat-label">Moyenne par intervention</p><p class="stat-value">${stats.count ? euros(Math.round(stats.total / stats.count)) : '—'}</p><p class="stat-foot">Sur la période sélectionnée</p></section></div><div class="expense-columns"><section class="panel"><h2>Répartition par type</h2>${categories.length ? `<ul class="expense-bars">${categories.map((one) => `<li><div class="bar-heading"><span>${TYPES[one.type]}</span><strong>${euros(one.total)}</strong></div><div class="expense-track" aria-hidden="true"><span style="width:${Math.round(one.total / stats.total * 100)}%"></span></div></li>`).join('')}</ul>` : '<p class="hint">Les premières dépenses apparaîtront ici.</p>'}</section><section class="panel"><div class="panel-heading"><h2>Les montants en détail</h2></div>${recordsMarkup(records, current)}</section></div>`;
}

const views = {
  garage: ['Votre véhicule, en un coup d’œil.', 'L’essentiel aujourd’hui. L’historique quand vous en avez besoin.'],
  interventions: ['Une histoire qui se conserve.', 'Révisions, réparations et entretien, reliés à votre véhicule.'],
  composants: ['Chaque pièce a son histoire.', 'Retrouvez les derniers remplacements et vos repères d’entretien.'],
  depenses: ['Savoir où va votre budget.', 'Les dépenses enregistrées, réunies dans une vue lisible.'],
};
let section = Object.hasOwn(views, location.hash.slice(1)) ? location.hash.slice(1) : 'garage';

function render() {
  const current = vehicle();
  document.body.dataset.section = section;
  $('view-title').textContent = views[section][0];
  $('view-description').textContent = views[section][1];
  for (const id of Object.keys(views)) $(`${id}-view`).hidden = id !== section;
  document.querySelectorAll('.workspace-nav a').forEach((link) => {
    if (link.hash === `#${section}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('vehicle-select').innerHTML = garage.vehicles.length ? garage.vehicles.map((one) => `<option value="${one.id}">${esc(one.name)}${one.example ? ' · exemple' : ''}</option>`).join('') : '<option>Aucun véhicule</option>';
  $('vehicle-select').value = garage.activeId;
  $('example-banner').hidden = !current?.example;
  if (!current) {
    for (const id of Object.keys(views)) $(`${id}-view`).hidden = true;
    $('garage-view').hidden = false;
    $('dashboard').innerHTML = empty('Votre garage commence ici.', 'Ajoutez votre véhicule, puis ses interventions et ses composants au rythme qui vous convient.', 'new-vehicle', 'Ajouter mon véhicule');
    return;
  }
  const previousYear = $('expense-year').value || today().slice(0, 4);
  const years = [...new Set([today().slice(0, 4), ...current.records.map((record) => record.date.slice(0, 4))])].sort().reverse();
  $('expense-year').innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('') + '<option value="all">Tout l’historique</option>';
  $('expense-year').value = previousYear === 'all' || years.includes(previousYear) ? previousYear : today().slice(0, 4);
  renderDashboard(current);
  renderRecords();
  renderComponents();
  renderExpenses();
}

function showDialog(id) {
  closeMenus();
  for (const dialog of openDialogs()) if (dialog.id !== id) dialog.close();
  if (!$(id).open) $(id).showModal();
  else {
    const heading = $(id).querySelector('h2');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

function openVehicle(edit = false) {
  const form = $('vehicle-form');
  form.reset();
  form.querySelectorAll('input').forEach((input) => input.setCustomValidity(''));
  const current = edit ? vehicle() : null;
  editVehicleId = current?.id ?? null;
  $('vehicle-dialog-title').textContent = current ? 'Mettre à jour le véhicule' : 'Ajouter un véhicule';
  for (const [name, value] of Object.entries(current ?? { name: '', year: new Date().getFullYear(), odometer: '', engine: '' })) if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
  form.elements.odometer.min = current ? Math.max(0, ...current.records.map((record) => record.odometer)) : 0;
  showDialog('vehicle-dialog');
}

function openRecord(componentId = null) {
  if (!vehicle()) return openVehicle();
  const form = $('record-form');
  form.reset();
  form.querySelectorAll('input').forEach((input) => input.setCustomValidity(''));
  form.elements.date.value = today();
  form.elements.date.max = today();
  form.elements.odometer.value = vehicle().odometer;
  form.elements.odometer.max = vehicle().odometer;
  $('record-components').innerHTML = vehicle().components.length ? vehicle().components.map((part) => `<label><input type="checkbox" name="componentIds" value="${part.id}" ${part.id === componentId ? 'checked' : ''}>${esc(part.name)}</label>`).join('') : '<p class="hint">Vous pourrez ajouter vos composants depuis la rubrique Composants.</p>';
  showDialog('record-dialog');
}

function openComponent() {
  if (!vehicle()) return openVehicle();
  $('component-form').reset();
  $('component-form').querySelectorAll('input').forEach((input) => input.setCustomValidity(''));
  showDialog('component-dialog');
}

function detailRecord(id) {
  const current = vehicle();
  const record = current?.records.find((one) => one.id === id);
  if (!record) return;
  $('detail-title').textContent = record.title;
  $('detail-eyebrow').textContent = TYPES[record.type];
  $('detail-content').innerHTML = `<dl class="detail-facts"><div><dt>Date</dt><dd>${esc(dateText(record.date))}</dd></div><div><dt>Kilométrage</dt><dd>${number(record.odometer)} km</dd></div><div><dt>Pièces</dt><dd>${euros(record.partsCents)}</dd></div><div><dt>Main-d’œuvre / prestation</dt><dd>${euros(record.laborCents)}</dd></div></dl><div class="detail-total"><span>Total de l’intervention</span><strong>${euros(recordTotal(record))}</strong></div><h3>Composants remplacés ou renouvelés</h3>${record.componentIds.length ? `<div class="part-links">${record.componentIds.map((partId) => `<button type="button" class="ghost-button" data-component="${partId}">${esc(current.components.find((part) => part.id === partId)?.name)}</button>`).join('')}</div>` : '<p class="hint">Aucun remplacement associé.</p>'}${record.notes ? `<h3>Notes</h3><p class="detail-notes">${esc(record.notes)}</p>` : ''}`;
  showDialog('detail-dialog');
}

function detailComponent(id) {
  const current = vehicle();
  const part = current?.components.find((one) => one.id === id);
  if (!part) return;
  const life = componentLife(current, part);
  const intervals = [part.intervalKm ? `${number(part.intervalKm)} km` : '', part.intervalMonths ? `${part.intervalMonths} mois` : ''].filter(Boolean).join(' ou ');
  $('detail-title').textContent = part.name;
  $('detail-eyebrow').textContent = part.group;
  $('detail-content').innerHTML = `${pill(life)}<p class="hint" style="margin-top:16px">${esc(remaining(life))}</p><dl class="detail-facts"><div><dt>Intervalle choisi</dt><dd>${esc(intervals || 'Non renseigné')}</dd></div><div><dt>Dernier remplacement</dt><dd>${life.last ? esc(dateText(life.last.date)) : 'Non renseigné'}</dd></div></dl><p class="reference-note">Ces repères sont personnalisés. Ils ne décrivent pas l’état réel de la pièce et ne remplacent pas le carnet d’entretien.</p><div class="panel-heading" style="margin-top:24px"><h3>Interventions associées</h3></div>${recordsMarkup(componentHistory(current, id), current)}<div class="dialog-actions"><button class="primary-button" type="button" data-replace="${part.id}">Enregistrer un remplacement</button></div>`;
  showDialog('detail-dialog');
}

function exportGarage() {
  const blob = new Blob([JSON.stringify(garage, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `garapp-${today()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Sauvegarde du garage téléchargée.');
}

const actions = {
  'new-vehicle': () => openVehicle(),
  'edit-vehicle': () => openVehicle(true),
  'new-record': () => openRecord(),
  'new-component': openComponent,
  export: exportGarage,
  import: () => $('backup-file').click(),
  print: () => window.print(),
  reload: () => location.reload(),
};

function validText(form, names) {
  for (const name of names) {
    const input = form.elements.namedItem(name);
    input.setCustomValidity(input.value.trim() ? '' : 'Renseignez ce champ.');
  }
  return form.reportValidity();
}
async function saveForm(form, next) {
  if (form.dataset.saving) return false;
  form.dataset.saving = 'true';
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try { return await save(next); }
  finally { delete form.dataset.saving; button.disabled = false; }
}
for (const form of [$('vehicle-form'), $('record-form'), $('component-form')]) {
  form.addEventListener('input', (event) => { if (event.target.setCustomValidity) event.target.setCustomValidity(''); });
}

document.addEventListener('click', (event) => {
  const close = event.target.closest('[data-close]');
  if (close) return close.closest('dialog').close();
  const action = event.target.closest('[data-action]');
  if (action) { closeMenus(); if (action.closest('#commands-dialog')) $('commands-dialog').close(); return actions[action.dataset.action]?.(); }
  const record = event.target.closest('[data-record]');
  if (record) return detailRecord(record.dataset.record);
  const component = event.target.closest('[data-component]');
  if (component) return detailComponent(component.dataset.component);
  const replacement = event.target.closest('[data-replace]');
  if (replacement) return openRecord(replacement.dataset.replace);
  const route = event.target.closest('[data-route]');
  if (route) location.hash = route.dataset.route;
  document.querySelectorAll('.tools-menu[open]').forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; });
});

$('vehicle-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validText(event.currentTarget, ['name', 'engine'])) return;
  const data = new FormData(event.currentTarget);
  const next = structuredClone(garage);
  let current = next.vehicles.find((one) => one.id === editVehicleId);
  if (!current) { current = { id: uid(), components: [], records: [], example: false }; next.vehicles.push(current); }
  Object.assign(current, { name: data.get('name').trim(), year: Number(data.get('year')), odometer: Number(data.get('odometer')), engine: data.get('engine').trim() });
  next.activeId = current.id;
  if (!await saveForm(event.currentTarget, next)) return;
  $('vehicle-dialog').close();
  announce(unsaved ? 'Véhicule ajouté à la copie ouverte. Pensez à l’exporter.' : 'Véhicule enregistré.');
});

$('record-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!validText(form, ['title'])) return;
  const data = new FormData(form);
  const partsCents = moneyInput(data.get('parts'));
  const laborCents = moneyInput(data.get('labor'));
  for (const [name, amount] of [['parts', partsCents], ['labor', laborCents]]) {
    form.elements.namedItem(name).setCustomValidity(amount === null ? 'Saisissez un montant positif avec au plus deux décimales.' : '');
  }
  if (!form.reportValidity()) return;
  const next = structuredClone(garage);
  next.vehicles.find((one) => one.id === next.activeId).records.push({ id: uid(), title: data.get('title').trim(), type: data.get('type'), date: data.get('date'), odometer: Number(data.get('odometer')), partsCents, laborCents, componentIds: data.getAll('componentIds'), notes: data.get('notes').trim() });
  if (!await saveForm(form, next)) return;
  $('record-dialog').close();
  announce(unsaved ? 'Intervention ajoutée à la copie ouverte. Pensez à l’exporter.' : 'Intervention enregistrée et composants reliés.');
});
for (const input of [$('record-form').elements.parts, $('record-form').elements.labor]) input.addEventListener('input', () => input.setCustomValidity(''));

$('component-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validText(event.currentTarget, ['name', 'group'])) return;
  const data = new FormData(event.currentTarget);
  const next = structuredClone(garage);
  next.vehicles.find((one) => one.id === next.activeId).components.push({ id: uid(), name: data.get('name').trim(), group: data.get('group').trim(), intervalKm: data.get('intervalKm') ? Number(data.get('intervalKm')) : null, intervalMonths: data.get('intervalMonths') ? Number(data.get('intervalMonths')) : null });
  if (!await saveForm(event.currentTarget, next)) return;
  $('component-dialog').close();
  announce(unsaved ? 'Composant ajouté à la copie ouverte. Pensez à l’exporter.' : 'Composant enregistré.');
});

$('vehicle-select').addEventListener('change', (event) => save({ ...garage, activeId: event.target.value }));
$('layout-select').addEventListener('change', (event) => { preferences.layout = event.target.value; applyPreferences(); });
$('theme-toggle').addEventListener('click', () => { preferences.theme = { auto: 'light', light: 'dark', dark: 'auto' }[preferences.theme]; applyPreferences(); });
$('commands-open').addEventListener('click', () => showDialog('commands-dialog'));
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (!openDialogs().some((dialog) => dialog.querySelector('form'))) showDialog('commands-dialog');
  }
});
for (const id of ['record-search', 'record-type']) $(id).addEventListener(id.endsWith('search') ? 'input' : 'change', renderRecords);
for (const id of ['component-search', 'component-status']) $(id).addEventListener(id.endsWith('search') ? 'input' : 'change', renderComponents);
$('expense-year').addEventListener('change', renderExpenses);
window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (!Object.hasOwn(views, next)) return;
  section = next;
  render();
  $('view-title').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
});
window.addEventListener('beforeunload', (event) => { if (unsaved) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', (event) => {
  if (event.key !== key || event.newValue === previousRaw) return;
  if (openDialogs().length || unsaved) return storageWarning('Le garage a changé dans un autre onglet. Exportez les modifications ouvertes avant de recharger.');
  try { garage = event.newValue ? parseGarage(event.newValue) : exampleGarage(); previousRaw = event.newValue; render(); }
  catch { storageWarning('Une modification provenant d’un autre onglet est illisible. La copie ouverte est conservée.'); }
});
$('backup-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2000000) throw Error('La sauvegarde dépasse 2 Mo.');
    pendingImport = parseGarage(await file.text());
    const records = pendingImport.vehicles.reduce((sum, one) => sum + one.records.length, 0);
    $('import-description').textContent = `Cette sauvegarde contient ${pendingImport.vehicles.length} véhicule(s) et ${records} intervention(s). Elle remplacera le garage actuellement ouvert.`;
    showDialog('import-dialog');
  } catch (error) { announce(`Import refusé. ${error.message}`); }
});
$('import-confirm').addEventListener('click', async () => {
  if (!pendingImport) return;
  exportGarage();
  await save(pendingImport);
  pendingImport = null;
  $('import-dialog').close();
  announce(unsaved ? 'Garage importé dans la copie ouverte, mais non enregistré.' : 'Garage importé. La sauvegarde précédente a été téléchargée.');
});

const suite = suiteLinks(base);
$('dev-banner').hidden = !suite.preview;
document.querySelector('[data-finapp-link]').href = suite.apps.find((one) => one.id === 'finapp').href;
applyPreferences();
render();
