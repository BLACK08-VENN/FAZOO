import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_ID = process.env.E2E_ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

// Seed demo users (see supabase/seed.sql). Present on any local/e2e stack;
// override via env when running against a hosted project.
const ORG_ADMIN_ID = process.env.E2E_ORG_ADMIN_PHONE ?? 'org.admin.demo@ba.fazoo.app';
const ORG_ADMIN_PASSWORD = process.env.E2E_ORG_ADMIN_PASSWORD ?? 'Demo-Admin1!';
const BA_ID = process.env.E2E_BA_PHONE ?? 'ba.one.demo@ba.fazoo.app';
const BA_PASSWORD = process.env.E2E_BA_PASSWORD ?? 'Demo-Ba#001!';

async function signIn(
  page: Page,
  identifier: string,
  password: string,
  tab: 'admin' | 'ba' | 'brand',
  dest: RegExp,
) {
  await page.goto('/sign-in');
  if (tab === 'ba') {
    await page.getByRole('tab', { name: /Brand Ambassador/ }).click();
  } else if (tab === 'brand') {
    await page.getByRole('tab', { name: /Brand \/ Client/ }).click();
  }
  await page.getByLabel('Mobile number or email').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(dest, { timeout: 15_000 });
}

test.describe('role isolation: brand ambassador (mobile user)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(!BA_ID || !BA_PASSWORD, 'Demo credentials not configured');

  test('BA is kept out of the staff portal on every staff route', async ({ page }) => {
    await signIn(page, BA_ID, BA_PASSWORD, 'ba', /\/brand/);
    for (const route of [
      '/overview',
      '/booklists',
      '/schools',
      '/ba-performance',
      '/veda-assignments',
      '/audit-logs',
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/brand/);
    }
  });

  test('BA CSV export is blocked server-side', async ({ page }) => {
    await signIn(page, BA_ID, BA_PASSWORD, 'ba', /\/brand/);
    const response = await page.request.get('/api/reports/booklists', {
      maxRedirects: 0,
    });
    expect(response.status(), 'BA must be redirected, never given data').toBeGreaterThanOrEqual(
      300,
    );
    expect(response.status(), 'BA must be redirected, never given data').toBeLessThan(400);
  });
});

test.describe('role isolation: organization admin (retail org)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(!ORG_ADMIN_ID || !ORG_ADMIN_PASSWORD, 'Demo credentials not configured');

  test('retail org admin gets the retail overview and none of the school surfaces', async ({
    page,
  }) => {
    await signIn(page, ORG_ADMIN_ID, ORG_ADMIN_PASSWORD, 'admin', /overview/);
    await expect(page.getByText('BA-days', { exact: true })).toBeVisible();

    // Navigation is filtered by organization kind, so a retail tenant is never
    // offered the booklist programme. Checked page-wide because the sidebar is
    // hidden and the tab bar shown on the mobile viewport.
    for (const href of ['/booklists', '/schools', '/ba-performance']) {
      await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
    }
    await expect(page.locator('a[href="/stores"]').first()).toBeVisible();
  });

  test('retail org admin CSV export is allowed on their own report', async ({ page }) => {
    await signIn(page, ORG_ADMIN_ID, ORG_ADMIN_PASSWORD, 'admin', /overview/);
    const response = await page.request.get('/api/reports/daily-logs');
    expect(response.status()).toBe(200);
  });
});

test.describe('role isolation: super admin', () => {
  test.skip(!ADMIN_ID || !ADMIN_PASSWORD, 'Demo credentials not configured');

  test('super admin browses the booklist pipeline and audit pages', async ({ page }) => {
    await page.goto('/booklists');
    await expect(page.getByRole('heading', { name: 'Booklist pipeline' })).toBeVisible();
    await page.goto('/audit-logs');
    await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible();
  });
});
