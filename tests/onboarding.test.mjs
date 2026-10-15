import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

function load(path, stubs = {}) {
  const filename = new URL(path, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const compiledModule = { exports: {} }; const require = createRequire(filename);
  new Function('require', 'module', 'exports', outputText)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const access = load('../src/lib/auth/access.ts');
const validation = load('../src/lib/onboarding/validation.ts');
const valid = { full_name: ' Student ', faculty: ' Science ', programme: ' Mathematics ' };
const form = (values = valid) => { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; };
const user = { id: 'self', email_confirmed_at: 'confirmed', user_metadata: { full_name: 'Student' } };
function client(state = { state: 'needs_onboarding' }) {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'jomlepakz_complete_onboarding') return { data: true, error: null };
    return { data: state, error: null };
  } };
}
function action(c) {
  return load('../src/app/onboarding/actions.ts', {
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
    'next/cache': { revalidatePath: () => {} }, '@/lib/supabase/server': { createClient: async () => c },
    '@/lib/auth/access': access, '@/lib/onboarding/validation': validation,
  }).completeOnboarding;
}

test('onboarding trims required fields and rejects blank, long, control and forged fields', () => {
  assert.deepEqual(validation.onboardingSchema.parse(valid), { full_name: 'Student', faculty: 'Science', programme: 'Mathematics' });
  for (const name of Object.keys(valid)) {
    for (const value of ['', '   ', '\u00a0', 'x\n', 'x\t', 'x\u0085', 'x\u0000', 'x\u2028', 'x'.repeat(151)]) {
      assert.equal(validation.onboardingSchema.safeParse({ ...valid, [name]: value }).success, false);
    }
  }
  for (const field of ['auth_user_id', 'id', 'account_status', 'verified_at', 'is_admin', 'moderation_revision']) {
    assert.equal(validation.onboardingSchema.safeParse({ ...valid, [field]: 'forged' }).success, false);
  }
});

test('prefill prefers pending profile fields and treats metadata only as validated text', () => {
  assert.deepEqual(validation.onboardingPrefill({ full_name: 'Saved', faculty: 'Science' }, 'Metadata'), {
    full_name: 'Saved', faculty: 'Science', programme: '',
  });
  assert.equal(validation.onboardingPrefill(undefined, ' Metadata ').full_name, 'Metadata');
  for (const metadata of [null, {}, 'x'.repeat(101), 'x\n']) assert.equal(validation.onboardingPrefill(undefined, metadata).full_name, '');
});

test('new and existing Auth users without profiles receive needs_onboarding without client profile reads', async () => {
  for (const createdAt of ['new', 'before-migrations']) {
    const c = client(); c.auth.getUser = async () => ({ data: { user: { ...user, created_at: createdAt } }, error: null });
    assert.equal((await access.authenticatedAccess(c)).access.state, 'needs_onboarding');
    assert.deepEqual(c.calls, [{ name: 'jomlepakz_account_access', args: undefined }]);
  }
});

test('account access accepts only exact business DTOs and never turns malformed results or errors into onboarding', async () => {
  for (const state of [{ state: 'eligible' }, { state: 'restricted' }, { state: 'needs_onboarding' },
    { state: 'needs_onboarding', profile: { full_name: null, faculty: 'Science', programme: null } }]) {
    assert.deepEqual(await access.readAccountAccess(client(state)), state);
  }
  for (const state of [null, true, {}, { state: 'unknown' }, { state: 'eligible', auth_user_id: 'other' },
    { state: 'needs_onboarding', profile: { full_name: 'x' } }]) assert.equal((await access.readAccountAccess(client(state))).state, 'unavailable');
  assert.equal((await access.readAccountAccess({ rpc: async () => ({ data: { state: 'needs_onboarding' }, error: { message: 'PRIVATE' } }) })).state, 'unavailable');
  assert.equal((await access.readAccountAccess({ rpc: async () => { throw new Error('PRIVATE'); } })).state, 'unavailable');
});

test('missing session differs from Auth service errors; neither grants access', async () => {
  const c = client();
  c.auth.getUser = async () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError' } });
  assert.equal((await access.authenticatedAccess(c)).access.state, 'signed_out');
  c.auth.getUser = async () => { throw new Error('PRIVATE'); };
  assert.equal((await access.authenticatedAccess(c)).access.state, 'unavailable');
  assert.equal(c.calls.length, 0);
});

test('successful onboarding sends only normalized content and rechecks eligibility before redirect', async () => {
  const c = client(); let complete = false;
  c.rpc = async (name, args) => {
    c.calls.push({ name, args });
    if (name === 'jomlepakz_complete_onboarding') { complete = true; return { data: true, error: null }; }
    return { data: { state: complete ? 'eligible' : 'needs_onboarding' }, error: null };
  };
  await assert.rejects(action(c)({}, form()), /^Error: redirect:\/$/);
  assert.deepEqual(c.calls[1], { name: 'jomlepakz_complete_onboarding', args: { p_full_name: 'Student', p_faculty: 'Science', p_programme: 'Mathematics' } });
});

