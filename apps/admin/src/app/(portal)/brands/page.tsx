import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { CreateBrandForm, type BaOption } from './create-brand-form';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';

interface BrandRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  campaigns: { count: number }[];
  stores: { count: number }[];
  skus: { count: number }[];
}

export default async function BrandsPage() {
  const { client, profile } = await requireStaff();

  const [{ data: brandsRaw }, { data: bas }] = await Promise.all([
    client
      .from('organizations')
      .select(
        `id, name, slug, status,
         campaigns:campaigns(count),
         stores:stores(count),
         skus:skus(count)`,
      )
      .order('name'),
    client
      .from('profiles')
      .select('id, full_name, phone')
      .eq('role', 'brand_ambassador')
      .eq('account_status', 'approved')
      .order('full_name'),
  ]);

  const brands = (brandsRaw ?? []) as BrandRow[];
  const baOptions: BaOption[] = (bas ?? []).map((b) => ({
    id: b.id,
    full_name: b.full_name,
    phone: b.phone,
  }));

  const showOrgList = profile.role === 'super_admin';

  return (
    <>
      <PageHeader title="Brand" description="Manage your brands (organizations). Create a new brand, view its footprint, or remove one." />

      {showOrgList ? (
        <TableWrap className="mb-8">
          <Table>
            <thead>
              <tr>
                <Th>Brand</Th>
                <Th>Slug</Th>
                <Th>Status</Th>
                <Th className="text-right">Campaigns</Th>
                <Th className="text-right">Stores</Th>
                <Th className="text-right">SKUs</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {brands.length === 0 ? (
                <EmptyRow colSpan={7}>No brands yet. Create your first brand below.</EmptyRow>
              ) : (
                brands.map((b) => (
                  <tr key={b.id} className="hover:bg-lavender/60">
                    <Td className="font-medium">{b.name}</Td>
                    <Td className="font-mono text-xs text-muted">{b.slug}</Td>
                    <Td>
                      <Badge tone={b.status === 'active' ? 'success' : 'warning'}>{b.status}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{b.campaigns?.[0]?.count ?? 0}</Td>
                    <Td className="text-right tabular-nums">{b.stores?.[0]?.count ?? 0}</Td>
                    <Td className="text-right tabular-nums">{b.skus?.[0]?.count ?? 0}</Td>
                    <Td className="text-right">
                      <form
                        action={async () => {
                          'use server';
                          const { client: c } = await requireStaff();
                          await c.rpc(
                            'admin_delete_organization' as never,
                            { p_org_id: b.id } as never,
                          );
                          revalidatePath('/brands');
                        }}
                      >
                        <Button type="submit" variant="destructive" className="h-8 px-3 text-xs">
                          Delete
                        </Button>
                      </form>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>
      ) : (
        <Card className="mb-8">
          <CardHeader
            title={`${brands[0]?.name ?? 'Your brand'}`}
            description={`Slug: ${brands[0]?.slug ?? '—'} · ${brands[0]?.campaigns?.[0]?.count ?? 0} campaigns · ${brands[0]?.stores?.[0]?.count ?? 0} stores · ${brands[0]?.skus?.[0]?.count ?? 0} SKUs`}
          />
        </Card>
      )}

      <CreateBrandForm bas={baOptions} />
    </>
  );
}
