import { expect, test } from '@playwright/test';

/**
 * Smoke flow — requires a running stack with seeded demo data
 * (see docs/setup.md). Credentials come from env, never committed.
 */
const ADMIN_ID = process.env.E2E_ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('admin portal', () => {
  test('redirects unauthenticated visitors to sign-in', async ({ page }) => {
    await page.goto('/overview');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('signs in and sees overview cards', async ({ page }) => {
    test.skip(!ADMIN_ID || !ADMIN_PASSWORD, 'Demo credentials not configured');
    await page.goto('/sign-in');
    await page.getByLabel('Mobile number or email').fill(ADMIN_ID!);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/overview/);
    await expect(page.getByText('BA-days')).toBeVisible();
  });
});
