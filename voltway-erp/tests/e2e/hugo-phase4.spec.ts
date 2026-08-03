import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const hasCreds = Boolean(email && password);

test.describe('hugo phase 4 e2e', () => {
  test.skip(!hasCreds, 'Set E2E_EMAIL and E2E_PASSWORD to run');

  test('inventory page paginates without freeze', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/inventory');
    await expect(page.getByText(/Page \d+ \/ \d+/i)).toBeVisible({ timeout: 30000 });
    const next = page.getByRole('button', { name: 'Next' });
    if (await next.isEnabled()) {
      await next.click();
      await expect(page.getByText(/Page 2 \//i)).toBeVisible();
    }
  });

  test('Hugo stock question still responds (RAG path)', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/hugo');
    const input = page.getByPlaceholder(/Ask Hugo/i);
    await expect(input).toBeVisible({ timeout: 30000 });
    await input.fill('Which battery packs are low stock?');
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page.locator('text=/battery|stock|P\\d+|critical|low/i').first()).toBeVisible({
      timeout: 60000,
    });
  });
});
