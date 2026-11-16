import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// Spike: service-worker update flow and IndexedDB schema upgrade with an old tab still open.
// A switchable static server stands in for "deploy v2 while a user has v1 open".
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
let root = 'dist-v1';
let server: Server;
const PORT = 4175;
const base = `http://localhost:${PORT}`;

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url!, 'http://x').pathname));
      let file = join(root, p);
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('nf'); }
  }).listen(PORT);
});
test.afterAll(() => server.close());

test('v1 open tab survives deploy of v2 (SW update + Dexie schema upgrade)', async ({ browser }) => {
  const report: Record<string, unknown> = {};
  const context = await browser.newContext();
  root = 'dist-v1';
  const tab1 = await context.newPage();
  const errors: string[] = [];
  tab1.on('pageerror', (e) => errors.push(e.message));
  await tab1.goto(base + '/');
  await expect(tab1.getByTestId('sw-state')).toHaveText('ready', { timeout: 15_000 });
  await tab1.reload();
  await expect.poll(() => tab1.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await tab1.getByTestId('name').fill('Before update');
  await tab1.getByTestId('add').click();
  await expect(tab1.getByTestId('count')).toHaveText('1');
  const v1Cache = await tab1.evaluate(async () => (await caches.keys()));
  report.v1Cache = v1Cache;

  // ---- deploy v2 while tab1 (v1 JS in memory, DB connection open) stays open
  root = 'dist-v2';
  const swChange = await tab1.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const changed = new Promise<string>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve('controllerchange fired (new SW took over the open v1 tab)'));
      setTimeout(() => resolve('no controllerchange in 8s'), 8000);
    });
    await reg.update();
    return changed;
  });
  report.swTakeover = swChange;
  report.cachesAfterUpdate = await tab1.evaluate(async () => (await caches.keys()));
  report.tab1StillShowsV1Heading = await tab1.getByRole('heading').first().textContent();

  // ---- open a v2 tab: Dexie upgrades the schema 1 -> 2 while tab1 holds a v1 connection
  const tab2 = await context.newPage();
  await tab2.goto(base + '/');
  await expect(tab2.getByRole('heading', { name: 'TailorPro offline spike v2' })).toBeVisible();
  await expect(tab2.getByTestId('count')).toHaveText('1', { timeout: 10_000 });
  report.v2SeesV1Data = true;
  report.idbVersionSeenByV2Tab = await tab2.evaluate(async () => (await indexedDB.databases()).find((d) => d.name === 'tailorpro-spike')?.version);
  report.customerIndexesAfterUpgrade = await tab2.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('tailorpro-spike');
    r.onsuccess = () => { const t = r.result.transaction('customers'); const names = Array.from(t.objectStore('customers').indexNames); r.result.close(); res(names); };
  }));

  // ---- the old tab (v1 code) now tries to save a customer
  await tab1.getByTestId('name').fill('Written from OLD tab after upgrade');
  await tab1.getByTestId('add').click();
  await tab1.waitForTimeout(1500);
  const tab1Count = await tab1.getByTestId('count').textContent();
  const tab1Pending = await tab1.getByTestId('pending').textContent();
  await tab2.reload();
  const tab2Count = await tab2.getByTestId('count').textContent();
  const tab2Pending = await tab2.getByTestId('pending').textContent();
  report.oldTabUI = { count: tab1Count, pending: tab1Pending };
  report.freshTabAfterOldTabWrite = { count: tab2Count, pending: tab2Pending };
  report.oldTabErrors = errors;

  // ---- offline cold start on the new version
  await context.setOffline(true);
  const tab3 = await context.newPage();
  await tab3.goto(base + '/customers/');
  await expect(tab3.getByTestId('list')).toContainText('Before update');
  report.offlineAfterUpdate = 'ok: v2 shell served offline, data intact';

  console.log('UPDATE-SPIKE-REPORT ' + JSON.stringify(report, null, 2));
  await context.close();
});
