import test from 'node:test';
import assert from 'node:assert/strict';
import { lineComponentPicker, newLineComponentEditor, readLineComponentIds } from '../public/assets/js/line-components-view.js';

const components = [
  { id: 'oil', name: 'Huile moteur fictive' },
  { id: 'air', name: 'Filtre à air fictif' },
  { id: 'cabin', name: 'Filtre habitacle fictif' },
];

test('line selection shows legacy and multiple links without record-level form names', () => {
  const line = { id: 'example-line', componentId: 'oil', componentIds: ['air'] };
  const before = structuredClone({ line, components });
  const html = lineComponentPicker(line, components);
  assert.match(html, /value="oil" checked/);
  assert.match(html, /value="air" checked/);
  assert.match(html, /value="cabin">/);
  assert.doesNotMatch(html, /\bname="componentIds"/);
  assert.match(html, /<fieldset[^>]+aria-describedby="line-components-hint-example-line"/);
  assert.match(html, /<legend>Composants de la ligne<\/legend>/);
  assert.match(html, /compté une seule fois/);
  assert.match(html, /<button type="button"[^>]*data-add-line-component/);
  assert.deepEqual({ line, components }, before);
});

test('an empty component list still offers inline creation without a fake selection', () => {
  const html = lineComponentPicker({ id: 'empty-line' }, []);
  assert.match(html, /Aucun composant enregistré/);
  assert.match(html, /data-line-new-components/);
  assert.match(html, /data-add-line-component/);
  assert.doesNotMatch(html, /<input/);
});

test('component names and editor values are escaped in labels and attributes', () => {
  const payload = '\"><img src=x onerror=alert(1)>';
  const picker = lineComponentPicker({ id: payload }, [{ id: payload, name: payload }]);
  const editor = newLineComponentEditor(payload, payload);
  for (const html of [picker, editor]) {
    assert.doesNotMatch(html, /<img|value=""><|data-new-line-component="">/);
    assert.match(html, /&quot;&gt;&lt;img/);
  }
  assert.match(editor, /<label>Nom du nouveau composant<input data-line-component-name required maxlength="2000"/);
  assert.match(editor, /<button type="button"[^>]*data-remove-line-component[^>]*aria-label=/);
  assert.doesNotMatch(editor, /\bname="componentIds"/);
});

test('the line reader returns selected references without mutating controls or reading the form', () => {
  const controls = [{ value: 'oil' }, { value: 'air' }, { value: 'oil' }];
  const before = structuredClone(controls);
  const row = { querySelectorAll(selector) {
    assert.equal(selector, 'input[data-line-component]:checked');
    return controls;
  } };
  assert.deepEqual(readLineComponentIds(row), ['oil', 'air']);
  assert.deepEqual(controls, before);
  assert.deepEqual(readLineComponentIds({ querySelectorAll: () => [] }), []);
});
