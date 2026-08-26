import { expect, test } from '@playwright/test';

test.describe('CRUD pages', () => {
  test.describe('stores', () => {
    test('page renders with form', async ({ page }) => {
      await page.goto('/stores');
      await expect(page.getByRole('heading', { name: 'Stores' })).toBeVisible();
      await expect(page.getByLabel('Store name')).toBeVisible();
      await expect(page.getByLabel('Address')).toBeVisible();
      await expect(page.getByLabel('Latitude')).toBeVisible();
      await expect(page.getByLabel('Longitude')).toBeVisible();
      await expect(page.getByLabel('Geofence radius (metres)')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create store' })).toBeVisible();
    });

    test('store table renders with columns', async ({ page }) => {
      await page.goto('/stores');
      await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Address' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Radius' })).toBeVisible();
    });
  });

  test.describe('SKUs', () => {
    test('page renders with form', async ({ page }) => {
      await page.goto('/skus');
      await expect(page.getByRole('heading', { name: 'SKUs' })).toBeVisible();
      await expect(page.getByLabel('Campaign')).toBeVisible();
      await expect(page.getByLabel('Product name')).toBeVisible();
      await expect(page.getByLabel('Code')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create SKU' })).toBeVisible();
    });
  });

  test.describe('campaigns', () => {
    test('page renders with create form', async ({ page }) => {
      await page.goto('/campaigns');
      await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();
      await expect(page.getByLabel('Name')).toBeVisible();
      await expect(page.getByLabel('Start')).toBeVisible();
      await expect(page.getByLabel('End')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create campaign' })).toBeVisible();
    });

    test('BA assignment form renders', async ({ page }) => {
      await page.goto('/campaigns');
      await expect(page.getByLabel('Brand Ambassador')).toBeVisible();
      await expect(page.getByLabel('Campaign')).toBeVisible();
      await expect(page.getByLabel('Store')).toBeVisible();
      await expect(page.getByLabel('Weekly off-day')).toBeVisible();
      await expect(page.getByLabel('Effective from')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Assign BA' })).toBeVisible();
    });
  });

  test.describe('brand ambassadors', () => {
    test('page renders with pending queue', async ({ page }) => {
      await page.goto('/brand-ambassadors');
      await expect(page.getByRole('heading', { name: 'Brand Ambassadors' })).toBeVisible();
      await expect(page.getByText('Pending registration queue')).toBeVisible();
    });
  });

  test.describe('settings', () => {
    test('page renders org info', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Organization' })).toBeVisible();
      await expect(page.getByText('Geofence policy')).toBeVisible();
    });
  });

  test.describe('audit logs', () => {
    test('page renders table', async ({ page }) => {
      await page.goto('/audit-logs');
      await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible();
      await expect(page.getByRole('table')).toBeVisible();
    });
  });

  test.describe('reports', () => {
    test('page renders with CSV download', async ({ page }) => {
      await page.goto('/reports');
      await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Download CSV/ })).toBeVisible();
    });
  });
});
