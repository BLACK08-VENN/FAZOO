import { describe, expect, it } from 'vitest';
import { parseRecoveryTokens } from './recovery-parser';

describe('parseRecoveryTokens', () => {
  it('accepts a Supabase recovery fragment', () => {
    expect(
      parseRecoveryTokens(
        'fazoo://update-password#access_token=a&refresh_token=r&type=recovery',
      ),
    ).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });
  it('rejects unrelated links', () => {
    expect(parseRecoveryTokens('fazoo://today')).toBeNull();
  });
});
