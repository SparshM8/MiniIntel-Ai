import { test, expect } from '@playwright/test';

const reportId = '111111111111111111111111';

async function setup(page, options = {}) {
  const state = { report: { _id: reportId, title: 'Production review', type: 'Executive Summary',
    status: 'draft', __v: 4, version: 2, createdAt: '2026-09-17T10:00:00.000Z', content: { markdown: 'Verified production evidence' },
    ...options.report }, writes: [], reads: 0 };
  await page.addInitScript(() => localStorage.setItem('userInfo', JSON.stringify({
    name: 'Administrator', role: 'admin', token: 'mock-token'
  })));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4179') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/reports') return route.fulfill({ json: { success: true, data: [state.report] } });
    if (url.pathname === `/api/v1/reports/${reportId}`) {
      state.reads++;
      if (options.read && await options.read(route, state)) return;
      return route.fulfill({ json: { success: true, data: state.report } });
    }
    if (route.request().method() === 'PUT' && url.pathname.startsWith(`/api/v1/reports/${reportId}/`)) {
      const action = url.pathname.split('/').at(-1);
      state.writes.push({ action, ...route.request().postDataJSON() });
      if (options.write) return options.write(route, state);
      state.report = { ...state.report, __v: (state.report.__v ?? 0) + 1,
        status: { submit: 'review', approve: 'approved', reject: 'rejected' }[action] };
      return route.fulfill({ json: { success: true, data: state.report } });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
  await page.goto(`/reports?id=${reportId}`);
  await expect(page.getByRole('heading', { name: 'Production review', exact: true, level: 2 })).toBeVisible();
  return state;
}

test('submission uses the viewed token and approval uses the returned token', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Submit for Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve Report', exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ action: 'submit', expectedVersion: 4 }]);
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Approve Report', exact: true }).click();
  await expect(page.getByText('Official Document Approved by Administration')).toBeVisible();
  expect(state.writes[1]).toMatchObject({ action: 'approve', expectedVersion: 5 });
});

for (const width of [390, 1440]) {
  test(`rejection conflict requires explicit reload at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let failReload = false;
    const state = await setup(page, { report: { status: 'review' },
      read: async route => {
        if (!failReload) return false;
        await route.fulfill({ status: 503, json: { message: 'Reload unavailable' } });
        return true;
      },
      write: async (route, current) => {
        current.report = { ...current.report, __v: 5 };
        await route.fulfill({ status: 409, json: { error: 'REPORT_CONFLICT', message: 'Stale version' } });
      }
    });
    await expect(page.getByRole('button', { name: 'Reject...', exact: true })).toBeEnabled();
    const initialReads = state.reads;
    await page.getByRole('button', { name: 'Reject...', exact: true }).click();
    await page.getByLabel('Rejection Reason / Comments').fill('Old decision draft');
    await page.getByRole('button', { name: 'Confirm Rejection', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Report changed elsewhere');
    await expect(page.getByRole('button', { name: 'Approve Report', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reject...', exact: true })).toBeDisabled();
    expect(state.writes).toEqual([{ action: 'reject', expectedVersion: 4, reason: 'Old decision draft' }]);
    expect(state.reads).toBe(initialReads);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('alert').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`report-conflict-${width}.png`) });
    failReload = true;
    await page.getByRole('button', { name: 'Reload report', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Reload unavailable');
    await expect(page.getByRole('button', { name: 'Approve Report', exact: true })).toBeDisabled();
    failReload = false;
    await page.getByRole('button', { name: 'Reload report', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reject...', exact: true }).click();
    await expect(page.getByLabel('Rejection Reason / Comments')).toHaveValue('');
    await page.getByLabel('Rejection Reason / Comments').fill('Reconsidered decision');
    await page.getByRole('button', { name: 'Confirm Rejection', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Report changed elsewhere');
    expect(state.writes).toHaveLength(2);
    expect(state.writes[1]).toMatchObject({ expectedVersion: 5, reason: 'Reconsidered decision' });
  });
}

test('legacy missing version sends zero', async ({ page }) => {
  const state = await setup(page, { report: { __v: undefined } });
  await page.getByRole('button', { name: 'Submit for Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve Report', exact: true })).toBeVisible();
  expect(state.writes[0].expectedVersion).toBe(0);
});

for (const version of [null, '4', -1]) {
  test(`invalid report version ${JSON.stringify(version)} blocks writes`, async ({ page }) => {
    const state = await setup(page, { report: { __v: version } });
    await expect(page.getByRole('alert')).toContainText('Report version is invalid');
    await expect(page.getByRole('button', { name: 'Submit for Review', exact: true })).toBeDisabled();
    expect(state.writes).toHaveLength(0);
  });
}

test('in-flight submission cannot be duplicated or replaced by a new report', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const state = await setup(page, { write: async (route, current) => {
    await held;
    current.report = { ...current.report, status: 'review', __v: 5 };
    await route.fulfill({ json: { success: true, data: current.report } });
  } });
  try {
    const button = page.getByRole('button', { name: 'Submit for Review', exact: true });
    await button.evaluate(element => { element.click(); element.click(); });
    await expect.poll(() => state.writes.length).toBe(1);
    await expect(button).toBeDisabled();
    await expect(page.getByRole('button', { name: 'New Report', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Loaded report')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Generate Official Report', exact: true })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Production review', level: 2, exact: true })).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('button', { name: 'Approve Report', exact: true })).toBeEnabled();
  expect(state.writes).toHaveLength(1);
});

test('unverified write response requires reload without retry', async ({ page }) => {
  const state = await setup(page, { write: (route, current) =>
    route.fulfill({ json: { success: true, data: { ...current.report, status: 'review' } } }) });
  await page.getByRole('button', { name: 'Submit for Review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('response could not be verified');
  await expect(page.getByRole('button', { name: 'Submit for Review', exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(1);
});