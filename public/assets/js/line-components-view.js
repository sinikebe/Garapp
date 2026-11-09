/** Component selection for a single priced line; the amount belongs to the line. */
import { lineComponentIds } from './garage.js';
import { escapeHtml as esc } from './ui-format.js';

export function lineComponentPicker(line, components) {
  const selected = new Set(lineComponentIds(line));
  const hintId = `line-components-hint-${line.id}`;
  const choices = components.length
    ? `<div class="checkbox-grid line-component-choices">${components.map((part) => `<label><input type="checkbox" data-line-component value="${esc(part.id)}"${selected.has(part.id) ? ' checked' : ''}><span>${esc(part.name)}</span></label>`).join('')}</div>`
    : '<p class="hint">Aucun composant enregistré. Vous pouvez en créer pour cette ligne.</p>';
  return `<fieldset class="full-width line-components" aria-describedby="${esc(hintId)}"><legend>Composants de la ligne</legend><p class="hint" id="${esc(hintId)}">Sélectionnez tous les composants concernés. Le montant de la ligne est compté une seule fois.</p>${choices}<div class="line-new-components" data-line-new-components></div><button type="button" class="text-button" data-add-line-component>Créer un composant pour cette ligne</button></fieldset>`;
}

export function newLineComponentEditor(id, name = '') {
  return `<div class="line-new-component-row" data-new-line-component="${esc(id)}"><label>Nom du nouveau composant<input data-line-component-name required maxlength="2000" value="${esc(name)}" placeholder="Ex. Filtre à air"></label><button type="button" class="text-button" data-remove-line-component aria-label="Retirer ce nouveau composant">Retirer</button></div>`;
}

/** Line inputs deliberately have no record-level componentIds form name. */
export function readLineComponentIds(row) {
  return [...new Set([...row.querySelectorAll('input[data-line-component]:checked')].map((input) => input.value))];
}
