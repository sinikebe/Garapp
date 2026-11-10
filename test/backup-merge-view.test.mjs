import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeComparisonMarkup, MergeComparisonView } from '../public/assets/js/backup-merge-view.js';

const changed = (id, values = {}) => ({ id, kind: 'changed', context: ['Véhicule fictif', 'Intervention fictive'], path: ['vehicles', 'example', 'records', 'service', 'totalAmount'], label: 'Montant total', local: '199.9901', incoming: '205.001', localPresent: true, incomingPresent: true, conflict: true, ...values });
const incomingOnly = { id: 'addition', kind: 'incoming-only', context: ['Véhicule fictif'], path: ['vehicles', 'example', 'records', 'new'], label: 'Nouvelle intervention', localPresent: false, incomingPresent: true, incoming: { title: 'Entretien fictif', date: '2026-01-02' }, conflict: false };
const comparison = () => ({ differences: [changed('amount'), incomingOnly] });

function container() {
  const handlers = {}, status = { textContent: '' };
  return { innerHTML: '', handlers, status, addEventListener: (type, fn) => { handlers[type] = fn; }, contains: () => true, querySelector: () => status };
}

test('comparison shows only supplied differences with exact values and unresolved choices', () => {
  const source = comparison(), before = structuredClone(source);
  const html = mergeComparisonMarkup(source, {}, { incomingLabel: 'Version Drive' });
  assert.match(html, /2 différences/);
  assert.match(html, /1 conflit/);
  assert.match(html, /199\.9901/);
  assert.match(html, /205\.001/);
  assert.match(html, /data-merge-choice="amount" aria-invalid="true"/);
  assert.match(html, /value="" selected>Choisir/);
  assert.match(html, /data-merge-choice="addition"><option value="incoming" selected>Conserver/);
  assert.match(html, /Absent de cette copie/);
  assert.match(html, /Version Drive/);
  assert.doesNotMatch(html, /Kilométrage|Fiches identiques/);
  assert.deepEqual(source, before);
});

test('identical copies have no comparison rows or choice controls', () => {
  const html = mergeComparisonMarkup({ differences: [] });
  assert.match(html, /Aucune différence de contenu/);
  assert.doesNotMatch(html, /data-merge-choice|data-merge-all|<select/);
  assert.equal(mergeComparisonMarkup(null), '');
});

