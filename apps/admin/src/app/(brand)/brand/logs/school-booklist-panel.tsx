'use client';

import { useEffect, useMemo, useState } from 'react';
import { browserSupabase } from '@fazoo/database/browser';
import { DECLINE_REASONS, SOURCE_FORMATS } from '@fazoo/config';
import type {
  BaPipelineCounts,
  BaPipelineJob,
  BaSchoolMatch,
  BaSchoolPipelineResult,
  BaStartSchoolVisitResult,
  BaRecordVisitOutcomeResult,
  BaVisitStatsResult,
  BooklistStage,
} from '@fazoo/types';
import { AgencyBadge, StageBadge } from '@/components/stage-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';

type Props = {
  organizationId: string;
  userId: string;
};

type LocationFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type PipelineJob = BaPipelineJob & { due_date?: string | null };
type Outcome = '' | 'booklist_offered' | 'declined';
type StepState = 'done' | 'current' | 'pending' | 'not_required';

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const FIELD =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary';

const AFTER_WORD = new Set<BooklistStage>([
  'formatted',
  'pending_school_approval',
  'school_approved',
  'in_production',
  'dispatched',
  'received',
  'completed',
]);

function useLocation() {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  async function locate() {
    setLocating(true);
    setLocationError(null);
    try {
      if (!navigator.geolocation) throw new Error('This browser does not support location services.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      });
      setFix({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      });
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  return { fix, locating, locationError, locate };
}

function fileExtension(file: File) {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : null;
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  if (file.type.includes('png')) return 'png';
  if (file.type.includes('webp')) return 'webp';
  if (file.type.includes('pdf')) return 'pdf';
  if (file.type.includes('wordprocessingml')) return 'docx';
  if (file.type.includes('msword')) return 'doc';
  return 'jpg';
}

async function uploadFile(
  client: ReturnType<typeof browserSupabase>,
  bucket: 'daily-log-photos' | 'booklist-documents',
  organizationId: string,
  userId: string,
  requestId: string,
  slot: string,
  file: File,
) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name || 'The selected file'} is larger than 12 MB.`);
  }
  const path = `${organizationId}/${userId}/${requestId}-${slot}.${fileExtension(file)}`;
  const { error } = await client.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(`Could not upload ${slot.replaceAll('-', ' ')}: ${error.message}`);
  return path;
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function nextAction(job: PipelineJob) {
  const total = job.copies_to_print ?? (job.copies_requested ? job.copies_requested + 1 : null);
  switch (job.stage) {
    case 'engaged':
      return 'Record whether the school supplied the booklist or denied the request.';
    case 'declined':
      return 'No further action. The denial is documented.';
    case 'booklist_offered':
      return 'Attach the original booklist and the print request details.';
    case 'document_received':
    case 'awaiting_conversion':
    case 'converting':
      return 'Admin is converting the supplied material into the final Word document.';
    case 'formatted':
    case 'pending_school_approval':
    case 'school_approved':
      return `Word document is ready. Admin should raise the print order${total ? ` for ${total.toLocaleString()} copies including the stamped +1` : ''}.`;
    case 'in_production':
      return `Admin is printing${total ? ` ${total.toLocaleString()} copies including the stamped +1` : ''}.`;
    case 'dispatched':
      return 'The printed booklists have been shipped to the school. Admin is tracking delivery.';
    case 'received':
      return 'Have the extra +1 copy stamped by the school, then upload it below to close the log.';
    case 'completed':
      return 'Complete. The stamped +1 copy is stored in FAZOO.';
    case 'on_hold':
      return 'This job is on hold. Check the admin note before continuing.';
    case 'cancelled':
      return 'This job was cancelled.';
  }
}

function progressSteps(job: PipelineJob): Array<{ label: string; state: StepState }> {
  if (job.stage === 'declined') {
    return [
      { label: 'School approached', state: 'done' },
      { label: 'Booklist denied', state: 'done' },
      { label: 'Convert to Word', state: 'not_required' },
      { label: 'Print +1', state: 'not_required' },
      { label: 'Ship to school', state: 'not_required' },
      { label: 'Stamped proof', state: 'not_required' },
    ];
  }

  const wordDone = AFTER_WORD.has(job.stage);
  const printingDone = ['dispatched', 'received', 'completed'].includes(job.stage);
  const shippedDone = ['received', 'completed'].includes(job.stage);
  const complete = job.stage === 'completed' || job.stamped_uploaded;

  return [
    { label: 'School approached', state: 'done' },
    {
      label: 'Booklist supplied',
      state: job.stage === 'engaged' ? 'current' : 'done',
    },
    {
      label: 'Convert to Word',
      state: wordDone ? 'done' : ['document_received', 'awaiting_conversion', 'converting'].includes(job.stage) ? 'current' : 'pending',
    },
    {
      label: 'Print +1',
      state: printingDone ? 'done' : job.stage === 'in_production' ? 'current' : 'pending',
    },
    {
      label: 'Ship to school',
      state: shippedDone ? 'done' : job.stage === 'dispatched' ? 'current' : 'pending',
    },
    {
      label: 'Stamped proof',
      state: complete ? 'done' : job.stage === 'received' ? 'current' : 'pending',
    },
  ];
}

function ProgressGrid({ job }: { job: PipelineJob }) {
  const label: Record<StepState, string> = {
    done: 'Done',
    current: 'Current',
    pending: 'Pending',
    not_required: 'N/A',
  };
  const style: Record<StepState, string> = {
    done: 'border-ok/25 bg-ok/10 text-ink',
    current: 'border-primary/30 bg-primary/5 text-ink',
    pending: 'border-ink/10 bg-white text-muted',
    not_required: 'border-ink/10 bg-ink/[0.03] text-muted',
  };

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {progressSteps(job).map((step) => (
        <div key={step.label} className={`rounded-lg border px-2.5 py-2 ${style[step.state]}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide">{label[step.state]}</p>
          <p className="mt-0.5 text-xs font-medium">{step.label}</p>
        </div>
      ))}
    </div>
  );
}

