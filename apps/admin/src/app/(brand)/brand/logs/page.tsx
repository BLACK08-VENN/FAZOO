import { redirect } from 'next/navigation';
import { requireClient } from '@/lib/client-auth';
import { PageHeader } from '@/components/page';
import { BaWebLogs } from './web-logs';

export default async function BrandAmbassadorLogsPage() {
  const { client, profile, brand } = await requireClient();

  if (profile.role !== 'brand_ambassador') redirect('/brand');

  const { data: kindData } = await client.rpc('current_user_org_kind');
  const organizationKind = kindData === 'schools' ? 'schools' : 'retail';

  return (
    <>
      <PageHeader
        title="Create a field log"
        description={`Submit ${brand.name} field activity from your phone or computer browser.`}
      />
      <BaWebLogs
        organizationId={profile.organization_id}
        userId={profile.id}
        organizationKind={organizationKind}
      />
    </>
  );
}

export function generateMetadata() {
  return { title: 'Create Log — Fazoo' };
}
