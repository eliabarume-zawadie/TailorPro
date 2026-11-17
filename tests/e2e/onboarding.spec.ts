// Phase 1 acceptance (PHASE1_PLAN section 5, items 1 and 4): sign in, register a business, land on the dashboard.
// Real Google sign-in cannot be automated. These tests use the email one-time-code path against the local stack,
// and a manual checklist covers Google (TESTING.md).
import { expect, test } from '@playwright/test';
import { ANON, API, seedUserWithBusiness, waitForCode } from '../integration/helpers';
import { accessToken, fillBusiness, freshEmail, signInWithCode } from './helpers';

test('new user: sign in with an emailed code, register a business, reach the dashboard, stay signed in, sign out', async ({ page }) => {
  const email = freshEmail('e2e');
  await signInWithCode(page, email);

  // a user with no business is sent to registration
  await expect(page).toHaveURL(/\/register\/$/);
  await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
  await expect(page.getByLabel('Currency')).toHaveValue('MWK');

  // field-level validation: every error shown at once, in words, nothing submitted
  await page.getByLabel('Phone number').fill('abc');
  await page.getByRole('button', { name: 'Create business' }).click();
  await expect(page.getByText('Enter your business name.')).toBeVisible();
  await expect(page.getByText('Enter a phone number with 7 to 15 digits.')).toBeVisible();
  await expect(page).toHaveURL(/\/register\/$/);

  await fillBusiness(page);
  await page.getByRole('button', { name: 'Create business' }).dblclick(); // a double tap must not create two businesses
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByRole('heading', { name: 'Banda Tailoring' })).toBeVisible();
  await expect(page.getByText('Individual tailor in Area 25, Lilongwe')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');

  // exactly one business exists for this user
  const token = await accessToken(page);
  const list = await (await fetch(`${API}/rest/v1/businesses?select=id,currency`, { headers: { apikey: ANON, authorization: `Bearer ${token}` } })).json();
  expect(list).toHaveLength(1);
  expect(list[0].currency).toBe('MWK');

  // session survives a reload and a fresh visit to the root
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Banda Tailoring' })).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/app\/$/);

  // sign out clears the session and protects the app
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in\/$/);
  expect(await accessToken(page)).toBeNull();
  await page.goto('/app/');
  await expect(page).toHaveURL(/\/sign-in\/$/);
});

test('returning user with a business goes straight to the dashboard', async ({ page }) => {
  const { email } = await seedUserWithBusiness('returning', 'Phiri and Sons');
  await signInWithCode(page, email);
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByRole('heading', { name: 'Phiri and Sons' })).toBeVisible();
  await expect(page.getByText('Tailoring shop in Blantyre')).toBeVisible();
});

test('a wrong code is refused with a clear message and the user can try again', async ({ page }) => {
  const email = freshEmail('wrong');
  const t0 = Date.now() - 1000;
  await page.goto('/sign-in/');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in code' }).click();
  const real = await waitForCode(email, t0);
  await page.getByLabel('6-digit code').fill(real === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That code is not correct or has expired.')).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in\/$/);
  await page.getByLabel('6-digit code').fill(real);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/register\/$/);
});

test('asking for a second code too quickly shows a wait message', async ({ page }) => {
  const email = freshEmail('limit');
  await page.goto('/sign-in/');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await page.getByRole('button', { name: 'Send a new code' }).click();
  await expect(page.getByText('Please wait a minute before asking for another code.')).toBeVisible();
});

test('markup in business fields is displayed as text and never runs', async ({ page }) => {
  const email = freshEmail('xss');
  await signInWithCode(page, email);
  await fillBusiness(page, { name: '<img src=x onerror="window.__xss=1">' });
  await page.getByRole('button', { name: 'Create business' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByRole('heading', { name: '<img src=x onerror="window.__xss=1">' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test('Google sign-in sends the user to Google', async ({ page }) => {
  await page.route('https://accounts.google.com/**', (route) => route.abort());
  await page.goto('/sign-in/');
  const nav = page.waitForRequest((r) => r.url().startsWith('https://accounts.google.com/'));
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  expect((await nav).url()).toContain('client_id=');
});

test('profile can be edited and the change persists', async ({ page }) => {
  const email = freshEmail('profile');
  await signInWithCode(page, email);
  await fillBusiness(page, { name: 'Profile Test Shop' });
  await page.getByRole('button', { name: 'Create business' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/$/);
  await page.getByLabel('Your name').fill('Chikondi Mwale');
  await page.getByLabel('Phone number').fill('+265 888 555 111');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Your name')).toHaveValue('Chikondi Mwale');
  await expect(page.getByLabel('Phone number')).toHaveValue('+265888555111');
});
