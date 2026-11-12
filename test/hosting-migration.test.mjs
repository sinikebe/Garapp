import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPLOYMENT, deploymentFor } from '../public/assets/js/deployment-config.js';
import { storageKey } from '../public/assets/js/garage.js';
import { navigationKey } from '../public/assets/js/navigation.js';
import { suiteLinks } from '../public/assets/js/app-switcher.js';
import { driveNamespace } from '../public/assets/js/drive-format.js';
import { prepareCloudflare, suiteOrigins } from '../scripts/prepare_cloudflare.mjs';
import { renderServiceWorker } from '../tools/build-pwa.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const urls = suiteOrigins('brand.example');
const deploy = (environment) => ({ environment, suite: urls });

test('legacy Pages continues to identify dev by path, and new branch roots require an explicit environment', () => {
  assert.equal(DEPLOYMENT.environment, 'legacy');
  assert.equal(deploymentFor('https://sinikebe.github.io/Garapp/').development, false);
  assert.equal(deploymentFor('https://sinikebe.github.io/Garapp/dev/').development, true);
  assert.equal(deploymentFor(urls.devGarapp, deploy('dev')).development, true);
  assert.equal(deploymentFor(urls.devGarapp, deploy('main')).development, false);
  assert.equal(storageKey(urls.garapp, deploy('main')), 'garapp.workspace.v1:/');
  assert.equal(storageKey(urls.garapp, deploy('dev')), 'garapp.workspace.v1:dev:/');
  assert.notEqual(navigationKey(urls.garapp, deploy('dev')), navigationKey(urls.garapp, deploy('main')));
  assert.equal(storageKey('https://sinikebe.github.io/Garapp/dev/'), 'garapp.workspace.v1:/Garapp/dev/');
});

test('the development switcher moves between distinct app origins without copying query or hash', () => {
  const links = suiteLinks(urls.devGarapp + '?vehicle=private#garage', deploy('dev'));
  assert.equal(links.preview, true);
  assert.deepEqual(links.apps.map(({ href }) => href), [urls.devFinapp, urls.devGarapp]);
  assert.deepEqual(suiteLinks(urls.garapp, deploy('main')).apps.map(({ href }) => href), [urls.finapp, urls.garapp]);
  assert.equal(suiteLinks(urls.garapp, { environment: 'main', suite: null }).apps.length, 0);
});

test('new hostname reuses the exact historical Drive namespace and keeps dev separate', async () => {
  const main = 'https://sinikebe.github.io/Garapp/';
  const dev = main + 'dev/';
  assert.equal(await driveNamespace(main), '9bfc7c3597bc191604572e8d5b6a19ff');
  assert.equal(await driveNamespace(dev), '1f062400fdc9a0be2356066fc4040630');
  assert.equal(await driveNamespace(urls.garapp, false, deploy('main')), await driveNamespace(main));
  assert.equal(await driveNamespace(urls.devGarapp, true, deploy('dev')), await driveNamespace(dev));
  assert.notEqual(await driveNamespace(main), await driveNamespace(dev));
});

test('build publishes separate origins with tested, branch-specific offline fingerprints', async (t) => {
  const work = await mkdtemp(join(tmpdir(), 'garapp-migration-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  for (const branch of ['main', 'dev']) {
    const output = join(work, branch);
    await prepareCloudflare({ source: root, output, branch, domain: 'brand.example' });
    const source = await readFile(join(output, 'assets/js/deployment-config.js'), 'utf8');
    assert.match(source, new RegExp(`"environment":"${branch}"`));
    const html = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(html, new RegExp(branch === 'dev' ? urls.devFinapp : urls.finapp));
    assert.match(html, new RegExp(branch === 'dev' ? urls.devGarapp : urls.garapp));
    assert.equal(await readFile(join(output, 'sw.js'), 'utf8'), await renderServiceWorker(output));
    assert.notEqual(source, await readFile(join(root, 'public/assets/js/deployment-config.js'), 'utf8'));
  }
});

test('build rejects ambiguous hosts and never overwrites an existing deployment', async (t) => {
  for (const value of ['', 'https://example.test', 'example.test/path', 'example.test:443', 'bad..test']) {
    assert.throws(() => suiteOrigins(value), /domain/);
  }
  const work = await mkdtemp(join(tmpdir(), 'garapp-existing-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  await assert.rejects(prepareCloudflare({ output: work, branch: 'main', domain: 'brand.example' }), /already exists/);
});
