import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exampleGarage, parseGarage } from '../public/assets/js/garage.js';
import { backupBlob, fingerprint } from '../public/assets/js/backups.js';
import { DRIVE_FOLDER, assertFolder, driveNamespace, garageHash, makeSnapshot, readSnapshot, revisionGraph, snapshotInfo } from '../public/assets/js/drive-format.js';
import { DriveSync } from '../public/assets/js/drive-sync.js';
import { DriveError } from '../public/assets/js/drive-api.js';
import { moveRecordToTrash, restoreTrashedRecord } from '../public/assets/js/record-trash.js';

const namespace = await driveNamespace('https://example.test/Garapp/dev/');
const fixture = parseGarage(await readFile(new URL('../docs/examples/garage-v2.json', import.meta.url), 'utf8'));
const data = () => structuredClone(fixture);
const privateFile = { ownedByMe: true, shared: false, trashed: false, capabilities: { canEdit: true, canDownload: true } };
const settings = () => ({ value: null, fail: false, async load() { return structuredClone(this.value); }, async save(value) { if (this.fail) throw Error('Quota fictif'); this.value = structuredClone(value); } });

class FakeDrive {
  constructor() { this.files = new Map(); this.counter = 0; this.hidden = new Set(); this.failUpload = false; this.beforeUpload = null; this.afterUpload = null; this.afterDownload = null; this.downloads = 0; this.writes = 0; }
  close() {}
  async get(id) { if (!this.files.has(id)) throw new DriveError(404); return structuredClone(this.files.get(id).file); }
  async list(query) {
    const parent = /^'([^']+)' in parents/.exec(query)?.[1];
    const kind = parent ? 'snapshot-v1' : 'workspace-v1';
    return [...this.files.values()].map(({ file }) => file).filter((file) => !this.hidden.has(file.id) && !file.trashed && file.appProperties.garapp === kind && (!parent || file.parents.includes(parent)) && query.includes(file.appProperties.namespace)).map((file) => structuredClone(file));
  }
  async createFolder(metadata) {
    const file = { ...structuredClone(metadata), ...structuredClone(privateFile), id: `folder-${++this.counter}` };
    this.files.set(file.id, { file }); return structuredClone(file);
  }
  async upload(metadata, blob) {
    await this.beforeUpload?.();
    if (this.failUpload) throw Error('Réseau fictif indisponible');
    const file = { ...structuredClone(metadata), ...structuredClone(privateFile), id: `file-${++this.counter}`, size: String(blob.size), sha256Checksum: await fingerprint(blob), createdTime: new Date(1800000000000 + this.counter * 1000).toISOString() };
    assert.equal(this.files.has(file.id), false);
    this.files.set(file.id, { file, blob }); this.writes++;
    await this.afterUpload?.(); return structuredClone(file);
  }
  async download(node) { this.downloads++; const blob = this.files.get(node.id)?.blob; if (!blob) throw new DriveError(404); await this.afterDownload?.(); return blob; }
}

async function device(api, initial = data()) {
  const model = { garage: initial, canApply: true, safe: true, failCommit: false, commits: 0 };
  const store = settings();
  const sync = new DriveSync({ namespace, settings: store, development: true, getGarage: () => model.garage,
    canSync: () => model.safe, canApply: () => model.canApply && model.safe,
    async applyRemote(incoming, expected) {
      assert.equal(model.garage, expected);
      if (model.failCommit) throw Error('Stockage local fictif saturé');
      const next = structuredClone(incoming);
      if (next.vehicles.some((vehicle) => vehicle.id === model.garage.activeId)) next.activeId = model.garage.activeId;
      model.garage = next; model.commits++;
    },
  });
  await sync.restore(); sync.api = api;
  return { sync, model, store };
}

async function pair() {
  const api = new FakeDrive(), a = await device(api), b = await device(api);
  assert.equal(await a.sync.create('Garage fictif de test'), true);
  assert.equal(await b.sync.bind(a.sync.state.binding.id), true);
  assert.equal(await b.sync.sync(), true);
  return { api, a, b };
}
const edit = (device, notes) => { device.model.garage = { ...device.model.garage, notes }; };

