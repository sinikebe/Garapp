/** Transactional, path-scoped local storage, including embedded documents. */
import { parseGarage, uid } from './garage.js';

const conflict = () => Error('Le garage a changé dans un autre onglet. Exportez les modifications ouvertes avant de recharger.');

export class WorkspaceStorage {
  constructor(key) {
    this.key = key;
    this.revision = null;
    this.legacyRaw = null;
    this.migrationRaw = null;
    this.migrationArchived = false;
    this.invalid = false;
    this.database = null;
    this.primaryClosed = false;
    this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('garapp.local.changes') : null;
    this.ready = this.open();
  }

  async open() {
    try {
      if (!globalThis.indexedDB) return;
      this.database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('garapp.local.v2', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('workspaces', { keyPath: 'key' });
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(Error('Le stockage est occupé par un autre onglet.'));
        request.onsuccess = () => {
          request.result.onversionchange = () => { request.result.close(); this.database = null; this.primaryClosed = true; };
          resolve(request.result);
        };
      });
    } catch { /* Small garages remain usable through the existing local storage. */ }
  }

  async load() {
    await this.ready;
    if (this.primaryClosed) throw Error('Le stockage a changé. Rechargez pour accéder au garage.');
    let entry = null;
    if (this.database) entry = await new Promise((resolve, reject) => {
      const transaction = this.database.transaction('workspaces', 'readonly');
      const request = transaction.objectStore('workspaces').get(this.key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    this.revision = entry?.revision ?? null;
    try { this.legacyRaw = localStorage.getItem(this.key); }
    catch (error) { if (!entry && !this.database) throw error; }
    try {
      const raw = entry ? JSON.stringify(entry.garage) : this.legacyRaw;
      const garage = raw ? parseGarage(raw) : null;
      this.migrationRaw = raw && JSON.stringify(JSON.parse(raw)) !== JSON.stringify(garage) ? raw : null;
      this.migrationArchived = false;
      this.invalid = false;
      return garage;
    } catch (error) { this.invalid = true; throw error; }
  }

  async save(garage) {
    // Capture and validate before awaiting storage so callers cannot mutate a write.
    const next = parseGarage(JSON.stringify(garage));
    await this.ready;
    if (this.primaryClosed) throw Error('Le stockage a changé. Exportez la copie ouverte puis rechargez cet onglet.');
    if (this.invalid) throw Error('Le garage enregistré est illisible. Son contenu est conservé ; exportez la copie ouverte avant de poursuivre.');
    const nextRevision = uid();
    if (this.database) {
      await new Promise((resolve, reject) => {
        const transaction = this.database.transaction('workspaces', 'readwrite');
        const store = transaction.objectStore('workspaces');
        const request = store.get(this.key);
        let error = null;
        request.onsuccess = () => {
          const current = request.result;
          if ((current?.revision ?? null) !== this.revision) { error = conflict(); transaction.abort(); return; }
          if (!current) {
            try { if (localStorage.getItem(this.key) !== this.legacyRaw) { error = conflict(); transaction.abort(); return; } }
            catch { /* IndexedDB can operate without localStorage access. */ }
          }
          if (this.migrationRaw) this.queueCheckpoint(store, this.migrationRaw, 'migration');
          store.put({ key: this.key, revision: nextRevision, garage: next });
        };
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(error ?? transaction.error ?? Error('L’enregistrement local a échoué.'));
        transaction.onabort = () => reject(error ?? transaction.error ?? Error('L’enregistrement a été interrompu.'));
      });
      this.revision = nextRevision;
    } else {
      // localStorage has no multi-key transaction: archive successfully first,
      // then replace the primary value. A failure at either step preserves it.
      if (this.migrationRaw && !this.migrationArchived) {
        await this.archiveRaw(this.migrationRaw, 'migration');
        this.migrationArchived = true;
      }
      const write = () => {
        const raw = localStorage.getItem(this.key);
        if (raw !== this.legacyRaw) throw conflict();
        if (raw) parseGarage(raw);
        const text = JSON.stringify(next);
        localStorage.setItem(this.key, text);
        this.legacyRaw = text;
      };
      if (globalThis.navigator?.locks) await navigator.locks.request(this.key, async () => write());
      else write();
    }
    this.migrationRaw = null;
    this.migrationArchived = false;
    this.channel?.postMessage({ key: this.key });
  }

  /** Archive the open model before replacement; previous archives are never removed. */
  async checkpoint(garage) {
    const raw = JSON.stringify(parseGarage(JSON.stringify(garage)));
    return this.archiveRaw(raw, 'import');
  }

  queueCheckpoint(store, raw, reason, point = { id: uid(), createdAt: new Date().toISOString(), reason }) {
    const indexKey = `${this.key}:recoveries`;
    const request = store.get(indexKey);
    request.onsuccess = () => {
      const legacy = this.legacyRecoveryIndex();
      const points = new Map([...(legacy?.points ?? []), ...(request.result?.points ?? []), point].map((entry) => [entry.id, entry]));
      store.put({ key: `${indexKey}:${point.id}`, ...point, raw });
      store.put({ key: indexKey, points: [...points.values()] });
    };
    return point;
  }

  legacyRecoveryIndex() {
    try { return JSON.parse(localStorage.getItem(`${this.key}:recoveries`) || 'null'); }
    catch (error) { if (!this.database) throw error; return null; }
  }

  async archiveRaw(raw, reason) {
    const point = { id: uid(), createdAt: new Date().toISOString(), reason };
    await this.ready;
    if (this.primaryClosed) throw Error('Le stockage a changé. Rechargez avant d’importer.');
    const indexKey = `${this.key}:recoveries`;
    const snapshot = { key: `${indexKey}:${point.id}`, ...point, raw };
    if (this.database) {
      await new Promise((resolve, reject) => {
        const transaction = this.database.transaction('workspaces', 'readwrite');
        const store = transaction.objectStore('workspaces');
        this.queueCheckpoint(store, raw, reason, point);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error ?? Error('La copie de récupération n’a pas pu être enregistrée.'));
        transaction.onabort = () => reject(transaction.error ?? Error('La copie de récupération a été interrompue.'));
      });
    } else {
      const archive = () => {
        const index = JSON.parse(localStorage.getItem(indexKey) || '{"points":[]}');
        // Write the data first: an index failure must never authorize replacement.
        localStorage.setItem(snapshot.key, JSON.stringify(snapshot));
        localStorage.setItem(indexKey, JSON.stringify({ points: [...index.points, point] }));
      };
      if (globalThis.navigator?.locks) await navigator.locks.request(indexKey, async () => archive());
      else archive();
    }
    return point;
  }

  async readRecoveryEntry(key) {
    await this.ready;
    if (this.primaryClosed) throw Error('Le stockage a changé. Rechargez pour accéder aux copies de récupération.');
    if (!this.database) return JSON.parse(localStorage.getItem(key) || 'null');
    const entry = await new Promise((resolve, reject) => {
      const request = this.database.transaction('workspaces', 'readonly').objectStore('workspaces').get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    if (entry) return entry;
    // Recovery files created during a localStorage fallback remain available
    // when IndexedDB becomes usable again.
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  }

  /** Metadata only; listing archives does not load their embedded documents. */
  async recoveryPoints() {
    const index = await this.readRecoveryEntry(`${this.key}:recoveries`);
    const legacy = this.legacyRecoveryIndex();
    return [...new Map([...(legacy?.points ?? []), ...(index?.points ?? [])].map((point) => [point.id, point])).values()].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Return original JSON without migration, including a future or damaged format. */
  async readRecovery(id) {
    const points = await this.recoveryPoints();
    if (!points.some((point) => point.id === id)) throw Error('Cette copie de récupération est introuvable.');
    const entry = await this.readRecoveryEntry(`${this.key}:recoveries:${id}`);
    if (typeof entry?.raw !== 'string') throw Error('Cette copie de récupération est inaccessible.');
    return entry.raw;
  }

  /** Export an unreadable or newer primary format without parsing or changing it. */
  async readStoredRaw() {
    await this.ready;
    if (this.primaryClosed) throw Error('Le stockage a changé. Rechargez pour exporter les données locales.');
    if (this.database) {
      const entry = await new Promise((resolve, reject) => {
        const request = this.database.transaction('workspaces', 'readonly').objectStore('workspaces').get(this.key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
      if (entry) return JSON.stringify(entry.garage);
    }
    return localStorage.getItem(this.key);
  }

  subscribe(listener) {
    this.channel?.addEventListener('message', (event) => { if (event.data?.key === this.key) listener(); });
    globalThis.addEventListener?.('storage', (event) => { if (event.key === this.key) listener(); });
  }
}
