// Shared helpers for the end-to-end tests.
import { expect, type Page } from '@playwright/test';
import { waitForCode } from '../integration/helpers';

export const freshEmail = (l: string) => `${l}-${crypto.randomUUID().slice(0, 8)}@example.test`;

export async function signInWithCode(page: Page, email: string) {
  const t0 = Date.now() - 1000;
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in\/$/);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in code' }).click();
  const code = await waitForCode(email, t0);
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function accessToken(page: Page) {
  return page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'));
    return k ? (JSON.parse(localStorage.getItem(k)!) as { access_token: string }).access_token : null;
  });
}

export async function fillBusiness(page: Page, over: Partial<Record<'name' | 'owner' | 'phone' | 'location', string>> = {}) {
  await page.getByLabel('Business name').fill(over.name ?? 'Banda Tailoring');
  await page.getByLabel('Your name').fill(over.owner ?? 'Amina Banda');
  await page.getByLabel('Phone number').fill(over.phone ?? '+265 999 123 456');
  await page.getByLabel('Location').fill(over.location ?? 'Area 25, Lilongwe');
  await page.getByLabel('Business type').selectOption('individual_tailor');
}

