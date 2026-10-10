import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual server schemas/actions/handlers against isolated stubs.
// No requests, accounts, credentials or database fixtures are created.
function load(relativePath, stubs = {}) {
  const filename = new URL(relativePath, import.meta.url);
  const source = readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const compiledModule = { exports: {} };
  const require = createRequire(filename);
  new Function('require', 'module', 'exports', outputText)(
    name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), compiledModule, compiledModule.exports,
  );
  return compiledModule.exports;
}

const validation = load('../src/lib/auth/validation.ts');
const navigation = load('../src/lib/auth/navigation.ts');
const serverStub = { appOrigin: () => 'https://app.example.test', isEligible: async () => false,
  hasApprovedIdentity: async () => false };

function form(values) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function actions(client, eligible = false, approved = false) {
  return load('../src/app/auth/actions.ts', {
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/auth/server': { ...serverStub, isEligible: async () => eligible, hasApprovedIdentity: async () => approved },
    '@/lib/auth/navigation': navigation,
    '@/lib/auth/validation': validation,
  });
}

test('server schemas normalize email, retain password bytes, and reject malformed/oversized input', () => {
  const password = ' pass word ';
  const parsed = validation.signUpSchema.parse({ name: ' Student ', email: ' Student@SISWA.UM.EDU.MY ', password });
  assert.equal(parsed.email, 'student@siswa.um.edu.my');
  assert.equal(parsed.name, 'Student');
  assert.equal(parsed.password, password);
  for (const email of ['a@@siswa.um.edu.my', 'a b@siswa.um.edu.my', '', 'a@']) {
    assert.equal(validation.signInSchema.safeParse({ email, password }).success, false);
  }
  assert.equal(validation.signUpSchema.safeParse({ name: '', email: parsed.email, password: 'short' }).success, false);
  assert.equal(validation.signInSchema.safeParse({ email: parsed.email, password: 'x'.repeat(129) }).success, false);
  assert.equal(validation.signInSchema.safeParse({ email: new File([], 'email'), password }).success, false);
});

test('Google authorization URL permits only the configured Supabase endpoint and fixed callback', () => {
  const callback = 'https://app.example.test/auth/callback';
  const base = 'https://dev.example.test';
  const url = base + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(callback);
  assert.equal(navigation.safeOAuthUrl(url, base, callback), url);
  for (const rejected of [url.replace(base, 'https://evil.test'), url.replace('provider=google', 'provider=github'),
    url.replace('/authorize', '/logout'), url.replace(encodeURIComponent(callback), encodeURIComponent('https://evil.test'))]) {
    assert.equal(navigation.safeOAuthUrl(rejected, base, callback), null);
  }
});

test('Google Server Action uses only PKCE provider URL and ignores user redirect input', async () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dev.example.test';
  try {
    let options;
    const url = 'https://dev.example.test/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent('https://app.example.test/auth/callback');
    const auth = actions({ auth: { signInWithOAuth: async input => { options = input; return { data: { url }, error: null }; } } });
    await assert.rejects(auth.continueWithGoogle(form({ next: 'https://evil.test' })), error => error.message === 'redirect:' + url);
    assert.equal(options.provider, 'google');
    assert.equal(options.options.redirectTo, 'https://app.example.test/auth/callback');
    assert.equal(options.options.skipBrowserRedirect, true);
    const failed = actions({ auth: { signInWithOAuth: async () => ({ data: { url: 'https://evil.test' }, error: null }) } });
    assert.match((await failed.continueWithGoogle()).message, /unavailable/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});

test('OAuth callback validates identity, denies non-approved accounts, and never follows next', async () => {
  let signOutCalls = 0;
  const client = { auth: {
    exchangeCodeForSession: async () => ({ error: null }),
    signOut: async () => { signOutCalls++; return { error: null }; },
  } };
  const handler = approved => load('../src/app/auth/callback/route.ts', {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/auth/server': { ...serverStub, hasApprovedIdentity: async () => approved },
    '@/lib/auth/validation': validation,
  });
  const request = { nextUrl: new URL('https://app.example.test/auth/callback?code=pkce-code&next=https://evil.test') };
  const denied = await handler(false).GET(request);
  assert.equal(denied.headers.get('location'), 'https://app.example.test/sign-in?notice=account_denied');
  assert.equal(signOutCalls, 1);
  const approved = await handler(true).GET(request);
  assert.equal(approved.headers.get('location'), 'https://app.example.test/account-status');
});

test('OAuth cancellation and missing verifier use friendly errors without provider text', async () => {
  let exchanges = 0;
  const handler = load('../src/app/auth/callback/route.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: {
      exchangeCodeForSession: async () => { exchanges++; return { error: { message: 'PRIVATE VERIFIER' } }; },
    } }) }, '@/lib/auth/server': serverStub, '@/lib/auth/validation': validation,
  });
  for (const query of ['?error=access_denied&error_description=PRIVATE', '?code=missing-verifier']) {
    const response = await handler.GET({ nextUrl: new URL('https://app.example.test/auth/callback' + query) });
    assert.equal(response.headers.get('location'), 'https://app.example.test/sign-in?notice=auth_failed');
  }
  assert.equal(exchanges, 1);
});

