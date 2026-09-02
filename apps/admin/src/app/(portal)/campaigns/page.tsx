import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TableWrap, Table, Td, Th } from '@/components/ui/table';
import { campaignInputSchema, assignmentInputSchema } from '@fazoo/validation';
import { WEEKDAY_NAMES } from '@fazoo/config';

export default async function CampaignsPage() {
  const { client } = await requireStaff();
  const [{ data: campaigns }, { data: bas }, { data: stores }] = await Promise.all([
    client.from('campaigns').select('*').order('start_date', { ascending: false }),
    client
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'brand_ambassador')
      .eq('account_status', 'approved')
      .order('full_name'),
    client.from('stores').select('id, name').eq('status', 'active').order('name'),
  ]);

  return (
    <>
      <PageHeader title="Campaigns" description="Programs BAs are assigned to." />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <TableWrap>
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>Period</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {(campaigns ?? []).map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="text-xs">{c.start_date} → {c.end_date ?? 'open'}</Td>
                  <Td>{c.status}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Add a campaign" />
            <CardBody>
              <form
                action={async (formData: FormData) => {
                  'use server';
                  const parsed = campaignInputSchema.safeParse({
                    name: formData.get('name'),
                    description: formData.get('description') || null,
                    start_date: formData.get('start_date'),
                    end_date: formData.get('end_date') || null,
                    status: 'active',
                  });
                  if (!parsed.success) return;
                  const { client: c, profile } = await requireStaff();
                  await c.from('campaigns').insert({ ...parsed.data, organization_id: profile.organization_id });
                  revalidatePath('/campaigns');
                }}
                className="space-y-3"
              >
                <div>
                  <Label htmlFor="c-name">Name</Label>
                  <Input id="c-name" name="name" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="c-start">Start</Label>
                    <Input id="c-start" name="start_date" type="date" required />
                  </div>
                  <div>
                    <Label htmlFor="c-end">End</Label>
                    <Input id="c-end" name="end_date" type="date" />
                  </div>
                </div>
                <Button type="submit" className="w-full">Create campaign</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Assign a BA" description="Sets store + weekly off-day." />
            <CardBody>
              <form
                action={async (formData: FormData) => {
                  'use server';
                  const offDays = formData
                    .getAll('weekly_off_day')
                    .map((d) => Number(d))
                    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
                  const parsed = assignmentInputSchema.safeParse({
                    brand_ambassador_id: formData.get('ba_id'),
                    campaign_id: formData.get('campaign_id'),
                    store_id: formData.get('store_id'),
                    weekly_off_day: offDays,
                    start_date: formData.get('start_date'),
                    status: 'active',
                  });
                  if (!parsed.success) return;

                  const { client: c, profile: actor } = await requireStaff();
                  if (actor.role === 'supervisor') return;
                  await c.rpc('admin_upsert_assignment', {
                    p_brand_ambassador_id: parsed.data.brand_ambassador_id,
                    p_campaign_id: parsed.data.campaign_id,
                    p_store_id: parsed.data.store_id,
                    p_weekly_off_day: offDays,
                    p_start_date: parsed.data.start_date,
                  });
                  revalidatePath('/campaigns');
                }}
                className="space-y-3"
              >
                <div>
                  <Label htmlFor="a-ba">Brand Ambassador</Label>
                  <Select id="a-ba" name="ba_id" required>
                    {(bas ?? []).map((b) => (
                      <option key={b.id} value={b.id}>{b.full_name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="a-campaign">Campaign</Label>
                  <Select id="a-campaign" name="campaign_id" required>
                    {(campaigns ?? []).filter((c) => c.status === 'active').map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="a-store">Store</Label>
                  <Select id="a-store" name="store_id" required>
                    {(stores ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </div>
                <fieldset>
                  <legend className="text-sm font-medium text-ink">Weekly off-days</legend>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {WEEKDAY_NAMES.map((d, i) => (
                      <label
                        key={d}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm text-charcoal has-[:checked]:border-primary has-[:checked]:bg-lavender"
                      >
                        <input
                          type="checkbox"
                          name="weekly_off_day"
                          value={i}
                          className="size-4 accent-primary"
                        />
                        {d.slice(0, 3)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <Label htmlFor="a-start">Effective from</Label>
                  <Input id="a-start" name="start_date" type="date" required />
                </div>
                <Button type="submit" className="w-full">Assign BA</Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
