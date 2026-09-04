import { revalidatePath } from 'next/cache';
import { WEEKDAY_NAMES } from '@fazoo/config';
import { assignmentInputSchema, campaignInputSchema } from '@fazoo/validation';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { requireStaff } from '@/lib/auth';

export default async function CampaignsPage() {
  const { client, profile } = await requireStaff();

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
      <PageHeader
        title="Campaigns"
        description="Create campaigns quickly, assign BAs, and remove campaigns you no longer need."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th>Passcode</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(campaigns ?? []).map((campaign) => (
                <tr key={campaign.id}>
                  <Td className="font-medium">{campaign.name}</Td>
                  <Td className="text-xs">
                    {campaign.start_date} → {campaign.end_date ?? 'open'}
                  </Td>
                  <Td>{campaign.status}</Td>
                  <Td>
                    <form
                      action={async (formData: FormData) => {
                        'use server';
                        const nextCode = String(formData.get('access_code') ?? '').trim();
                        const { client: scoped } = await requireStaff();
                        await scoped
                          .from('campaigns')
                          .update({ access_code: nextCode || null })
                          .eq('id', campaign.id);
                        revalidatePath('/campaigns');
                      }}
                      className="flex items-center gap-2"
                    >
                      <Input
                        name="access_code"
                        defaultValue={campaign.access_code ?? ''}
                        placeholder="none"
                        className="h-9 w-32 text-xs"
                        aria-label={`Passcode for ${campaign.name}`}
                      />
                      <Button type="submit" variant="outline" className="h-9 px-3 text-xs">
                        {campaign.access_code ? 'Update' : 'Set'}
                      </Button>
                    </form>
                  </Td>
                  <Td>
                    {profile.role !== 'supervisor' ? (
                      <form
                        action={async () => {
                          'use server';
                          const { client: scoped } = await requireStaff();
                          await scoped.rpc(
                            'admin_delete_campaign' as never,
                            { p_campaign_id: campaign.id } as never,
                          );
                          revalidatePath('/campaigns');
                        }}
                      >
                        <Button type="submit" variant="destructive" className="h-9 px-3 text-xs">
                          Delete
                        </Button>
                      </form>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Quick campaign" description="Only the essentials are required." />
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

                  const { client: scoped } = await requireStaff();
                  await scoped.from('campaigns').insert({
                    ...parsed.data,
                    organization_id: profile.organization_id,
                  });
                  revalidatePath('/campaigns');
                }}
                className="space-y-3"
              >
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Back to school activation" required />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" placeholder="Optional notes" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="start_date">Start</Label>
                    <Input id="start_date" name="start_date" type="date" required />
                  </div>
                  <div>
                    <Label htmlFor="end_date">End</Label>
                    <Input id="end_date" name="end_date" type="date" />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  Create campaign
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Quick BA assignment"
              description="Assign one ambassador to one campaign/store in one step."
            />
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

                  const { client: scoped, profile: actor } = await requireStaff();
                  if (actor.role === 'supervisor') return;
                  await scoped.rpc('admin_upsert_assignment', {
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
                    {(bas ?? []).map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.full_name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="a-campaign">Campaign</Label>
                  <Select id="a-campaign" name="campaign_id" required>
                    {(campaigns ?? [])
                      .filter((campaign) => campaign.status === 'active')
                      .map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="a-store">Store</Label>
                  <Select id="a-store" name="store_id" required>
                    {(stores ?? []).map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <fieldset>
                  <legend className="text-sm font-medium text-ink">Weekly off-days</legend>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {WEEKDAY_NAMES.map((day, index) => (
                      <label
                        key={day}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm text-charcoal has-[:checked]:border-primary has-[:checked]:bg-lavender"
                      >
                        <input
                          type="checkbox"
                          name="weekly_off_day"
                          value={index}
                          className="size-4 accent-primary"
                        />
                        {day.slice(0, 3)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <Label htmlFor="a-start">Effective from</Label>
                  <Input id="a-start" name="start_date" type="date" required />
                </div>
                <Button type="submit" className="w-full">
                  Assign BA
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}