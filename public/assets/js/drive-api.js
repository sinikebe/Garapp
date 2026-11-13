/** Drive v3 transport: new files only; bearer tokens never enter URLs or storage. */
import { MAX_BACKUP_BYTES } from './garage.js';
import { fingerprint } from './backups.js';

const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FIELDS = 'id,name,mimeType,parents,appProperties,size,sha256Checksum,createdTime,modifiedTime,ownedByMe,shared,trashed,driveId,capabilities(canEdit,canDownload)';
const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
export const propertyQuery = (key, value) => `appProperties has { key=${quote(key)} and value=${quote(value)} }`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Only known reason codes are retained; Google messages and metadata can contain private data.
const ERROR_MESSAGES = Object.freeze({
  accessNotConfigured: 'Le projet Google Cloud ne permet pas cet accès. Vérifier que Google Drive API est activée dans le même projet que le client OAuth de Garapp.',
  SERVICE_DISABLED: 'L’API Google Drive est désactivée dans le projet du client OAuth. L’activer dans Google Cloud, attendre quelques minutes puis réessayer.',
  insufficientPermissions: 'L’autorisation Google Drive est insuffisante. Se déconnecter puis se reconnecter en accordant l’accès demandé par Garapp.',
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: 'L’autorisation Google Drive est insuffisante. Se déconnecter puis se reconnecter en accordant l’accès demandé par Garapp.',
  insufficientFilePermissions: 'Ce compte Google n’a pas les droits nécessaires sur ce fichier ou dossier. Vérifier le compte et les autorisations Drive.',
  appNotAuthorizedToFile: 'Ce fichier ou dossier n’est pas autorisé pour cette application. Vérifier le compte Google et le projet du client OAuth.',
  domainPolicy: 'L’administrateur Google Workspace bloque l’accès de Garapp à Drive. Contacter l’administrateur du compte.',
  storageQuotaExceeded: 'Le stockage Google Drive est plein. Les copies locales sont conservées.',
  dailyLimitExceeded: 'Le quota de requêtes du projet Google Cloud est atteint. Vérifier les quotas de Google Drive API ou réessayer plus tard.',
  quotaExceeded: 'Le quota de requêtes du projet Google Cloud est atteint. Vérifier les quotas de Google Drive API ou réessayer plus tard.',
  rateLimitExceeded: 'Trop de requêtes Google Drive. Patienter quelques instants puis réessayer.',
  userRateLimitExceeded: 'Trop de requêtes Google Drive. Patienter quelques instants puis réessayer.',
  RATE_LIMIT_EXCEEDED: 'Trop de requêtes Google Drive. Patienter quelques instants puis réessayer.',
});
const knownReason = (reason) => typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason);

