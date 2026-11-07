/** Conservative synchronization: immutable branches, explicit conflict resolution. */
import { inventory } from './garage.js';
import { fingerprint } from './backups.js';
import { DRIVE_FOLDER, assertFolder, garageHash, makeSnapshot, readSnapshot, revisionGraph, snapshotInfo } from './drive-format.js';
import { propertyQuery } from './drive-api.js';

const pointer = (node) => ({ id: node.id, revision: node.revision, wire: node.wire, hash: node.hash });
const headKey = (heads) => heads.map((node) => node.revision).sort().join(',');

export class DriveSync {
  constructor({ namespace, settings, development = false, getGarage, canSync, canApply, applyRemote, onChange = () => {} }) {
    Object.assign(this, { namespace, settings, development, getGarage, canSync, canApply, applyRemote, onChange });
    this.state = { auto: false }; this.graph = revisionGraph([]); this.api = null;
    this.busy = false; this.error = ''; this.notice = ''; this.status = 'Google Drive déconnecté.'; this.preview = null; this.pauseGeneration = 0;
    this.hashes = new WeakMap(); this.localChanged = false;
  }

  /** The application supplies a new model object for every saved modification. */
  hash(garage) {
    if (!this.hashes.has(garage)) this.hashes.set(garage, garageHash(garage));
    return this.hashes.get(garage);
  }

  async restore() {
    try {
      const value = await this.settings.load();
      if (value?.binding?.id && typeof value.binding.id === 'string') {
        this.state = { binding: { id: value.binding.id, name: String(value.binding.name ?? 'Garage') }, auto: value.auto === true };
        if (value.baseline && /^[a-f0-9]{64}$/.test(value.baseline.hash) && Array.isArray(value.baseline.heads) && value.baseline.heads.length && value.baseline.heads.every((node) => typeof node.id === 'string' && typeof node.revision === 'string')) this.state.baseline = value.baseline;
        this.state.checkedAt = typeof value.checkedAt === 'string' ? value.checkedAt : null;
      }
    } catch { this.notice = 'Le lien Drive n’a pas pu être relu. Sélectionner le dossier pour le retrouver.'; }
    this.onChange();
  }

  async persist() {
    try { await this.settings.save(this.state); }
    catch { this.notice = 'Le lien Drive ne peut pas être mémorisé sur cet appareil. Les fichiers Drive sont conservés ; sélectionner à nouveau le dossier après fermeture.'; }
  }

  async run(operation) {
    if (this.busy) return false;
    this.busy = true; this.error = ''; this.onChange();
    try { await operation(); return true; }
    catch (error) { if (error.name !== 'AbortError') this.error = error.message || 'La synchronisation Drive a échoué.'; return false; }
    finally { this.busy = false; this.onChange(); }
  }

  disconnect() {
    this.api?.close(); this.api = null; this.preview = null; this.graph = revisionGraph([]);
    this.status = 'Google Drive déconnecté. Les fichiers et le lien au dossier sont conservés.';
    this.onChange();
  }

  async setAuto(enabled) {
    this.state.auto = enabled;
    if (!enabled) this.status = 'Synchronisation automatique en pause. Le garage reste enregistré sur cet appareil.';
    await this.persist(); this.onChange();
  }

  pauseForImport() {
    this.pauseGeneration++;
    this.state.auto = false; this.preview = null;
    this.notice = 'Synchronisation Drive en pause après ouverture d’un fichier. Comparer les versions avant de la réactiver.';
    void this.persist(); this.onChange();
  }

  async folders() {
    const files = await this.api.list(`${propertyQuery('garapp', 'workspace-v1')} and ${propertyQuery('namespace', this.namespace)} and mimeType = '${DRIVE_FOLDER}'`);
    return files.filter((file) => { try { assertFolder(file, this.namespace); return true; } catch { return false; } });
  }

  async inspect() {
    if (!this.api || !this.state.binding) throw Error('Connecter Google Drive puis sélectionner un dossier Garapp.');
    const folder = assertFolder(await this.api.get(this.state.binding.id), this.namespace);
    this.state.binding.name = folder.name;
    const files = await this.api.list(`'${folder.id.replace(/'/g, "\\'")}' in parents and ${propertyQuery('garapp', 'snapshot-v1')} and ${propertyQuery('namespace', this.namespace)}`);
    // Drive's search index can lag behind an acknowledged upload. Recover its
    // exact file ID before interpreting the graph, including after a reload.
    for (const known of this.state.baseline?.heads ?? []) if (!files.some((file) => file.id === known.id)) {
      const recovered = await this.api.get(known.id);
      if (recovered.appProperties?.revision !== known.revision) throw Error('Une version Drive précédemment confirmée est introuvable ou différente.');
      files.push(recovered);
    }
    const nodes = [];
    for (const file of files) {
      const node = snapshotInfo(file, this.namespace, folder.id);
      if (!file.sha256Checksum && await fingerprint(await this.api.download(node)) !== node.wire) throw Error('Un fichier de l’historique Drive a changé.');
      nodes.push(node);
    }
    this.graph = revisionGraph(nodes);
    for (const known of this.state.baseline?.heads ?? []) if (!this.graph.byRevision.has(known.revision)) throw Error('L’historique Drive ne contient plus la dernière version confirmée.');
    return this.graph;
  }

