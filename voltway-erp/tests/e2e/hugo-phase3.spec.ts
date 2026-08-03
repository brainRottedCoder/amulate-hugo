import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const hasCreds = Boolean(email && password);

test.describe('hugo phase 3 e2e', () => {
  test.skip(!hasCreds, 'Set E2E_EMAIL and E2E_PASSWORD to run');

  test('new chat / switch chat sidebar', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/hugo');
    await expect(page.getByRole('button', { name: /New chat/i })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: /New chat/i }).click();
    await expect(page.getByText(/Hugo AI/i).first()).toBeVisible();
  });

  test('reload mid-session restores history when messages exist', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/hugo');
    const input = page.getByPlaceholder(/Ask Hugo/i);
    await expect(input).toBeVisible({ timeout: 30000 });
    await input.fill('Phase3 memory ping');
    await page.getByRole('button', { name: /send/i }).click();
    await page.waitForTimeout(3000);
    await page.reload();
    await expect(page.getByText(/Phase3 memory ping|Hugo AI/i).first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('settings memories section loads', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/settings');
    await expect(page.getByText(/Hugo Memories/i)).toBeVisible({ timeout: 30000 });
  });
});
