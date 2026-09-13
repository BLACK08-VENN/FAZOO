'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { browserSupabase } from '@fazoo/database/browser';
import { DECLINE_REASONS, SOURCE_FORMATS } from '@fazoo/config';
import type {
  BaPipelineCounts,
  BaPipelineJob,
  BaRecordVisitOutcomeResult,
  BaSchoolMatch,
  BaSchoolPipelineResult,
  BaStartSchoolVisitResult,
  BaVisitStatsResult,
} from '@fazoo/types';
import { AgencyBadge, StageBadge } from '@/components/stage-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';

type Props = { organizationId: string; userId: string };
type Outcome = '' | 'booklist_offered' | 'declined' | 'follow_up';
type PipelineJob = BaPipelineJob & {
  due_date?: string | null;
  follow_up_date?: string | null;
  follow_up_notes?: string | null;
};
type Fix = { latitude: number; longitude: number; accuracy: number | null };
type StepState = 'done' | 'current' | 'pending' | 'na';
type GradeBooklistDraft = {
  key: string;
  gradeLabel: string;
  copies: string;
  sourceFormat: string;
  file: File | null;
};

function blankGradeBooklist(key = 'grade-1'): GradeBooklistDraft {
  return { key, gradeLabel: '', copies: '', sourceFormat: '', file: null };
}

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const TEXTAREA =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary';

function localIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function readableDate(value?: string | null) {
  if (!value) return 'Not recorded';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function extension(file: File) {
  const named = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : null;
  if (named && /^[a-z0-9]{1,8}$/.test(named)) return named;
  if (file.type.includes('pdf')) return 'pdf';
  if (file.type.includes('png')) return 'png';
  if (file.type.includes('webp')) return 'webp';
  if (file.type.includes('wordprocessingml')) return 'docx';
  if (file.type.includes('msword')) return 'doc';
  return 'jpg';
}

async function upload(
  client: ReturnType<typeof browserSupabase>,
  bucket: 'daily-log-photos' | 'booklist-documents',
  organizationId: string,
  userId: string,
  requestId: string,
  slot: string,
  file: File,
) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name || 'Selected file'} is larger than 12 MB.`);
  }
  const path = `${organizationId}/${userId}/${requestId}-${slot}.${extension(file)}`;
  const { error } = await client.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(`Could not upload ${slot.replaceAll('-', ' ')}: ${error.message}`);
  return path;
}

function stepState(job: PipelineJob): Array<[string, StepState]> {
  if (job.stage === 'declined') {
    return [
      ['School approached', 'done'],
      ['Booklist denied', 'done'],
      ['Convert to Word', 'na'],
      ['Print +1', 'na'],
      ['Ship to school', 'na'],
      ['Stamped proof', 'na'],
    ];
  }

  if (job.stage === 'on_hold' && job.follow_up_date) {
    return [
      ['School approached', 'done'],
      ['Follow-up scheduled', 'current'],
      ['Booklist supplied', 'pending'],
      ['Convert to Word', 'pending'],
      ['Print +1', 'pending'],
      ['Ship to school', 'pending'],
      ['Stamped proof', 'pending'],
    ];
  }

  const wordDone = [
    'formatted',
    'pending_school_approval',
    'school_approved',
    'in_production',
    'dispatched',
    'received',
    'completed',
  ].includes(job.stage);
  const printDone = ['dispatched', 'received', 'completed'].includes(job.stage);
  const shippedDone = ['received', 'completed'].includes(job.stage);
  const stampedDone = job.stage === 'completed' || job.stamped_uploaded;

  return [
    ['School approached', 'done'],
    ['Booklist supplied', job.stage === 'engaged' ? 'current' : 'done'],
    [
      'Convert to Word',
      wordDone
        ? 'done'
        : ['document_received', 'awaiting_conversion', 'converting'].includes(job.stage)
          ? 'current'
          : 'pending',
    ],
    ['Print +1', printDone ? 'done' : job.stage === 'in_production' ? 'current' : 'pending'],
    ['Ship to school', shippedDone ? 'done' : job.stage === 'dispatched' ? 'current' : 'pending'],
    ['Stamped proof', stampedDone ? 'done' : job.stage === 'received' ? 'current' : 'pending'],
  ];
}

function nextAction(job: PipelineJob) {
  switch (job.stage) {
    case 'engaged':
      return 'Record whether the school supplied the booklist, asked you to return later, or denied the request.';
    case 'declined':
      return 'Closed as denied. No printing is required.';
    case 'booklist_offered':
      return 'Attach the original booklist and complete the print request.';
    case 'document_received':
    case 'awaiting_conversion':
    case 'converting':
      return 'Admin is converting the original material into the final Word document.';
    case 'formatted':
    case 'pending_school_approval':
    case 'school_approved':
      return 'Word document ready. Admin should create the separate grade print order(s).';
    case 'in_production':
      return 'Printing in progress for the separate grade print order(s).';
    case 'dispatched':
      return 'Printed copies have been shipped to the school. Delivery is being tracked.';
    case 'received':
      return 'Upload the school-stamped +1 copy below to complete this log.';
    case 'completed':
      return 'Complete. The stamped +1 proof is stored in FAZOO.';
    case 'on_hold':
      return job.follow_up_date
        ? `Return to the school on ${readableDate(job.follow_up_date)}${job.follow_up_notes ? ` — ${job.follow_up_notes}` : ''}.`
        : 'This job is on hold. Check the admin note.';
    case 'cancelled':
      return 'This job has been cancelled.';
  }
}

function Progress({ job }: { job: PipelineJob }) {
  const styles: Record<StepState, string> = {
    done: 'border-ok/25 bg-ok/10 text-ink',
    current: 'border-primary/30 bg-primary/5 text-ink',
    pending: 'border-ink/10 bg-white text-muted',
    na: 'border-ink/10 bg-ink/[0.03] text-muted',
  };
  const labels: Record<StepState, string> = {
    done: 'Done',
    current: 'Current',
    pending: 'Pending',
    na: 'N/A',
  };

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {stepState(job).map(([name, state]) => (
        <div key={name} className={`rounded-lg border px-2.5 py-2 ${styles[state]}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide">{labels[state]}</p>
          <p className="mt-0.5 text-xs font-medium">{name}</p>
        </div>
      ))}
    </div>
  );
}