test('Drive JSONs preserve the complete portable fixture, unknown fields, exact decimals and embedded bytes', async () => {
  const snapshot = await makeSnapshot(data(), [], namespace, 'folder-fiction', true);
  const api = new FakeDrive();
  const file = await api.upload(snapshot.metadata, snapshot.blob);
  const node = snapshotInfo(file, namespace, 'folder-fiction');
  assert.deepEqual(await readSnapshot(snapshot.blob, node), data());
  assert.deepEqual(parseGarage(await snapshot.blob.text()), data());
  assert.equal(node.hash, await garageHash(data()));
  assert.match(file.name, /^garapp-dev-.*\.json$/);
  assert.equal(await garageHash({ ...data(), activeId: 'another-selection' }), node.hash);
  assert.notEqual(await garageHash({ ...data(), notes: 'Autre note fictive' }), node.hash);
  const reordered = Object.fromEntries(Object.entries(data()).reverse());
  assert.equal(await garageHash(reordered), node.hash);
});

test('origins and publication paths isolate Drive workspaces', async () => {
  assert.notEqual(namespace, await driveNamespace('https://example.test/Garapp/'));
  assert.notEqual(namespace, await driveNamespace('http://localhost:4173/'));
  assert.notEqual(namespace, await driveNamespace('https://another.test/Garapp/dev/'));
});

test('Drive preserves component placement and observation links without changing source metadata', async () => {
  const garage = data(), vehicle = garage.vehicles[0], part = vehicle.components[0];
  part.spatial = { kind: 'drum', zone: 'rear', side: 'unknown', presenceOrigin: 'record', source: { example: 'Position fictive' } };
  vehicle.records[0].observedComponentIds = [part.id];
  const snapshot = await makeSnapshot(garage, [], namespace, 'folder-fiction');
  const api = new FakeDrive(), file = await api.upload(snapshot.metadata, snapshot.blob);
  assert.deepEqual(await readSnapshot(snapshot.blob, snapshotInfo(file, namespace, 'folder-fiction')), garage);
});

test('Drive synchronizes trash and restoration with all embedded source content intact', async () => {
  const { api, a, b } = await pair();
  const vehicle = a.model.garage.vehicles[0];
  Object.assign(vehicle.records[0], { type: 'fuel', fuel: { litres: '12.345', fullTank: true, source: { label: 'Station fictive' } } });
  const record = structuredClone(vehicle.records[0]);
  a.model.garage = moveRecordToTrash(a.model.garage, vehicle.id, record.id, '2026-11-08T10:20:30.000Z');
  assert.equal(await a.sync.sync(), true);
  assert.equal(await b.sync.sync(), true);
  assert.deepEqual(b.model.garage.vehicles[0].trashedRecords, a.model.garage.vehicles[0].trashedRecords);
  assert.equal(b.model.garage.vehicles[0].records.some((one) => one.id === record.id), false);
  b.model.garage = restoreTrashedRecord(b.model.garage, vehicle.id, record.id);
  assert.equal(await b.sync.sync(), true);
  assert.equal(await a.sync.sync(), true);
  assert.deepEqual(a.model.garage.vehicles[0].records[0], record);
  assert.deepEqual(a.model.garage.vehicles[0].trashedRecords, []);
  const copies = [...api.files.values()].filter(({ blob }) => blob);
  assert.ok(copies.length >= 3);
  const savedTrash = await Promise.all(copies.map(async ({ blob }) => parseGarage(await blob.text())));
  assert.ok(savedTrash.some((copy) => copy.vehicles[0].trashedRecords?.[0]?.record.id === record.id));
});

test('revision parent properties stay within Google private-property limits', async () => {
  const parents = Array.from({ length: 60 }, () => crypto.randomUUID());
  const snapshot = await makeSnapshot(data(), parents, namespace, 'folder-fiction');
  const properties = snapshot.metadata.appProperties;
  assert.ok(Object.keys(properties).length <= 30);
  for (const [key, value] of Object.entries(properties)) assert.ok(Buffer.byteLength(key + value) <= 124);
  await assert.rejects(makeSnapshot(data(), [...parents, crypto.randomUUID()], namespace, 'folder-fiction'));
});

test('graphs refuse missing parents, duplicate revisions and cycles', () => {
  assert.throws(() => revisionGraph([{ revision: 'a', parents: ['missing'] }]), /incomplet/);
  assert.throws(() => revisionGraph([{ revision: 'a', parents: ['b'] }, { revision: 'b', parents: ['a'] }]), /incomplet/);
  assert.throws(() => revisionGraph([{ revision: 'a', parents: [] }, { revision: 'a', parents: [] }]), /incomplet/);
  assert.equal(revisionGraph([{ revision: 'a', parents: [] }, { revision: 'b', parents: ['a'] }]).heads[0].revision, 'b');
});

