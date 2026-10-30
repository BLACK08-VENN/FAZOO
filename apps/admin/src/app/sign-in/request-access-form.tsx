'use client';

import { useActionState, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { requestAccessAction, type AccessRequestState } from './request-access-action';

const ROLES = [
  {
    value: 'brand_ambassador',
    label: 'Brand Ambassador',
    description: 'Carry out store visits, tasks and campaign reporting.',
  },
  {
    value: 'client',
    label: 'Client / Brand Representative',
    description: 'View your company’s campaign results and reports.',
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    description: 'Coordinate field teams and review their work.',
  },
] as const;
const INITIAL_STATE: AccessRequestState = { error: null };

export function RequestAccessForm({
  requestId,
  available,
}: {
  requestId: string;
  available: boolean;
}) {
  const [state, action, pending] = useActionState(requestAccessAction, INITIAL_STATE);
  const [fields, setFields] = useState({
    full_name: '',
    contact: '',
    organization_name: '',
    requested_role: '',
  });
  const update = (name: keyof typeof fields, value: string) =>
    setFields((previous) => ({ ...previous, [name]: value }));

  return (
    <details className="group mt-6 rounded-2xl border border-ink/15 bg-white/[0.035]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span>
          New to FAZOO? <strong className="text-deep">Request access</strong>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-ink/10 p-4">
        {state.success ? (
          <p role="status" className="text-sm leading-6 text-ink">
            Your request has been sent for review. A Fazoo administrator will verify your
            organization and contact you about account setup. Access is not active yet.
          </p>
        ) : (
          <form action={action} className="space-y-4" aria-busy={pending}>
            <input type="hidden" name="client_request_id" value={requestId} />
            <div className="hidden" aria-hidden="true">
              <label htmlFor="access-website">Website</label>
              <input id="access-website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold text-ink">
                Which access are you requesting?
              </legend>
              {ROLES.map((role) => (
                <label
                  key={role.value}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${fields.requested_role === role.value ? 'border-primary bg-lavender/50' : 'border-ink/15 bg-white/[0.04]'}`}
                >
                  <input
                    type="radio"
                    name="requested_role"
                    value={role.value}
                    checked={fields.requested_role === role.value}
                    onChange={(event) => update('requested_role', event.target.value)}
                    className="mt-1 size-4 shrink-0 accent-primary"
                    required
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{role.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      {role.description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-xs leading-5 text-muted">
              Your role must be approved. Administrator access is by invitation only.
            </p>
            <div>
              <Label htmlFor="access-name">Full name</Label>
              <Input
                id="access-name"
                name="full_name"
                autoComplete="name"
                value={fields.full_name}
                onChange={(event) => update('full_name', event.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </div>
            <div>
              <Label htmlFor="access-contact">Email or phone number</Label>
              <Input
                id="access-contact"
                name="contact"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Include your country code for phone numbers"
                value={fields.contact}
                onChange={(event) => update('contact', event.target.value)}
                maxLength={254}
                required
              />
            </div>
            <div>
              <Label htmlFor="access-organization">Company or organization</Label>
              <Input
                id="access-organization"
                name="organization_name"
                autoComplete="organization"
                value={fields.organization_name}
                onChange={(event) => update('organization_name', event.target.value)}
                minLength={2}
                maxLength={160}
                required
              />
            </div>
            <p className="text-xs leading-5 text-muted">
              These details will be used to review your access request and contact you.
            </p>
            {state.error ? (
              <p role="alert" className="text-sm text-bad">
                {state.error}
              </p>
            ) : null}
            {!available ? (
              <p role="status" className="text-xs leading-5 text-muted">
                Requests cannot be submitted in this preview yet.
              </p>
            ) : null}
            <Button type="submit" size="lg" disabled={pending || !available} className="w-full">
              {pending ? 'Sending request…' : 'Submit access request'}
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}
