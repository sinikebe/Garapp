/** Keep Garapp's source, offline, historical backup and application checks together. */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (program, args, env = process.env) => execFileSync(program, args, {
  cwd: root, env, stdio: 'inherit', windowsHide: true,
});
const comparison = process.env.SINIVERSE_BASE_SHA || process.env.BACKUP_BASE_SHA
  || execFileSync('git', ['rev-parse', '--verify', 'HEAD^'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (!/^[a-f0-9]{40}$/.test(comparison) || /^0+$/.test(comparison)) throw Error('A valid historical backup comparison revision is required.');

run(process.execPath, ['tools/check-source.mjs']);
run(process.execPath, ['tools/build-pwa.mjs', '--check']);
run(process.execPath, ['tools/check-backup-fixtures.mjs'], { ...process.env, BACKUP_BASE_SHA: comparison });
run(process.execPath, ['--test', ...readdirSync(join(root, 'test'))
  .filter((name) => name.endsWith('.test.mjs')).map((name) => join('test', name))]);
run(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
  ['-B', '-m', 'unittest', 'discover', '-s', 'test', '-p', 'legacy_pages_test.py']);
