'use client';

import { useEffect, useActionState } from 'react';
import { signInAction, type SignInState } from './actions';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const initialState: SignInState = { error: null };

export function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  useEffect(() => {
    if (state.redirectTo) {
      window.location.href = state.redirectTo;
    }
  }, [state.redirectTo]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="identifier" className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          Mobile number or email
        </Label>
        <Input
          id="identifier"
          name="identifier"
          autoComplete="username"
          placeholder="e.g. 0803 123 4567"
          className="h-12 rounded-xl border-ink/10 bg-[#faf9fb] px-4 transition-shadow focus:bg-white focus:shadow-[0_0_0_4px_rgba(123,47,190,.08)]"
          required
        />
      </div>
      <div>
        <Label htmlFor="password" className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          className="h-12 rounded-xl border-ink/10 bg-[#faf9fb] px-4 transition-shadow focus:bg-white focus:shadow-[0_0_0_4px_rgba(123,47,190,.08)]"
          required
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm font-medium text-bad">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-12 w-full rounded-xl shadow-[0_10px_24px_rgba(123,47,190,.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(123,47,190,.28)]"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
