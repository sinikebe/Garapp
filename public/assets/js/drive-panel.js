import { BackupSettings, backupBlob, backupFilename } from './backups.js';
import { DRIVE_CLIENT_IDS } from './drive-config.js';
import { driveNamespace, revisionGraph } from './drive-format.js';
import { DriveAPI } from './drive-api.js';
import { DriveSync } from './drive-sync.js';
import { DriveAuthorization, loadGoogleIdentity, validClientId } from './drive-auth.js';
import { WorkerDriveAuthorization, consumeWorkerFailure } from './drive-worker-auth.js';
import { MergeComparisonView } from './backup-merge-view.js';

const $ = (id) => document.getElementById(id);
const date = (value) => { const result = new Date(value); return Number.isFinite(result.getTime()) ? result.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Date inconnue'; };
const summary = (counts) => `${counts[1]} fiche${counts[1] > 1 ? 's' : ''} · ${counts[4]} document${counts[4] > 1 ? 's' : ''}`;

export class DrivePanel {
  constructor({ key, base, development, getGarage, canSync, canApply, applyRemote, download, announce, showDialog, openBackups }) {
    Object.assign(this, { key, base, development, getGarage, canSync, canApply, applyRemote, download, announce, showDialog, openBackups });
    this.configKey = key.replace('workspace', 'drive-client');
    this.previousConnectionKey = key.replace('workspace', 'drive-connected-before');
    this.appClientId = DRIVE_CLIENT_IDS[development ? 'dev' : 'main'];
    this.clientId = this.appClientId;
    // Keep legacy Pages and preview builds on their existing manual OAuth flow.
    this.useWorker = !development && location.origin === 'https://garapp.siniverse.cc';
    this.workerUnavailable = false;
    this.showDeveloperConfig = development && !validClientId(this.appClientId);
    if (this.showDeveloperConfig) { try { this.clientId = localStorage.getItem(this.configKey) || this.clientId; } catch { /* Optional local override until the app is configured. */ } }
    this.auth = null; this.account = null; this.loading = false; this.initialized = false; this.profileConnectRequested = false; this.timer = null; this.poll = null; this.folders = []; this.problem = '';
    this.comparison = new MergeComparisonView({ container: $('drive-differences'), incomingLabel: 'Google Drive', onChange: () => this.render() });
    $('drive-config').hidden = !this.showDeveloperConfig;
    $('drive-client-id').value = this.clientId;
    $('drive-origin').textContent = location.origin;
    $('drive-connect').addEventListener('click', () => {
      if (this.auth) { this.problem = ''; this.connect(); this.render(); }
      else void this.prepare();
    });
    $('drive-profile').addEventListener('click', () => {
      this.openBackups?.();
      if (!this.initialized) { this.profileConnectRequested = true; return; }
      if (this.connected() || this.auth?.pending || this.engine?.busy) return;
      // OAuth must begin in this click handler. Loading the SDK cannot open a popup.
      if (this.auth) { this.problem = ''; this.connect(); this.render(); }
      else void this.prepare();
    });
    $('drive-config-save').addEventListener('click', () => { void this.configure(); });
    $('drive-disconnect').addEventListener('click', () => { void this.disconnect(); });
    $('drive-list').addEventListener('click', () => { void this.listFolders(); });
    $('drive-use').addEventListener('click', () => { void this.chooseFolder(); });
    $('drive-create').addEventListener('click', () => { void this.create(); });
    $('drive-sync').addEventListener('click', () => { void this.engine?.sync(); });
    $('drive-auto').addEventListener('change', () => { void this.toggleAuto(); });
    $('drive-seed').addEventListener('click', () => { void this.engine?.seed(); });
    $('drive-keep-local').addEventListener('click', () => { void this.resolve('local'); });
    $('drive-use-remote').addEventListener('click', () => { void this.resolve('remote'); });
    $('drive-merge').addEventListener('click', () => { void this.resolve('merge'); });
    $('drive-export-remote').addEventListener('click', () => {
      if (this.engine?.preview) this.download(backupBlob(this.engine.preview.incoming), backupFilename({ development }));
    });
    $('drive-export-local').addEventListener('click', () => this.download(backupBlob(this.getGarage()), backupFilename({ development })));
    $('drive-preview-dialog').addEventListener('close', () => { if (!this.engine?.busy && this.engine) { this.engine.preview = null; this.comparison.setComparison(null); } this.changed(false); });
    $('drive-preview-dialog').addEventListener('cancel', (event) => { if (this.engine?.busy) event.preventDefault(); });
    // Only an explicit click opens OAuth; a previously connected browser preloads its SDK.
    window.addEventListener('focus', () => this.wake());
    window.addEventListener('online', () => this.wake());
    document.addEventListener('visibilitychange', () => this.wake());
    this.render();
  }

  async restore() {
    this.engine = new DriveSync({ namespace: await driveNamespace(this.base, this.development), settings: new BackupSettings(this.key.replace('workspace', 'drive')), development: this.development,
      getGarage: this.getGarage, canSync: this.canSync, canApply: this.canApply, applyRemote: this.applyRemote, onChange: () => this.render(),
    });
    await this.engine.restore(); this.initialized = true; this.render();
    const authFailed = this.useWorker && consumeWorkerFailure(location, history);
    if (this.profileConnectRequested) { this.profileConnectRequested = false; if (!this.useWorker) void this.prepare(); }
    if (this.useWorker) {
      let restored = false;
      try {
        this.auth = new WorkerDriveAuthorization();
        restored = await this.auth.restore();
      } catch {
        // Until the Worker is available, the existing explicit GIS flow remains usable.
        this.workerUnavailable = true;
        this.auth = null;
        void this.prepare();
      }
      this.render();
      if (restored) await this.onConnected();
      if (authFailed) { this.problem = 'Connexion Google non terminée.'; this.render(); }
    } else try { if (validClientId(this.clientId) && localStorage.getItem(this.previousConnectionKey) === '1') void this.prepare(); }
    catch { /* Browser storage is optional; the profile button still works. */ }
    this.poll = setInterval(() => this.wake(), 15000);
  }

  connect() {
    if (this.auth?.kind === 'worker') this.auth.connect(location.origin + location.pathname);
    else this.auth?.connect();
  }

  connected() { return !!this.engine?.api && (this.auth?.kind === 'worker' ? this.auth.connected : !!this.auth?.token()); }

  render() {
    const engine = this.engine, connected = this.connected(), busy = this.busy();
    $('drive-config').hidden = !this.showDeveloperConfig;
    $('drive-setup-note').hidden = !!this.clientId;
    $('drive-connect').hidden = connected;
    $('drive-connect').disabled = !this.initialized || !validClientId(this.clientId) || this.loading || !!this.auth?.pending || busy || !this.auth && !this.problem;
    $('drive-connect').textContent = this.auth?.pending ? 'Connexion Google en cours…' : this.loading ? 'Chargement de la connexion Google…' : !this.auth && validClientId(this.clientId) && this.problem ? 'Réessayer le chargement Google' : 'Se connecter à Google Drive';
    $('drive-disconnect').hidden = !connected && !this.auth?.pending;
    $('drive-disconnect').disabled = busy;
    $('drive-config-save').disabled = connected || busy || this.loading || !!this.auth?.pending;
    $('drive-client-id').disabled = connected || busy || this.loading || !!this.auth?.pending;
    $('drive-connected').hidden = !connected;
    const profile = $('drive-profile');
    profile.hidden = !validClientId(this.clientId);
    profile.dataset.state = connected ? 'connected' : 'disconnected';
    $('drive-profile-badge').textContent = connected ? '✓' : '!';
    const accountName = this.account?.name || this.account?.email || 'Google Drive';
    profile.setAttribute('aria-label', connected ? `Compte Google Drive : ${this.account?.name ? `${this.account.name}, ` : ''}${this.account?.email || 'connecté'}. Ouvrir les sauvegardes.` : 'Google Drive déconnecté. Se connecter.');
    profile.title = connected ? `${this.account?.name || 'Google Drive'}${this.account?.email ? ` · ${this.account.email}` : ''}` : 'Se connecter à Google Drive';
    $('drive-profile-name').textContent = accountName;
    $('drive-profile-name').hidden = !connected;
    $('drive-account').textContent = connected ? `Compte Google : ${this.account?.name || this.account?.email || 'connecté'}${this.account?.name && this.account.email ? ` · ${this.account.email}` : ''}` : '';
    $('drive-account').hidden = !connected;
    $('drive-binding').hidden = !engine?.state.binding;
    $('drive-folder-name').textContent = engine?.state.binding?.name ?? '';
    const bindingId = engine?.state.binding?.id ?? null;
    if (this.folderBinding !== bindingId) {
      $('drive-folder-settings').open = !bindingId;
      this.folderBinding = bindingId;
    }
    $('drive-folder-settings-label').textContent = bindingId ? 'Changer de sauvegarde Drive' : 'Configurer la sauvegarde Drive';
    $('drive-existing-folders').hidden = !this.folders.length;
    const divergent = engine && new Set(engine.graph.heads.map((head) => head.hash)).size > 1;
    $('drive-status').textContent = this.problem || engine?.error || (busy ? engine.status.startsWith('Envoi') ? engine.status : 'Vérification Drive en cours…' : connected ? divergent ? 'Des versions différentes sont à réunir. Vos copies sont conservées.' : !bindingId ? 'Choisissez une sauvegarde ou créez-en une.' : engine.localChanged ? 'Des modifications sont à synchroniser.' : engine.status : bindingId ? 'Reconnectez-vous pour synchroniser. Votre sauvegarde Drive est conservée.' : '');
    $('drive-status').dataset.error = String(!!(this.problem || engine?.error));
    $('drive-notice').textContent = engine?.notice ?? '';
    $('drive-last-check').textContent = engine?.state.checkedAt ? `Dernière synchronisation : ${date(engine.state.checkedAt)}.` : '';
    $('drive-auto').checked = engine?.state.auto === true;
    $('drive-auto').disabled = !connected || !engine?.state.binding || busy;
    for (const id of ['drive-list', 'drive-use', 'drive-create', 'drive-sync', 'drive-seed']) $(id).disabled = !connected || busy || id === 'drive-use' && !$('drive-folders').value || ['drive-sync', 'drive-seed'].includes(id) && !engine?.state.binding;
    $('drive-seed').hidden = !engine?.state.binding || !!engine.graph.nodes.length || !!engine.state.baseline;
    $('drive-folders').disabled = busy;
    for (const id of ['drive-keep-local', 'drive-use-remote', 'drive-export-remote']) $(id).disabled = busy || !engine?.preview;
    $('drive-merge').disabled = busy || !engine?.preview || !this.comparison.complete || !this.comparison.hasDifferences;
    $('drive-differences').querySelectorAll('select, button').forEach((control) => { control.disabled = busy; });
    $('drive-preview-dialog').querySelectorAll('[data-close]').forEach((button) => { button.disabled = busy; });
    $('drive-preview-error').textContent = engine?.error ?? '';
    $('drive-preview-error').hidden = !engine?.error;
    const footer = $('drive-footer-status');
    footer.hidden = !engine?.state.binding;
    footer.textContent = !connected ? 'Drive déconnecté' : busy ? 'Transfert Drive…' : engine.error ? 'Drive à vérifier' : divergent ? 'Versions Drive à comparer' : engine.localChanged ? 'Drive : modifications à vérifier' : engine.state.auto ? 'Drive : synchronisation active' : 'Drive : synchronisation en pause';
    this.renderVersions();
  }

  renderVersions() {
    const list = $('drive-versions'), review = $('drive-review-versions');
    if (!this.engine?.state.binding || !this.connected()) {
      list.replaceChildren(); review.replaceChildren(); $('drive-review').hidden = true;
      $('drive-history').hidden = true; this.versionsKey = null; return;
    }
    const heads = new Set(this.engine.graph.heads.map((node) => node.revision));
    const nodes = [...this.engine.graph.nodes].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || b.revision.localeCompare(a.revision));
    // Always include every concurrent head, even when it is older than the last
    // twenty versions. The rest of the history remains available in Drive.
    const visible = nodes.filter((node, index) => index < 20 || heads.has(node.revision));
    const divergent = new Set(this.engine.graph.heads.map((node) => node.hash)).size > 1;
    const candidates = nodes.filter((node) => heads.has(node.revision));
    const hasNewCopy = !this.engine.state.baseline || candidates.some((node) => node.hash !== this.engine.state.baseline.hash);
    const toReview = divergent ? candidates : hasNewCopy ? candidates.slice(0, 1) : [];
    $('drive-review').hidden = !toReview.length;
    $('drive-review-label').textContent = divergent ? 'Choisir les informations à garder' : 'Une sauvegarde est disponible';
    $('drive-history').hidden = !nodes.length;
    const versionsKey = JSON.stringify([visible.map((node) => [node.id, node.wire, node.at, node.counts, heads.has(node.revision)]), toReview.map((node) => node.revision)]);
    if (this.versionsKey === versionsKey) {
      for (const container of [list, review]) container.querySelectorAll('button').forEach((button) => { button.disabled = this.busy(); });
      return;
    }
    this.versionsKey = versionsKey; list.replaceChildren(); review.replaceChildren();
    const appendVersion = (container, node, index, prominent = false) => {
      const row = document.createElement('li');
      const text = document.createElement('span'); text.textContent = `${date(node.at)}${!prominent && heads.has(node.revision) ? ' · actuelle' : ''}\n${summary(node.counts)}`;
      const button = document.createElement('button'); button.type = 'button'; button.className = prominent ? 'primary-button' : 'ghost-button'; button.textContent = 'Comparer'; button.disabled = this.busy();
      button.setAttribute('aria-label', `Comparer la sauvegarde du ${date(node.at)} (${index + 1})`);
      button.addEventListener('click', () => { void this.compare(node.revision); });
      row.append(text, button); container.append(row);
    };
    toReview.forEach((node, index) => appendVersion(review, node, index, true));
    visible.forEach((node, index) => appendVersion(list, node, index));
    $('drive-history-note').textContent = `${nodes.length} copie${nodes.length > 1 ? 's' : ''} conservée${nodes.length > 1 ? 's' : ''}.${nodes.length > visible.length ? ' L’historique complet reste disponible sur Drive.' : ''}`;
  }

  async prepare() {
    if (this.auth || this.loading || !this.initialized || !validClientId(this.clientId) || this.useWorker && !this.workerUnavailable) return;
    this.loading = true; this.problem = ''; this.render();
    try {
      const oauth = await loadGoogleIdentity();
      this.auth = new DriveAuthorization({ clientId: this.clientId, oauth,
        onToken: () => {
          try { localStorage.setItem(this.previousConnectionKey, '1'); } catch { /* The token remains in memory only. */ }
          void this.onConnected();
        }, onError: (message) => { this.problem = message; this.render(); },
      });
    } catch (error) { this.problem = error.message; }
    finally { this.loading = false; this.render(); }
  }

  async configure() {
    if (!this.showDeveloperConfig || this.loading || this.connected() || this.engine?.busy || this.auth?.pending) return;
    const value = $('drive-client-id').value.trim();
    if (value && !validClientId(value)) { this.problem = 'Saisir un identifiant de client OAuth Web se terminant par .apps.googleusercontent.com.'; this.render(); return; }
    this.auth?.disconnect(); this.auth = null;
    try {
      if (value) localStorage.setItem(this.configKey, value); else localStorage.removeItem(this.configKey);
      this.clientId = value || this.appClientId;
      this.account = null;
      this.problem = '';
      this.engine.notice = 'Configuration enregistrée pour cette version de développement, sur cet appareil. Aucun secret OAuth n’est nécessaire.';
    } catch { this.problem = 'La configuration ne peut pas être mémorisée dans ce navigateur.'; }
    this.render();
    await this.prepare();
  }

  async onConnected() {
    this.problem = ''; this.account = null;
    this.engine.api?.close();
    this.engine.graph = revisionGraph([]);
    this.engine.api = new DriveAPI({ token: () => this.auth?.token(), onExpired: () => { this.auth?.clearToken(); this.account = null; this.problem = this.auth?.kind === 'worker' ? 'Google Drive a refusé ce jeton. Réessayer la synchronisation ; la session pourra être renouvelée.' : 'La connexion Google a expiré. Se reconnecter pour poursuivre.'; this.render(); },
      onProgress: (fraction) => { this.engine.status = `Envoi de la sauvegarde : ${Math.round(fraction * 100)} %…`; this.render(); },
    });
    void this.loadAccount(this.engine.api);
    this.engine.status = 'Google Drive connecté.'; this.render();
    await this.listFolders();
    if (this.engine.state.binding) {
      if (this.engine.state.auto && this.canSync()) await this.engine.sync(); else await this.engine.refresh();
    }
    this.render();
  }

  async loadAccount(api) {
    try {
      const account = await api.getAccount();
      if (api === this.engine?.api && this.connected()) { this.account = account; this.render(); }
    } catch { /* Account details are optional; keep the Drive connection available. */ }
  }

  async disconnect() {
    if (this.auth?.kind === 'worker') {
      try { const logout = this.auth.disconnect(); this.render(); await logout; }
      catch { this.problem = 'La déconnexion Google a échoué. Réessayer.'; this.render(); return; }
    }
    clearTimeout(this.timer); if (this.auth?.kind !== 'worker') this.auth?.disconnect(); this.engine?.disconnect(); this.account = null; this.problem = ''; this.folders = [];
    try { localStorage.removeItem(this.previousConnectionKey); } catch { /* Browser storage may be unavailable. */ }
    $('drive-folders').replaceChildren(); this.render();
  }

  async listFolders() {
    if (!this.connected()) return;
    const selected = this.engine.state.binding?.id;
    await this.engine.run(async () => {
      this.folders = await this.engine.folders();
      const select = $('drive-folders'); select.replaceChildren();
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Choisir une sauvegarde'; select.append(empty);
      for (const folder of this.folders) { const option = document.createElement('option'); option.value = folder.id; option.textContent = folder.name; select.append(option); }
      if (this.folders.some((folder) => folder.id === selected)) select.value = selected;
    });
    $('drive-folders').onchange = () => this.render(); this.render();
  }

  async chooseFolder() {
    const id = $('drive-folders').value;
    if (!id || !this.connected() || this.engine.busy) return;
    clearTimeout(this.timer);
    await this.engine.bind(id);
  }

  async create() {
    if (!this.connected() || this.engine.busy) return;
    if (await this.engine.create($('drive-new-name').value)) await this.listFolders();
  }

  async toggleAuto() {
    await this.engine.setAuto($('drive-auto').checked);
    if (this.engine.state.auto && this.connected()) await this.engine.sync();
  }

  wake() {
    if (document.visibilityState !== 'visible' || !navigator.onLine || !this.connected() || this.auth?.pending || !this.engine.state.auto || this.engine.busy || this.engine.preview || !this.canSync()) { this.render(); return; }
    void this.engine.sync();
  }

  changed(edited = true) { if (edited && this.engine) this.engine.localChanged = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.wake(), 1500); this.render(); }
  pauseForImport() { clearTimeout(this.timer); this.engine?.pauseForImport(); }
  busy() { return !!this.engine?.busy || !!this.auth?.pending; }

  async compare(revision) {
    if (!await this.engine.compare(revision) || !this.engine.preview) return;
    const preview = this.engine.preview;
    $('drive-preview-description').textContent = `Sauvegarde du ${date(preview.node.at)}`;
    this.comparison.setComparison(preview.comparison);
    $('drive-preview-dialog').querySelector('.backup-comparison-options').open = false;
    this.showDialog('drive-preview-dialog'); this.render();
  }

  async resolve(choice) {
    if (await this.engine.resolve(choice, this.comparison.choices)) {
      $('drive-preview-dialog').close(); this.showDialog('backups-dialog'); this.announce(this.engine.status);
    }
    this.render();
  }
}
