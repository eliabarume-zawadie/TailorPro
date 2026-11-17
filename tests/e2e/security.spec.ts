// Browser security controls (SECURITY.md sections 8 and 12.3): Content Security Policy, headers, and what a policy
// violation looks like. The app must work completely under the policy, and injected script must not run.
import { expect, test, type Page } from '@playwright/test';
import { seedUserWithBusiness } from '../integration/helpers';
import { fillBusiness, freshEmail, signInWithCode, swReady } from './helpers';

/** Records every Content Security Policy violation the page reports. */
async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI || 'inline'}`));
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

test('pages are served with a strict policy and security headers', async ({ request }) => {
  for (const path of ['/', '/sign-in/', '/register/', '/app/', '/app/settings/', '/auth/callback/']) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    const h = r.headers();
    const csp = h['content-security-policy'] ?? '';
    expect(csp, `${path} CSP`).toContain("default-src 'self'");
    expect(csp, `${path} script-src`).toMatch(/script-src 'self' ('sha256-[A-Za-z0-9+/=]+' ?)+;/);
    expect(csp, `${path} must not weaken scripts`).not.toMatch(/unsafe-inline|unsafe-eval|script-src[^;]*\*/);
    expect(csp, `${path} framing`).toContain("frame-ancestors 'none'");
    expect(csp, `${path} object`).toContain("object-src 'none'");
    expect(csp, `${path} base`).toContain("base-uri 'none'");
    expect(csp, `${path} connect-src names the API origin`).toMatch(/connect-src 'self' https?:\/\/[^ ;]+;/);
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy'], path).toContain('camera=()');
    expect(h['cache-control'], `${path} must revalidate`).toContain('no-cache');
  }
  const sw = await request.get('/sw.js');
  expect(sw.headers()['cache-control'], 'the worker file must never be served stale').toContain('no-cache');
});

test('static assets are cached for a year and marked immutable', async ({ request, page }) => {
  await page.goto('/sign-in/');
  const asset = await page.evaluate(() => (performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/_next/static/')) ?? ''));
  expect(asset).toContain('/_next/static/');
  const r = await request.get(new URL(asset).pathname);
  expect(r.headers()['cache-control']).toMatch(/max-age=31536000.*immutable/);
});

test('the whole app works under the policy with no violations', async ({ page }) => {
  await watchViolations(page);
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && /content security policy/i.test(m.text())) consoleErrors.push(m.text()); });
  await signInWithCode(page, freshEmail('csp'));
  await expect(page).toHaveURL(/\/register\/$/);
  await fillBusiness(page);
  await page.getByRole('button', { name: 'Create business' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByText('Business created')).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/$/);
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in\/$/);
  expect(await violations(page)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

async function injectionIsBlocked(page: Page) {
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__pwned = 1';
    document.head.appendChild(s);
    const img = document.createElement('img');
    img.setAttribute('onerror', 'window.__pwned = 2');
    img.src = 'x:bad';
    document.body.appendChild(img);
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect((await violations(page)).length).toBeGreaterThan(0);
}

test('script injected into the page does not run (the policy blocks inline code)', async ({ page }) => {
  await watchViolations(page);
  await page.goto('/sign-in/');
  await expect(page.getByRole('heading', { name: 'Sign in to TailorPro' })).toBeVisible();
  await injectionIsBlocked(page);
});

test('the policy still protects a page served from the offline cache', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { email } = await seedUserWithBusiness('cspoffline', 'Policy Offline Shop');
  await signInWithCode(page, email);
  await expect(page.getByRole('heading', { name: 'Policy Offline Shop' })).toBeVisible();
  await swReady(page);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 20_000 }).toBe(true);
  await context.setOffline(true);
  const cold = await context.newPage();
  await watchViolations(cold);
  await cold.goto('/app/');
  await expect(cold.getByRole('heading', { name: 'Policy Offline Shop' })).toBeVisible();
  await injectionIsBlocked(cold);
  await context.close();
});
