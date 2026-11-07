/** Generate the public worker from the exact public files, before committing. */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const templatePath = fileURLToPath(new URL('./service-worker.template.js', import.meta.url));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function publicFiles(root, directory = '') {
  const files = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Symbolic links cannot be precached.');
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await publicFiles(root, path));
    else if (entry.isFile() && path !== 'sw.js' && path !== '.nojekyll') files.push(path);
  }
  return files.sort();
}

export async function renderServiceWorker(root = publicRoot) {
  const template = await readFile(templatePath, 'utf8');
  const assets = [];
  for (const path of await publicFiles(root)) assets.push({ path, hash: sha256(await readFile(join(root, path))) });
  const serialized = JSON.stringify(assets);
  const release = sha256(template + '\0' + serialized).slice(0, 24);
  return template.replace('__GARAPP_RELEASE__', release).replace('__GARAPP_ASSETS__', JSON.stringify(assets, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rendered = await renderServiceWorker();
  const target = join(publicRoot, 'sw.js');
  if (process.argv.includes('--check')) {
    const current = await readFile(target, 'utf8').catch(() => '');
    if (current !== rendered) { process.stderr.write('The offline bundle is stale. Run npm run build:pwa before committing.\n'); process.exitCode = 1; }
    else process.stdout.write('Offline bundle matches all public assets.\n');
  } else {
    await writeFile(target, rendered);
    process.stdout.write('Generated public/sw.js with verified public asset fingerprints.\n');
  }
}
