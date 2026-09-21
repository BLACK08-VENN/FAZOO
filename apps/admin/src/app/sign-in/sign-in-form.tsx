'use client';

import { useEffect, useRef, useState, useActionState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { signInAction, type SignInState } from './actions';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const initialState: SignInState = { error: null };

type RoleTab = 'admin' | 'ba' | 'brand';

const ROLE_TABS: {
  key: RoleTab;
  label: string;
  hint: string;
  field: string;
  placeholder: string;
}[] = [
  {
    key: 'admin',
    label: 'Admin',
    hint: 'Email + password',
    field: 'Email',
    placeholder: 'you@company.com',
  },
  {
    key: 'ba',
    label: 'Brand Ambassador',
    hint: 'Phone or email + password',
    field: 'Phone number or email',
    placeholder: '+234 803 123 4567 or you@company.com',
  },
  {
    key: 'brand',
    label: 'Brand / Client',
    hint: 'Email or phone + password',
    field: 'Email or phone number',
    placeholder: 'you@company.com or +234 803 123 4567',
  },
];

export function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<RoleTab>('admin');
  const [identifier, setIdentifier] = useState('');
  const active = ROLE_TABS.find((t) => t.key === role)!;
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const measure = () => {
    const roleIndex = ROLE_TABS.findIndex((t) => t.key === role);
    const tablist = tablistRef.current;
    const tab = tabRefs.current[roleIndex];
    if (tablist && tab) {
      const listRect = tablist.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      setPillStyle({
        left: tabRect.left - listRect.left,
        width: tabRect.width,
      });
    }
  };

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (tablistRef.current) ro.observe(tablistRef.current);
    return () => ro.disconnect();
  }, [role]);

  useEffect(() => {
    if (state.redirectTo) {
      window.location.href = state.redirectTo;
    }
  }, [state.redirectTo]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="role" value={role} />

      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Choose an account type"
        className="relative flex rounded-xl bg-ink/[0.04] p-1.5"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-0 rounded-lg bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            top: '0.375rem',
            bottom: '0.375rem',
            left: pillStyle.left,
            width: pillStyle.width,
          }}
        />
        {ROLE_TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[i] = el; }}
            role="tab"
            aria-selected={role === t.key}
            type="button"
            onClick={() => setRole(t.key)}
            className="flex-1 relative z-10 flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-center transition-all focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
          >
            <span className="text-xs font-bold text-ink">{t.label}</span>
            <span
              className={`text-[10px] leading-tight ${role === t.key ? 'text-primary' : 'text-muted'}`}
            >
              {t.hint}
            </span>
          </button>
        ))}
      </div>

      <div key={role} className="fazoo-pop-in">
        <Label
          htmlFor="identifier"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
        >
          {active.field}
        </Label>
        <Input
          id="identifier"
          name="identifier"
          aria-label="Mobile number or email"
          autoComplete="username"
          placeholder={active.placeholder}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="h-12 rounded-xl border-ink/10 bg-[#faf9fb] px-4 transition-shadow focus:bg-white focus:shadow-[0_0_0_4px_rgba(123,47,190,.08)]"
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
            placeholder="Enter your password"
            className="h-12 rounded-xl border-ink/10 bg-[#faf9fb] pr-12 transition-shadow focus:bg-white focus:shadow-[0_0_0_4px_rgba(123,47,190,.08)]"
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

      {state.error ? (
        <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm font-medium text-bad">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="fazoo-btn-shine h-12 w-full rounded-xl shadow-[0_10px_24px_rgba(123,47,190,.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(123,47,190,.28)]"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
