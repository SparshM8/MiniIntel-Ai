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

for (const [action, title] of [['approve', 'Approval'], ['reject', 'Rejection']]) {
  test(`${action} failure shows an alert without inventing status`, async ({ page }) => {
    await openReview(page, { [`/api/v1/extraction/records/record-a/${action}`]: route =>
      route.fulfill({ status: 500, json: { error: 'Synthetic failure' } }) });
    await page.getByTitle(action === 'approve' ? 'Approve' : 'Reject', { exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(`${title} was not confirmed`);
    await expect(page.getByText('pending', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload records' })).toBeEnabled();
  });
}

test('bulk failure preserves selection and pending request blocks conflicting actions', async ({ page }) => {
  let release;
  let attempts = 0;
  const held = new Promise(resolve => { release = resolve; });
  await openReview(page, { '/api/v1/extraction/records/bulk-approve': async route => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ ids: ['record-a'] });
    await held;
    await route.fulfill({ status: 500, json: { error: 'Synthetic failure' } });
  } });
  const selection = page.getByRole('checkbox', { name: 'Select Coal Production' });
  await selection.check();
  const bulk = page.getByRole('button', { name: 'Approve Selected (1)', exact: true });
  await bulk.click();
  await expect(bulk).toBeDisabled();
  await expect(page.getByTitle('Reject', { exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Extract Data' })).toBeDisabled();
  release();
  await expect(page.getByRole('alert')).toContainText('Bulk approval was not confirmed');
  await expect(selection).toBeChecked();
  await expect(bulk).toBeEnabled();
  expect(attempts).toBe(1);
});

test('completed action with failed refresh warns and reload does not repeat mutation', async ({ page }) => {
  let reads = 0;
  let mutations = 0;
  await openReview(page, {
    '/api/v1/extraction/records/record-a/approve': route => { mutations++; return route.fulfill({ json: {} }); },
    '/api/v1/extraction/doc-a': route => {
      reads++;
      return reads === 2 ? route.fulfill({ status: 500, json: {} })
        : route.fulfill({ json: [{ ...fact, status: reads > 2 ? 'approved' : 'pending' }] });
    }
  });
  await page.getByTitle('Approve', { exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('status refresh failed');
  await page.getByRole('button', { name: 'Reload records' }).click();
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  expect(mutations).toBe(1);
});

test('bulk success uses returned records and clears selection', async ({ page }) => {
  let completed = false;
  await openReview(page, {
    '/api/v1/extraction/records/bulk-approve': route => { completed = true; return route.fulfill({ json: {
      requestedCount: 1, matchedCount: 1, modifiedCount: 1, unmatchedCount: 0
    } }); },
    '/api/v1/extraction/doc-a': route => route.fulfill({ json: [{ ...fact, status: completed ? 'approved' : 'pending' }] })
  });
  await page.getByRole('checkbox', { name: 'Select Coal Production' }).check();
  await page.getByRole('button', { name: 'Approve Selected (1)', exact: true }).click();
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve Selected (0)', exact: true })).toBeDisabled();
});

for (const [name, result, message] of [
  ['unmatched', { requestedCount: 1, matchedCount: 0, modifiedCount: 0, unmatchedCount: 1 }, '1 unmatched'],
  ['legacy', { message: 'Records approved successfully' }, 'counts unavailable']
]) {
  test(`bulk ${name} result warns instead of clearing selection`, async ({ page }) => {
    await openReview(page, { '/api/v1/extraction/records/bulk-approve': route => route.fulfill({ json: result }) });
    const checkbox = page.getByRole('checkbox', { name: 'Select Coal Production' });
    await checkbox.check();
    await page.getByRole('button', { name: 'Approve Selected (1)', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(checkbox).toBeChecked();
  });
}

test('save deadline unlocks draft and read-only server check does not resubmit', async ({ page }) => {
  let writes = 0;
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  await openReview(page, { '/api/v1/extraction/records/record-a': () => { writes++; started(); } });
  await page.clock.install();
  await page.getByTitle('Edit', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Value', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await requested;
  await page.clock.fastForward(30001);
  await expect(dialog.getByRole('alert')).toContainText('server may still complete');
  await expect(dialog.getByLabel('Value', { exact: true })).toHaveValue('10');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Check current server record' }).click();
  await expect(dialog.getByRole('status')).toContainText('Current server snapshot: 0 tonnes');
  await expect(dialog.getByLabel('Value', { exact: true })).toHaveValue('10');
  expect(writes).toBe(1);
});

test('approval deadline restores controls and offers read-only recovery', async ({ page }) => {
  let writes = 0;
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  await openReview(page, { '/api/v1/extraction/records/record-a/approve': () => { writes++; started(); } });
  await page.clock.install();
  await page.getByTitle('Approve', { exact: true }).click();
  await requested;
  await page.clock.fastForward(30001);
  await expect(page.getByRole('alert')).toContainText('server may still complete');
  await expect(page.getByRole('combobox')).toBeEnabled();
  await page.getByRole('button', { name: 'Reload records' }).click();
  await expect(page.getByText('pending', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test('failed document switch does not leave previous evidence visible', async ({ page }) => {
  await openReview(page, { '/api/v1/extraction/doc-b': route => route.fulfill({ status: 500, json: { error: 'Synthetic failure' } }) });
  await expect(page.locator('summary')).toHaveCount(1);
  await page.getByRole('combobox').selectOption('doc-b');
  await expect(page.getByText(/Failed to load records:/)).toBeVisible();
  await expect(page.locator('summary')).toHaveCount(0);
});
