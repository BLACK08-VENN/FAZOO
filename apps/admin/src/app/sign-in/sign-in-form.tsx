'use client';

import { useEffect, useState, useActionState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { signInAction, type SignInState } from './actions';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const initialState: SignInState = { error: null };

export function SignInForm({ next, available = true }: { next: string; available?: boolean }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    if (state.redirectTo) {
      window.location.href = state.redirectTo;
    }
  }, [state.redirectTo]);

  return (
    <form action={formAction} className="space-y-5" aria-busy={pending}>
      <input type="hidden" name="next" value={next} />

      <div>
        <Label
          htmlFor="identifier"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
        >
          Email or phone number
        </Label>
        <Input
          id="identifier"
          name="identifier"
          aria-label="Mobile number or email"
          autoComplete="username"
          placeholder="Email address or phone number"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          className="h-12 rounded-xl border-ink/10 bg-[#faf9fb] px-4 transition-shadow focus:bg-white focus:shadow-[0_0_0_4px_rgba(64,34,98,.08)]"
          required
        />
      </div>
      <div>
        <Label
          htmlFor="password"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
        >
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            maxLength={4096}
            placeholder="Enter your password"
            className="h-12 rounded-xl border-ink/10 bg-[#faf9fb] pr-12 transition-shadow focus:bg-white focus:shadow-[0_0_0_4px_rgba(64,34,98,.08)]"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
          >
            {showPassword ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm font-semibold text-deep underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          Forgot password?
        </Link>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm font-medium text-bad">
          {state.error}
        </p>
      ) : null}

      {!available ? (
        <p
          role="status"
          className="rounded-xl border border-ink/10 bg-lavender/50 px-3 py-2 text-sm text-muted"
        >
          Sign-in is not available in this preview yet.
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending || !available}
        className="fazoo-btn-shine h-12 w-full rounded-xl shadow-[0_10px_24px_rgba(64,34,98,.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(64,34,98,.28)]"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-center text-xs leading-5 text-muted">
        Your session stays signed in on this browser. Sign out when using a shared device.
      </p>
    </form>
  );
}
