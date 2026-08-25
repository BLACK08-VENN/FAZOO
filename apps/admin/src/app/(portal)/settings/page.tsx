import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function SettingsPage() {
  const { client, profile } = await requireStaff();

  const { data: org } = await client
    .from('organizations')
    .select('*')
    .eq('id', profile.organization_id)
    .single();

  const allowFlaggedCheckout =
    (org?.settings as Record<string, unknown> | null)?.allow_out_of_geofence_checkout === true;

  return (
    <>
      <PageHeader title="Settings" description="Organization configuration." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Organization" />
          <CardBody className="space-y-2 text-sm">
            <p><span className="text-muted">Name:</span> {org?.name ?? '—'}</p>
            <p><span className="text-muted">Slug:</span> <code>{org?.slug ?? '—'}</code></p>
            <p><span className="text-muted">Timezone:</span> {org?.timezone ?? '—'}</p>
            <p>
              <span className="text-muted">Status:</span>{' '}
              <Badge tone={org?.status === 'active' ? 'success' : 'danger'}>{org?.status ?? 'unknown'}</Badge>
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Geofence policy"
            description="Applies to checkout; check-in outside the fence is always blocked."
          />
          <CardBody className="text-sm">
            {allowFlaggedCheckout ? (
              <p>
                Checkout outside the geofence is{' '}
                <Badge tone="warning">allowed &amp; flagged</Badge> for administrative review.
              </p>
            ) : (
              <p>
                Checkout outside the geofence is <Badge tone="danger">blocked</Badge>. BAs must be
                within the store radius.
              </p>
            )}
            <p className="mt-3 text-xs text-muted">
              Toggle via organizations.settings.allow_out_of_geofence_checkout (platform admin).
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
