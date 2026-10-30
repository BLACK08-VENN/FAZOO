import { normalizeInternationalPhone, phoneToAuthEmail } from '@fazoo/validation/phone';
import { safeLocalRedirect } from './document-upload';

export type RoutingProfile = { role: string; account_status: string };

const STAFF_ROUTES = [
  '/overview',
  '/brand-ambassadors',
  '/campaigns',
  '/stores',
  '/skus',
  '/brands',
  '/daily-logs',
  '/sales',
  '/reports',
  '/settings',
  '/audit-logs',
  '/leave-requests',
  '/schools',
  '/booklists',
  '/ba-performance',
  '/veda-assignments',
];

/** Resolve identity without asking for, or trusting, a client-supplied role. */
export function signInEmail(identifier: string): string | null {
  const value = identifier.trim();
  if (!value || value.length > 254) return null;
  if (value.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;
  }
  if (!/^[+\d().\s-]+$/.test(value)) return null;
  const result = normalizeInternationalPhone(value);
  return result.ok && result.e164 ? phoneToAuthEmail(result.e164) : null;
}

/** Routing is convenience only; destination pages and RLS still authorize access. */
export function postSignInPath(profile: RoutingProfile | null, requested = ''): string {
  if (!profile || profile.account_status !== 'approved') return '/account-status';
  const isBrand = profile.role === 'client' || profile.role === 'brand_ambassador';
  const isStaff = ['super_admin', 'organization_admin', 'supervisor'].includes(profile.role);
  if (!isBrand && !isStaff) return '/account-status';

  const fallback = isBrand ? '/brand' : '/overview';
  if (!requested) return fallback;
  const target = safeLocalRedirect(requested);
  const pathname = target.split('?')[0] ?? '/';
  const roots = isBrand ? ['/brand'] : STAFF_ROUTES;
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`))
    ? target
    : fallback;
}
