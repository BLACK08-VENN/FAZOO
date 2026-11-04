import { PartnerDashboard } from '@/components/partners/dashboard';
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (typeof v === 'string') params.set(k, v);
  return <PartnerDashboard params={params} basePath="/partners" />;
}
export const metadata = { title: 'Lenovo Partner Dashboard — Fazoo' };