test('untrusted labels, contexts and values remain text in both markup and attributes', () => {
  const payload = '"><img src=x onerror=alert(1)>';
  const html = mergeComparisonMarkup({ differences: [changed(payload, { context: [payload], label: payload, local: payload, incoming: { [payload]: payload } })] }, {}, { localLabel: payload, incomingLabel: payload, prefix: payload });
  assert.doesNotMatch(html, /<img|<script|onerror="/);
  assert.match(html, /&quot;&gt;&lt;img/);
});

test('documents expose metadata and a content-change notice without embedding binary data', () => {
  const doc = { id: 'example-doc', name: 'Justificatif fictif.pdf', mimeType: 'application/pdf', size: 12, dataUrl: 'data:application/pdf;base64,UFJJVkFURUJZVEVT', description: 'Pièce fictive' };
  const html = mergeComparisonMarkup({ differences: [changed('doc', { label: 'Document', local: doc, incoming: { ...doc, dataUrl: 'data:application/pdf;base64,QVVUUkVTQllURVM=' } }), { ...incomingOnly, incoming: { title: 'Document imbriqué fictif', documents: [doc] } }] });
  assert.match(html, /Justificatif fictif\.pdf/);
  assert.match(html, /application\/pdf/);
  assert.match(html, /12 octets/);
  assert.match(html, /Le contenu du fichier diffère/);
  assert.doesNotMatch(html, /UFJJVkFURUJZVEVT|QVVUUkVTQllURVM=|data:application\/pdf/);
  const rawField = mergeComparisonMarkup({ differences: [changed('payload', { local: doc.dataUrl, incoming: null })] });
  assert.doesNotMatch(rawField, /UFJJVkFURUJZVEVT/);
});

test('long values are bounded and expanded text remains escaped', () => {
  const html = mergeComparisonMarkup({ differences: [changed('long', { local: '<script>'.repeat(1000), incoming: ['Fictif'] })] });
  assert.match(html, /Lire le texte \(extrait\)/);
  assert.match(html, /télécharger la copie/);
  assert.doesNotMatch(html, /<script>/);
  assert.ok(html.length < 12000);
});

test('a difference beyond the text preview remains visible without exposing the whole value', () => {
  const common = 'Texte fictif. '.repeat(400);
  const html = mergeComparisonMarkup({ differences: [changed('long-tail', { local: `${common}ANCIENNE VALEUR`, incoming: `${common}NOUVELLE VALEUR` })] });
  assert.match(html, /Première différence au caractère/);
  assert.match(html, /ANCIENNE VALEUR/);
  assert.match(html, /NOUVELLE VALEUR/);
});

test('record lifecycle and resolved association labels are understandable', () => {
  const html = mergeComparisonMarkup({ differences: [
    changed('lifecycle', { label: 'Classement', lifecycle: true, local: { state: 'active' }, incoming: { state: 'trash', metadata: { deletedAt: '2026-02-03T10:00:00.000Z' } } }),
    changed('links', { local: ['part-1'], incoming: ['part-2'], displayLocal: ['Filtre fictif [part-1]'], displayIncoming: ['Bougie fictive [part-2]'] }),
  ] });
  assert.match(html, /Fiche active/);
  assert.match(html, /Dans la corbeille/);
  assert.match(html, /Mise à la corbeille/);
  assert.match(html, /Filtre fictif \[part-1\]/);
  assert.match(html, /Bougie fictive \[part-2\]/);
  assert.doesNotMatch(html, />state<|>metadata</);
});

test('atomic arrays show only changed entries even beyond the former preview limit', () => {
  const local = Array.from({ length: 12 }, (_, index) => ({ id: `fictif-${index}`, nested: { reference: `identique-${index}` } }));
  const incoming = structuredClone(local);
  incoming[10].nested.reference = 'Nouvelle référence fictive';
  const html = mergeComparisonMarkup({ differences: [changed('array', { local, incoming })] });
  assert.match(html, /Élément 11 · nested · reference/);
  assert.match(html, /identique-10/);
  assert.match(html, /Nouvelle référence fictive/);
  assert.doesNotMatch(html, /identique-0|identique-11|fictif-0/);
  const mapped = mergeComparisonMarkup({ differences: [changed('mapped', { local: [], incoming: [], displayLocal: Array.from({ length: 10 }, (_, index) => `Composant fictif ${index}`), displayIncoming: [...Array.from({ length: 9 }, (_, index) => `Composant fictif ${index}`), 'Autre composant fictif'] })] });
  assert.match(mapped, /Composant fictif 9/);
  assert.match(mapped, /Autre composant fictif/);
  assert.doesNotMatch(mapped, /Composant fictif 0/);
});

test('deep document metadata changes are visible without repeating unchanged document fields', () => {
  const local = { id: 'example-doc', name: 'Fichier fictif.pdf', mimeType: 'application/pdf', size: 3, dataUrl: 'data:application/pdf;base64,QUJD', sourceProperties: { nested: { deep: { one: 'Ancienne donnée fictive' } } } };
  const incoming = structuredClone(local);
  incoming.sourceProperties.nested.deep.one = 'Nouvelle donnée fictive';
  const html = mergeComparisonMarkup({ differences: [changed('doc-meta', { label: 'Document « Fichier fictif.pdf »', local, incoming })] });
  assert.match(html, /sourceProperties · nested · deep · one/);
  assert.match(html, /Ancienne donnée fictive/);
  assert.match(html, /Nouvelle donnée fictive/);
  assert.doesNotMatch(html, /QUJD|application\/pdf|contenu du fichier diffère/);
});

test('merge consequences are visible and escaped next to the related choice', () => {
  const html = mergeComparisonMarkup({ differences: [{ ...incomingOnly, consequence: 'L’échéance fictive exclue ne sera pas recréée. <exemple>' }] });
  assert.match(html, /class="merge-consequence">L’échéance fictive exclue ne sera pas recréée. &lt;exemple&gt;/);
});

test('record previews translate known fields and enums without rounding exact amounts', () => {
  const html = mergeComparisonMarkup({ differences: [{ ...incomingOnly, entity: 'record', wrappedRecord: true, incoming: {
    location: { state: 'active' }, record: { id: 'fictif', title: 'Intervention fictive', type: 'revision', status: 'done', partsAmount: '199.9901', laborAmount: '20.005' },
  } }] });
  assert.match(html, /Montant des pièces/);
  assert.match(html, /Main-d’œuvre \/ prestation/);
  assert.match(html, />Révision</);
  assert.match(html, />Réalisé</);
  assert.match(html, /199\.9901/);
  assert.match(html, /20\.005/);
  assert.doesNotMatch(html, />partsAmount<|>laborAmount<|>done<|>revision</);
});

test('known scalar conflicts use domain vocabulary while extension values stay literal', () => {
  const html = mergeComparisonMarkup({ differences: [
    changed('state', { path: ['vehicles', 'v', 'records', 'r', 'status'], local: 'done', incoming: 'planned' }),
    changed('line', { path: ['vehicles', 'v', 'records', 'r', 'lines', 'l', 'kind'], local: 'part', incoming: 'bundle' }),
    changed('effect', { path: ['vehicles', 'v', 'records', 'r', 'lines', 'l', 'effect'], local: 'none', incoming: 'replace' }),
    changed('extension', { path: ['vehicles', 'v', 'records', 'r', 'sourceProperties', 'status'], label: 'État de la source fictive', local: 'done', incoming: 'status-custom' }),
  ] });
  assert.match(html, />Réalisé</);
  assert.match(html, />Prévu</);
  assert.match(html, />Pièce \/ consommable</);
  assert.match(html, />Forfait</);
  assert.match(html, />Sans effet sur le suivi</);
  assert.match(html, />Remplacement \/ renouvellement</);
  assert.match(html, />done</);
  assert.match(html, />status-custom</);
});

test('choices require explicit conflict resolution and reset for a new comparison', () => {
  const events = [], element = container();
  const view = new MergeComparisonView({ container: element, onChange: (state) => events.push(state) });
  assert.equal(view.complete, false);
  view.setComparison(comparison());
  assert.equal(view.complete, false);
  assert.equal(view.unresolvedCount, 1);
  assert.equal(view.hasDifferences, true);
  view.choose('amount', 'incoming');
  assert.equal(view.complete, true);
  assert.deepEqual(view.choices, { amount: 'incoming' });
  const leaked = view.choices; leaked.amount = 'local';
  assert.equal(view.choices.amount, 'incoming');
  view.setComparison(comparison());
  assert.deepEqual(view.choices, {});
  assert.equal(view.complete, false);
  view.setComparison({ differences: [] });
  assert.equal(view.complete, true);
  assert.equal(view.hasDifferences, false);
  view.setComparison(null);
  assert.equal(view.complete, false);
  assert.equal(element.innerHTML, '');
  assert.equal(events.at(-1).hasDifferences, false);
});

test('bulk selection resolves only conflicts and preserves an explicit addition exclusion', () => {
  const view = new MergeComparisonView({ container: container() });
  view.setComparison({ differences: [changed('one'), changed('two'), incomingOnly] });
  view.choose('addition', 'local');
  view.chooseAll('incoming');
  assert.deepEqual(view.choices, { addition: 'local', one: 'incoming', two: 'incoming' });
  assert.equal(view.complete, true);
  view.choose('one', '');
  assert.equal(view.complete, false);
  assert.equal(view.unresolvedCount, 1);
  view.choose('unknown', 'local'); view.chooseAll('invalid');
  assert.deepEqual(view.choices, { addition: 'local', two: 'incoming' });
});

test('delegated selection updates status without replacing controls or losing focus', () => {
  const element = container(), view = new MergeComparisonView({ container: element });
  view.setComparison(comparison());
  const before = element.innerHTML;
  const select = { dataset: { mergeChoice: 'amount' }, value: 'local', closest() { return this; }, removeAttribute() {}, setAttribute() {} };
  element.handlers.change({ target: select });
  assert.equal(view.complete, true);
  assert.equal(element.innerHTML, before);
  assert.match(element.status.textContent, /Tous les conflits sont résolus/);
});
