'use client';

import { useActionState, useState } from 'react';
import { deleteDailyLogAction } from './[id]/actions';

export function InlineDeleteLog({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(async (_previous: { error: string } | null, data: FormData) => {
    return (await deleteDailyLogAction(data)) ?? null;
  }, null);

  if (!open) {
    return (
      <button
        type="button"
        className="text-sm font-medium text-red-700 underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        Delete
      </button>
    );
  }

  return (
    <form action={action} className="min-w-56 space-y-2 text-right">
      <p className="text-left text-xs text-muted">
        Permanently delete <span className="font-medium text-ink">{label}</span>? Type DELETE to confirm.
      </p>
      <input type="hidden" name="log_id" value={id} />
      <input type="hidden" name="client_request_id" value={requestId} />
      <input
        aria-label="Type DELETE to confirm"
        autoComplete="off"
        className="block w-full rounded-lg border border-ink/20 px-2 py-1 text-sm"
        name="confirmation"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {state?.error ? <p role="alert" className="text-xs text-red-700">{state.error}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-1 text-sm"
          onClick={() => { setOpen(false); setConfirmation(''); }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={confirmation !== 'DELETE' || pending}
          className="rounded-lg bg-red-700 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete permanently'}
        </button>
      </div>
    </form>
  );
}