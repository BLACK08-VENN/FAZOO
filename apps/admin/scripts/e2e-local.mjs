/** Local e2e runner for the admin portal.
 *
 * Runs the Playwright suite against the LOCAL Supabase stack instead of the
 * remote project that apps/admin/.env.local points at.
 *
 * Usage:  pnpm test:e2e:local [-- --playwright-args...]
 *
 * Prereqs:
 *   1. Local stack running:  cd supabase && supabase start
 *   2. apps/admin/.env.e2e.local exists (copy .env.e2e.example and fill in
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY from the `supabase start` output).
 *
 * It starts a Next dev server on :3000 with the local-stack env, waits for it
 * to become ready, then runs `playwright test` with the same env (globalSetup
 * signs in with the E2E admin credentials from the same `.env.e2e.local`).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = resolve(ROOT, '.env.e2e.local');
const BASE_URL = 'http://localhost:3000';

function loadEnvFile() {
  if (!existsSync(ENV_FILE)) {
    console.error(`Missing ${ENV_FILE}`);
    console.error(
      'Copy apps/admin/.env.e2e.example → .env.e2e.local and fill in the local anon key.',
    );
    process.exit(1);
  }
  const env = { ...process.env };
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] && !env[m[1]]) env[m[1]] = m[2].trim();
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL) env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  if (!env.PLAYWRIGHT_BASE_URL) env.PLAYWRIGHT_BASE_URL = BASE_URL;
  for (const k of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'E2E_ADMIN_PHONE', 'E2E_ADMIN_PASSWORD']) {
    if (!env[k]) {
      console.error(`Missing ${k} in ${ENV_FILE}`);
      process.exit(1);
    }
  }
  return env;
}

async function waitForServer(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(4000) });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Dev server did not become ready at ${url}`);
}

const env = loadEnvFile();
const args = process.argv.slice(2).filter((a) => a !== '--');

console.log(`[e2e-local] starting Next dev server against ${env.NEXT_PUBLIC_SUPABASE_URL}`);
const server = spawn('pnpm', ['dev'], { cwd: ROOT, env, stdio: 'inherit', detached: true });

try {
  await waitForServer(`${BASE_URL}/sign-in`);
  console.log('[e2e-local] server ready; running Playwright');
  const testProc = spawn('pnpm', ['exec', 'playwright', 'test', ...args], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
  const code = await new Promise((resolveCode) => testProc.on('exit', resolveCode));
  process.exit(code ?? 1);
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}
