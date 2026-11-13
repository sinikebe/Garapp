/** Trusted GitHub events only; recheck the branch immediately before using Wrangler. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKER = 'siniverse-garapp-site';
export const ACCOUNT = 'bbc2341709439fad81d7aebc62efb873';
const REPOSITORY = 'sinikebe/Garapp';
const root = fileURLToPath(new URL('../', import.meta.url));

export function deploymentContext(event, env) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY) throw Error('Unexpected source repository.');
  let branch, sha, operation;
  if (env.GITHUB_EVENT_NAME === 'workflow_run') {
    const run = event.workflow_run;
    if (!run || run.name !== 'CI' || run.conclusion !== 'success'
      || run.event !== 'push'
      || run.head_repository?.full_name !== REPOSITORY) throw Error('A successful trusted CI run is required.');
    branch = run.head_branch; sha = run.head_sha;
  } else if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    if (![true, 'true'].includes(event.inputs?.deploy)) throw Error('Manual dispatch is validation-only unless deploy=true.');
    branch = env.GITHUB_REF_NAME; sha = env.GITHUB_SHA;
    if (env.GITHUB_REF !== 'refs/heads/' + branch) throw Error('Dispatch must select a branch.');
  } else if (env.GITHUB_EVENT_NAME === 'delete' && event.ref_type === 'branch' && event.ref === 'dev') {
    branch = 'dev'; sha = env.GITHUB_SHA; operation = 'cleanup';
  } else throw Error('This event cannot publish a Worker.');
  if (!['main', 'dev'].includes(branch) || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw Error('Invalid deployment branch or revision.');
  return { branch, sha, operation: operation ?? (branch === 'main' ? 'production' : 'preview') };
}

export function revisionIsCurrent(context, local, remote) {
  return local === context.sha && (context.operation === 'cleanup' ? remote === null : remote === context.sha);
}

export function wranglerArguments(context) {
  const shared = ['--config', 'wrangler.jsonc'];
  if (context.operation === 'production' && context.branch === 'main') return ['deploy', ...shared];
  if (context.operation === 'preview' && context.branch === 'dev') return ['preview', '--name', 'dev', '--worker-name', WORKER, ...shared];
  if (context.operation === 'cleanup' && context.branch === 'dev') return ['preview', 'delete', '--name', 'dev', '--worker-name', WORKER, '--skip-confirmation', ...shared];
  throw Error('Unsupported Worker target.');
}

function current(context) {
  const local = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const remote = execFileSync('git', ['ls-remote', '--heads', 'https://github.com/' + REPOSITORY + '.git', 'refs/heads/' + context.branch], { cwd: root, encoding: 'utf8' }).trim().split(/\s/)[0] || null;
  return revisionIsCurrent(context, local, remote);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const context = deploymentContext(event, process.env);
  const command = process.argv[2];
  if (!['verify', 'publish'].includes(command)) throw Error('Choose verify or publish.');
  const fresh = current(context);
  if (command === 'verify' && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'current=' + fresh + '\n');
  if (!fresh) {
    process.stdout.write('Branch moved or was recreated; no Cloudflare mutation.\n');
  } else if (command === 'publish') {
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) throw Error('Cloudflare credentials are required.');
    if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT) throw Error('Cloudflare account does not match this Worker.');
    const config = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
    if (config.name !== WORKER) throw Error('Unexpected Worker configuration.');
    if (context.operation !== 'cleanup') {
      const built = readFileSync(join(root, 'dist/assets/js/deployment-config.js'), 'utf8');
      if (!built.includes('"environment":"' + context.branch + '"')) throw Error('The asset package targets another environment.');
    }
    execFileSync(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), ...wranglerArguments(context)], { cwd: root, env: process.env, stdio: 'inherit' });
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'Cloudflare ' + context.operation + ': `' + context.sha + '` (' + WORKER + ').\n');
  }
}
