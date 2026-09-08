import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TableWrap, Table, Td, Th } from '@/components/ui/table';
import { skuInputSchema } from '@fazoo/validation';

export default async function SkusPage() {
  const { client } = await requireStaff();
  const [{ data: skus }, { data: campaigns }] = await Promise.all([
    client.from('skus').select('*').order('name'),
    client.from('campaigns').select('id, name').eq('status', 'active').order('name'),
  ]);

  return (
    <>
      <PageHeader title="SKUs" description="Products available for sales recording. Add, update, or remove products." />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(skus ?? []).map((s) => (
                <EditSkuRow key={s.id} sku={s} />
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
                const { client: c, profile } = await requireStaff();
                await c.from('skus').insert({ ...parsed.data, organization_id: profile.organization_id });
                revalidatePath('/skus');
              }}
              className="space-y-3"
            >
              <div>
                <Label htmlFor="k-campaign">Campaign</Label>
                <Select id="k-campaign" name="campaign_id" required>
                  {(campaigns ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
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
};

async function EditSkuRow({ sku }: { sku: SkuRow }) {
  return (
    <tr>
      <Td colSpan={3}>
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
