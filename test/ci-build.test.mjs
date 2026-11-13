import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../scripts/ci-build.mjs';

const sha = 'a'.repeat(40);
const inputs = (branch, environment) => ({ SINIVERSE_BRANCH: branch, SINIVERSE_ENVIRONMENT: environment, SINIVERSE_SHA: sha });

test('production and Preview select their main/dev asset variants', () => {
  assert.deepEqual(buildContext(inputs('main', 'production'), sha), { branch: 'main', environment: 'production', sha });
  assert.deepEqual(buildContext(inputs('dev', 'preview'), sha), { branch: 'dev', environment: 'preview', sha });
  assert.throws(() => buildContext(inputs('dev', 'production'), sha), /environment/);
  assert.throws(() => buildContext(inputs('main', 'preview'), sha), /environment/);
});

test('a test package uses the PR target variant without interpreting its source branch', () => {
  for (const branch of ['main', 'dev']) {
    const context = buildContext({ ...inputs(branch, 'test'), SINIVERSE_SOURCE_BRANCH: 'feature/change' }, sha);
    assert.equal(context.branch, branch);
    assert.equal(context.environment, 'test');
  }
  assert.throws(() => buildContext(inputs('feature/change', 'test'), sha), /packaging/);
  assert.throws(() => buildContext(inputs('main', 'unknown'), sha), /ENVIRONMENT/);
});

test('a package cannot claim a malformed or different source revision', () => {
  for (const value of [undefined, 'main', '0'.repeat(40), 'b'.repeat(40)]) {
    assert.throws(() => buildContext({ ...inputs('main', 'test'), SINIVERSE_SHA: value }, sha), /source checkout/);
  }
});