test('reset requests validate server input, use fixed callback, and do not enumerate accounts', async () => {
  let calls = 0;
  let destination;
  const make = error => actions({ auth: { resetPasswordForEmail: async (_email, options) => {
    calls++; destination = options.redirectTo; return { error };
  } } });
  assert.ok((await make(null).requestPasswordReset({}, form({ email: 'invalid' }))).errors.email);
  assert.equal(calls, 0);
  const known = await make(null).requestPasswordReset({}, form({ email: 'student@siswa.um.edu.my', redirectTo: 'https://evil.test' }));
  const unknown = await make({ code: 'user_not_found', message: 'PRIVATE' }).requestPasswordReset({}, form({ email: 'missing@siswa.um.edu.my' }));
  assert.deepEqual(known, unknown);
  assert.equal(destination, 'https://app.example.test/auth/recovery');
  assert.doesNotMatch(JSON.stringify(unknown), /PRIVATE/);
});

test('recovery accepts only recovery token type or valid PKCE, then approved identity', async () => {
  let verifyCalls = 0;
  let exchangeError = null;
  const client = { auth: {
    verifyOtp: async () => { verifyCalls++; return { error: null }; },
    exchangeCodeForSession: async () => ({ error: exchangeError }),
    signOut: async () => ({ error: null }),
  } };
  const handler = load('../src/app/auth/recovery/route.ts', {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/auth/server': { ...serverStub, hasApprovedIdentity: async () => true },
    '@/lib/auth/validation': validation,
  });
  const request = query => ({ nextUrl: new URL('https://app.example.test/auth/recovery' + query) });
  const wrong = await handler.GET(request('?token_hash=' + 'a'.repeat(64) + '&type=signup'));
  assert.equal(verifyCalls, 0);
  assert.equal(wrong.headers.get('location'), 'https://app.example.test/password-reset?notice=reset_failed');
  const valid = await handler.GET(request('?token_hash=' + 'a'.repeat(64) + '&type=recovery&next=https://evil.test'));
  assert.equal(valid.headers.get('location'), 'https://app.example.test/update-password');
  assert.equal(verifyCalls, 1);
  const pkce = await handler.GET(request('?code=recovery-code'));
  assert.equal(pkce.headers.get('location'), 'https://app.example.test/update-password');
  exchangeError = { message: 'expired code' };
  const other = await handler.GET(request('?code=expired-code'));
  assert.match(other.headers.get('location'), /notice=reset_failed$/);
});

test('expired recovery token or unapproved identity cannot reach update screen', async () => {
  for (const [error, approved] of [[{ message: 'PRIVATE EXPIRED' }, true], [null, false]]) {
    const handler = load('../src/app/auth/recovery/route.ts', {
      '@/lib/supabase/server': { createClient: async () => ({ auth: {
        verifyOtp: async () => ({ error }), signOut: async () => ({ error: null }),
      } }) }, '@/lib/auth/server': { ...serverStub, hasApprovedIdentity: async () => approved },
      '@/lib/auth/validation': validation,
    });
    const response = await handler.GET({ nextUrl: new URL('https://app.example.test/auth/recovery?token_hash=' + 'b'.repeat(64) + '&type=recovery') });
    assert.equal(response.headers.get('location'), 'https://app.example.test/password-reset?notice=reset_failed');
  }
});

