export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'inactive';

const PROTECTED = [
  '/today',
  '/sales',
  '/history',
  '/profile',
  '/checkin',
  '/checkout',
  '/sick-leave',
  '/veda-checkin',
  '/veda-checkout',
  '/veda-activation',
] as const;
const GUEST_ONLY = ['/', '/sign-in', '/register', '/forgot-password'] as const;

export type RedirectRoute =
  | '/update-password'
  | '/sign-in'
  | '/brand-select'
  | '/pending-approval';

export function routeRedirect(
  pathname: string,
  authenticated: boolean,
  status?: AccountStatus,
  recovery = false,
): RedirectRoute | null {
  if (recovery) return pathname === '/update-password' ? null : '/update-password';
  if (!authenticated)
    return PROTECTED.some((path) => pathname.startsWith(path)) ? '/sign-in' : null;
  if (GUEST_ONLY.some((path) => path === pathname)) return '/brand-select';
  if (pathname !== '/update-password' && status !== 'approved') return '/pending-approval';
  return null;
}
