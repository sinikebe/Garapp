/** Google Identity Services token model: explicit gestures and memory-only tokens. */
import { DRIVE_SCOPE } from './drive-format.js';

export const validClientId = (value) => /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(value);
let library;

export function loadGoogleIdentity(document = globalThis.document) {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve(globalThis.google.accounts.oauth2);
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.referrerPolicy = 'no-referrer';
    const fail = () => { script.remove(); library = null; reject(Error('La connexion Google est indisponible. Vérifier la connexion réseau et réessayer.')); };
    const timer = setTimeout(fail, 20000);
    script.onerror = () => { clearTimeout(timer); fail(); };
    script.onload = () => {
      clearTimeout(timer);
      if (globalThis.google?.accounts?.oauth2) resolve(globalThis.google.accounts.oauth2); else fail();
    };
    document.head.append(script);
  });
  return library;
}

export class DriveAuthorization {
  constructor({ clientId, oauth, onToken, onError, now = () => Date.now() }) {
    if (!validClientId(clientId)) throw Error('Un identifiant OAuth Web Google valide est nécessaire.');
    Object.assign(this, { onToken, onError, now });
    this.accessToken = null; this.expiresAt = 0; this.generation = 0; this.pending = false;
    this.oauth = oauth; this.clientId = clientId;
  }

  /** Call synchronously from a click, after the SDK has been prepared. */
  connect() {
    if (this.pending) return;
    const generation = ++this.generation;
    this.pending = true;
    const fail = () => {
      if (generation !== this.generation) return;
      this.pending = false; this.clearToken();
      this.onError('La connexion Google a été annulée ou refusée. Vérifier aussi que les fenêtres de connexion sont autorisées.');
    };
    try {
      const client = this.oauth.initTokenClient({
        client_id: this.clientId, scope: DRIVE_SCOPE, include_granted_scopes: false,
        callback: (response) => {
          if (generation !== this.generation) return;
          this.pending = false;
          if (response.error || !response.access_token || !this.oauth.hasGrantedAllScopes(response, DRIVE_SCOPE) || !Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) <= 0) { fail(); return; }
          this.accessToken = response.access_token;
          this.expiresAt = this.now() + Number(response.expires_in) * 1000;
          this.onToken();
        }, error_callback: fail,
      });
      client.requestAccessToken({ prompt: 'select_account' });
    }
    catch { fail(); }
  }

  token() {
    if (this.expiresAt <= this.now() + 30000) this.clearToken();
    return this.accessToken;
  }

  clearToken() { this.accessToken = null; this.expiresAt = 0; }
  disconnect() { this.generation++; this.pending = false; this.clearToken(); }
}