test('password updates require approved live identity and matching server-validated passwords', async () => {
  let updates = 0;
  const client = { auth: {
    updateUser: async () => { updates++; return { error: null }; }, signOut: async () => ({ error: null }),
  } };
  const valid = form({ password: 'new password8', confirmPassword: 'new password8' });
  assert.ok((await actions(client, false, true).updatePassword({}, form({ password: 'new password8', confirmPassword: 'different' }))).errors.confirmPassword);
  await actions(client).updatePassword({}, valid);
  assert.equal(updates, 0);
  await assert.rejects(actions(client, false, true).updatePassword({}, valid), /^Error: redirect:\/sign-in\?notice=password_updated$/);
  assert.equal(updates, 1);
});

test('approved-identity reader performs live Auth validation and fails closed on RPC failures', async () => {
  const server = load('../src/lib/auth/server.ts', {
    'server-only': {}, 'next/navigation': {}, '@/lib/supabase/server': {}, './navigation': navigation,
  });
  let rpcCalls = 0;
  const client = (user, authError = null, error = null) => ({
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    rpc: async () => { rpcCalls++; return { data: true, error }; },
  });
  assert.equal(await server.hasApprovedIdentity(client(null)), false);
  assert.equal(rpcCalls, 0);
  assert.equal(await server.hasApprovedIdentity(client({ email_confirmed_at: 'verified' }, { message: 'revoked' })), false);
  assert.equal(await server.hasApprovedIdentity(client({ email_confirmed_at: 'verified' }, null, { message: 'unavailable' })), false);
  assert.equal(await server.hasApprovedIdentity(client({ email_confirmed_at: 'verified' })), true);
});

test('redirect destinations reject external, encoded and auth-route redirects', () => {
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/%2f%2fevil.test',
    '/%5cevil.test', '/auth/confirm', '/sign-in', '/profile\n', '/%252f%252fevil.test', new File([], 'next')]) {
    assert.equal(navigation.safeNextPath(value), '/profile');
  }
  assert.equal(navigation.safeNextPath('/messages/thread?view=latest'), '/messages/thread?view=latest');
  assert.equal(navigation.safeNextPath('/'), '/');
  assert.equal(navigation.isProtectedPath('/profile/edit'), true);
  assert.equal(navigation.isProtectedPath('/profile-other'), false);
});

test('invalid submissions stop before any Auth request', async () => {
  const auth = actions({ auth: new Proxy({}, { get: () => { throw new Error('Auth must not run'); } }) });
  const result = await auth.signUp({}, form({ name: '', email: 'invalid', password: '123' }));
  assert.ok(result.errors.email && result.errors.name && result.errors.password);
  assert.equal(JSON.stringify(result).includes('123'), false);
});

test('signup uses configured callback and never assigns verification/admin state', async () => {
  let input;
  const auth = actions({ auth: { signUp: async value => {
    input = value;
    return { data: { session: null }, error: null };
  } } });
  const result = await auth.signUp({}, form({ name: 'Student', email: 'Student@SISWA.UM.EDU.MY', password: 'password8' }));
  assert.equal(input.email, 'student@siswa.um.edu.my');
  assert.equal(input.options.emailRedirectTo, 'https://app.example.test/auth/callback');
  assert.deepEqual(input.options.data, { full_name: 'Student' });
  assert.match(result.message, /check your email/i);
  assert.equal(JSON.stringify(result).includes('password8'), false);
});

test('duplicate signup is neutral and hook errors never reveal provider text', async () => {
  for (const code of ['user_already_exists', 'hook_payload_invalid']) {
    const auth = actions({ auth: { signUp: async () => ({ data: { session: null },
      error: { code, message: 'SECRET DATABASE DETAIL' } }) } });
    const result = await auth.signUp({}, form({ name: 'Student', email: 'student@siswa.um.edu.my', password: 'password8' }));
    assert.doesNotMatch(JSON.stringify(result), /SECRET|DATABASE/);
    if (code === 'user_already_exists') assert.match(result.message, /If signup can be completed/);
  }
});

test('unexpected auto-confirmed signup session is signed out locally', async () => {
  let scope;
  const auth = actions({ auth: {
    signUp: async () => ({ data: { session: {} }, error: null }),
    signOut: async value => { scope = value.scope; return { error: null }; },
  } });
  await auth.signUp({}, form({ name: 'Student', email: 'student@siswa.um.edu.my', password: 'password8' }));
  assert.equal(scope, 'local');
});

