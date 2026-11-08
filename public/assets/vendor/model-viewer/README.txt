@google/model-viewer 4.4.0
Source: https://www.npmjs.com/package/@google/model-viewer/v/4.4.0
Upstream: https://github.com/google/model-viewer

The self-contained ES module comes from dist/model-viewer.min.js in the published
npm package. Only its unavailable sourceMappingURL trailer and trailing blank line have been removed.
Upstream copyright/license comments are retained; see LICENSE.txt and
THIRD_PARTY_LICENSES.txt. No remote runtime script or decoder is required for the
supported self-contained GLB files.

The module is imported only when a vehicle with a selected GLB cover is shown on
the dashboard. It is included in the offline bundle. Garage documents, photos and
models remain workspace data and never enter the application's public cache.