test('a private workspace is required; shared folders, other owners and other environments are refused', () => {
  const folder = { ...privateFile, id: 'fiction', mimeType: DRIVE_FOLDER, appProperties: { garapp: 'workspace-v1', namespace } };
  assert.equal(assertFolder(folder, namespace), folder);
  for (const patch of [{ shared: true }, { ownedByMe: false }, { driveId: 'shared-drive-fiction' }, { trashed: true }, { capabilities: { canEdit: false } }]) assert.throws(() => assertFolder({ ...folder, ...patch }, namespace));
  assert.throws(() => assertFolder(folder, 'another-namespace'));
});

test('two devices exchange complete saved garages and retain every previous JSON', async () => {
  const { api, a, b } = await pair();
  const original = await backupBlob(a.model.garage).text();
  edit(a, 'Une modification fictive complète');
  assert.equal(await a.sync.sync(), true);
  assert.equal(await b.sync.sync(), true);
  assert.deepEqual(b.model.garage, a.model.garage);
  assert.equal(b.model.commits, 1);
  assert.equal(api.writes, 2);
  assert.ok([...api.files.values()].some(({ blob }) => blob && blob.size === new Blob([original]).size));
  assert.equal(a.sync.state.baseline.hash, b.sync.state.baseline.hash);
  // An unchanged polling cycle checks metadata without downloading all documents.
  const downloads = api.downloads;
  await b.sync.sync(); assert.equal(api.downloads, downloads);
});

test('first connection to a different garage only offers comparison, then archives the local copy before replacement', async () => {
  const api = new FakeDrive(), a = await device(api), b = await device(api, exampleGarage('2026-11-06'));
  await a.sync.create('Garage fictif distant');
  const previous = structuredClone(b.model.garage);
  await b.sync.bind(a.sync.state.binding.id); await b.sync.sync();
  assert.deepEqual(b.model.garage, previous); assert.equal(api.writes, 1); assert.equal(b.sync.state.baseline, undefined);
  await b.sync.compare(a.sync.graph.heads[0].revision);
  assert.equal(await b.sync.resolve('remote'), true);
  assert.deepEqual(b.model.garage, a.model.garage);
  assert.equal(api.writes, 3);
  const all = await Promise.all([...api.files.values()].filter(({ blob }) => blob).map(async ({ blob }) => parseGarage(await blob.text())));
  assert.ok(all.some((garage) => JSON.stringify(garage) === JSON.stringify(previous)));
  assert.equal(b.sync.graph.heads.length, 1);
});

test('simultaneous edits become separate branches, and explicit resolution keeps both', async () => {
  const { api, a, b } = await pair();
  edit(a, 'Modification fictive appareil A'); edit(b, 'Modification fictive appareil B');
  let arrivals = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  api.beforeUpload = async () => { if (++arrivals === 2) release(); await gate; };
  await Promise.all([a.sync.sync(), b.sync.sync()]); api.beforeUpload = null;
  await a.sync.refresh();
  assert.equal(a.sync.graph.heads.length, 2);
  assert.equal(api.writes, 3);
  assert.equal(a.model.garage.notes, 'Modification fictive appareil A');
  assert.equal(b.model.garage.notes, 'Modification fictive appareil B');
  const chosen = a.sync.graph.heads.find((head) => head.hash === b.sync.state.baseline.hash);
  await a.sync.compare(chosen.revision); assert.equal(await a.sync.resolve('remote'), true);
  assert.equal(a.model.garage.notes, b.model.garage.notes);
  assert.equal(a.sync.graph.heads.length, 1);
  assert.equal(api.writes, 4);
  const oldCopies = await Promise.all([...api.files.values()].filter(({ blob }) => blob).map(async ({ blob }) => parseGarage(await blob.text())));
  for (const notes of ['Modification fictive appareil A', 'Modification fictive appareil B']) assert.ok(oldCopies.some((garage) => garage.notes === notes));
  await b.sync.sync(); assert.equal(b.model.commits, 0);
});

