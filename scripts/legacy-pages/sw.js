/* Retire only the historical Garapp registration. Keep all user storage intact. */
const legacyScopes = [
  'https://sinikebe.github.io/Garapp/',
  'https://sinikebe.github.io/Garapp/dev/',
];
if (legacyScopes.includes(self.registration.scope)) {
  self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      // Taking over releases future requests from the former cache-first worker.
      // Do not navigate open editors or delete their caches, databases or files.
      await self.clients.claim();
      await self.registration.unregister();
    })());
  });
}
// No fetch handler: subsequent navigations reach the redirect or recovery page.
