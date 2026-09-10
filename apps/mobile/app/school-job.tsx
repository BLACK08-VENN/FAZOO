import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  BUCKET_BOOKLIST_DOCUMENTS,
  BUCKET_DAILY_LOG_PHOTOS,
  DISPATCH_MEANS_LABELS,
  declineReasonLabel,
  formatNairobiDisplay,
  sourceFormatLabel,
} from '@fazoo/config';
import type {
  BooklistDocumentKind,
  GeofenceOutcome,
  JobDetailDocument,
  VisitOutcome,
} from '@fazoo/types';
import { nextActionFor, resolveProfile, useSchoolJobDetail } from '@/lib/booklist';
import {
  documentPath,
  persistDocument,
  pickBooklistFile,
  signedDocumentUrl,
  type PickedDocument,
} from '@/lib/documents';
import { capturePhoto, persistPhoto, type CapturedPhoto } from '@/lib/photos';
import { enqueueReplace, newRequestId, type OperationName } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { CaptureBox } from '@/components/capture-box';
import { OcrBadge, PrintOrderBadge, StageBadge } from '@/components/stage-badge';
import {
  Card,
  EmptyState,
  Field,
  GlassCard,
  MetricTile,
  MultilineField,
  Page,
  ScreenHeader,
  SectionLabel,
} from '@/components/ui';

const GEOFENCE_LABEL: Record<GeofenceOutcome, string> = {
  inside: "GPS matches this school's position",
  outside: "GPS was away from this school's recorded position",
  no_coordinates: 'No coordinates on file for this school yet',
  not_checked: 'GPS recorded — distance not checked',
};

const OUTCOME_LABEL: Record<VisitOutcome, string> = {
  pending: 'No answer recorded yet',
  booklist_offered: 'Booklist offered',
  declined: 'Declined',
};

const DOCUMENT_KIND_LABEL: Record<BooklistDocumentKind, string> = {
  raw_upload: 'What the school gave you',
  ocr_draft: 'Auto-converted draft',
  formatted: 'Formatted Word document',
  printed_proof: 'Printed proof',
  stamped_copy: 'Stamped +1 copy',
};

/** Stages where nothing more can be recorded against the school. */
const CLOSED_STAGES = ['declined', 'cancelled', 'completed'] as const;

