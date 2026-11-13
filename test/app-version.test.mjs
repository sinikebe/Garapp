import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appVersion, prepareCloudflare, renderAppVersion } from '../scripts/prepare_cloudflare.mjs';
import { pagesPaths, prepareLegacyPages } from '../scripts/ci-pages.mjs';
import { renderServiceWorker } from '../tools/build-pwa.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const footer = '<footer><span class="sr-only">version </span><span data-app-version>v0.0.1</span></footer>';

test('the local fallback and rendered footer accept strict SemVer without HTML or a v prefix', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.version, '0.0.1');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(appVersion(), pkg.version);
  assert.equal(renderAppVersion(footer), footer);
  for (const version of ['0.0.1', '1.2.3', '2.0.0-rc.1', '1.2.3+build.01']) {
    assert.match(renderAppVersion(footer, version), new RegExp('>v' + version.replace(/[.+]/g, '\\$&') + '</span>'));
  }
  for (const version of ['', null, 123, 'v0.0.1', '0.1', '01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3\n', ' 1.2.3', '1.2.3<script>']) {
    assert.throws(() => renderAppVersion(footer, version), /SemVer/);
  }
  assert.throws(() => renderAppVersion('<footer></footer>', '1.2.3'), /one app version/);
  assert.throws(() => renderAppVersion(footer + footer, '1.2.3'), /one app version/);
  const html = await readFile(join(root, 'public/index.html'), 'utf8');
  assert.match(html, /<footer[^>]*>.*<span class="sr-only">version <\/span><span data-app-version>v0\.0\.1<\/span>/);
});

test('changing the deployed version changes index and offline fingerprints together without changing sources', async (t) => {
  const work = await mkdtemp(join(tmpdir(), 'garapp-version-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const sourceHtml = await readFile(join(root, 'public/index.html'), 'utf8');
  const sourceWorker = await readFile(join(root, 'public/sw.js'), 'utf8');
  const builds = [];
  for (const version of ['1.2.3', '1.2.4']) {
    const output = join(work, version);
    await prepareCloudflare({ source: root, output, branch: 'main', domain: 'brand.example', version });
    const html = await readFile(join(output, 'index.html'), 'utf8');
    const sw = await readFile(join(output, 'sw.js'), 'utf8');
    assert.ok(html.includes('<span data-app-version>v' + version + '</span>'));
    assert.equal(sw, await renderServiceWorker(output));
    builds.push({ html, sw });
  }
  assert.equal(builds[0].html.replace('>v1.2.3</span>', '>v1.2.4</span>'), builds[1].html);
  assert.notEqual(builds[0].sw, builds[1].sw);
  assert.equal(await readFile(join(root, 'public/index.html'), 'utf8'), sourceHtml);
  assert.equal(await readFile(join(root, 'public/sw.js'), 'utf8'), sourceWorker);
});

test('Pages renders each recovery version and preserves redirect, retiring SW and source application bytes', async (t) => {
  const work = await mkdtemp(join(tmpdir(), 'garapp-pages-version-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const versions = { main: '1.2.3', dev: '2.3.4' };
  for (const branch of ['main', 'dev']) {
    const publicRoot = join(work, branch, 'public');
    await mkdir(join(publicRoot, 'assets'), { recursive: true });
    await writeFile(join(publicRoot, 'index.html'), '<html><p>Synthetic ' + branch + '</p>' + footer + '</html>');
    await writeFile(join(publicRoot, 'assets/app.js'), '// Synthetic application asset');
  }
  const paths = pagesPaths({ SINIVERSE_PAGES_MAIN_SOURCE: join(work, 'main'), SINIVERSE_PAGES_DEV_SOURCE: join(work, 'dev'), SINIVERSE_PAGES_OUT: join(work, 'site') });
  await prepareLegacyPages(paths, { ...process.env, SINIVERSE_PAGES_MAIN_VERSION: versions.main, SINIVERSE_PAGES_DEV_VERSION: versions.dev });
  for (const branch of ['main', 'dev']) {
    const output = branch === 'main' ? paths.output : join(paths.output, 'dev');
    const source = await readFile(join(paths[branch], 'public/index.html'), 'utf8');
    assert.ok(source.includes('>v0.0.1</span>'));
    assert.equal(await readFile(join(output, 'recovery.html'), 'utf8'), renderAppVersion(source, versions[branch]));
    assert.equal(await readFile(join(output, 'assets/app.js'), 'utf8'), '// Synthetic application asset');
    for (const name of ['index.html', 'redirect.js', 'sw.js']) {
      assert.deepEqual(await readFile(join(output, name)), await readFile(join(root, 'scripts/legacy-pages', name)));
    }
  }
});

test('an invalid dev recovery version fails before creating either Pages output', async (t) => {
  const work = await mkdtemp(join(tmpdir(), 'garapp-invalid-version-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const paths = { main: join(work, 'main'), dev: join(work, 'dev'), output: join(work, 'site') };
  await assert.rejects(prepareLegacyPages(paths, { ...process.env, SINIVERSE_PAGES_MAIN_VERSION: '1.2.3', SINIVERSE_PAGES_DEV_VERSION: '2.03.4' }), /SemVer/);
  await assert.rejects(stat(paths.output), { code: 'ENOENT' });
});
