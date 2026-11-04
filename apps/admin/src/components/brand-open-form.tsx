'use client';
import { useActionState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { openAdminBrandAction } from '@/app/(portal)/actions';
import { Button } from '@/components/ui/button';

export function BrandOpenForm({
  organizationId,
  brandName,
  requestId,
}: {
  organizationId: string;
  brandName: string;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(openAdminBrandAction, { error: null });
  return (
    <form action={action}>
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="client_request_id" value={requestId} />
      <Button
        className="min-h-11 w-full justify-between"
        disabled={pending}
        aria-label={`Open ${brandName}`}
      >
        {pending ? 'Opening workspace…' : 'Open brand'}
        <ArrowUpRight size={16} />
      </Button>
      {state.error ? (
        <p className="mt-2 text-sm text-bad" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
