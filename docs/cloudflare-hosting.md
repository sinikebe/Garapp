# Cloudflare Workers hosting

Garapp uses the existing `siniverse-garapp-site` Worker at
`https://garapp.siniverse.cc/`. Its named `dev` Preview uses
`https://dev.garapp.siniverse.cc/`. Domains remain managed in Cloudflare;
Wrangler declares no production or Preview routes. `workers_dev` and
`preview_urls` are explicitly disabled. Authorization remains on the separate
suite Worker at `https://api.siniverse.cc`.

## Shared GitHub pipeline

The `CI` caller is identical across the Siniverse applications and references
an immutable commit of the reusable workflow in `sinikebe/siniverse`. Its
`automation_ref` input matches the full SHA in `uses`. The registry and controller
in that shared revision select the existing Worker, account and HTTPS probe URL.
The application has no second publication workflow or local deployment controller.

All change PRs target `dev` first and may merge after review and successful CI.
Production promotion uses only a same-repository PR from `dev` into `main`,
after preview testing and explicit owner approval. Feature branches never merge
directly into `main`; a direct push must not bypass the promotion policy.

The common runner is `ubuntu-24.04`, with Node.js 24.22.2 from `.node-version`,
npm 11.19.1 from `packageManager`, and local Wrangler 4.161.0 from the lockfile.
One job installs with `npm ci`, checks, builds, dry-runs, and, if authorized,
publishes and probes the same `dist/`. No build artifact is uploaded to transfer
between jobs and no persistent Actions cache is introduced by this pipeline.

| Event | Behavior |
| --- | --- |
| PR into dev, or same-repository dev to main | Checks, build and local dry run; no publication credentials |
| Push main | Production publication after checks and source revision guards |
| Push dev | Named `dev` Preview of the same Worker after checks |
| Manual `deploy=false` (default) | Validation only |
| Manual `deploy=true` | Publication only for current main/dev and valid credentials |

The caller passes exactly `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
Only the common publication step receives their values. Missing credentials are
handled consistently by the shared controller: pushes explicitly skip publication;
an explicit manual publication request fails clearly. Adding secrets does not
start a run by itself. Use a permitted push or the explicit manual publication
option when configuration is complete; never put secret values in code or logs.

Repository, account, branch, source SHA and current remote head are checked centrally.
Publication is serialized per branch without cancelling an active deployment.
The shared controller writes `dist/deployment.json` and verifies it over HTTPS
after deployment. Garapp does not produce a second manifest or its own probe logic.
Former Cloudflare Builds triggers stay disabled; no additional Worker or paid
resource is required. Preview URLs remain public unless Access is configured.

## Garapp adapters

`npm run ci:check` preserves source/documentation checks, committed PWA fingerprints,
immutable historical backup fixtures and Drive metadata, every application test,
and the Python tests for legacy Pages packaging. `SINIVERSE_BASE_SHA` supplies
the shared comparison revision and is mapped to the existing `BACKUP_BASE_SHA`
checker. A local invocation can use `BACKUP_BASE_SHA` or the preceding Git commit.

`npm run ci:build` replaces only generated `dist/` and calls the existing static
packager. `SINIVERSE_BRANCH` selects main/dev packaging, including the PR target
variant; `SINIVERSE_SOURCE_BRANCH` is the actual feature branch. Environments are
`production`, `preview` or `test`, and `SINIVERSE_SHA` must match the checkout.
The built deployment configuration, displayed version and offline fingerprints
vary with the target. Public sources, browser storage, documents and Drive backups
are unchanged by packaging.

For local checks, use the pinned Node/npm versions and Python 3:

```sh
npm ci
npm run ci:check
SINIVERSE_BRANCH=main SINIVERSE_ENVIRONMENT=test SINIVERSE_SHA=$(git rev-parse HEAD) npm run ci:build
```

A dry run validates packaging rather than remote token permissions or routing.
The shared caller requests guarded cleanup for merged work branches from the
same repository. Keep the reserved `main` and `dev` branches. The common pipeline
does not create arbitrary feature/PR Previews that would require a second cleanup
workflow in this repository.

## Application versions

`package.json`, the root entries in `package-lock.json` and the checked-in footer
hold `0.0.1` as the local fallback. The deployed version comes from shared CI,
recorded in immutable annotated tags `siniverse-version/main/vX.Y.Z` and
`siniverse-version/dev/vX.Y.Z`. The first version in each channel is `0.0.1`.
Subsequent assignments default to patch, use minor for features and major for
breaking changes; one explicit `semver:major`, `semver:minor` or `semver:patch`
override is handled centrally. CI does not commit version bumps to app branches.

`SINIVERSE_VERSION` contains the assigned strict SemVer value without `v`.
The existing packager renders the footer as `vX.Y.Z` before calculating the final
service worker fingerprints. A version change therefore changes both index and
its offline release. There is no runtime version fetch: a cached page displays
the version of its own loaded bundle, including offline and without JavaScript.
The existing update prompt controls activation; versioning does not reset browser
storage, recovery archives, Drive metadata or any data-format version.

## Legacy Pages and recovery

The [historical Pages caller](legacy-pages.md) invokes the separate shared Pages
workflow at the same immutable automation revision. `npm run ci:pages` receives
`SINIVERSE_PAGES_MAIN_SOURCE`, `SINIVERSE_PAGES_DEV_SOURCE` and
`SINIVERSE_PAGES_OUT`; the two source checkouts stay distinct and the output must
be a new directory outside both. The existing Python generator and templates
publish the fixed redirect entry points, retiring service workers and same-origin
`recovery.html` tools. The redirects and retirement workers stay byte-identical
to their templates. `SINIVERSE_PAGES_MAIN_VERSION` and
`SINIVERSE_PAGES_DEV_VERSION` provide the versions resolved for the exact two
source HEADs. The adapter renders only each recovery footer; absent values use
the local `0.0.1` fallback. Pages retains its retiring worker, which has no asset
cache to regenerate, and all original data access paths.

The shared task still requires successful CI for the exact main/dev heads. It uses
the same pinned Node/npm versions, no Cloudflare credentials, an artifact name
unique to run/attempt, a bounded visibility check and one-day retention. This
compatibility task is not a second Workers publication path.

The previous `sinikebe.github.io` origin retains its own browser storage. Use the
existing JSON export/import and recovery tools to move a copy explicitly, or
reconnect an existing verified Drive backup. Preserve OAuth projects, backup
namespaces, original revision history and exact document bytes. The CI change
neither transfers nor erases user data.
