import { test, expect } from '@playwright/test';

const docId = '111111111111111111111111';
const otherId = '222222222222222222222222';
const alice = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const bob = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const paused = 'cccccccccccccccccccccccc';
const source = id => ({ _id: id, originalName: id === docId ? 'Production.xlsx' : 'Dispatch.xlsx',
  status: 'completed', fileType: 'xlsx', fileSize: 1200, uploadedAt: '2026-09-16T09:00:00Z' });
const users = [
  { _id: alice, username: 'Alice', department: 'Operations', role: 'reviewer', status: 'active' },
  { _id: bob, username: 'Bob', role: 'reviewer', status: 'active' },
  { _id: paused, username: 'Paused reviewer', role: 'reviewer', status: 'suspended' },
  { _id: 'dddddddddddddddddddddddd', username: 'Ordinary user', role: 'user', status: 'active' }
];
const dialog = page => page.getByRole('dialog', { name: 'Assign reviewers', exact: true });
const openDialog = page => page.getByRole('button', { name: 'Assign reviewers for Production.xlsx', exact: true }).click();

async function setup(page, options = {}) {
  const state = { assignments: options.assignments ?? [alice], puts: [], userRequests: 0 };
  await page.addInitScript(role => localStorage.setItem('userInfo', JSON.stringify({ name: 'Test actor', role, token: 'mock-token' })), options.role || 'admin');
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4179') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/documents') return route.fulfill({ json: { success: true, data: [source(docId), source(otherId)] } });
    if (url.pathname === '/api/v1/admin/users') {
      state.userRequests++;
      if (options.loadUsers) return options.loadUsers(route);
      return route.fulfill({ json: { success: true, data: options.users ?? users } });
    }
    if (url.pathname.endsWith('/reviewers') && route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON();
      state.puts.push(payload);
      if (options.save) return options.save(route, payload, state);
      state.assignments = payload.reviewerIds;
      return route.fulfill({ json: { success: true, data: { documentId: docId, reviewerIds: state.assignments } } });
    }
    if ([`/api/v1/documents/${docId}`, `/api/v1/documents/${otherId}`].includes(url.pathname)) {
      const id = url.pathname.split('/').at(-1);
      if (options.loadDocument) return options.loadDocument(route, id, state);
      return route.fulfill({ json: { success: true, data: { document: { ...source(id), reviewerIds: id === docId ? state.assignments : [bob] } } } });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
  await page.goto('/dashboard');
  return state;
}

