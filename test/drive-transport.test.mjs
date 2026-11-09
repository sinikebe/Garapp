import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DriveAPI, DriveError, propertyQuery } from '../public/assets/js/drive-api.js';
import { DriveAuthorization, validClientId } from '../public/assets/js/drive-auth.js';
import { DRIVE_CLIENT_IDS } from '../public/assets/js/drive-config.js';
import { DRIVE_SCOPE } from '../public/assets/js/drive-format.js';
import { MAX_BACKUP_BYTES } from '../public/assets/js/garage.js';
import { fingerprint } from '../public/assets/js/backups.js';

const clientId = '1234567890-synthetic-client.apps.googleusercontent.com';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('OAuth requests only drive.file, from a gesture, and keeps access tokens in memory until expiry', () => {
  let config, requested, connected = 0, now = 1000;
  const oauth = { initTokenClient(value) { config = value; return { requestAccessToken(options) { requested = options; } }; }, hasGrantedAllScopes(response, scope) { return response.scope === scope; } };
  const auth = new DriveAuthorization({ clientId, oauth, onToken: () => connected++, onError: assert.fail, now: () => now });
  assert.equal(config, undefined); assert.equal(auth.token(), null);
  auth.connect(); assert.equal(config.scope, DRIVE_SCOPE); assert.equal(config.include_granted_scopes, false); assert.equal(requested.prompt, 'select_account');
  config.callback({ access_token: 'synthetic-memory-token', scope: DRIVE_SCOPE, expires_in: 3600 });
  assert.equal(connected, 1); assert.equal(auth.token(), 'synthetic-memory-token');
  now += 3571000; assert.equal(auth.token(), null);
  assert.equal(validClientId('a-client-secret'), false); assert.equal(validClientId(clientId), true);
});

test('OAuth refusal, missing scopes and a closed popup do not expose raw errors or retain a token', () => {
  let config, error;
  const oauth = { initTokenClient(value) { config = value; return { requestAccessToken() {} }; }, hasGrantedAllScopes: () => false };
  const auth = new DriveAuthorization({ clientId, oauth, onToken: assert.fail, onError: (message) => { error = message; } });
  auth.connect(); config.callback({ access_token: 'synthetic-rejected-token', expires_in: 3600 });
  assert.equal(auth.token(), null); assert.match(error, /annulée ou refusée/);
  auth.connect(); config.error_callback({ type: 'popup_closed', privateDetail: 'not-for-display' });
  assert.doesNotMatch(error, /not-for-display/); assert.equal(auth.pending, false);
  auth.connect(); const late = config.callback; auth.disconnect(); late({ access_token: 'synthetic-late-token', scope: DRIVE_SCOPE, expires_in: 3600 });
  assert.equal(auth.token(), null);
});

