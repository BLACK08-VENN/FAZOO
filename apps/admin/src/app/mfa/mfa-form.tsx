'use client';
import { useState } from 'react';
import { browserSupabase } from '@fazoo/database/browser';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
type Factor = { id: string; name: string };
export function MfaForm({ factors }: { factors: Factor[] }) {
  const [factorId, setFactorId] = useState(factors[0]?.id ?? '');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const client = browserSupabase();
      const { data: list, error: listError } = await client.auth.mfa.listFactors();
      if (listError) throw listError;
      for (const factor of list.all.filter(
        (f) => f.factor_type === 'totp' && f.status === 'unverified',
      )) {
        const { error: removeError } = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) throw removeError;
      }
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'FAZOO staff',
      });
      if (error) throw error;
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch {
      setError('Could not set up verification. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error } = await browserSupabase().auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      setSecret('');
      setQr('');
      setCode('');
      window.location.assign('/overview');
    } catch {
      setError('Verification failed. Enter a fresh six-digit code and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
      {!factorId ? (
        <Button disabled={busy} onClick={() => void enroll()}>
          Set up authenticator
        </Button>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          {qr ? (
            <div className="space-y-2">
              {/* Auth returns a data URL; the secret remains only in component memory. */}
              <img
                src={qr}
                alt="Scan to set up your FAZOO authenticator"
                width={240}
                height={240}
              />
              <p className="text-sm">
                Scan the QR code, or enter this setup key in your authenticator app:
              </p>
              <code className="break-all text-sm">{secret}</code>
            </div>
          ) : null}
          {factors.length > 1 ? (
            <div>
              <Label htmlFor="factor">Authenticator</Label>
              <select
                id="factor"
                value={factorId}
                onChange={(e) => setFactorId(e.target.value)}
              >
                {factors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="code">Six-digit verification code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify and continue'}
          </Button>
        </form>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          await browserSupabase().auth.signOut();
          window.location.assign('/sign-in');
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
