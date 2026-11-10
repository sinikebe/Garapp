import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage } from '../public/assets/js/garage.js';
import { commitImport, commitMerge } from '../public/assets/js/workspace-transactions.js';
import { compareGarages } from '../public/assets/js/backup-merge.js';

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

test('a merge preserves both original copies before committing the combined garage', async () => {
  const current = garage('local fictif'), incoming = { ...garage('distant fictif'), sourceOnly: 'Information fictive ajoutée' };
  const raw = JSON.stringify(incoming, null, 4);
  const comparison = compareGarages(current, incoming);
  const conflict = comparison.differences.find((entry) => entry.conflict);
  const calls = [];
  const repository = {
    checkpoint: async (value, reason) => calls.push(['checkpoint', value, reason]),
    archiveRaw: async (value, reason) => calls.push(['archive', value, reason]),
    save: async (value) => calls.push(['save', value]),
  };
  const result = await commitMerge(repository, current, incoming, { [conflict.id]: 'local' }, raw);
  assert.deepEqual(calls.map(([operation]) => operation), ['checkpoint', 'archive', 'save']);
  assert.equal(calls[0][1], current);
  assert.equal(calls[0][2], 'merge');
  assert.equal(calls[1][1], raw);
  assert.equal(calls[1][2], 'merge-source');
  assert.equal(result.archive.name, 'local fictif');
  assert.equal(result.sourceOnly, incoming.sourceOnly);
  assert.equal(calls[2][1], result);
});

test('unresolved merge choices or a mismatched source cannot create archives or write the garage', async () => {
  const current = garage('local fictif'), incoming = garage('distant fictif');
  const comparison = compareGarages(current, incoming);
  const calls = [];
  const repository = { checkpoint: async () => calls.push('checkpoint'), archiveRaw: async () => calls.push('archive'), save: async () => calls.push('save') };
  await assert.rejects(commitMerge(repository, current, incoming), /Choisir/);
  await assert.rejects(commitMerge(repository, current, incoming, { [comparison.differences[0].id]: 'incoming' }, JSON.stringify(garage('Autre source fictive'))), /source/);
  assert.deepEqual(calls, []);
});

test('failure to archive either source or persist a merge leaves the current model unchanged', async () => {
  for (const failure of ['checkpoint', 'archive', 'save']) {
    const current = garage('local fictif'), incoming = { ...current, sourceOnly: 'Ajout fictif' }, before = structuredClone(current);
    const calls = [];
    const operation = (name) => async () => { calls.push(name); if (name === failure) throw Error('Quota fictif'); };
    const repository = { checkpoint: operation('checkpoint'), archiveRaw: operation('archive'), save: operation('save') };
    await assert.rejects(commitMerge(repository, current, incoming), /Quota fictif/);
    assert.deepEqual(current, before);
    assert.deepEqual(calls, failure === 'checkpoint' ? ['checkpoint'] : failure === 'archive' ? ['checkpoint', 'archive'] : ['checkpoint', 'archive', 'save']);
  }
});
