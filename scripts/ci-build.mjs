/** Adapt the shared Siniverse build contract to Garapp's static main/dev package. */
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCloudflare } from './prepare_cloudflare.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export function buildContext(env, head) {
  const branch = env.SINIVERSE_BRANCH;
  const environment = env.SINIVERSE_ENVIRONMENT;
  const sha = env.SINIVERSE_SHA;
  if (!['main', 'dev'].includes(branch)) throw Error('SINIVERSE_BRANCH must select main or dev packaging.');
  if (!['production', 'preview', 'test'].includes(environment)) throw Error('Invalid SINIVERSE_ENVIRONMENT.');
  if (environment === 'production' && branch !== 'main' || environment === 'preview' && branch !== 'dev') throw Error('The packaging branch does not match its environment.');
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || sha !== head) throw Error('SINIVERSE_SHA must match the source checkout.');
  return { branch, environment, sha };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const context = buildContext(process.env, head);
  // Only the generated, fixed build directory is replaced; public sources and
  // all browser/Drive data remain outside this packaging operation.
  const output = join(root, 'dist');
  await rm(output, { recursive: true, force: true });
  await prepareCloudflare({ source: root, output, branch: context.branch, domain: 'siniverse.cc', version: process.env.SINIVERSE_VERSION });
  // The shared controller adds deployment.json after this package is complete.
  process.stdout.write('Prepared Garapp ' + context.branch + ' (' + context.environment + ') at ' + output + '.\n');
}
