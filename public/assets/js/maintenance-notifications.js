/** Browser delivery is opt-in, local to this deployment, and deduplicated per alert cycle. */
export class MaintenanceNotifications {
  constructor({ key, base, storage, platform = globalThis, onOpen }) {
    this.key = `${key}:maintenance-notifications.v1`; this.base = base; this.storage = storage;
    this.platform = platform; this.onOpen = onOpen; this.state = { enabled: false, sent: [] }; this.busy = false; this.problem = '';
    this.read();
  }
  read() {
    try {
      const data = JSON.parse(this.storage.getItem(this.key));
      if (data && typeof data.enabled === 'boolean' && Array.isArray(data.sent)) this.state = { enabled: data.enabled, sent: data.sent.filter((item) => typeof item === 'string').slice(-2000) };
    } catch { /* Local reminders and in-session deduplication remain available. */ }
  }
  write() { try { this.storage.setItem(this.key, JSON.stringify(this.state)); } catch { /* Preferences do not block garage access. */ } }
  get supported() { return this.platform.isSecureContext === true && typeof this.platform.Notification?.requestPermission === 'function'; }
  get permission() { return this.platform.Notification?.permission ?? 'unavailable'; }
  get enabled() { return this.state.enabled && this.permission === 'granted'; }
  async enable() {
    this.problem = '';
    if (!this.supported) return false;
    // Called only from the explicit activation button, preserving the browser user gesture.
    const permission = this.permission === 'granted' ? 'granted' : await this.platform.Notification.requestPermission();
    this.state.enabled = permission === 'granted'; this.write(); return this.enabled;
  }
  disable() { this.state.enabled = false; this.write(); this.problem = ''; }
  async notify(vehicle, alerts) {
    if (this.busy || !vehicle || !this.supported) return;
    this.busy = true;
    const deliver = async () => {
      this.read();
      if (!this.enabled) return;
      const unseen = alerts.filter((alert) => !this.state.sent.includes(JSON.stringify([vehicle.id, alert.token])));
      if (!unseen.length) return;
      const title = `Garapp · ${unseen.length} alerte${unseen.length > 1 ? 's' : ''}`;
      const options = { body: `${vehicle.name} : ${unseen.slice(0, 3).map((alert) => `${alert.name} (${alert.status === 'due' ? 'à faire' : 'bientôt'})`).join(' · ')}${unseen.length > 3 ? '…' : ''}`,
        tag: `garapp-maintenance:${new URL(this.base).pathname}:${vehicle.id}`, icon: new URL('assets/icons/app-192.png', this.base).href,
        data: { type: 'GARAPP_MAINTENANCE' } };
      const registration = await this.platform.navigator?.serviceWorker?.getRegistration(this.base.href);
      if (registration?.active && registration.showNotification) await registration.showNotification(title, options);
      else {
        const notification = new this.platform.Notification(title, options);
        notification.onclick = () => { notification.close(); this.platform.focus?.(); this.onOpen(); };
      }
      this.problem = '';
      this.state.sent = [...this.state.sent, ...unseen.map((alert) => JSON.stringify([vehicle.id, alert.token]))].slice(-2000); this.write();
    };
    try {
      const locks = this.platform.navigator?.locks;
      if (locks) await locks.request(this.key, deliver); else await deliver();
    } catch { this.problem = 'Le navigateur n’a pas pu afficher la notification. Les alertes restent disponibles dans la cloche.'; }
    finally { this.busy = false; }
  }
}
