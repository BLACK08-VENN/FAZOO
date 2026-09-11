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
      '/leave',
      '/school-visit',
      '/schools',
      '/school-job',
    ]) {
      expect(routeRedirect(route, false)).toBe('/sign-in');
    }
  });
  it('allows an authenticated unapproved user to remain signed in', () => {
    expect(routeRedirect('/checkin', true, 'pending')).toBeNull();
  });
  it('allows an approved BA', () => {
    expect(routeRedirect('/sales', true, 'approved')).toBeNull();
  });
  it('lands an authenticated BA on profile', () => {
    expect(routeRedirect('/sign-in', true, 'approved')).toBe('/profile');
  });
  it('routes password recovery independently of account status', () => {
    expect(routeRedirect('/sign-in', true, 'pending', true)).toBe('/update-password');
  });
});
