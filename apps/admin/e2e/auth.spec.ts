import { expect, test } from '@playwright/test';

const ADMIN_ID = process.env.E2E_ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('authentication & role isolation', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects unauthenticated visitors to sign-in', async ({ page }) => {
    await page.goto('/overview');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('redirects unauthenticated from any protected route', async ({ page }) => {
    test.setTimeout(60_000);
    for (const route of [
      '/daily-logs',
      '/sales',
      '/brand-ambassadors',
      '/stores',
      '/skus',
      '/campaigns',
      '/reports',
      '/settings',
      '/audit-logs',
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(/sign-in/);
    }
  });

  test('sign-in page shows form elements', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByLabel('Mobile number or email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('sign-in shows error on invalid credentials', async ({ page }) => {
    test.skip(!ADMIN_ID || !ADMIN_PASSWORD, 'Demo credentials not configured');
    await page.goto('/sign-in');
    await page.getByLabel('Mobile number or email').fill('invalid@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('signs in and sees overview', async ({ page }) => {
    test.skip(!ADMIN_ID || !ADMIN_PASSWORD, 'Demo credentials not configured');
    await page.goto('/sign-in');
    await page.getByLabel('Mobile number or email').fill(ADMIN_ID!);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/overview/, { timeout: 15_000 });
    await expect(page.getByText('BA-days', { exact: true })).toBeVisible();
  });

  test('not-authorized page renders', async ({ page }) => {
    await page.goto('/not-authorized');
    await expect(page.getByText('Not authorized')).toBeVisible();
    await expect(page.getByText('Brand Ambassadors use the mobile app')).toBeVisible();
  });
});

test.describe('sign out', () => {
  test('signs out and returns to sign-in', async ({ page }) => {
    test.skip(!ADMIN_ID || !ADMIN_PASSWORD, 'Demo credentials not configured');
    await page.goto('/overview');
    await expect(page).toHaveURL(/overview/);
    const signOut = page.getByRole('button', { name: 'Sign out' });
    await signOut.filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/sign-in/);
  });
});
