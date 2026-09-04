import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { BrandPicker } from '@/components/brand-picker';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { weeklyOffDayName, WEEKDAY_NAMES } from '@fazoo/config';

interface AssignmentRow {
  id: string;
  start_date: string;
  end_date: string | null;
  status: string;
  weekly_off_day: number[];
  profiles: { full_name: string } | null;
  veda_schools: { name: string; region: string | null } | null;
}

interface BrandOption {
  id: string;
  name: string;
}

export default async function BrandAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { client, profile } = await requireStaff();
  const { org } = await searchParams;

  const { data: brandsRaw } = await client
    .from('organizations')
    .select('id, name')
    .order('name');
  const brands = (brandsRaw ?? []) as BrandOption[];

  const selectedOrg = (() => {
    if (org && brands.some((b) => b.id === org)) return org;
    if (brands.some((b) => b.id === profile.organization_id)) return profile.organization_id;
    return brands[0]?.id;
  })();

  const [{ data: raw }, { data: bas }, { data: schools }] = await Promise.all([
    client
      .from('veda_assignments')
      .select(
        `id, start_date, end_date, status, weekly_off_day,
         profiles!veda_assignments_brand_ambassador_id_fkey ( full_name ),
         veda_schools!veda_assignments_school_id_fkey ( name, region )`,
      )
      .eq('organization_id', selectedOrg ?? '00000000-0000-0000-0000-000000000000')
      .order('start_date', { ascending: false })
      .limit(200),
    client
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'brand_ambassador')
      .eq('account_status', 'approved')
      .eq('organization_id', selectedOrg ?? '00000000-0000-0000-0000-000000000000')
      .order('full_name'),
    client
      .from('veda_schools')
      .select('id, name, region')
      .eq('status', 'active')
      .eq('organization_id', selectedOrg ?? '00000000-0000-0000-0000-000000000000')
      .order('name'),
  ]);

  const rows = (raw ?? []) as unknown as AssignmentRow[];

  return (
    <>
      <PageHeader
        title="Brand Assignments"
        description="Assign schools to BAs quickly so they appear immediately in the VEDA mobile app."
      >
        <BrandPicker action="/veda-assignments" brands={brands} current={selectedOrg} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Brand Ambassador</Th>
                <Th>School</Th>
                <Th>Weekly off-day</Th>
                <Th>Period</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={5}>
                  No school-visit assignments for this brand yet.
                </EmptyRow>
              ) : (
                rows.map((a) => (
                  <tr key={a.id}>
                    <Td className="font-medium">{a.profiles?.full_name ?? 'Unknown'}</Td>
                    <Td className="text-xs">
                      {a.veda_schools?.name ?? 'Unknown'}
                      {a.veda_schools?.region ? (
                        <span className="block text-muted">{a.veda_schools.region}</span>
                      ) : null}
                    </Td>
                    <Td>{weeklyOffDayName(a.weekly_off_day)}</Td>
                    <Td className="text-xs">
                      {a.start_date} → {a.end_date ?? 'open'}
                    </Td>
                    <Td>
                      <Badge tone={a.status === 'active' ? 'purple' : a.status === 'ended' ? 'neutral' : 'danger'}>
                        {a.status}
                      </Badge>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>

        <Card>
          <CardHeader title="Quick school assignment" description="Choose a BA and school to make it available in VEDA immediately." />
          <CardBody>
            <form
              action={async (formData: FormData) => {
                'use server';
                const offDays = formData
                  .getAll('weekly_off_day')
                  .map((d) => Number(d))
                  .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
                const startDate = String(formData.get('start_date') ?? '');
                const schoolId = String(formData.get('school_id') ?? '');
                const baId = String(formData.get('ba_id') ?? '');
                if (!schoolId || !baId || !startDate) return;

                const { client: c, profile: actor } = await requireStaff();
                if (actor.role === 'supervisor') return;
                await c.rpc('veda_admin_upsert_assignment', {
                  p_brand_ambassador_id: baId,
                  p_school_id: schoolId,
                  p_weekly_off_day: offDays,
                  p_start_date: startDate,
                  p_status: 'active',
                });
                revalidatePath('/veda-assignments');
              }}
              className="space-y-3"
            >
              <div>
                <Label htmlFor="va-ba">Brand Ambassador</Label>
                <Select id="va-ba" name="ba_id" required>
                  {(bas ?? []).map((b) => (
                    <option key={b.id} value={b.id}>{b.full_name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="va-school">School</Label>
                <Select id="va-school" name="school_id" required>
                  {(schools ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.region ? ` — ${s.region}` : ''}
                    </option>
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
                <Label htmlFor="va-start">Effective from</Label>
                <Input id="va-start" name="start_date" type="date" required />
              </div>
              <Button type="submit" className="w-full">Assign BA</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}