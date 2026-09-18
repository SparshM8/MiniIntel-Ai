import { test, expect } from '@playwright/test';

const documentId = '111111111111111111111111';
const makeRecord = index => ({ _id: index.toString(16).padStart(24, '0'), documentId,
  documentName: 'Production.xlsx', caseId: `Case-${index}`, reviewState: 'pending', reviewVersion: 0,
  outcome: index % 2 ? 'matched' : 'conflict', reasonCode: 'VALUES_EQUAL', engineVersion: '1.0', operands: [] });

async function setup(page, options = {}) {
  const state = { records: Array.from({ length: 23 }, (_, index) => makeRecord(index + 1)), requests: [], decisions: [] };
  await page.addInitScript(() => localStorage.setItem('userInfo', JSON.stringify({ name: 'Reviewer', role: 'reviewer', token: 'mock-token' })));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4179') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/documents') return route.fulfill({ json: { success: true, data: [{ _id: documentId, originalName: 'Production.xlsx' }] } });
    if (url.pathname === '/api/v1/reconciliations/queue') {
      const query = Object.fromEntries(url.searchParams);
      state.requests.push(query);
      if (options.queue && await options.queue(route, query, state)) return;
      const records = state.records.filter(record => (!query.reviewState || record.reviewState === query.reviewState)
        && (!query.outcome || record.outcome === query.outcome) && (!query.caseId || record.caseId === query.caseId)
        && (!query.documentId || record.documentId === query.documentId));
      const pageNumber = Number(query.page);
      const limit = Number(query.limit);
      return route.fulfill({ json: { success: true, data: records.slice((pageNumber - 1) * limit, pageNumber * limit),
        meta: { total: records.length, page: pageNumber, limit, pages: Math.ceil(records.length / limit) } } });
    }
    if (url.pathname.endsWith('/decisions')) {
      const payload = route.request().postDataJSON();
      state.decisions.push(payload);
      const record = state.records.find(item => item._id === url.pathname.split('/').at(-2));
      if (options.decide) return options.decide(route, record, state);
      record.reviewState = 'accepted';
      record.reviewVersion++;
      return route.fulfill({ json: { success: true, data: record } });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
  await page.goto('/reconciliations');
  return state;
}

test('queue filters, exact lookup and pagination reset the selected review draft', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByText('23 records', { exact: true })).toBeVisible();
  await page.getByLabel('Reason', { exact: true }).fill('Do not carry this draft');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('heading', { name: 'Case-21', exact: true })).toBeVisible();
  await expect(page.getByLabel('Reason', { exact: true })).toHaveValue('');
  await page.getByLabel('Outcome', { exact: true }).selectOption('conflict');
  await expect(page.getByText('11 records', { exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await page.getByLabel('Source document').selectOption(documentId);
  await page.getByLabel('Case ID (exact)').fill('Case-2');
  await page.getByRole('button', { name: 'Find case' }).click();
  await expect(page.getByText('1 records', { exact: true })).toBeVisible();
  expect(state.requests.at(-1)).toMatchObject({ page: '1', reviewState: 'pending', outcome: 'conflict', caseId: 'Case-2', documentId });
  await page.getByLabel('Rows per page').selectOption('50');
  await expect.poll(() => state.requests.at(-1).limit).toBe('50');
});

test('decision sends the displayed version once and refreshes the pending queue', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole('heading', { name: 'Case-1', exact: true })).toBeVisible();
  await page.getByLabel('Reason', { exact: true }).fill('Verified evidence');
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.getByText('22 records', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Case-2', exact: true })).toBeVisible();
  expect(state.decisions).toHaveLength(1);
  expect(state.decisions[0]).toMatchObject({ decision: 'accept', reason: 'Verified evidence', expectedVersion: 0 });
  expect(state.decisions[0].requestId).toBeTruthy();
});

test('stale decision reloads without retrying the write', async ({ page }) => {
  const state = await setup(page, { decide: (route, record) => {
    record.reviewVersion = 1;
    return route.fulfill({ status: 409, json: { error: 'STALE_REVIEW_VERSION', message: 'Stale version' } });
  } });
  await expect(page.getByRole('heading', { name: 'Case-1', exact: true })).toBeVisible();
  await page.getByLabel('Reason', { exact: true }).fill('Review old version');
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await expect(page.getByText('Pending review · v1', { exact: true })).toBeVisible();
  expect(state.decisions).toHaveLength(1);
  await expect(page.getByLabel('Reason', { exact: true })).toHaveValue('');
});

test('late queue response cannot replace a newer filter result', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let intercepted = false;
  await setup(page, { queue: async (route, query) => {
    if (query.outcome !== 'conflict') return false;
    intercepted = true;
    await held;
    await route.fulfill({ json: { success: true, data: [makeRecord(2)], meta: { total: 1, pages: 1 } } }).catch(() => {});
    return true;
  } });
  await expect(page.getByText('23 records', { exact: true })).toBeVisible();
  await page.getByLabel('Outcome', { exact: true }).selectOption('conflict');
  await expect.poll(() => intercepted).toBe(true);
  await page.getByLabel('Outcome', { exact: true }).selectOption('matched');
  await expect(page.getByText('12 records', { exact: true })).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'Case-1', exact: true })).toBeVisible();
  await expect(page.getByText('12 records', { exact: true })).toBeVisible();
});

test('failed queue load clears actionable records and reload recovers', async ({ page }) => {
  let fail = true;
  await setup(page, { queue: async route => {
    if (!fail) return false;
    await route.fulfill({ status: 403, json: { message: 'Access revoked' } });
    return true;
  } });
  await expect(page.getByRole('alert')).toContainText('Access revoked');
  await expect(page.getByRole('button', { name: 'Record decision', exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Reload reconciliations' }).click();
  await expect(page.getByText('23 records', { exact: true })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`queue fits and remains usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await expect(page.getByRole('heading', { name: 'Case-1', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`queue-${width}.png`), fullPage: true });
  });
}