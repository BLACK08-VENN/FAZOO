import { redirect } from 'next/navigation';
import type { BaTodayResult } from '@fazoo/types';
import { requireClient } from '@/lib/client-auth';
import { PageHeader } from '@/components/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { LeaveForm, type LeaveAssignment } from './leave-form';

type LeaveRow = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  review_note: string | null;
  created_at: string;
};

const statusTone: Record<LeaveRow['status'], string> = {
  pending: 'bg-warn/10 text-warn',
  approved: 'bg-ok/10 text-ok',
  denied: 'bg-bad/10 text-bad',
  cancelled: 'bg-ink/5 text-muted',
};

export default async function BrandLeavePage() {
  const { client, profile } = await requireClient();
  if (profile.role !== 'brand_ambassador') redirect('/brand');

  const [{ data: todayData }, { data: requestData }] = await Promise.all([
    client.rpc('ba_today'),
    client
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, status, review_note, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const today = todayData as unknown as BaTodayResult | null;
  const assignments: LeaveAssignment[] = (today?.assignments ?? []).map(({ assignment }) => ({
    id: assignment.id,
    label:
      [assignment.store_name, assignment.campaign_name].filter(Boolean).join(' · ') ||
      'Active assignment',
  }));
  const requests = (requestData ?? []) as LeaveRow[];

  return (
    <>
      <PageHeader
        title="Apply for Leave"
        description="Send a leave request to an admin and follow its approval status."
      />

      <Card>
        <CardHeader title="New leave request" description="Complete all dates and give a clear reason for the request." />
        <CardBody><LeaveForm assignments={assignments} /></CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="My leave requests" description="Your most recent requests and admin decisions." />
        {requests.length === 0 ? (
          <CardBody><p className="text-sm text-muted">You have not submitted a leave request yet.</p></CardBody>
        ) : (
          <div className="divide-y divide-ink/8">
            {requests.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div>
                  <p className="text-sm font-semibold capitalize text-ink">{request.leave_type.replaceAll('_', ' ')}</p>
                  <p className="mt-1 text-sm text-muted">{request.start_date} to {request.end_date}</p>
                  {request.review_note ? <p className="mt-2 text-sm text-muted"><span className="font-medium text-ink">Admin note:</span> {request.review_note}</p> : null}
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold uppercase ${statusTone[request.status]}`}>{request.status}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export function generateMetadata() {
  return { title: 'Apply for Leave — Fazoo' };
}
