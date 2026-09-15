// Local review harness for the actual application. No alternate UI or backend.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 5184, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  localStorage.setItem('userInfo', JSON.stringify({ name: 'Synthetic UI reviewer', role: 'user' }));
  localStorage.setItem('theme', 'light');
  addEventListener('DOMContentLoaded', () => {
    const label = document.createElement('div');
    label.textContent = 'LOCAL UI REVIEW · SYNTHETIC DATA · API WRITES BLOCKED';
    Object.assign(label.style, { position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: '99999', padding: '8px', textAlign: 'center', background: '#78350f', color: 'white', font: '12px system-ui' });
    document.body.append(label);
  });
});
const docs = [
  ['Monthly production — sample.xlsx', 'completed', 'xlsx'],
  ['Geological notes — sample.pdf', 'extracted', 'pdf'],
  ['Scan awaiting correction — sample.pdf', 'failed', 'pdf']
].map(([originalName, status, fileType], index) => ({ _id: `sample-${index}`, originalName, status, fileType, fileSize: 24576, uploadedAt: '2026-08-01T09:00:00Z' }));
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://127.0.0.1:5184') return route.abort();
  if (url.pathname.startsWith('/uploads')) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  if (route.request().method() !== 'GET') return route.fulfill({ status: 403, json: { message: 'Writes disabled in local UI review.' } });
  if (url.pathname === '/api/v1/command-centre/overview') {
    return route.fulfill({ json: { data: {
      stats: { docsProcessed: { value: 2 }, openIssues: { value: 0 }, reportsGenerated: { value: 0 } },
      systemMetrics: { failedDocuments: 1 }
    } } });
  }
  if (url.pathname.endsWith('/documents')) {
    const results = docs.filter(doc => (!url.searchParams.get('status') || doc.status === url.searchParams.get('status')) && (!url.searchParams.get('type') || doc.fileType === url.searchParams.get('type')) && doc.originalName.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase()));
    return route.fulfill({ json: { data: results } });
  }
  return route.fulfill({ json: { data: [] } });
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:5184/dashboard');
await page.getByRole('heading', { name: 'My Dashboard', exact: true }).waitFor();
const commandPage = await context.newPage();
await commandPage.goto('http://127.0.0.1:5184/command-center');
await commandPage.getByRole('heading', { name: 'Command Center', exact: true }).waitFor();
console.log(`Actual Dashboard and Command Center opened in isolated Chromium. PID: ${process.pid}. Use this browser window; API interception is context-local.`);
browser.on('disconnected', async () => { await server.close(); process.exit(0); });
