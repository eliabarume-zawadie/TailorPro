// Automated accessibility checks in a real browser (WCAG 2.1 A and AA rules, including colour contrast).
// Automated checks find roughly a third of accessibility problems; the manual checklist in TESTING.md covers the rest.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedUserWithBusiness, waitForCode } from '../integration/helpers';
import { fillBusiness, freshEmail, signInWithCode } from './helpers';

async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

test('sign-in screens have no accessibility violations', async ({ page }) => {
  await page.goto('/sign-in/');
  await expect(page.getByRole('heading', { name: 'Sign in to TailorPro' })).toBeVisible();
  await expectNoViolations(page, 'sign-in (email step)');

  const email = freshEmail('a11y');
  const t0 = Date.now() - 1000;
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await expectNoViolations(page, 'sign-in (code step)');

  await page.getByLabel('6-digit code').fill('000000' === (await waitForCode(email, t0)) ? '111111' : '000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That code is not correct or has expired.')).toBeVisible();
  await expectNoViolations(page, 'sign-in (error shown)');
});

test('registration, dashboard and settings have no accessibility violations', async ({ page }) => {
  await signInWithCode(page, freshEmail('a11y2'));
  await expect(page).toHaveURL(/\/register\/$/);
  await expectNoViolations(page, 'registration (empty)');
  await page.getByRole('button', { name: 'Create business' }).click();
  await expect(page.getByText('Enter your business name.')).toBeVisible();
  await expectNoViolations(page, 'registration (all errors shown)');
  await fillBusiness(page);
  await page.getByRole('button', { name: 'Create business' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expectNoViolations(page, 'dashboard');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/$/);
  await expectNoViolations(page, 'settings');
});

test('the app is usable at phone width without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const { email } = await seedUserWithBusiness('phone', 'A business with a rather long name to test wrapping on small screens');
  await signInWithCode(page, email);
  await expect(page).toHaveURL(/\/app\/$/);
  for (const path of ['/app/', '/app/settings/']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  }
  // every interactive control meets the 44px touch-target minimum
  const small = await page.evaluate(() => Array.from(document.querySelectorAll('a, button, input, select')).map((e) => ({ t: e.textContent?.trim() || e.getAttribute('id'), h: e.getBoundingClientRect().height })).filter((x) => x.h > 0 && x.h < 44));
  expect(small).toEqual([]);
});
