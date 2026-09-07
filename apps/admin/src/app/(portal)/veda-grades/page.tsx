import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';

interface GradeRow {
  id: string;
  name: string;
  code: string;
  status: string;
  sort_order: number;
  veda_grade_stationery: Array<{
    stationery_item: { id: string; name: string; code: string | null } | null;
  }> | null;
}

interface StationeryItem {
  id: string;
  name: string;
  code: string | null;
}

export default async function VedaGradesPage() {
  const { client, profile } = await requireStaff();
  if (profile.role === 'supervisor' || profile.role === 'client') {
    return (
      <PageHeader title="Veda Grades" description="Grade / class bands and their stationery offerings.">
        <p className="text-sm text-muted">You do not have permission to manage grades.</p>
      </PageHeader>
    );
  }

  const orgId = profile.organization_id;

  const [{ data: gradesRaw }, { data: itemsRaw }] = await Promise.all([
    client
      .from('veda_grades')
      .select(
        `id, name, code, status, sort_order,
         veda_grade_stationery(
           stationery_item:veda_stationery_items!veda_grade_stationery_stationery_item_id_fkey ( id, name, code )
         )`,
      )
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true }),
    client
      .from('veda_stationery_items')
      .select('id, name, code')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('name', { ascending: true }),
  ]);

  const grades = (gradesRaw ?? []) as unknown as GradeRow[];
  const items = (itemsRaw ?? []) as unknown as StationeryItem[];

  async function upsertGrade(formData: FormData, gradeId?: string) {
    'use server';
    const name = String(formData.get('name') ?? '').trim();
    const code = String(formData.get('code') ?? '').trim();
    const sortOrder = Number(formData.get('sort_order') ?? 0);
    const status = String(formData.get('status') ?? 'active');
    const stationeryIds = formData
      .getAll('stationery_item')
      .map((v) => String(v))
      .filter(Boolean);
    if (!name || !code) return;

    const { client: c, profile: actor } = await requireStaff();
    if (actor.role === 'supervisor' || actor.role === 'client') return;
    const { error } = await c.rpc('veda_admin_upsert_grade', {
      p_name: name,
      p_code: code,
      p_sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      p_status: status,
      p_grade_id: gradeId ?? null,
      p_stationery_ids: stationeryIds,
    });
    if (!error) revalidatePath('/veda-grades');
  }

  const offeringIds = (id: string) =>
    new Set((grades.find((g) => g.id === id)?.veda_grade_stationery ?? [])
      .map((gs) => gs.stationery_item?.id)
      .filter(Boolean));

  return (
    <>
      <PageHeader
        title="Veda Grades"
        description="Class-band levels (ECDE, Lower Primary, Upper Primary, JSS) and which stationery each offers."
      />

      <TableWrap className="mb-6">
        <Table>
          <thead>
            <tr>
              <Th>Grade / level</Th>
              <Th>Code</Th>
              <Th>Order</Th>
              <Th>Stationery offered</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {grades.length === 0 ? (
              <EmptyRow colSpan={5}>No grades configured yet. Add the first grade below.</EmptyRow>
            ) : (
              grades.map((g) => (
                <tr key={g.id}>
                  <Td className="font-medium">{g.name}</Td>
                  <Td className="font-mono text-xs">{g.code}</Td>
                  <Td className="tabular-nums">{g.sort_order}</Td>
                  <Td className="max-w-md">
                    <div className="flex flex-wrap gap-1">
                      {(g.veda_grade_stationery ?? []).map((gs) =>
                        gs.stationery_item ? (
                          <span
                            key={gs.stationery_item.id}
                            className="rounded-full border border-ink/10 bg-lavender px-2 py-0.5 text-xs text-charcoal"
                          >
                            {gs.stationery_item.name}
                          </span>
                        ) : null,
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={g.status === 'active' ? 'success' : 'neutral'}>{g.status}</Badge>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Add a grade" description="Create a grade/class band and choose its stationery offering." />
          <CardBody>
            <form
              action={async (formData: FormData) => upsertGrade(formData, undefined)}
              className="space-y-3"
            >
              <div>
                <Label htmlFor="g-name">Grade name</Label>
                <Input id="g-name" name="name" placeholder="e.g. ECDE (Playgroup, PP1 & PP2)" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="g-code">Code</Label>
                  <Input id="g-code" name="code" placeholder="e.g. ECDE" required />
                </div>
                <div>
                  <Label htmlFor="g-sort">Sort order</Label>
                  <Input id="g-sort" name="sort_order" type="number" min="0" defaultValue="0" />
                </div>
              </div>
              <div>
                <Label htmlFor="g-status">Status</Label>
                <Select id="g-status" name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-ink">Stationery offered to this grade</legend>
                <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-ink/10 p-2 sm:grid-cols-2">
                  {items.length === 0 ? (
                    <p className="col-span-full px-1 py-2 text-xs text-muted">No stationery items configured yet.</p>
                  ) : (
                    items.map((it) => (
                      <label
                        key={it.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-charcoal hover:bg-lavender"
                      >
                        <input type="checkbox" name="stationery_item" value={it.id} className="size-4 accent-primary" />
                        <span className="truncate">{it.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </fieldset>
              <Button type="submit" className="w-full">Add grade</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Edit a grade" description="Update an existing grade and its stationery offering." />
          <CardBody className="space-y-4">
            {grades.length === 0 ? (
              <p className="text-sm text-muted">No grades to edit yet.</p>
            ) : (
              grades.map((g) => (
                <form
                  key={g.id}
                  action={async (formData: FormData) => upsertGrade(formData, g.id)}
                  className="rounded-xl border border-ink/10 p-4"
                >
                  <p className="mb-3 text-sm font-semibold text-ink">{g.name}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Name</Label>
                      <Input name="name" defaultValue={g.name} required />
                    </div>
                    <div>
                      <Label>Code</Label>
                      <Input name="code" defaultValue={g.code} required />
                    </div>
                    <div>
                      <Label>Order</Label>
                      <Input name="sort_order" type="number" min="0" defaultValue={g.sort_order} />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select name="status" defaultValue={g.status}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </Select>
                    </div>
                  </div>
                  <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-ink/10 p-2 sm:grid-cols-2">
                    {items.map((it) => (
                      <label
                        key={it.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-charcoal hover:bg-lavender"
                      >
                        <input
                          type="checkbox"
                          name="stationery_item"
                          value={it.id}
                          defaultChecked={offeringIds(g.id).has(it.id)}
                          className="size-4 accent-primary"
                        />
                        <span className="truncate">{it.name}</span>
                      </label>
                    ))}
                  </div>
                  <Button type="submit" className="mt-3 w-full" size="sm">Save grade</Button>
                </form>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
