import { test, expect } from '@playwright/test';

// Spike acceptance (SYNC_DESIGN.md section 9 tests 1-2, ARCHITECTURE.md AD-2):
// install, go offline, cold start, navigate, write, restart, data persists.
test('offline cold start, navigation and local persistence', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.getByTestId('sw-state')).toHaveText('ready', { timeout: 15_000 });
  // make sure the service worker controls the page before going offline
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);

  // 1. cold start offline: fresh page in the same context
  const offlinePage = await context.newPage();
  await offlinePage.goto('/');
  await expect(offlinePage.getByRole('heading', { name: 'TailorPro offline spike' })).toBeVisible();

  // 2. create a customer offline: saved locally with an outbox entry
  await offlinePage.getByTestId('name').fill('Amina Banda');
  await offlinePage.getByTestId('add').click();
  await expect(offlinePage.getByTestId('count')).toHaveText('1');
  await expect(offlinePage.getByTestId('pending')).toHaveText('1');

  // 3. navigate to a different exported route offline (hard navigation, served by the service worker)
  await offlinePage.goto('/customers/');
  await expect(offlinePage.getByTestId('list')).toContainText('Amina Banda');

  // 4. close every page, open a new one, still offline: data persists
  await offlinePage.close();
  const reopened = await context.newPage();
  await reopened.goto('/customers/');
  await expect(reopened.getByTestId('list')).toContainText('Amina Banda');

  // 5. unknown deep link offline falls back to the shell instead of a browser error page
  await reopened.goto('/customers/does-not-exist/');
  await expect(reopened.getByRole('navigation')).toBeVisible();

  await context.close();
});
