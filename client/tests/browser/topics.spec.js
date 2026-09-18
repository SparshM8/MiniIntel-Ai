import { test, expect } from '@playwright/test';

const overview = {
  success: true,
  data: [{ _id: 'safety', name: 'Safety', documentCount: 2 }],
  meta: { topicCount: 1, analyzedDocuments: 2, processedDocuments: 3 },
  wordCloud: [{ text: 'coal', count: 12, documentCount: 3 }, { text: 'safety', count: 4, documentCount: 2 }, { text: 'hydrogeologicalcharacterization', count: 1, documentCount: 1 }]
};

async function openTopics(page, handler) {
  await page.addInitScript(() => localStorage.setItem('userInfo', JSON.stringify({ name: 'Test user', role: 'user' })));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4179') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/topics') return handler(route);
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/topics');
}

for (const width of [390, 1440]) {
  test(`topic cloud, counts, search and table at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await openTopics(page, route => route.fulfill({ json: overview }));
    await expect(page.getByRole('region', { name: 'Processed documents', exact: true })).toContainText('3');
    await expect(page.getByRole('region', { name: 'Documents with topics', exact: true })).toContainText('2');
    await page.getByRole('button', { name: 'coal: 12 occurrences in 3 documents', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Search evidence' })).toHaveAttribute('href', '/knowledge-base?q=coal');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`topics-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Word frequencies', exact: true }).click();
    await expect(page.getByRole('table')).toContainText('12');
    await page.getByRole('textbox', { name: 'Filter topics and words' }).fill('safety');
    await expect(page.getByRole('table').getByText('coal', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('table').getByText('safety', { exact: true })).toBeVisible();
  });
}

test('malformed data is unavailable, not zero; reload recovers empty state', async ({ page }) => {
  let payload = {};
  await openTopics(page, route => route.fulfill({ json: payload }));
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Processed documents', exact: true })).toContainText('Unavailable');
  payload = { data: [], wordCloud: [], meta: { topicCount: 0, analyzedDocuments: 0, processedDocuments: 0 } };
  await page.getByRole('button', { name: 'Reload topics' }).click();
  await expect(page.getByText('No processed document text available.')).toBeVisible();
  await expect(page.getByText('No topics discovered yet.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});