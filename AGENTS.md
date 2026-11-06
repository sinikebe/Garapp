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
