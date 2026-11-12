# Static hosting and migration

Garapp can be deployed on a private source repository with a public static
Cloudflare Pages site. The published HTML, JavaScript and CSS remain public:
keep records, attachments, API secrets and Cloudflare credentials out of them.
The intended suite addresses are `garapp.suite.example`,
`finapp.suite.example` and separate `dev` subdomains; these are examples.

## Build and publish

The Cloudflare workflow builds a **non-published** preview on pull requests and
pushes to `main` or `dev`, even before obtaining a domain or Cloudflare account.
Deployment is disabled until the repository variable
`CLOUDFLARE_DEPLOY_ENABLED` is set to `true`. When enabled, a deployment uses
the current branch tip only after a successful push CI run for that exact
revision. Manual redeploys follow the same gate. The GitHub Pages workflow
remains active until the migration is verified.

To check locally and build the **exact tested branch**:

```sh
npm run check
node scripts/prepare_cloudflare.mjs --source . --output ./_site --branch main --domain suite.example
```

For a `dev` checkout, use `--branch dev` and a fresh output directory. The
output holds explicit branch identity and inter-app links, and its offline
worker is rebuilt from the final published files. Pass only the domain name;
the build rejects a scheme, port or path. It also refuses to overwrite output,
publish symlinks or copy a `public/dev` folder.

GitHub runs `workflow_run` and `workflow_dispatch` workflows only when their
file exists on the default branch (`main`). First merge the builder and dormant
workflow into `dev`, verify its PR and push checks, then promote the tested
changes to `main` while the deployment variable is unset. Merely leaving the
workflow in `dev` does not enable deployment.

## One-time configuration

1. Obtain a suite domain, configure its DNS zone in Cloudflare, and create a
   Cloudflare Pages **Direct Upload** project for Garapp with `main` as its
   production branch.
2. In GitHub repository Settings, create variables `SUITE_DOMAIN` (domain
   only, without `https://`) and `CLOUDFLARE_PROJECT` (exact project name).
   Add secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Limit the
   token to **Account / Cloudflare Pages / Edit** for the intended account.
3. Add `garapp.<domain>` to the production Pages project. Once `dev` has a
   deployment, route `dev.garapp.<domain>` to the stable
   `dev.<project>.pages.dev` branch alias through proxied Cloudflare DNS.
4. After the build and checks pass on **both** branches, set
   `CLOUDFLARE_DEPLOY_ENABLED=true`; manually dispatch the Cloudflare workflow
   once for `dev` and once for `main`. Verify the pages, PWA installation,
   offline updates, JSON import/export including document attachments, and
   Google Drive account selection in **production**. Garapp dev does not have
   a default Google Drive client ID.

Cloudflare preview URLs and `pages.dev` aliases are public by default. Keep
preview fixtures synthetic and restrict previews if needed. A Direct Upload
Pages project cannot be switched to Git integration without recreating it.

## Existing data

The old GitHub Pages installation stores vehicle data in the browser on
`sinikebe.github.io`. A new hostname cannot read that browser storage. Export
the complete garage and any separate recovery copies in the original browser,
then import and verify them on the new site. Keep an export-only recovery page
on the original origin for browsers that have not yet migrated.

Google Drive folders and their revision histories also remain available: the
new build derives the **same** Drive namespace for each environment from the
old publication URL. Never remove or overwrite a Drive revision during a host
migration. The source tree still uses `/Garapp/` and `/Garapp/dev/` paths for
GitHub Pages. Production and development local workspaces remain separate.

Before making the source repository private, verify import/export on a
browser containing existing local data, test its current Drive folder from
the new hostname, and check links between Finapp and Garapp in both
environments. A private repository does not hide published JavaScript.
