import { test, expect } from '@playwright/test';

const fact = {
  _id: 'record-a', documentId: 'doc-a', parameter: 'Coal Production', value: '0', originalValue: '0',
  unit: 'tonnes', period: 'FY 2025-26', mineName: 'Synthetic Mine', status: 'pending',
  sourceText: '<img src=x onerror="window.evidenceInjected=true">',
  cellReference: { kind: 'spreadsheet_sheet', sheetName: 'Production', cellAddress: 'B2',
    status: 'value_matched', matchedValue: '0', reason: 'semantic_review_required' }
};

async function openReview(page, handlers = {}) {
  await page.addInitScript(() => localStorage.setItem('userInfo', JSON.stringify({ name: 'Synthetic Reviewer', role: 'user' })));
  // All nonlocal requests are blocked; no live backend/provider is contacted.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4179') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (handlers[url.pathname]) return handlers[url.pathname](route);
    if (url.pathname === '/api/v1/documents') return route.fulfill({ json: { data: [
      { _id: 'doc-a', originalName: 'Synthetic A.xlsx' }, { _id: 'doc-b', originalName: 'Synthetic B.xlsx' }
    ] } });
    if (url.pathname === '/api/v1/extraction/doc-a') return route.fulfill({ json: [fact] });
    if (url.pathname === '/api/v1/extraction/doc-b') return route.fulfill({ json: [] });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/extraction');
  await page.getByRole('combobox').selectOption('doc-a');
}

test('keyboard disclosure renders source text without executing HTML', async ({ page }) => {
  await openReview(page);
  const summary = page.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Sheet: Production; Cell: B2')).toBeVisible();
  await expect(page.locator('pre')).toHaveText(fact.sourceText);
  await expect(page.locator('pre img')).toHaveCount(0);
  expect(await page.evaluate(() => window.evidenceInjected)).toBeUndefined();
  await page.keyboard.press('Enter');
  await expect(page.locator('pre')).toBeHidden();
});

test('unsaved edit removes matched citation and cancel leaves original untouched', async ({ page }) => {
  await openReview(page);
  await page.getByTitle('Edit', { exact: true }).click();
  const form = page.locator('form');
  await form.locator('summary').click();
  await expect(form.locator('input[name="value"]')).toHaveValue('0');
  await form.locator('input[name="value"]').fill('10');
  await expect(form.getByText('Reason: record value changed')).toBeVisible();
  await expect(form.getByText('Sheet: Production; Cell: unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('form')).toHaveCount(0);
  await page.locator('summary').click();
  await expect(page.getByText('Sheet: Production; Cell: B2')).toBeVisible();
});

test('late response from an old document cannot replace the current records', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  await openReview(page, { '/api/v1/extraction/doc-a': async route => {
    started();
    await held;
    await route.fulfill({ json: [fact] });
  } });
  await requested;
  await page.getByRole('combobox').selectOption('doc-b');
  await expect(page.getByText(/No records extracted yet/)).toBeVisible();
  const response = page.waitForResponse('**/extraction/doc-a');
  release();
  await response;
  // Allow response handlers and the following paint to run without an arbitrary sleep.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('summary')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveValue('doc-b');
});

test('dialog traps keyboard focus and Escape restores the edit button', async ({ page }) => {
  await openReview(page);
  const edit = page.getByTitle('Edit', { exact: true });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Edit Extracted Record' });
  await expect(dialog.getByLabel('Value', { exact: true })).toBeFocused();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test('failed save retains draft and permits a successful retry', async ({ page }) => {
  let attempts = 0;
  await openReview(page, { '/api/v1/extraction/records/record-a': route => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ value: '10', unit: 'tonnes' });
    return attempts === 1
      ? route.fulfill({ status: 500, json: { error: 'Synthetic save failure' } })
      : route.fulfill({ json: { ...fact, value: '10' } });
  } });
  await page.getByTitle('Edit', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Value', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Save was not confirmed');
  await expect(dialog.getByLabel('Value', { exact: true })).toHaveValue('10');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Record changes saved.')).toBeVisible();
  await page.locator('summary').click();
  await expect(page.getByText('Reason: record value changed')).toBeVisible();
  expect(attempts).toBe(2);
});

test('pending save blocks duplicate submission and dismissal', async ({ page }) => {
  let release;
  let requests = 0;
  const held = new Promise(resolve => { release = resolve; });
  await openReview(page, { '/api/v1/extraction/records/record-a': async route => {
    requests++;
    await held;
    await route.fulfill({ json: fact });
  } });
  await page.getByTitle('Edit', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  release();
  await expect(dialog).toHaveCount(0);
  expect(requests).toBe(1);
});

test('failed document switch does not leave previous evidence visible', async ({ page }) => {
  await openReview(page, { '/api/v1/extraction/doc-b': route => route.fulfill({ status: 500, json: { error: 'Synthetic failure' } }) });
  await expect(page.locator('summary')).toHaveCount(1);
  await page.getByRole('combobox').selectOption('doc-b');
  await expect(page.getByText(/Failed to load records:/)).toBeVisible();
  await expect(page.locator('summary')).toHaveCount(0);
});
