/** Differences-only backup comparison. Display choices never modify source copies. */
import { escapeHtml as esc } from './ui-format.js';

let sequence = 0;
const SIDES = new Set(['local', 'incoming']);
const FIELD_NAMES = {
  name: 'Nom', title: 'Intitulé', label: 'Libellé', date: 'Date', odometer: 'Kilométrage',
  description: 'Description', notes: 'Notes', content: 'Texte', mimeType: 'Type de fichier',
  size: 'Taille', type: 'Type', status: 'État', amount: 'Montant', totalAmount: 'Total',
  documents: 'Documents', lines: 'Lignes', records: 'Interventions', components: 'Composants',
  record: 'Fiche', deletedAt: 'Mise à la corbeille', position: 'Position', id: 'Identifiant',
};
const documentValue = (value) => value && typeof value === 'object' && !Array.isArray(value) && typeof value.dataUrl === 'string';
const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
const labelFor = (key) => FIELD_NAMES[key] ?? key;

function textValue(value) {
  if (value === null) return 'Non renseigné';
  if (value === '') return 'Texte vide';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

function sizeLabel(bytes) {
  if (!Number.isFinite(bytes)) return 'Taille non renseignée';
  return bytes < 1024 ? `${bytes} octets` : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / 1024)} Kio`;
}

function binaryValue(value, key) {
  return key === 'dataUrl' || typeof value === 'string' && /^data:[^,]*;base64,/i.test(value);
}

/** Bound previews by depth and length; binary document data never enters the markup. */
function preview(value, depth = 0, key = '') {
  if (binaryValue(value, key)) return '<span class="merge-muted">Fichier intégré — contenu conservé</span>';
  if (documentValue(value)) {
    const additional = Object.fromEntries(Object.entries(value).filter(([field, item]) => !['id', 'name', 'mimeType', 'size', 'dataUrl'].includes(field) && item !== ''));
    return `<div class="merge-document"><strong>${esc(value.name || 'Document')}</strong><span>${esc(value.mimeType || 'Type inconnu')} · ${esc(sizeLabel(value.size))}</span>${Object.keys(additional).length ? preview(additional, depth + 1) : ''}<span class="merge-muted">Fichier original intégré</span></div>`;
  }
  if (value === null || typeof value !== 'object') {
    const text = textValue(value);
    if (text.length <= 220) return `<span class="merge-text">${esc(text)}</span>`;
    const visible = text.slice(0, 4000);
    return `<span class="merge-text">${esc(text.slice(0, 180))}…</span><details class="merge-value-more"><summary>Lire le texte${text.length > 4000 ? ' (extrait)' : ' complet'}</summary><pre>${esc(visible)}${text.length > 4000 ? '\n…' : ''}</pre>${text.length > 4000 ? '<p class="merge-muted">Texte long : télécharger la copie pour consulter la totalité.</p>' : ''}</details>`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="merge-muted">Liste vide</span>';
    if (depth >= 3) return `<span>${countLabel(value.length, 'élément')}</span>`;
    const items = value.slice(0, 8).map((item) => `<li>${preview(item, depth + 1)}</li>`).join('');
    return `<ul class="merge-value-list">${items}</ul>${value.length > 8 ? `<span class="merge-muted">${value.length - 8} autre(s) élément(s) dans cette copie.</span>` : ''}`;
  }
  const entries = Object.entries(value).filter(([field]) => field !== 'id' && field !== 'dataUrl');
  if (!entries.length) return '<span class="merge-muted">Objet vide</span>';
  if (depth >= 3) return `<span>${countLabel(entries.length, 'propriété', 'propriétés')}</span>`;
  const content = entries.slice(0, 8).map(([field, item]) => `<div><dt>${esc(labelFor(field))}</dt><dd>${preview(item, depth + 1, field)}</dd></div>`).join('');
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
  return `<div class="merge-location"><strong>${location.state === 'trash' ? 'Dans la corbeille' : 'Fiche active'}</strong>${Object.keys(metadata).length ? preview(metadata) : ''}</div>`;
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

function sideValue(difference, side, label, atomic) {
  const present = difference[`${side}Present`];
  const displayed = Object.hasOwn(difference, `display${side === 'local' ? 'Local' : 'Incoming'}`)
    ? difference[`display${side === 'local' ? 'Local' : 'Incoming'}`] : difference[side];
  const atomicContent = atomic?.length ? `<dl class="merge-value-fields merge-atomic-fields">${atomic.map((item) => `<div><dt>${esc(item.path.map(labelFor).join(' · ') || difference.label)}</dt><dd>${item[`${side}Present`] ? preview(item[side]) : '<span class="merge-muted">Absent de cette copie</span>'}${differenceExcerpt(item, side)}</dd></div>`).join('')}</dl>` : null;
  const content = difference.lifecycle ? locationValue(displayed) : difference.wrappedRecord && displayed
    ? `${locationValue(displayed.location)}${preview(displayed.record)}` : atomicContent ?? preview(displayed);
  return `<div class="merge-side"><p class="merge-source">${esc(label)}</p><div class="merge-value">${present ? content : '<span class="merge-muted">Absent de cette copie</span>'}</div>${present ? differenceExcerpt(difference, side) : ''}${contentDiffers(difference) ? '<p class="merge-binary-change">Le contenu du fichier diffère entre les copies.</p>' : ''}</div>`;
}

function differenceChoice(difference, choices, options) {
  const { localLabel, incomingLabel, prefix } = options;
  const current = choices[difference.id] ?? (difference.conflict ? '' : difference.localPresent ? 'local' : 'incoming');
  const identifier = `${prefix}-${difference.id}`;
  const context = Array.isArray(difference.context) ? difference.context.join(' · ') : difference.context || 'Garage';
  const accessibleLabel = `${context} — ${difference.label} : ${difference.conflict ? 'valeur à conserver' : 'conserver ou exclure de la fusion'}`;
  const selected = (side) => current === side ? ' selected' : '';
  const choicesMarkup = difference.conflict
    ? `<option value=""${selected('')}>Choisir la valeur à conserver</option><option value="local"${selected('local')}>${esc(localLabel)}</option><option value="incoming"${selected('incoming')}>${esc(incomingLabel)}</option>`
    : `<option value="${difference.localPresent ? 'local' : 'incoming'}"${selected(difference.localPresent ? 'local' : 'incoming')}>Conserver dans la fusion</option><option value="${difference.localPresent ? 'incoming' : 'local'}"${selected(difference.localPresent ? 'incoming' : 'local')}>Exclure de la fusion</option>`;
  return `<label class="merge-choice" for="${esc(identifier)}"><span>${difference.conflict ? 'Valeur à conserver' : 'Dans le garage fusionné'}</span><select id="${esc(identifier)}" aria-label="${esc(accessibleLabel)}" data-merge-choice="${esc(difference.id)}"${difference.conflict && !current ? ' aria-invalid="true"' : ''}>${choicesMarkup}</select></label>`;
}

function resolution(comparison, choices) {
  const conflicts = comparison?.differences.filter((item) => item.conflict) ?? [];
  const unresolvedCount = conflicts.filter((item) => !SIDES.has(choices[item.id])).length;
  return { unresolvedCount, complete: !!comparison && !unresolvedCount, total: conflicts.length };
}

function resolutionText(comparison, choices) {
  const { unresolvedCount, total } = resolution(comparison, choices);
  return total ? `${countLabel(total - unresolvedCount, 'choix confirmé')} sur ${total}.${unresolvedCount ? ` Encore ${countLabel(unresolvedCount, 'choix à faire', 'choix à faire')}.` : ' Tous les conflits sont résolus.'}` : 'Aucun conflit à résoudre. Les ajouts des deux copies sont conservés par défaut.';
}

/** Pure markup builder, also used to verify escaping and document privacy. */
export function mergeComparisonMarkup(comparison, choices = {}, { localLabel = 'Cet appareil', incomingLabel = 'Sauvegarde', prefix = 'merge' } = {}) {
  if (!comparison) return '';
  if (!comparison.differences.length) return '<div class="merge-empty"><strong>Aucune différence de contenu.</strong><p>Les deux copies contiennent les mêmes données. Le véhicule sélectionné et l’ordre des fiches ne nécessitent pas de fusion.</p></div>';
  const options = { localLabel, incomingLabel, prefix };
  const groups = new Map();
  for (const difference of comparison.differences) {
    const context = Array.isArray(difference.context) ? difference.context.join(' · ') : difference.context || 'Garage';
    if (!groups.has(context)) groups.set(context, []);
    groups.get(context).push(difference);
  }
  const conflictCount = comparison.differences.filter((item) => item.conflict).length;
  const toolbar = `<div class="merge-overview"><p><strong>${countLabel(comparison.differences.length, 'différence')}</strong> · ${countLabel(conflictCount, 'conflit')}</p><p class="merge-explanation">Seules les différences sont affichées. Un élément absent d’une copie est conservé par défaut : cette absence ne prouve pas une suppression.</p>${conflictCount ? `<div class="merge-bulk"><span>Pour tous les conflits :</span><button type="button" class="ghost-button" data-merge-all="local">Utiliser ${esc(localLabel)}</button><button type="button" class="ghost-button" data-merge-all="incoming">Utiliser ${esc(incomingLabel)}</button></div>` : ''}<p class="merge-resolution-status" role="status" aria-live="polite">${esc(resolutionText(comparison, choices))}</p></div>`;
  const body = [...groups].map(([context, differences]) => {
    const open = groups.size <= 4 || differences.some((item) => item.conflict);
    const items = differences.map((difference) => {
      const atomic = atomicChanges({ ...difference,
        local: Object.hasOwn(difference, 'displayLocal') ? difference.displayLocal : difference.local,
        incoming: Object.hasOwn(difference, 'displayIncoming') ? difference.displayIncoming : difference.incoming,
      });
      return `<article class="merge-difference" data-merge-difference="${esc(difference.id)}"><div class="merge-field-heading"><h4>${esc(difference.label)}</h4><span class="merge-kind">${difference.conflict ? 'Valeurs différentes' : difference.localPresent ? `Présent uniquement dans ${esc(localLabel)}` : `Présent uniquement dans ${esc(incomingLabel)}`}</span></div><div class="merge-values">${sideValue(difference, 'local', localLabel, atomic)}${sideValue(difference, 'incoming', incomingLabel, atomic)}</div>${differenceChoice(difference, choices, options)}${difference.consequence ? `<p class="merge-consequence">${esc(difference.consequence)}</p>` : ''}</article>`;
    }).join('');
    return `<details class="merge-group"${open ? ' open' : ''}><summary><span>${esc(context)}</span><span class="merge-group-count">${countLabel(differences.length, 'différence')}</span></summary><div class="merge-group-body">${items}</div></details>`;
  }).join('');
  return `<div class="backup-merge">${toolbar}<div class="merge-groups">${body}</div></div>`;
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
      if (select.value) select.removeAttribute('aria-invalid');
      else select.setAttribute('aria-invalid', 'true');
    });
    container.addEventListener('click', (event) => {
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

  choose(id, side, redraw = true) {
    if (!this.comparison?.differences.some((item) => item.id === id)) return;
    if (SIDES.has(side)) this.selections[id] = side;
    else if (side === '') delete this.selections[id];
    else return;
    if (redraw) this.render();
    else {
      const status = this.container.querySelector('.merge-resolution-status');
      if (status) status.textContent = resolutionText(this.comparison, this.selections);
    }
    this.notify();
  }

  chooseAll(side) {
    if (!SIDES.has(side) || !this.comparison) return;
    for (const difference of this.comparison.differences) if (difference.conflict) this.selections[difference.id] = side;
    this.render(); this.notify();
    this.container.querySelector(`[data-merge-all="${side}"]`)?.focus?.();
  }

  render() { this.container.innerHTML = mergeComparisonMarkup(this.comparison, this.selections, this); }

  notify() { this.onChange({ choices: this.choices, complete: this.complete, unresolvedCount: this.unresolvedCount, hasDifferences: this.hasDifferences }); }
}
