import { redirect } from 'next/navigation';
import { requireClient } from '@/lib/client-auth';
import { PageHeader } from '@/components/page';
import { BaWebLogs } from './web-logs';
import { SchoolBooklistWorkflow } from './school-booklist-workflow';

export default async function BrandAmbassadorLogsPage() {
  const { client, profile, brand } = await requireClient();

  if (profile.role !== 'brand_ambassador') redirect('/brand');

  const { data: kindData } = await client.rpc('current_user_org_kind');
  const organizationKind = kindData === 'schools' ? 'schools' : 'retail';

  const heading =
    organizationKind === 'schools'
      ? {
          title: 'My schools',
          description: `Create school booklist logs for ${brand.name} and follow every school from first approach to stamped-copy completion.`,
        }
      : {
          title: 'Create a field log',
          description: `Submit ${brand.name} field activity from your phone or computer browser.`,
        };

  return (
    <>
      <PageHeader title={heading.title} description={heading.description} />
      {organizationKind === 'schools' ? (
        <SchoolBooklistWorkflow organizationId={profile.organization_id} userId={profile.id} />
      ) : (
        <BaWebLogs
          organizationId={profile.organization_id}
          userId={profile.id}
          organizationKind="retail"
        />
      )}
    </>
  );
}

export function generateMetadata() {
  return { title: 'Field Work — Fazoo' };
}
