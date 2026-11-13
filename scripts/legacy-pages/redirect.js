/** Only known section names cross origins; queries and record identifiers stay local. */
(() => {
  const current = new URL(location.href);
  if (current.origin !== 'https://sinikebe.github.io'
    || !/^\/Garapp(?:\/dev)?(?:\/(?:index\.html)?)?$/.test(current.pathname)) return;
  const destination = new URL('https://garapp.siniverse.cc/');
  const sections = ['garage', 'interventions', 'composants', 'assurance', 'depenses', 'statistiques'];
  if (sections.includes(current.hash.slice(1))) destination.hash = current.hash;
  document.getElementById('garapp-destination').href = destination.href;
  location.replace(destination.href);
})();
