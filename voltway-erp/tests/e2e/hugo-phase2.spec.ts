import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const hasCreds = Boolean(email && password);

test.describe('hugo phase 2 e2e', () => {
  test.skip(!hasCreds, 'Set E2E_EMAIL and E2E_PASSWORD to run');

  test('Hugo ask critical parts → visible answer', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@voltway.com').fill(email!);
    await page.getByPlaceholder('••••••••').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/hugo');
    await page.getByPlaceholder(/Ask Hugo/i).or(page.locator('textarea')).first().fill('Which parts are critical?');
    await page.getByRole('button', { name: /send/i }).or(page.locator('button').filter({ hasText: 'send' })).first().click();
    await expect(page.locator('text=/critical|stock|tool results|P\\d+/i').first()).toBeVisible({
      timeout: 60000,
    });
  });
});