export function SchoolBooklistWorkflow({ organizationId, userId }: Props) {
  const client = useMemo(() => browserSupabase(), []);
  const [stats, setStats] = useState<BaVisitStatsResult | null>(null);
  const [counts, setCounts] = useState<BaPipelineCounts | null>(null);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [schools, setSchools] = useState<BaSchoolMatch[]>([]);
  const [selected, setSelected] = useState<BaSchoolMatch | null>(null);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRetry, setSearchRetry] = useState(0);
  const [addingSchool, setAddingSchool] = useState(false);
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [draftSchool, setDraftSchool] = useState({ name: '', region: '', address: '', contact: '' });
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declineNotes, setDeclineNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [gradeBooklists, setGradeBooklists] = useState<GradeBooklistDraft[]>([blankGradeBooklist()]);
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pipelineQuery, setPipelineQuery] = useState('');
  const [stampedFiles, setStampedFiles] = useState<Record<string, File | null>>({});
  const [stampedBusy, setStampedBusy] = useState<string | null>(null);
  const today = useMemo(localIsoDate, []);

  async function loadPipeline() {
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
      setError(loadError instanceof Error ? loadError.message : 'Could not load the booklist pipeline.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPipeline(); }, []);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: searchFailure } = await client.rpc('ba_search_schools', {
          p_query: query.trim() || undefined,
          p_region: region || undefined,
          p_limit: 50,
        });
        if (cancelled) return;
        if (searchFailure) throw new Error(searchFailure.message);
        const result = data as unknown as { schools?: BaSchoolMatch[]; regions?: string[] };
        setSchools(result.schools ?? []);
        setRegions(result.regions ?? []);
      } catch {
        if (!cancelled) {
          setSchools([]);
          setSearchError('Could not load schools. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [client, query, region, searchRetry]);

  async function locate() {
    setLocating(true);
    setLocationError(null);
    try {
      if (!navigator.geolocation) throw new Error('Location is not supported by this browser.');
      const result = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
      setFix({ latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: Number.isFinite(result.coords.accuracy) ? result.coords.accuracy : null });
    } catch (locationFailure) {
      setLocationError(locationFailure instanceof Error ? locationFailure.message : 'Could not get your location.');
    } finally { setLocating(false); }
  }

  async function createSchool() {
    if (draftSchool.name.trim().length < 3) { setError('Enter the full school name.'); return; }
    setCreatingSchool(true); setError(null);
    try {
      const name = draftSchool.name.trim();
      const { data, error: createFailure } = await client.rpc('ba_create_school', {
        p_name: name,
        p_region: draftSchool.region.trim() || undefined,
        p_address: draftSchool.address.trim() || undefined,
        p_contact_person_name: draftSchool.contact.trim() || undefined,
        p_client_request_id: crypto.randomUUID(),
      });
      if (createFailure) throw new Error(createFailure.message);
      const created = data as unknown as { school_id?: string; school_name?: string; school_region?: string | null; duplicate?: boolean };
      if (!created.school_id) throw new Error('School could not be saved.');
      setSelected({ school_id: created.school_id, school_name: created.school_name || name, school_region: created.school_region || draftSchool.region.trim() || null, school_address: draftSchool.address.trim() || null, latitude: null, longitude: null, has_active_job: false, job_stage: null });
      setContactName((value) => value || draftSchool.contact.trim());
      setQuery(created.school_name || name); setAddingSchool(false); setDraftSchool({ name: '', region: '', address: '', contact: '' });
      setSuccess(created.duplicate ? 'That school already existed and has been selected.' : 'School added and selected.'); setSearchRetry((value) => value + 1);
    } catch (createFailure) { setError(createFailure instanceof Error ? createFailure.message : 'Could not add the school.'); }
    finally { setCreatingSchool(false); }
  }

  function clearForm() {
    setSelected(null); setQuery(''); setSelfie(null); setOutcome(''); setContactName(''); setContactRole(''); setContactPhone(''); setDeclineReason(''); setDeclineNotes(''); setFollowUpDate(''); setFollowUpNotes(''); setGradeBooklists([blankGradeBooklist()]); setDueDate('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSuccess(null);
    if (!selected) return setError('Choose a school from the list or add it manually.');
    if (!fix) return setError('Capture your GPS location first.');
    if (stats?.selfie_required && !selfie) return setError('A gate selfie is required for this visit.');
    if (!outcome) return setError('Choose Booklist supplied, Follow-up required, or Booklist denied.');
    if (outcome === 'declined' && !declineReason && !declineNotes.trim()) return setError('Record why the school denied the request.');
    if (outcome === 'follow_up') {
      if (!followUpDate) return setError('Choose the date the school asked you to return.');
      if (followUpDate < today) return setError('The follow-up date cannot be in the past.');
    }
    const preparedGrades = gradeBooklists.map((grade) => ({ ...grade, gradeLabel: grade.gradeLabel.trim(), requested: Number(grade.copies) }));
    if (outcome === 'booklist_offered') {
      if (!dueDate) return setError('Enter the due date.');
      if (dueDate < today) return setError('The due date cannot be in the past.');
      if (preparedGrades.length < 1) return setError('Add at least one grade or class booklist.');
      const labels = preparedGrades.map((grade) => grade.gradeLabel.toLowerCase());
      if (labels.some((label) => !label)) return setError('Enter the grade or class name for every booklist.');
      if (new Set(labels).size !== labels.length) return setError('Each grade or class can only be added once.');
      for (const grade of preparedGrades) {
        if (!grade.sourceFormat) return setError(`Choose the source format for ${grade.gradeLabel}.`);
        if (!grade.file) return setError(`Attach the booklist for ${grade.gradeLabel}.`);
        if (!Number.isInteger(grade.requested) || grade.requested < 1) return setError(`Enter a valid number of copies for ${grade.gradeLabel}.`);
      }
    }

    setSubmitting(true);
    const uploaded: Array<{ bucket: 'daily-log-photos' | 'booklist-documents'; path: string }> = [];
    let visitCreated = false;
    try {
      const visitRequestId = crypto.randomUUID();
      let selfiePath: string | null = null;
      if (selfie) {
        selfiePath = await upload(client, 'daily-log-photos', organizationId, userId, visitRequestId, 'gate-selfie', selfie);
        uploaded.push({ bucket: 'daily-log-photos', path: selfiePath });
      }
      const { data: visitData, error: visitFailure } = await client.rpc('ba_start_school_visit', { p_school_id: selected.school_id, p_client_request_id: visitRequestId, p_latitude: fix.latitude, p_longitude: fix.longitude, p_accuracy_metres: fix.accuracy ?? undefined, p_selfie_photo_path: selfiePath ?? undefined, p_contact_person_name: contactName.trim() || undefined, p_contact_person_role: contactRole.trim() || undefined, p_contact_person_phone: contactPhone.trim() || undefined });
      if (visitFailure) throw new Error(visitFailure.message);
      visitCreated = true;
      const visit = visitData as unknown as BaStartSchoolVisitResult;

      if (outcome === 'follow_up') {
        const { error: followUpFailure } = await client.rpc('ba_schedule_booklist_follow_up' as never, { p_visit_id: visit.visit_id, p_follow_up_date: followUpDate, p_follow_up_notes: followUpNotes.trim() || undefined, p_client_request_id: crypto.randomUUID() } as never);
        if (followUpFailure) throw new Error(followUpFailure.message);
        setSuccess(`${selected.school_name}: follow-up scheduled for ${readableDate(followUpDate)}. The school remains open under your booklist pipeline.`);
        clearForm(); await loadPipeline(); return;
      }

      const { data: outcomeData, error: outcomeFailure } = await client.rpc('ba_record_visit_outcome', { p_visit_id: visit.visit_id, p_client_request_id: crypto.randomUUID(), p_outcome: outcome, p_declined_reason_code: outcome === 'declined' ? declineReason || undefined : undefined, p_declined_reason_notes: outcome === 'declined' ? declineNotes.trim() || undefined : undefined, p_contact_person_name: contactName.trim() || undefined, p_contact_person_role: contactRole.trim() || undefined, p_contact_person_phone: contactPhone.trim() || undefined, p_is_per_grade: outcome === 'booklist_offered' ? true : undefined });
      if (outcomeFailure) throw new Error(outcomeFailure.message);
      const recorded = outcomeData as unknown as BaRecordVisitOutcomeResult;
      if (outcome === 'booklist_offered') {
        for (const [index, grade] of preparedGrades.entries()) {
          const file = grade.file;
          if (!file) throw new Error(`Attach the booklist for ${grade.gradeLabel}.`);
          const gradeRequestId = crypto.randomUUID();
          let gradePath: string | null = null;
          try {
            gradePath = await upload(client, 'booklist-documents', organizationId, userId, gradeRequestId, `booklist-grade-${index + 1}`, file);
            const { error: gradeFailure } = await client.rpc('ba_submit_grade_booklist' as never, { p_job_id: recorded.job_id, p_visit_id: visit.visit_id, p_grade_label: grade.gradeLabel, p_copies_requested: grade.requested, p_due_date: dueDate, p_storage_path: gradePath, p_client_request_id: gradeRequestId, p_mime_type: file.type || undefined, p_file_size_bytes: file.size, p_source_format: grade.sourceFormat, p_sort_order: index } as never);
            if (gradeFailure) throw new Error(gradeFailure.message);
          } catch (gradeFailure) {
            if (gradePath) await client.storage.from('booklist-documents').remove([gradePath]);
            throw gradeFailure;
          }
        }
        setSuccess(`${selected.school_name}: ${preparedGrades.length} separate grade print order${preparedGrades.length === 1 ? '' : 's'} sent to admin. Each document keeps its own copy quantity. Due ${readableDate(dueDate)}.`);
      } else setSuccess(`${selected.school_name}: denial recorded.`);
      clearForm(); await loadPipeline();
    } catch (submitFailure) {
      if (!visitCreated) await Promise.all(uploaded.map(({ bucket, path }) => client.storage.from(bucket).remove([path])));
      setError(submitFailure instanceof Error ? submitFailure.message : 'Could not save the school log.');
    } finally { setSubmitting(false); }
  }

  async function submitStamped(job: PipelineJob) {
    const file = stampedFiles[job.job_id];
    if (!file) { setError('Choose the stamped +1 copy first.'); return; }
    setStampedBusy(job.job_id); setError(null); setSuccess(null);
    const requestId = crypto.randomUUID(); let path: string | null = null;
    try {
      path = await upload(client, 'booklist-documents', organizationId, userId, requestId, 'stamped-copy', file);
      const { error: stampFailure } = await client.rpc('ba_submit_stamped_copy', { p_job_id: job.job_id, p_storage_path: path, p_client_request_id: requestId, p_mime_type: file.type || undefined, p_file_size_bytes: file.size });
      if (stampFailure) throw new Error(stampFailure.message);
      setStampedFiles((value) => ({ ...value, [job.job_id]: null })); setSuccess(`${job.school_name}: stamped +1 copy uploaded. Log complete.`); await loadPipeline();
    } catch (stampFailure) {
      if (path) await client.storage.from('booklist-documents').remove([path]);
      setError(stampFailure instanceof Error ? stampFailure.message : 'Could not upload the stamped copy.');
    } finally { setStampedBusy(null); }
  }

  const visibleJobs = useMemo(() => {
    const needle = pipelineQuery.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((job) => `${job.school_name} ${job.school_region || ''}`.toLowerCase().includes(needle));
  }, [jobs, pipelineQuery]);
  const target = stats?.target?.target_schools ?? stats?.default_target_schools_per_month ?? null;
  const reached = stats?.schools_visited_this_month ?? 0;

  return (
    <div className="space-y-5">
      {success ? <div role="status" className="rounded-xl border border-ok/25 bg-ok/10 px-4 py-3 text-sm font-medium text-ink">{success}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-bad/25 bg-bad/10 px-4 py-3 text-sm font-medium text-bad">{error}</div> : null}
      <form className="space-y-5" onSubmit={submit}>
        <Card className="p-4 sm:p-5">
          <h2 className="text-base font-semibold text-ink">1. Choose the school</h2><p className="mt-1 text-xs text-muted">Select a school from the master list. If it is missing, add it manually.</p>
          {selected ? <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Selected school</p><p className="mt-1 font-semibold text-ink">{selected.school_name}</p><p className="text-sm text-muted">{selected.school_region || 'Area not recorded'}</p>{selected.has_active_job ? <p className="mt-2 text-xs font-medium text-warn">Active log exists. This visit will be added to the same school journey.</p> : null}</div><Button type="button" variant="outline" onClick={() => setSelected(null)}>Change</Button></div></div> : (
            <div className="mt-4 space-y-3"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]"><div><Label htmlFor="school-search">School name</Label><Input id="school-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing the school name" autoComplete="off" className="min-h-12 text-base" /></div><div><Label htmlFor="school-region">Area</Label><Select id="school-region" value={region} onChange={(event) => setRegion(event.target.value)} className="min-h-12"><option value="">All areas</option>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></div></div><p className="text-sm text-muted" role="status">{searching ? 'Searching schools…' : searchError || (schools.length ? `${schools.length} school${schools.length === 1 ? '' : 's'} found.` : 'No school found. Add it manually below.')}</p>{searchError ? <Button type="button" variant="outline" onClick={() => setSearchRetry((value) => value + 1)}>Try again</Button> : null}
              {!searching && schools.length > 0 ? <ul className="max-h-72 overflow-y-auto rounded-xl border border-ink/10">{schools.map((school) => <li key={school.school_id} className="border-b border-ink/10 last:border-0"><button type="button" className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-primary/5" onClick={() => { setSelected(school); setAddingSchool(false); }}><span><span className="block text-sm font-semibold text-ink">{school.school_name}</span><span className="block text-xs text-muted">{school.school_region || 'Area not recorded'}</span>{school.has_active_job ? <span className="mt-1 block text-xs font-medium text-warn">Active log</span> : null}</span><span className="text-sm font-semibold text-primary">Select</span></button></li>)}</ul> : null}
              <Button type="button" variant="outline" onClick={() => { if (!addingSchool) setDraftSchool((value) => ({ ...value, name: query.trim(), region })); setAddingSchool((value) => !value); }}>{addingSchool ? 'Cancel' : 'School not listed? Add manually'}</Button>
              {addingSchool ? <div className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:grid-cols-2"><div><Label htmlFor="new-name">School name *</Label><Input id="new-name" value={draftSchool.name} onChange={(event) => setDraftSchool({ ...draftSchool, name: event.target.value })} /></div><div><Label htmlFor="new-region">Region / area</Label><Input id="new-region" value={draftSchool.region} onChange={(event) => setDraftSchool({ ...draftSchool, region: event.target.value })} /></div><div><Label htmlFor="new-address">Address</Label><Input id="new-address" value={draftSchool.address} onChange={(event) => setDraftSchool({ ...draftSchool, address: event.target.value })} /></div><div><Label htmlFor="new-contact">Known contact</Label><Input id="new-contact" value={draftSchool.contact} onChange={(event) => setDraftSchool({ ...draftSchool, contact: event.target.value })} /></div><div className="sm:col-span-2"><Button type="button" onClick={() => void createSchool()} disabled={creatingSchool || !draftSchool.name.trim()}>{creatingSchool ? 'Saving…' : 'Save and select school'}</Button></div></div> : null}
            </div>
          )}
        </Card>
        <Card className="p-4 sm:p-5"><h2 className="text-base font-semibold text-ink">2. Record the visit</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-ink/10 p-4"><p className="text-sm font-semibold text-ink">GPS location</p><p className="mt-1 text-xs text-muted">{fix ? `Captured${fix.accuracy ? ` · accuracy about ${Math.round(fix.accuracy)} m` : ''}` : 'Required before saving the log.'}</p>{locationError ? <p className="mt-2 text-xs font-medium text-bad">{locationError}</p> : null}<Button className="mt-3" type="button" variant="outline" onClick={() => void locate()} disabled={locating}>{locating ? 'Getting location…' : fix ? 'Refresh location' : 'Get my location'}</Button></div><div className="rounded-xl border border-ink/10 p-4"><Label htmlFor="gate-selfie">Gate selfie {stats?.selfie_required ? '*' : '(recommended)'}</Label><Input id="gate-selfie" type="file" accept="image/*" capture="user" onChange={(event) => setSelfie(event.target.files?.[0] || null)} /><p className="mt-1 text-xs text-muted">Maximum 12 MB.</p></div></div></Card>
        <Card className="p-4 sm:p-5">
          <h2 className="text-base font-semibold text-ink">3. Booklist outcome</h2><p className="mt-1 text-xs text-muted">Record whether the school supplied the booklist, asked you to return later, or denied the request.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => setOutcome('booklist_offered')} className={`rounded-xl border p-4 text-left ${outcome === 'booklist_offered' ? 'border-primary bg-primary/5' : 'border-ink/10'}`}><span className="block text-sm font-semibold text-ink">Booklist supplied</span><span className="mt-1 block text-xs text-muted">Paper, photo, scan or softcopy received.</span></button><button type="button" onClick={() => setOutcome('follow_up')} className={`rounded-xl border p-4 text-left ${outcome === 'follow_up' ? 'border-warn/40 bg-warn/5' : 'border-ink/10'}`}><span className="block text-sm font-semibold text-ink">Follow-up required</span><span className="mt-1 block text-xs text-muted">School asked the BA to return on a specific date.</span></button><button type="button" onClick={() => setOutcome('declined')} className={`rounded-xl border p-4 text-left ${outcome === 'declined' ? 'border-bad/40 bg-bad/5' : 'border-ink/10'}`}><span className="block text-sm font-semibold text-ink">Booklist denied</span><span className="mt-1 block text-xs text-muted">School would not provide the booklist.</span></button></div>
          {outcome === 'follow_up' ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label htmlFor="follow-up-date">Return date *</Label><Input id="follow-up-date" type="date" min={today} value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} /><p className="mt-1 text-xs text-muted">The school stays open and will appear as a scheduled follow-up.</p></div><div><Label htmlFor="follow-up-notes">Follow-up note</Label><textarea id="follow-up-notes" className={TEXTAREA} rows={3} value={followUpNotes} onChange={(event) => setFollowUpNotes(event.target.value)} placeholder="e.g. Headteacher asked me to return when the booklists are ready." /></div></div> : null}
          {outcome === 'declined' ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label htmlFor="decline-reason">Reason</Label><Select id="decline-reason" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)}><option value="">Choose reason</option>{DECLINE_REASONS.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</Select></div><div><Label htmlFor="decline-notes">Notes</Label><textarea id="decline-notes" className={TEXTAREA} rows={3} value={declineNotes} onChange={(event) => setDeclineNotes(event.target.value)} placeholder="Optional details" /></div></div> : null}
          {outcome === 'booklist_offered' ? <div className="mt-5 space-y-5"><section><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">Print request</h3><p className="mt-1 text-xs text-muted">Add each grade or class separately. FAZOO adds one extra copy for stamping to every grade.</p></div><Button type="button" variant="outline" onClick={() => setGradeBooklists((rows) => [...rows, blankGradeBooklist(crypto.randomUUID())])}>Add another grade</Button></div><div className="mt-4 space-y-4">{gradeBooklists.map((grade, index) => { const requested = Number(grade.copies); return <div key={grade.key} className="rounded-xl border border-ink/10 bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-ink">{grade.gradeLabel.trim() || `Grade request ${index + 1}`}</p>{gradeBooklists.length > 1 ? <Button type="button" variant="outline" onClick={() => setGradeBooklists((rows) => rows.filter((row) => row.key !== grade.key))}>Remove</Button> : null}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`grade-name-${grade.key}`}>Grade / class *</Label><Input id={`grade-name-${grade.key}`} value={grade.gradeLabel} onChange={(event) => setGradeBooklists((rows) => rows.map((row) => row.key === grade.key ? { ...row, gradeLabel: event.target.value } : row))} placeholder="e.g. Grade 1" /></div><div><Label htmlFor={`copies-${grade.key}`}>Copies requested *</Label><Input id={`copies-${grade.key}`} type="number" min={1} step={1} inputMode="numeric" value={grade.copies} onChange={(event) => setGradeBooklists((rows) => rows.map((row) => row.key === grade.key ? { ...row, copies: event.target.value } : row))} />{Number.isInteger(requested) && requested > 0 ? <p className="mt-1 text-xs font-medium text-primary">{requested.toLocaleString()} + 1 = {(requested + 1).toLocaleString()} copies to print for this grade.</p> : null}</div><div><Label htmlFor={`source-format-${grade.key}`}>Source format *</Label><Select id={`source-format-${grade.key}`} value={grade.sourceFormat} onChange={(event) => setGradeBooklists((rows) => rows.map((row) => row.key === grade.key ? { ...row, sourceFormat: event.target.value } : row))}><option value="">Choose format</option>{SOURCE_FORMATS.map((format) => <option key={format.code} value={format.code}>{format.label}</option>)}</Select></div><div><Label htmlFor={`booklist-file-${grade.key}`}>Booklist file / photo *</Label><Input id={`booklist-file-${grade.key}`} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf" onChange={(event) => setGradeBooklists((rows) => rows.map((row) => row.key === grade.key ? { ...row, file: event.target.files?.[0] || null } : row))} /><p className="mt-1 text-xs text-muted">Maximum 12 MB.</p></div></div></div>; })}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label htmlFor="due-date">Due date *</Label><Input id="due-date" type="date" min={today} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></div></section></div> : null}
        </Card>
        <div className="space-y-2">
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={submitting}>
            {submitting ? 'Saving log…' : outcome === 'declined' ? 'Record denial' : outcome === 'follow_up' ? 'Schedule follow-up' : 'Save booklist log'}
          </Button>
          {!submitting && (!selected || !fix || !outcome) ? (
            <p className="text-xs text-muted" role="status">
              Before saving: {[
                !selected ? 'select a school' : null,
                !fix ? 'capture GPS location' : null,
                !outcome ? 'choose the booklist outcome' : null,
              ].filter(Boolean).join(' · ')}. You can still tap Save to see the exact requirement.
            </p>
          ) : null}
        </div>
      </form>
      <Card className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-ink">Booklist pipeline</h2><p className="mt-1 text-xs text-muted">Track every school from approach to stamped-copy completion.</p></div><AgencyBadge agency={stats?.agency} selfieRequired={stats?.selfie_required} /></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg border border-ink/10 p-3 text-center"><p className="text-lg font-bold">{counts?.active || 0}</p><p className="text-xs text-muted">In progress</p></div><div className="rounded-lg border border-ink/10 p-3 text-center"><p className="text-lg font-bold">{counts?.awaiting_admin || 0}</p><p className="text-xs text-muted">With admin</p></div><div className="rounded-lg border border-ink/10 p-3 text-center"><p className="text-lg font-bold">{counts?.completed || 0}</p><p className="text-xs text-muted">Completed</p></div><div className="rounded-lg border border-ink/10 p-3 text-center"><p className="text-lg font-bold">{counts?.declined || 0}</p><p className="text-xs text-muted">Denied</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg border border-ink/10 p-3"><p className="text-xs text-muted">Schools reached this month</p><p className="mt-1 text-lg font-bold">{reached}{target ? <span className="text-sm font-medium text-muted"> / {target}</span> : null}</p></div><div className="rounded-lg border border-ink/10 p-3"><p className="text-xs text-muted">Booklists collected</p><p className="mt-1 text-lg font-bold">{stats?.booklists_collected || 0}</p></div><div className="rounded-lg border border-ink/10 p-3"><p className="text-xs text-muted">Denials recorded</p><p className="mt-1 text-lg font-bold">{stats?.declines_recorded || 0}</p></div></div></Card>
      <Card className="p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-base font-semibold text-ink">Status by school</h2><p className="mt-1 text-xs text-muted">Every operational step is visible here.</p></div><div className="sm:w-72"><Label htmlFor="pipeline-search">Find a school</Label><Input id="pipeline-search" value={pipelineQuery} onChange={(event) => setPipelineQuery(event.target.value)} placeholder="School name or area" /></div></div>{visibleJobs.length === 0 ? <p className="mt-4 text-sm text-muted">{loading ? 'Loading schools…' : 'No school logs match this search.'}</p> : <ul className="mt-4 space-y-3">{visibleJobs.map((job) => <li key={job.job_id} className="rounded-xl border border-ink/10 bg-white/80 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-ink">{job.school_name}</p><p className="text-xs text-muted">{job.school_region || 'Area not recorded'}</p></div><StageBadge stage={job.stage} /></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">{job.stage === 'on_hold' && job.follow_up_date ? <span>Follow-up: <strong className="text-ink">{readableDate(job.follow_up_date)}</strong></span> : <span>Due: <strong className="text-ink">{readableDate(job.due_date)}</strong></span>}</div><Progress job={job} /><p className="mt-3 rounded-lg bg-lavender px-3 py-2 text-xs font-medium text-ink">Next: {nextAction(job)}</p>{job.stage === 'received' && !job.stamped_uploaded ? <div className="mt-4 rounded-xl border border-ok/25 bg-ok/5 p-3"><p className="text-sm font-semibold text-ink">Final proof: stamped +1 copy</p><p className="mt-1 text-xs text-muted">Upload the extra copy after the school stamps it. This closes the log.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1"><Label htmlFor={`stamped-${job.job_id}`}>Stamped copy</Label><Input id={`stamped-${job.job_id}`} type="file" accept="image/*,.pdf" onChange={(event) => setStampedFiles((value) => ({ ...value, [job.job_id]: event.target.files?.[0] || null }))} /></div><Button type="button" onClick={() => void submitStamped(job)} disabled={stampedBusy === job.job_id || !stampedFiles[job.job_id]}>{stampedBusy === job.job_id ? 'Uploading…' : 'Upload and complete'}</Button></div></div> : null}{job.stage === 'completed' || job.stamped_uploaded ? <p className="mt-3 text-xs font-semibold text-ok">✓ Stamped +1 proof is on file. Log complete.</p> : null}</li>)}</ul>}<div className="mt-4"><Button type="button" variant="outline" onClick={() => void loadPipeline()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh status'}</Button></div></Card>
    </div>
  );
}
