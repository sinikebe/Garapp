/** Differences-only backup comparison. Display choices never modify source copies. */
import { escapeHtml as esc } from './ui-format.js';
import { TYPES, LINE_TYPES, EFFECTS } from './garage.js';
import { COMPONENT_KINDS, COMPONENT_ZONES, COMPONENT_SIDES } from './component-catalog.js';

let sequence = 0;
const SIDES = new Set(['local', 'incoming']);
const FIELD_NAMES = {
  name: 'Nom', title: 'Intitulé', label: 'Libellé', date: 'Date', odometer: 'Kilométrage',
  description: 'Description', notes: 'Notes', content: 'Texte', mimeType: 'Type de fichier',
  size: 'Taille', type: 'Type', status: 'État', amount: 'Montant', totalAmount: 'Total',
  documents: 'Documents', lines: 'Lignes', records: 'Interventions', components: 'Composants',
  record: 'Fiche', deletedAt: 'Mise à la corbeille', position: 'Position', id: 'Identifiant',
  partsAmount: 'Montant des pièces', laborAmount: 'Main-d’œuvre / prestation', kind: 'Nature', effect: 'Action sur les composants',
  componentId: 'Composant lié', componentIds: 'Composants liés', observedComponentIds: 'Composants observés',
  year: 'Année', engine: 'Motorisation', odometerDate: 'Date du relevé', example: 'Véhicule de démonstration',
  intervalKm: 'Intervalle kilométrique', intervalMonths: 'Intervalle en mois', group: 'Groupe',
  spatial: 'Emplacement', zone: 'Zone', side: 'Côté', presenceOrigin: 'Provenance',
  fuel: 'Carburant', litres: 'Quantité en litres', fullTank: 'Plein complet',
  insurances: 'Contrats d’assurance', insurance: 'Échéance d’assurance', provider: 'Assureur', reference: 'Référence',
  firstDate: 'Première échéance', endDate: 'Fin du contrat', debitDay: 'Jour du prélèvement', tariffs: 'Tarifs', from: 'À partir du mois',
  skippedPeriods: 'Échéances exclues', contractId: 'Contrat associé', period: 'Mois', generated: 'Échéance générée',
  overridden: 'Montant personnalisé', autoStatus: 'Validation automatique', coverDocumentId: 'Visuel du véhicule',
  componentLayout: 'Disposition du véhicule', trashedRecords: 'Fiches dans la corbeille',
};
const COLLECTION_ROLES = { garage: { vehicles: 'vehicle', documents: 'document' }, vehicle: { components: 'component', records: 'record', insurances: 'insurance', documents: 'document' }, record: { lines: 'line', documents: 'document' }, component: { documents: 'document' }, insurance: { documents: 'document' }, line: { documents: 'document' } };
const OBJECT_ROLES = { vehicle: { componentLayout: 'layout', trashedRecords: 'trash' }, record: { fuel: 'fuel', insurance: 'payment' }, component: { spatial: 'spatial' }, insurance: { tariffs: 'tariff' }, trash: { record: 'record' } };
const member = (values, key) => values && Object.hasOwn(values, key) ? values[key] : undefined;
const childRole = (role, key) => member(member(COLLECTION_ROLES, role), key) ?? member(member(OBJECT_ROLES, role), key) ?? null;
const ENUMS = { record: { type: TYPES, status: { done: 'Réalisé', planned: 'Prévu', incomplete: 'Incomplet' } }, line: { kind: LINE_TYPES, effect: EFFECTS }, spatial: { kind: COMPONENT_KINDS, zone: COMPONENT_ZONES, side: COMPONENT_SIDES, presenceOrigin: { manual: 'Saisie manuelle', record: 'Intervention' } } };
const documentValue = (value) => value && typeof value === 'object' && !Array.isArray(value) && typeof value.dataUrl === 'string';
const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
const labelFor = (key, role = 'known') => role ? member(FIELD_NAMES, key) ?? key : key;

