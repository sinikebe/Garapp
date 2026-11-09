/** Dependency-free syntax, JSON and local documentation-link checks. */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
async function filesIn(directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesIn(`${directory}/${entry.name}`) : `${directory}/${entry.name}`));
  return files.flat();
}
const sources = (await Promise.all(['public/assets/js', 'tools', 'test'].map(filesIn))).flat()
  .filter((path) => ['.js', '.mjs'].includes(extname(path)));
const failures = [];
const html = await readFile(resolve(root, 'public/index.html'), 'utf8');
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
if (new Set(htmlIds).size !== htmlIds.length) failures.push('public/index.html: duplicate element IDs');
const app = await readFile(resolve(root, 'public/assets/js/app.js'), 'utf8');
const knownIds = new Set([...htmlIds, ...[...app.matchAll(/\bid="([^"$]+)"/g)].map((match) => match[1])]);
for (const match of app.matchAll(/\$\('([^']+)'\)/g)) {
  if (!knownIds.has(match[1])) failures.push(`public/assets/js/app.js: missing element #${match[1]}`);
}
for (const path of sources) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, path)], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${path}: ${result.stderr || result.error || 'syntax check failed'}`);
}
const documents = ['README.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', ...(await filesIn('docs')).filter((path) => path.endsWith('.md'))];
for (const path of documents) {
  const contents = await readFile(resolve(root, path), 'utf8');
  for (const match of contents.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    try {
      const local = decodeURIComponent(target.split(/[?#]/)[0]);
      if (local) await stat(resolve(root, dirname(path), local));
    } catch { failures.push(`${path}: missing local link ${target}`); }
  }
}
for (const path of ['package.json', 'public/manifest.webmanifest', 'public/manifest-dev.webmanifest']) {
  try { JSON.parse(await readFile(resolve(root, path), 'utf8')); }
  catch { failures.push(`${path}: invalid JSON`); }
}
if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n');
  process.exitCode = 1;
} else process.stdout.write(`Checked ${sources.length} JavaScript files, JSON manifests and ${documents.length} documentation files.\n`);
