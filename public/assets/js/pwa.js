/** Installation and offline readiness; garage data stays in its existing storage. */
const $ = (id) => document.getElementById(id);
const base = new URL('../../', import.meta.url);
const development = base.pathname.endsWith('/dev/');
const nativeApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installOffer = null;
let installed = false;
let registration = null;
let offlineReady = false;
let waiting = null;
let changedController = false;
let applying = false;
let updateTimer;
let checking = false;
let preparing = false;
let lastCheck = 0;
let returnFocus = null;
let hadController = navigator.serviceWorker?.controller?.scriptURL === new URL('sw.js', base).href;

// Capture the browser's offer even while the garage is still loading.
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installOffer = event; render(); });
window.addEventListener('appinstalled', () => { installed = true; installOffer = null; render(); });

function render() {
  if (!$('pwa-dialog')) return;
  const isInstalled = installed || nativeApp();
  $('pwa-open').textContent = isInstalled ? 'Application et mises à jour' : 'Installer Garapp';
  $('pwa-install').hidden = isInstalled || !installOffer;
  $('pwa-installed').hidden = !isInstalled;
  $('pwa-manual').hidden = isInstalled;
  $('pwa-offline').textContent = offlineReady ? 'Garapp est prêt à être rouvert sans connexion sur cet appareil. Les documents enregistrés avec le garage restent accessibles.' : preparing ? 'Téléchargement de l’application pour l’accès hors connexion…' : 'L’accès hors connexion n’est pas encore prêt sur cet appareil. Une connexion est nécessaire pour le préparer.';
  $('pwa-prepare').hidden = offlineReady;
  $('pwa-prepare').disabled = preparing || checking;
  $('pwa-check').disabled = checking || preparing;
  $('pwa-check').textContent = checking ? 'Recherche en cours…' : 'Rechercher une mise à jour';
  $('pwa-connectivity').hidden = navigator.onLine !== false;
  $('pwa-connectivity').textContent = offlineReady ? 'Hors connexion · garage disponible' : 'Hors connexion';
  $('pwa-update-banner').hidden = !waiting && !changedController;
  $('pwa-update').disabled = applying;
  $('pwa-update').textContent = applying ? 'Mise à jour…' : changedController && !waiting ? 'Recharger l’application' : 'Mettre à jour';
}

function feedback(message) { $('pwa-feedback').textContent = message; }

function canReload() {
  const guard = new Event('garapp:before-update', { cancelable: true });
  document.dispatchEvent(guard);
  return document.documentElement.dataset.garappReady === 'true' && !guard.defaultPrevented;
}

function blockUpdate() {
  applying = false;
  clearTimeout(updateTimer);
  $('pwa-update-message').textContent = 'Terminer ou annuler la saisie en cours, puis attendre la fin des enregistrements et sauvegardes avant de mettre à jour.';
  render();
}

function noteWaiting(worker) {
  if (!worker || worker.state === 'redundant') return;
  waiting = worker;
  $('pwa-update-message').textContent = 'Une nouvelle version de Garapp est prête. La mise à jour rechargera la page après confirmation ; le garage enregistré sera conservé.';
  render();
}

function talk(worker, type, timeout = 15000) {
  if (!worker) return Promise.reject(Error('L’application hors connexion n’est pas encore activée.'));
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(Error('La préparation n’a pas répondu. Réessayer avec une connexion disponible.')); }, timeout);
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer); channel.port1.close();
      if (!data?.ok) reject(Error(data?.message || 'La préparation hors connexion a échoué.'));
      else resolve(data);
    };
    try { worker.postMessage({ type }, [channel.port2]); }
    catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
  });
}

async function refreshOffline() {
  try {
    const result = await talk(registration?.active, 'OFFLINE_STATUS');
    offlineReady = result.ready;
  } catch { offlineReady = false; }
  render();
}

function watch(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') {
      if (navigator.serviceWorker.controller) noteWaiting(registration.waiting ?? worker);
    }
    if (worker.state === 'activated') { if (waiting === worker) waiting = null; void refreshOffline(); }
    if (worker.state === 'redundant') {
      if (waiting === worker) waiting = null;
      feedback('La nouvelle version n’a pas pu être préparée. La version déjà disponible et le garage sont conservés. Réessayer avec une connexion disponible.');
      render();
    }
  });
}

async function checkUpdate() {
  if (checking) return;
  checking = true; render();
  try {
    if (!registration) await register();
    if (!registration) throw Error('indisponible');
    await registration.update();
    lastCheck = Date.now();
    if (registration.waiting) noteWaiting(registration.waiting);
    feedback(registration.installing ? 'Une version de Garapp est en cours de préparation.' : registration.waiting ? 'Une mise à jour est disponible. Fermer ce panneau pour accéder au bouton de mise à jour.' : 'Recherche terminée. Aucune nouvelle version prête à installer.');
    await refreshOffline();
  } catch { feedback('La recherche de mise à jour est indisponible actuellement. Le garage ouvert reste utilisable.'); }
  finally { checking = false; render(); }
}

