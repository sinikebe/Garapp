/** Portable JSON backups and guarded access to a user-selected file. */
import { MAX_BACKUP_BYTES, parseGarage, uid } from './garage.js';

export const backupKey = (workspaceKey) => workspaceKey.replace('workspace', 'backups');

export function backupFilename({ date = new Date(), development = false, beforeImport = false } = {}) {
  return `garapp${development ? '-dev' : ''}-${date.toISOString().replace(/:/g, '-')}${beforeImport ? '-avant-import' : ''}-${uid().slice(0, 8)}.json`;
}

export function backupBlob(garage) {
  const data = parseGarage(JSON.stringify(garage));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  if (blob.size > MAX_BACKUP_BYTES) throw Error('La sauvegarde dépasse 512 Mio.');
  return blob;
}

export async function fingerprint(blob) {
  if (blob.size > MAX_BACKUP_BYTES) throw Error('La sauvegarde dépasse 512 Mio.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function readBackupFile(file) {
  if (file.size > MAX_BACKUP_BYTES) throw Error('La sauvegarde dépasse 512 Mio.');
  const garage = parseGarage(await file.text());
  return { garage, name: file.name, size: file.size, modified: file.lastModified, fileHash: globalThis.crypto?.subtle ? await fingerprint(file) : null };
}

/** File handles stay local and are scoped to the published application path. */
export class BackupSettings {
  constructor(key) { this.key = key; this.database = null; this.ready = this.open(); }

  async open() {
    try {
      if (!globalThis.indexedDB) return;
      this.database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('garapp.backups.v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('settings');
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(Error('Le stockage des sauvegardes est occupé.'));
        request.onsuccess = () => {
          request.result.onversionchange = () => { request.result.close(); this.database = null; };
          resolve(request.result);
        };
      });
    } catch { /* Export metadata can still use localStorage. */ }
  }

  async load() {
    await this.ready;
    if (!this.database) return JSON.parse(localStorage.getItem(this.key) || 'null');
    return new Promise((resolve, reject) => {
      const request = this.database.transaction('settings', 'readonly').objectStore('settings').get(this.key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async save(value) {
    await this.ready;
    if (!this.database) {
      const { handle, ...metadata } = value;
      localStorage.setItem(this.key, JSON.stringify(metadata));
      return !handle;
    }
    await new Promise((resolve, reject) => {
      const transaction = this.database.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put(value, this.key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? Error('Enregistrement interrompu.'));
    });
    return true;
  }
}

const changedFile = () => Error('Le fichier a changé ailleurs. Aucune modification n’a été écrite. Téléchargez la copie ouverte, puis ouvrez le fichier pour comparer les versions avant de poursuivre.');
const permissionDenied = () => Error('L’accès au fichier doit être autorisé. Utilisez « Mettre à jour le fichier » pour réessayer, ou téléchargez une copie JSON.');

export function backupErrorMessage(error) {
  if (['NotAllowedError', 'SecurityError'].includes(error.name)) return 'L’accès direct aux fichiers n’a pas été autorisé par ce navigateur. Le téléchargement et l’import JSON restent disponibles.';
  if (error.name === 'NotFoundError') return 'Le fichier lié est introuvable. Téléchargez une copie JSON ou sélectionnez à nouveau un fichier.';
  if (error.name === 'NoModificationAllowedError') return 'Le fichier est occupé par une autre écriture. Réessayez après sa fermeture ou téléchargez une copie JSON.';
  if (['NotReadableError', 'InvalidStateError'].includes(error.name)) return 'Le fichier est inaccessible. Téléchargez une copie JSON et vérifiez le fichier avant de réessayer.';
  return error.message || 'L’opération sur le fichier a échoué. Le téléchargement JSON reste disponible.';
}

export class FileBackup {
  constructor(settings, { locks = globalThis.navigator?.locks, onChange = () => {} } = {}) {
    this.settings = settings;
    this.locks = locks;
    this.onChange = onChange;
    this.state = {};
    this.busy = false;
    this.auto = false;
    this.verified = false;
    this.error = '';
    this.notice = '';
  }

  get handle() { return this.state.handle ?? null; }

  async restore() {
    try {
      const state = await this.settings.load();
      if (state && typeof state === 'object') this.state = state;
      if (this.handle && (this.handle.kind !== 'file' || typeof this.handle.getFile !== 'function' || typeof this.state.fileHash !== 'string')) {
        this.state = { download: this.state.download };
      }
    } catch { this.notice = 'Le suivi des sauvegardes est indisponible. Le téléchargement JSON reste possible.'; }
    // Automatic writes always require a new opt-in after loading a page.
    this.auto = false;
    this.onChange();
  }

  async remember() {
    try {
      const remembered = await this.settings.save(this.state);
      this.notice = remembered ? '' : 'Le fichier est lié pour cette session uniquement. Il faudra le sélectionner à nouveau après fermeture.';
    } catch { this.notice = 'Le suivi n’a pas pu être mémorisé. Le fichier reste utilisable pendant cette session.'; }
    this.onChange();
  }

  async noteDownload(blob, name, date = new Date()) {
    const hash = globalThis.crypto?.subtle ? await fingerprint(blob) : null;
    this.state = { ...this.state, download: { hash, name, at: date.toISOString() } };
    await this.remember();
  }

  async authorize(ask = false, handle = this.handle) {
    if (!handle) throw Error('Aucun fichier lié.');
    // Request immediately, while the button's user activation is still available.
    const permission = ask ? await handle.requestPermission({ mode: 'readwrite' }) : await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw permissionDenied();
  }

  async check(handle = this.handle, expected = this.state.fileHash) {
    try {
      await this.authorize(false, handle);
      const actual = await fingerprint(await handle.getFile());
      if (this.busy || handle !== this.handle || expected !== this.state.fileHash) return;
      if (actual !== expected) throw changedFile();
      this.verified = true;
      this.error = '';
    } catch (error) {
      this.verified = false;
      this.auto = false;
      this.error = backupErrorMessage(error);
      throw Error(this.error, { cause: error });
    } finally { this.onChange(); }
  }

  async link(handle, imported) {
    if (this.busy) throw Error('Une écriture de fichier est déjà en cours.');
    // The file may have changed while the import preview was open.
    if (await fingerprint(await handle.getFile()) !== imported.fileHash) throw changedFile();
    const garageHash = await fingerprint(backupBlob(imported.garage));
    this.state = { download: this.state.download, handle, fileHash: imported.fileHash, garageHash, at: null };
    this.auto = false;
    this.verified = true;
    this.error = '';
    await this.remember();
  }

  async disconnect() {
    if (this.busy) throw Error('Une écriture de fichier est déjà en cours.');
    this.auto = false;
    this.state = { download: this.state.download };
    this.verified = false;
    this.error = '';
    await this.remember();
  }

  async create(handle, garage) {
    return this.perform(handle, garage, true, true);
  }

  async write(garage, ask = false) {
    return this.perform(this.handle, garage, false, ask);
  }

  async perform(handle, garage, creating, ask) {
    if (this.busy) throw Error('Une écriture de fichier est déjà en cours.');
    if (creating) this.auto = false;
    this.busy = true;
    this.onChange();
    try {
      await this.authorize(ask, handle);
      const blob = backupBlob(garage);
      const hash = await fingerprint(blob);
      const expected = creating ? await fingerprint(new Blob()) : this.state.fileHash;
      const write = async () => {
        if (creating && (await handle.getFile()).size !== 0) throw Error('Ce fichier contient déjà des données. Utilisez « Ouvrir un fichier existant » ou choisissez un nouveau nom.');
        if (await fingerprint(await handle.getFile()) !== expected) throw changedFile();
        let writable;
        try {
          writable = await handle.createWritable({ mode: 'exclusive' });
          // Check again after obtaining the browser's writable stream.
          if (await fingerprint(await handle.getFile()) !== expected) throw changedFile();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          try { await writable?.abort(); } catch { /* A closed stream cannot be aborted. */ }
          throw error;
        }
        if (await fingerprint(await handle.getFile()) !== hash) throw Error('Le contenu du fichier après écriture ne correspond pas à la copie attendue. Téléchargez une copie JSON et vérifiez le fichier.');
        this.state = { download: this.state.download, handle, fileHash: hash, garageHash: hash, at: new Date().toISOString() };
        this.verified = true;
        this.error = '';
        await this.remember();
      };
      // One origin-wide lock also covers different Garapp paths targeting one file.
      if (this.locks) await this.locks.request('garapp.backup.file', write);
      else await write();
    } catch (error) {
      this.auto = false;
      this.verified = false;
      this.error = backupErrorMessage(error);
      throw Error(this.error, { cause: error });
    } finally { this.busy = false; this.onChange(); }
  }
}
