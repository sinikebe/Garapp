/** Export preserved local JSON without parsing it through the current schema. */
import { escapeHtml } from './ui-format.js';

export class RecoveryPanel {
  constructor({ repository, download, showDialog }) {
    Object.assign(this, { repository, download, showDialog });
    this.list = document.getElementById('recovery-list');
    this.message = document.getElementById('recovery-message');
    this.list.addEventListener('click', (event) => {
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
        ? `${points.length} copie(s) conservée(s) sur cet appareil.`
        : 'Aucune copie de récupération pour le moment. Une copie est conservée avant chaque import ou migration des données.';
      this.list.innerHTML = points.map((point) => {
        const date = new Date(point.createdAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
        const description = point.reason === 'merge-source' ? 'Sauvegarde source conservée lors d’une fusion.' : `Garage et documents conservés avant ${point.reason === 'migration' ? 'une migration des données' : point.reason === 'merge' ? 'une fusion' : 'un import'}.`;
        return `<article class="recovery-card"><div><h3>Copie du ${escapeHtml(date)}</h3><p class="hint" data-help-keep>${escapeHtml(description)}</p></div><button type="button" class="ghost-button" data-recovery-export="${escapeHtml(point.id)}">Exporter cette copie</button></article>`;
      }).join('');
    } catch (error) {
      this.message.textContent = `Lecture impossible : ${error.message}`;
    }
  }

  async export(button) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      const id = button.dataset.recoveryExport;
      const raw = await this.repository.readRecovery(id);
      this.download(new Blob([raw], { type: 'application/json' }), `garapp-recovery-${id}.json`);
      this.message.textContent = 'Le téléchargement de la copie originale a été demandé. Utilisez Importer pour la consulter avant de remplacer le garage.';
    } catch (error) {
      this.message.textContent = `Export impossible : ${error.message}`;
    } finally { button.disabled = false; }
  }
}
