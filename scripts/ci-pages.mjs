/** Assemble the unchanged legacy redirect/recovery package for both branch sources. */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appVersion, renderAppVersion } from './prepare_cloudflare.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const inside = (path, source) => {
  const local = relative(source, path);
  return local === '' || !isAbsolute(local) && local !== '..' && !local.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'));
};

export function pagesPaths(env) {
  const values = ['SINIVERSE_PAGES_MAIN_SOURCE', 'SINIVERSE_PAGES_DEV_SOURCE', 'SINIVERSE_PAGES_OUT'].map((name) => {
    if (!env[name]) throw Error('Missing ' + name + '.');
    return resolve(env[name]);
  });
  const [main, dev, output] = values;
  if (main === dev) throw Error('Main and dev must have distinct source checkouts.');
  if ([main, dev].some((source) => inside(output, source))) throw Error('Pages output must be outside both source checkouts.');
  return { main, dev, output };
}

export async function prepareLegacyPages(paths, env = process.env) {
  // Both values are validated before creating either output directory.
  const versions = { main: appVersion(env.SINIVERSE_PAGES_MAIN_VERSION), dev: appVersion(env.SINIVERSE_PAGES_DEV_VERSION) };
  const python = env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const prepare = (source, output, branch) => execFileSync(python,
    ['-B', join(root, 'scripts/prepare_legacy_pages.py'), '--source', source, '--output', output, '--branch', branch],
    { cwd: root, env, stdio: 'inherit', windowsHide: true });
  for (const branch of ['main', 'dev']) {
    const output = branch === 'main' ? paths.output : join(paths.output, 'dev');
    prepare(paths[branch], output, branch);
    const recovery = join(output, 'recovery.html');
    await writeFile(recovery, renderAppVersion(await readFile(recovery, 'utf8'), versions[branch]));
  }
  // Pages has a retiring SW, without an asset cache. Keep that script exact;
  // only Worker builds recalculate offline fingerprints after version rendering.
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareLegacyPages(pagesPaths(process.env));
}
