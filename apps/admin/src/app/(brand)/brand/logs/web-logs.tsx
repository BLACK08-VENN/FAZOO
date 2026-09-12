'use client';

import { useEffect, useMemo, useState } from 'react';
import { browserSupabase } from '@fazoo/database/browser';
import type {
  BaPipelineCounts,
  BaPipelineJob,
  BaSchoolMatch,
  BaSchoolPipelineResult,
  BaTodayResult,
  BaVisitStatsResult,
  BooklistStage,
} from '@fazoo/types';
import { AgencyBadge, StageBadge } from '@/components/stage-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';

type OrganizationKind = 'retail' | 'schools';

type Props = {
  organizationId: string;
  userId: string;
  organizationKind: OrganizationKind;
};

type LocationFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

const FIELD =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary';

export function BaWebLogs({ organizationId, userId, organizationKind }: Props) {
  return organizationKind === 'schools' ? (
    <SchoolsPipelinePanel />
  ) : (
    <RetailLogForm organizationId={organizationId} userId={userId} />
  );
}

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

async function uploadEvidence(
  client: ReturnType<typeof browserSupabase>,
  organizationId: string,
  userId: string,
  requestId: string,
  slot: string,
  file: File,
) {
  if (file.size > 12 * 1024 * 1024) throw new Error(`${slot} image is too large. Please use an image under 12 MB.`);
  const safeType = file.type || 'image/jpeg';
  const extension = safeType.includes('png') ? 'png' : safeType.includes('webp') ? 'webp' : 'jpg';
  const path = `${organizationId}/${userId}/${requestId}-${slot}.${extension}`;
  const { error } = await client.storage.from('daily-log-photos').upload(path, file, {
    contentType: safeType,
    upsert: false,
  });
  if (error) throw new Error(`Could not upload ${slot.replace('-', ' ')}: ${error.message}`);
  return path;
}

function LocationCard({
  fix,
  locating,
  locationError,
  onLocate,
}: {
  fix: LocationFix | null;
  locating: boolean;
  locationError: string | null;
  onLocate: () => void;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Location</h2>
          <p className="mt-1 text-xs text-muted">
            GPS is required. The server verifies the allowed geofence before accepting your log.
          </p>
          {fix ? (
            <p className="mt-2 text-xs font-medium text-ink">
              Location captured{fix.accuracy ? ` · accuracy about ${Math.round(fix.accuracy)} m` : ''}
            </p>
          ) : null}
          {locationError ? <p className="mt-2 text-xs font-medium text-bad">{locationError}</p> : null}
        </div>
        <Button type="button" variant="outline" onClick={onLocate} disabled={locating}>
          {locating ? 'Getting location…' : fix ? 'Refresh location' : 'Get my location'}
        </Button>
      </div>
    </Card>
  );
}

/**
 * What the BA owes the pipeline at each stage, in their words. The admin owns
 * the conversion and printing steps, so those say so plainly rather than
 * leaving the BA wondering whether the app has stalled on them.
 */
const NEXT_ACTION: Record<BooklistStage, string> = {
  engaged: 'Record the outcome — booklist offered, or declined with a reason.',
  declined: 'Nothing further. The decline is on record.',
  booklist_offered: 'Upload the booklist the school handed you.',
  document_received: 'With the admin for conversion.',
  awaiting_conversion: 'With the admin for conversion.',
  converting: 'With the admin for conversion.',
  formatted: 'Download it, print it, and take it back to the school.',
  pending_school_approval: 'Waiting on the school to acknowledge the formatted copy.',
  school_approved: 'Confirm how many copies the school wants.',
  in_production: 'At the printer. The admin is tracking it.',
  dispatched: 'On its way to the school.',
  received: 'Copies received — upload the stamped +1 copy to close the log.',
  completed: 'Closed. The stamped +1 copy is on file.',
  on_hold: 'Paused — check with your supervisor.',
  cancelled: 'Cancelled — no further action.',
};

/**
 * Schools-org BA view on the web.
 *
 * Full booklist pipeline flow:
 * 1. Search and select a school (or create manually)
 * 2. Approach the school and take gate selfie
 * 3. Record outcome: booklist offered or declined
 * 4. If offered, upload the booklist (any format → will be converted to Word)
 * 5. Download formatted Word doc from admin
 * 6. Print and get school approval
 * 7. Confirm number of copies needed + due date
 * 8. Receive printed copies from admin
 * 9. Upload stamped +1 copy to complete
 *
 * The mobile app captures steps 1-4, this web dashboard shows the pipeline
 * status and allows uploading the stamped copy to complete the job.
 */
