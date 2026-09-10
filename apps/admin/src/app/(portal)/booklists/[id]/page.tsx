import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type {
  BaAgency,
  BooklistDocument,
  BooklistStage,
  BooklistStageEvent,
  DispatchMeans,
  PrintOrder,
  PrintOrderStatus,
  SchoolVisit,
  BooklistJob,
} from '@fazoo/types';
import {
  BOOKLIST_STAGE_LABELS,
  DISPATCH_MEANS_LABELS,
  PRINT_ORDER_STATUS_LABELS,
  agencyLabel,
  declineReasonLabel,
  sourceFormatLabel,
} from '@fazoo/config';
import { requireStaff, isElevated } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { AgencyBadge, OcrBadge, PrintOrderBadge, StageBadge } from '@/components/stage-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { mapsLink, nairobiDate, nairobiTime, NOT_YET } from '@/lib/format';
import { DocumentWorkspace } from './document-workspace';

const DOCUMENT_KIND_LABELS: Record<BooklistDocument['kind'], string> = {
  raw_upload: 'What the school gave us',
  ocr_draft: 'Auto-converted draft',
  formatted: 'Formatted Word document',
  printed_proof: 'Printed proof',
  stamped_copy: 'Stamped +1 copy',
};

// Form values arrive as strings but the RPCs take Postgres enums, and `in` does
// not narrow on its own — each guard both validates and narrows.
function isStage(value: string): value is BooklistStage {
  return value in BOOKLIST_STAGE_LABELS;
}

function isPrintOrderStatus(value: string): value is PrintOrderStatus {
  return value in PRINT_ORDER_STATUS_LABELS;
}

function isDispatchMeans(value: string): value is DispatchMeans {
  return value in DISPATCH_MEANS_LABELS;
}

const OUTCOME_LABELS: Record<SchoolVisit['outcome'], string> = {
  pending: 'No answer recorded',
  booklist_offered: 'Booklist offered',
  declined: 'Declined',
};

const GEOFENCE_LABELS: Record<SchoolVisit['geofence_status'], string> = {
  inside: 'GPS matched the school position',
  outside: 'GPS was away from the recorded school position',
  no_coordinates: 'No coordinates on file for this school',
  not_checked: 'GPS recorded — distance not checked',
};

const DISPATCH_OPTIONS = Object.entries(DISPATCH_MEANS_LABELS) as Array<[DispatchMeans, string]>;
const PRINT_STATUS_OPTIONS = Object.entries(PRINT_ORDER_STATUS_LABELS) as Array<
  [PrintOrderStatus, string]
>;
const STAGE_OPTIONS = Object.entries(BOOKLIST_STAGE_LABELS) as Array<[BooklistStage, string]>;

/** Stages the admin may set by hand. The RPC still refuses to skip evidence gates. */
const MANUAL_STAGES: ReadonlyArray<BooklistStage> = [
  'pending_school_approval',
  'school_approved',
  'in_production',
  'dispatched',
  'received',
  'completed',
  'on_hold',
  'cancelled',
];

