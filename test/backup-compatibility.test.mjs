import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseGarage, inventory } from '../public/assets/js/garage.js';
import { backupBlob, readBackupFile, fingerprint } from '../public/assets/js/backups.js';
import { makeSnapshot, readSnapshot, garageHash } from '../public/assets/js/drive-format.js';

const directory = new URL('./fixtures/backups/', import.meta.url);
const read = (name) => readFileSync(new URL(name, directory));
const manifest = JSON.parse(read('manifest.json'));

// Fixtures describe historical wire formats. Add new files instead of modernizing
// old ones: compatibility must be tested against bytes a previous release saved.
function sourcePreserved(original, actual, path = '') {
  if (Array.isArray(original)) {
    assert.equal(actual.length, original.length, path);
    original.forEach((entry, index) => sourcePreserved(entry, actual[index], `${path}[${index}]`));
  } else if (original !== null && typeof original === 'object') {
    for (const [key, value] of Object.entries(original)) {
      if (path === '' && key === 'version') continue;
      assert.ok(Object.hasOwn(actual, key), `${path}.${key}`);
      sourcePreserved(value, actual[key], `${path}.${key}`);
    }
  } else assert.deepEqual(actual, original, path);
}

function documents(value, output = []) {
  if (value && typeof value === 'object') {
    if (typeof value.dataUrl === 'string') output.push(Buffer.from(value.dataUrl.split(',')[1], 'base64'));
    for (const child of Object.values(value)) documents(child, output);
  }
  return output;
}

for (const [name, expectedHash] of Object.entries(manifest.files)) {
  test(`${name}: historical bytes survive import, export and Drive round trips`, async () => {
    const bytes = read(name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash, 'Historical fixture changed; add a new fixture instead.');
    const original = JSON.parse(bytes);
    const model = parseGarage(bytes.toString('utf8'));
    const imported = await readBackupFile(new File([backupBlob(model)], name));
    assert.deepEqual(imported.garage, model);
    sourcePreserved(original, imported.garage);
    assert.deepEqual(documents(imported.garage), documents(original));
    const snapshot = await makeSnapshot(model, [], 'example-namespace', 'example-folder');
    const node = {
      size: snapshot.blob.size, hash: snapshot.hash, wire: await fingerprint(snapshot.blob),
      counts: JSON.parse(snapshot.metadata.appProperties.counts),
    };
    assert.deepEqual(await readSnapshot(snapshot.blob, node), model);
    if (original.version === 1) {
      const record = model.vehicles[0].records[0];
      assert.equal(record.partsAmount, '123.45');
      assert.equal(record.laborAmount, '0.00');
      assert.equal(record.partsCents, 12345);
    }
  });
}

test('early Drive checksum validation precedes normalization by the current reader', async () => {
  const raw = read('v2-early.json');
  const normalized = parseGarage(raw.toString('utf8'));
  assert.notEqual(await garageHash(normalized), manifest.drive.hash, 'The fixture must exercise historical missing defaults.');
  assert.deepEqual(await readSnapshot(new Blob([raw]), manifest.drive), normalized);
});

test('historical Drive summaries do not reject intact files when inventory rules change', async () => {
  const raw = read('v2-early.json'), blob = new Blob([raw]);
  // An early writer could count only explicit sizes; current normalization
  // obtains the eight embedded bytes even when document.size was absent.
  const historical = { ...manifest.drive, counts: [1, 1, 1, 1, 1, 0] };
  assert.deepEqual(await readSnapshot(blob, historical), parseGarage(raw.toString('utf8')));
  await assert.rejects(readSnapshot(blob, { ...historical, wire: '0'.repeat(64) }));
  await assert.rejects(readSnapshot(blob, { ...historical, hash: '0'.repeat(64) }));
  await assert.rejects(readSnapshot(new Blob([raw, ' ']), historical));
});

test('new Drive snapshots hash their serialized model, even for minimal valid input', async () => {
  const minimal = { version: 2, vehicles: [{ id: 'minimal', name: 'Minimal example vehicle', records: [], components: [] }] };
  const snapshot = await makeSnapshot(minimal, [], 'example-namespace', 'example-folder');
  const node = { size: snapshot.blob.size, wire: snapshot.metadata.appProperties.wire, hash: snapshot.hash, counts: JSON.parse(snapshot.metadata.appProperties.counts) };
  assert.deepEqual(await readSnapshot(snapshot.blob, node), parseGarage(JSON.stringify(minimal)));
});

test('the complete archive retains fuel precision, contracts, planned records and trash', () => {
  const garage = parseGarage(read('v2-complete.json').toString('utf8'));
  const vehicle = garage.vehicles[0];
  assert.equal(vehicle.records[0].fuel.litres, '12.345678901234567890');
  assert.equal(vehicle.records[0].totalAmount, '25.000000000000000001');
  assert.equal(vehicle.records[1].status, 'planned');
  assert.equal(vehicle.insurances[0].tariffs[0].amount, '25.123456789012345678');
  assert.equal(vehicle.trashedRecords[0].record.totalAmount, '-0.005');
  assert.equal(inventory(garage).documents, 7);
});

test('a future schema is refused instead of being downgraded or partially imported', async () => {
  const future = { version: 3, vehicles: [], future: { data: 'Synthetic future content' } };
  const raw = JSON.stringify(future);
  assert.throws(() => parseGarage(raw), /Version/);
  await assert.rejects(readBackupFile(new File([raw], 'future.json')), /Version/);
  assert.throws(() => backupBlob(future), /Version/);
  assert.equal(JSON.stringify(future), raw);
});
