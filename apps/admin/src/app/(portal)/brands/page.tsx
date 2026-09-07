import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { CreateBrandForm, type BaOption } from './create-brand-form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';

interface NestedCampaign {
  id: string;
  name: string;
  status: string;
}

interface BrandRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  campaigns: NestedCampaign[] | null;
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
         campaigns(id, name, status),
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

  const brands = ((brandsRaw ?? []) as BrandRow[]).map((b) => ({
    ...b,
    campaigns: b.campaigns ?? [],
  }));
  const baOptions: BaOption[] = (bas ?? []).map((b) => ({
    id: b.id,
    full_name: b.full_name,
    phone: b.phone,
  }));

  const isSuperAdmin = profile.role === 'super_admin';
  const isOrgAdmin = profile.role === 'organization_admin';
  const myOrgId = profile.organization_id;

  const visibleBrands = isSuperAdmin
    ? brands
    : brands.filter((b) => b.id === myOrgId);

  const statusTone = (s: string) =>
    s === 'active' ? 'success' : s === 'suspended' ? 'warning' : 'neutral';

  const activeCampaign = (b: BrandRow) =>
    (b.campaigns ?? []).find((c) => c.status === 'active') ?? null;

  return (
    <>
      <PageHeader
        title="Brand"
        description="Manage your brands. See which brand has an active campaign, pause or delete one, or create a brand and its campaign."
      />

      {/* ── Section: Registered brands ─────────────────────────────────── */}
      <section className="mb-8" aria-label="Registered brands">
        <Card>
          <CardHeader
            title="Registered brands"
            description={isSuperAdmin ? 'All brands on the platform.' : 'Your brand.'}
          />
          <div className="overflow-x-auto">
            <TableWrap className="border-0 shadow-none max-sm:rounded-none max-sm:border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Brand</Th>
                    <Th>Status</Th>
                    <Th>Active campaign</Th>
                    <Th className="text-right">Campaigns</Th>
                    <Th className="text-right">Stores</Th>
                    <Th className="text-right">SKUs</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBrands.length === 0 ? (
                    <EmptyRow colSpan={7}>
                      No brands yet. Create your first brand below.
                    </EmptyRow>
                  ) : (
                    visibleBrands.map((b) => {
                      const active = activeCampaign(b);
                      return (
                        <tr key={b.id} className="hover:bg-lavender/60">
                          <Td className="font-medium">{b.name}</Td>
                          <Td>
                            <Badge tone={statusTone(b.status)}>
                              {b.status === 'active' ? 'Active' : 'Paused'}
                            </Badge>
                          </Td>
                          <Td>
                            {active ? (
                              <span className="inline-flex items-center gap-1.5 text-sm">
                                <Badge tone="success">{active.name}</Badge>
                              </span>
                            ) : (
                              <span className="text-sm text-muted">
                                {b.campaigns.length === 0
                                  ? 'No campaign yet'
                                  : 'No active campaign'}
                              </span>
                            )}
                          </Td>
                          <Td className="text-right tabular-nums">{b.campaigns.length}</Td>
                          <Td className="text-right tabular-nums">{b.stores?.[0]?.count ?? 0}</Td>
                          <Td className="text-right tabular-nums">{b.skus?.[0]?.count ?? 0}</Td>
                          <Td className="text-right">
                            {isSuperAdmin ? (
                              <div className="flex items-center justify-end gap-2">
                                <form
                                  action={async () => {
                                    'use server';
                                    const { client: c } = await requireStaff();
                                    await c.rpc('admin_set_organization_status' as never, {
                                      p_org_id: b.id,
                                      p_status: b.status === 'active' ? 'suspended' : 'active',
                                    } as never);
                                    revalidatePath('/brands');
                                  }}
                                >
                                  <Button
                                    type="submit"
                                    variant="outline"
                                    className="h-8 px-3 text-xs"
                                  >
                                    {b.status === 'active' ? 'Pause' : 'Resume'}
                                  </Button>
                                </form>
                                <form
                                  action={async () => {
                                    'use server';
                                    const { client: c } = await requireStaff();
                                    await c.rpc('admin_delete_organization' as never, {
                                      p_org_id: b.id,
                                    } as never);
                                    revalidatePath('/brands');
                                  }}
                                >
                                  <Button
                                    type="submit"
                                    variant="destructive"
                                    className="h-8 px-3 text-xs"
                                  >
                                    Delete
                                  </Button>
                                </form>
                              </div>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </Td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        </Card>
      </section>

      {/* ── Section: Create a campaign ─────────────────────────────────── */}
      <section className="mb-8" aria-label="Create a campaign">
        <Card>
          <CardHeader
            title="Create a campaign"
            description={
              isSuperAdmin
                ? 'Add an active campaign to a brand.'
                : isOrgAdmin
                  ? 'Add an active campaign to your brand.'
                  : 'Only administrators can create campaigns.'
            }
          />
          <CardBody>
            {isSuperAdmin || isOrgAdmin ? (
              <form
                action={async (formData: FormData) => {
                  'use server';
                  const { client: scoped, profile: actor } = await requireStaff();
                  const orgId =
                    actor.role === 'super_admin'
                      ? String(formData.get('organization_id') ?? '')
                      : actor.organization_id;
                  if (!orgId) return;
                  await scoped.rpc('admin_create_campaign' as never, {
                    p_organization_id: orgId,
                    p_name: String(formData.get('name') ?? '').trim(),
                    p_description: String(formData.get('description') ?? '').trim() || null,
                    p_start_date: String(formData.get('start_date') ?? '').trim() || null,
                    p_end_date: String(formData.get('end_date') ?? '').trim() || null,
                    p_status: 'active',
                  } as never);
                  revalidatePath('/brands');
                }}
                className="grid gap-4 lg:grid-cols-2"
              >
                {isSuperAdmin ? (
                  <div>
                    <Label htmlFor="organization_id">Brand</Label>
                    <Select id="organization_id" name="organization_id" required>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="name">Campaign name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Back to school activation"
                    required
                  />
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
                <div className="flex items-end lg:col-span-2">
                  <Button type="submit" className="w-full lg:w-auto">
                    Create campaign
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted">
                You don&apos;t have permission to create campaigns.
              </p>
            )}
          </CardBody>
        </Card>
      </section>

      {/* ── Section: Create a brand ────────────────────────────────────── */}
      {isSuperAdmin ? (
        <section aria-label="Create a brand">
          <h2 className="mb-3 text-sm font-semibold text-ink">Create a brand</h2>
          <p className="mb-5 text-sm text-muted">
            Provision a new brand (organization) with its admin, starting campaign and stores.
          </p>
          <CreateBrandForm bas={baOptions} />
        </section>
      ) : null}
    </>
  );
}