function fileSizeLabel(bytes: number | null): string {
  if (bytes === null) return NOT_YET;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function BooklistJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, profile } = await requireStaff();
  const { id: jobId } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(jobId)) notFound();

  const { data: jobRow } = await client
    .from('booklist_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  const job = jobRow as unknown as BooklistJob | null;
  if (!job) notFound();

  const [documentsResult, ordersResult, eventsResult, visitsResult, schoolResult] =
    await Promise.all([
      client
        .from('booklist_documents')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),
      client
        .from('print_orders')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),
      client
        .from('booklist_stage_events')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true }),
      client
        .from('school_visits')
        .select('*')
        .eq('school_id', job.school_id)
        .order('arrived_at', { ascending: false }),
      client.from('veda_schools').select('*').eq('id', job.school_id).maybeSingle(),
    ]);

  const documents = (documentsResult.data ?? []) as unknown as BooklistDocument[];
  const printOrders = (ordersResult.data ?? []) as unknown as PrintOrder[];
  const timeline = (eventsResult.data ?? []) as unknown as BooklistStageEvent[];
  const visits = (visitsResult.data ?? []) as unknown as SchoolVisit[];
  const school = schoolResult.data as unknown as {
    name: string;
    region: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    contact_person_name: string | null;
    contact_person_designation: string | null;
    contact_person_phone: string | null;
  } | null;

  // Actor names are resolved in one pass rather than embedded, because
  // booklist_jobs alone has four separate foreign keys to profiles and
  // PostgREST cannot guess which one a bare `profiles(...)` means.
  const actorIds = Array.from(
    new Set(
      [
        job.owner_ba_id,
        job.converted_by,
        job.copies_confirmed_by,
        job.stage_updated_by,
        ...documents.map((doc) => doc.uploaded_by),
        ...printOrders.flatMap((order) => [order.ordered_by, order.dispatched_by, order.received_by]),
        ...timeline.map((event) => event.changed_by),
        ...visits.map((visit) => visit.brand_ambassador_id),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  const { data: peopleRows } = actorIds.length
    ? await client.from('profiles').select('id, full_name, agency, role').in('id', actorIds)
    : { data: [] };

  const people = new Map(
    ((peopleRows ?? []) as Array<{
      id: string;
      full_name: string;
      agency: BaAgency | null;
      role: string;
    }>).map((person) => [person.id, person]),
  );
  const nameOf = (id: string | null) => (id ? (people.get(id)?.full_name ?? 'Unknown') : NOT_YET);

  const owner = job.owner_ba_id ? people.get(job.owner_ba_id) : undefined;
  const canAct = isElevated(profile.role);
  const formatted = documents.find((doc) => doc.id === job.formatted_document_id) ?? null;
  const stamped = documents.find((doc) => doc.id === job.stamped_document_id) ?? null;
  const activeOrder = printOrders.find((order) => order.status !== 'cancelled') ?? null;

  async function advanceStage(formData: FormData) {
    'use server';
    const { client: c, profile: actor } = await requireStaff();
    if (!isElevated(actor.role)) return;

    const stage = String(formData.get('stage') ?? '');
    if (!isStage(stage)) return;
    const note = String(formData.get('note') ?? '').trim();

    const { error } = await c.rpc('admin_advance_stage', {
      p_job_id: jobId,
      p_stage: stage,
      p_note: note || undefined,
    });
    if (!error) {
      revalidatePath(`/booklists/${jobId}`);
      revalidatePath('/booklists');
    }
  }

  async function createPrintOrder(formData: FormData) {
    'use server';
    const { client: c, profile: actor } = await requireStaff();
    if (!isElevated(actor.role)) return;

    const quantity = Number(formData.get('quantity') ?? 0);
    if (!Number.isInteger(quantity) || quantity < 1) return;

    const { error } = await c.rpc('admin_create_print_order', {
      p_job_id: jobId,
      p_quantity: quantity,
      p_printer_name: String(formData.get('printer_name') ?? '').trim() || undefined,
      p_reference: String(formData.get('reference') ?? '').trim() || undefined,
      p_client_request_id: crypto.randomUUID(),
      p_note: String(formData.get('note') ?? '').trim() || undefined,
    });
    if (!error) {
      revalidatePath(`/booklists/${jobId}`);
      revalidatePath('/booklists');
    }
  }

  async function updatePrintOrder(formData: FormData, orderId: string) {
    'use server';
    const { client: c, profile: actor } = await requireStaff();
    if (!isElevated(actor.role)) return;

    const status = String(formData.get('status') ?? '');
    const means = String(formData.get('dispatch_means') ?? '');
    const quantityRaw = String(formData.get('quantity') ?? '').trim();

    const { error } = await c.rpc('admin_update_print_order', {
      p_order_id: orderId,
      p_status: isPrintOrderStatus(status) ? status : undefined,
      p_printer_name: String(formData.get('printer_name') ?? '').trim() || undefined,
      p_reference: String(formData.get('reference') ?? '').trim() || undefined,
      p_quantity:
        quantityRaw && Number.isInteger(Number(quantityRaw)) ? Number(quantityRaw) : undefined,
      // The RPC rejects a dispatch with no means recorded, so only send a value
      // the supervisor actually chose.
      p_dispatch_means: isDispatchMeans(means) ? means : undefined,
      p_dispatch_carrier: String(formData.get('dispatch_carrier') ?? '').trim() || undefined,
      p_dispatch_tracking_ref:
        String(formData.get('dispatch_tracking_ref') ?? '').trim() || undefined,
      p_dispatch_notes: String(formData.get('dispatch_notes') ?? '').trim() || undefined,
      p_receipt_notes: String(formData.get('receipt_notes') ?? '').trim() || undefined,
      p_cancelled_reason: String(formData.get('cancelled_reason') ?? '').trim() || undefined,
      p_client_request_id: crypto.randomUUID(),
      p_note: String(formData.get('note') ?? '').trim() || undefined,
    });
    if (!error) {
      revalidatePath(`/booklists/${jobId}`);
      revalidatePath('/booklists');
    }
  }

  return (
    <>
      <PageHeader
        title={school?.name ?? 'School'}
        description={
          [school?.region, school?.address].filter(Boolean).join(' · ') ||
          'No region or address recorded for this school.'
        }
      >
        <Link
          href="/booklists"
          className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Back to pipeline
        </Link>
        <Link
          href={`/schools/${job.school_id}`}
          className="inline-flex h-10 items-center rounded-lg border border-primary/30 bg-white px-4 text-sm font-medium text-primary hover:bg-lavender"
        >
          School dossier
        </Link>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StageBadge stage={job.stage} />
        <OcrBadge status={job.ocr_status} />
        {job.is_per_grade ? <Badge tone="neutral">Per grade</Badge> : null}
        {stamped ? <Badge tone="success">Stamped +1 copy on file</Badge> : null}
        {job.on_hold_reason ? <Badge tone="warning">On hold: {job.on_hold_reason}</Badge> : null}
        {job.cancelled_reason ? <Badge tone="danger">Cancelled: {job.cancelled_reason}</Badge> : null}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Copies requested" value={job.copies_requested?.toLocaleString() ?? NOT_YET} />
        <StatCard
          label="To print (incl. +1)"
          value={job.copies_to_print?.toLocaleString() ?? NOT_YET}
          hint="The extra copy is stamped by the school and uploaded as proof."
        />
        <StatCard label="Visits logged" value={visits.length} />
        <StatCard
          label="Owner"
          value={<span className="text-base">{owner?.full_name ?? 'Unassigned'}</span>}
          hint={agencyLabel(owner?.agency ?? null)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DocumentWorkspace
            jobId={jobId}
            ocrStatus={job.ocr_status}
            hasRawDocument={job.raw_document_id !== null}
            formattedPublishedAt={job.formatted_at}
            canAct={canAct}
          />

          <Card>
            <CardHeader
              title="Print order &amp; delivery"
              description="Tracked from the moment the run is ordered, through dispatch by whichever means, to receipt at the school."
            />
            <CardBody className="space-y-5">
              {activeOrder ? (
                <form
                  action={async (formData: FormData) => updatePrintOrder(formData, activeOrder.id)}
                  className="space-y-4 rounded-xl border border-ink/10 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {activeOrder.reference ?? 'No reference given'}
                      </p>
                      <p className="text-xs text-muted">
                        {activeOrder.printer_name ?? 'Printer not recorded'} ·{' '}
                        {activeOrder.quantity.toLocaleString()} copies · raised{' '}
                        {nairobiTime(activeOrder.ordered_at)} by {nameOf(activeOrder.ordered_by)}
                      </p>
                    </div>
                    <PrintOrderBadge status={activeOrder.status} />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                    <Milestone label="Ordered" at={activeOrder.ordered_at} />
                    <Milestone label="Production started" at={activeOrder.production_started_at} />
                    <Milestone label="Ready" at={activeOrder.ready_at} />
                    <Milestone label="Dispatched" at={activeOrder.dispatched_at} />
                    <Milestone label="Received" at={activeOrder.received_at} />
                  </dl>

                  {activeOrder.dispatch_means ? (
                    <p className="text-xs text-ink">
                      Dispatched by{' '}
                      <strong>{DISPATCH_MEANS_LABELS[activeOrder.dispatch_means]}</strong>
                      {activeOrder.dispatch_carrier ? ` · ${activeOrder.dispatch_carrier}` : ''}
                      {activeOrder.dispatch_tracking_ref
                        ? ` · tracking ${activeOrder.dispatch_tracking_ref}`
                        : ''}
                    </p>
                  ) : null}
                  {activeOrder.dispatch_notes ? (
                    <p className="text-xs text-muted">Dispatch note: {activeOrder.dispatch_notes}</p>
                  ) : null}
                  {activeOrder.receipt_notes ? (
                    <p className="text-xs text-muted">Receipt note: {activeOrder.receipt_notes}</p>
                  ) : null}
                  {activeOrder.cancelled_reason ? (
                    <p className="text-xs font-medium text-bad">
                      Cancelled: {activeOrder.cancelled_reason}
                    </p>
                  ) : null}

                  {canAct ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <Label htmlFor={`po-status-${activeOrder.id}`}>Status</Label>
                          <Select
                            id={`po-status-${activeOrder.id}`}
                            name="status"
                            defaultValue={activeOrder.status}
                          >
                            {PRINT_STATUS_OPTIONS.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor={`po-qty-${activeOrder.id}`}>Quantity</Label>
                          <Input
                            id={`po-qty-${activeOrder.id}`}
                            name="quantity"
                            type="number"
                            min="1"
                            step="1"
                            defaultValue={activeOrder.quantity}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`po-means-${activeOrder.id}`}>Dispatched by</Label>
                          <Select
                            id={`po-means-${activeOrder.id}`}
                            name="dispatch_means"
                            defaultValue={activeOrder.dispatch_means ?? ''}
                          >
                            <option value="">Not dispatched yet</option>
                            {DISPATCH_OPTIONS.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor={`po-carrier-${activeOrder.id}`}>Carrier / driver</Label>
                          <Input
                            id={`po-carrier-${activeOrder.id}`}
                            name="dispatch_carrier"
                            defaultValue={activeOrder.dispatch_carrier ?? ''}
                            placeholder="e.g. G4S, or rider name"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`po-tracking-${activeOrder.id}`}>Tracking reference</Label>
                          <Input
                            id={`po-tracking-${activeOrder.id}`}
                            name="dispatch_tracking_ref"
                            defaultValue={activeOrder.dispatch_tracking_ref ?? ''}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`po-printer-${activeOrder.id}`}>Printer</Label>
                          <Input
                            id={`po-printer-${activeOrder.id}`}
                            name="printer_name"
                            defaultValue={activeOrder.printer_name ?? ''}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor={`po-dispatch-note-${activeOrder.id}`}>Dispatch note</Label>
                          <Input
                            id={`po-dispatch-note-${activeOrder.id}`}
                            name="dispatch_notes"
                            defaultValue={activeOrder.dispatch_notes ?? ''}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`po-receipt-note-${activeOrder.id}`}>Receipt note</Label>
                          <Input
                            id={`po-receipt-note-${activeOrder.id}`}
                            name="receipt_notes"
                            defaultValue={activeOrder.receipt_notes ?? ''}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`po-reference-${activeOrder.id}`}>Order reference</Label>
                          <Input
                            id={`po-reference-${activeOrder.id}`}
                            name="reference"
                            defaultValue={activeOrder.reference ?? ''}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor={`po-cancel-${activeOrder.id}`}>
                            Reason if cancelling
                          </Label>
                          <Input
                            id={`po-cancel-${activeOrder.id}`}
                            name="cancelled_reason"
                            defaultValue={activeOrder.cancelled_reason ?? ''}
                          />
                        </div>
                      </div>
                      <Button type="submit">Save print order</Button>
                      <p className="text-xs text-muted">
                        Marking this dispatched or received moves the school to that stage on both
                        dashboards. A dispatch will not save until you record the means.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted">
                      Your role can track this order but not change it.
                    </p>
                  )}
                </form>
              ) : (
                <p className="text-sm text-muted">
                  {printOrders.length > 0
                    ? 'Every print order for this school has been cancelled.'
                    : 'No print order has been raised yet.'}
                </p>
              )}

              {canAct ? (
                <form
                  action={async (formData: FormData) => createPrintOrder(formData)}
                  className="space-y-3 rounded-xl border border-dashed border-ink/20 p-4"
                >
                  <p className="text-sm font-semibold text-ink">
                    {activeOrder ? 'Raise another print order' : 'Raise the print order'}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="po-new-qty">Copies to print</Label>
                      <Input
                        id="po-new-qty"
                        name="quantity"
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={job.copies_to_print ?? undefined}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="po-new-printer">Printer</Label>
                      <Input id="po-new-printer" name="printer_name" placeholder="e.g. Nairobi Press" />
                    </div>
                    <div>
                      <Label htmlFor="po-new-ref">Reference</Label>
                      <Input id="po-new-ref" name="reference" placeholder="Invoice or job number" />
                    </div>
                    <div className="sm:col-span-3">
                      <Label htmlFor="po-new-note">Note for the timeline</Label>
                      <Input id="po-new-note" name="note" />
                    </div>
                  </div>
                  <Button type="submit" variant="outline">
                    Raise print order
                  </Button>
                  {job.copies_to_print === null ? (
                    <p className="text-xs text-warn">
                      The school has not confirmed a copy count yet, so enter the quantity
                      yourself. The BA records it from the app once the school signs off.
                    </p>
                  ) : null}
                </form>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Documents"
              description="Everything attached to this school, newest first. Downloads are short-lived signed links."
            />
            <TableWrap className="rounded-none border-0 shadow-none">
              <Table>
                <caption className="sr-only">Documents attached to this booklist job</caption>
                <thead>
                  <tr>
                    <Th>Document</Th>
                    <Th>Source</Th>
                    <Th>Size</Th>
                    <Th>Uploaded</Th>
                    <Th>Conversion</Th>
                    <Th><span className="sr-only">Open</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {documents.length === 0 ? (
                    <EmptyRow colSpan={6}>Nothing has been uploaded for this school yet.</EmptyRow>
                  ) : (
                    documents.map((doc) => (
                      <tr key={doc.id}>
                        <Td>
                          <span className="font-medium text-ink">
                            {DOCUMENT_KIND_LABELS[doc.kind] ?? doc.kind}
                          </span>
                          {doc.is_current ? null : (
                            <p className="text-xs text-muted">Superseded by a newer upload</p>
                          )}
                        </Td>
                        <Td className="text-xs">{sourceFormatLabel(doc.source_format)}</Td>
                        <Td className="whitespace-nowrap text-xs tabular-nums">
                          {fileSizeLabel(doc.file_size_bytes)}
                          {doc.page_count ? <p className="text-muted">{doc.page_count} pages</p> : null}
                        </Td>
                        <Td className="whitespace-nowrap text-xs">
                          {nairobiTime(doc.created_at)}
                          <p className="text-muted">{nameOf(doc.uploaded_by)}</p>
                        </Td>
                        <Td>
                          <OcrBadge status={doc.ocr_status} />
                          {doc.ocr_confidence !== null ? (
                            <p className="mt-1 text-xs text-muted">
                              Confidence {(doc.ocr_confidence * 100).toFixed(0)}%
                            </p>
                          ) : null}
                          {doc.ocr_error ? (
                            <p className="mt-1 text-xs font-medium text-bad">{doc.ocr_error}</p>
                          ) : null}
                        </Td>
                        <Td>
                          <a
                            href={`/api/booklists/documents/${doc.id}/download`}
                            className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-3 text-xs font-medium text-ink hover:bg-lavender focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          >
                            Open
                          </a>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        </div>

        <div className="space-y-6">
          {canAct ? (
            <Card>
              <CardHeader
                title="Move the stage"
                description="Normally the BA and the print order drive this. Use it to correct a mistake or place a school on hold."
              />
              <CardBody>
                <form action={advanceStage} className="space-y-3">
                  <div>
                    <Label htmlFor="stage-select">Stage</Label>
                    <Select id="stage-select" name="stage" defaultValue={job.stage}>
                      {STAGE_OPTIONS.filter(([value]) =>
                        MANUAL_STAGES.includes(value) || value === job.stage,
                      ).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="stage-note">Note</Label>
                    <Input id="stage-note" name="note" placeholder="Why this is changing" />
                  </div>
                  <Button type="submit" variant="outline" className="w-full">
                    Update stage
                  </Button>
                  <p className="text-xs text-muted">
                    A school cannot be completed until the stamped +1 copy is uploaded, and cannot
                    go to the school for approval until you have published the formatted document.
                  </p>
                </form>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="School acknowledgement" />
            <CardBody className="space-y-2 text-sm">
              <Row label="Acknowledged by" value={job.school_acknowledged_by} />
              <Row label="Approved at" value={job.approved_by_school_at ? nairobiTime(job.approved_by_school_at) : null} />
              <Row
                label="Copies confirmed"
                value={
                  job.copies_confirmed_at
                    ? `${nairobiTime(job.copies_confirmed_at)} by ${nameOf(job.copies_confirmed_by)}`
                    : null
                }
              />
              <Row label="Contact at school" value={school?.contact_person_name} />
              <Row label="Designation" value={school?.contact_person_designation} />
              <Row label="Phone" value={school?.contact_person_phone} />
              {school && school.latitude !== null && school.longitude !== null ? (
                <p className="pt-1">
                  <a
                    href={mapsLink(school.latitude, school.longitude) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Open the recorded school position in Maps
                  </a>
                </p>
              ) : (
                <p className="pt-1 text-xs text-muted">
                  No coordinates on file. The first BA GPS fix backfills them, after which the
                  distance check becomes meaningful.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Visits (${visits.length})`}
              description="Every approach to this school, including declines."
            />
            <CardBody className="space-y-4">
              {visits.length === 0 ? (
                <p className="text-sm text-muted">No visits recorded.</p>
              ) : (
                visits.map((visit) => (
                  <article key={visit.id} className="rounded-xl border border-ink/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">
                        {nairobiDate(visit.visit_date)} · {OUTCOME_LABELS[visit.outcome]}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <AgencyBadge
                          agency={visit.agency}
                          selfieRequired={visit.selfie_required}
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {nameOf(visit.brand_ambassador_id)} · arrived {nairobiTime(visit.arrived_at)}
                    </p>
                    <p className="mt-1 text-xs text-ink">{GEOFENCE_LABELS[visit.geofence_status]}</p>
                    {visit.distance_metres !== null ? (
                      <p className="text-xs text-muted">
                        {Math.round(visit.distance_metres).toLocaleString()} m from the recorded
                        position
                        {visit.accuracy_metres !== null
                          ? ` (GPS accuracy ≈${Math.round(visit.accuracy_metres)} m)`
                          : ''}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs">
                      {visit.selfie_photo_path ? (
                        <span className="font-medium text-ok">Gate selfie captured</span>
                      ) : visit.selfie_required ? (
                        <span className="font-medium text-bad">
                          Gate selfie required but missing
                        </span>
                      ) : (
                        <span className="text-muted">No gate selfie</span>
                      )}
                    </p>
                    {visit.contact_person_name ? (
                      <p className="mt-1 text-xs text-muted">
                        Spoke to {visit.contact_person_name}
                        {visit.contact_person_role ? ` (${visit.contact_person_role})` : ''}
                      </p>
                    ) : null}
                    {visit.declined_reason_code ? (
                      <p className="mt-1 text-xs font-medium text-bad">
                        Declined: {declineReasonLabel(visit.declined_reason_code)}
                        {visit.declined_reason_notes ? ` — ${visit.declined_reason_notes}` : ''}
                      </p>
                    ) : null}
                    {visit.notes ? <p className="mt-1 text-xs text-muted">{visit.notes}</p> : null}
                  </article>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Timeline"
          description="Every stage this school has passed through, and who moved it."
        />
        <TableWrap className="rounded-none border-0 shadow-none">
          <Table>
            <caption className="sr-only">Stage change history for this school</caption>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th>By</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {timeline.length === 0 ? (
                <EmptyRow colSpan={5}>No stage changes recorded yet.</EmptyRow>
              ) : (
                [...timeline].reverse().map((event) => (
                  <tr key={event.id}>
                    <Td className="whitespace-nowrap text-xs">{nairobiTime(event.created_at)}</Td>
                    <Td className="text-xs text-muted">
                      {event.from_stage ? BOOKLIST_STAGE_LABELS[event.from_stage] : 'Started'}
                    </Td>
                    <Td>
                      <StageBadge stage={event.to_stage} />
                    </Td>
                    <Td className="text-xs">
                      {nameOf(event.changed_by)}
                      {event.changed_by_role ? (
                        <p className="text-muted">{event.changed_by_role.replaceAll('_', ' ')}</p>
                      ) : null}
                    </Td>
                    <Td className="text-xs text-muted">{event.note ?? ''}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {formatted ? (
        <p className="mt-4 text-xs text-muted">
          The BA downloads the formatted document from the app, prints it and takes it back to the
          school. Current published version: {nairobiTime(formatted.created_at)}.
        </p>
      ) : null}
    </>
  );
}

function Milestone({ label, at }: { label: string; at: string | null }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{at ? nairobiTime(at) : NOT_YET}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/5 pb-1.5 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-right text-xs font-medium text-ink">{value || NOT_YET}</span>
    </div>
  );
}

export function generateMetadata() {
  return { title: 'Booklist job — Fazoo' };
}
