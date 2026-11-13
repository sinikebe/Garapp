# Cloudflare Workers hosting

Garapp is served at `https://garapp.siniverse.cc` by the existing
`siniverse-garapp-site` Worker and Cloudflare Static Assets. Authorization remains
on the separate suite Worker at `https://api.siniverse.cc`. Vehicle records,
attachments, exports, browser storage and PWA scopes are unaffected by the CI
pipeline. No account secret belongs in source or generated assets.

## GitHub-hosted validation and publication

Use standard GitHub-hosted Linux runners and Node.js 22.12 or later. `npm ci`
installs the exact Wrangler version from `package-lock.json`; publication uses
that local executable, never an unpinned global tool.

| Trigger | Result | Cloudflare credentials |
| --- | --- | --- |
| Pull request into main/dev, including a fork | CI, source/PWA checks, historical backups, tests and asset package | None |
| Successful push CI on main | Rebuild and deploy production | Required |
| Successful push CI on dev | Rebuild and publish named Preview `dev` of the same Worker | Required |
| Manual Cloudflare Worker run, `deploy=false` (default) | Validate and build only | None |
| Manual Cloudflare Worker run, `deploy=true` on main/dev | Validate and publish selected branch | Required |
| Deletion of dev | Remove only the named `dev` Preview if the branch was not recreated | Required |

The publication workflow runs from the default branch after `CI`. It accepts
only successful push runs from this repository and the two named branches.
Pull request runs cannot enter its credential-bearing job; no
`pull_request_target` executes repository code. A manual CI run does not imply
publication: use the explicit Cloudflare Worker dispatch with `deploy=true`.

The build checks immutable historical backup inputs, sources and PWA fingerprints,
runs all Node tests, and then writes `dist/`. Before building and again immediately
before Wrangler, the workflow checks that the local commit is the expected event
SHA and still the head of the target branch. Queued obsolete runs skip publication.
The selected build environment must match the publication branch.

Configure repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`
with access to this existing Worker. A push with missing secrets explicitly skips
publication. The publisher also rejects an account other than the existing
Worker account before invoking Wrangler. A manual `deploy=true` request with missing secrets fails with a clear
configuration error. Adding secrets does not itself start a deployment; dispatch
once on main or dev after configuration. Never print secret values or add them to
Wrangler files, command arguments, artifacts or browser preferences.

Disable the former Cloudflare Workers Builds production/branch triggers before
using GitHub publication, so a push does not run both systems. Do not reactivate
paid options, alter DNS or change Worker/domain identities as part of this setup.
`wrangler.jsonc` retains the existing compatibility date, static assets and SPA
fallback, with an empty `previews` block for this assets-only Worker.

## Dev Preview

The command is `wrangler preview --name dev`, scoped to `siniverse-garapp-site`.
It does not deploy a separate Worker or assign a production route to dev. Preview
hostnames are managed separately in Cloudflare. With the current Preview-only
base `dev.garapp.siniverse.cc`, the named Preview is
`https://dev.dev.garapp.siniverse.cc`; this is not a promise that the shorter base
serves the application. Routing adjustments remain a separate operation.

Preview URLs are public unless Cloudflare Access is configured. This pipeline
creates no per-PR or arbitrary feature-branch Preview, so deleting a merged work
branch needs no remote Preview cleanup. `main` and `dev` are retained. The dev
Preview is removed only when dev itself is deleted, and cleanup skips if dev has
been recreated. Cleanup never calls `wrangler delete` on the Worker.

## Local packaging

```sh
npm ci
GARAPP_BUILD_BRANCH=main npm run build:cloudflare
npm exec -- wrangler deploy --dry-run --outdir /tmp/garapp-worker-dry-run
```

Choose `GARAPP_BUILD_BRANCH=dev` for a dev asset package, in a fresh checkout or
after removing only generated `dist/`. A dry run checks local packaging, not token
permissions, live routes or Preview availability. Real publication is intentionally
restricted to trusted GitHub event context and never begins with missing secrets.

## Historical GitHub Pages and recovery

The [legacy Pages workflow](legacy-pages.md) remains independent and publishes
only redirect entry points plus same-origin recovery tools. Its artifact name
includes the run and attempt IDs; publication waits briefly for that exact artifact
to become visible, so a retried job cannot select another attempt's artifact.

The old `sinikebe.github.io` origin keeps separate storage. Export there through
`recovery.html`, then import on the new domain, or reconnect an existing verified
Drive backup. Preserve OAuth projects, Drive namespaces and original revision
history. Browser tokens remain in memory; refresh tokens remain in the shared
authorization Worker. The CI migration does not transfer or erase user data.

References: [GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[Workers Previews in CI](https://developers.cloudflare.com/workers/previews/examples/),
[Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/),
[Preview domains](https://developers.cloudflare.com/workers/previews/custom-domains/).
