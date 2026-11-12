# Static hosting and migration

Garapp can be deployed on a private source repository with a public static
Cloudflare Pages site. The published HTML, JavaScript and CSS remain public:
keep records, attachments, API secrets and Cloudflare credentials out of them.
The production suite addresses are `garapp.siniverse.cc` and
`finapp.siniverse.cc`.

## Build and publish

Cloudflare Pages connects to the GitHub repository and builds the production
branch (`main`) directly. Run the same build locally with Node.js 22 or newer:

```sh
npm run build:cloudflare
```

The command checks that previous backup fixtures and their historical Drive
metadata have not changed, runs the source, PWA and application tests, then
creates `dist/` for Pages. It needs access to the preceding Git revision; on
a shallow checkout it tries fetching that revision and fails the build if it
cannot verify history. It will not publish a branch other than `main`.
The offline worker is rebuilt from the final published files. The builder
refuses to overwrite an existing `dist/`, publish symlinks or copy a
`public/dev` folder. For a fresh local run, remove only your generated `dist/`
directory first.

The older GitHub Actions Cloudflare workflow still checks its packaging step,
but its direct-upload deployment remains disabled while the repository
variable `CLOUDFLARE_DEPLOY_ENABLED` is absent. Keep it disabled to avoid two
publishers for the same project. The GitHub Pages workflow remains active until
the migration is verified.

## One-time configuration

1. In Cloudflare **Workers & Pages > Create application > Continue to Pages >
   Connect to Git**, authorize GitHub for the Garapp repository. Name the
   project `siniverse-garapp`, choose `main` as its production branch, leave
   the framework preset empty, and use repository root as the build directory.
2. Set the build command to `npm run build:cloudflare`, the output directory to
   `dist`, and the build environment variable `NODE_VERSION` to `22`. Build
   failures stop deployment. Disable preview branch deployments in the Pages
   project settings: this project is currently production-only.
3. After a successful production deployment, open the project's **Custom
   domains** page, select **Set up a domain** and enter
   `garapp.siniverse.cc`. Cloudflare manages the DNS record for a zone on the
   same account. Add this exact origin to the Google OAuth client's authorized
   JavaScript origins before testing Google Drive sign-in.
4. Verify the page, PWA installation, offline updates, JSON import/export
   including document attachments, and Google Drive account selection on the
   new production hostname. Garapp dev does not have a default Drive client ID.

Cloudflare's `pages.dev` alias is public. Pages Git projects automatically
publish changes to `main` after the build succeeds, independent of GitHub
Actions; require GitHub CI on pull requests and avoid direct pushes to
production. A Git-integrated Pages project cannot be converted into a Direct
Upload project later without recreating it.

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
