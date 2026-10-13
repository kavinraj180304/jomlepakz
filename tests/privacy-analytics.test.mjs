import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
function load(path, stubs = {}) {
  const filename = new URL(path, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const compiled = { exports: {} }, require = createRequire(filename);
  new Function('require', 'module', 'exports', outputText)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), compiled, compiled.exports);
  return compiled.exports;
}
const config = load('../src/lib/analytics/config.ts');
const envNames = ['NEXT_PUBLIC_ANALYTICS_ENABLED', 'NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_HOST'];
async function configured(operation) {
  const previous = envNames.map(name => process.env[name]);
  Object.assign(process.env, { NEXT_PUBLIC_ANALYTICS_ENABLED: 'true', NEXT_PUBLIC_POSTHOG_KEY: 'phc_fictional_test_only', NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com' });
  try { return await operation(); } finally { envNames.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }); }
}
function server({ preference = 'allow', headers = {}, tasks = [] } = {}) {
  return load('../src/lib/analytics/server.ts', {
    'server-only': {}, './config': config, 'next/server': { after: callback => tasks.push(callback) },
    'next/headers': { cookies: async () => ({ get: () => preference === null ? undefined : ({ value: preference }) }), headers: async () => ({ get: name => headers[name] }) },
  });
}
test('analytics fails closed for disabled/malformed config, missing consent, privacy signals and unknown events', async () => configured(async () => {
  const tasks = [];
  for (const preference of ['deny', null, 'bad']) await server({ preference, tasks }).recordProductEvent('discover_viewed');
  for (const headers of [{ dnt: '1' }, { 'sec-gpc': '1' }]) await server({ headers, tasks }).recordProductEvent('activity_viewed');
  for (const event of ['chat_text', 'activity_viewed\nemail', { event: 'activity_viewed', email: 'never-send' }]) await server({ tasks }).recordProductEvent(event);
  for (const host of ['http://eu.i.posthog.com', 'https://evil.test', 'https://eu.i.posthog.com/redirect', 'https://eu.i.posthog.com@evil.test']) {
    process.env.NEXT_PUBLIC_POSTHOG_HOST = host; await server({ tasks }).recordProductEvent('join_completed');
  }
  process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phx_private_key'; await server({ tasks }).recordProductEvent('join_completed');
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = 'false'; await server({ tasks }).recordProductEvent('activity_created');
  assert.deepEqual(tasks, []);
}));
test('opted-in capture sends only allowlisted counts with a fresh per-event ID and no forwarded request metadata', async () => configured(async () => {
  const tasks = [], requests = [], previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return { ok: true }; };
  try {
    const api = server({ tasks });
    for (const event of config.productEvents) await api.recordProductEvent(event);
    assert.equal(requests.length, 0, 'Delivery must run after the response');
    for (const callback of tasks) await callback();
    assert.deepEqual(requests.map(r => r.body.event), [...config.productEvents]);
    assert.equal(new Set(requests.map(r => r.body.distinct_id)).size, 4);
    for (const request of requests) {
      assert.equal(request.url, 'https://eu.i.posthog.com/i/v0/e/');
      assert.deepEqual(Object.keys(request.body).sort(), ['api_key', 'distinct_id', 'event', 'properties']);
      assert.deepEqual(request.body.properties, { $process_person_profile: false, $geoip_disable: true, $ip: null });
      assert.deepEqual(request.options.headers, { 'Content-Type': 'application/json' });
      assert.equal(request.options.redirect, 'error');
      assert.doesNotMatch(JSON.stringify(request.body), /email|password|full_name|activity_id|chat|report|url|search/i);
    }
  } finally { globalThis.fetch = previousFetch; }
}));
test('analytics provider/network/context failures do not affect app operations', async () => configured(async () => {
  const tasks = [], previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('private provider detail'); };
  try {
    await assert.doesNotReject(() => server({ tasks }).recordProductEvent('join_completed'));
    await assert.doesNotReject(() => tasks[0]());
    await assert.doesNotReject(() => load('../src/lib/analytics/server.ts', {
      'server-only': {}, './config': config, 'next/server': { after: () => {} },
      'next/headers': { cookies: async () => { throw new Error('context'); }, headers: async () => ({ get: () => null }) },
    }).recordProductEvent('activity_created'));
  } finally { globalThis.fetch = previousFetch; }
}));
test('only strict preference choices are persisted and view event forgery/unauthorized callers never capture', async () => configured(async () => {
  const writes = [], events = [];
  const actions = load('../src/app/analytics/actions.ts', {
    '@/lib/analytics/config': config, '@/lib/analytics/server': { recordProductEvent: async event => events.push(event) },
    '@/lib/auth/server': { currentIdentity: async () => null, isEligible: async () => false },
    'next/headers': { cookies: async () => ({ get: () => null, set: (...args) => writes.push(args) }) },
  });
  assert.equal(await actions.analyticsPreference(), 'deny');
  assert.equal(await actions.setAnalyticsPreference({ choice: 'allow', email: 'sensitive' }), false);
  assert.equal(await actions.setAnalyticsPreference('allow'), true);
  assert.equal(writes[0][0], 'jomlepakz_analytics'); assert.equal(writes[0][1], 'allow');
  assert.equal(writes[0][2].httpOnly, true); assert.equal(writes[0][2].sameSite, 'lax');
  await actions.recordProductView('activity_created'); await actions.recordProductView({ event: 'activity_viewed' });
  await actions.recordProductView('discover_viewed'); assert.deepEqual(events, []);
}));
