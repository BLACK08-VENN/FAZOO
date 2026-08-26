import { expect, test } from '@playwright/test';

test.describe('navigation', () => {
  test('sidebar navigation links exist', async ({ page }) => {
    await page.goto('/overview');
    const links = [
      'Overview',
      'Daily Logs',
      'Sales',
      'Brand Ambassadors',
      'Stores',
      'SKUs',
      'Campaigns',
      'Reports',
      'Settings',
      'Audit Logs',
    ];
    for (const label of links) {
      await expect(page.getByRole('navigation', { name: 'Primary', exact: true }).getByText(label)).toBeVisible();
    }
  });

  test('can navigate to each page via sidebar', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/overview');
    const routes: { label: string; href: string; heading: string }[] = [
      { label: 'Daily Logs', href: '/daily-logs', heading: 'Daily Logs' },
      { label: 'Sales', href: '/sales', heading: 'Sales by store' },
      { label: 'Brand Ambassadors', href: '/brand-ambassadors', heading: 'Brand Ambassadors' },
      { label: 'Stores', href: '/stores', heading: 'Stores' },
      { label: 'SKUs', href: '/skus', heading: 'SKUs' },
      { label: 'Campaigns', href: '/campaigns', heading: 'Campaigns' },
      { label: 'Reports', href: '/reports', heading: 'Reports' },
      { label: 'Settings', href: '/settings', heading: 'Settings' },
      { label: 'Audit Logs', href: '/audit-logs', heading: 'Audit Logs' },
      { label: 'Overview', href: '/overview', heading: 'Overview' },
    ];
    for (const { label, href, heading } of routes) {
      await page.getByRole('navigation', { name: 'Primary', exact: true }).getByText(label).click();
      await page.waitForURL(new RegExp(href), { timeout: 10_000 });
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 10_000 });
    }
  });

  test('mobile nav bar is visible on small viewports', async ({ page }) => {
    await page.goto('/overview');
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole('navigation', { name: 'Primary mobile' })).toBeVisible();
  });

  test('desktop sidebar is hidden on mobile', async ({ page }) => {
    await page.goto('/overview');
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).not.toBeVisible();
  });
});
