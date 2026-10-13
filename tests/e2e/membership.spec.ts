import { expect, test, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
// The shared helper permits only a disposable loopback database and existing accounts.
import { localQAConfig, operatorClient, checkIdentities, removeFixture } from '../qa/local-context.mjs';

test('signed-out browser cannot open activity creation or administration', async ({ page }) => {
  for (const path of ['/activities/create', '/admin']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  }
});

test('host creates an instant activity; a second user joins and leaves', async () => {
  localQAConfig();
  let endpoint: URL;
  try { endpoint = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''); }
  catch { throw new Error('BLOCKED: build and serve using a local QA Supabase endpoint.'); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('BLOCKED: browser writes are restricted to a local disposable Supabase stack.');
  for (const path of ['tests/.auth/host.json', 'tests/.auth/participant.json']) {
    if (!existsSync(path)) throw new Error(`BLOCKED: record an existing reviewed account session in ${path}; never commit it.`);
  }
  const operator = await operatorClient();
  let browser, hostContext, participantContext, activityId: string | undefined;
  try {
    const profiles = await checkIdentities(operator);
    browser = await chromium.launch({ channel: 'chrome' });
    hostContext = await browser.newContext({ storageState: 'tests/.auth/host.json' });
    participantContext = await browser.newContext({ storageState: 'tests/.auth/participant.json' });
    // The harness builds in this local environment; browser traffic is scoped too.
    for (const context of [hostContext, participantContext]) {
      await context.route('**/*', route => {
        const target = new URL(route.request().url());
        return ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ? route.continue() : route.abort('blockedbyclient');
      });
    }
    const host = await hostContext.newPage(), participant = await participantContext.newPage();
    const base = 'http://127.0.0.1:3230';
    await host.goto(`${base}/activities/create`);
    await host.getByLabel('Activity title', { exact: true }).fill(`Local browser QA ${Date.now()}`);
    // The fixture uses the existing active category selected by the form.
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await host.getByLabel('Date', { exact: true }).fill(day);
    await host.getByLabel('Start time', { exact: true }).fill('20:00');
    await host.getByRole('button', { name: 'Continue', exact: true }).click();
    await host.getByLabel('Location', { exact: true }).selectOption({ label: 'UM Main Library' });
    await host.getByLabel('Max participants', { exact: true }).fill('2');
    await host.getByLabel('Description', { exact: true }).fill('Disposable local browser QA activity.');
    await host.getByLabel('Approval required', { exact: true }).selectOption('instant');
    await host.getByRole('button', { name: 'Continue', exact: true }).click();
    await host.getByRole('button', { name: 'Publish activity', exact: true }).click();
    await expect(host).toHaveURL(/\/activities\/[0-9a-f-]{36}$/);
    activityId = new URL(host.url()).pathname.split('/').pop();
    const record = await operator.query('SELECT host_id FROM public.activities WHERE id=$1', [activityId]);
    expect(record.rows[0]?.host_id).toBe(profiles[0].id);
    await participant.goto(host.url());
    await participant.getByRole('button', { name: 'Join activity', exact: true }).click();
    await expect(participant.getByText('You have joined this activity.', { exact: true })).toBeVisible();
    await expect(participant.getByText(/2 going/).first()).toBeVisible();
    await host.reload();
    await expect(host.getByText(/2 going/).first()).toBeVisible();
    await participant.getByRole('button', { name: 'Leave activity', exact: true }).click();
    await expect(participant.getByRole('button', { name: 'Join activity', exact: true })).toBeVisible();
    await expect(participant.getByText(/1 going/).first()).toBeVisible();
    await host.reload();
    await expect(host.getByText(/1 going/).first()).toBeVisible();
    const rows = await operator.query('SELECT user_id,status FROM public.activity_participants WHERE activity_id=$1', [activityId]);
    expect(rows.rows).toEqual([{ user_id: profiles[1].id, status: 'left' }]);
  } finally {
    await hostContext?.close(); await participantContext?.close(); await browser?.close();
    if (activityId) await removeFixture(operator, activityId);
    await operator.end();
  }
});
