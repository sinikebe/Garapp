/** Transactional, path-scoped local storage, including embedded documents. */
import { parseGarage, uid } from './garage.js';

const conflict = () => Error('Le garage a changé dans un autre onglet. Exportez les modifications ouvertes avant de recharger.');

export class WorkspaceStorage {
  constructor(key) {
    this.key = key;
    this.revision = null;
    this.legacyRaw = null;
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
      this.invalid = false;
      return garage;
    } catch (error) { this.invalid = true; throw error; }
  }

  async save(garage) {
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
          store.put({ key: this.key, revision: nextRevision, garage });
        };
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(error ?? transaction.error ?? Error('L’enregistrement local a échoué.'));
        transaction.onabort = () => reject(error ?? transaction.error ?? Error('L’enregistrement a été interrompu.'));
      });
      this.revision = nextRevision;
    } else {
      const write = () => {
        const raw = localStorage.getItem(this.key);
        if (raw !== this.legacyRaw) throw conflict();
        if (raw) parseGarage(raw);
        const text = JSON.stringify(garage);
        localStorage.setItem(this.key, text);
        this.legacyRaw = text;
      };
      if (globalThis.navigator?.locks) await navigator.locks.request(this.key, async () => write());
      else write();
    }
    this.channel?.postMessage({ key: this.key });
  }

  subscribe(listener) {
    this.channel?.addEventListener('message', (event) => { if (event.data?.key === this.key) listener(); });
    globalThis.addEventListener?.('storage', (event) => { if (event.key === this.key) listener(); });
  }
}
