/** Build main or dev assets only after the same compatibility checks as CI. */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCloudflare } from './prepare_cloudflare.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args, env = process.env) => execFileSync(command, args, {
  cwd: root, env, stdio: 'inherit', windowsHide: true,
});
const git = (args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
}).trim();

function backupBaseline() {
  try {
    const parent = git(['rev-parse', '--verify', 'HEAD^']);
    git(['cat-file', '-e', `${parent}^{commit}`]);
    return parent;
  } catch {
    // Git-integrated Workers Builds can provide a shallow checkout. Fetch only the
    // parent of the exact revision being built, not a moving branch tip.
    try {
      run('git', ['fetch', '--quiet', '--no-tags', '--depth=2', 'origin', git(['rev-parse', 'HEAD'])]);
    } catch {
      throw Error('Historical backup checks need the previous Git revision. Check repository history access in Workers Builds.');
    }
    try {
      const parent = git(['rev-parse', '--verify', 'HEAD^']);
      git(['cat-file', '-e', `${parent}^{commit}`]);
      return parent;
    } catch {
      throw Error('Previous Git revision is still unavailable. Refusing to skip historical backup checks.');
    }
  }
}

const branch = process.env.GARAPP_BUILD_BRANCH ?? process.env.WORKERS_CI_BRANCH ?? 'main';
if (process.env.WORKERS_CI && !process.env.WORKERS_CI_BRANCH) throw Error('Workers Builds must supply WORKERS_CI_BRANCH.');
if (!['main', 'dev'].includes(branch)) throw Error('Choose main or dev for the asset package.');

run('node', ['tools/check-backup-fixtures.mjs'], {
  ...process.env, BACKUP_BASE_SHA: backupBaseline(),
});
// These are the same source/PWA and application tests as `npm run check`.
// Run Node directly so the builder can also be validated without npm locally.
run(process.execPath, ['tools/check-source.mjs']);
run(process.execPath, ['tools/build-pwa.mjs', '--check']);
run(process.execPath, ['--test', ...readdirSync(join(root, 'test'))
  .filter((name) => name.endsWith('.test.mjs')).map((name) => join('test', name))]);

const result = await prepareCloudflare({
  source: root, output: join(root, 'dist'), branch, domain: 'siniverse.cc',
});
process.stdout.write(`Prepared ${result.environment} at ${result.target}.\n`);