test('signin errors are generic and successful ineligible signin stays outside protected routes', async () => {
  const denied = actions({ auth: { signInWithPassword: async () => ({ error: { code: 'invalid_credentials', message: 'PRIVATE' } }) } });
  const input = form({ email: 'student@siswa.um.edu.my', password: 'password8', next: '/settings' });
  assert.doesNotMatch(JSON.stringify(await denied.signIn({}, input)), /PRIVATE/);
  const signedIn = actions({ auth: { signInWithPassword: async () => ({ error: null }) } });
  await assert.rejects(signedIn.signIn({}, input), /^Error: redirect:\/account-status$/);
});

test('eligible signin uses validated destination and cannot redirect offsite', async () => {
  const auth = actions({ auth: { signInWithPassword: async () => ({ error: null }) } }, true);
  await assert.rejects(auth.signIn({}, form({ email: 'student@siswa.um.edu.my', password: 'password8', next: '//evil.test' })),
    /^Error: redirect:\/profile$/);
});

test('signout only reports success after local revocation succeeds', async () => {
  let scope;
  const success = actions({ auth: { signOut: async value => { scope = value.scope; return { error: null }; } } });
  await assert.rejects(success.signOut(), /^Error: redirect:\/sign-in\?notice=signed_out$/);
  assert.equal(scope, 'local');
  const failure = actions({ auth: { signOut: async () => ({ error: { message: 'PRIVATE' } }) } });
  assert.match((await failure.signOut()).message, /couldn't sign you out/);
});

test('live eligibility errors and non-boolean results fail closed', async () => {
  const server = load('../src/lib/auth/server.ts', {
    'server-only': {}, 'next/navigation': {}, '@/lib/supabase/server': {}, './navigation': navigation,
  });
  for (const response of [{ data: true, error: { message: 'private' } }, { data: 'true', error: null }, { data: false, error: null }]) {
    assert.equal(await server.isEligible({ rpc: async () => response }), false);
  }
  assert.equal(await server.isEligible({ rpc: async () => { throw new Error('offline'); } }), false);
  assert.equal(await server.isEligible({ rpc: async () => ({ data: true, error: null }) }), true);
});

test('confirmation rejects malformed tokens/types, consumes valid email token, and strips redirect input', async () => {
  let calls = 0;
  const handler = load('../src/app/auth/confirm/route.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { verifyOtp: async () => { calls++; return { error: null }; } } }) },
    '@/lib/auth/server': serverStub, '@/lib/auth/validation': validation,
  });
  const request = url => ({ nextUrl: new URL(url) });
  const invalid = await handler.GET(request('https://app.example.test/auth/confirm?token_hash=short&type=recovery'));
  assert.equal(calls, 0);
  assert.match(invalid.headers.get('location'), /notice=confirmation_failed$/);
  const valid = await handler.GET(request('https://app.example.test/auth/confirm?token_hash=' + 'a'.repeat(64) + '&type=email&next=https://evil.test'));
  assert.equal(calls, 1);
  assert.equal(valid.headers.get('location'), 'https://app.example.test/account-status');
  assert.equal(valid.headers.get('cache-control'), 'private, no-store');
  assert.equal(valid.headers.get('referrer-policy'), 'no-referrer');
});

test('expired/reused confirmation and missing PKCE code get fixed friendly failure redirects', async () => {
  const stubs = {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { verifyOtp: async () => ({ error: { message: 'PRIVATE TOKEN' } }) } }) },
    '@/lib/auth/server': serverStub, '@/lib/auth/validation': validation,
  };
  const confirmation = load('../src/app/auth/confirm/route.ts', stubs);
  const response = await confirmation.GET({ nextUrl: new URL('https://app.example.test/auth/confirm?token_hash=' + 'b'.repeat(64) + '&type=email') });
  assert.equal(response.headers.get('location'), 'https://app.example.test/sign-in?notice=confirmation_failed');
  const callback = load('../src/app/auth/callback/route.ts', stubs);
  const failure = await callback.GET({ nextUrl: new URL('https://app.example.test/auth/callback?error_description=PRIVATE') });
  assert.equal(failure.headers.get('location'), 'https://app.example.test/sign-in?notice=auth_failed');
});
