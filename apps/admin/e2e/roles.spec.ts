import { expect, test } from '@playwright/test';

const ADMIN_ID = process.env.E2E_ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

// Seed demo users (see supabase/seed.sql). Present on any local/e2e stack;
// override via env when running against a hosted project.
const ORG_ADMIN_ID = process.env.E2E_ORG_ADMIN_PHONE ?? 'org.admin.demo@ba.fazoo.app';
const ORG_ADMIN_PASSWORD = process.env.E2E_ORG_ADMIN_PASSWORD ?? 'Demo-Admin1!';
const BA_ID = process.env.E2E_BA_PHONE ?? 'ba.one.demo@ba.fazoo.app';
const BA_PASSWORD = process.env.E2E_BA_PASSWORD ?? 'Demo-Ba#001!';

async function signIn(
  page: import('@playwright/test').Page,
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
      '/veda-activations',
      '/veda-assignments',
      '/audit-logs',
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/brand/);
    }
  });

  test('BA CSV export is blocked server-side', async ({ page }) => {
    await signIn(page, BA_ID, BA_PASSWORD, 'ba', /\/brand/);
    const response = await page.request.get('/api/reports/veda-activations', {
      maxRedirects: 0,
    });
    expect(response.status(), 'BA must be redirected, never given data').toBeGreaterThanOrEqual(
      300,
    );
    expect(response.status(), 'BA must be redirected, never given data').toBeLessThan(400);
  });
});

test.describe('role isolation: organization admin (Lenovo)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(!ORG_ADMIN_ID || !ORG_ADMIN_PASSWORD, 'Demo credentials not configured');

  test('org admin reaches portal and Veda pages for a retail org', async ({ page }) => {
    await signIn(page, ORG_ADMIN_ID, ORG_ADMIN_PASSWORD, 'admin', /overview/);
    await expect(page.getByText('BA-days', { exact: true })).toBeVisible();
    await page.goto('/veda-activations');
    await expect(page.getByRole('heading', { name: 'Veda Activations' })).toBeVisible();
    await expect(page.getByText(/retail brand workspace/)).toBeVisible();
  });

  test('org admin CSV export is allowed', async ({ page }) => {
    await signIn(page, ORG_ADMIN_ID, ORG_ADMIN_PASSWORD, 'admin', /overview/);
    const response = await page.request.get('/api/reports/veda-activations');
    expect(response.status()).toBe(200);
  });
});

test.describe('role isolation: super admin', () => {
  test.skip(!ADMIN_ID || !ADMIN_PASSWORD, 'Demo credentials not configured');

  test('super admin browses Veda and audit pages', async ({ page }) => {
    await page.goto('/veda-activations');
    await expect(page.getByRole('heading', { name: 'Veda Activations' })).toBeVisible();
    await page.goto('/audit-logs');
    await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible();
  });
});
