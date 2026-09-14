'use client';

import { useActionState, useState } from 'react';
import { deleteDailyLogAction } from './actions';

export function DeleteLogForm({ id, label, salesCount, photoCount }: {
  id: string;
  label: string;
  salesCount: number;
  photoCount: number;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(async (_previous: { error: string } | null, data: FormData) => {
    return (await deleteDailyLogAction(data)) ?? null;
  }, null);

  return (
    <section className="mt-6 rounded-xl border border-red-200 bg-white p-5">
      <h2 className="font-semibold text-ink">Remove incorrect log</h2>
      <p className="mt-1 text-sm text-muted">
        Deleting this log also removes {salesCount} sale entries and {photoCount} photo records from reports.
        The deletion remains visible in Audit Logs.
      </p>
      {!reviewing ? (
        <button type="button" className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700" onClick={() => setReviewing(true)}>
          Review deletion
        </button>
      ) : (
        <form action={action} className="mt-4 space-y-3">
          <p className="text-sm font-medium text-ink">You are deleting {label}. Type DELETE to confirm.</p>
          <input type="hidden" name="log_id" value={id} />
          <input type="hidden" name="client_request_id" value={requestId} />
          <input
            aria-label="Type DELETE to confirm"
            autoComplete="off"
            className="block w-full max-w-xs rounded-lg border border-ink/20 px-3 py-2 text-sm"
            name="confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {state?.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
          <div className="flex gap-3">
            <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => { setReviewing(false); setConfirmation(''); }}>Cancel</button>
            <button type="submit" disabled={confirmation !== 'DELETE' || pending} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? 'Deleting…' : 'Delete log permanently'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
