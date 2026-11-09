import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage } from '../public/assets/js/garage.js';
import { commitImport } from '../public/assets/js/workspace-transactions.js';

const garage = (name) => parseGarage(JSON.stringify({ version: 2, archive: { name }, vehicles: [] }));

test('an import persists a recovery copy before replacing the active storage', async () => {
  const current = garage('original fictif'), incoming = garage('import fictif');
  const calls = [];
  const repository = { checkpoint: async (value) => calls.push(['checkpoint', value]), save: async (value) => calls.push(['save', value]) };
  const result = await commitImport(repository, current, incoming);
  assert.deepEqual(calls.map(([operation]) => operation), ['checkpoint', 'save']);
  assert.equal(calls[0][1], current);
  assert.equal(calls[1][1], result);
  assert.deepEqual(result.archive, incoming.archive);
  assert.deepEqual(current, garage('original fictif'));
});

test('failed recovery or persistence aborts import without changing the open model', async () => {
  for (const failure of ['checkpoint', 'save']) {
    const current = garage('original fictif'), incoming = garage('import fictif'), before = structuredClone(current);
    const calls = [];
    const operation = (name) => async () => { calls.push(name); if (name === failure) throw Error('Quota fictif'); };
    const repository = { checkpoint: operation('checkpoint'), save: operation('save') };
    await assert.rejects(commitImport(repository, current, incoming), /Quota fictif/);
    assert.deepEqual(current, before);
    assert.deepEqual(calls, failure === 'checkpoint' ? ['checkpoint'] : ['checkpoint', 'save']);
  }
});
