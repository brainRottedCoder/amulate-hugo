import { test, expect } from '@playwright/test';

/**
 * Phase 1 e2e — skipped by default until E2E_EMAIL / E2E_PASSWORD are set.
 * Run: E2E_EMAIL=... E2E_PASSWORD=... npx playwright test
 */

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const hasCreds = Boolean(email && password);

test.describe('auth e2e', () => {
  test.skip(!hasCreds, 'Set E2E_EMAIL and E2E_PASSWORD to run');

  test('login → dashboard visible', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Executive Operations Dashboard').or(page.getByText('Daily Build Rate'))).toBeVisible({
      timeout: 15000,
    });
  });

  test('logout → /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByTitle('Sign out').click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test('logged out cannot use Hugo page', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/hugo');
  await expect(page).toHaveURL(/\/login/);
});
