import Link from 'next/link';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { requireClient } from '@/lib/client-auth';
import { PageHeader } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { requestCampaignAction } from './actions';

export default async function NewCampaignRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile } = await requireClient();
  if (profile.role !== 'client') redirect('/brand');

  const params = await searchParams;
  const requestId = randomUUID();

  return (
    <>
      <PageHeader
        title="Request a campaign"
        description="Tell us what you want to activate. An administrator reviews every request before it goes live."
      >
        <Link
          href="/brand/campaigns"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Campaign analytics
        </Link>
      </PageHeader>

      {params.error ? (
        <Card className="mb-5 border-bad/30 bg-bad/5 p-4">
          <p className="text-sm font-medium text-bad" role="alert">
            {params.error}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-5">
          <form action={requestCampaignAction} className="space-y-4">
            <input type="hidden" name="client_request_id" value={requestId} />
            <div>
              <Label htmlFor="name">Campaign name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Back to school activation"
                required
                minLength={2}
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="description">What should happen in the field?</Label>
              <textarea
                id="description"
                name="description"
                rows={5}
                maxLength={2000}
                placeholder="Stores, products, expected coverage and any special instructions."
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="start_date">Start date</Label>
                <Input id="start_date" name="start_date" type="date" required />
              </div>
              <div>
                <Label htmlFor="end_date">End date (optional)</Label>
                <Input id="end_date" name="end_date" type="date" />
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
            >
              Submit for approval
            </button>
          </form>
        </Card>

        <Card className="h-fit p-5">
          <h2 className="text-sm font-semibold text-ink">What happens next</h2>
          <ol className="mt-3 space-y-3 text-sm text-muted">
            <li className="flex gap-2">
              <span className="font-semibold text-ink">1.</span>
              Your request appears as <span className="font-medium text-ink">Awaiting approval</span>.
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-ink">2.</span>
              A company administrator reviews the campaign, dates and plan.
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-ink">3.</span>
              Approved activations move into campaign analytics. You can follow progress
              here without seeing ambassador personal details.
            </li>
          </ol>
          <p className="mt-4 border-t border-ink/8 pt-3 text-xs text-muted">
            Field teams and maintenance services are managed by your administrator. Use the
            Service desk to raise a maintenance or service issue.
          </p>
        </Card>
      </div>
    </>
  );
}

export function generateMetadata() {
  return { title: 'Request a campaign — Brand Dashboard' };
}
