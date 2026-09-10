import Link from 'next/link';
import type { BooklistStage } from '@fazoo/types';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { StageBadge } from '@/components/stage-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { mapsLink } from '@/lib/format';

const PAGE_SIZE = 50;

interface SchoolRow {
  id: string;
  name: string;
  region: string | null;
  address: string | null;
  school_type: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  contact_person_name: string | null;
  assigned_ba_name: string | null;
  booklist_jobs: Array<{ id: string; stage: BooklistStage }> | null;
}

type SearchParams = { q?: string; region?: string; status?: string; page?: string };

function hrefWith(params: SearchParams, overrides: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `/schools?${qs}` : '/schools';
}

/**
 * The school master list — the 4,782-school import the BAs pick from, plus any
 * school a BA added at the gate. Searchable because nobody scrolls this.
 */
export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { client } = await requireStaff();
  const params = await searchParams;

  const query = params.q?.trim() || null;
  const region = params.region?.trim() || null;
  const statusParam = params.status?.trim();
  const status = statusParam === 'active' || statusParam === 'inactive' ? statusParam : null;
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const from = (page - 1) * PAGE_SIZE;

  // `or()` parses commas as condition separators and parentheses as groups, so
  // an unquoted needle would let a search string inject extra filters.
  // PostgREST reads a double-quoted value literally; stripping quotes and
  // backslashes means nothing can break back out of them.
  const needle = query?.replace(/["\\]/g, '') ?? '';

  // One query carries both the page of rows and the exact match count, so the
  // pagination total can never disagree with what is on screen.
  let schoolsQuery = client
    .from('veda_schools')
    .select(
      `id, name, region, address, school_type, status, latitude, longitude,
       contact_person_name, assigned_ba_name,
       booklist_jobs ( id, stage )`,
      { count: 'exact' },
    );
  // The table carries a trigram index on name, so ilike stays fast at 4,782 rows.
  if (needle) schoolsQuery = schoolsQuery.or(`name.ilike."%${needle}%",address.ilike."%${needle}%"`);
  if (region) schoolsQuery = schoolsQuery.eq('region', region);
  if (status) schoolsQuery = schoolsQuery.eq('status', status);

  const [schoolsResult, regionsResult] = await Promise.all([
    schoolsQuery.order('name').range(from, from + PAGE_SIZE - 1),
    client
      .from('veda_schools')
      .select('region')
      .not('region', 'is', null)
      .order('region'),
  ]);

  const schools = (schoolsResult.data ?? []) as unknown as SchoolRow[];
  const total = schoolsResult.count ?? schools.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const regions = Array.from(
    new Set(
      ((regionsResult.data ?? []) as Array<{ region: string | null }>)
        .map((row) => row.region)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();

  const engaged = schools.filter((school) => (school.booklist_jobs?.length ?? 0) > 0).length;

  return (
    <>
      <PageHeader
        title="School master list"
        description="Every school a BA can pick from. Coordinates are backfilled by the first GPS fix, which is what makes the distance check meaningful."
      >
        <Link
          href="/booklists"
          className="inline-flex h-10 items-center rounded-lg border border-primary/30 bg-white px-4 text-sm font-medium text-primary hover:bg-lavender"
        >
          Booklist pipeline
        </Link>
      </PageHeader>

      <Card className="mb-5 p-4">
        <form
          method="get"
          action="/schools"
          role="search"
          aria-label="Search the school master list"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="lg:col-span-2">
            <Label htmlFor="sc-q">Search</Label>
            <Input
              id="sc-q"
              name="q"
              defaultValue={query ?? ''}
              placeholder="School name or address"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="sc-region">Region</Label>
            <Select id="sc-region" name="region" defaultValue={region ?? ''}>
              <option value="">All regions</option>
              {regions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="sc-status">Status</Label>
              <Select id="sc-status" name="status" defaultValue={status ?? ''}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <button
              type="submit"
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Search
            </button>
          </div>
        </form>
      </Card>

      <p className="mb-3 text-xs text-muted">
        {total === 1
          ? '1 school matches'
          : `${total.toLocaleString()} schools match`}{' '}
        · {engaged} on this page have a booklist job
        {query || region || status ? (
          <>
            {' · '}
            <Link href="/schools" className="font-medium text-primary hover:underline">
              Clear filters
            </Link>
          </>
        ) : null}
      </p>

      <TableWrap>
        <Table>
          <caption className="sr-only">Schools on the master list</caption>
          <thead>
            <tr>
              <Th>School</Th>
              <Th>Region</Th>
              <Th>Contact</Th>
              <Th>Coordinates</Th>
              <Th>Pipeline</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {schools.length === 0 ? (
              <EmptyRow colSpan={6}>
                {query || region || status
                  ? 'No schools match that search.'
                  : 'The master list is empty. Import the school list to get started.'}
              </EmptyRow>
            ) : (
              schools.map((school) => {
                const jobs = school.booklist_jobs ?? [];
                const link = mapsLink(school.latitude, school.longitude);
                return (
                  <tr key={school.id} className="transition-colors hover:bg-lavender/40">
                    <Td>
                      <Link
                        href={`/schools/${school.id}`}
                        className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {school.name}
                      </Link>
                      {school.address ? (
                        <p className="mt-0.5 text-xs text-muted">{school.address}</p>
                      ) : null}
                      {school.assigned_ba_name ? (
                        <p className="text-xs text-muted">Assigned to {school.assigned_ba_name}</p>
                      ) : null}
                    </Td>
                    <Td className="text-xs">
                      {school.region ?? <span className="text-muted">Not recorded</span>}
                      {school.school_type ? <p className="text-muted">{school.school_type}</p> : null}
                    </Td>
                    <Td className="text-xs">
                      {school.contact_person_name ?? <span className="text-muted">Not recorded</span>}
                    </Td>
                    <Td className="text-xs">
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          On file
                        </a>
                      ) : (
                        <span className="text-muted">Awaiting first GPS fix</span>
                      )}
                    </Td>
                    <Td>
                      {jobs.length === 0 ? (
                        <Badge tone="neutral">Not engaged</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {jobs.map((job) => (
                            <Link
                              key={job.id}
                              href={`/booklists/${job.id}`}
                              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <StageBadge stage={job.stage} />
                            </Link>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={school.status === 'active' ? 'success' : 'neutral'}>
                        {school.status}
                      </Badge>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrap>

      {totalPages > 1 ? (
        <nav aria-label="School list pages" className="mt-4 flex items-center justify-center gap-2">
          <Link
            href={hrefWith(params, { page: String(page - 1) })}
            aria-disabled={page <= 1}
            className={`inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium ${
              page <= 1
                ? 'pointer-events-none border-ink/10 bg-white text-muted/60'
                : 'border-ink/15 bg-white text-ink hover:bg-lavender'
            }`}
          >
            Previous
          </Link>
          <Badge tone="neutral">
            Page {page} of {totalPages}
          </Badge>
          <Link
            href={hrefWith(params, { page: String(page + 1) })}
            aria-disabled={page >= totalPages}
            className={`inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium ${
              page >= totalPages
                ? 'pointer-events-none border-ink/10 bg-white text-muted/60'
                : 'border-ink/15 bg-white text-ink hover:bg-lavender'
            }`}
          >
            Next
          </Link>
        </nav>
      ) : null}
    </>
  );
}

export function generateMetadata() {
  return { title: 'Schools — Fazoo' };
}
