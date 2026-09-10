import { redirect } from 'next/navigation';
import { requireClient } from '@/lib/client-auth';
import { PageHeader } from '@/components/page';
import { BaWebLogs } from './web-logs';

export default async function BrandAmbassadorLogsPage() {
  const { client, profile, brand } = await requireClient();

  if (profile.role !== 'brand_ambassador') redirect('/brand');

  const { data: kindData } = await client.rpc('current_user_org_kind');
  const organizationKind = kindData === 'schools' ? 'schools' : 'retail';

  const heading =
    organizationKind === 'schools'
      ? {
          title: 'My schools',
          description: `Where every school you have logged for ${brand.name} has got to in the booklist pipeline.`,
        }
      : {
          title: 'Create a field log',
          description: `Submit ${brand.name} field activity from your phone or computer browser.`,
        };

  return (
    <>
      <PageHeader title={heading.title} description={heading.description} />
      <BaWebLogs
        organizationId={profile.organization_id}
        userId={profile.id}
        organizationKind={organizationKind}
      />
    </>
  );
}

export function generateMetadata() {
  return { title: 'Field Work — Fazoo' };
}
