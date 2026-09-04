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
      <PageHeader title="SKUs" description="Products available for sales recording. Add new products or remove ones you no longer track." />

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
                <tr key={s.id}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td className="font-mono text-xs">{s.code}</Td>
                  <Td>{s.status}</Td>
                  <Td className="text-right">
                    <form
                      action={async () => {
                        'use server';
                        const { client: c } = await requireStaff();
                        await c.rpc('admin_delete_sku' as never, { p_sku_id: s.id } as never);
                        revalidatePath('/skus');
                      }}
                    >
                      <Button type="submit" variant="destructive" className="h-8 px-3 text-xs">
                        Delete
                      </Button>
                    </form>
                  </Td>
                </tr>
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
