/** The small app launcher shared by Finapp and Garapp. No user data is transferred. */
export const SUITE_APPS = Object.freeze([
  { id: 'finapp', name: 'Finapp', directory: 'finapp', mark: 'f.', fr: 'Planifier et comparer', en: 'Plan and compare' },
  { id: 'garapp', name: 'Garapp', directory: 'Garapp', mark: 'g.', fr: 'Prendre soin de son véhicule', en: 'Look after your vehicle' },
]);

/** Keep development links in /dev/ and support sibling apps in a local preview. */
export function suiteLinks(address) {
  const base = new URL('./', address);
  const match = base.pathname.match(/^(.*\/)(?:finapp|Garapp)\/(dev\/)?$/i);
  const preview = Boolean(match?.[2]);
  const root = match ? new URL(match[1], base) : new URL('https://sinikebe.github.io/');
  return { preview, apps: SUITE_APPS.map((app) => ({ ...app, href: new URL(`${app.directory}/${preview ? 'dev/' : ''}`, root).href })) };
}

export function initAppSwitcher(root = document, address = new URL('../../', import.meta.url)) {
  const launcher = root.querySelector('[data-suite-switcher]');
  if (!launcher) return;
  const trigger = launcher.querySelector('summary');
  const links = suiteLinks(address);
  const translate = () => {
    const french = root.documentElement.lang.startsWith('fr');
    trigger.setAttribute('aria-label', french ? 'Changer d’application' : 'Switch application');
    launcher.querySelector('[data-suite-title]').textContent = french ? 'Vos applications' : 'Your applications';
    launcher.querySelector('nav').setAttribute('aria-label', french ? 'Applications finapps' : 'finapps applications');
    launcher.querySelector('[data-suite-environment]').textContent = links.preview
      ? (french ? 'Développement' : 'Development') : (french ? 'Versions principales' : 'Main versions');
    for (const app of links.apps) {
      const link = launcher.querySelector(`[data-suite-app="${app.id}"]`);
      if (!link) continue;
      link.href = app.href;
      link.setAttribute('aria-label', `${app.name} — ${french ? app.fr : app.en}`);
      link.querySelector('[data-suite-description]').textContent = french ? app.fr : app.en;
      if (app.id === launcher.dataset.suiteSwitcher) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  };
  translate();
  const observer = new MutationObserver(translate);
  observer.observe(root.documentElement, { attributes: true, attributeFilter: ['lang'] });

}

if (typeof document !== 'undefined') initAppSwitcher();
