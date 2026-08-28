import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, attendanceTone } from '@/components/ui/badge';
import { requireStaff, isElevated } from '@/lib/auth';
import { reviewLeaveRequest } from '../actions';
import { PrintButton } from './print-button';

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{children}</dd>
    </div>
  );
}

export default async function LeaveRequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reviewed?: string }>;
}) {
  const { client, profile } = await requireStaff();
  const { id } = await params;
  const notice = await searchParams;
  const { data: row } = await client
    .from('leave_requests')
    .select(
      '*, profiles!leave_requests_brand_ambassador_id_fkey(full_name, phone), stores(name)',
    )
    .eq('id', id)
    .single();
  if (!row) notFound();
  const ba = row.profiles as unknown as { full_name: string; phone: string };
  const store = row.stores as unknown as { name: string };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/leave-requests"
          className="text-sm font-semibold text-deep hover:underline"
        >
          ← Back to leave requests
        </Link>
        <PrintButton />
      </div>
      {notice.error ? (
        <p
          role="alert"
          className="no-print mb-4 rounded-xl border border-bad/20 bg-bad/10 p-3 text-sm font-medium text-bad"
        >
          {notice.error}
        </p>
      ) : null}
      {notice.reviewed ? (
        <p
          role="status"
          className="no-print mb-4 rounded-xl border border-ok/20 bg-ok/10 p-3 text-sm font-medium text-ok"
        >
          Decision recorded successfully.
        </p>
      ) : null}
      <article className="print-sheet overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-4 bg-ink p-7 text-white">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-bright">
              Fazoo workforce operations
            </p>
            <h1 className="mt-2 text-3xl font-bold">Leave Application</h1>
            <p className="mt-2 text-sm text-white/60">
              Reference {row.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <Badge tone={attendanceTone(row.status)}>{row.status}</Badge>
        </header>
        <div className="p-7">
          <section>
            <h2 className="mb-4 border-b border-ink/10 pb-2 text-lg font-bold text-ink">
              Ambassador details
            </h2>
            <dl className="grid gap-5 sm:grid-cols-3">
              <Item label="Name">{ba.full_name}</Item>
              <Item label="Mobile number">{ba.phone}</Item>
              <Item label="Store">{store.name}</Item>
            </dl>
          </section>
          <section className="mt-8">
            <h2 className="mb-4 border-b border-ink/10 pb-2 text-lg font-bold text-ink">
              Leave details
            </h2>
            <dl className="grid gap-5 sm:grid-cols-3">
              <Item label="Leave type">
                <span className="capitalize">{row.leave_type.replaceAll('_', ' ')}</span>
              </Item>
              <Item label="Start date">{row.start_date}</Item>
              <Item label="End date">{row.end_date}</Item>
              <Item label="Expected return">{row.expected_return_date}</Item>
              <Item label="Supervisor informed">{row.supervisor_informed ? 'Yes' : 'No'}</Item>
              <Item label="Submitted">
                {new Date(row.created_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}
              </Item>
            </dl>
            {!row.supervisor_informed && row.supervisor_not_informed_reason ? (
              <div className="mt-5 rounded-xl bg-lavender p-4">
                <Item label="Why supervisor was not informed">
                  {row.supervisor_not_informed_reason}
                </Item>
              </div>
            ) : null}
            <div className="mt-5 rounded-xl bg-lavender p-4">
              <Item label="Reason for leave">{row.reason}</Item>
            </div>
            <div className="mt-5">
              <Item label="Supporting documents">
                {row.supporting_document_types.length
                  ? row.supporting_document_types
                      .map((value) => value.replaceAll('_', ' '))
                      .join(', ')
                  : 'None selected'}
              </Item>
            </div>
          </section>
          <section className="mt-8">
            <h2 className="mb-4 border-b border-ink/10 pb-2 text-lg font-bold text-ink">
              Admin decision
            </h2>
            {row.status === 'pending' ? (
              <p className="text-sm text-muted">Awaiting review.</p>
            ) : (
              <dl className="grid gap-5 sm:grid-cols-2">
                <Item label="Decision">
                  <span className="capitalize">{row.status}</span>
                </Item>
                <Item label="Decision date">
                  {row.reviewed_at
                    ? new Date(row.reviewed_at).toLocaleString('en-NG', {
                        timeZone: 'Africa/Lagos',
                      })
                    : '—'}
                </Item>
                <Item label="Review note">{row.review_note || 'No note provided'}</Item>
              </dl>
            )}
          </section>
          <footer className="mt-9 border-t border-ink/10 pt-4 text-xs text-muted">
            This document is generated from Fazoo's audited leave workflow. Profile and store
            details were verified server-side at submission.
          </footer>
        </div>
      </article>
      {row.status === 'pending' && isElevated(profile.role) ? (
        <section className="no-print mt-6 rounded-2xl border border-ink/10 bg-white p-6">
          <h2 className="text-lg font-bold text-ink">Record a decision</h2>
          <p className="mt-1 text-sm text-muted">
            A reason is required when denying a request. Decisions are final and added to the
            audit log.
          </p>
          <form action={reviewLeaveRequest} className="mt-4">
            <input type="hidden" name="leave_request_id" value={row.id} />
            <label htmlFor="review_note" className="text-sm font-semibold text-charcoal">
              Review note
            </label>
            <textarea
              id="review_note"
              name="review_note"
              maxLength={1000}
              rows={4}
              className="mt-2 w-full rounded-xl border border-ink/15 p-3 text-sm outline-none focus:border-primary"
              placeholder="Add context for the BA, especially when denying"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                name="decision"
                value="approve"
                className="rounded-lg bg-ok px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
              >
                Approve request
              </button>
              <button
                name="decision"
                value="deny"
                className="rounded-lg bg-bad px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
              >
                Deny request
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
