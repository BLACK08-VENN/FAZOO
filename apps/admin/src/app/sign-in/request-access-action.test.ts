import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessRequestSchema } from '@fazoo/validation';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), service: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '192.0.2.2' }),
}));
vi.mock('@fazoo/database', () => ({ serviceSupabase: mocks.service }));
import { requestAccessAction } from './request-access-action';

const details = {
  client_request_id: '156b40e1-a1b4-41a1-9085-fcc396fb3a52',
  full_name: 'Example Person',
  organization_name: 'Example Company',
  requested_role: 'brand_ambassador',
  contact: 'person@example.com',
};
function form(overrides: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...details, ...overrides })) {
    if (typeof value === 'string') data.set(key, value);
  }
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ACCESS_REQUESTS_ENABLED', 'true');
  mocks.service.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockImplementation(async (name) =>
    name === 'check_rate_limit'
      ? { data: true, error: null }
      : { data: { status: 'ok' }, error: null },
  );
});

describe('access request intake', () => {
  it.each(['brand_ambassador', 'client', 'supervisor'])(
    'records a %s application without granting access',
    async (role) => {
      expect(
        await requestAccessAction({ error: null }, form({ requested_role: role })),
      ).toEqual({ error: null, success: true });
      expect(mocks.rpc).toHaveBeenCalledWith('submit_access_request', {
        p_client_request_id: details.client_request_id,
        p_full_name: details.full_name,
        p_organization_name: details.organization_name,
        p_contact: details.contact,
        p_requested_role: role,
      });
      expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual([
        'check_rate_limit',
        'check_rate_limit',
        'submit_access_request',
      ]);
    },
  );
  it.each(['admin', 'organization_admin', 'super_admin', ''])(
    'rejects forged or missing role %s before database access',
    async (role) => {
      const result = await requestAccessAction({ error: null }, form({ requested_role: role }));
      expect(result.error).toBeTruthy();
      expect(mocks.service).not.toHaveBeenCalled();
    },
  );
  it('normalizes contact details without replacing the real phone with a login alias', () => {
    expect(accessRequestSchema.parse({ ...details, contact: '+254 712 345 678' }).contact).toBe(
      '+254712345678',
    );
    expect(
      accessRequestSchema.parse({ ...details, contact: ' Person@Example.com ' }).contact,
    ).toBe('person@example.com');
  });
  it.each([
    { full_name: 'A' },
    { organization_name: '' },
    { contact: 'bad@' },
    { client_request_id: 'invalid' },
  ])('rejects invalid details %o', async (overrides) => {
    expect((await requestAccessAction({ error: null }, form(overrides))).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('enforces preview disablement on the server, not only the button', async () => {
    vi.stubEnv('ACCESS_REQUESTS_ENABLED', 'false');
    expect((await requestAccessAction({ error: null }, form())).error).toBeTruthy();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it('rejects the bot honeypot without accepting an application', async () => {
    expect(
      (await requestAccessAction({ error: null }, form({ website: 'spam' }))).error,
    ).toBeTruthy();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it('fails closed when rate limiting fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    expect((await requestAccessAction({ error: null }, form())).error).toBeTruthy();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not claim success when the database has not saved the request', async () => {
    mocks.rpc.mockImplementation(async (name) =>
      name === 'check_rate_limit'
        ? { data: true, error: null }
        : { data: null, error: { message: 'missing test schema' } },
    );
    const result = await requestAccessAction({ error: null }, form());
    expect(result.error).toBeTruthy();
    expect(result.success).toBeUndefined();
  });
});
