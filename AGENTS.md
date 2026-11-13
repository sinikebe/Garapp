# Public repository guidelines

All commits, source code, documentation, example data, tests, assets, screenshots,
and deployed pages must be suitable for a public repository and a general audience.

- Keep private information, personal records, credentials, secrets, and nonpublic
  source material out of the repository and all published output.
- Use synthetic, clearly identified example data. Private conversations, connected
  workspaces, imported files, and real financial or vehicle records must never be
  copied into examples, fixtures, documentation, or assets.
- Write documentation, interface text, commit messages, and pull request descriptions
  as standalone project content. Avoid addressing an individual requester or
  referring to a private conversation, personal circumstances, or instructions.
- Review changes and generated output for private data and personalized wording
  before committing or publishing, including changes on the development branch.

## Changes involving Finapp

Finapp is maintained separately. Its `dev` and `main` branches must not be changed
from this project. If an integration change is necessary, prepare it on a new
feature branch for the Finapp maintainer to review and merge.

## Offline bundle

`public/sw.js` is generated from `tools/service-worker.template.js` and all public
application assets. After changing `public/` or the template, run
`npm run build:pwa` before tests and commit the generated worker with the source
changes. Tests reject stale asset fingerprints. Keep worker scopes, application
identities and cache cleanup isolated between publication paths. Never add garage
records, imported documents, exports or other applications to the offline cache.

## Application versioning

Use PR titles starting with `feat:` for features and `fix:` for fixes. Mark
breaking changes with `!` in the prefix or `BREAKING CHANGE` in the description.
If an explicit override is needed, use exactly one `semver:major`, `semver:minor`
or `semver:patch` label.

Shared CI assigns deployed versions using immutable per-channel tags.
`package.json` and the root lockfile version remain the local `0.0.1` fallback;
do not bump them manually for releases. Keep the rendered footer version and
final PWA fingerprints consistent, as described in `docs/cloudflare-hosting.md`.
