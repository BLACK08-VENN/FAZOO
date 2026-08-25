import { describe, expect, it } from 'vitest';
import { routeRedirect } from './routing';

describe('routeRedirect', () => {
  it('protects every operational route', () => {
    for (const route of [
      '/today',
      '/sales',
      '/history',
      '/profile',
      '/checkin',
      '/checkout',
      '/sick-leave',
    ]) {
      expect(routeRedirect(route, false)).toBe('/sign-in');
    }
  });
  it('gates an unapproved session', () => {
    expect(routeRedirect('/checkin', true, 'pending')).toBe('/pending-approval');
  });
  it('allows an approved BA', () => {
    expect(routeRedirect('/sales', true, 'approved')).toBeNull();
  });
  it('routes password recovery independently of account status', () => {
    expect(routeRedirect('/sign-in', true, 'pending', true)).toBe('/update-password');
  });
});
