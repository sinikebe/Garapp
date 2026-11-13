import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentContext, revisionIsCurrent, wranglerArguments, WORKER } from '../scripts/cloudflare-deployment.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const env = { GITHUB_REPOSITORY: 'sinikebe/Garapp', GITHUB_EVENT_NAME: 'workflow_run' };
const event = (branch = 'main', overrides = {}) => ({ workflow_run: {
  name: 'CI', conclusion: 'success', event: 'push', head_repository: { full_name: 'sinikebe/Garapp' },
  head_branch: branch, head_sha: sha, ...overrides,
} });

test('main deploys production and dev publishes only a named Preview of the same Worker', () => {
  const main = deploymentContext(event(), env);
  const dev = deploymentContext(event('dev'), env);
  assert.equal(main.operation, 'production');
  assert.deepEqual(wranglerArguments(main), ['deploy', '--config', 'wrangler.jsonc']);
  assert.deepEqual(wranglerArguments(dev), ['preview', '--name', 'dev', '--worker-name', WORKER, '--config', 'wrangler.jsonc']);
  assert.throws(() => wranglerArguments({ ...dev, operation: 'production' }));
  assert.throws(() => wranglerArguments({ ...main, operation: 'cleanup' }));
});

test('PRs, forks, failed CI, other workflows and unexpected branches cannot request publication', () => {
  for (const override of [{ event: 'pull_request' }, { event: 'workflow_dispatch' }, { conclusion: 'failure' }, { conclusion: null },
    { name: 'Other workflow' }, { head_repository: { full_name: 'someone/Garapp' } },
    { head_branch: 'feature/try' }, { head_branch: 'main\n--name=other' }, { head_sha: 'main' }]) {
    assert.throws(() => deploymentContext(event('main', override), env));
  }
  for (const name of ['pull_request', 'pull_request_target', 'push', 'repository_dispatch']) {
    assert.throws(() => deploymentContext(event(), { ...env, GITHUB_EVENT_NAME: name }));
  }
  assert.throws(() => deploymentContext(event(), { ...env, GITHUB_REPOSITORY: 'someone/Garapp' }));
});

test('manual dispatch uses the selected main/dev branch and exact SHA', () => {
  for (const branch of ['main', 'dev']) {
    const context = deploymentContext({ inputs: { deploy: true } }, { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/' + branch, GITHUB_REF_NAME: branch, GITHUB_SHA: sha });
    assert.equal(context.branch, branch);
    assert.equal(context.sha, sha);
  }
  assert.throws(() => deploymentContext({}, { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/tags/main', GITHUB_REF_NAME: 'main', GITHUB_SHA: sha }));
  for (const deploy of [false, 'false', undefined]) assert.throws(() => deploymentContext({ inputs: { deploy } }, { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_REF_NAME: 'main', GITHUB_SHA: sha }), /validation-only/);
});

test('a moved branch or a checkout of the wrong SHA cannot be deployed', () => {
  const context = deploymentContext(event(), env);
  assert.equal(revisionIsCurrent(context, sha, sha), true);
  for (const pair of [[sha, other], [other, sha], [sha, null]]) assert.equal(revisionIsCurrent(context, ...pair), false);
});

test('cleanup targets only the deleted dev Preview and skips a recreated dev branch', () => {
  const deleted = { ref_type: 'branch', ref: 'dev' };
  const context = deploymentContext(deleted, { ...env, GITHUB_EVENT_NAME: 'delete', GITHUB_SHA: sha });
  assert.deepEqual(wranglerArguments(context), ['preview', 'delete', '--name', 'dev', '--worker-name', WORKER, '--skip-confirmation', '--config', 'wrangler.jsonc']);
  assert.equal(revisionIsCurrent(context, sha, null), true);
  assert.equal(revisionIsCurrent(context, sha, other), false);
  for (const ref of ['main', 'feature/merged']) assert.throws(() => deploymentContext({ ...deleted, ref }, { ...env, GITHUB_EVENT_NAME: 'delete', GITHUB_SHA: sha }));
});
