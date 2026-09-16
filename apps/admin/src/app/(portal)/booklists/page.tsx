import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import type { BaAgency, BooklistStage } from '@fazoo/types';
import { BOOKLIST_STAGE_LABELS } from '@fazoo/config';
import { requireStaff } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { AgencyBadge, StageBadge } from '@/components/stage-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { pipelineBoard } from '@/server/booklists';
import type { AdminPipelineJob } from '@fazoo/types';
import { GradeOrderActions } from './grade-order-actions';

const PAGE_SIZE = 50;

const AGENCIES: ReadonlyArray<{ value: BaAgency; label: string }> = [
  { value: 'ael', label: 'Advert Eyes Limited (AEL)' },
  { value: 'veda', label: 'Veda' },
];

const STAGES = Object.entries(BOOKLIST_STAGE_LABELS) as Array<[BooklistStage, string]>;

/** Stages worth surfacing as tiles — the ones someone is waiting on. */
const HEADLINE_STAGES: ReadonlyArray<BooklistStage> = [
  'awaiting_conversion',
  'converting',
  'formatted',
  'in_production',
  'dispatched',
  'completed',
];

type SearchParams = {
  q?: string;
  stage?: string;
  region?: string;
  ba?: string;
  agency?: string;
  from?: string;
  to?: string;
  page?: string;
};

type AdminPipelineJobWithPrintables = AdminPipelineJob & {
  printables_shipped?: boolean;
};

type GradePrintOrder = {
  grade_request_id: string;
  job_id: string;
  school_id: string;
  school_name: string;
  school_region: string | null;
  grade_label: string;
  copies_requested: number;
  copies_to_print: number;
  due_date: string | null;
  source_format: string | null;
  raw_storage_path: string;
  raw_mime_type: string | null;
  conversion_status: string;
  conversion_provider: string | null;
  conversion_confidence: number | null;
  conversion_error: string | null;
  word_storage_path: string | null;
  word_mime_type: string | null;
  word_published_at: string | null;
  printables_shipped: boolean;
  ba_id: string | null;
  ba_name: string | null;
  ba_agency: BaAgency | null;
  created_at: string;
};

function isStage(value: string | undefined): value is BooklistStage {
  return value !== undefined && value in BOOKLIST_STAGE_LABELS;
}

function isAgency(value: string | undefined): value is BaAgency {
  return value === 'ael' || value === 'veda';
}

function isUuid(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f-]{36}$/i.test(value);
}

/** Rebuild the query string, dropping empties so URLs stay shareable. */
function hrefWith(params: SearchParams, overrides: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `/booklists?${qs}` : '/booklists';
}

interface SchoolStatusColumns {
  rawDocId: string | null;
  stampedDocId: string | null;
  dueDate: string | null;
  shipped: boolean;
  arrived: boolean;
  status: 'success' | 'pending';
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** `2026-09-12` → `12 Sep 2026`. */
function formatDate(value: string): string {
  const [y, m, d] = value.split('-');
  const month = Number(m);
  if (!y || !m || !d || !(month >= 1 && month <= 12)) return value;
  return `${d.padStart(2, '0')} ${MONTHS[month - 1]} ${y}`;
}

function schoolStatusColumns(job: AdminPipelineJob): SchoolStatusColumns {
  const jobWithPrintables = job as AdminPipelineJobWithPrintables;
  return {
    rawDocId: job.raw_document_id ?? null,
    stampedDocId: job.stamped_document_id ?? null,
    dueDate: job.due_date,
    shipped: Boolean(jobWithPrintables.printables_shipped),
    arrived: Boolean(job.received_at),
    status: job.stage === 'completed' ? 'success' : 'pending',
  };
}

async function setPrintablesShippingStatus(formData: FormData) {
  'use server';

  const jobId = String(formData.get('job_id') ?? '');
  const requestedStatus = String(formData.get('shipped') ?? '');

  if (!isUuid(jobId)) throw new Error('Invalid booklist job.');
  if (requestedStatus !== 'true' && requestedStatus !== 'false') {
    throw new Error('Invalid printables shipping status.');
  }

  const { client, profile } = await requireStaff();
  if (profile.role !== 'super_admin' && profile.role !== 'organization_admin') {
    throw new Error('Only an admin can update printables shipping status.');
  }

  const { error } = await client.rpc(
    'admin_set_printables_shipping_status' as never,
    {
      p_job_id: jobId,
      p_shipped: requestedStatus === 'true',
    } as never,
  );

  if (error) throw new Error(error.message);
  revalidatePath('/booklists');
}

async function setGradePrintablesShippingStatus(formData: FormData) {
  'use server';

  const gradeRequestId = String(formData.get('grade_request_id') ?? '');
  const requestedStatus = String(formData.get('shipped') ?? '');
  if (!isUuid(gradeRequestId)) throw new Error('Invalid grade print order.');
  if (requestedStatus !== 'true' && requestedStatus !== 'false') {
    throw new Error('Invalid printables shipping status.');
  }

  const { client, profile } = await requireStaff();
  if (profile.role !== 'super_admin' && profile.role !== 'organization_admin') {
    throw new Error('Only an admin can update grade printables shipping status.');
  }

  const { error } = await client.rpc(
    'admin_set_grade_printables_shipping_status' as never,
    {
      p_grade_request_id: gradeRequestId,
      p_shipped: requestedStatus === 'true',
    } as never,
  );
  if (error) throw new Error(error.message);
  revalidatePath('/booklists');
}

export default async function BooklistPipelinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { client, profile } = await requireStaff();
  const params = await searchParams;