  async loadNode(node) {
    const fresh = snapshotInfo(await this.api.get(node.id), this.namespace, this.state.binding.id);
    if (fresh.revision !== node.revision || fresh.wire !== node.wire || fresh.hash !== node.hash || headKey(fresh.parents.map((revision) => ({ revision }))) !== headKey(node.parents.map((revision) => ({ revision })))) throw Error('La version Drive a changé depuis sa sélection. Relancer la comparaison.');
    return readSnapshot(await this.api.download(fresh), fresh);
  }

  async acknowledge(hash, heads) {
    this.state.baseline = { hash, heads: heads.map(pointer) };
    this.state.checkedAt = new Date().toISOString();
    await this.persist();
    const garage = this.getGarage();
    if (await this.hash(garage) === hash && this.getGarage() === garage) this.localChanged = false;
  }

  async publish(garage, parents) {
    assertFolder(await this.api.get(this.state.binding.id), this.namespace);
    const snapshot = await makeSnapshot(garage, parents, this.namespace, this.state.binding.id, this.development);
    this.status = 'Envoi d’une nouvelle version complète sur Drive…'; this.onChange();
    const node = snapshotInfo(await this.api.upload(snapshot.metadata, snapshot.blob), this.namespace, this.state.binding.id);
    if (node.wire !== snapshot.metadata.appProperties.wire || node.revision !== snapshot.revision) throw Error('La version envoyée n’a pas été confirmée.');
    return node;
  }

  async create(name) {
    return this.run(async () => {
      if (!this.canSync()) throw Error('Terminer les modifications ou les transferts en cours avant de créer la sauvegarde Drive.');
      const garage = this.getGarage();
      const folder = assertFolder(await this.api.createFolder({ name: name.trim() || `Garapp${this.development ? ' dev' : ''} — Garage`, mimeType: DRIVE_FOLDER, appProperties: { garapp: 'workspace-v1', namespace: this.namespace } }), this.namespace);
      this.state = { binding: { id: folder.id, name: folder.name }, auto: false };
      await this.persist();
      const node = await this.publish(garage, []);
      await this.acknowledge(node.hash, [node]); await this.inspect();
      this.status = this.getGarage() === garage ? 'Première sauvegarde Drive envoyée et vérifiée. La synchronisation automatique peut être activée.' : 'Une première version est sauvegardée sur Drive. Des modifications locales restent à envoyer.';
    });
  }

  async bind(id) {
    return this.run(async () => {
      const folder = assertFolder(await this.api.get(id), this.namespace);
      if (this.state.binding?.id !== id) this.state = { binding: { id, name: folder.name }, auto: false };
      this.preview = null; await this.persist(); await this.inspect();
      this.status = 'Dossier sélectionné. Comparer une version ou synchroniser pour vérifier la correspondance avec ce garage.';
    });
  }

  async refresh() {
    return this.run(async () => {
      await this.inspect();
      this.status = 'Historique Drive actualisé. La synchronisation automatique est en pause.';
    });
  }

