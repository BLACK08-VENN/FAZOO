import { expect, test } from '@playwright/test';

test.describe('overview page', () => {
  test('displays stat cards', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByText('BA-days', { exact: true })).toBeVisible();
    await expect(page.getByText('Units sold')).toBeVisible();
    await expect(page.getByText('Completed days')).toBeVisible();
    await expect(page.getByText('Open / incomplete')).toBeVisible();
    await expect(page.getByText('Active BAs')).toBeVisible();
    await expect(page.getByText('Active stores')).toBeVisible();
    await expect(page.getByText('Sick-leave days')).toBeVisible();
    await expect(page.getByText('Completion rate', { exact: true })).toBeVisible();
  });

  test('filter form is present', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByLabel('Range')).toBeVisible();
    await expect(page.getByLabel('From')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'To' })).toBeVisible();
    await expect(page.getByLabel('Campaign')).toBeVisible();
    await expect(page.getByLabel('Brand Ambassador')).toBeVisible();
    await expect(page.getByLabel('Store', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Status')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
  });

  test('trends chart section exists', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByText('Sales & completion trends')).toBeVisible();
  });

  test('filter preserves URL params', async ({ page }) => {
    await page.goto('/overview?preset=7d');
    await expect(page.getByLabel('Range')).toHaveValue('7d');
  });
});
