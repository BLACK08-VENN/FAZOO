import { renderToStaticMarkup } from 'react-dom/server';
import type { FazooClient } from '@fazoo/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/maintenance/server', () => ({ loadMaintenanceWorkspace: load }));
import { MaintenanceDashboard } from './dashboard';
const client = {} as FazooClient;
describe('Maintenance dashboard availability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('MAINTENANCE_ENABLED', 'false');
  });
  it('does not query a disabled maintenance module', async () => {
    expect(await MaintenanceDashboard({ client })).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
  it('isolates maintenance data failures from the existing dashboard', async () => {
    vi.stubEnv('MAINTENANCE_ENABLED', 'true');
    load.mockRejectedValue(new Error('private database detail'));
    const markup = renderToStaticMarkup(await MaintenanceDashboard({ client }));
    expect(markup).toContain('temporarily unavailable');
    expect(markup).not.toContain('private database detail');
  });
});
