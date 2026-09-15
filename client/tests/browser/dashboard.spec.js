import { test, expect } from '@playwright/test';

const docs = ['completed', 'extracted', 'failed'].map((status, index) => ({
  _id: `sample-${index}`, originalName: `Sample ${index}.xlsx`, status,
  fileType: 'xlsx', fileSize: 1200, uploadedAt: '2026-08-01T09:00:00Z'
}));
async function open(page, documentsHandler) {
  await page.addInitScript(() => localStorage.setItem('userInfo', JSON.stringify({ name: 'Sample reviewer', role: 'user' })));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4179') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/documents') return documentsHandler(route, url);
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/dashboard');
}
const card = (page, name) => page.getByRole('region', { name, exact: true });

test('dashboard shows scoped counts, guidance and filtered results without invented insights', async ({ page }) => {
  await open(page, (route, url) => route.fulfill({ json: { data: url.searchParams.get('status') === 'failed' ? [docs[2]] : docs } }));
  await expect(card(page, 'Documents in view').getByText('3', { exact: true })).toBeVisible();
  await expect(card(page, 'Processed').getByText('2', { exact: true })).toBeVisible();
  await expect(card(page, 'Failed processing').getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByText(/not organization-wide totals/)).toBeVisible();
  await expect(page.getByText(/98%|\+12%|Mine Alpha|100% data integrity|No manual review needed/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open extraction review' })).toHaveAttribute('href', '/extraction');
  await page.getByRole('combobox', { name: 'Processing status' }).selectOption('failed');
  await expect(card(page, 'Documents in view').getByText('1', { exact: true })).toBeVisible();
  await expect(card(page, 'Processed').getByText('0', { exact: true })).toBeVisible();
});

for (const malformed of [false, true]) {
  test(`failed or malformed list is unavailable, not zero; reload recovers (${malformed})`, async ({ page }) => {
    let fail = true;
    await open(page, route => fail ? route.fulfill({ status: malformed ? 200 : 500, json: {} }) : route.fulfill({ json: { data: [] } }));
    await expect(page.getByRole('alert')).toContainText('Counts are unavailable');
    await expect(card(page, 'Documents in view').getByText('Unavailable', { exact: true })).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Reload documents' }).click();
    await expect(card(page, 'Documents in view').getByText('0', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('late initial response cannot replace newer filtered documents', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await open(page, async (route, url) => {
    if (!url.searchParams.get('status')) await held;
    return route.fulfill({ json: { data: url.searchParams.get('status') ? [docs[2]] : docs } });
  });
  await expect(card(page, 'Documents in view').getByText('Loading…')).toBeVisible();
  await page.getByRole('combobox', { name: 'Processing status' }).selectOption('failed');
  await expect(card(page, 'Documents in view').getByText('1', { exact: true })).toBeVisible();
  const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/v1/documents' && !new URL(res.url()).searchParams.get('status'));
  release();
  await response;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(card(page, 'Documents in view').getByText('1', { exact: true })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`existing dashboard captures at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, route => route.fulfill({ json: { data: docs } }));
    await expect(card(page, 'Documents in view').getByText('3', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
  });
}
