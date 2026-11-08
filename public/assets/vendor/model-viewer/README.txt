@google/model-viewer 4.4.0 — local Garapp build
Source: https://www.npmjs.com/package/@google/model-viewer/v/4.4.0
Upstream: https://github.com/google/model-viewer

This ES module is bundled from the published lib/model-viewer.js source, using
Three.js 0.183.0, Lit 3.3.3 and esbuild 0.25.0. Upstream copyright/license comments
are retained; see LICENSE.txt and THIRD_PARTY_LICENSES.txt.

Garapp changes, reproduced by tools/vendor-model-viewer.mjs:
- The unused Meshopt decoder is unavailable; compressed models are rejected by
  the application's GLB validator before preview.
- The unused Zstandard texture decoder is unavailable as well.
- HDR gainmap environment decoding is replaced by ordinary Three.js textures.
  The viewer uses its generated neutral lighting, without an HDR environment.
- No eager WebAssembly, remote script or remote decoder is required. The strict
  script policy does not enable unsafe-eval or wasm-unsafe-eval.
- Multiline template strings are emitted as equivalent escaped strings.

To rebuild, install the pinned build inputs in a temporary directory:
  npm install --prefix /tmp/garapp-viewer-build --ignore-scripts --no-audit --no-fund @google/model-viewer@4.4.0 three@0.183.0 lit@3.3.3 esbuild@0.25.0
  node tools/vendor-model-viewer.mjs /tmp/garapp-viewer-build/node_modules
  npm run build:pwa

The module is imported only for a selected GLB cover on the dashboard and is
included in the offline bundle. Photos and GLB files remain embedded workspace
documents and never enter the application's public offline cache.
