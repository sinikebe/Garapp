import { inventory } from './garage.js';
import { BackupSettings, FileBackup, backupKey, backupBlob, backupFilename, fingerprint, backupErrorMessage } from './backups.js';

const $ = (id) => document.getElementById(id);
const dateTime = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'date inconnue';
};

export class BackupPanel {
  constructor({ key, development, getGarage, canAutoSave, download, announce, showDialog, openFile }) {
    Object.assign(this, { development, getGarage, canAutoSave, download, announce, showDialog, openFile });
    this.announce = (message) => { $('backup-action-message').textContent = message; announce(message); };
    this.supported = typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function' && !!globalThis.crypto?.subtle;
    this.files = new FileBackup(new BackupSettings(backupKey(key)), { onChange: () => this.render() });
    this.currentHash = null;
    this.updating = false;
    this.generation = 0;
    this.timer = null;
    this.picking = false;
    $('backup-auto').addEventListener('change', () => { void this.toggleAuto(); });
    window.addEventListener('focus', () => {
      if (this.files.handle && !this.files.busy && !this.picking) void this.files.check().catch(() => this.render());
    });
  }

  async restore() {
    await this.files.restore();
    if (this.files.handle && this.supported) await this.files.check().catch(() => {});
    await this.update(false);
  }

  open() { this.render(); this.showDialog('backups-dialog'); }

  render() {
    const { state, handle, busy, auto, verified, error, notice } = this.files;
    const sameFile = this.currentHash && state.garageHash === this.currentHash;
    const sameDownload = this.currentHash && state.download?.hash === this.currentHash;
    $('backup-status').textContent = error ? 'Fichier de sauvegarde à vérifier' : busy ? 'Écriture du fichier…' : this.updating ? 'Vérification de la sauvegarde…' : handle ? sameFile && verified ? 'Fichier de sauvegarde à jour' : 'Fichier de sauvegarde à actualiser' : state.download ? sameDownload ? 'Export demandé pour cette version' : 'Modifications depuis le dernier export' : 'Sauvegarder le garage';
    $('backup-current').textContent = (() => {
      const count = inventory(this.getGarage());
      const label = (value, name) => `${value} ${name}${value > 1 ? 's' : ''}`;
      return [label(count.vehicles, 'véhicule'), label(count.records, 'fiche'), label(count.documents, 'document')].join(' · ');
    })();
    $('backup-download-status').hidden = !state.download;
    $('backup-download-status').textContent = state.download ? `Téléchargement demandé le ${dateTime(state.download.at)}. ${sameDownload ? 'Vérifiez sa présence dans vos fichiers.' : 'Des modifications restent à sauvegarder.'}` : '';
    $('backup-file-support').hidden = this.supported;
    $('backup-file-controls').hidden = !this.supported;
    $('backup-linked').hidden = !handle;
    $('backup-file-name').textContent = handle?.name ?? '';
    $('backup-file-status').textContent = busy ? 'Écriture en cours. Garder cette page ouverte jusqu’à la confirmation.' : error || (sameFile && verified ? `Le contenu du fichier correspond au garage ouvert.${state.at ? ` Dernière écriture vérifiée le ${dateTime(state.at)}.` : ''}` : 'Des modifications restent à écrire ou le fichier doit être vérifié avant la prochaine écriture.');
    $('backup-auto').checked = auto;
    $('backup-file-notice').textContent = error || notice;
    $('backup-file-notice').hidden = !error && !notice;
    $('backup-advanced-label').textContent = error ? 'Options avancées · fichier à vérifier' : handle ? 'Options avancées · fichier lié' : 'Options avancées';
    for (const action of ['backup-create', 'backup-open', 'backup-write', 'backup-unlink']) {
      document.querySelectorAll(`[data-action="${action}"]`).forEach((button) => { button.disabled = busy || this.picking; });
    }
    $('backup-auto').disabled = busy || this.picking;
    // Importing during an active write could silently change its source snapshot.
    $('import-confirm').disabled = busy || this.picking || !!$('import-confirm').dataset.importing;
    $('import-merge').disabled = $('import-confirm').disabled || $('import-merge').dataset.ready !== 'true';
    $('import-differences').querySelectorAll('select, button').forEach((control) => { control.disabled = !!$('import-confirm').dataset.importing; });
    $('import-dialog').querySelectorAll('[data-close]').forEach((button) => { button.disabled = !!$('import-confirm').dataset.importing; });
  }