function textValue(value, key = '', role = null) {
  if (value === null) return 'Non renseigné';
  if (value === '') return 'Texte vide';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  const labels = member(member(ENUMS, role), key);
  if (labels && Object.hasOwn(labels, value)) return labels[value];
  return String(value);
}

function parentRole(path) {
  let role = 'garage';
  for (let index = 0; index < path.length - 1; index++) {
    const collectionRole = member(member(COLLECTION_ROLES, role), path[index]);
    if (collectionRole) { role = collectionRole; index++; }
    else role = childRole(role, path[index]);
    if (!role) return null;
  }
  return role;
}

function atomicPath(path, initialRole) {
  let role = initialRole;
  const names = path.map((field, index) => {
    if (/^Élément \d+$/.test(field)) return field;
    const label = labelFor(field, role);
    if (index < path.length - 1) role = childRole(role, field);
    return label;
  });
  return { label: names.join(' · '), role };
}

function sizeLabel(bytes) {
  if (!Number.isFinite(bytes)) return 'Taille non renseignée';
  return bytes < 1024 ? `${bytes} octets` : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / 1024)} Kio`;
}

function binaryValue(value, key) {
  return key === 'dataUrl' || typeof value === 'string' && /^data:[^,]*;base64,/i.test(value);
}

/** Bound previews by depth and length; binary document data never enters the markup. */
function preview(value, depth = 0, key = '', role = null) {
  if (binaryValue(value, key)) return '<span class="merge-muted">Fichier intégré — contenu conservé</span>';
  if (documentValue(value)) {
    const additional = Object.fromEntries(Object.entries(value).filter(([field, item]) => !['id', 'name', 'mimeType', 'size', 'dataUrl'].includes(field) && item !== ''));
    return `<div class="merge-document"><strong>${esc(value.name || 'Document')}</strong><span>${esc(value.mimeType || 'Type inconnu')} · ${esc(sizeLabel(value.size))}</span>${Object.keys(additional).length ? preview(additional, depth + 1, '', 'document') : ''}<span class="merge-muted">Fichier original intégré</span></div>`;
  }
  if (value === null || typeof value !== 'object') {
    const text = textValue(value, key, role);
    if (text.length <= 220) return `<span class="merge-text">${esc(text)}</span>`;
    const visible = text.slice(0, 4000);
    return `<span class="merge-text">${esc(text.slice(0, 180))}…</span><details class="merge-value-more"><summary>Lire le texte${text.length > 4000 ? ' (extrait)' : ' complet'}</summary><pre>${esc(visible)}${text.length > 4000 ? '\n…' : ''}</pre>${text.length > 4000 ? '<p class="merge-muted">Texte long : télécharger la copie pour consulter la totalité.</p>' : ''}</details>`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="merge-muted">Liste vide</span>';
    if (depth >= 3) return `<span>${countLabel(value.length, 'élément')}</span>`;
    const items = value.slice(0, 8).map((item) => `<li>${preview(item, depth + 1, '', role)}</li>`).join('');
    return `<ul class="merge-value-list">${items}</ul>${value.length > 8 ? `<span class="merge-muted">${value.length - 8} autre(s) élément(s) dans cette copie.</span>` : ''}`;
  }
  const entries = Object.entries(value).filter(([field]) => field !== 'id' && field !== 'dataUrl');
  if (!entries.length) return '<span class="merge-muted">Objet vide</span>';
  if (depth >= 3) return `<span>${countLabel(entries.length, 'propriété', 'propriétés')}</span>`;
  const content = entries.slice(0, 8).map(([field, item]) => `<div><dt>${esc(labelFor(field, role))}</dt><dd>${preview(item, depth + 1, field, item && typeof item === 'object' ? childRole(role, field) : role)}</dd></div>`).join('');
  return `<dl class="merge-value-fields">${content}</dl>${entries.length > 8 ? `<span class="merge-muted">${entries.length - 8} autre(s) propriété(s) dans cette copie.</span>` : ''}`;
}

function contentDiffers(difference) {
  return documentValue(difference.local) && documentValue(difference.incoming) && difference.local.dataUrl !== difference.incoming.dataUrl;
}

/** Atomic merge choices still expose each changed array entry and document property. */
function atomicChanges(difference) {
  if (!difference.conflict || !difference.local || !difference.incoming || typeof difference.local !== 'object' || typeof difference.incoming !== 'object') return null;
  const changes = [];
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const walk = (local, localPresent, incoming, incomingPresent, path) => {
    if (localPresent && incomingPresent && local === incoming) return;
    const key = path.at(-1);
    if (binaryValue(local, key) || binaryValue(incoming, key)) {
      changes.push({ path: [...path.slice(0, -1), 'Contenu du fichier'], local: 'Fichier intégré — contenu différent', incoming: 'Fichier intégré — contenu différent', localPresent, incomingPresent });
      return;
    }
    const localArray = Array.isArray(local), incomingArray = Array.isArray(incoming);
    if ((localArray && incomingArray) || (!localPresent && incomingArray) || (localArray && !incomingPresent)) {
      const length = Math.max(localArray ? local.length : 0, incomingArray ? incoming.length : 0);
      if (length) {
        for (let index = 0; index < length; index++) walk(localArray ? local[index] : undefined, localArray && index < local.length, incomingArray ? incoming[index] : undefined, incomingArray && index < incoming.length, [...path, `Élément ${index + 1}`]);
        return;
      }
      if (localPresent && incomingPresent) return;
    }
    const localObject = object(local), incomingObject = object(incoming);
    if ((localObject && incomingObject) || (!localPresent && incomingObject) || (localObject && !incomingPresent)) {
      const keys = new Set([...Object.keys(localObject ? local : {}), ...Object.keys(incomingObject ? incoming : {})]);
      if (keys.size) {
        for (const field of keys) walk(localObject ? local[field] : undefined, localObject && Object.hasOwn(local, field), incomingObject ? incoming[field] : undefined, incomingObject && Object.hasOwn(incoming, field), [...path, field]);
        return;
      }
      if (localPresent && incomingPresent) return;
    }
    changes.push({ path, local, incoming, localPresent, incomingPresent });
  };
  walk(difference.local, true, difference.incoming, true, []);
  return changes;
}

function locationValue(location) {
  if (!location) return '';
  const metadata = location.metadata ?? {};
  return `<div class="merge-location"><strong>${location.state === 'trash' ? 'Dans la corbeille' : 'Fiche active'}</strong>${Object.keys(metadata).length ? preview(metadata, 0, '', 'trash') : ''}</div>`;
}

function differenceExcerpt(difference, side) {
  const left = difference.local, right = difference.incoming;
  if (typeof left !== 'string' || typeof right !== 'string' || binaryValue(left) || binaryValue(right) || Math.max(left.length, right.length) <= 220) return '';
  let index = 0;
  while (index < Math.min(left.length, right.length) && left[index] === right[index]) index++;
  if (index === left.length && index === right.length) return '';
  const value = difference[side], start = Math.max(0, index - 40);
  const excerpt = value.slice(start, index + 120);
  return `<p class="merge-difference-excerpt">Première différence au caractère ${index + 1} : <span>${start ? '…' : ''}${esc(excerpt)}${index >= value.length ? ' [fin du texte]' : index + 120 < value.length ? '…' : ''}</span></p>`;
}

function sideValue(difference, side, label, atomic, choice = null) {
  const present = difference[`${side}Present`];
  const displayed = Object.hasOwn(difference, `display${side === 'local' ? 'Local' : 'Incoming'}`)
    ? difference[`display${side === 'local' ? 'Local' : 'Incoming'}`] : difference[side];
  const key = difference.path?.at(-1) ?? '';
  const owner = parentRole(difference.path ?? []);
  const role = difference.entity ?? (displayed && typeof displayed === 'object' ? childRole(owner, key) : owner);
  const atomicContent = atomic?.length ? `<dl class="merge-value-fields merge-atomic-fields">${atomic.map((item) => {
    const field = atomicPath(item.path, role);
    return `<div><dt>${esc(field.label || difference.label)}</dt><dd>${item[`${side}Present`] ? preview(item[side], 0, item.path.at(-1), field.role) : '<span class="merge-muted">Absent de cette copie</span>'}${differenceExcerpt(item, side)}</dd></div>`;
  }).join('')}</dl>` : null;
  const content = difference.lifecycle ? locationValue(displayed) : difference.wrappedRecord && displayed
    ? `${locationValue(displayed.location)}${preview(displayed.record, 0, '', 'record')}` : atomicContent ?? preview(displayed, 0, key, role);
  const selected = choice?.selected === side;
  const button = choice ? `<button type="button" class="merge-pick" data-merge-choice="${esc(difference.id)}" data-merge-side="${side}" aria-pressed="${selected}" aria-label="${esc(`${choice.description} : garder ${label}`)}">${selected ? 'Valeur choisie' : 'Garder cette valeur'}</button>` : '';
  return `<div class="merge-side"${choice ? ` data-merge-option="${side}" data-selected="${selected}"` : ''}><p class="merge-source">${esc(label)}</p><div class="merge-value">${present ? content : '<span class="merge-muted">Absent de cette copie</span>'}</div>${present ? differenceExcerpt(difference, side) : ''}${contentDiffers(difference) ? '<p class="merge-binary-change">Le contenu du fichier diffère entre les copies.</p>' : ''}${button}</div>`;
}

const shortName = (value) => String(value).replace(/^(?:Véhicule|Fiche|Composant|Contrat d['’]assurance|Ligne|Document) « ([\s\S]*) »$/, '$1');

/** Short visible names, while vehicle and entity IDs keep unrelated records apart. */
function description(difference) {
  const context = (Array.isArray(difference.context) ? difference.context : [difference.context || 'Garage']).filter((item) => item !== 'Garage');
  const path = difference.path ?? [];
  const inVehicle = path[0] === 'vehicles';
  const vehicle = inVehicle ? shortName(context[0] || 'Véhicule') : 'Garage';
  const parts = inVehicle ? context.slice(1) : context;
  const entity = shortName(parts[0] || (inVehicle ? 'Informations du véhicule' : 'Informations du garage'));
  const field = [...parts.slice(1).map(shortName), shortName(difference.label)].join(' · ');
  return { vehicle, entity, field, vehicleKey: inVehicle ? path[1] : 'garage',
    entityKey: JSON.stringify(inVehicle && ['records', 'components', 'insurances'].includes(path[2]) ? path.slice(0, 4) : [path[0], path[1], ...parts]),
    full: [vehicle, entity, field].join(' — '),
  };
}

function resolution(comparison, choices) {
  const conflicts = comparison?.differences.filter((item) => item.conflict) ?? [];
  const unresolvedCount = conflicts.filter((item) => !SIDES.has(choices[item.id])).length;
  return { unresolvedCount, complete: !!comparison && !unresolvedCount, total: conflicts.length };
}

function resolutionText(comparison, choices) {
  const { unresolvedCount, total } = resolution(comparison, choices);
  return unresolvedCount ? `${unresolvedCount} choix à faire` : total ? 'Tous les choix sont faits' : 'Prêt à appliquer';
}

function additionSummary(comparison, choices) {
  const additions = comparison.differences.filter((item) => !item.conflict);
  const excluded = additions.filter((item) => choices[item.id] === (item.localPresent ? 'incoming' : 'local')).length;
  return excluded ? `${countLabel(additions.length - excluded, 'élément conservé', 'éléments conservés')} · ${countLabel(excluded, 'élément exclu', 'éléments exclus')}`
    : `${countLabel(additions.length, 'élément ajouté', 'éléments ajoutés')} · ${additions.length === 1 ? 'conservé' : 'conservés'} automatiquement`;
}

function additionMarkup(difference, choices, options) {
  const side = difference.localPresent ? 'local' : 'incoming', opposite = side === 'local' ? 'incoming' : 'local';
  const selected = choices[difference.id] ?? side;
  const source = side === 'local' ? options.localLabel : options.incomingLabel;
  const context = description(difference);
  const title = shortName(difference.label);
  const identifier = `${options.prefix}-${difference.id}`;
  const ancestors = (Array.isArray(difference.context) ? difference.context : [difference.context]).filter((value) => value && value !== 'Garage').map(shortName);
  const origin = [...ancestors, source].join(' · ');
  return `<article class="merge-addition" data-merge-difference="${esc(difference.id)}"><div class="merge-addition-heading"><div><h4>${esc(title)}</h4><p>${esc(origin)}</p></div><select id="${esc(identifier)}" class="merge-keep" aria-label="${esc(`${context.full} : conserver ou exclure`)}" data-merge-choice="${esc(difference.id)}"><option value="${side}"${selected === side ? ' selected' : ''}>Conserver</option><option value="${opposite}"${selected === opposite ? ' selected' : ''}>Exclure</option></select></div><details class="merge-addition-details"><summary>Voir le contenu</summary>${sideValue(difference, side, source, null)}</details>${difference.consequence ? `<p class="merge-consequence">${esc(difference.consequence)}</p>` : ''}</article>`;
}

/** Pure markup builder, also used to verify escaping and document privacy. */
export function mergeComparisonMarkup(comparison, choices = {}, { localLabel = 'Cet appareil', incomingLabel = 'Sauvegarde', prefix = 'merge' } = {}) {
  if (!comparison) return '';
  if (!comparison.differences.length) return '<div class="merge-empty"><strong>Les deux copies sont identiques.</strong><p>Il n’y a rien à ajouter ni à modifier.</p></div>';
  const options = { localLabel, incomingLabel, prefix };
  const conflicts = comparison.differences.filter((item) => item.conflict);
  const additions = comparison.differences.filter((item) => !item.conflict);
  const vehicles = new Map();
  for (const difference of conflicts) {
    const context = description(difference);
    if (!vehicles.has(context.vehicleKey)) vehicles.set(context.vehicleKey, { label: context.vehicle, entities: new Map() });
    const { entities } = vehicles.get(context.vehicleKey);
    if (!entities.has(context.entityKey)) entities.set(context.entityKey, { label: context.entity, items: [] });
    entities.get(context.entityKey).items.push({ difference, context });
  }
  const toolbar = `<div class="merge-overview"><p class="merge-resolution-status" role="status" aria-live="polite">${esc(resolutionText(comparison, choices))}</p><p class="merge-explanation">${conflicts.length ? 'Choisissez la valeur à garder pour chaque différence.' : 'Les éléments présents dans une seule copie seront ajoutés au garage.'}</p>${conflicts.length > 1 ? `<details class="merge-bulk"><summary>Choisir la même copie partout</summary><div class="merge-bulk-actions"><button type="button" class="ghost-button" data-merge-all="local">Tout garder de ${esc(localLabel)}</button><button type="button" class="ghost-button" data-merge-all="incoming">Tout prendre de ${esc(incomingLabel)}</button></div></details>` : ''}</div>`;
  const body = [...vehicles.values()].map((vehicle) => `<section class="merge-vehicle"><h3>${esc(vehicle.label)}</h3>${[...vehicle.entities.values()].map((entity) => `<section class="merge-group"><h4>${esc(entity.label)}</h4><div class="merge-group-body">${entity.items.map(({ difference, context }) => {
      const atomic = atomicChanges({ ...difference,
        local: Object.hasOwn(difference, 'displayLocal') ? difference.displayLocal : difference.local,
        incoming: Object.hasOwn(difference, 'displayIncoming') ? difference.displayIncoming : difference.incoming,
      });
      const choice = { selected: choices[difference.id], description: context.full };
      return `<article class="merge-difference" data-merge-difference="${esc(difference.id)}"><h5>${esc(context.field)}</h5><div class="merge-values">${sideValue(difference, 'local', localLabel, atomic, choice)}${sideValue(difference, 'incoming', incomingLabel, atomic, choice)}</div>${difference.consequence ? `<p class="merge-consequence">${esc(difference.consequence)}</p>` : ''}</article>`;
    }).join('')}</div></section>`).join('')}</section>`).join('');
  const extra = additions.length ? `<details class="merge-additions"><summary class="merge-additions-summary">${esc(additionSummary(comparison, choices))}</summary><p class="merge-explanation">Un élément absent d’une copie n’est pas supprimé. Vous pouvez l’exclure ci-dessous.</p><div>${additions.map((difference) => additionMarkup(difference, choices, options)).join('')}</div></details>` : '';
  return `<div class="backup-merge">${toolbar}<div class="merge-groups">${body}</div>${extra}</div>`;
}

export class MergeComparisonView {
  constructor({ container, onChange = () => {}, localLabel = 'Cet appareil', incomingLabel = 'Sauvegarde' }) {
    Object.assign(this, { container, onChange, localLabel, incomingLabel });
    this.prefix = `backup-merge-${++sequence}`;
    this.comparison = null;
    this.selections = Object.create(null);
    container.addEventListener('change', (event) => {
      const select = event.target.closest('[data-merge-choice]');
      if (!select || !container.contains(select)) return;
      this.choose(select.dataset.mergeChoice, select.value, false);
    });
    container.addEventListener('click', (event) => {
      const choice = event.target.closest('button[data-merge-choice]');
      if (choice && container.contains(choice)) { this.choose(choice.dataset.mergeChoice, choice.dataset.mergeSide, false); return; }
      const button = event.target.closest('[data-merge-all]');
      if (button && container.contains(button)) this.chooseAll(button.dataset.mergeAll);
    });
  }

  get choices() { return { ...this.selections }; }
  get complete() { return resolution(this.comparison, this.selections).complete; }
  get unresolvedCount() { return resolution(this.comparison, this.selections).unresolvedCount; }
  get hasDifferences() { return !!this.comparison?.differences.length; }

  setComparison(comparison) {
    this.comparison = comparison;
    this.selections = Object.create(null);
    this.render(); this.notify();
  }

  choose(id, side, redraw = false) {
    if (!this.comparison?.differences.some((item) => item.id === id)) return;
    if (SIDES.has(side)) this.selections[id] = side;
    else if (side === '') delete this.selections[id];
    else return;
    if (redraw) this.render();
    else this.updateChoices();
    this.notify();
  }

  chooseAll(side) {
    if (!SIDES.has(side) || !this.comparison) return;
    for (const difference of this.comparison.differences) if (difference.conflict) this.selections[difference.id] = side;
    this.updateChoices(); this.notify();
  }

  /** Preserve focus, scroll position and open details while updating selection state. */
  updateChoices() {
    for (const control of this.container.querySelectorAll('[data-merge-choice]')) {
      const difference = this.comparison?.differences.find((item) => item.id === control.dataset.mergeChoice);
      if (!difference) continue;
      const selected = this.selections[difference.id] ?? (difference.conflict ? '' : difference.localPresent ? 'local' : 'incoming');
      if (control.dataset.mergeSide) {
        const active = selected === control.dataset.mergeSide;
        control.setAttribute('aria-pressed', String(active));
        control.textContent = active ? 'Valeur choisie' : 'Garder cette valeur';
        const card = control.closest('[data-merge-option]');
        if (card) card.dataset.selected = String(active);
      } else control.value = selected;
    }
    const status = this.container.querySelector('.merge-resolution-status');
    if (status) status.textContent = resolutionText(this.comparison, this.selections);
    const additions = this.container.querySelector('.merge-additions-summary');
    if (additions) additions.textContent = additionSummary(this.comparison, this.selections);
  }

  render() { this.container.innerHTML = mergeComparisonMarkup(this.comparison, this.selections, this); }

  notify() { this.onChange({ choices: this.choices, complete: this.complete, unresolvedCount: this.unresolvedCount, hasDifferences: this.hasDifferences }); }
}
