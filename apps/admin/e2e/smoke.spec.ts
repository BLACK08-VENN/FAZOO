import { expect, test } from '@playwright/test';

test.describe('admin portal (unauthenticated)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects unauthenticated visitors to sign-in', async ({ page }) => {
    await page.goto('/overview');
    await expect(page).toHaveURL(/sign-in/);
  });
});

test.describe('admin portal (authenticated)', () => {
  test('overview page renders with stat cards', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByText('BA-days', { exact: true })).toBeVisible();
  });
});
