// Offline-first acceptance for Phase 1 (PHASE1_PLAN section 5, items 5 and 6): the app shell opens offline and shows the
// cached business and profile; an update never takes over silently; local data survives.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { seedUserWithBusiness } from '../integration/helpers';
import { isControlled, signInWithCode, swReady } from './helpers';

async function controlled(page: Page) {
  await expect.poll(() => isControlled(page), { timeout: 20_000 }).toBe(true);
}

/** Signs in online, saves a profile name, and waits until the service worker controls the page. */
async function signInAndWarm(page: Page, label: string, business: string) {
  const { email } = await seedUserWithBusiness(label, business);
  await signInWithCode(page, email);
  await expect(page.getByRole('heading', { name: business })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Your name').fill('Chikondi Mwale');
  await page.getByLabel('Phone number').fill('+265 888 555 111');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: business })).toBeVisible();
  await swReady(page);
  await page.reload(); // the first load installs the worker; once it is ready, a reload puts the page under its control
  await controlled(page);
  await expect(page.getByRole('heading', { name: business })).toBeVisible();
}

async function goOffline(context: BrowserContext) { await context.setOffline(true); }

test('after one online visit the app opens offline with the cached business and profile', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAndWarm(page, 'offline1', 'Offline Tailors');
  await goOffline(context);

  const cold = await context.newPage(); // cold start: a brand-new page with no network
  await cold.goto('/app/');
  await expect(cold.getByRole('heading', { name: 'Offline Tailors' })).toBeVisible();
  await expect(cold.getByText('Tailoring shop in Blantyre')).toBeVisible();
  await expect(cold.getByText('Offline. Showing saved data.')).toBeVisible();
  await expect(cold.getByText('Business created')).toBeVisible(); // recent activity comes from the device cache

  await cold.getByRole('link', { name: 'Settings' }).click();
  await expect(cold.getByLabel('Your name')).toHaveValue('Chikondi Mwale');
  await expect(cold.getByLabel('Phone number')).toHaveValue('+265888555111');

  // opening the root offline still routes a signed-in user to the app
  await cold.goto('/');
  await expect(cold.getByRole('heading', { name: 'Offline Tailors' })).toBeVisible();

  // an unknown address offline gets a proper not-found page, not a browser error or the wrong screen
  await cold.goto('/app/does-not-exist/');
  await expect(cold.getByText(/page could not be found|404/i).first()).toBeVisible();

  // back online: the badge clears
  await context.setOffline(false);
  await cold.goto('/app/');
  await expect(cold.getByRole('heading', { name: 'Offline Tailors' })).toBeVisible();
  await expect(cold.getByText('Offline. Showing saved data.')).toHaveCount(0);
  await context.close();
});

test('client-side navigation after the first load requests no missing files', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAndWarm(page, 'prefetch', 'Prefetch Shop');
  const failures: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost:3000')) failures.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await page.waitForTimeout(1500); // let prefetches finish
  expect(failures).toEqual([]);
  await context.close();
});

test('an expired access token does not lock the user out while offline', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAndWarm(page, 'offline2', 'Expired Token Shop');
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'))!;
    const s = JSON.parse(localStorage.getItem(k)!);
    s.expires_at = Math.floor(Date.now() / 1000) - 3600; // an hour ago
    localStorage.setItem(k, JSON.stringify(s));
  });
  await goOffline(context);
  const cold = await context.newPage();
  await cold.goto('/app/');
  await expect(cold.getByRole('heading', { name: 'Expired Token Shop' })).toBeVisible();
  await context.close();
});

test('the sign-in page itself opens offline for a first-time visitor who has loaded it once', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/sign-in/');
  await swReady(page);
  await page.reload();
  await controlled(page);
  await goOffline(context);
  const cold = await context.newPage();
  await cold.goto('/sign-in/');
  await expect(cold.getByRole('heading', { name: 'Sign in to TailorPro' })).toBeVisible();
  // asking for a code offline gives a clear message instead of failing silently
  await cold.getByLabel('Email address').fill('someone@example.test');
  await cold.getByRole('button', { name: 'Send sign-in code' }).click();
  await expect(cold.getByText('No connection. Check your internet and try again.')).toBeVisible();
  await context.close();
});

