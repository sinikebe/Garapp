import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pagesPaths } from '../scripts/ci-pages.mjs';

const inputs = (output = 'packaged-pages') => ({
  SINIVERSE_PAGES_MAIN_SOURCE: 'sources/main', SINIVERSE_PAGES_DEV_SOURCE: 'sources/dev', SINIVERSE_PAGES_OUT: output,
});

test('legacy assembly keeps distinct branch checkouts and an external output path', () => {
  assert.deepEqual(pagesPaths(inputs()), { main: resolve('sources/main'), dev: resolve('sources/dev'), output: resolve('packaged-pages') });
});

test('invalid assembly paths are rejected before either source is copied', () => {
  for (const output of ['sources/main', 'sources/main/public/generated', 'sources/dev/generated']) {
    assert.throws(() => pagesPaths(inputs(output)), /outside both/);
  }
  assert.throws(() => pagesPaths({ ...inputs(), SINIVERSE_PAGES_DEV_SOURCE: 'sources/main' }), /distinct/);
  for (const key of Object.keys(inputs())) {
    const missing = { ...inputs() }; delete missing[key];
    assert.throws(() => pagesPaths(missing), /Missing/);
  }
});