test('admin loads current assignments, searches, saves and explicitly clears', async ({ page }) => {
  const state = await setup(page);
  await openDialog(page);
  const modal = dialog(page);
  await expect(modal.getByRole('checkbox', { name: /Alice/ })).toBeChecked();
  await expect(modal.getByRole('checkbox', { name: /Paused|Ordinary/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Save assignments', exact: true })).toBeDisabled();
  await modal.getByLabel('Search reviewers').fill('Bob');
  await modal.getByRole('checkbox', { name: 'Bob', exact: true }).check();
  await expect(modal.getByText('2 / 100 selected')).toBeVisible();
  await modal.getByRole('button', { name: 'Save assignments', exact: true }).click();
  await expect(modal.getByRole('status')).toHaveText('Reviewer assignments saved (2).');
  expect(state.puts).toEqual([{ reviewerIds: [alice, bob] }]);
  await modal.getByRole('button', { name: 'Clear selection' }).click();
  await expect(modal.getByText('Saving will remove all delegated reviewers from this document.')).toBeVisible();
  await modal.getByRole('button', { name: 'Save assignments', exact: true }).click();
  await expect(modal.getByRole('status')).toHaveText('All reviewer assignments removed.');
  expect(state.puts.at(-1)).toEqual({ reviewerIds: [] });
});

for (const role of ['user', 'reviewer', 'official']) {
  test(`${role} has no assignment control or admin user-list request`, async ({ page }) => {
    const state = await setup(page, { role });
    await expect(page.getByRole('heading', { name: 'My Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Assign reviewers for/ })).toHaveCount(0);
    expect(state.userRequests).toBe(0);
    expect(state.puts).toEqual([]);
  });
}

test('unavailable assignments require explicit removal; untrusted names render as text', async ({ page }) => {
  const name = '<img src=x onerror=alert(1)>';
  const missing = 'ffffffffffffffffffffffff';
  await setup(page, { assignments: [alice, paused, missing], users: [...users, { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', username: name, role: 'reviewer', status: 'active' }] });
  await openDialog(page);
  const modal = dialog(page);
  await expect(modal.getByRole('alert')).toContainText('Remove unavailable assignments');
  await expect(modal.getByText(name, { exact: true })).toBeVisible();
  await expect(modal.locator('img')).toHaveCount(0);
  await modal.getByRole('checkbox', { name: /Bob/ }).check();
  await expect(modal.getByRole('button', { name: 'Save assignments', exact: true })).toBeDisabled();
  const unavailable = modal.getByRole('checkbox', { name: /Paused reviewer/ });
  await unavailable.uncheck();
  await expect(unavailable).toBeDisabled();
  await modal.getByRole('checkbox', { name: /Unavailable reviewer/ }).uncheck();
  await modal.getByRole('button', { name: 'Save assignments', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('saved (2)');
});

for (const malformed of [false, true]) {
  test(`failed or malformed load blocks saving and reload recovers (${malformed})`, async ({ page }) => {
    let fail = true;
    const state = await setup(page, { loadUsers: route => fail
      ? route.fulfill({ status: malformed ? 200 : 403, json: malformed ? { data: {} } : { message: 'Admin access denied' } })
      : route.fulfill({ json: { success: true, data: users } }) });
    await openDialog(page);
    const modal = dialog(page);
    await expect(modal.getByRole('alert')).toContainText('Could not load assignments');
    await expect(modal.getByRole('button', { name: 'Save assignments', exact: true })).toBeDisabled();
    expect(state.puts).toEqual([]);
    fail = false;
    await modal.getByRole('button', { name: 'Reload assignments' }).click();
    await expect(modal.getByRole('checkbox', { name: /Alice/ })).toBeChecked();
    await expect(modal.getByRole('alert')).toHaveCount(0);
  });
}

test('missing assignment metadata is an error, never an empty saved list', async ({ page }) => {
  const state = await setup(page, { loadDocument: (route, id) => route.fulfill({ json: { data: { document: source(id) } } }) });
  await openDialog(page);
  await expect(dialog(page).getByRole('alert')).toContainText('Unexpected reviewer assignments response');
  await expect(dialog(page).getByRole('button', { name: 'Save assignments', exact: true })).toBeDisabled();
  expect(state.puts).toEqual([]);
});

test('pending save suppresses duplicate submits and prevents Escape dismissal', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const state = await setup(page, { save: async (route, payload) => {
    await held;
    await route.fulfill({ json: { success: true, data: { documentId: docId, reviewerIds: payload.reviewerIds } } });
  } });
  await openDialog(page);
  const modal = dialog(page);
  await modal.getByRole('checkbox', { name: 'Bob', exact: true }).check();
  await modal.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await expect(modal.getByRole('button', { name: 'Saving assignments...' })).toBeDisabled();
  await expect.poll(() => state.puts.length).toBe(1);
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  release();
  await expect(modal.getByRole('status')).toContainText('saved (2)');
  expect(state.puts.length).toBe(1);
});

for (const malformed of [false, true]) {
  test(`denied or unconfirmed save cannot report success; reload required (${malformed})`, async ({ page }) => {
    const state = await setup(page, { save: route => route.fulfill({ status: malformed ? 200 : 403,
      json: malformed ? { success: true, data: { documentId: docId, reviewerIds: [] } } : { message: 'Admin permission revoked' } }) });
    await openDialog(page);
    const modal = dialog(page);
    await modal.getByRole('checkbox', { name: 'Bob', exact: true }).check();
    await modal.getByRole('button', { name: 'Save assignments', exact: true }).click();
    await expect(modal.getByRole('alert')).toContainText('Save not confirmed');
    await expect(modal.getByRole('status')).toHaveCount(0);
    await expect(modal.getByRole('button', { name: 'Save assignments', exact: true })).toBeDisabled();
    expect(state.puts.length).toBe(1);
    await modal.getByRole('button', { name: 'Reload assignments' }).click();
    await expect(modal.getByRole('checkbox', { name: 'Bob', exact: true })).not.toBeChecked();
    await expect(modal.getByRole('checkbox', { name: /Alice/ })).toBeChecked();
  });
}

test('closing during a delayed load cannot overwrite another document dialog', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await setup(page, { loadDocument: async (route, id) => {
    if (id === docId) await held;
    await route.fulfill({ json: { data: { document: { ...source(id), reviewerIds: id === docId ? [alice] : [bob] } } } });
  } });
  await openDialog(page);
  await expect(dialog(page).getByRole('status')).toHaveText('Loading assignments...');
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Assign reviewers for Dispatch.xlsx', exact: true }).click();
  await expect(dialog(page).getByRole('checkbox', { name: 'Bob', exact: true })).toBeChecked();
  release();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(dialog(page).getByText('Dispatch.xlsx', { exact: true })).toBeVisible();
  await expect(dialog(page).getByRole('checkbox', { name: /Alice/ })).not.toBeChecked();
});

test('100 reviewer selection limit allows removal but prevents new selection', async ({ page }) => {
  const candidates = Array.from({ length: 101 }, (_, index) => ({ _id: (index + 1).toString(16).padStart(24, '0'),
    username: `Reviewer ${index}`, role: 'reviewer', status: 'active' }));
  await setup(page, { assignments: candidates.slice(0, 100).map(user => user._id), users: candidates });
  await openDialog(page);
  const modal = dialog(page);
  await expect(modal.getByText('100 / 100 selected')).toBeVisible();
  await expect(modal.getByRole('checkbox', { name: 'Reviewer 100', exact: true })).toBeDisabled();
  await modal.getByRole('checkbox', { name: 'Reviewer 0', exact: true }).uncheck();
  await expect(modal.getByRole('checkbox', { name: 'Reviewer 100', exact: true })).toBeEnabled();
});

test('reopening discards unsaved changes and fetches current assignments', async ({ page }) => {
  const state = await setup(page);
  await openDialog(page);
  await dialog(page).getByRole('checkbox', { name: 'Bob', exact: true }).check();
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.puts).toEqual([]);
  state.assignments = [bob];
  await openDialog(page);
  await expect(dialog(page).getByRole('checkbox', { name: /Alice/ })).not.toBeChecked();
  await expect(dialog(page).getByRole('checkbox', { name: 'Bob', exact: true })).toBeChecked();
  expect(state.userRequests).toBe(2);
});

test('empty reviewer list remains usable without enabling a no-op save', async ({ page }) => {
  const state = await setup(page, { assignments: [], users: [] });
  await openDialog(page);
  await expect(dialog(page).getByText('No active reviewers available.')).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Save assignments', exact: true })).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.puts).toEqual([]);
});

test('lost save response requires reload even when server applied the update', async ({ page }) => {
  const state = await setup(page, { save: (route, payload, current) => {
    current.assignments = payload.reviewerIds;
    return route.abort('failed');
  } });
  await openDialog(page);
  await dialog(page).getByRole('checkbox', { name: 'Bob', exact: true }).check();
  await dialog(page).getByRole('button', { name: 'Save assignments', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Save not confirmed');
  await expect(dialog(page).getByRole('button', { name: 'Save assignments', exact: true })).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Reload assignments' }).click();
  await expect(dialog(page).getByRole('checkbox', { name: 'Bob', exact: true })).toBeChecked();
  await expect(dialog(page).getByRole('status')).toHaveCount(0);
  expect(state.puts).toHaveLength(1);
});

for (const width of [390, 1440]) {
  test(`assignment dialog supports keyboard and fits ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await expect(page.getByRole('button', { name: 'Assign reviewers for Production.xlsx', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
    await openDialog(page);
    const modal = dialog(page);
    await expect(modal.getByRole('checkbox', { name: /Alice/ })).toBeChecked();
    expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await modal.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`assignments-${width}.png`), fullPage: true });
    await modal.getByRole('button', { name: 'Cancel', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(modal.getByRole('button', { name: 'Close reviewer assignments' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Assign reviewers for Production.xlsx', exact: true })).toBeFocused();
  });
}