function errorReason(body) {
  const error = body?.error;
  const details = Array.isArray(error?.details) ? error.details : [];
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  // ErrorInfo distinguishes a disabled API from the broader accessNotConfigured reason.
  return details.find((detail) => detail?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' && knownReason(detail.reason))?.reason
    ?? errors.find((entry) => knownReason(entry?.reason))?.reason ?? '';
}

export class DriveError extends Error {
  constructor(status, reason = '') {
    reason = knownReason(reason) ? reason : '';
    const message = status === 401 ? 'La connexion Google a expiré. Se reconnecter pour poursuivre.'
      : status === 404 ? 'Le dossier ou la version Drive est introuvable pour ce compte. Aucune copie locale n’a été remplacée.'
        : ERROR_MESSAGES[reason] ?? (status === 403 ? 'Google Drive a refusé l’accès. Vérifier le compte, les autorisations et les quotas.'
          : status === 429 || status >= 500 ? 'Google Drive est temporairement indisponible. Réessayer plus tard.'
            : 'Le transfert Drive a échoué. La copie locale et les versions précédentes sont conservées.');
    super(message); this.status = status; this.reason = reason;
  }
}

export class DriveAPI {
  constructor({ token, fetcher = globalThis.fetch.bind(globalThis), onExpired = () => {}, onProgress = () => {}, timeoutMs = 45000 }) {
    Object.assign(this, { token, fetcher, onExpired, onProgress, timeoutMs });
    this.controller = new AbortController();
  }

  close() { this.controller.abort(); }

  async request(url, options = {}, retries = options.method && options.method !== 'GET' ? 0 : 2) {
    url = new URL(url);
    if (url.origin !== 'https://www.googleapis.com' || !(/^\/drive\/v3\//.test(url.pathname) || url.pathname === '/upload/drive/v3/files')) throw Error('Adresse de transfert Drive non autorisée.');
    for (let attempt = 0; ; attempt++) {
      let response;
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
      try {
        const token = await this.token();
        if (!token) { this.onExpired(); throw new DriveError(401); }
        response = await this.fetcher(url.href, {
          ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` },
          credentials: 'omit', cache: 'no-store', redirect: 'error',
          signal: AbortSignal.any([this.controller.signal, timeout.signal]),
        });
      } catch (error) {
        if (this.controller.signal.aborted) throw new DOMException('Transfert interrompu.', 'AbortError');
        if (error instanceof DriveError) throw error;
        if (attempt < retries) { await delay(250 * 2 ** attempt); continue; }
        throw new DriveError(0);
      } finally { clearTimeout(timer); }
      if (response.ok || response.status === 308) return response;
      if ((response.status === 429 || response.status >= 500) && attempt < retries) { await delay(250 * 2 ** attempt); continue; }
      if (response.status === 401) this.onExpired();
      let reason = '';
      try { reason = errorReason(await this.json(response)); } catch { /* Error bodies are never exposed. */ }
      throw new DriveError(response.status, reason);
    }
  }

  async get(id) {
    return this.json(await this.request(`${API}files/${encodeURIComponent(id)}?${new URLSearchParams({ fields: FIELDS })}`));
  }

  /** Identify the connected Drive account without requesting additional scopes. */
  async getAccount() {
    const about = await this.json(await this.request(`${API}about?fields=user(displayName,emailAddress)`));
    const safe = (value, limit) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
    return { name: safe(about?.user?.displayName, 200), email: safe(about?.user?.emailAddress, 320) };
  }

  async list(query) {
    const files = [], tokens = new Set(); let pageToken = '';
    do {
      const params = new URLSearchParams({ q: `trashed = false and (${query})`, spaces: 'drive', corpora: 'user', fields: `nextPageToken,incompleteSearch,files(${FIELDS})`, pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.json(await this.request(`${API}files?${params}`));
      if (page.incompleteSearch || !Array.isArray(page.files)) throw Error('La liste Drive est incomplète. Réessayer avant de synchroniser.');
      files.push(...page.files);
      pageToken = page.nextPageToken ?? '';
      if (files.length > 10000 || pageToken && tokens.has(pageToken)) throw Error('L’historique Drive ne peut pas être parcouru entièrement. Les fichiers sont conservés.');
      tokens.add(pageToken);
    } while (pageToken);
    return files;
  }

  async readBody(response, limit) {
    const chunks = []; let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        let timer;
        let result;
        try {
          result = await Promise.race([reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new DriveError(0)), this.timeoutMs); })]);
        } finally { clearTimeout(timer); }
        const { done, value } = result;
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw Error('La taille du fichier Drive ne correspond pas à la version attendue.');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    return new Blob(chunks, { type: 'application/json' });
  }

  async json(response) { return JSON.parse(await (await this.readBody(response, 16 * 1024 * 1024)).text()); }

  async download(node) {
    if (!Number.isSafeInteger(node.size) || node.size < 0 || node.size > MAX_BACKUP_BYTES) throw Error('La sauvegarde dépasse 512 Mio.');
    const response = await this.request(`${API}files/${encodeURIComponent(node.id)}?alt=media`);
    const blob = await this.readBody(response, node.size);
    if (blob.size !== node.size) throw Error('Le téléchargement Drive est incomplet. Réessayer avant de remplacer le garage.');
    return blob;
  }

  async newId() {
    const result = await this.json(await this.request(`${API}files/generateIds?count=1&space=drive&type=files`));
    if (!result.ids?.[0]) throw Error('Google Drive n’a pas attribué d’identifiant au fichier.');
    return result.ids[0];
  }

  async createFolder(metadata) {
    const id = await this.newId();
    try {
      await this.request(`${API}files?${new URLSearchParams({ fields: FIELDS })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...metadata, id }) });
    } catch (error) {
      // A lost response may still have created the folder with its reserved ID.
      if (!(error instanceof DriveError) || error.status && error.status < 500 && error.status !== 409) throw error;
      try { const file = await this.get(id); if (file.appProperties?.namespace === metadata.appProperties.namespace) return file; } catch { /* Preserve the original error. */ }
      throw error;
    }
    return this.get(id);
  }

  async upload(metadata, blob) {
    if (blob.size > MAX_BACKUP_BYTES) throw Error('La sauvegarde dépasse 512 Mio.');
    const id = await this.newId();
    metadata = { ...metadata, id };
    try {
      if (blob.size <= 5 * 1024 * 1024) {
        const boundary = `garapp_${crypto.randomUUID()}`;
        const body = new Blob([
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n`, blob, `\r\n--${boundary}--\r\n`,
        ]);
        await this.request(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      } else await this.resumable(metadata, blob);
    } catch (error) {
      if (!(error instanceof DriveError) || error.status && error.status < 500 && error.status !== 409) throw error;
      try { return await this.verifyUpload(id, metadata, blob); } catch { throw error; }
    }
    return this.verifyUpload(id, metadata, blob);
  }

  async verifyUpload(id, metadata, blob) {
    const file = await this.get(id);
    if (file.size !== String(blob.size) || file.parents?.[0] !== metadata.parents[0] || Object.entries(metadata.appProperties).some(([key, value]) => file.appProperties?.[key] !== value)) throw Error('Google Drive n’a pas confirmé la version envoyée.');
    const checksum = file.sha256Checksum || await fingerprint(await this.download({ id, size: blob.size }));
    if (checksum !== metadata.appProperties.wire) throw Error('L’intégrité du fichier envoyé sur Drive n’a pas été confirmée.');
    this.onProgress(1);
    return file;
  }

  async resumable(metadata, blob) {
    const start = await this.request(`${UPLOAD}?uploadType=resumable&fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/json', 'X-Upload-Content-Length': String(blob.size) }, body: JSON.stringify(metadata),
    });
    const location = start.headers.get('Location');
    if (!location) throw Error('Google Drive n’a pas fourni de session de transfert.');
    // request() validates the origin before any bearer token is attached.
    let offset = 0, stalled = 0;
    while (offset < blob.size) {
      const end = Math.min(offset + 8 * 1024 * 1024, blob.size);
      let response;
      try {
        response = await this.request(location, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}` }, body: blob.slice(offset, end) });
      } catch (error) {
        if (!(error instanceof DriveError) || error.status && error.status < 500 && error.status !== 429) throw error;
        if (++stalled > 3) throw error;
        await delay(500 * stalled);
        response = await this.request(location, { method: 'PUT', headers: { 'Content-Range': `bytes */${blob.size}` }, body: new Blob([]) });
      }
      if (response.ok) return;
      const match = /^bytes=0-(\d+)$/.exec(response.headers.get('Range') ?? '');
      const next = match ? Number(match[1]) + 1 : 0;
      if (!Number.isSafeInteger(next) || next < offset || next > end || next === offset && ++stalled > 3) throw Error('La progression du transfert Drive ne peut pas être confirmée.');
      if (next > offset) stalled = 0;
      offset = next; this.onProgress(offset / blob.size);
    }
    throw Error('La fin du transfert Drive n’a pas été confirmée.');
  }
}