  async sync() {
    return this.run(async () => {
      const generation = this.pauseGeneration;
      if (!this.canSync()) throw Error('Terminer les modifications ou les transferts en cours avant de synchroniser.');
      this.preview = null;
      let graph = await this.inspect();
      let garage = this.getGarage(), hash = await this.hash(garage);
      const baseline = this.state.baseline;
      if (!baseline) {
        if (graph.heads.length && graph.heads.every((node) => node.hash === hash)) {
          for (const node of graph.heads) await this.loadNode(node);
          if (this.getGarage() !== garage) { this.status = 'Le garage a changé pendant la vérification. Synchroniser à nouveau.'; return; }
          await this.acknowledge(hash, graph.heads);
          this.status = 'Le garage correspond aux versions Drive vérifiées.';
        } else this.status = graph.heads.length ? 'Première liaison : comparer les versions puis choisir le garage à utiliser. Rien n’a été remplacé.' : 'Ce dossier est vide. Utiliser « Sauvegarder ce garage dans ce dossier » pour envoyer la première version.';
        return;
      }
      if (hash !== baseline.hash) {
        if (generation !== this.pauseGeneration) return;
        // Publish from the last acknowledged baseline, never from unseen heads.
        // Simultaneous writers therefore produce branches instead of lost edits.
        const node = await this.publish(garage, baseline.heads.map((head) => head.revision));
        await this.acknowledge(hash, [node]);
        graph = await this.inspect();
      }
      garage = this.getGarage(); hash = await this.hash(garage);
      if (!graph.heads.length) throw Error('L’historique Drive est vide alors qu’une sauvegarde avait été confirmée.');
      if (new Set(graph.heads.map((node) => node.hash)).size > 1) {
        this.status = 'Modifications concurrentes : toutes les versions sont conservées. Comparer les versions pour choisir la suite.';
        return;
      }
      const remoteHash = graph.heads[0].hash;
      if (hash !== this.state.baseline.hash) { this.status = 'Des modifications locales plus récentes restent à synchroniser.'; return; }
      // Verify every equivalent head before acknowledging a converged history.
      let incoming;
      for (const node of graph.heads) {
        const known = this.state.baseline.heads.some((head) => head.id === node.id && head.revision === node.revision && head.wire === node.wire && head.hash === node.hash);
        if (remoteHash !== hash || !known || node.file.sha256Checksum !== node.wire) incoming = await this.loadNode(node);
      }
      if (this.getGarage() !== garage) { this.status = 'Le garage a changé pendant le transfert. Synchronisation à reprendre.'; return; }
      if (generation !== this.pauseGeneration) { this.status = 'Synchronisation Drive en pause après ouverture d’un fichier.'; return; }
      if (remoteHash !== hash) {
        if (!this.canApply(false)) { this.status = 'Une version Drive attend la fermeture de la fiche ou de la comparaison ouverte.'; return; }
        await this.applyRemote(incoming, garage, false);
      }
      await this.acknowledge(remoteHash, graph.heads);
      this.status = 'Garage synchronisé avec Drive. Dernière vérification confirmée.';
    });
  }

  async compare(revision) {
    return this.run(async () => {
      const graph = await this.inspect();
      const node = graph.byRevision.get(revision);
      if (!node) throw Error('Cette version n’est plus disponible. Actualiser l’historique.');
      const local = this.getGarage(), incoming = await this.loadNode(node);
      if (this.getGarage() !== local) throw Error('Le garage local a changé. Relancer la comparaison.');
      this.preview = { node, incoming, local, heads: graph.heads.map(pointer), localCounts: inventory(local), remoteCounts: inventory(incoming) };
    });
  }

  /** Explicitly selected content becomes a new revision; ancestors stay intact. */
  async resolve(choice) {
    return this.run(async () => {
      const preview = this.preview;
      if (!preview || this.getGarage() !== preview.local) throw Error('Le garage local a changé. Relancer la comparaison.');
      if (!this.canApply(true)) throw Error('Terminer les modifications ou les transferts en cours avant de choisir une version.');
      const graph = await this.inspect();
      if (headKey(graph.heads) !== headKey(preview.heads)) throw Error('Une nouvelle version Drive est arrivée. Relancer la comparaison avant de choisir.');
      await this.loadNode(preview.node);
      const localHash = await this.hash(preview.local);
      let archive = graph.nodes.find((node) => node.hash === localHash);
      if (archive) await this.loadNode(archive);
      else archive = await this.publish(preview.local, this.state.baseline?.heads.map((node) => node.revision) ?? []);
      // Record the local archive immediately, even if the later transfer fails.
      await this.acknowledge(localHash, [archive]);
      if (this.getGarage() !== preview.local) throw Error('Le garage a changé pendant sa sauvegarde. Relancer la comparaison.');
      const target = choice === 'remote' ? preview.incoming : preview.local;
      const resolved = await this.publish(target, [...preview.heads.map((node) => node.revision), archive.revision]);
      if (choice === 'remote') {
        if (this.getGarage() !== preview.local || !this.canApply(true)) throw Error('La version choisie est sauvegardée sur Drive. Le garage local reste inchangé ; relancer la synchronisation après fermeture des fiches.');
        await this.applyRemote(target, preview.local, true);
      }
      await this.acknowledge(resolved.hash, [resolved]); this.preview = null;
      const latest = await this.inspect();
      this.status = latest.heads.some((head) => head.hash !== resolved.hash) ? 'Choix sauvegardé. Une autre modification est arrivée pendant le transfert ; comparer les versions restantes.' : 'Version choisie sauvegardée et vérifiée. Toutes les versions précédentes sont conservées.';
    });
  }

  async seed() {
    return this.run(async () => {
      if (!this.canSync()) throw Error('Terminer les modifications ou les transferts en cours.');
      const graph = await this.inspect();
      if (graph.nodes.length) throw Error('Le dossier contient maintenant des versions. Les comparer avant d’envoyer ce garage.');
      const node = await this.publish(this.getGarage(), []);
      await this.acknowledge(node.hash, [node]); await this.inspect();
      this.status = 'Première sauvegarde Drive envoyée et vérifiée.';
    });
  }
}