test('the public configuration has no fabricated OAuth credentials and no automatic Google script', async () => {
  const config = await readFile(new URL('../public/assets/js/drive-config.js', import.meta.url), 'utf8');
  for (const id of Object.values(DRIVE_CLIENT_IDS)) assert.ok(id === '' || validClientId(id));
  assert.doesNotMatch(config, /client_secret\s*[:=]|access_token\s*[:=]|refresh_token\s*[:=]/);
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=["']https:\/\/accounts\.google\.com/);
  assert.match(html, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(html, /frame-src https:\/\/accounts\.google\.com\/gsi\//);
});

test('Drive transport attaches authorization only to approved HTTPS endpoints and bypasses caches', async () => {
  const calls = [];
  const api = new DriveAPI({ token: () => 'synthetic-token', fetcher: async (url, options) => { calls.push({ url, options }); return json({ id: 'fiction' }); } });
  await api.get('fiction');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.redirect, 'error');
  assert.doesNotMatch(calls[0].url, /synthetic-token/);
  for (const url of ['https://attacker.test/upload', 'http://www.googleapis.com/drive/v3/files', 'https://www.googleapis.com/other', 'https://www.googleapis.com/upload/drive/v3/files/other']) await assert.rejects(api.request(url), /non autorisée/);
  assert.equal(calls.length, 1);
  assert.equal(propertyQuery('namespace', "a'b\\c"), "appProperties has { key='namespace' and value='a\\'b\\\\c' }");
});

test('401 expires the session without retries or automatic popups; quota messages are sanitized', async () => {
  let expired = 0, calls = 0;
  const api = new DriveAPI({ token: () => 'synthetic', onExpired: () => expired++, fetcher: async () => { calls++; return json({ error: { message: 'private-raw-error' } }, 401); } });
  await assert.rejects(api.get('fiction'), /expiré/); assert.equal(expired, 1); assert.equal(calls, 1);
  api.fetcher = async () => json({ error: { message: 'private-raw-error', errors: [{ reason: 'storageQuotaExceeded' }] } }, 403);
  await assert.rejects(api.get('fiction'), (error) => error instanceof DriveError && /plein/.test(error.message) && !/private-raw-error/.test(error.message));
});

test('Drive refusals distinguish API configuration, permissions, policy and quotas without exposing raw details', async () => {
  const cases = [
    ['accessNotConfigured', [/projet Google Cloud/i, /API/i, /activée/i]],
    ['SERVICE_DISABLED', [/API Google Drive/i, /désactivée/i, /client OAuth/i]],
    ['insufficientPermissions', [/autorisation/i, /reconnecter/i]],
    ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', [/autorisation/i, /reconnecter/i]],
    ['insufficientFilePermissions', [/fichier/i]],
    ['appNotAuthorizedToFile', [/fichier/i]],
    ['domainPolicy', [/administrateur/i]],
    ['storageQuotaExceeded', [/plein/i]],
    ['dailyLimitExceeded', [/quota/i]],
    ['quotaExceeded', [/quota/i]],
    ['rateLimitExceeded', [/Trop de requêtes/i]],
    ['userRateLimitExceeded', [/Trop de requêtes/i]],
    ['RATE_LIMIT_EXCEEDED', [/Trop de requêtes/i]],
  ];
  for (const [reason, patterns] of cases) {
    let calls = 0;
    const api = new DriveAPI({ token: () => 'synthetic-token', fetcher: async () => {
      calls++;
      return json({ error: { message: 'synthetic-private-message', errors: [{ reason, message: 'synthetic-private-detail' }], metadata: { consumer: 'synthetic-private-project' } } }, 403);
    } });
    await assert.rejects(api.get('fiction'), (error) => {
      assert.ok(error instanceof DriveError);
      assert.equal(error.status, 403);
      assert.equal(error.reason, reason);
      for (const pattern of patterns) assert.match(error.message, pattern, reason);
      assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`, /synthetic-private/);
      return true;
    });
    assert.equal(calls, 1, reason);
  }
});

test('structured Google error reasons take precedence and legacy lists are searched beyond the first entry', async () => {
  const cases = [
    [{ errors: [{ reason: 'forbidden' }], details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { consumer: 'synthetic-private-project' } }] }, 'SERVICE_DISABLED'],
    [{ errors: [{ reason: 'insufficientPermissions' }], details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }] }, 'SERVICE_DISABLED'],
    [{ errors: [{ reason: 'forbidden' }, { reason: 'accessNotConfigured' }] }, 'accessNotConfigured'],
    [{ errors: [{ reason: 'accessNotConfigured' }], details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'synthetic-private-unknown' }] }, 'accessNotConfigured'],
    [{ details: [null, { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] }, 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'],
  ];
  for (const [body, reason] of cases) {
    const api = new DriveAPI({ token: () => 'synthetic-token', fetcher: async () => json({ error: { message: 'synthetic-private-message', ...body } }, 403) });
    await assert.rejects(api.get('fiction'), (error) => {
      assert.ok(error instanceof DriveError);
      assert.equal(error.status, 403);
      assert.equal(error.reason, reason);
      assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`, /synthetic-private/);
      return true;
    });
  }
});

test('unknown and malformed Drive error bodies retain a sanitized generic refusal', async () => {
  const bodies = [
    null, {}, { error: null }, { error: 'synthetic-private-message' },
    { error: { message: 'synthetic-private-message', errors: [{ reason: 'synthetic-private-unknown' }] } },
    { error: { errors: [null, { reason: { private: 'synthetic-private-detail' } }], details: 'synthetic-private-detail' } },
    { error: { errors: { reason: 'accessNotConfigured' }, details: { reason: 'SERVICE_DISABLED' } } },
    { error: { details: [{ '@type': 'type.googleapis.com/google.rpc.Help', reason: 'SERVICE_DISABLED' }, { reason: 'SERVICE_DISABLED' }] } },
  ];
  const responses = [...bodies.map((body) => () => json(body, 403)), () => new Response('synthetic-private-invalid-json', { status: 403 })];
  for (const response of responses) {
    const api = new DriveAPI({ token: () => 'synthetic-token', fetcher: async () => response() });
    await assert.rejects(api.get('fiction'), (error) => {
      assert.ok(error instanceof DriveError);
      assert.equal(error.status, 403);
      assert.equal(error.reason, '');
      assert.match(error.message, /refusé/i);
      assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`, /synthetic-private|SERVICE_DISABLED|accessNotConfigured/);
      return true;
    });
  }
});

test('authentication expiry remains authoritative when a 401 includes another recognized reason', async () => {
  let expired = 0, calls = 0;
  const api = new DriveAPI({ token: () => 'synthetic-token', onExpired: () => expired++, fetcher: async () => {
    calls++;
    return json({ error: { errors: [{ reason: 'storageQuotaExceeded' }], message: 'synthetic-private-message' } }, 401);
  } });
  await assert.rejects(api.get('fiction'), (error) => {
    assert.ok(error instanceof DriveError);
    assert.equal(error.status, 401);
    assert.match(error.message, /expiré/i);
    assert.doesNotMatch(error.message, /plein|synthetic-private/);
    return true;
  });
  assert.equal(expired, 1);
  assert.equal(calls, 1);
});

test('an incomplete or repeated-page listing cannot be interpreted as an empty garage', async () => {
  const api = new DriveAPI({ token: () => 'synthetic', fetcher: async () => json({ incompleteSearch: true, files: [] }) });
  await assert.rejects(api.list('synthetic-query'), /incomplète/);
  api.fetcher = async () => json({ files: [], nextPageToken: 'same-page' });
  await assert.rejects(api.list('synthetic-query'), /entièrement/);
});

test('downloads enforce advertised length and the portable size limit', async () => {
  const api = new DriveAPI({ token: () => 'synthetic', fetcher: async () => new Response('four') });
  await assert.rejects(api.download({ id: 'fiction', size: 3 }), /taille/);
  await assert.rejects(api.download({ id: 'fiction', size: 5 }), /incomplet/);
  await assert.rejects(api.download({ id: 'fiction', size: MAX_BACKUP_BYTES + 1 }), /512 Mio/);
});

test('a stalled response body times out and cancels its stream instead of leaving sync busy indefinitely', async () => {
  let cancelled = false;
  const api = new DriveAPI({ token: () => 'synthetic', timeoutMs: 10, fetcher: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
  await assert.rejects(api.download({ id: 'fiction', size: 10 }), DriveError);
  assert.equal(cancelled, true);
});

function uploadServer(blob, { lostMultipart = false, resume = false, badLocation = false, corrupt = false } = {}) {
  const state = { calls: [], metadata: null, offset: 0, failed: false, body: null };
  const file = async () => ({ ...state.metadata, id: 'reserved-fiction-id', size: String(blob.size), sha256Checksum: corrupt ? '0'.repeat(64) : await fingerprint(blob) });
  const fetcher = async (rawUrl, options) => {
    const url = new URL(rawUrl); state.calls.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.equal(options.headers['Content-Length'], undefined);
    if (url.pathname.endsWith('/generateIds')) return json({ ids: ['reserved-fiction-id'] });
    if (url.pathname.endsWith('/reserved-fiction-id')) return json(await file());
    if (url.searchParams.get('uploadType') === 'multipart') {
      state.body = await options.body.text();
      state.metadata = JSON.parse(state.body.split('\r\n\r\n')[1].split('\r\n')[0]);
      if (lostMultipart) throw TypeError('Synthetic network interruption');
      return json({ id: 'reserved-fiction-id' });
    }
    if (url.searchParams.get('uploadType') === 'resumable') {
      state.metadata = JSON.parse(options.body);
      assert.equal(options.headers['X-Upload-Content-Length'], String(blob.size));
      return new Response(null, { status: 200, headers: { Location: badLocation ? 'https://attacker.test/upload?secret=forbidden' : 'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic-session' } });
    }
    const range = options.headers['Content-Range'];
    if (range.startsWith('bytes */')) return new Response(null, { status: 308, headers: state.offset ? { Range: `bytes=0-${state.offset - 1}` } : {} });
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    assert.ok(match); assert.equal(Number(match[1]), state.offset); assert.equal(Number(match[3]), blob.size);
    const length = Number(match[2]) - Number(match[1]) + 1;
    assert.equal(options.body.size, length);
    if (Number(match[2]) + 1 < blob.size) assert.equal(length % (256 * 1024), 0);
    state.offset = Number(match[2]) + 1;
    if (resume && !state.failed) { state.failed = true; return json({}, 503); }
    if (state.offset === blob.size) return json({ id: 'reserved-fiction-id' });
    return new Response(null, { status: 308, headers: { Range: `bytes=0-${state.offset - 1}` } });
  };
  return { state, fetcher };
}

async function uploadFixture(size = 0, options) {
  const blob = new Blob([size ? 'x'.repeat(size) : '{"synthetic":"complete JSON"}'], { type: 'application/json' });
  const metadata = { name: 'garage-fictif.json', mimeType: 'application/json', parents: ['folder-fiction'], appProperties: { wire: await fingerprint(blob), revision: 'synthetic-revision' } };
  const server = uploadServer(blob, options);
  const api = new DriveAPI({ token: () => 'synthetic-token', fetcher: server.fetcher });
  return { blob, metadata, server, api };
}

test('small JSONs use one new multipart file with a reserved ID and a verified checksum', async () => {
  const { api, blob, metadata, server } = await uploadFixture();
  const file = await api.upload(metadata, blob);
  assert.equal(file.id, 'reserved-fiction-id'); assert.equal(server.state.metadata.id, file.id);
  assert.ok(server.state.body.includes(await blob.text()));
  assert.equal(server.state.calls.filter(({ options }) => options.method === 'POST').length, 1);
  assert.equal(server.state.calls.some(({ options }) => ['PATCH', 'DELETE'].includes(options.method)), false);
});

test('a lost upload response is recovered by its reserved file ID without a duplicate POST', async () => {
  const { api, blob, metadata, server } = await uploadFixture(0, { lostMultipart: true });
  assert.equal((await api.upload(metadata, blob)).id, 'reserved-fiction-id');
  assert.equal(server.state.calls.filter(({ options }) => options.method === 'POST').length, 1);
});

test('large backups use resumable 8 MiB chunks and recover the acknowledged server offset', async () => {
  const { api, blob, metadata, server } = await uploadFixture(9 * 1024 * 1024, { resume: true });
  assert.equal((await api.upload(metadata, blob)).sha256Checksum, metadata.appProperties.wire);
  assert.equal(server.state.offset, blob.size);
  const puts = server.state.calls.filter(({ options }) => options.method === 'PUT');
  assert.equal(puts.length, 3); assert.equal(puts[1].options.headers['Content-Range'], `bytes */${blob.size}`);
  assert.equal(puts[2].options.headers['Content-Range'], `bytes ${8 * 1024 * 1024}-${blob.size - 1}/${blob.size}`);
});

test('an unexpected upload-session origin is rejected before sending bytes or a bearer token', async () => {
  const { api, blob, metadata, server } = await uploadFixture(6 * 1024 * 1024, { badLocation: true });
  await assert.rejects(api.upload(metadata, blob), /non autorisée/);
  assert.equal(server.state.calls.some(({ url }) => url.hostname === 'attacker.test'), false);
  assert.equal(server.state.calls.some(({ options }) => options.method === 'PUT'), false);
});

test('a mismatched upload checksum never confirms success', async () => {
  const { api, blob, metadata } = await uploadFixture(0, { corrupt: true });
  await assert.rejects(api.upload(metadata, blob), /intégrité/);
});