test('receiving a newer version waits for open edits and never advances a failed local commit', async () => {
  const { a, b } = await pair(); const before = structuredClone(b.model.garage), baseline = structuredClone(b.sync.state.baseline);
  edit(a, 'Mise à jour fictive à recevoir'); await a.sync.sync();
  b.model.canApply = false; await b.sync.sync();
  assert.deepEqual(b.model.garage, before); assert.deepEqual(b.sync.state.baseline, baseline);
  b.model.canApply = true; b.model.failCommit = true;
  assert.equal(await b.sync.sync(), false); assert.match(b.sync.error, /saturé/);
  assert.deepEqual(b.model.garage, before); assert.deepEqual(b.sync.state.baseline, baseline);
  b.model.failCommit = false; await b.sync.sync(); assert.deepEqual(b.model.garage, a.model.garage);
});

test('network or quota failures leave the last acknowledged revision intact', async () => {
  const { api, a } = await pair(); edit(a, 'Copie fictive non envoyée');
  const before = structuredClone(a.sync.state.baseline), current = a.model.garage;
  api.failUpload = true; assert.equal(await a.sync.sync(), false);
  assert.deepEqual(a.sync.state.baseline, before); assert.equal(a.model.garage, current); assert.equal(api.writes, 1);
  api.failUpload = false; a.store.fail = true; assert.equal(await a.sync.sync(), true);
  assert.match(a.sync.notice, /ne peut pas être mémorisé/); assert.equal(api.writes, 2);
  await a.sync.sync(); assert.equal(api.writes, 2);
});

test('edits made during an upload remain dirty and are sent as a subsequent version', async () => {
  const { api, a } = await pair(); edit(a, 'Première modification fictive');
  api.afterUpload = () => { api.afterUpload = null; edit(a, 'Deuxième modification fictive pendant le transfert'); };
  await a.sync.sync(); assert.equal(api.writes, 2);
  assert.notEqual(a.sync.state.baseline.hash, await garageHash(a.model.garage));
  await a.sync.sync(); assert.equal(api.writes, 3);
  assert.equal(a.sync.state.baseline.hash, await garageHash(a.model.garage));
});

test('a local edit during download prevents automatic replacement', async () => {
  const { api, a, b } = await pair(); edit(a, 'Version distante fictive'); await a.sync.sync();
  api.afterDownload = () => { api.afterDownload = null; edit(b, 'Nouvelle modification locale fictive'); };
  await b.sync.sync();
  assert.equal(b.model.garage.notes, 'Nouvelle modification locale fictive'); assert.equal(b.model.commits, 0);
  await b.sync.sync(); assert.match(b.sync.status, /concurrentes/);
});

test('a deleted, moved, shared or externally changed revision cannot replace local data', async () => {
  for (const kind of ['deleted', 'moved', 'shared', 'corrupt']) {
    const { api, a, b } = await pair(); edit(a, `Modification fictive ${kind}`); await a.sync.sync();
    const latest = a.sync.graph.heads[0], entry = api.files.get(latest.id), original = b.model.garage;
    if (kind === 'deleted') api.files.delete(b.sync.state.baseline.heads[0].id);
    if (kind === 'moved') api.files.get(b.sync.state.baseline.heads[0].id).file.parents = ['another-folder'];
    if (kind === 'shared') entry.file.shared = true;
    if (kind === 'corrupt') entry.file.sha256Checksum = '0'.repeat(64);
    assert.equal(await b.sync.sync(), false, kind); assert.equal(b.model.garage, original); assert.equal(b.model.commits, 0);
  }
});

test('a temporarily stale Drive index is supplemented with the acknowledged file ID', async () => {
  const { api, a } = await pair(); edit(a, 'Nouvelle version fictive'); await a.sync.sync();
  api.hidden.add(a.sync.state.baseline.heads[0].id);
  await a.sync.sync(); assert.equal(a.sync.graph.heads[0].hash, await garageHash(a.model.garage));
  assert.equal(api.writes, 2);
});

test('a stale comparison never archives or overwrites an unreviewed newer version', async () => {
  const { api, a, b } = await pair();
  await b.sync.compare(a.sync.graph.heads[0].revision);
  edit(a, 'Changement fictif après comparaison'); await a.sync.sync();
  const writes = api.writes;
  assert.equal(await b.sync.resolve('remote'), false); assert.match(b.sync.error, /nouvelle version/); assert.equal(api.writes, writes); assert.equal(b.model.commits, 0);
});