test('signing out removes the cached business from the device', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAndWarm(page, 'offline3', 'Shared Phone Shop');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in\/$/);
  const leftovers = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const name = dbs.find((d) => d.name === 'tailorpro-local')?.name;
    if (!name) return { accounts: 0, activity: 0 };
    return new Promise<{ accounts: number; activity: number }>((resolve) => {
      const open = indexedDB.open(name);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(['accounts', 'activity']);
        const a = tx.objectStore('accounts').count();
        const b = tx.objectStore('activity').count();
        tx.oncomplete = () => { db.close(); resolve({ accounts: a.result, activity: b.result }); };
      };
    });
  });
  expect(leftovers).toEqual({ accounts: 0, activity: 0 });
  await context.close();
});

test('signing out while offline still signs out and clears the device', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAndWarm(page, 'offline4', 'Offline Signout Shop');
  await goOffline(context);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in\/$/);
  expect(await page.evaluate(() => Object.keys(localStorage).some((x) => x.startsWith('sb-') && x.endsWith('-auth-token')))).toBe(false);
  // a fresh start still shows signed-out, not the previous user's data
  const cold = await context.newPage();
  await cold.goto('/app/');
  await expect(cold).toHaveURL(/\/sign-in\/$/);
  await expect(cold.getByText('Offline Signout Shop')).toHaveCount(0);
  await context.close();
});

// ---- update flow: a switchable server stands in for "a new version was deployed while the app is open" ----
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
let server: Server;
let deployed = 1;
const PORT = 4176;
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url!, 'http://x').pathname)).replace(/\\/g, '/'); // forward slashes on every OS
      let file = join('out', p);
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      let body = await readFile(file);
      // "version 2": a changed worker with a new cache name (as any real deploy produces, since the name is a content hash)
      if (p === '/sw.js' && deployed === 2) body = Buffer.from(body.toString().replace("const CACHE = \"shell-", "const CACHE = \"shell-v2-") + '\n// deployed v2\n');
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch { res.writeHead(404); res.end('nf'); }
  }).listen(PORT);
});
test.afterAll(() => server.close());

test('a new version waits for the user: banner appears, nothing reloads by itself, reloading applies it', async ({ browser }) => {
  deployed = 1;
  const context = await browser.newContext({ baseURL: `http://localhost:${PORT}` });
  const page = await context.newPage();
  const { email } = await seedUserWithBusiness('update', 'Update Flow Shop');
  await signInWithCode(page, email);
  await expect(page.getByRole('heading', { name: 'Update Flow Shop' })).toBeVisible();
  await swReady(page);
  await page.reload();
  await controlled(page);
  await page.evaluate(() => { (window as unknown as { __marker: string }).__marker = 'old page still here'; });
  const cachesBefore = await page.evaluate(() => caches.keys());
  expect(cachesBefore).toHaveLength(1);
  await expect(page.getByText('A new version is ready.')).toHaveCount(0);

  deployed = 2;
  await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; await reg.update(); });

  await expect(page.getByText('A new version is ready.')).toBeVisible({ timeout: 15_000 });
  // nothing took over: same page instance, still controlled by the old worker's cache
  expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe('old page still here');
  expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(cachesBefore));
  await expect(page.getByRole('heading', { name: 'Update Flow Shop' })).toBeVisible();

  await page.getByRole('button', { name: 'Reload to update' }).click();
  // the page really reloaded: the marker set on the old page is gone (evaluating mid-navigation throws, so treat that as 'not yet')
  await expect.poll(async () => {
    try { return await page.evaluate(() => (window as unknown as { __marker?: string }).__marker ?? 'gone'); } catch { return 'navigating'; }
  }, { timeout: 15_000 }).toBe('gone');
  await expect(page.getByRole('heading', { name: 'Update Flow Shop' })).toBeVisible();
  await expect(page.getByText('A new version is ready.')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 15_000 }).toBe(1); // the old cache was removed
  expect(await page.evaluate(() => caches.keys())).not.toEqual(cachesBefore);
  await context.close();
});