  async update(schedule = true) {
    const generation = ++this.generation;
    this.updating = true;
    this.render();
    try {
      const hash = globalThis.crypto?.subtle ? await fingerprint(backupBlob(this.getGarage())) : null;
      if (generation !== this.generation) return;
      this.currentHash = hash;
    } catch (error) {
      this.suspend();
      this.files.error = error.message;
    } finally {
      if (generation === this.generation) { this.updating = false; this.render(); }
    }
    if (generation === this.generation && schedule) this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.files.auto || !this.canAutoSave() || this.files.state.garageHash === this.currentHash) return;
    this.timer = setTimeout(async () => {
      if (!this.files.auto || !this.canAutoSave()) return;
      if (this.files.busy || this.picking) { this.schedule(); return; }
      try { await this.files.write(this.getGarage()); }
      catch { /* The persistent file status explains the failed write. */ }
      this.schedule();
    }, 1200);
  }

  suspend() { clearTimeout(this.timer); this.files.auto = false; this.render(); }

  needsFlush() { return this.files.busy || (this.files.auto && (this.updating || this.files.state.garageHash !== this.currentHash)); }

  export({ beforeImport = false } = {}) {
    try {
      const blob = backupBlob(this.getGarage());
      const name = backupFilename({ development: this.development, beforeImport });
      this.download(blob, name);
      void this.files.noteDownload(blob, name).catch(() => {});
      this.announce('Téléchargement demandé, documents inclus. Vérifiez que le fichier a bien été conservé.');
    } catch (error) { this.announce(`Export impossible. ${error.message}`); throw error; }
  }

  pickerOptions() {
    return { id: this.development ? 'garapp-dev-backup' : 'garapp-backup', types: [{ description: 'Sauvegarde complète Garapp (JSON)', accept: { 'application/json': ['.json'] } }], excludeAcceptAllOption: true };
  }

  async create() {
    if (this.picking || this.files.busy) return;
    this.suspend();
    this.picking = true; this.render();
    try {
      const handle = await window.showSaveFilePicker({ ...this.pickerOptions(), suggestedName: backupFilename({ development: this.development }) });
      await this.files.create(handle, this.getGarage());
      await this.update(false);
      this.announce('Fichier de sauvegarde écrit et vérifié.');
    } catch (error) { if (error.name !== 'AbortError') this.announce(backupErrorMessage(error)); }
    finally { this.picking = false; this.render(); }
  }

  async chooseExisting() {
    if (this.picking || this.files.busy) return;
    this.suspend();
    this.picking = true; this.render();
    try {
      const [handle] = await window.showOpenFilePicker({ ...this.pickerOptions(), multiple: false, mode: 'readwrite' });
      await this.openFile(await handle.getFile(), handle);
    } catch (error) { if (error.name !== 'AbortError') this.announce(backupErrorMessage(error)); }
    finally { this.picking = false; this.render(); }
  }

  async write() {
    if (this.files.busy || this.picking) return;
    try {
      await this.files.write(this.getGarage(), true);
      await this.update(false);
      this.announce('Fichier de sauvegarde écrit et vérifié.');
    } catch (error) { this.announce(error.message); }
    this.schedule();
  }

  async toggleAuto() {
    if (!$('backup-auto').checked) { this.suspend(); return; }
    try {
      await this.files.authorize(true);
      await this.files.check();
      if (!this.canAutoSave()) throw Error('Le garage local doit être enregistré sans conflit avant d’activer l’écriture automatique. Le téléchargement JSON reste disponible.');
      this.files.auto = true;
      this.schedule();
    } catch (error) { this.suspend(); this.announce(error.message); }
    this.render();
  }

  async unlink() {
    this.suspend();
    try { await this.files.disconnect(); this.announce('Fichier détaché. Son contenu est conservé.'); }
    catch (error) { this.announce(error.message); }
  }
}
