import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveAPI } from '../public/assets/js/drive-api.js';
import { WorkerDriveAuthorization, WORKER_DRIVE_AUTH, consumeWorkerFailure } from '../public/assets/js/drive-worker-auth.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('only a failed auth marker is removed; existing query and hash are preserved', () => {
  const replaced = [], history = { state: { example: true }, replaceState(...args) { replaced.push(args); } };
  const currentLocation = { href: 'https://garapp.siniverse.cc/?a=1&drive_auth=failed#dashboard' };
  assert.equal(consumeWorkerFailure(currentLocation, history), true);
  assert.deepEqual(replaced[0], [history.state, '', '/?a=1#dashboard']);
  assert.equal(consumeWorkerFailure({ href: 'https://garapp.siniverse.cc/?a=1#dashboard' }, history), false);
  assert.equal(replaced.length, 1);
});

test('a returning browser gets a short-lived access token and refreshes it without another Google popup', async () => {
  let now = 0, issued = 0;
  const requests = [];
  const auth = new WorkerDriveAuthorization({ now: () => now, fetcher: async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/session')) return json({ connected: true });
    if (url.endsWith('/token')) return json({ access_token: `synthetic-${++issued}`, expires_in: 60 });
    throw Error('Unexpected request');
  } });
  assert.equal(await auth.restore(), true);
  assert.equal(await auth.token(), 'synthetic-1');
  assert.equal(issued, 1);
  now = 31000;
  const tokens = await Promise.all([auth.token(), auth.token()]);
  assert.deepEqual(tokens, ['synthetic-2', 'synthetic-2']);
  assert.equal(issued, 2, 'a concurrent refresh must fetch only once');
  assert.deepEqual(requests.map(({ url }) => url), [WORKER_DRIVE_AUTH + 'session', WORKER_DRIVE_AUTH + 'token', WORKER_DRIVE_AUTH + 'token']);
  assert.ok(requests.every(({ options }) => options.credentials === 'include' && options.cache === 'no-store' && options.redirect === 'error'));
});

test('Drive requests await the broker token, but Google receives no session cookie', async () => {
  const auth = new WorkerDriveAuthorization({ fetcher: async (url) => url.endsWith('/session')
    ? json({ connected: true }) : json({ access_token: 'synthetic-access', expires_in: 120 }) });
  assert.equal(await auth.restore(), true);
  let googleRequest;
  const api = new DriveAPI({ token: () => auth.token(), fetcher: async (url, options) => {
    googleRequest = { url, options };
    return json({ user: { displayName: 'Compte fictif', emailAddress: 'example@example.test' } });
  } });
  assert.deepEqual(await api.getAccount(), { name: 'Compte fictif', email: 'example@example.test' });
  assert.equal(googleRequest.options.headers.Authorization, 'Bearer synthetic-access');
  assert.equal(googleRequest.options.credentials, 'omit');
});

test('a disconnected session never requests a token and only explicit clicks start OAuth', async () => {
  const requests = [], redirects = [];
  const auth = new WorkerDriveAuthorization({ fetcher: async (url) => { requests.push(url); return json({ connected: false }); }, navigate: (url) => redirects.push(url) });
  assert.equal(await auth.restore(), false);
  assert.equal(await auth.token(), null);
  assert.deepEqual(requests, [WORKER_DRIVE_AUTH + 'session']);
  assert.deepEqual(redirects, []);
  auth.connect('https://garapp.siniverse.cc/');
  assert.equal(new URL(redirects[0]).searchParams.get('return_to'), 'https://garapp.siniverse.cc/');
  assert.equal(new URL(redirects[0]).pathname, '/v1/garapp/connect');
});

test('revoked Google access stops transfers and explicit server logout clears the browser token', async () => {
  const requests = [];
  const auth = new WorkerDriveAuthorization({ fetcher: async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/session')) return json({ connected: true });
    if (url.endsWith('/token')) return new Response(null, { status: 401 });
    if (url.endsWith('/disconnect')) return new Response(null, { status: 204 });
    throw Error('Unexpected request');
  } });
  assert.equal(await auth.restore(), false);
  assert.equal(auth.connected, false);
  assert.equal(auth.accessToken, null);
  await auth.disconnect();
  assert.equal(requests.at(-1).options.method, 'POST');
  assert.equal(requests.at(-1).options.credentials, 'include');
});

test('a failed server logout leaves the user able to retry and never treats the session as revoked', async () => {
  const auth = new WorkerDriveAuthorization({ fetcher: async (url) => {
    if (url.endsWith('/session')) return json({ connected: true });
    if (url.endsWith('/token')) return json({ access_token: 'synthetic-access', expires_in: 300 });
    return json({ error: 'synthetic failure' }, 503);
  } });
  assert.equal(await auth.restore(), true);
  await assert.rejects(auth.disconnect(), /déconnexion/);
  assert.equal(auth.connected, true);
  assert.equal(await auth.token(), 'synthetic-access');
  assert.equal(auth.pending, false);
});

test('an unresponsive auth Worker times out promptly without inventing a disconnected session', async () => {
  const auth = new WorkerDriveAuthorization({ timeoutMs: 10, fetcher: (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
  }) });
  await assert.rejects(auth.restore(), { name: 'AbortError' });
  assert.equal(auth.connected, false);
  assert.equal(auth.accessToken, null);
});

test('concurrent logout clicks share one server request and clear the session only after success', async () => {
  let finishLogout, logoutRequests = 0;
  const auth = new WorkerDriveAuthorization({ fetcher: async (url) => {
    if (url.endsWith('/session')) return json({ connected: true });
    if (url.endsWith('/token')) return json({ access_token: 'synthetic-access', expires_in: 300 });
    logoutRequests++;
    return new Promise((resolve) => { finishLogout = () => resolve(new Response(null, { status: 204 })); });
  } });
  assert.equal(await auth.restore(), true);
  const first = auth.disconnect(), second = auth.disconnect();
  assert.equal(auth.pending, true);
  assert.equal(auth.connected, true);
  assert.equal(logoutRequests, 1);
  finishLogout();
  await Promise.all([first, second]);
  assert.equal(auth.pending, false);
  assert.equal(auth.connected, false);
  assert.equal(auth.accessToken, null);
});