/** One school's whole journey: gate selfie → booklist → Word → print → stamp. */
export default function SchoolJob() {
  const { job: jobParam } = useLocalSearchParams<{ job?: string }>();
  const jobId = typeof jobParam === 'string' && jobParam.length > 0 ? jobParam : null;
  const detail = useSchoolJobDetail(jobId);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [copies, setCopies] = useState('');
  const [acknowledgedBy, setAcknowledgedBy] = useState('');
  const [copiesNotes, setCopiesNotes] = useState('');

  const [stampedPhoto, setStampedPhoto] = useState<CapturedPhoto | null>(null);
  const [stampedFile, setStampedFile] = useState<PickedDocument | null>(null);
  const [stampedRequestId] = useState(newRequestId);

  useFocusEffect(
    useCallback(() => {
      void detail.refresh();
    }, [detail.refresh]),
  );

  const job = detail.data?.job ?? null;
  const documents = detail.data?.documents ?? [];
  const visits = detail.data?.visits ?? [];
  const printOrders = detail.data?.print_orders ?? [];
  const timeline = detail.data?.timeline ?? [];

  const current = (kind: BooklistDocumentKind): JobDetailDocument | null =>
    documents.find((document) => document.kind === kind && document.is_current) ?? null;

  const formatted = current('formatted');
  const stamped = current('stamped_copy');

  // Seed the copy-count form from what is already recorded, without ever
  // overwriting what the BA is mid-way through typing.
  useEffect(() => {
    if (!job) return;
    if (job.copies_requested !== null) setCopies((value) => value || String(job.copies_requested));
    if (job.school_acknowledged_by) {
      setAcknowledgedBy((value) => value || (job.school_acknowledged_by ?? ''));
    }
  }, [job]);

  async function pullToRefresh() {
    setRefreshing(true);
    try {
      await flushQueue();
      await detail.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  /** Queue an offline-safe step, then flush so an online BA sees it at once. */
  async function queue(
    operation: OperationName,
    payload: Record<string, unknown>,
    requestId: string,
    message: string,
  ) {
    setError(null);
    setSaved(null);
    setBusy(operation);
    try {
      await enqueueReplace(operation, payload, requestId);
      await flushQueue();
      setSaved(message);
      await detail.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(null);
    }
  }

  async function openDocument(document: JobDetailDocument) {
    setError(null);
    setBusy(`open-${document.id}`);
    try {
      const url = await signedDocumentUrl(document.storage_bucket, document.storage_path);
      await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that document.');
    } finally {
      setBusy(null);
    }
  }

  async function openSelfie(path: string | null) {
    if (!path) return;
    setError(null);
    setBusy(`open-${path}`);
    try {
      const url = await signedDocumentUrl(BUCKET_DAILY_LOG_PHOTOS, path);
      await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that photo.');
    } finally {
      setBusy(null);
    }
  }

  async function snapStamped() {
    setError(null);
    try {
      const photo = await capturePhoto(false);
      if (photo) {
        setStampedPhoto(photo);
        setStampedFile(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the camera.');
    }
  }

  async function pickStampedFile() {
    setError(null);
    try {
      const picked = await pickBooklistFile();
      if (picked) {
        setStampedFile(picked);
        setStampedPhoto(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that file.');
    }
  }

  async function submitStamped() {
    if (!jobId) return;
    const attachment = stampedPhoto ?? stampedFile;
    if (!attachment) {
      setError('Photograph the stamped copy, or choose the file.');
      return;
    }
    setError(null);
    setSaved(null);
    setBusy('submit_stamped_copy');
    try {
      const me = await resolveProfile();
      if (!me) throw new Error('Your profile could not be loaded. Sign in again and retry.');

      const isPhoto = Boolean(stampedPhoto);
      const fileName = isPhoto ? 'stamped-copy.jpg' : (stampedFile?.name ?? 'stamped-copy');
      const mimeType = attachment.mimeType;
      const remotePath = documentPath(
        me.organization_id,
        me.id,
        stampedRequestId,
        'stamped',
        fileName,
        mimeType,
      );
      const localUri = isPhoto
        ? await persistPhoto(stampedPhoto as CapturedPhoto, stampedRequestId, 'stamped')
        : await persistDocument(stampedFile as PickedDocument, stampedRequestId, 'stamped');

      await enqueueReplace(
        'submit_stamped_copy',
        {
          p_job_id: jobId,
          p_storage_path: remotePath,
          p_client_request_id: stampedRequestId,
          p_mime_type: mimeType,
          p_file_size_bytes: attachment.fileSize,
        },
        stampedRequestId,
        [{ localUri, bucket: BUCKET_BOOKLIST_DOCUMENTS, remotePath, mimeType }],
      );
      await flushQueue();
      setSaved('Stamped copy uploaded — this school is now a complete log.');
      setStampedPhoto(null);
      setStampedFile(null);
      await detail.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the stamped copy.');
    } finally {
      setBusy(null);
    }
  }

  if (!jobId) {
    return (
      <Page bottomInset={false}>
        <ScreenHeader eyebrow="Pipeline" title="School" onBack={() => router.back()} />
        <EmptyState
          title="No school selected"
          body="Open a school from the pipeline list to see its full history."
          actionLabel="Back to all schools"
          onAction={() => router.replace('/schools')}
        />
      </Page>
    );
  }

  if (detail.loading && !detail.data) {
    return (
      <Page bottomInset={false}>
        <ScreenHeader eyebrow="Pipeline" title="Loading…" onBack={() => router.back()} />
        <View className="items-center py-12">
          <ActivityIndicator size="large" color="#7B2FBE" />
        </View>
      </Page>
    );
  }

  if (!job) {
    return (
      <Page bottomInset={false}>
        <ScreenHeader eyebrow="Pipeline" title="School" onBack={() => router.back()} />
        {detail.error ? <StatusPill tone="bad" label={detail.error} /> : null}
        <EmptyState
          title="Could not open this school"
          body="It may still be waiting to sync, or you may no longer have access to it."
          actionLabel="Back to all schools"
          onAction={() => router.replace('/schools')}
        />
      </Page>
    );
  }

  const stage = job.stage;
  const closed = (CLOSED_STAGES as readonly string[]).includes(stage);

  // The server only accepts these once the admin has published a Word file.
  const canConfirmCopies = Boolean(formatted) && !closed;
  // ...and the stamped proof only after a copy count exists.
  const canUploadStamped = job.copies_requested !== null && !stamped && !closed;
  const canMarkTaken = stage === 'formatted' && Boolean(formatted);
  const canRevisit = stage === 'engaged' || stage === 'booklist_offered' || stage === 'declined';

  return (
    <Page
      bottomInset={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void pullToRefresh()}
          tintColor="#7B2FBE"
          colors={['#7B2FBE']}
        />
      }
    >
      <ScreenHeader
        eyebrow={job.school_region ?? 'School'}
        title={job.school_name}
        subtitle={job.school_address ?? 'Full booklist history for this school'}
        onBack={() => router.back()}
      />

      {error ? <StatusPill tone="bad" label={error} /> : null}
      {saved ? <StatusPill tone="ok" label={saved} /> : null}
      {detail.error ? <StatusPill tone="warn" label={detail.error} /> : null}

      <GlassCard className="mb-4">
        <StageBadge stage={stage} />
        <Text className="font-sans mt-3 text-base font-semibold leading-6 text-ink">
          {nextActionFor(stage, Boolean(formatted))}
        </Text>
        <Text className="font-sans mt-2 text-sm text-muted">
          Updated {formatNairobiDisplay(job.stage_updated_at)}
        </Text>
        {job.is_per_grade ? (
          <Text className="font-sans mt-2 text-sm text-muted">
            Per-grade booklist{job.grade_notes ? ` — ${job.grade_notes}` : ''}
          </Text>
        ) : null}
        {job.on_hold_reason ? (
          <Text className="font-sans mt-2 text-sm font-medium text-warn">On hold: {job.on_hold_reason}</Text>
        ) : null}
        {job.cancelled_reason ? (
          <Text className="font-sans mt-2 text-sm font-medium text-bad">
            Cancelled: {job.cancelled_reason}
          </Text>
        ) : null}
      </GlassCard>

      {canRevisit ? (
        <>
          <SectionLabel>Your next step</SectionLabel>
          <Text className="font-sans mb-2 text-sm leading-6 text-muted">
            Search for {job.school_name} and pick it — the gate selfie and the outcome attach to this same
            school record.
          </Text>
          <PrimaryButton
            label="Log another visit to this school"
            icon="camera"
            onPress={() => router.push('/school-visit')}
          />
        </>
      ) : null}

      {formatted ? (
        <>
          <SectionLabel>Printed booklist</SectionLabel>
          <Card className="mb-3">
            <Text className="font-sans mb-2 text-base font-bold text-ink">Formatted Word document</Text>
            <Text className="font-sans mb-3 text-sm leading-6 text-muted">
              Download it, print it, and take it back to the school for approval. Opening it needs a
              connection.
            </Text>
            <PrimaryButton
              label="Open and download"
              icon="download"
              busy={busy === `open-${formatted.id}`}
              onPress={() => void openDocument(formatted)}
            />
            {canMarkTaken ? (
              <PrimaryButton
                label="I have taken it to the school"
                variant="secondary"
                icon="walk"
                busy={busy === 'mark_pending_school_approval'}
                onPress={() =>
                  void queue(
                    'mark_pending_school_approval',
                    { p_job_id: jobId, p_client_request_id: newRequestId() },
                    newRequestId(),
                    'Recorded — the school now has the printed booklist for approval.',
                  )
                }
              />
            ) : null}
          </Card>
        </>
      ) : null}

      {canConfirmCopies ? (
        <>
          <SectionLabel>
            {job.copies_requested === null ? 'How many copies?' : 'Change the copy count'}
          </SectionLabel>
          <Card className="mb-3">
            <Text className="font-sans mb-3 text-sm leading-6 text-muted">
              Ask the school how many copies of the booklist they need. We always print one extra — that
              copy is stamped by the school and uploaded here as the proof of a complete log.
            </Text>
            <View className="mb-3 flex-row gap-3">
              <MetricTile
                compact
                label="Requested"
                value={job.copies_requested === null ? '—' : job.copies_requested}
              />
              <MetricTile compact label="Stamped copy" value="+1" />
              <MetricTile
                compact
                label="Total to print"
                value={job.copies_to_print === null ? '—' : job.copies_to_print}
              />
            </View>
            <Field
              label="Copies the school needs"
              placeholder="e.g. 700"
              keyboardType="number-pad"
              value={copies}
              onChangeText={setCopies}
            />
            {Number.parseInt(copies, 10) >= 1 ? (
              <Text className="font-sans mb-3 text-sm font-semibold text-primaryText">
                We will print {Number.parseInt(copies, 10) + 1} — {Number.parseInt(copies, 10)} for the
                school plus the stamped copy.
              </Text>
            ) : null}
            <Field
              label="Who at the school confirmed this?"
              placeholder="e.g. Mrs Achieng, Principal"
              value={acknowledgedBy}
              onChangeText={setAcknowledgedBy}
            />
            <MultilineField
              label="Notes"
              placeholder="Optional — delivery instructions, split by grade, etc."
              value={copiesNotes}
              onChangeText={setCopiesNotes}
            />
            <PrimaryButton
              label={job.copies_requested === null ? 'Confirm copy count' : 'Update copy count'}
              icon="checkmark-circle"
              busy={busy === 'confirm_copies'}
              onPress={() => {
                const requested = Number.parseInt(copies.trim(), 10);
                if (!Number.isFinite(requested) || requested < 1) {
                  setError('Enter how many copies the school needs (at least 1).');
                  return;
                }
                void queue(
                  'confirm_copies',
                  {
                    p_job_id: jobId,
                    p_copies_requested: requested,
                    p_client_request_id: newRequestId(),
                    p_school_acknowledged_by: acknowledgedBy.trim() || null,
                    p_notes: copiesNotes.trim() || null,
                  },
                  newRequestId(),
                  `Recorded — ${requested} for the school plus 1 stamped copy, so ${requested + 1} in total.`,
                );
              }}
            />
          </Card>
        </>
      ) : null}

      {canUploadStamped ? (
        <>
          <SectionLabel>Stamped +1 copy</SectionLabel>
          <Card className="mb-3">
            <Text className="font-sans mb-3 text-sm leading-6 text-muted">
              The extra copy the school stamps and signs. Uploading it closes the log for this school.
            </Text>
            <CaptureBox
              photo={stampedPhoto}
              onSnap={() => void snapStamped()}
              hint="Tap to photograph the stamped copy"
            />
            <PrimaryButton
              label={stampedFile ? stampedFile.name : 'Or choose a file'}
              variant="secondary"
              icon="folder-open"
              onPress={() => void pickStampedFile()}
            />
            <PrimaryButton
              label="Upload stamped copy"
              icon="cloud-upload"
              busy={busy === 'submit_stamped_copy'}
              disabled={!stampedPhoto && !stampedFile}
              onPress={() => void submitStamped()}
            />
          </Card>
        </>
      ) : null}

      <SectionLabel>Print order tracking</SectionLabel>
      {printOrders.length === 0 ? (
        <Card className="mb-3">
          <Text className="font-sans text-sm leading-6 text-muted">
            No print order yet. Our admin raises one once the copy count is confirmed, and you will see
            dispatch and receipt here.
          </Text>
        </Card>
      ) : (
        <View className="mb-3 gap-3">
          {printOrders.map((order) => (
            <Card key={order.id}>
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="font-sans text-base font-bold text-ink">
                    {order.reference ?? 'Print order'}
                  </Text>
                  <Text className="font-sans mt-1 text-sm text-muted">
                    {order.quantity} copies
                    {order.includes_stamped_copy ? ' (includes the stamped +1)' : ''}
                  </Text>
                  {order.printer_name ? (
                    <Text className="font-sans mt-1 text-sm text-muted">{order.printer_name}</Text>
                  ) : null}
                </View>
                <PrintOrderBadge status={order.status} />
              </View>

              <View className="mt-3 gap-1">
                <TrackingLine label="Ordered" at={order.ordered_at} />
                <TrackingLine label="Production started" at={order.production_started_at} />
                <TrackingLine label="Ready for dispatch" at={order.ready_at} />
                <TrackingLine label="Dispatched" at={order.dispatched_at} />
                <TrackingLine label="Received" at={order.received_at} />
              </View>

              {order.dispatch_means ? (
                <Text className="font-sans mt-3 text-sm leading-6 text-ink">
                  Sent by {DISPATCH_MEANS_LABELS[order.dispatch_means] ?? order.dispatch_means}
                  {order.dispatch_carrier ? ` · ${order.dispatch_carrier}` : ''}
                  {order.dispatch_tracking_ref ? ` · ref ${order.dispatch_tracking_ref}` : ''}
                </Text>
              ) : null}
              {order.dispatch_notes ? (
                <Text className="font-sans mt-1 text-sm leading-6 text-muted">{order.dispatch_notes}</Text>
              ) : null}
              {order.receipt_notes ? (
                <Text className="font-sans mt-1 text-sm leading-6 text-muted">{order.receipt_notes}</Text>
              ) : null}
              {order.cancelled_reason ? (
                <Text className="font-sans mt-2 text-sm font-medium text-bad">
                  Cancelled: {order.cancelled_reason}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <SectionLabel>Documents</SectionLabel>
      {documents.length === 0 ? (
        <Card className="mb-3">
          <Text className="font-sans text-sm leading-6 text-muted">
            Nothing uploaded for this school yet.
          </Text>
        </Card>
      ) : (
        <View className="mb-3 gap-3">
          {documents.map((document) => (
            <Card key={document.id}>
              <Text className="font-sans text-base font-bold text-ink">
                {DOCUMENT_KIND_LABEL[document.kind] ?? document.kind}
              </Text>
              <View className="mt-2">
                <OcrBadge status={document.ocr_status} />
              </View>
              <Text className="font-sans mt-2 text-sm leading-6 text-muted">
                {sourceFormatLabel(document.source_format)}
                {document.file_size_bytes
                  ? ` · ${(document.file_size_bytes / 1024 / 1024).toFixed(1)} MB`
                  : ''}
                {document.page_count ? ` · ${document.page_count} pages` : ''}
              </Text>
              <Text className="font-sans mt-1 text-sm text-muted">
                {formatNairobiDisplay(document.created_at)}
                {document.uploaded_by_name ? ` · ${document.uploaded_by_name}` : ''}
                {document.is_current ? '' : ' · superseded'}
              </Text>
              {document.ocr_error ? (
                <Text className="font-sans mt-2 text-sm text-bad">{document.ocr_error}</Text>
              ) : null}
              <PrimaryButton
                label="Open"
                variant="secondary"
                icon="open"
                busy={busy === `open-${document.id}`}
                onPress={() => void openDocument(document)}
              />
            </Card>
          ))}
        </View>
      )}

      <SectionLabel>Visits</SectionLabel>
      {visits.length === 0 ? (
        <Card className="mb-3">
          <Text className="font-sans text-sm leading-6 text-muted">No visit recorded yet.</Text>
        </Card>
      ) : (
        <View className="mb-3 gap-3">
          {visits.map((visit) => (
            <Card key={visit.id}>
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="font-sans text-base font-bold text-ink">
                    {formatNairobiDisplay(visit.arrived_at)}
                  </Text>
                  <Text className="font-sans mt-1 text-sm text-muted">
                    {OUTCOME_LABEL[visit.outcome] ?? visit.outcome}
                    {visit.ba_name ? ` · ${visit.ba_name}` : ''}
                  </Text>
                </View>
                {visit.selfie_photo_path ? (
                  <View className="shrink-0">
                    <PrimaryButton
                      label="Selfie"
                      variant="ghost"
                      busy={busy === `open-${visit.selfie_photo_path}`}
                      onPress={() => void openSelfie(visit.selfie_photo_path)}
                    />
                  </View>
                ) : null}
              </View>

              <Text className="font-sans mt-2 text-sm leading-6 text-muted">
                {GEOFENCE_LABEL[visit.geofence_status] ?? 'GPS recorded'}
                {visit.distance_metres !== null
                  ? ` · about ${Math.round(visit.distance_metres)} m away`
                  : ''}
                {visit.accuracy_metres !== null ? ` · accuracy ${Math.round(visit.accuracy_metres)} m` : ''}
              </Text>
              <Text className="font-sans mt-1 text-sm leading-6 text-muted">
                Gate selfie {visit.selfie_photo_path ? 'captured' : 'not captured'}
                {visit.selfie_required ? ' (required for this agency)' : ' (optional for this agency)'}
              </Text>

              {visit.contact_person_name ? (
                <Text className="font-sans mt-2 text-sm leading-6 text-ink">
                  Spoke to {visit.contact_person_name}
                  {visit.contact_person_role ? `, ${visit.contact_person_role}` : ''}
                  {visit.contact_person_phone ? ` · ${visit.contact_person_phone}` : ''}
                </Text>
              ) : null}

              {visit.outcome === 'declined' ? (
                <Text className="font-sans mt-2 text-sm leading-6 text-ink">
                  Reason: {declineReasonLabel(visit.declined_reason_code)}
                  {visit.declined_reason_notes ? ` — ${visit.declined_reason_notes}` : ''}
                </Text>
              ) : null}

              {visit.notes ? (
                <Text className="font-sans mt-2 text-sm leading-6 text-muted">{visit.notes}</Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <SectionLabel>Timeline</SectionLabel>
      {timeline.length === 0 ? (
        <Card className="mb-6">
          <Text className="font-sans text-sm leading-6 text-muted">No stage changes recorded yet.</Text>
        </Card>
      ) : (
        <Card className="mb-6">
          {timeline.map((event) => (
            <View key={event.id} className="flex-row gap-3 py-2">
              <View className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
              <View className="flex-1">
                <Text className="font-sans text-sm font-semibold text-ink">
                  {event.from_stage
                    ? `${event.from_stage.replaceAll('_', ' ')} → ${event.to_stage.replaceAll('_', ' ')}`
                    : event.to_stage.replaceAll('_', ' ')}
                </Text>
                <Text className="font-sans mt-0.5 text-xs text-muted">
                  {formatNairobiDisplay(event.created_at)}
                  {event.changed_by_name ? ` · ${event.changed_by_name}` : ''}
                  {event.changed_by_role ? ` (${event.changed_by_role.replaceAll('_', ' ')})` : ''}
                </Text>
                {event.note ? (
                  <Text className="font-sans mt-1 text-sm leading-6 text-muted">{event.note}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      )}
    </Page>
  );
}

/** One dated milestone in a print run. Milestones that have not happened show a dash. */
function TrackingLine({ label, at }: { label: string; at: string | null }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className={`font-sans text-sm ${at ? 'font-medium text-ink' : 'text-muted'}`}>{label}</Text>
      <Text className="font-sans text-sm text-muted">{at ? formatNairobiDisplay(at) : '—'}</Text>
    </View>
  );
}
