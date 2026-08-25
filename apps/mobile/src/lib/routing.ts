export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'inactive';

const PROTECTED = [
  '/today',
  '/sales',
  '/history',
  '/profile',
  '/checkin',
  '/checkout',
  '/sick-leave',
];
const GUEST_ONLY = ['/', '/sign-in', '/register', '/forgot-password'];

export function routeRedirect(
  pathname: string,
  authenticated: boolean,
  status?: AccountStatus,
  recovery = false,
): string | null {
  if (recovery) return pathname === '/update-password' ? null : '/update-password';
  if (!authenticated)
    return PROTECTED.some((path) => pathname.startsWith(path)) ? '/sign-in' : null;
  if (GUEST_ONLY.includes(pathname)) return '/today';
  if (pathname !== '/update-password' && status !== 'approved') return '/pending-approval';
  return null;
}
