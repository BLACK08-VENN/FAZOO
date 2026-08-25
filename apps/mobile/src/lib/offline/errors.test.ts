import { describe, expect, it } from 'vitest';
import { classifySyncError } from './errors';

describe('classifySyncError', () => {
  it('retries transport errors', () => {
    expect(classifySyncError(new Error('Network request failed'))).toBe('retry');
  });
  it('stops retrying business-rule failures', () => {
    expect(
      classifySyncError(new Error('This day is locked — ask an admin to reopen it.')),
    ).toBe('terminal');
  });
  it('requests authentication for expired sessions', () => {
    expect(classifySyncError({ message: 'JWT expired', status: 401 })).toBe('auth');
  });
});
