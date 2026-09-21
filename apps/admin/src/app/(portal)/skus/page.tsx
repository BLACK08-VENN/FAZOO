import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TableWrap, Table, Td, Th } from '@/components/ui/table';
import { skuInputSchema } from '@fazoo/validation';

type SkusSearchParams = { brand?: string };

type ReadableBrand = { id: string; name: string; slug: string };

export default async function SkusPage({
  searchParams,
}: {
  searchParams: Promise<SkusSearchParams>;
}) {
  const { client, profile } = await requireStaff();
  const params = await searchParams;
  const requestedBrand = String(params.brand ?? '').trim();

  const [{ data: orgs }, { data: campaigns }] = await Promise.all([
    client.from('organizations').select('id, name, slug').eq('status', 'active').order('name'),
    client
      .from('campaigns')
      .select('id, name, organization_id')
      .eq('status', 'active')
      .order('name'),
  ]);

  const readable = (orgs ?? []).filter(
    (o) => profile.role === 'super_admin' || o.id === profile.organization_id,
  ) as ReadableBrand[];

  // Brand scope: explicit "all", a picked brand, or fall back to the caller's
  // current workspace (the brand shown in the portal header).
  const allBrands = requestedBrand === 'all';
  const picked = readable.find((o) => o.id === requestedBrand) ?? null;
  const active =
    readable.find((o) => o.id === profile.organization_id) ?? readable[0] ?? null;
  const scopeBrand = allBrands ? null : picked ?? active;
  const brandId = scopeBrand?.id ?? null;

  const skuQuery = client.from('skus').select('*, organizations(name)').order('name');
  if (brandId) skuQuery.eq('organization_id', brandId);
  const { data: skus } = await skuQuery;

  const scopedCampaigns = brandId
    ? (campaigns ?? []).filter((c) => c.organization_id === brandId)
    : campaigns ?? [];

  return (
    <>
      <PageHeader
        title="SKUs"
        description="Products available for sales recording, grouped by brand. Add, update, or remove products for the selected workspace."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <form action="/skus" method="get" className="flex items-end gap-3">
          <div>
            <Label htmlFor="sku-brand">Brand</Label>
            <Select
              id="sku-brand"
              name="brand"
              defaultValue={scopeBrand ? scopeBrand.id : 'all'}
            >
              <option value="all">All brands</option>
              {readable.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="outline">View</Button>
        </form>
        <p className="text-sm text-muted">
          {scopeBrand
            ? `Showing ${(skus ?? []).length} SKU${(skus ?? []).length === 1 ? '' : 's'} for ${scopeBrand.name}.`
            : 'Showing SKUs across all brands.'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <TableWrap>
          <Table>
            <thead>
              <tr>
                {allBrands ? <Th>Brand</Th> : null}
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {((skus ?? []) as SkuRow[]).map((s) => (
                <EditSkuRow key={s.id} sku={s} showBrand={allBrands} />
              ))}
            </tbody>
          </Table>
        </TableWrap>

        <Card>
          <CardHeader title="Add a SKU" />
          <CardBody>
            <form
              action={async (formData: FormData) => {
                'use server';
                const parsed = skuInputSchema.safeParse({
                  campaign_id: formData.get('campaign_id'),
                  name: formData.get('name'),
                  code: String(formData.get('code') ?? '').trim(),
                  description: formData.get('description') || null,
                  status: 'active',
                });
                if (!parsed.success) return;
                const { client: c, profile: p } = await requireStaff();
                await c.from('skus').insert({
                  ...parsed.data,
                  organization_id: brandId ?? p.organization_id,
                });
                revalidatePath('/skus');
              }}
              className="space-y-3"
            >
              <div>
                <Label htmlFor="k-campaign">Campaign</Label>
                <Select id="k-campaign" name="campaign_id" required>
                  {scopedCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                {scopedCampaigns.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">
                    No active campaigns in this brand yet — create one first.
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="k-name">Product name</Label>
                <Input id="k-name" name="name" required />
              </div>
              <div>
                <Label htmlFor="k-code">Code</Label>
                <Input id="k-code" name="code" required placeholder="e.g. TP-E14-G6" pattern="[A-Za-z0-9._-]{2,40}" />
              </div>
              <Button type="submit" className="w-full">Create SKU</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

type SkuRow = {
  id: string;
  organization_id: string;
  campaign_id: string;
  name: string;
  code: string;
  description: string | null;
  status: 'active' | 'inactive';
  organizations?: { name: string } | null;
};

async function EditSkuRow({ sku, showBrand }: { sku: SkuRow; showBrand: boolean }) {
  return (
    <tr>
      <Td colSpan={showBrand ? 4 : 3}>
        <form
          id={`sku-edit-${sku.id}`}
          action={async (formData: FormData) => {
            'use server';
            const parsed = skuInputSchema.safeParse({
              campaign_id: sku.campaign_id,
              name: formData.get('name'),
              code: formData.get('code'),
              description: formData.get('description') || null,
              status: formData.get('status'),
            });
            if (!parsed.success) return;
            const { client: c } = await requireStaff();
            await c.from('skus').update({
              name: parsed.data.name,
              code: parsed.data.code,
              description: parsed.data.description,
              status: parsed.data.status,
            }).eq('id', sku.id);
            revalidatePath('/skus');
          }}
          className="flex flex-wrap items-end gap-3"
        >
          {showBrand ? (
            <div className="min-w-32">
              <Label>Brand</Label>
              <p className="pt-1 text-sm font-semibold">{sku.organizations?.name ?? '—'}</p>
            </div>
          ) : null}
          <input type="hidden" name="description" value={sku.description ?? ''} />
          <div className="min-w-40 flex-1">
            <Label htmlFor={`s-name-${sku.id}`}>Name</Label>
            <Input id={`s-name-${sku.id}`} name="name" defaultValue={sku.name} required />
          </div>
          <div className="min-w-28">
            <Label htmlFor={`s-code-${sku.id}`}>Code</Label>
            <Input id={`s-code-${sku.id}`} name="code" defaultValue={sku.code} required pattern="[A-Za-z0-9._-]{2,40}" className="font-mono text-xs" />
          </div>
          <div>
            <Label htmlFor={`s-status-${sku.id}`}>Status</Label>
            <Select id={`s-status-${sku.id}`} name="status" defaultValue={sku.status}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </Select>
          </div>
        </form>
      </Td>
      <Td className="text-right">
        <div className="flex flex-col items-end gap-1">
          <Button type="submit" form={`sku-edit-${sku.id}`} className="h-8 px-3 text-xs">Update</Button>
          <form
            action={async () => {
              'use server';
              const { client: c } = await requireStaff();
              await c.rpc('admin_delete_sku' as never, { p_sku_id: sku.id } as never);
              revalidatePath('/skus');
            }}
          >
            <Button type="submit" variant="destructive" className="h-8 px-3 text-xs">Delete</Button>
          </form>
        </div>
      </Td>
    </tr>
  );
}