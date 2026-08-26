import { expect, test } from '@playwright/test';

test.describe('daily logs page', () => {
  test('page header and table render', async ({ page }) => {
    await page.goto('/daily-logs');
    await expect(page.getByRole('heading', { name: 'Daily Logs' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('table has correct columns', async ({ page }) => {
    await page.goto('/daily-logs');
    const headers = ['Date', 'BA', 'BA ID', 'Store', 'Check-in', 'Checkout', 'Attendance', 'Completion', 'Units', 'Photos', 'Flags'];
    for (const h of headers) {
      await expect(page.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
    }
  });

  test('filter form works', async ({ page }) => {
    await page.goto('/daily-logs?preset=7d&attendance_status=present');
    await expect(page.getByLabel('Range')).toHaveValue('7d');
    await expect(page.getByLabel('Status')).toHaveValue('present');
  });

  test('completion quick-links render', async ({ page }) => {
    await page.goto('/daily-logs');
    await expect(page.getByRole('link', { name: 'open only' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'completed only' })).toBeVisible();
  });

  test('daily log detail page loads for first row', async ({ page }) => {
    await page.goto('/daily-logs');
    const firstRow = page.getByRole('table').locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      const link = firstRow.locator('a.text-deep').first();
      if (await link.isVisible()) {
        const href = await link.getAttribute('href');
        if (href) {
          await page.goto(href);
          await expect(page.getByText('Daily log')).toBeVisible();
          await expect(page.getByText('Check-in / checkout')).toBeVisible();
        }
      }
    }
  });
});
