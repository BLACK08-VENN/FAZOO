import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

type Cookie = { name: string; value: string; options: CookieOptions };
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profile: vi.fn(),
  cookies: [] as Cookie[],
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll: (cookies: Cookie[]) => void } },
  ) => ({
    auth: {
      getUser: async () => {
        if (mocks.cookies.length) options.cookies.setAll(mocks.cookies);
        return mocks.getUser();
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.profile }) }) }),
  }),
}));
import { proxy } from './proxy';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test-project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key');
  mocks.cookies = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
  mocks.profile.mockResolvedValue({ data: { role: 'client', account_status: 'approved' } });
});

describe('session restoration', () => {
  it('keeps renewed cookies when returning a signed-in user to their workspace', async () => {
    mocks.cookies = [
      {
        name: 'sb-test',
        value: 'refreshed-session',
        options: { path: '/', maxAge: 3600, sameSite: 'lax', secure: true },
      },
    ];
    const response = await proxy(new NextRequest('https://preview.example/sign-in'));
    expect(response.headers.get('location')).toBe('https://preview.example/brand');
    expect(response.cookies.get('sb-test')?.value).toBe('refreshed-session');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=3600');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('restores an appropriate deep link for a returning user', async () => {
    const response = await proxy(
      new NextRequest('https://preview.example/sign-in?next=%2Fbrand%2Fleave'),
    );
    expect(response.headers.get('location')).toBe('https://preview.example/brand/leave');
  });
  it('does not send a pending account to an operational dashboard', async () => {
    mocks.profile.mockResolvedValue({ data: { role: 'client', account_status: 'pending' } });
    const response = await proxy(new NextRequest('https://preview.example/sign-in'));
    expect(response.headers.get('location')).toBe('https://preview.example/account-status');
  });
  it('does not send a missing profile to a staff dashboard', async () => {
    mocks.profile.mockResolvedValue({ data: null });
    const response = await proxy(new NextRequest('https://preview.example/sign-in'));
    expect(response.headers.get('location')).toBe('https://preview.example/account-status');
  });
  it('preserves cleared cookies and the original page when reauthentication is needed', async () => {
    mocks.cookies = [{ name: 'sb-test', value: '', options: { path: '/', maxAge: 0 } }];
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await proxy(new NextRequest('https://preview.example/campaigns?tab=logs'));
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe('/sign-in');
    expect(target.searchParams.get('next')).toBe('/campaigns?tab=logs');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('allows the sign-in page without a database but blocks a similar protected path', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const signIn = await proxy(new NextRequest('https://preview.example/sign-in'));
    const protectedPage = await proxy(
      new NextRequest('https://preview.example/sign-in-private'),
    );
    expect(signIn.headers.get('location')).toBeNull();
    expect(protectedPage.headers.get('location')).toBe('https://preview.example/sign-in');
  });
});
