/** Assemble the unchanged legacy redirect/recovery package for both branch sources. */
import { execFileSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = pagesPaths(process.env);
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const prepare = (source, output, branch) => execFileSync(python,
    ['-B', join(root, 'scripts/prepare_legacy_pages.py'), '--source', source, '--output', output, '--branch', branch],
    { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
  prepare(paths.main, paths.output, 'main');
  prepare(paths.dev, join(paths.output, 'dev'), 'dev');
}
