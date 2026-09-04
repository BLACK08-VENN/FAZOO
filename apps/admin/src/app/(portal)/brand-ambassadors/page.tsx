import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireStaff, isElevated } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { Badge, attendanceTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { AddBaForm } from './add-ba-form';

export default async function BrandAmbassadorsPage() {
  const { client, profile } = await requireStaff();
  const elevated = isElevated(profile.role);

  const [{ data: bas }, { data: pendingRaw }, { data: schools }] = await Promise.all([
    client
      .from('profiles')
      .select('id, full_name, phone, role, account_status, organization_id')
      .eq('role', 'brand_ambassador')
      .order('full_name'),
    client.rpc('admin_list_pending_memberships'),
    client
      .from('veda_schools')
      .select('id, name, region')
      .eq('status', 'active')
      .order('name'),
  ]);

  const pending = (pendingRaw as PendingMembership[] | null) ?? [];

  return (
    <>
      <PageHeader title="Brand Ambassadors" description="Approvals, status and history." />

      <Card className="mb-6">
        <CardHeader
          title="Pending registration queue"
          description="New BAs wait here until an administrator approves them, per brand."
        />
        <CardBody className="p-0">
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Mobile</Th>
                  <Th>Brand</Th>
                  <Th>Status</Th>
                  {elevated ? <Th className="text-right">Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 ? (
                  <EmptyRow colSpan={5}>No pending registrations.</EmptyRow>
                ) : (
                  pending.map((p) => (
                    <tr key={p.membership_id}>
                      <Td className="font-medium">{p.full_name}</Td>
                      <Td>{p.phone}</Td>
                      <Td>{p.brand_name}</Td>
                      <Td>
                        <Badge tone={attendanceTone(p.account_status)}>
                          {p.account_status}
                        </Badge>
                      </Td>
                      {elevated ? (
                        <Td>
                          <div className="flex justify-end gap-2">
                             <ApproveButtons profileId={p.user_id} schools={(schools ?? []) as SchoolOption[]} />
                          </div>
                        </Td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        </CardBody>
      </Card>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Mobile</Th>
              <Th>Account status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {(bas ?? []).map((ba) => (
              <tr key={ba.id} className="hover:bg-lavender/60">
                <Td className="font-medium">{ba.full_name}</Td>
                <Td>{ba.phone}</Td>
                <Td>
                  <Badge tone={attendanceTone(ba.account_status)}>{ba.account_status}</Badge>
                </Td>
                <Td>
                  <Link
                    href={`/brand-ambassadors/${ba.id}`}
                    className="text-sm text-deep underline"
                  >
                    View
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      {elevated ? (
        <div className="mt-8">
          <AddBaForm />
        </div>
      ) : null}
    </>
  );
}

interface PendingMembership {
  membership_id: string;
  user_id: string;
  full_name: string;
  phone: string;
  brand_name: string;
  account_status: string;
}

interface SchoolOption {
  id: string;
  name: string;
  region: string | null;
}

function ApproveButtons({ profileId, schools }: { profileId: string; schools: SchoolOption[] }) {
  async function act(formData: FormData) {
    'use server';
    const action = String(formData.get('action'));
    const id = String(formData.get('profile_id'));
    const { client: c } = await requireStaff();
    await c.rpc('admin_set_account_status', { p_profile_id: id, p_action: action });

    const schoolId = String(formData.get('school_id') ?? '');
    if (action === 'approve' && schoolId) {
      await c.rpc('veda_admin_upsert_assignment', {
        p_brand_ambassador_id: id,
        p_school_id: schoolId,
        p_weekly_off_day: [],
        p_status: 'active',
      });
      revalidatePath('/veda-assignments');
    }

    revalidatePath('/brand-ambassadors');
  }
  return (
    <>
      <form action={act}>
        <input type="hidden" name="profile_id" value={profileId} />
        <input type="hidden" name="action" value="approve" />
        {schools.length > 0 ? (
          <select
            name="school_id"
            className="mr-2 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs"
            defaultValue=""
          >
            <option value="">Approve only</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
                {school.region ? ` — ${school.region}` : ''}
              </option>
            ))}
          </select>
        ) : null}
        <Button size="sm">Approve</Button>
      </form>
      <form action={act}>
        <input type="hidden" name="profile_id" value={profileId} />
        <input type="hidden" name="action" value="reject" />
        <Button size="sm" variant="destructive">
          Reject
        </Button>
      </form>
    </>
  );
}