test('repeat submission for eligible user succeeds without a write or profile edits', async () => {
  const c = client({ state: 'eligible' });
  await assert.rejects(action(c)({}, form({ ...valid, full_name: 'Changed' })), /^Error: redirect:\/$/);
  assert.equal(c.calls.filter(call => call.name === 'jomlepakz_complete_onboarding').length, 0);
});

test('invalid fields and injected authority stop before authentication or writes', async () => {
  const c = client();
  assert.ok((await action(c)({}, form({ ...valid, faculty: ' ' }))).errors.faculty);
  for (const key of ['auth_user_id', 'id', 'account_status', 'verified_at', 'is_admin', 'moderation_revision']) {
    assert.match((await action(c)({}, form({ ...valid, [key]: 'forged' }))).message, /only/);
  }
  assert.equal(c.calls.length, 0);
});

test('restricted users cannot submit onboarding and technical failures never report success', async () => {
  const denied = client({ state: 'restricted' });
  await assert.rejects(action(denied)({}, form()), /^Error: redirect:\/account-status$/);
  assert.equal(denied.calls.length, 1);
  const broken = client(); broken.rpc = async () => ({ data: null, error: { message: 'PRIVATE' } });
  assert.match((await action(broken)({}, form())).message, /temporarily unavailable/);
  const failedWrite = client();
  failedWrite.rpc = async name => name === 'jomlepakz_account_access' ? { data: { state: 'needs_onboarding' }, error: null } : { data: null, error: { message: 'PRIVATE' } };
  const result = await action(failedWrite)({}, form());
  assert.match(result.message, /could not complete/); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

test('access routing keeps onboarding, restrictions, errors and signed-out sessions outside the app', () => {
  for (const [state, path] of [['eligible', '/'], ['needs_onboarding', '/onboarding'], ['restricted', '/account-status'], ['unavailable', '/account-status'], ['signed_out', '/sign-in']]) {
    assert.equal(access.accessDestination({ state }), path);
  }
});

test('Proxy routes missing-profile users to onboarding and never opens protected content on errors', async () => {
  const require = createRequire(import.meta.url);
  const { NextRequest } = require('next/server');
  const navigation = load('../src/lib/auth/navigation.ts');
  for (const [state, path, expected] of [
    ['needs_onboarding', '/profile', '/onboarding'], ['needs_onboarding', '/onboarding', null],
    ['eligible', '/onboarding', '/'], ['eligible', '/profile', null],
    ['restricted', '/profile', '/account-status'], ['unavailable', '/profile', '/account-status'],
    ['unavailable', '/onboarding', '/account-status'],
  ]) {
    const c = client({ state }); c.auth.getClaims = async () => ({ data: { claims: { sub: 'self' } }, error: null });
    const { updateSession } = load('../src/lib/supabase/proxy.ts', {
      '@supabase/ssr': { createServerClient: () => c }, '@/lib/auth/navigation': navigation, '@/lib/auth/access': access,
    });
    const response = await updateSession(new NextRequest(`https://preview.example.test${path}`));
    assert.equal(response.headers.get('location'), expected ? `https://preview.example.test${expected}` : null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});

test('server guard requires eligible state and distinguishes missing profile from technical error', async () => {
  for (const [state, expected] of [['needs_onboarding', '/onboarding'], ['restricted', '/account-status'], ['unavailable', '/account-status']]) {
    const c = client({ state });
    const server = load('../src/lib/auth/server.ts', {
      'server-only': {}, 'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
      '@/lib/supabase/server': { createClient: async () => c }, './navigation': load('../src/lib/auth/navigation.ts'), './access': access,
    });
    await assert.rejects(server.requireEligibleUser('/profile'), error => error.message === `redirect:${expected}`);
  }
});

test('password sign-in and email confirmation route an approved missing-profile account to onboarding', async () => {
  const c = client();
  c.auth.signInWithPassword = c.auth.verifyOtp = async () => ({ error: null });
  const navigation = load('../src/lib/auth/navigation.ts');
  const stubs = {
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
    'next/cache': { revalidatePath: () => {} }, '@/lib/supabase/server': { createClient: async () => c },
    '@/lib/auth/access': access, '@/lib/auth/navigation': navigation,
    '@/lib/auth/server': { appOrigin: () => 'https://preview.example.test' },
    '@/lib/auth/validation': load('../src/lib/auth/validation.ts'),
  };
  const auth = load('../src/app/auth/actions.ts', stubs);
  await assert.rejects(auth.signIn({}, form({ email: 'student@siswa.um.edu.my', password: 'password8' })), /^Error: redirect:\/onboarding$/);
  const handler = load('../src/app/auth/confirm/route.ts', stubs);
  const response = await handler.GET({ nextUrl: new URL('https://preview.example.test/auth/confirm?token_hash=' + 'a'.repeat(64) + '&type=email') });
  assert.equal(response.headers.get('location'), 'https://preview.example.test/onboarding');
  c.rpc = async () => ({ data: null, error: { message: 'PRIVATE' } });
  assert.match((await auth.signIn({}, form({ email: 'student@siswa.um.edu.my', password: 'password8' }))).message, /temporarily unavailable/);
});
