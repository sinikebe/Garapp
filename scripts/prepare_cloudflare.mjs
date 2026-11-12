/** Publish one tested branch at the root of its own hostname. */
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderServiceWorker } from '../tools/build-pwa.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const legacy = Object.freeze({ finapp: 'https://sinikebe.github.io/finapp/', garapp: 'https://sinikebe.github.io/Garapp/' });

export function suiteOrigins(domain) {
  if (typeof domain !== 'string' || domain.length > 253 || !/^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$/i.test(domain)
    || domain.split('.').some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
    throw Error('Provide one valid domain name, without a scheme, path or port.');
  }
  const name = domain.toLowerCase();
  return {
    finapp: `https://finapp.${name}/`, garapp: `https://garapp.${name}/`,
    devFinapp: `https://dev.finapp.${name}/`, devGarapp: `https://dev.garapp.${name}/`,
  };
}

async function assertNoSymlinks(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error(`Symbolic links cannot be published: ${entry.name}`);
    if (entry.isDirectory()) await assertNoSymlinks(join(path, entry.name));
  }
}

export async function prepareCloudflare({ source = root, output, branch, domain }) {
  if (branch !== 'main' && branch !== 'dev') throw Error('Branch must be main or dev.');
  if (!output) throw Error('Choose an output directory.');
  const origins = suiteOrigins(domain);
  const publicRoot = join(resolve(source), 'public');
  const target = resolve(output);
  if (target === publicRoot || target.startsWith(publicRoot + sep)) throw Error('Build output must be outside public/.');
  if (!(await lstat(publicRoot)).isDirectory()) throw Error('public must be a regular directory.');
  try { await lstat(join(publicRoot, 'dev')); throw Error('public/dev is reserved for historical Pages output.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await lstat(target); throw Error('Build output already exists.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await assertNoSymlinks(publicRoot);
  await mkdir(dirname(target), { recursive: true });
  await cp(publicRoot, target, { recursive: true, errorOnExist: true, force: false });

  const config = { environment: branch, suite: origins };
  // Keep runtime helpers identical to the checked-in source, changing only public constants.
  const sourceConfig = await readFile(join(publicRoot, 'assets/js/deployment-config.js'), 'utf8');
  const rendered = sourceConfig.replace("Object.freeze({ environment: 'legacy', suite: null })", `Object.freeze(${JSON.stringify(config)})`);
  if (rendered === sourceConfig) throw Error('Deployment configuration could not be rendered.');
  await writeFile(join(target, 'assets/js/deployment-config.js'), rendered);

  let html = await readFile(join(target, 'index.html'), 'utf8');
  const route = branch === 'dev' ? { finapp: origins.devFinapp, garapp: origins.devGarapp } : origins;
  html = html.replaceAll(legacy.finapp, route.finapp).replaceAll(legacy.garapp, route.garapp);
  await writeFile(join(target, 'index.html'), html);
  // The offline worker fingerprints the final, branch-specific assets.
  await writeFile(join(target, 'sw.js'), await renderServiceWorker(target));
  return { target, environment: branch, suite: origins };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const name = process.argv[i];
    if (!['--source', '--output', '--branch', '--domain'].includes(name) || !process.argv[i + 1] || Object.hasOwn(options, name)) {
      throw Error(`Unknown or missing argument: ${name}`);
    }
    options[name] = process.argv[i + 1];
  }
  const result = await prepareCloudflare({
    source: options['--source'] ?? root, output: options['--output'],
    branch: options['--branch'], domain: options['--domain'],
  });
  process.stdout.write(`Prepared ${result.environment} at ${result.target}.\n`);
}