test('a historical restore creates a new head while retaining the newer content', async () => {
  const { api, a } = await pair(); const original = data(), oldest = a.sync.graph.heads[0].revision;
  edit(a, 'Contenu fictif plus récent'); await a.sync.sync();
  await a.sync.compare(oldest); assert.equal(await a.sync.resolve('remote'), true);
  assert.deepEqual(a.model.garage, original); assert.equal(a.sync.graph.heads.length, 1); assert.equal(api.writes, 3);
  assert.ok([...api.files.values()].some(({ file }) => file.appProperties.hash === a.sync.graph.nodes.find((node) => node.parents.length === 1).hash));
});

test('an explicit restore that fails locally keeps its archive and can be completed on retry', async () => {
  const { api, a, b } = await pair(); const before = structuredClone(b.model.garage);
  edit(a, 'Version fictive choisie malgré un stockage plein'); await a.sync.sync();
  await b.sync.compare(a.sync.graph.heads[0].revision);
  b.model.failCommit = true;
  assert.equal(await b.sync.resolve('remote'), false);
  assert.deepEqual(b.model.garage, before); assert.equal(api.writes, 3);
  assert.equal(b.sync.state.baseline.hash, await garageHash(before));
  b.model.failCommit = false;
  await b.sync.sync(); assert.deepEqual(b.model.garage, a.model.garage); assert.equal(api.writes, 3);
});

test('a different Google account cannot receive an automatic copy in place of a missing bound folder', async () => {
  const { a } = await pair(); const baseline = structuredClone(a.sync.state.baseline);
  edit(a, 'Modification fictive pour le compte initial');
  const otherAccount = new FakeDrive(); a.sync.api = otherAccount;
  assert.equal(await a.sync.sync(), false); assert.equal(otherAccount.writes, 0);
  assert.deepEqual(a.sync.state.baseline, baseline); assert.match(a.sync.error, /introuvable/);
});

test('a concurrent write during explicit resolution remains a separate branch', async () => {
  const { api, a, b } = await pair(); await a.sync.compare(a.sync.graph.heads[0].revision);
  api.afterUpload = async () => {
    api.afterUpload = null; edit(b, 'Autre appareil fictif pendant le choix'); await b.sync.sync();
  };
  assert.equal(await a.sync.resolve('local'), true);
  assert.equal(a.sync.graph.heads.length, 2); assert.match(a.sync.status, /autre modification/);
  assert.equal(api.writes, 3);
});

test('opening a JSON import pauses automatic sync and prevents an in-flight pull', async () => {
  const { api, a, b } = await pair(); edit(a, 'Version distante fictive'); await a.sync.sync();
  b.sync.state.auto = true;
  api.afterDownload = () => { api.afterDownload = null; b.sync.pauseForImport(); };
  await b.sync.sync(); assert.equal(b.model.commits, 0); assert.equal(b.sync.state.auto, false);
  assert.match(b.sync.status, /pause/); assert.equal(b.store.value.auto, false);
});

test('persisted pointers can resume after reload without storing credentials or changing environments', async () => {
  const { api, a } = await pair(); edit(a, 'Modification fictive avant fermeture'); await a.sync.sync();
  const previous = structuredClone(a.store.value);
  const resumed = await device(api, a.model.garage); resumed.store.value = previous;
  await resumed.sync.restore(); resumed.sync.api = api;
  await resumed.sync.sync(); assert.equal(api.writes, 2);
  assert.doesNotMatch(JSON.stringify(resumed.store.value), /access_token|refresh_token|client_secret|Bearer/);
});

test('a malformed or truncated JSON is refused even if metadata claims a matching version', async () => {
  const snapshot = await makeSnapshot(data(), [], namespace, 'folder-fiction');
  const api = new FakeDrive(), file = await api.upload(snapshot.metadata, snapshot.blob), node = snapshotInfo(file, namespace, 'folder-fiction');
  await assert.rejects(readSnapshot(new Blob(['{}']), node), /incomplet/);
  const invalid = new Blob(['{"version":999}']);
  const corrupted = { ...node, size: invalid.size, wire: await fingerprint(invalid) };
  await assert.rejects(readSnapshot(invalid, corrupted), /Version/);
});
