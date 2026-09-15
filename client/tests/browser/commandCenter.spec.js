import { test, expect } from '@playwright/test';

async function open(page, overview, task = route => route.fulfill({ json: { data: {} } })) {
  await page.addInitScript(() => localStorage.setItem('userInfo', JSON.stringify({ name: 'Sample reviewer', role: 'user' })));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4179') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/command-centre/overview') return overview(route);
    if (url.pathname === '/api/v1/agents/orchestrate') return task(route);
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/command-center');
}
const payload = { data: { stats: { docsProcessed: { value: 0 }, openIssues: { value: 2 }, reportsGenerated: { value: 0 }, validationScore: { value: 98.5 } }, systemMetrics: { failedDocuments: 1 } } };

test('reads real nested contract and preserves zeros without displaying validation score', async ({ page }) => {
  await open(page, route => route.fulfill({ json: payload }));
  await expect(page.getByRole('region', { name: 'Docs Processed', exact: true }).getByText('0', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Failed Documents', exact: true }).getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByText(/98.5%|1,248|Validation Score/)).toHaveCount(0);
});

test('overview failure and partial response never invent counts', async ({ page }) => {
  let fail = true;
  await open(page, route => fail ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: { data: { stats: {} } } }));
  await expect(page.getByRole('alert')).toContainText('No estimated counts');
  await expect(page.getByText('Unavailable', { exact: true })).toHaveCount(4);
  fail = false;
  await page.getByRole('button', { name: 'Reload overview' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Unavailable', { exact: true })).toHaveCount(4);
});

test('duplicate task submission is blocked and empty response does not claim completion', async ({ page }) => {
  let requests = 0;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await open(page, route => route.fulfill({ json: payload }), async route => { requests++; await held; return route.fulfill({ json: { data: {} } }); });
  await page.getByLabel('New Task Assignment').fill('Summarize sample documents');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled();
  await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  release();
  await expect(page.getByRole('status')).toContainText('Completion has not been verified');
  expect(requests).toBe(1);
});

test('mobile layout fits and captures current command center', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, route => route.fulfill({ json: payload }));
  await expect(page.getByRole('region', { name: 'Docs Processed', exact: true }).getByText('0', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('command-center-mobile.png'), fullPage: true });
});