  const stage = isStage(params.stage) ? params.stage : null;
  const agency = isAgency(params.agency) ? params.agency : null;
  const baId = isUuid(params.ba) ? params.ba : null;
  const query = params.q?.trim() || null;
  const region = params.region?.trim() || null;
  const from = params.from?.trim() || null;
  const to = params.to?.trim() || null;
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Regions and BAs come from the caller's own organization via RLS, so the
  // filter dropdowns can never offer a value from another tenant.
  const [regionsResult, basResult, board, gradeOrdersResult] = await Promise.all([
    client
      .from('veda_schools')
      .select('region')
      .not('region', 'is', null)
      .eq('status', 'active')
      .order('region'),
    client
      .from('profiles')
      .select('id, full_name, agency')
      .eq('role', 'brand_ambassador')
      .eq('account_status', 'approved')
      .order('full_name'),
    pipelineBoard(client, {
      query,
      stage,
      region,
      baId,
      agency,
      from,
      to,
      limit: PAGE_SIZE,
      offset,
    }),
    client.rpc('admin_grade_print_orders' as never, { p_limit: 500 } as never),
  ]);

  const regions = Array.from(
    new Set(
      ((regionsResult.data ?? []) as Array<{ region: string | null }>)
        .map((row) => row.region)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();

  const bas = (basResult.data ?? []) as unknown as Array<{
    id: string;
    full_name: string;
    agency: BaAgency | null;
  }>;

  const jobs = board.jobs;
  if (gradeOrdersResult.error) throw new Error(gradeOrdersResult.error.message);
  const gradePayload = gradeOrdersResult.data as unknown as {
    status?: string;
    orders?: GradePrintOrder[];
  };
  const gradeOrders = (gradePayload.orders ?? []).filter((order) => {
    if (
      query &&
      !`${order.school_name} ${order.school_region ?? ''} ${order.grade_label}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    if (region && order.school_region !== region) return false;
    if (baId && order.ba_id !== baId) return false;
    if (agency && order.ba_agency !== agency) return false;
    const createdDate = order.created_at?.slice(0, 10) ?? '';
    if (from && createdDate && createdDate < from) return false;
    if (to && createdDate && createdDate > to) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(board.total / PAGE_SIZE));
  const canAct = profile.role === 'super_admin' || profile.role === 'organization_admin';

  // stage_counts is organization-wide and ignores the filters above, so this
  // stays a truthful "waiting on us" figure even while searching.
  const awaitingConversion =
    (board.stage_counts.awaiting_conversion ?? 0) + (board.stage_counts.converting ?? 0);

  return (
    <>
      <PageHeader
        title="Booklist pipeline"
        description="Every logged school and the exact point it has reached — from the gate selfie to the stamped +1 copy."
      >
        <Link
          href="/booklists/conversion"
          className="inline-flex h-10 items-center rounded-lg border border-primary/30 bg-white px-4 text-sm font-medium text-primary hover:bg-lavender"
        >
          Conversion queue
          {awaitingConversion > 0 ? ` (${awaitingConversion})` : ''}
        </Link>
        <Link
          href="/schools"
          className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          School master list
        </Link>
        <a
          href={`/api/reports/booklists?${new URLSearchParams(
            Object.entries({
              q: query ?? '',
              stage: stage ?? '',
              region: region ?? '',
              ba: baId ?? '',
              agency: agency ?? '',
              from: from ?? '',
              to: to ?? '',
            }).filter(([, v]) => v !== ''),
          )}`}
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep"
          download
        >
          Download filtered CSV ({board.total} schools)
        </a>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {HEADLINE_STAGES.map((headline) => (
          <StatCard
            key={headline}
            label={BOOKLIST_STAGE_LABELS[headline]}
            value={board.stage_counts[headline] ?? 0}
          />
        ))}
      </div>

      <Card className="mb-5 p-4">
        <form
          method="get"
          action="/booklists"
          role="search"
          aria-label="Filter the booklist pipeline"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="lg:col-span-2">
            <Label htmlFor="bl-q">Search school</Label>
            <Input
              id="bl-q"
              name="q"
              defaultValue={query ?? ''}
              placeholder="School name, region or address"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="bl-stage">Stage</Label>
            <Select id="bl-stage" name="stage" defaultValue={stage ?? ''}>
              <option value="">All stages</option>
              {STAGES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bl-region">Region</Label>
            <Select id="bl-region" name="region" defaultValue={region ?? ''}>
              <option value="">All regions</option>
              {regions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bl-ba">Brand ambassador</Label>
            <Select id="bl-ba" name="ba" defaultValue={baId ?? ''}>
              <option value="">All brand ambassadors</option>
              {bas.map((ba) => (
                <option key={ba.id} value={ba.id}>
                  {ba.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bl-agency">Agency</Label>
            <Select id="bl-agency" name="agency" defaultValue={agency ?? ''}>
              <option value="">All agencies</option>
              {AGENCIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bl-from">Logged from</Label>
            <Input id="bl-from" name="from" type="date" defaultValue={from ?? ''} />
          </div>
          <div>
            <Label htmlFor="bl-to">Logged to</Label>
            <Input id="bl-to" name="to" type="date" defaultValue={to ?? ''} />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="h-10 flex-1 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Apply
            </button>
            <Link
              href="/booklists"
              className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
            >
              Clear
            </Link>
          </div>
        </form>
      </Card>

      <section className="mb-6" aria-labelledby="grade-orders-heading">
        <div className="mb-3">
          <h2 id="grade-orders-heading" className="text-base font-semibold text-ink">
            Separate grade print orders
          </h2>
          <p className="mt-1 text-xs text-muted">
            Convert clear images or scanned PDFs into an editable OCR draft, correct it in Word,
            then attach the corrected document for school approval.
          </p>
        </div>
        <TableWrap>
          <Table>
            <caption className="sr-only">Separate grade and class print orders</caption>
            <thead>
              <tr>
                <Th>School</Th>
                <Th>Grade / class</Th>
                <Th>Documents</Th>
                <Th className="text-right">Copies for this order</Th>
                <Th>Due date</Th>
                <Th>BA</Th>
                <Th>Printables</Th>
              </tr>
            </thead>
            <tbody>
              {gradeOrders.length === 0 ? (
                <EmptyRow colSpan={7}>
                  No separate grade print orders match the current filters.
                </EmptyRow>
              ) : (
                gradeOrders.map((order) => (
                  <tr
                    key={order.grade_request_id}
                    className="transition-colors hover:bg-lavender/40"
                  >
                    <Td>
                      <Link
                        href={`/booklists/${order.job_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {order.school_name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {order.school_region ?? 'Region not recorded'}
                      </p>
                    </Td>
                    <Td>
                      <span className="font-semibold text-ink">{order.grade_label}</span>
                      {order.source_format ? (
                        <p className="mt-0.5 text-[11px] text-muted">
                          Source: {order.source_format}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <GradeOrderActions
                        gradeRequestId={order.grade_request_id}
                        jobId={order.job_id}
                        conversionStatus={order.conversion_status}
                        conversionProvider={order.conversion_provider}
                        hasWord={Boolean(order.word_storage_path)}
                        canAct={canAct}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">
                      <span className="font-semibold text-ink">
                        {order.copies_to_print.toLocaleString()}
                      </span>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {order.copies_requested.toLocaleString()} requested + 1 stamped
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {order.due_date ? (
                        formatDate(order.due_date)
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      {order.ba_name ?? <span className="text-muted">Unassigned</span>}
                      <div className="mt-1">
                        <AgencyBadge agency={order.ba_agency} />
                      </div>
                    </Td>
                    <Td>
                      {canAct ? (
                        <form
                          action={setGradePrintablesShippingStatus}
                          className="flex flex-wrap gap-1.5"
                        >
                          <input
                            type="hidden"
                            name="grade_request_id"
                            value={order.grade_request_id}
                          />
                          <button
                            type="submit"
                            name="shipped"
                            value="false"
                            aria-pressed={!order.printables_shipped}
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${!order.printables_shipped ? 'bg-red-100 text-red-700 ring-1 ring-red-200' : 'border border-red-200 bg-white text-red-700 hover:bg-red-50'}`}
                          >
                            Pending
                          </button>
                          <button
                            type="submit"
                            name="shipped"
                            value="true"
                            aria-pressed={order.printables_shipped}
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.printables_shipped ? 'bg-green-100 text-green-700 ring-1 ring-green-200' : 'border border-green-200 bg-white text-green-700 hover:bg-green-50'}`}
                          >
                            Shipped
                          </button>
                        </form>
                      ) : (
                        <Badge tone={order.printables_shipped ? 'success' : 'danger'}>
                          {order.printables_shipped ? 'Shipped' : 'Pending'}
                        </Badge>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>
      </section>

      <div className="mb-3">
        <h2 className="text-base font-semibold text-ink">School workflow</h2>
        <p className="mt-1 text-xs text-muted">
          School-level progress only. Multi-grade copy quantities are intentionally kept in the
          separate orders above.
        </p>
      </div>

      <TableWrap>
        <Table>
          <caption className="sr-only">
            {board.total} school{board.total === 1 ? '' : 's'} in the booklist pipeline
          </caption>
          <thead>
            <tr>
              <Th>Name of school</Th>
              <Th>Region / location</Th>
              <Th>BA attachment</Th>
              <Th>Due date</Th>
              <Th>Printables</Th>
              <Th>Arrived?</Th>
              <Th>BA (handled the log)</Th>
              <Th>Stamped document</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <EmptyRow colSpan={9}>
                {board.total === 0 && !query && !stage
                  ? 'No schools have been logged yet. They appear here as soon as a BA records a gate visit.'
                  : 'No schools match that search or filter.'}
              </EmptyRow>
            ) : (
              jobs.map((job) => {
                const sc = schoolStatusColumns(job);
                return (
                  <tr key={job.job_id} className="transition-colors hover:bg-lavender/40">
                    <Td>
                      <Link
                        href={`/booklists/${job.job_id}`}
                        className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {job.school_name}
                      </Link>
                      {job.school_address ? (
                        <p className="mt-0.5 text-xs text-muted">{job.school_address}</p>
                      ) : null}
                    </Td>
                    <Td>
                      {job.school_region ?? (
                        <span className="text-xs text-muted">Not recorded</span>
                      )}
                    </Td>
                    <Td>
                      {sc.rawDocId ? (
                        <a
                          href={`/api/booklists/documents/${sc.rawDocId}/download`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Download original
                        </a>
                      ) : (
                        <span className="text-xs text-muted">No doc yet</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {sc.dueDate ? (
                        formatDate(sc.dueDate)
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      {canAct ? (
                        <form
                          action={setPrintablesShippingStatus}
                          className="flex flex-wrap gap-1.5"
                        >
                          <input type="hidden" name="job_id" value={job.job_id} />
                          <button
                            type="submit"
                            name="shipped"
                            value="false"
                            aria-pressed={!sc.shipped}
                            title="Mark printables pending"
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 ${
                              !sc.shipped
                                ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                                : 'border border-red-200 bg-white text-red-700 hover:bg-red-50'
                            }`}
                          >
                            Pending
                          </button>
                          <button
                            type="submit"
                            name="shipped"
                            value="true"
                            aria-pressed={sc.shipped}
                            title="Mark printables shipped"
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${
                              sc.shipped
                                ? 'bg-green-100 text-green-700 ring-1 ring-green-200'
                                : 'border border-green-200 bg-white text-green-700 hover:bg-green-50'
                            }`}
                          >
                            Shipped
                          </button>
                        </form>
                      ) : (
                        <Badge tone={sc.shipped ? 'success' : 'danger'}>
                          {sc.shipped ? 'Shipped' : 'Pending'}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={sc.arrived ? 'success' : 'warning'}>
                        {sc.arrived ? 'Yes' : 'No'}
                      </Badge>
                    </Td>
                    <Td>
                      {job.owner_ba_name ?? <span className="text-muted">Unassigned</span>}
                      <div className="mt-1">
                        <AgencyBadge agency={job.owner_ba_agency} />
                      </div>
                    </Td>
                    <Td>
                      {sc.stampedDocId ? (
                        <a
                          href={`/api/booklists/documents/${sc.stampedDocId}/download`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        <Badge tone="warning">No</Badge>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={sc.status === 'success' ? 'success' : 'warning'}>
                        {sc.status === 'success' ? 'Success' : 'Pending'}
                      </Badge>
                      <div className="mt-1">
                        <StageBadge stage={job.stage} />
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrap>

      <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-muted">
          Showing {jobs.length === 0 ? 0 : offset + 1}–{offset + jobs.length} of{' '}
          {board.total.toLocaleString()} school{board.total === 1 ? '' : 's'}
          {canAct ? '' : ' · read-only for your role'}
        </p>
        {totalPages > 1 ? (
          <nav aria-label="Pipeline pages" className="flex items-center gap-2">
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
      </div>
    </>
  );
}

export function generateMetadata() {
  return { title: 'Booklist pipeline — Fazoo' };
}