export function SchoolBooklistPanel({ organizationId, userId }: Props) {
  const client = useMemo(() => browserSupabase(), []);
  const { fix, locating, locationError, locate } = useLocation();

  const [stats, setStats] = useState<BaVisitStatsResult | null>(null);
  const [counts, setCounts] = useState<BaPipelineCounts | null>(null);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [schoolQuery, setSchoolQuery] = useState('');
  const [region, setRegion] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [schoolList, setSchoolList] = useState<BaSchoolMatch[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<BaSchoolMatch | null>(null);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retrySearch, setRetrySearch] = useState(0);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [schoolCreating, setSchoolCreating] = useState(false);
  const [newSchoolData, setNewSchoolData] = useState({
    name: '',
    region: '',
    address: '',
    contactName: '',
  });

  const [gateSelfie, setGateSelfie] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [declineCode, setDeclineCode] = useState('');
  const [declineNotes, setDeclineNotes] = useState('');
  const [sourceFormat, setSourceFormat] = useState('');
  const [booklistFile, setBooklistFile] = useState<File | null>(null);
  const [copiesRequested, setCopiesRequested] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isPerGrade, setIsPerGrade] = useState<'unknown' | 'yes' | 'no'>('unknown');
  const [gradeNotes, setGradeNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [pipelineQuery, setPipelineQuery] = useState('');
  const [stampedFiles, setStampedFiles] = useState<Record<string, File | null>>({});
  const [stampedBusy, setStampedBusy] = useState<string | null>(null);

  const today = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [statsResult, pipelineResult] = await Promise.all([
        client.rpc('ba_visit_stats'),
        client.rpc('ba_school_pipeline_v2' as never, { p_limit: 200 } as never),
      ]);
      if (statsResult.error) throw new Error(statsResult.error.message);
      if (pipelineResult.error) throw new Error(pipelineResult.error.message);
      setStats(statsResult.data as unknown as BaVisitStatsResult);
      const pipeline = pipelineResult.data as unknown as BaSchoolPipelineResult;
      setCounts(pipeline.counts);
      setJobs((pipeline.jobs ?? []) as PipelineJob[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the school pipeline.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: lookupError } = await client.rpc('ba_search_schools', {
          p_query: schoolQuery.trim() || undefined,
          p_region: region || undefined,
          p_limit: 50,
        });
        if (cancelled) return;
        if (lookupError) throw new Error(lookupError.message);
        const result = data as unknown as { schools?: BaSchoolMatch[]; regions?: string[] };
        setSchoolList(result.schools ?? []);
        setRegions(result.regions ?? []);
      } catch {
        if (!cancelled) {
          setSchoolList([]);
          setSearchError('Could not load schools. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [client, schoolQuery, region, retrySearch]);

  async function createSchool() {
    if (newSchoolData.name.trim().length < 3) {
      setError('Enter the full school name before saving it.');
      return;
    }
    setSchoolCreating(true);
    setError(null);
    try {
      const name = newSchoolData.name.trim();
      const { data, error: createError } = await client.rpc('ba_create_school', {
        p_name: name,
        p_region: newSchoolData.region.trim() || undefined,
        p_address: newSchoolData.address.trim() || undefined,
        p_contact_person_name: newSchoolData.contactName.trim() || undefined,
        p_client_request_id: crypto.randomUUID(),
      });
      if (createError) throw new Error(createError.message);
      const created = data as unknown as {
        school_id?: string;
        school_name?: string;
        school_region?: string | null;
        duplicate?: boolean;
      };
      if (!created.school_id) throw new Error('The school could not be saved.');

      setSelectedSchool({
        school_id: created.school_id,
        school_name: created.school_name ?? name,
        school_region: created.school_region ?? newSchoolData.region.trim() || null,
        school_address: newSchoolData.address.trim() || null,
        latitude: null,
        longitude: null,
        has_active_job: false,
        job_stage: null,
      });
      setSchoolQuery(created.school_name ?? name);
      setContactName((current) => current || newSchoolData.contactName.trim());
      setShowCreateForm(false);
      setSuccess(created.duplicate ? 'That school was already on the master list and has been selected.' : 'School added to the master list and selected.');
      setNewSchoolData({ name: '', region: '', address: '', contactName: '' });
      setRetrySearch((value) => value + 1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not add the school.');
    } finally {
      setSchoolCreating(false);
    }
  }

  function chooseSchool(school: BaSchoolMatch) {
    setSelectedSchool(school);
    setShowCreateForm(false);
    setError(null);
    setSuccess(null);
  }

  function resetEntry() {
    setSelectedSchool(null);
    setSchoolQuery('');
    setGateSelfie(null);
    setOutcome('');
    setContactName('');
    setContactRole('');
    setContactPhone('');
    setDeclineCode('');
    setDeclineNotes('');
    setSourceFormat('');
    setBooklistFile(null);
    setCopiesRequested('');
    setDueDate('');
    setIsPerGrade('unknown');
    setGradeNotes('');
  }

  async function submitLog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedSchool) return setError('Choose a school from the list or add it manually.');
    if (!fix) return setError('Capture your location before saving the school visit.');
    if (stats?.selfie_required && !gateSelfie) return setError('Take the required gate selfie before continuing.');
    if (!outcome) return setError('Choose whether the school supplied the booklist or denied the request.');
    if (outcome === 'declined' && !declineCode && !declineNotes.trim()) {
      return setError('Record why the school denied the booklist request.');
    }

    let requested = 0;
    if (outcome === 'booklist_offered') {
      requested = Number(copiesRequested);
      if (!contactName.trim()) return setError('Enter the name of the person who gave you the booklist.');
      if (!booklistFile) return setError('Attach the booklist the school gave you.');
      if (!sourceFormat) return setError('Choose how the school gave you the booklist.');
      if (!Number.isInteger(requested) || requested < 1) return setError('Enter a valid number of copies requested.');
      if (!dueDate) return setError('Enter the date the school needs the printed booklists.');
      if (dueDate < today) return setError('The due date cannot be in the past.');
    }

    setSubmitting(true);
    const uploaded: Array<{ bucket: 'daily-log-photos' | 'booklist-documents'; path: string }> = [];
    let visitCreated = false;

    try {
      const visitRequestId = crypto.randomUUID();
      const selfiePath = gateSelfie
        ? await uploadFile(client, 'daily-log-photos', organizationId, userId, visitRequestId, 'gate-selfie', gateSelfie)
        : null;
      if (selfiePath) uploaded.push({ bucket: 'daily-log-photos', path: selfiePath });

      let rawPath: string | null = null;
      const documentRequestId = crypto.randomUUID();
      if (outcome === 'booklist_offered' && booklistFile) {
        rawPath = await uploadFile(
          client,
          'booklist-documents',
          organizationId,
          userId,
          documentRequestId,
          'booklist',
          booklistFile,
        );
        uploaded.push({ bucket: 'booklist-documents', path: rawPath });
      }

      const { data: visitData, error: visitError } = await client.rpc('ba_start_school_visit', {
        p_school_id: selectedSchool.school_id,
        p_client_request_id: visitRequestId,
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy ?? undefined,
        p_selfie_photo_path: selfiePath ?? undefined,
        p_contact_person_name: contactName.trim() || undefined,
        p_contact_person_role: contactRole.trim() || undefined,
        p_contact_person_phone: contactPhone.trim() || undefined,
      });
      if (visitError) throw new Error(visitError.message);
      visitCreated = true;
      const visit = visitData as unknown as BaStartSchoolVisitResult;

      const { data: outcomeData, error: outcomeError } = await client.rpc('ba_record_visit_outcome', {
        p_visit_id: visit.visit_id,
        p_client_request_id: crypto.randomUUID(),
        p_outcome: outcome,
        p_declined_reason_code: outcome === 'declined' ? declineCode || undefined : undefined,
        p_declined_reason_notes: outcome === 'declined' ? declineNotes.trim() || undefined : undefined,
        p_contact_person_name: contactName.trim() || undefined,
        p_contact_person_role: contactRole.trim() || undefined,
        p_contact_person_phone: contactPhone.trim() || undefined,
        p_is_per_grade: isPerGrade === 'unknown' ? undefined : isPerGrade === 'yes',
      });
      if (outcomeError) throw new Error(outcomeError.message);
      const recorded = outcomeData as unknown as BaRecordVisitOutcomeResult;

      if (outcome === 'booklist_offered') {
        if (!rawPath || !booklistFile) throw new Error('The booklist file was not uploaded.');

        const { error: requestError } = await client.rpc(
          'ba_capture_booklist_request' as never,
          {
            p_job_id: recorded.job_id,
            p_copies_requested: requested,
            p_due_date: dueDate,
            p_client_request_id: crypto.randomUUID(),
          } as never,
        );
        if (requestError) throw new Error(requestError.message);

        const { error: documentError } = await client.rpc('ba_submit_booklist_document', {
          p_visit_id: visit.visit_id,
          p_storage_path: rawPath,
          p_client_request_id: documentRequestId,
          p_mime_type: booklistFile.type || undefined,
          p_file_size_bytes: booklistFile.size,
          p_source_format: sourceFormat,
          p_captured_on_site: sourceFormat === 'photo' || sourceFormat === 'handwritten' || sourceFormat === 'printed',
          p_is_per_grade: isPerGrade === 'unknown' ? undefined : isPerGrade === 'yes',
          p_grade_notes: gradeNotes.trim() || undefined,
        });
        if (documentError) throw new Error(documentError.message);

        setSuccess(
          `${selectedSchool.school_name}: booklist received and sent to admin. ${requested.toLocaleString()} requested + 1 stamped copy = ${(requested + 1).toLocaleString()} copies to print, due ${formatDate(dueDate)}.`,
        );
      } else {
        setSuccess(`${selectedSchool.school_name}: denial recorded successfully.`);
      }

      resetEntry();
      await load();
    } catch (submitError) {
      if (!visitCreated && uploaded.length > 0) {
        await Promise.all(
          uploaded.map(({ bucket, path }) => client.storage.from(bucket).remove([path])),
        );
      }
      setError(submitError instanceof Error ? submitError.message : 'Could not save the school log.');
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadStamped(job: PipelineJob) {
    const file = stampedFiles[job.job_id];
    if (!file) return setError('Choose the stamped +1 copy first.');
    setStampedBusy(job.job_id);
    setError(null);
    setSuccess(null);
    const requestId = crypto.randomUUID();
    let path: string | null = null;
    try {
      path = await uploadFile(
        client,
        'booklist-documents',
        organizationId,
        userId,
        requestId,
        'stamped-copy',
        file,
      );
      const { error: stampedError } = await client.rpc('ba_submit_stamped_copy', {
        p_job_id: job.job_id,
        p_storage_path: path,
        p_client_request_id: requestId,
        p_mime_type: file.type || undefined,
        p_file_size_bytes: file.size,
      });
      if (stampedError) throw new Error(stampedError.message);
      setStampedFiles((current) => ({ ...current, [job.job_id]: null }));
      setSuccess(`${job.school_name}: stamped +1 copy uploaded. The log is now complete.`);
      await load();
    } catch (stampedError) {
      if (path) await client.storage.from('booklist-documents').remove([path]);
      setError(stampedError instanceof Error ? stampedError.message : 'Could not upload the stamped copy.');
    } finally {
      setStampedBusy(null);
    }
  }

  const visibleJobs = useMemo(() => {
    const needle = pipelineQuery.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((job) => `${job.school_name} ${job.school_region ?? ''}`.toLowerCase().includes(needle));
  }, [jobs, pipelineQuery]);

  const target = stats?.target?.target_schools ?? stats?.default_target_schools_per_month ?? null;
  const reached = stats?.schools_visited_this_month ?? 0;

  return (
    <div className="space-y-5">
      {success ? (
        <div className="rounded-xl border border-ok/25 bg-ok/10 px-4 py-3 text-sm font-medium text-ink" role="status">
          {success}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-bad/25 bg-bad/10 px-4 py-3 text-sm font-medium text-bad" role="alert">
          {error}
        </div>
      ) : null}

      <form onSubmit={submitLog} className="space-y-5">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">1. Choose the school</h2>
              <p className="mt-1 text-xs text-muted">
                Select from the FAZOO master list. If the school is missing, add it without leaving this log.
              </p>
            </div>
            {selectedSchool ? (
              <Button type="button" variant="outline" onClick={() => setSelectedSchool(null)}>
                Change school
              </Button>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {selectedSchool ? (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Selected</p>
                <p className="mt-1 font-semibold text-ink">{selectedSchool.school_name}</p>
                <p className="mt-1 text-sm text-muted">{selectedSchool.school_region ?? 'Area not recorded'}</p>
                {selectedSchool.has_active_job ? (
                  <p className="mt-2 text-xs font-medium text-warn">
                    This school already has an active FAZOO log. This visit will be added to that school journey.
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <Label htmlFor="school-search">School name</Label>
                    <Input
                      id="school-search"
                      value={schoolQuery}
                      onChange={(event) => setSchoolQuery(event.target.value)}
                      placeholder="Start typing the school name"
                      autoComplete="off"
                      className="min-h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="school-region">Area (optional)</Label>
                    <Select id="school-region" value={region} onChange={(event) => setRegion(event.target.value)} className="min-h-12">
                      <option value="">All areas</option>
                      {regions.map((area) => <option key={area} value={area}>{area}</option>)}
                    </Select>
                  </div>
                </div>

                <p className="text-sm text-muted" role="status">
                  {searching
                    ? 'Searching schools…'
                    : searchError
                      ? searchError
                      : schoolList.length === 0
                        ? 'No school found. You can add it manually below.'
                        : `${schoolList.length} school${schoolList.length === 1 ? '' : 's'} found.`}
                </p>
                {searchError ? (
                  <Button type="button" variant="outline" onClick={() => setRetrySearch((value) => value + 1)}>
                    Try again
                  </Button>
                ) : null}

                {!searching && schoolList.length > 0 ? (
                  <ul className="max-h-72 overflow-y-auto rounded-xl border border-ink/10" aria-label="Matching schools">
                    {schoolList.map((school) => (
                      <li key={school.school_id} className="border-b border-ink/10 last:border-0">
                        <button
                          type="button"
                          className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-primary/5"
                          onClick={() => chooseSchool(school)}
                        >
                          <span>
                            <span className="block text-sm font-semibold text-ink">{school.school_name}</span>
                            <span className="mt-0.5 block text-xs text-muted">{school.school_region ?? 'Area not recorded'}</span>
                            {school.has_active_job ? <span className="mt-1 block text-xs font-medium text-warn">Active log</span> : null}
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-primary">Select</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!showCreateForm) {
                      setNewSchoolData((current) => ({ ...current, name: schoolQuery.trim(), region }));
                    }
                    setShowCreateForm((value) => !value);
                  }}
                >
                  {showCreateForm ? 'Cancel adding school' : 'School not listed? Add it manually'}
                </Button>

                {showCreateForm ? (
                  <div className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="new-school-name">School name *</Label>
                      <Input id="new-school-name" value={newSchoolData.name} onChange={(event) => setNewSchoolData({ ...newSchoolData, name: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="new-school-region">Region / area</Label>
                      <Input id="new-school-region" value={newSchoolData.region} onChange={(event) => setNewSchoolData({ ...newSchoolData, region: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="new-school-address">Address</Label>
                      <Input id="new-school-address" value={newSchoolData.address} onChange={(event) => setNewSchoolData({ ...newSchoolData, address: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="new-school-contact">Known contact person</Label>
                      <Input id="new-school-contact" value={newSchoolData.contactName} onChange={(event) => setNewSchoolData({ ...newSchoolData, contactName: event.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="button" onClick={() => void createSchool()} disabled={schoolCreating || !newSchoolData.name.trim()}>
                        {schoolCreating ? 'Saving school…' : 'Save and select school'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-base font-semibold text-ink">2. Record the school visit</h2>
          <p className="mt-1 text-xs text-muted">
            Capture the visit location and the gate selfie required by your agency.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-ink/10 p-4">
              <p className="text-sm font-semibold text-ink">GPS location</p>
              <p className="mt-1 text-xs text-muted">
                {fix
                  ? `Captured${fix.accuracy ? ` · accuracy about ${Math.round(fix.accuracy)} m` : ''}`
                  : 'Not captured yet'}
              </p>
              {locationError ? <p className="mt-2 text-xs font-medium text-bad">{locationError}</p> : null}
              <Button type="button" variant="outline" className="mt-3" onClick={() => void locate()} disabled={locating}>
                {locating ? 'Getting location…' : fix ? 'Refresh location' : 'Get my location'}
              </Button>
            </div>
            <div className="rounded-xl border border-ink/10 p-4">
              <Label htmlFor="gate-selfie">
                Gate selfie {stats?.selfie_required ? '*' : '(recommended)'}
              </Label>
              <Input
                id="gate-selfie"
                type="file"
                accept="image/*"
                capture="user"
                onChange={(event) => setGateSelfie(event.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-muted">Maximum 12 MB.</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-base font-semibold text-ink">3. What happened at the school?</h2>
          <p className="mt-1 text-xs text-muted">Record both successful collections and denials.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setOutcome('booklist_offered')}
              className={`rounded-xl border p-4 text-left ${outcome === 'booklist_offered' ? 'border-primary bg-primary/5' : 'border-ink/10 bg-white'}`}
            >
              <span className="block text-sm font-semibold text-ink">Booklist supplied</span>
              <span className="mt-1 block text-xs text-muted">The school gave you a paper, image, scan or softcopy.</span>
            </button>
            <button
              type="button"
              onClick={() => setOutcome('declined')}
              className={`rounded-xl border p-4 text-left ${outcome === 'declined' ? 'border-bad/40 bg-bad/5' : 'border-ink/10 bg-white'}`}
            >
              <span className="block text-sm font-semibold text-ink">Booklist denied</span>
              <span className="mt-1 block text-xs text-muted">The school would not provide the booklist.</span>
            </button>
          </div>

          {outcome === 'declined' ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="decline-code">Reason</Label>
                <Select id="decline-code" value={declineCode} onChange={(event) => setDeclineCode(event.target.value)}>
                  <option value="">Choose a reason</option>
                  {DECLINE_REASONS.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="decline-notes">Notes</Label>
                <textarea id="decline-notes" className={FIELD} rows={3} value={declineNotes} onChange={(event) => setDeclineNotes(event.target.value)} placeholder="Add useful context, especially if you chose Other" />
              </div>
            </div>
          ) : null}

          {outcome === 'booklist_offered' ? (
            <div className="mt-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">Who gave you the booklist?</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="contact-name">Name *</Label>
                    <Input id="contact-name" value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="e.g. Jane Wanjiku" />
                  </div>
                  <div>
                    <Label htmlFor="contact-role">Role / designation</Label>
                    <Input id="contact-role" value={contactRole} onChange={(event) => setContactRole(event.target.value)} placeholder="e.g. Head teacher" />
                  </div>
                  <div>
                    <Label htmlFor="contact-phone">Phone</Label>
                    <Input id="contact-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Optional" inputMode="tel" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-ink">Original booklist</h3>
                <p className="mt-1 text-xs text-muted">
                  Upload exactly what the school gave you. FAZOO keeps the original while admin converts it into the final Word document.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="source-format">How was it supplied? *</Label>
                    <Select id="source-format" value={sourceFormat} onChange={(event) => setSourceFormat(event.target.value)}>
                      <option value="">Choose format</option>
                      {SOURCE_FORMATS.map((format) => <option key={format.code} value={format.code}>{format.label}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="booklist-file">Booklist file / photo *</Label>
                    <Input
                      id="booklist-file"
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf"
                      onChange={(event) => setBooklistFile(event.target.files?.[0] ?? null)}
                    />
                    <p className="mt-1 text-xs text-muted">Photo, scan, PDF, Word or other softcopy · maximum 12 MB.</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-ink">Print request from the school</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="copies-requested">Copies requested *</Label>
                    <Input id="copies-requested" type="number" min={1} step={1} value={copiesRequested} onChange={(event) => setCopiesRequested(event.target.value)} placeholder="e.g. 500" inputMode="numeric" />
                    {Number(copiesRequested) > 0 ? (
                      <p className="mt-1 text-xs font-medium text-primary">
                        FAZOO print total: {(Number(copiesRequested) + 1).toLocaleString()} — requested copies + 1 copy for stamping.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor="due-date">Due date *</Label>
                    <Input id="due-date" type="date" min={today} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="per-grade">Is the booklist per grade?</Label>
                  <Select id="per-grade" value={isPerGrade} onChange={(event) => setIsPerGrade(event.target.value as typeof isPerGrade)}>
                    <option value="unknown">Not sure</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="grade-notes">Grade notes</Label>
                  <Input id="grade-notes" value={gradeNotes} onChange={(event) => setGradeNotes(event.target.value)} placeholder="Optional, e.g. PP1–Grade 6" />
                </div>
              </div>
            </div>
          ) : null}
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          disabled={submitting || !selectedSchool || !fix || !outcome}
        >
          {submitting ? 'Saving school log…' : outcome === 'declined' ? 'Record denial' : 'Save booklist log'}
        </Button>
      </form>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Booklist pipeline</h2>
            <p className="mt-1 text-xs text-muted">
              Each school shows where it is from first approach through Word conversion, printing, shipping and stamped-proof completion.
            </p>
          </div>
          <AgencyBadge agency={stats?.agency} selfieRequired={stats?.selfie_required} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-ink/10 p-3 text-center"><p className="text-lg font-bold text-ink">{counts?.active ?? 0}</p><p className="text-xs text-muted">In progress</p></div>
          <div className="rounded-lg border border-ink/10 p-3 text-center"><p className="text-lg font-bold text-ink">{counts?.awaiting_admin ?? 0}</p><p className="text-xs text-muted">With admin</p></div>
          <div className="rounded-lg border border-ink/10 p-3 text-center"><p className="text-lg font-bold text-ink">{counts?.completed ?? 0}</p><p className="text-xs text-muted">Completed</p></div>
          <div className="rounded-lg border border-ink/10 p-3 text-center"><p className="text-lg font-bold text-ink">{counts?.declined ?? 0}</p><p className="text-xs text-muted">Denied</p></div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-ink/10 p-3"><p className="text-xs text-muted">Schools reached this month</p><p className="mt-1 text-lg font-bold text-ink">{reached}{target ? <span className="text-sm font-medium text-muted"> / {target}</span> : null}</p></div>
          <div className="rounded-lg border border-ink/10 p-3"><p className="text-xs text-muted">Booklists collected</p><p className="mt-1 text-lg font-bold text-ink">{stats?.booklists_collected ?? 0}</p></div>
          <div className="rounded-lg border border-ink/10 p-3"><p className="text-xs text-muted">Denials recorded</p><p className="mt-1 text-lg font-bold text-ink">{stats?.declines_recorded ?? 0}</p></div>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Status by school</h2>
            <p className="mt-1 text-xs text-muted">The action line tells you exactly who needs to do what next.</p>
          </div>
          <div className="sm:w-72">
            <Label htmlFor="pipeline-search">Find a school</Label>
            <Input id="pipeline-search" value={pipelineQuery} onChange={(event) => setPipelineQuery(event.target.value)} placeholder="School name or area" />
          </div>
        </div>

        {visibleJobs.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{loading ? 'Loading schools…' : 'No school logs match this search.'}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {visibleJobs.map((job) => (
              <li key={job.job_id} className="rounded-xl border border-ink/10 bg-white/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{job.school_name}</p>
                    <p className="mt-0.5 text-xs text-muted">{job.school_region ?? 'Area not recorded'}</p>
                  </div>
                  <StageBadge stage={job.stage} />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  {job.copies_requested ? <span>Requested: <strong className="text-ink">{job.copies_requested.toLocaleString()}</strong></span> : <span>Copies: not recorded</span>}
                  {job.copies_to_print ? <span>Print total: <strong className="text-ink">{job.copies_to_print.toLocaleString()}</strong> incl. +1</span> : null}
                  {job.due_date ? <span>Due: <strong className="text-ink">{formatDate(job.due_date)}</strong></span> : null}
                </div>

                <ProgressGrid job={job} />
                <p className="mt-3 rounded-lg bg-lavender px-3 py-2 text-xs font-medium text-ink">
                  Next: {nextAction(job)}
                </p>

                {job.stage === 'received' && !job.stamped_uploaded ? (
                  <div className="mt-4 rounded-xl border border-ok/25 bg-ok/5 p-3">
                    <p className="text-sm font-semibold text-ink">Final proof: stamped +1 copy</p>
                    <p className="mt-1 text-xs text-muted">Upload the copy stamped by the school. This marks the FAZOO log complete.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <Label htmlFor={`stamped-${job.job_id}`}>Stamped copy</Label>
                        <Input
                          id={`stamped-${job.job_id}`}
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(event) => setStampedFiles((current) => ({ ...current, [job.job_id]: event.target.files?.[0] ?? null }))}
                        />
                      </div>
                      <Button type="button" onClick={() => void uploadStamped(job)} disabled={stampedBusy === job.job_id || !stampedFiles[job.job_id]}>
                        {stampedBusy === job.job_id ? 'Uploading…' : 'Upload and complete'}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {job.stamped_uploaded || job.stage === 'completed' ? (
                  <p className="mt-3 text-xs font-semibold text-ok">✓ Stamped +1 proof is on file. This school log is complete.</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh status'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
