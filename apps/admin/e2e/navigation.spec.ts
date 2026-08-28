import { expect, test } from '@playwright/test';

test.describe('navigation', () => {
  async function primaryNav(page: import('@playwright/test').Page) {
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    const isMobile = viewport.width < 1024;
    return page.getByRole('navigation', {
      name: isMobile ? 'Primary mobile' : 'Primary',
      exact: true,
    });
  }

  test('sidebar navigation links exist', async ({ page }) => {
    await page.goto('/overview');
    const links = [
      'Overview',
      'Daily Logs',
      'Leave Requests',
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
      await expect((await primaryNav(page)).getByText(label)).toBeVisible();
    }
  });

  test('can navigate to each page via sidebar', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/overview');
    const routes: { label: string; href: string; heading: string }[] = [
      { label: 'Daily Logs', href: '/daily-logs', heading: 'Daily Logs' },
      { label: 'Leave Requests', href: '/leave-requests', heading: 'Leave Requests' },
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
      await (await primaryNav(page)).getByText(label).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({
        timeout: 15_000,
      });
      await expect
        .poll(() => page.url(), { timeout: 10_000 })
        .toMatch(new RegExp(href));
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
