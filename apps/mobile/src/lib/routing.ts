export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'inactive';

const PROTECTED = [
  '/today',
  '/sales',
  '/history',
  '/profile',
  '/campaigns',
  '/campaign-logs',
  '/checkin',
  '/checkout',
  '/sick-leave',
  '/leave',
  '/school-visit',
  '/schools',
  '/school-job',
] as const;
const GUEST_ONLY = ['/', '/sign-in', '/register', '/forgot-password'] as const;

export type RedirectRoute =
  | '/update-password'
  | '/sign-in'
  | '/brand-select'
  | '/profile'
  | '/today';

export function routeRedirect(
  pathname: string,
  authenticated: boolean,
  _status?: AccountStatus,
  recovery = false,
): RedirectRoute | null {
  if (recovery) return pathname === '/update-password' ? null : '/update-password';
  if (!authenticated)
    return PROTECTED.some((path) => pathname.startsWith(path)) ? '/sign-in' : null;
  if (GUEST_ONLY.some((path) => path === pathname)) return '/profile';
  return null;
}
