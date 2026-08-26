import { chromium, type FullConfig } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const ADMIN_PHONE = process.env.E2E_ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

async function globalSetup(_config: FullConfig) {
  if (!ADMIN_PHONE || !ADMIN_PASSWORD) {
    throw new Error(
      'E2E_ADMIN_PHONE and E2E_ADMIN_PASSWORD must be set for global setup',
    );
  }

  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/sign-in`);
  await page.getByLabel('Mobile number or email').fill(ADMIN_PHONE);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/overview/, { timeout: 30_000 });

  await context.storageState({ path: 'e2e/.auth/admin.json' });
  await browser.close();
}

export default globalSetup;