function SchoolsPipelinePanel() {
  const client = useMemo(() => browserSupabase(), []);
  const [stats, setStats] = useState<BaVisitStatsResult | null>(null);
  const [counts, setCounts] = useState<BaPipelineCounts | null>(null);
  const [jobs, setJobs] = useState<BaPipelineJob[]>([]);
  const [downloads, setDownloads] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [schoolList, setSchoolList] = useState<BaSchoolMatch[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<BaSchoolMatch | null>(null);
  const [schoolQuery, setSchoolQuery] = useState('');
  const [region, setRegion] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retrySearch, setRetrySearch] = useState(0);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [schoolCreating, setSchoolCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSchoolData, setNewSchoolData] = useState({
    name: '',
    region: '',
    address: '',
    contactName: '',
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [statsResult, pipelineResult] = await Promise.all([
        client.rpc('ba_visit_stats'),
        client.rpc('ba_school_pipeline', { p_limit: 200 }),
      ]);
      if (statsResult.error) throw new Error(statsResult.error.message);
      if (pipelineResult.error) throw new Error(pipelineResult.error.message);

      setStats(statsResult.data as unknown as BaVisitStatsResult);
      const pipeline = pipelineResult.data as unknown as BaSchoolPipelineResult;
      setCounts(pipeline.counts);
      setJobs(pipeline.jobs);

      // `ba_school_pipeline` reports that a formatted document exists but not
      // its id, and the download route needs the id. One extra RLS-scoped read
      // over the jobs that actually have one, rather than a detail call each.
      const ready = pipeline.jobs.filter((job) => job.formatted_ready).map((job) => job.job_id);
      if (ready.length > 0) {
        const { data: docs, error: docsError } = await client
          .from('booklist_documents')
          .select('id, job_id')
          .eq('kind', 'formatted')
          .eq('is_current', true)
          .in('job_id', ready);
        if (docsError) throw new Error(docsError.message);
        const map: Record<string, string> = {};
        for (const doc of docs ?? []) map[String(doc.job_id)] = String(doc.id);
        setDownloads(map);
      } else {
        setDownloads({});
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your schools.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSchool() {
    if (!newSchoolData.name.trim()) {
      setSchoolError('School name is required.');
      return;
    }

    setSchoolCreating(true);
    setSchoolError(null);

    try {
      const { data, error: createError } = await client.rpc('ba_create_school', {
        p_name: newSchoolData.name.trim(),
        p_region: newSchoolData.region.trim() || undefined,
        p_address: newSchoolData.address.trim() || undefined,
        p_contact_person_name: newSchoolData.contactName.trim() || undefined,
        p_client_request_id: crypto.randomUUID(),
      });

      if (createError) throw new Error(createError.message);

      const result = data as unknown as { status: string; school_id?: string; created?: boolean };
      if (result.status !== 'ok') throw new Error('Failed to create school');

      // Reset form and reload
      setNewSchoolData({ name: '', region: '', address: '', contactName: '' });
      setShowCreateForm(false);
      if (result.school_id) {
        const { data: matchData } = await client.rpc('ba_search_schools', {
          p_query: newSchoolData.name.trim(), p_limit: 100,
        });
        const matches = matchData as unknown as { schools?: BaSchoolMatch[] } | null;
        setSelectedSchool(matches?.schools?.find((school) => school.school_id === result.school_id) ?? null);
        setSchoolQuery(newSchoolData.name.trim());
        setRegion('');
        setRetrySearch((value) => value + 1);
      }
      await load();
    } catch (err) {
      setSchoolError(err instanceof Error ? err.message : 'Could not create school.');
    } finally {
      setSchoolCreating(false);
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((job) =>
      `${job.school_name} ${job.school_region ?? ''}`.toLowerCase().includes(needle)
    );
  }, [jobs, query]);

  const target = stats?.target?.target_schools ?? stats?.default_target_schools_per_month ?? null;
  const reached = stats?.schools_visited_this_month ?? 0;
  const selfies = stats?.selfie_compliance ?? null;

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-xl border border-bad/25 bg-bad/10 px-4 py-3 text-sm font-medium text-bad">
          {error}
        </div>
      ) : null}

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Create a new booklist log</h2>
        <p className="mt-1 text-xs text-muted">
          Use the Fazoo mobile app to start. Select a school from our master list or add one manually if it's not there.
        </p>

        <div className="mt-4 space-y-3">
          {selectedSchool ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4" role="status">
              <p className="text-xs font-semibold text-primary">✓ Selected school</p>
              <p className="mt-1 break-words font-semibold text-ink">{selectedSchool.school_name}</p>
              <p className="mt-1 text-sm text-muted">{selectedSchool.school_region ?? 'Area not recorded'}</p>
              <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => {
                setSelectedSchool(null);
                window.setTimeout(() => document.getElementById('school-search')?.focus(), 0);
              }}>Change school</Button>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="school-search">Find your school</Label>
                <Input id="school-search" value={schoolQuery}
                  onChange={(event) => { setSchoolQuery(event.target.value); setSearching(true); }}
                  autoComplete="off" className="min-h-12 text-base"
                  placeholder="Start typing the school name"
                  aria-describedby="school-search-status" />
              </div>
              <div>
                <Label htmlFor="school-region">Area (optional)</Label>
                <Select id="school-region" value={region} className="min-h-11 text-base"
                  onChange={(event) => { setRegion(event.target.value); setSearching(true); }}>
                  <option value="">All areas</option>
                  {regions.map((area) => <option key={area} value={area}>{area}</option>)}
                </Select>
              </div>
              <p id="school-search-status" role="status" className="text-sm text-muted">
                {searching ? 'Searching schools…' : searchError ? searchError :
                  schoolList.length === 0 ? 'No schools found. Try another name or area, or add the school below.' :
                  schoolList.length === 50 ? 'Showing 50 schools. Type more of the name to narrow the list.' :
                  `${schoolList.length} schools found. Tap one to select it.`}
              </p>
              {searchError ? <Button type="button" variant="outline"
                onClick={() => setRetrySearch((value) => value + 1)}>Try again</Button> : null}
              {!searching && !searchError && schoolList.length > 0 ? (
                <ul aria-label="Matching schools" className="max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-ink/10">
                  {schoolList.map((school) => (
                    <li key={school.school_id} className="border-b border-ink/10 last:border-0">
                      <button type="button"
                        className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
                        onClick={() => { setSelectedSchool(school); setShowCreateForm(false); setSchoolError(null); }}>
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-semibold text-ink">{school.school_name}</span>
                          <span className="mt-1 block text-xs text-muted">{school.school_region ?? 'Area not recorded'}</span>
                          {school.has_active_job ? <span className="mt-1 block text-xs font-medium text-warn">Active log</span> : null}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-primary">Select</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          {schoolError ? (
            <div className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-xs font-medium text-bad">
              {schoolError}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => {
                if (!showCreateForm) setNewSchoolData((current) => ({ ...current, name: schoolQuery.trim(), region }));
                setShowCreateForm(!showCreateForm);
              }}
              className="flex-1"
            >
              {showCreateForm ? 'Cancel' : 'School not listed? Add it'}
            </Button>
          </div>

          {showCreateForm && (
            <Card className="border-primary/30 bg-primary/5 p-3">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="new-school-name">School name *</Label>
                  <Input
                    id="new-school-name"
                    value={newSchoolData.name}
                    onChange={(e) => setNewSchoolData({ ...newSchoolData, name: e.target.value })}
                    placeholder="Full name of the school"
                  />
                </div>
                <div>
                  <Label htmlFor="new-school-region">Region / area</Label>
                  <Input
                    id="new-school-region"
                    value={newSchoolData.region}
                    onChange={(e) => setNewSchoolData({ ...newSchoolData, region: e.target.value })}
                    placeholder="Town or area"
                  />
                </div>
                <div>
                  <Label htmlFor="new-school-address">Address</Label>
                  <Input
                    id="new-school-address"
                    value={newSchoolData.address}
                    onChange={(e) => setNewSchoolData({ ...newSchoolData, address: e.target.value })}
                    placeholder="Street address"
                  />
                </div>
                <div>
                  <Label htmlFor="new-school-contact">Contact person name</Label>
                  <Input
                    id="new-school-contact"
                    value={newSchoolData.contactName}
                    onChange={(e) => setNewSchoolData({ ...newSchoolData, contactName: e.target.value })}
                    placeholder="Principal or admin name"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void handleCreateSchool()}
                  disabled={schoolCreating || !newSchoolData.name.trim()}
                  className="w-full"
                >
                  {schoolCreating ? 'Creating…' : 'Save school'}
                </Button>
              </div>
            </Card>
          )}


        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Your booklist journey</h2>
        <p className="mt-1 text-xs text-muted">
          Once you log a school in the mobile app, track its progress here through every step — from your approach to the stamped copy.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded-lg border border-ink/10 p-3 text-center">
            <div className="text-lg font-bold text-ink">{counts?.active ?? 0}</div>
            <div className="text-xs text-muted">In progress</div>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-center">
            <div className="text-lg font-bold text-ink">{counts?.awaiting_admin ?? 0}</div>
            <div className="text-xs text-muted">With admin</div>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-center">
            <div className="text-lg font-bold text-ink">{counts?.completed ?? 0}</div>
            <div className="text-xs text-muted">Completed</div>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-center">
            <div className="text-lg font-bold text-ink">{counts?.declined ?? 0}</div>
            <div className="text-xs text-muted">Declined</div>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">This month</h2>
          <AgencyBadge agency={stats?.agency} selfieRequired={stats?.selfie_required} />
        </div>
        <p className="mt-1 text-xs text-muted">
          {stats
            ? stats.selfie_required
              ? 'A gate selfie is mandatory at every school you engage.'
              : 'A gate selfie is not enforced for your agency.'
            : 'Loading your agency…'}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-ink/10 p-3">
            <dt className="text-xs text-muted">Schools reached</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-ink">
              {reached}
              {target ? <span className="text-sm font-medium text-muted"> / {target}</span> : null}
            </dd>
            <dd className="text-xs text-muted">
              {target
                ? reached >= target
                  ? 'Target met ✓'
                  : `${Math.round((reached / target) * 100)}% of target`
                : 'No target set'}
            </dd>
          </div>
          <div className="rounded-lg border border-ink/10 p-3">
            <dt className="text-xs text-muted">Booklists collected</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-ink">
              {stats?.booklists_collected ?? 0}
            </dd>
            <dd className="text-xs text-muted">All time</dd>
          </div>
          <div className="rounded-lg border border-ink/10 p-3">
            <dt className="text-xs text-muted">Declines recorded</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-ink">
              {stats?.declines_recorded ?? 0}
            </dd>
            <dd className="text-xs text-muted">All time</dd>
          </div>
          <div className="rounded-lg border border-ink/10 p-3">
            <dt className="text-xs text-muted">Gate selfies</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-ink">
              {selfies ? `${selfies.captured} / ${selfies.required}` : '—'}
            </dd>
            <dd className="text-xs text-muted">
              {selfies && selfies.missing > 0 ? `${selfies.missing} missing` : 'Complete ✓'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Your schools</h2>
            <p className="mt-1 text-xs text-muted">
              Each entry tracks one school from gate selfie to the stamped final copy.
            </p>
          </div>
          <div className="sm:w-64">
            <Label htmlFor="pipeline-search">Filter by school</Label>
            <Input
              id="pipeline-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="School name or region"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            {loading ? 'Loading your schools…' : 'Nothing matches that search. Start logging schools from the mobile app.'}
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {visible.map((job) => {
              const documentId = downloads[job.job_id];
              return (
                <li
                  key={job.job_id}
                  className="rounded-xl border border-ink/10 bg-white/80 p-3 sm:p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{job.school_name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {job.school_region ?? 'Region not recorded'}
                        {job.copies_to_print
                          ? ` · ${job.copies_to_print.toLocaleString()} copies to print (incl. the stamped +1)`
                          : job.copies_requested
                            ? ` · ${job.copies_requested.toLocaleString()} copies requested`
                            : ''}
                      </p>
                    </div>
                    <StageBadge stage={job.stage} />
                  </div>

                  <p className="mt-2 text-xs font-medium text-ink">
                    Next: {NEXT_ACTION[job.stage]}
                  </p>

                  {job.stamped_uploaded ? (
                    <p className="mt-1 text-xs text-ok font-medium">✓ Stamped +1 copy uploaded — log complete.</p>
                  ) : null}

                  {documentId ? (
                    <a
                      href={`/api/booklists/documents/${documentId}/download`}
                      className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
                    >
                      Download formatted booklist for printing
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4">
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function RetailLogForm({ organizationId, userId }: Pick<Props, 'organizationId' | 'userId'>) {
  const client = useMemo(() => browserSupabase(), []);
  const [today, setToday] = useState<BaTodayResult | null>(null);
  const [assignmentId, setAssignmentId] = useState('');
  const [stock, setStock] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { fix, locating, locationError, locate } = useLocation();

  async function load() {
    setLoading(true);
    const { data, error: todayError } = await client.rpc('ba_today');
    if (todayError) setError(todayError.message);
    else {
      const result = data as unknown as BaTodayResult;
      setToday(result);
      const onlyAssignment = result.assignments.length === 1 ? result.assignments[0] : undefined;
      if (!assignmentId && onlyAssignment) setAssignmentId(onlyAssignment.assignment.id);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = today?.assignments.find((row) => row.assignment.id === assignmentId) ?? null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return setError('Choose an assignment first.');
    if (selected.log) return setError('A log already exists for this assignment today.');
    if (!fix) return setError('Capture your GPS location first.');
    if (!stock || !selfie) return setError('A stock photo and selfie are required.');

    setBusy(true);
    setError(null);
    setSuccess(null);
    const requestId = crypto.randomUUID();
    const uploaded: string[] = [];
    try {
      const stockPath = await uploadEvidence(client, organizationId, userId, requestId, 'stock', stock);
      uploaded.push(stockPath);
      const selfiePath = await uploadEvidence(client, organizationId, userId, requestId, 'selfie', selfie);
      uploaded.push(selfiePath);

      const { error: checkinError } = await client.rpc('ba_checkin', {
        p_assignment_id: selected.assignment.id,
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy ?? undefined,
        p_notes: notes.trim() || undefined,
        p_stock_photo_path: stockPath,
        p_uniform_selfie_path: selfiePath,
        p_client_request_id: requestId,
      });
      if (checkinError) throw new Error(checkinError.message);

      setSuccess(`Check-in created for ${selected.assignment.store_name ?? 'your assignment'}.`);
      setStock(null);
      setSelfie(null);
      setNotes('');
      await load();
    } catch (submitError) {
      if (uploaded.length) await client.storage.from('daily-log-photos').remove(uploaded);
      setError(submitError instanceof Error ? submitError.message : 'Could not create the log.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      {success ? <div className="rounded-xl border border-ok/25 bg-ok/10 px-4 py-3 text-sm font-medium text-ink">{success}</div> : null}
      {error ? <div className="rounded-xl border border-bad/25 bg-bad/10 px-4 py-3 text-sm font-medium text-bad">{error}</div> : null}

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">1. Choose today&apos;s assignment</h2>
        <div className="mt-4">
          <Label htmlFor="retail-assignment">Store / campaign</Label>
          <Select id="retail-assignment" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} disabled={loading}>
            <option value="">{loading ? 'Loading assignments…' : 'Select assignment'}</option>
            {(today?.assignments ?? []).map((row) => (
              <option key={row.assignment.id} value={row.assignment.id} disabled={Boolean(row.log)}>
                {row.assignment.store_name ?? 'Store'}{row.assignment.campaign_name ? ` — ${row.assignment.campaign_name}` : ''}{row.log ? ' · already logged' : ''}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <LocationCard fix={fix} locating={locating} locationError={locationError} onLocate={() => void locate()} />

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">3. Evidence & notes</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="stock-photo">Stock / product photo</Label>
            <Input id="stock-photo" type="file" accept="image/*" capture="environment" onChange={(e) => setStock(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label htmlFor="retail-selfie">Selfie</Label>
            <Input id="retail-selfie" type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="retail-notes">Notes</Label>
            <textarea id="retail-notes" className={FIELD} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for your supervisor" />
          </div>
        </div>
      </Card>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy || !selected || !fix || !stock || !selfie || Boolean(selected?.log)}>
        {busy ? 'Submitting log…' : 'Check in'}
      </Button>
    </form>
  );
}
