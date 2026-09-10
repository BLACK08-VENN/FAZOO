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
}

export default async function VedaGradesPage() {
  const { client, profile } = await requireStaff();
  if (profile.role === 'supervisor' || profile.role === 'client') {
    return (
      <PageHeader
        title="Veda Grades"
        description="Grade and class bands. A school booklist may be issued per grade."
      >
        <p className="text-sm text-muted">You do not have permission to manage grades.</p>
      </PageHeader>
    );
  }

  const { data: gradesRaw } = await client
    .from('veda_grades')
    .select('id, name, code, status, sort_order')
    .eq('organization_id', profile.organization_id)
    .order('sort_order', { ascending: true });

  const grades = (gradesRaw ?? []) as unknown as GradeRow[];

  async function upsertGrade(formData: FormData, gradeId?: string) {
    'use server';
    const name = String(formData.get('name') ?? '').trim();
    const code = String(formData.get('code') ?? '').trim();
    const sortOrder = Number(formData.get('sort_order') ?? 0);
    const status = formData.get('status') === 'inactive' ? 'inactive' : 'active';
    if (!name || !code) return;

    const { client: c, profile: actor } = await requireStaff();
    if (actor.role === 'supervisor' || actor.role === 'client') return;
    const { error } = await c.rpc('veda_admin_upsert_grade', {
      p_name: name,
      p_code: code,
      p_sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      p_status: status,
      p_grade_id: gradeId,
    });
    if (!error) revalidatePath('/veda-grades');
  }

  return (
    <>
      <PageHeader
        title="Veda Grades"
        description="Class bands (ECDE, Lower Primary, Upper Primary, JSS). These label the sections on a formatted booklist when a school issues one per grade."
      />

      <TableWrap className="mb-6">
        <Table>
          <caption className="sr-only">Configured grades and class bands</caption>
          <thead>
            <tr>
              <Th>Grade / level</Th>
              <Th>Code</Th>
              <Th>Order</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {grades.length === 0 ? (
              <EmptyRow colSpan={4}>No grades configured yet. Add the first grade below.</EmptyRow>
            ) : (
              grades.map((g) => (
                <tr key={g.id}>
                  <Td className="font-medium">{g.name}</Td>
                  <Td className="font-mono text-xs">{g.code}</Td>
                  <Td className="tabular-nums">{g.sort_order}</Td>
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
          <CardHeader title="Add a grade" description="Create a grade or class band." />
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
              <Button type="submit" className="w-full">Add grade</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Edit a grade" description="Rename, reorder or retire an existing grade." />
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
                      <Label htmlFor={`edit-${g.id}-name`}>Name</Label>
                      <Input id={`edit-${g.id}-name`} name="name" defaultValue={g.name} required />
                    </div>
                    <div>
                      <Label htmlFor={`edit-${g.id}-code`}>Code</Label>
                      <Input id={`edit-${g.id}-code`} name="code" defaultValue={g.code} required />
                    </div>
                    <div>
                      <Label htmlFor={`edit-${g.id}-sort`}>Order</Label>
                      <Input
                        id={`edit-${g.id}-sort`}
                        name="sort_order"
                        type="number"
                        min="0"
                        defaultValue={g.sort_order}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`edit-${g.id}-status`}>Status</Label>
                      <Select id={`edit-${g.id}-status`} name="status" defaultValue={g.status}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </Select>
                    </div>
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