async function prepare() {
  if (preparing) return;
  preparing = true; render();
  try {
    if (!registration) await register();
    if (registration?.active) {
      offlineReady = (await talk(registration.active, 'PREPARE_OFFLINE', 60000)).ready;
      feedback(offlineReady ? 'Accès hors connexion préparé et vérifié sur cet appareil.' : 'La préparation reste incomplète. Réessayer avec une connexion disponible.');
    } else {
      await registration?.update();
      feedback('La préparation a été relancée. Garder cette page ouverte jusqu’à la confirmation de disponibilité hors connexion.');
    }
  } catch { feedback('L’accès hors connexion n’a pas pu être préparé. Vérifier la connexion et l’espace disponible, puis réessayer. Le garage enregistré est conservé.'); }
  finally { preparing = false; render(); }
}

async function register() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    feedback('L’accès hors connexion n’est pas disponible dans ce contexte. Ouvrir Garapp en HTTPS dans un navigateur compatible.');
    return;
  }
  if (registration) return;
  registration = await navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.href, updateViaCache: 'none' });
  registration.addEventListener('updatefound', () => watch(registration.installing));
  watch(registration.installing);
  if (registration.waiting) { noteWaiting(registration.waiting); watch(registration.waiting); }
  if (registration.active) await refreshOffline();
}

function open() {
  if ([...document.querySelectorAll('dialog[open]')].some((dialog) => dialog.querySelector('form') || dialog.id === 'import-dialog')) return;
  returnFocus = document.activeElement?.closest('details[data-header-menu]')?.querySelector('summary') ?? document.activeElement;
  for (const menu of document.querySelectorAll('details[data-header-menu][open]')) menu.open = false;
  for (const dialog of document.querySelectorAll('dialog[open]')) if (dialog.id !== 'pwa-dialog') dialog.close();
  render();
  if (!$('pwa-dialog').open) $('pwa-dialog').showModal();
  if (registration?.active) void refreshOffline();
}

document.addEventListener('click', (event) => { if (event.target.closest('[data-pwa-open]')) open(); });
$('pwa-install').addEventListener('click', async () => {
  if (!installOffer) return;
  const offer = installOffer; installOffer = null;
  try {
    await offer.prompt();
    const result = await offer.userChoice;
    feedback(result.outcome === 'accepted' ? 'La demande d’installation a été acceptée.' : 'Installation annulée. Garapp reste accessible depuis le navigateur.');
  } catch { feedback('L’installation directe n’est pas proposée dans ce contexte. Utiliser le menu du navigateur décrit ci-dessous.'); }
  render();
});
$('pwa-check').addEventListener('click', () => { void checkUpdate(); });
$('pwa-prepare').addEventListener('click', () => { void prepare(); });
$('pwa-close').addEventListener('click', () => $('pwa-dialog').close());
$('pwa-dialog').addEventListener('close', () => {
  if (!document.querySelector('dialog[open]') && returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
});
$('pwa-update').addEventListener('click', () => {
  if (applying) return;
  if (!canReload()) { blockUpdate(); return; }
  if (!waiting && changedController) { location.reload(); return; }
  if (!waiting) return;
  applying = true; render();
  updateTimer = setTimeout(() => { applying = false; $('pwa-update-message').textContent = 'La mise à jour n’a pas encore été activée. Le garage reste ouvert ; réessayer lorsque la page est prête.'; render(); }, 15000);
  waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
});
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', () => {
  const previous = hadController;
  hadController = navigator.serviceWorker.controller?.scriptURL === new URL('sw.js', base).href;
  if (applying) {
    clearTimeout(updateTimer);
    if (canReload()) { location.reload(); return; }
    changedController = true; waiting = null; blockUpdate();
  } else if (previous) {
    // Another tab may have activated an update; this page keeps its current forms.
    changedController = true; waiting = null;
    $('pwa-update-message').textContent = 'Une nouvelle version est disponible. Recharger lorsque les saisies et les sauvegardes sont terminées.';
  }
  void refreshOffline(); render();
});
for (const event of ['online', 'offline']) window.addEventListener(event, () => { render(); if (event === 'online' && Date.now() - lastCheck > 300000) void checkUpdate(); });
window.addEventListener('focus', () => { if (navigator.onLine !== false && Date.now() - lastCheck > 300000) void checkUpdate(); });
const mode = window.matchMedia('(display-mode: standalone)');
mode.addEventListener?.('change', render);
if (development) {
  $('app-manifest').href = new URL('manifest-dev.webmanifest', base).href;
  document.querySelector('meta[name="apple-mobile-web-app-title"]').content = 'Garapp dev';
}
render();
void register().catch(() => { feedback('La préparation hors connexion a échoué. Le garage reste utilisable en ligne ; réessayer depuis ce panneau.'); render(); });
