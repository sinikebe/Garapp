/** Short-lived Drive access tokens in memory; the refresh token stays in the auth Worker. */
export const WORKER_DRIVE_AUTH = 'https://api.siniverse.cc/v1/garapp/';

/** Remove the OAuth error marker without discarding the current route or history state. */
export function consumeWorkerFailure(currentLocation = globalThis.location, browserHistory = globalThis.history) {
  const url = new URL(currentLocation.href);
  if (!url.searchParams.getAll('drive_auth').includes('failed')) return false;
  url.searchParams.delete('drive_auth');
  browserHistory.replaceState(browserHistory.state, '', url.pathname + url.search + url.hash);
  return true;
}

export class WorkerDriveAuthorization {
  constructor({ fetcher = globalThis.fetch.bind(globalThis), now = () => Date.now(), navigate = (url) => globalThis.location.assign(url), base = WORKER_DRIVE_AUTH, timeoutMs = 7000 } = {}) {
    this.fetcher = fetcher;
    this.now = now;
    this.navigate = navigate;
    this.base = base;
    this.timeoutMs = timeoutMs;
    this.kind = 'worker';
    this.connected = false;
    this.pending = false;
    this.accessToken = null;
    this.expiresAt = 0;
    this.generation = 0;
    this.refreshing = null;
    this.logoutPromise = null;
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(new URL(path, this.base).href, {
        credentials: 'include', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        ...options, signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
  }

  async restore() {
    const response = await this.request('session');
    if (!response.ok) throw Error('Service de connexion temporairement indisponible.');
    let session;
    try { session = await response.json(); } catch { throw Error('Réponse de connexion invalide.'); }
    if (session?.connected === false) { this.connected = false; return false; }
    if (session?.connected !== true) throw Error('Réponse de connexion invalide.');
    this.connected = true;
    return !!await this.token();
  }

  /** A full-page navigation begins only in a user's click handler. */
  connect(returnTo) {
    const url = new URL('connect', this.base);
    url.searchParams.set('return_to', returnTo);
    this.navigate(url.href);
  }

  clearToken() { this.accessToken = null; this.expiresAt = 0; }

  async token() {
    if (!this.connected) return null;
    if (this.accessToken && this.expiresAt > this.now() + 30000) return this.accessToken;
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const pending = (async () => {
      const response = await this.request('token');
      if (response.status === 401) {
        if (generation === this.generation) { this.connected = false; this.clearToken(); }
        return null;
      }
      if (!response.ok) throw Error('Service de connexion temporairement indisponible.');
      let result;
      try { result = await response.json(); } catch { throw Error('Jeton Google invalide.'); }
      const lifetime = Number(result?.expires_in);
      if (typeof result?.access_token !== 'string' || !result.access_token || result.access_token.length > 4096
        || !Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 86400) throw Error('Jeton Google invalide.');
      if (generation !== this.generation) return null;
      this.accessToken = result.access_token;
      this.expiresAt = this.now() + lifetime * 1000;
      return this.accessToken;
    })();
    this.refreshing = pending;
    try { return await pending; }
    finally { if (this.refreshing === pending) this.refreshing = null; }
  }

  /** Keep the local session if server-side revocation fails, so a retry remains possible. */
  async disconnect() {
    if (this.logoutPromise) return this.logoutPromise;
    this.pending = true;
    const pending = (async () => {
      const response = await this.request('disconnect', { method: 'POST' });
      if (response.status !== 204) throw Error('La déconnexion Google a échoué. Réessayer.');
      this.generation++;
      this.connected = false;
      this.clearToken();
    })();
    this.logoutPromise = pending;
    try {
      await pending;
    } finally { this.pending = false; this.logoutPromise = null; }
  }
}
