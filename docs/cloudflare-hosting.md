# Cloudflare Workers hosting

Garapp is a static, offline-capable application hosted at
`https://garapp.siniverse.cc`. The static site is published by a Worker using
Cloudflare Static Assets; Google Drive authorization uses a separate suite
Worker at `https://api.siniverse.cc`. Vehicle records and attachments remain in
the browser and in the user's own Drive. Source code and deployed assets are
public, including when the source repository is private: no personal data,
client secret, session cookie or refresh token belongs in the repository.

## Build and publish

Connect the Garapp repository to **Workers Builds** in Cloudflare. Create a
Worker named `siniverse-garapp-site` (the exact name in `wrangler.jsonc`), with
`main` as its production branch. Use the repository root, Node.js 22 or later,
the build command `npm run build:cloudflare`, and the deploy command
`npx wrangler deploy`. These commands run inside Cloudflare; local development
can use `node scripts/build-cloudflare-worker.mjs` without npm or Wrangler.
Disable preview branch builds for this production-only Worker.

The build checks the preceding Git revision's immutable backup fixtures and
historical Drive metadata, checks the source and PWA cache, runs all tests, and
only then writes `dist/`. A shallow checkout may fetch the exact preceding
revision; failure to verify history stops deployment. Workers Builds supplies
`WORKERS_CI_BRANCH`, and the build refuses a branch other than `main`. To rerun
locally, remove only the generated `dist/` directory before rebuilding.
`wrangler.jsonc` serves this directory as Static Assets and preserves the
previous Pages SPA fallback for unknown routes. The published service worker
is generated from final assets and retains its offline scope.

GitHub Actions validates both the application and the Worker asset package.
It does **not** deploy either Cloudflare project. The former Pages deployment
job has been removed so enabling an old deployment variable cannot publish
the Pages project again.

## Rollout

1. Deploy the shared authorization Worker on `api.siniverse.cc`. In the
   existing Garapp Google Cloud project, add the exact OAuth Web redirect
   `https://api.siniverse.cc/v1/garapp/callback` to its existing client.
   Store the client secret and encryption key
   only as Worker secrets. Keep the existing OAuth project and its Drive
   permissions to retain access to historical backups.
2. Deploy `siniverse-garapp-site` through Workers Builds and inspect its
   `workers.dev` deployment before moving the domain. The initial
   `wrangler.jsonc` intentionally has no `routes`, so Pages can continue to
   serve `garapp.siniverse.cc` during this preview. An alias outside the
   production hostname still uses the manual Google connection.
3. At cutover, delete the Pages CNAME for `garapp.siniverse.cc` under the
   Cloudflare zone's DNS Records, then remove that hostname from the Pages
   project's **Custom domains**. A Worker Custom Domain cannot be created
   while the Pages CNAME exists. Add the `routes` property to `wrangler.jsonc`
   and merge the change to `main` to trigger Workers Builds. The final
   configuration is:

   ```json
   {
     "name": "siniverse-garapp-site",
     "compatibility_date": "2026-11-12",
     "assets": {
       "directory": "./dist",
       "not_found_handling": "single-page-application"
     },
     "routes": [{ "pattern": "garapp.siniverse.cc", "custom_domain": true }]
   }
   ```

   Keep the `routes` entry in source for subsequent deployments. Cloudflare
   will manage the Worker's DNS and certificate. Do not change the hostname
   or PWA scope: browser storage and installed app data stay attached to
   their existing origin.
4. Confirm that an existing Drive folder and its complete revision history
   remain visible; compare and restore a copy, then test large transfers and
   reconnection after closing the app. Google OAuth projects in **Testing**
   expire Drive authorization after seven days; switch to **In production**
   before expecting persistent connections.
5. Disable automatic deployments on the old Pages project after the Worker
   takes over the hostname. Retain legacy GitHub Pages recovery options until
   browsers containing old-origin data have been migrated.

If the shared authorization Worker is unreachable, Garapp retains its
existing manual, memory-only Google connection. It never stores a Google token
in local storage. Its Drive backups remain immutable JSON files with the same
namespace and original revision graph. A host change never deletes Drive
files or moves local data between origins.

The historical `sinikebe.github.io` origin is separate browser storage.
Export a complete garage and recovery copies there, then import and verify
them on `garapp.siniverse.cc`. The existing Google Drive namespace maps to the
old publication URL by design; keep it unchanged for both environments.

Cloudflare references: [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/), [remove a Pages custom domain](https://developers.cloudflare.com/pages/configuration/custom-domains/#delete-a-custom-domain), [configure a Worker Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/#set-up-a-custom-domain-in-your-wrangler-configuration-file).
