import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const hasCreds = Boolean(email && password);

test.describe('hugo phase 5 e2e', () => {
  test.skip(!hasCreds, 'Set E2E_EMAIL and E2E_PASSWORD to run');

  test('golden path: login → hugo → settings privacy surface', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/hugo');
    await expect(page.getByText(/Hugo AI/i).first()).toBeVisible({ timeout: 30000 });
    await page.goto('/settings');
    await expect(page.getByText(/Hugo Memories|Settings|Backup/i).first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('dashboard interactive quickly', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const start = Date.now();
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    expect(Date.now() - start).toBeLessThan(15000);
  });
});
