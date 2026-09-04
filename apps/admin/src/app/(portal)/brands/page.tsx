import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { CreateBrandForm, type BaOption } from './create-brand-form';

export default async function BrandsPage() {
  const { client } = await requireStaff();

  const { data: bas } = await client
    .from('profiles')
    .select('id, full_name, phone')
    .eq('role', 'brand_ambassador')
    .eq('account_status', 'approved')
    .order('full_name');

  const baOptions: BaOption[] = (bas ?? []).map((b) => ({
    id: b.id,
    full_name: b.full_name,
    phone: b.phone,
  }));

  return (
    <>
      <PageHeader title="Add brand" description="Create a brand and its admin quickly. You can add campaigns, schools, stores, and BAs after setup." />
      <CreateBrandForm bas={baOptions} />
    </>
  );
}
