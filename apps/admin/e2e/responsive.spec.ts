import { expect, test } from '@playwright/test';

test.describe('responsive layout', () => {
  test('stat cards stack on mobile', async ({ page }) => {
    await page.goto('/overview');
    await page.setViewportSize({ width: 375, height: 812 });
    const grid = page.locator('.grid.grid-cols-2').first();
    await expect(grid).toBeVisible();
  });

  test('filter form wraps on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/daily-logs');
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
  });

  test('tables are horizontally scrollable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/daily-logs');
    const tableWrap = page.locator('.overflow-x-auto').first();
    await expect(tableWrap).toBeVisible();
  });

  test('store create form visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/stores');
    await expect(page.getByLabel('Store name')).toBeVisible();
  });

  test('mobile header shows Fazoo brand and sign out', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/overview');
    await expect(page.locator('header').getByText('Fazoo')).toBeVisible();
    await expect(page.locator('header').getByRole('button', { name: 'Sign out' })).toBeVisible();
  });
});
