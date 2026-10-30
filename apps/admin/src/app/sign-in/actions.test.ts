import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  profile: vi.fn(),
  limit: vi.fn(),
  service: vi.fn(),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '192.0.2.1' }),
}));
vi.mock('@fazoo/database', () => ({
  serviceSupabase: mocks.service,
  serverSupabase: async () => ({
    auth: { signInWithPassword: mocks.signIn, getUser: mocks.getUser, signOut: mocks.signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}));
import { signInAction } from './actions';

function form(identifier = 'person@example.com', next = '/overview') {
  const data = new FormData();
  data.set('identifier', identifier);
  data.set('password', 'test-password');
  data.set('next', next);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.service.mockReturnValue({ rpc: mocks.limit });
  mocks.limit.mockResolvedValue({ data: true, error: null });
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null });
  mocks.profile.mockResolvedValue({
    data: { role: 'organization_admin', account_status: 'approved' },
    error: null,
  });
});

describe('unified sign-in action', () => {
  it.each([
    ['super_admin', '/overview'],
    ['organization_admin', '/overview'],
    ['supervisor', '/overview'],
    ['client', '/brand'],
    ['brand_ambassador', '/brand'],
  ])('routes %s from the verified profile, without a role field', async (role, destination) => {
    mocks.profile.mockResolvedValue({
      data: { role, account_status: 'approved' },
      error: null,
    });
    expect(await signInAction({ error: null }, form())).toEqual({
      error: null,
      redirectTo: destination,
    });
  });
  it('ignores a forged privileged role', async () => {
    mocks.profile.mockResolvedValue({
      data: { role: 'brand_ambassador', account_status: 'approved' },
      error: null,
    });
    const data = form('+254712345678');
    data.set('role', 'admin');
    expect((await signInAction({ error: null }, data)).redirectTo).toBe('/brand');
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: '254712345678@ba.fazoo.app',
      password: 'test-password',
    });
  });
  it('keeps pending accounts on the access status screen', async () => {
    mocks.profile.mockResolvedValue({
      data: { role: 'brand_ambassador', account_status: 'pending' },
      error: null,
    });
    expect((await signInAction({ error: null }, form())).redirectTo).toBe('/account-status');
  });
  it('shows setup guidance rather than granting access to a missing profile', async () => {
    mocks.profile.mockResolvedValue({ data: null, error: null });
    expect((await signInAction({ error: null }, form())).redirectTo).toBe('/account-status');
  });
  it('fails closed and signs out if profile verification fails', async () => {
    mocks.profile.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    const result = await signInAction({ error: null }, form());
    expect(result.error).toBeTruthy();
    expect(result.redirectTo).toBeUndefined();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('rejects an unverified session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    expect((await signInAction({ error: null }, form())).error).toBeTruthy();
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it('does not reveal whether an account exists on invalid credentials', async () => {
    mocks.signIn.mockResolvedValue({ error: { message: 'user not found' } });
    expect(await signInAction({ error: null }, form())).toEqual({
      error: 'Invalid credentials. Please try again.',
    });
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it('does not attempt authentication when rate limited', async () => {
    mocks.limit.mockResolvedValue({ data: false, error: null });
    expect((await signInAction({ error: null }, form())).error).toMatch(/Too many/);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('fails closed if rate limiting is unavailable', async () => {
    mocks.service.mockImplementation(() => {
      throw new Error('missing config');
    });
    expect((await signInAction({ error: null }, form())).error).toMatch(
      /temporarily unavailable/,
    );
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('rejects malformed identifiers before making network calls', async () => {
    expect((await signInAction({ error: null }, form('bad@'))).error).toBeTruthy();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
