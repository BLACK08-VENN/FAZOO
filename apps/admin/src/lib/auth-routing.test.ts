import { describe, expect, it } from 'vitest';
import { postSignInPath, signInEmail } from './auth-routing';

describe('one account identifier field', () => {
  it('normalizes email and international phone identities', () => {
    expect(signInEmail(' Person@Example.com ')).toBe('person@example.com');
    expect(signInEmail('+254 712 345 678')).toBe('254712345678@ba.fazoo.app');
    expect(signInEmail('0803 123 4567')).toBe('2348031234567@ba.fazoo.app');
  });
  it.each(['', 'not-an-email', 'bad@', 'a@b@c.com', 'call +254712345678', '0'.repeat(300)])(
    'rejects invalid identity %s',
    (value) => expect(signInEmail(value)).toBeNull(),
  );
});

describe('verified profile routing', () => {
  it.each(['super_admin', 'organization_admin', 'supervisor'])(
    'takes approved %s to the management dashboard',
    (role) => {
      expect(postSignInPath({ role, account_status: 'approved' })).toBe('/overview');
    },
  );
  it.each(['client', 'brand_ambassador'])('takes approved %s to their workspace', (role) => {
    expect(postSignInPath({ role, account_status: 'approved' })).toBe('/brand');
  });
  it.each(['pending', 'suspended', 'rejected', 'inactive'])(
    'keeps %s accounts out of dashboards',
    (status) => {
      expect(postSignInPath({ role: 'super_admin', account_status: status }, '/overview')).toBe(
        '/account-status',
      );
    },
  );
  it('does not treat missing or unknown profiles as staff', () => {
    expect(postSignInPath(null)).toBe('/account-status');
    expect(postSignInPath({ role: 'other', account_status: 'approved' })).toBe(
      '/account-status',
    );
  });
  it('restores only a matching workspace deep link', () => {
    expect(
      postSignInPath(
        { role: 'client', account_status: 'approved' },
        '/brand/leave?tab=history',
      ),
    ).toBe('/brand/leave?tab=history');
    expect(
      postSignInPath(
        { role: 'supervisor', account_status: 'approved' },
        '/campaigns/test?tab=logs',
      ),
    ).toBe('/campaigns/test?tab=logs');
    expect(
      postSignInPath({ role: 'client', account_status: 'approved' }, '/brand-ambassadors'),
    ).toBe('/brand');
    expect(postSignInPath({ role: 'client', account_status: 'approved' }, '/overview')).toBe(
      '/brand',
    );
    expect(postSignInPath({ role: 'supervisor', account_status: 'approved' }, '/brand')).toBe(
      '/overview',
    );
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/%2f%2fevil.example',
    '/brand/../../overview',
    '/sign-in',
    '/auth/signout',
    '/brand\\evil',
    '/brand%0d%0aLocation:evil',
  ])('rejects unsafe or looping destination %s', (path) => {
    expect(postSignInPath({ role: 'client', account_status: 'approved' }, path)).toBe('/brand');
  });
});
