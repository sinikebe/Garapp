/** Immutable, independently importable JSON snapshots and their revision graph. */
import { MAX_BACKUP_BYTES, inventory, parseGarage } from './garage.js';
import { backupBlob, fingerprint } from './backups.js';

export const DRIVE_FOLDER = 'application/vnd.google-apps.folder';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const HASH = /^[a-f0-9]{64}$/;
const COUNT_FIELDS = ['vehicles', 'records', 'components', 'lines', 'documents', 'bytes'];
const REVISION = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const MAX_PARENTS = 60;
const invalid = () => Error('L’historique Drive est incomplet ou a été modifié. Les copies existantes sont conservées.');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Vehicle selection belongs to an individual device, not to the shared content. */
export async function garageHash(garage) {
  const { activeId, ...content } = garage;
  return fingerprint(new Blob([canonical(content)]));
}

export async function driveNamespace(base) {
  return (await fingerprint(new Blob([new URL('./', base).href]))).slice(0, 32);
}

export function assertPrivate(file) {
  if (!file?.id || file.trashed || file.ownedByMe !== true || file.shared === true || file.driveId || file.capabilities?.canEdit !== true) {
    throw Error('Ce dossier ou fichier Drive doit être privé, accessible et appartenir au compte connecté. Vérifiez le compte et le partage avant de réessayer.');
  }
  return file;
}

export function assertFolder(file, namespace) {
  assertPrivate(file);
  if (file.mimeType !== DRIVE_FOLDER || file.appProperties?.garapp !== 'workspace-v1' || file.appProperties.namespace !== namespace) throw Error('Ce dossier ne correspond pas à cette version de Garapp.');
  return file;
}

export async function makeSnapshot(garage, parents, namespace, folderId, development = false) {
  parents = [...new Set(parents)].sort();
  if (parents.length > MAX_PARENTS || parents.some((id) => !REVISION.test(id))) throw invalid();
  const blob = backupBlob(garage);
  const revision = crypto.randomUUID();
  const hash = await garageHash(garage);
  const count = inventory(garage);
  const appProperties = {
    garapp: 'snapshot-v1', namespace, revision, hash, wire: await fingerprint(blob), pc: String(parents.length),
    counts: JSON.stringify(COUNT_FIELDS.map((key) => count[key])),
  };
  for (let i = 0; i < parents.length; i += 3) appProperties[`p${i / 3}`] = JSON.stringify(parents.slice(i, i + 3));
  return { blob, hash, revision, parents, metadata: {
    name: `garapp${development ? '-dev' : ''}-${new Date().toISOString().replace(/:/g, '-')}-${revision.slice(0, 8)}.json`,
    mimeType: 'application/json', parents: [folderId], appProperties,
  } };
}

export function snapshotInfo(file, namespace, folderId) {
  assertPrivate(file);
  const props = file.appProperties ?? {};
  if (file.mimeType !== 'application/json' || !file.parents?.includes(folderId) || props.garapp !== 'snapshot-v1' || props.namespace !== namespace || !REVISION.test(props.revision) || !HASH.test(props.hash) || !HASH.test(props.wire)) throw invalid();
  const size = Number(file.size), count = Number(props.pc);
  if (!Number.isSafeInteger(size) || size < 2 || size > MAX_BACKUP_BYTES || !/^(0|[1-9]\d*)$/.test(props.pc) || count > MAX_PARENTS || file.sha256Checksum && file.sha256Checksum !== props.wire) throw invalid();
  let parents = [], counts;
  try {
    counts = JSON.parse(props.counts);
    for (let i = 0; i < Math.ceil(count / 3); i++) {
      const chunk = JSON.parse(props[`p${i}`]);
      if (!Array.isArray(chunk) || chunk.length !== Math.min(3, count - i * 3)) throw invalid();
      parents.push(...chunk);
    }
  } catch { throw invalid(); }
  if (!Array.isArray(counts) || counts.length !== 6 || counts.some((n) => !Number.isSafeInteger(n) || n < 0) || parents.some((id) => !REVISION.test(id) || id === props.revision) || new Set(parents).size !== count) throw invalid();
  return { id: file.id, revision: props.revision, parents, hash: props.hash, wire: props.wire, size, counts, at: file.createdTime, name: file.name, file };
}

/** Missing ancestors and cycles are errors, never evidence of an empty garage. */
export function revisionGraph(nodes) {
  const byRevision = new Map();
  for (const node of nodes) {
    if (byRevision.has(node.revision)) throw invalid();
    byRevision.set(node.revision, node);
  }
  const referenced = new Set(), children = new Map(), degrees = new Map();
  for (const node of nodes) {
    degrees.set(node.revision, node.parents.length);
    for (const parent of node.parents) {
      if (!byRevision.has(parent)) throw invalid();
      referenced.add(parent);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(node.revision);
    }
  }
  const queue = nodes.filter((node) => !node.parents.length).map((node) => node.revision);
  for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i]) ?? []) {
    degrees.set(child, degrees.get(child) - 1);
    if (!degrees.get(child)) queue.push(child);
  }
  if (queue.length !== nodes.length) throw invalid();
  return { nodes, byRevision, heads: nodes.filter((node) => !referenced.has(node.revision)).sort((a, b) => a.revision.localeCompare(b.revision)) };
}

export async function readSnapshot(blob, node) {
  if (blob.size !== node.size || await fingerprint(blob) !== node.wire) throw invalid();
  const garage = parseGarage(await blob.text());
  const count = inventory(garage);
  if (await garageHash(garage) !== node.hash || JSON.stringify(COUNT_FIELDS.map((key) => count[key])) !== JSON.stringify(node.counts)) throw invalid();
  return garage;
}
