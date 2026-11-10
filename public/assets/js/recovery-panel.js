/** Export preserved local JSON without parsing it through the current schema. */
import { escapeHtml } from './ui-format.js';

export class RecoveryPanel {
  constructor({ repository, download, showDialog, openFile }) {
    Object.assign(this, { repository, download, showDialog, openFile });
    this.list = document.getElementById('recovery-list');
    this.message = document.getElementById('recovery-message');
    this.generation = 0;
    document.getElementById('recovery-dialog').addEventListener('close', () => { this.generation++; this.opening = false; });
    this.list.addEventListener('click', (event) => {
      const open = event.target.closest('[data-recovery-open]');
      if (open) return void this.openCopy(open);
      const button = event.target.closest('[data-recovery-export]');
      if (button) void this.export(button);
    });
  }

  async open() {
    this.showDialog('recovery-dialog');
    this.list.replaceChildren();
    this.message.textContent = 'Lecture des copies de récupération…';
    try {
      const points = await this.repository.recoveryPoints();
      this.message.textContent = points.length
        ? `${points.length} ${points.length === 1 ? 'copie disponible' : 'copies disponibles'}.`
        : 'Aucune copie pour le moment. Elles sont créées avant les imports et les fusions.';
      this.list.innerHTML = points.map((point) => {
        const date = new Date(point.createdAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
        const description = point.reason === 'merge-source' ? 'Sauvegarde utilisée pour une fusion' : point.reason === 'migration' ? 'Avant une mise à jour du format' : point.reason === 'merge' ? 'Avant une fusion' : 'Avant un import';
        return `<article class="recovery-card"><div><h3>${escapeHtml(date)}</h3><p class="hint" data-help-keep>${escapeHtml(description)}</p></div><div class="backup-actions"><button type="button" class="ghost-button" data-recovery-open="${escapeHtml(point.id)}">Ouvrir cette copie</button><button type="button" class="text-button" data-recovery-export="${escapeHtml(point.id)}">Télécharger</button></div></article>`;
      }).join('');
    } catch (error) {
      this.message.textContent = `Lecture impossible : ${error.message}`;
    }
  }

  async openCopy(button) {
    if (button.disabled || this.opening) return;
    const generation = ++this.generation;
    this.opening = true;
    button.disabled = true;
    this.message.textContent = 'Ouverture de la copie…';
    try {
      const id = button.dataset.recoveryOpen;
      const raw = await this.repository.readRecovery(id);
      if (generation !== this.generation) return;
      await this.openFile(new File([raw], 'copie-de-recuperation.json', { type: 'application/json' }), () => generation === this.generation);
    } catch (error) {
      if (generation === this.generation) this.message.textContent = `Ouverture impossible : ${error.message}`;
    } finally { if (generation === this.generation) this.opening = false; button.disabled = false; }
  }

  async export(button) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      const id = button.dataset.recoveryExport;
      const raw = await this.repository.readRecovery(id);
      this.download(new Blob([raw], { type: 'application/json' }), `garapp-recovery-${id}.json`);
      this.message.textContent = 'Téléchargement demandé. Vérifiez le fichier dans vos téléchargements.';
    } catch (error) {
      this.message.textContent = `Export impossible : ${error.message}`;
    } finally { button.disabled = false; }
  }
}
