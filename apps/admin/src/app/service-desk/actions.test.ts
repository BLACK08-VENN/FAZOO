import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc, requireProfile, load, revalidate } = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireProfile: vi.fn(),
  load: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireApprovedProfile: requireProfile }));
vi.mock('@/lib/maintenance/server', () => ({ loadMaintenanceWorkspace: load }));
vi.mock('next/cache', () => ({ revalidatePath: revalidate }));
import { mutateMaintenance } from './actions';
const request = {
  client_request_id: '40000000-0000-4000-8000-000000000001',
  command: {
    action: 'create',
    title: 'Inspect the pump',
    description: 'Pressure is lower than normal.',
    location: 'Fictional test site',
    priority: 'normal',
  },
};
describe('Maintenance action boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('MAINTENANCE_ENABLED', 'true');
    requireProfile.mockResolvedValue({ client: { rpc } });
    rpc.mockResolvedValue({ error: null });
    load.mockResolvedValue({ jobs: [] });
  });
  it('is closed while disabled', async () => {
    vi.stubEnv('MAINTENANCE_ENABLED', 'false');
    expect((await mutateMaintenance(request)).error).toMatch(/not enabled/);
    expect(requireProfile).not.toHaveBeenCalled();
  });
  it('rejects invalid request ids and extra privileged fields', async () => {
    for (const input of [
      { ...request, client_request_id: 'bad' },
      { ...request, command: { ...request.command, organization_id: 'spoof' } },
    ])
      expect((await mutateMaintenance(input)).error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('verifies identity and forwards the same receipt id and validated command', async () => {
    await mutateMaintenance(request);
    expect(requireProfile).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('maintenance_mutate', {
      p_client_request_id: request.client_request_id,
      p_command: request.command,
    });
  });
  it('does not expose provider errors', async () => {
    rpc.mockResolvedValue({ error: { message: 'private internal detail' } });
    expect((await mutateMaintenance(request)).error).not.toContain('private internal detail');
    expect(load).not.toHaveBeenCalled();
  });
  it('reports a saved update separately when reloading fails', async () => {
    load.mockRejectedValue(new Error('load failed'));
    expect(await mutateMaintenance(request)).toMatchObject({
      saved: true,
      error: expect.stringContaining('was saved'),
    });
  });
});
