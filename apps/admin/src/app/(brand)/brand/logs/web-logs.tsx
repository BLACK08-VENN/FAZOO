'use client';

import { useEffect, useMemo, useState } from 'react';
import { browserSupabase } from '@fazoo/database/browser';
import type { BaTodayResult, VedaTodayResult } from '@fazoo/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';

type OrganizationKind = 'retail' | 'schools';

type Props = {
  organizationId: string;
  userId: string;
  organizationKind: OrganizationKind;
};

type VedaSchool = {
  school_id: string;
  school_name: string;
  school_region: string | null;
  status: string;
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
    <VedaLogForm organizationId={organizationId} userId={userId} />
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

function VedaLogForm({ organizationId, userId }: Pick<Props, 'organizationId' | 'userId'>) {
  const client = useMemo(() => browserSupabase(), []);
  const [schools, setSchools] = useState<VedaSchool[]>([]);
  const [today, setToday] = useState<VedaTodayResult | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [learnerCount, setLearnerCount] = useState('');
  const [notes, setNotes] = useState('');
  const { fix, locating, locationError, locate } = useLocation();
  const [gradeId, setGradeId] = useState('');
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [savingDist, setSavingDist] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const [{ data: schoolData, error: schoolError }, { data: todayData, error: todayError }] = await Promise.all([
      client.rpc('ba_list_veda_schools'),
      client.rpc('veda_today'),
    ]);
    if (schoolError) setError(`Could not load schools: ${schoolError.message}`);
    else setSchools(Array.isArray(schoolData) ? (schoolData as unknown as VedaSchool[]) : []);
    if (!todayError && todayData) setToday(todayData as unknown as VedaTodayResult);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleSchools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? schools.filter((school) =>
          `${school.school_name} ${school.school_region ?? ''}`.toLowerCase().includes(needle),
        )
      : schools;
    return rows.slice(0, 150);
  }, [query, schools]);

  const selectedSchool = schools.find((school) => school.school_id === selectedSchoolId) ?? null;
  const selectedSchoolRow =
    today?.regions.flatMap((r) => r.schools).find((row) => row.school_id === selectedSchoolId) ?? null;
  const existingSession = selectedSchoolRow?.session ?? null;
  const existingDistributions = selectedSchoolRow?.distributions ?? [];
  const canUseSchool = Boolean(selectedSchool);

  const grades = today?.grades ?? [];
  const stationeryItems = today?.stationery_items ?? [];
  const openSession = existingSession && existingSession.status === 'open' ? existingSession : null;
  const sessionDone = existingSession && existingSession.status === 'completed' ? true : false;

  const GENERAL = '__general__';
  const draftKey = (gid: string, itemId: string) => `${gid || GENERAL}|${itemId}`;
  const originalQty = (gid: string, itemId: string) =>
    existingDistributions
      .filter((d) => (d.grade_id ?? GENERAL) === (gid || GENERAL) && d.stationery_item_id === itemId)
      .reduce((sum, d) => sum + d.quantity, 0);

  async function saveDistributions() {
    if (!openSession) return;
    setSavingDist(true);
    setError(null);
    setSuccess(null);
    let changed = 0;
    try {
      for (const gid of [GENERAL, ...grades.map((g) => g.id)]) {
        const gradeIdParam = gid === GENERAL ? null : gid;
        for (const item of stationeryItems) {
          const next = draft[draftKey(gid, item.id)] ?? 0;
          const original = originalQty(gid, item.id);
          if (next === original) continue;
          const requestId = crypto.randomUUID();
          if (next > 0) {
            const { error: recErr } = await client.rpc('veda_record_distribution', {
              p_session_id: openSession.id,
              p_stationery_item_id: item.id,
              p_grade_id: gradeIdParam,
              p_quantity: next,
              p_client_request_id: requestId,
            });
            if (recErr) throw new Error(recErr.message);
          } else {
            const { error: remErr } = await client.rpc('veda_remove_distribution', {
              p_session_id: openSession.id,
              p_stationery_item_id: item.id,
              p_grade_id: gradeIdParam,
              p_client_request_id: requestId,
            });
            if (remErr) throw new Error(remErr.message);
          }
          changed += 1;
        }
      }
      if (changed === 0) setSuccess('Nothing to update.');
      else setSuccess(`${changed} distribution line${changed > 1 ? 's' : ''} saved.`);
      await load();
    } catch (saveErr) {
      setError(saveErr instanceof Error ? saveErr.message : 'Could not save distributions.');
    } finally {
      setSavingDist(false);
    }
  }

  async function checkout() {
    if (!openSession) return;
    if (!fix) return setError('Capture your location before checking out.');
    setCheckingOut(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: coErr } = await client.rpc('veda_checkout', {
        p_session_id: openSession.id,
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy ?? undefined,
        p_client_request_id: crypto.randomUUID(),
        p_notes: notes.trim() || undefined,
      });
      if (coErr) throw new Error(coErr.message);
      setSuccess('Visit checked out successfully.');
      await load();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Could not check out.');
    } finally {
      setCheckingOut(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool || !canUseSchool) return setError('Choose an unlocked school first.');
    if (!fix) return setError('Capture your GPS location first.');
    if (!selfie || !document) return setError('A selfie and stamped school document are required.');
    if (existingSession && existingSession.status !== 'cancelled') return setError('You already have a log for this school today.');

    setBusy(true);
    setError(null);
    setSuccess(null);
    const requestId = crypto.randomUUID();
    const uploaded: string[] = [];
    try {
      const selfiePath = await uploadEvidence(client, organizationId, userId, requestId, 'selfie', selfie);
      uploaded.push(selfiePath);
      const documentPath = await uploadEvidence(client, organizationId, userId, requestId, 'stamped-doc', document);
      uploaded.push(documentPath);

      const count = learnerCount.trim() === '' ? 0 : Number(learnerCount);
      if (!Number.isInteger(count) || count < 0) throw new Error('Learner count must be zero or a positive whole number.');

      const { error: checkinError } = await client.rpc('veda_checkin', {
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy ?? undefined,
        p_selfie_photo_path: selfiePath,
        p_stamped_document_path: documentPath,
        p_client_request_id: requestId,
        p_school_id: selectedSchool.school_id,
        p_learner_count: count,
        p_notes: notes.trim() || undefined,
      } as never);
      if (checkinError) throw new Error(checkinError.message);

      setSuccess(`Log started successfully for ${selectedSchool.school_name}.`);
      setSelfie(null);
      setDocument(null);
      setLearnerCount('');
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
        <h2 className="text-sm font-semibold text-ink">1. Choose school</h2>
        <p className="mt-1 text-xs text-muted">Search all active VEDA schools available to your account.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="school-search">Search school</Label>
            <Input id="school-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type school name or region" />
          </div>
          <div>
            <Label htmlFor="school-select">School</Label>
            <Select id="school-select" value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)} disabled={loading}>
              <option value="">{loading ? 'Loading schools…' : 'Select a school'}</option>
              {visibleSchools.map((school) => (
                <option key={school.school_id} value={school.school_id}>
                  {school.school_name}{school.school_region ? ` — ${school.school_region}` : ''}
                </option>
              ))}
            </Select>
            {schools.length > 150 && !query.trim() ? (
              <p className="mt-1 text-xs text-muted">Start typing to search the full list of {schools.length.toLocaleString()} schools.</p>
            ) : null}
          </div>
        </div>

        {selectedSchool ? (
          <p className="mt-3 text-xs font-medium text-ok">
            Ready: {selectedSchool.school_name}{selectedSchoolRow ? ` · in an assigned region` : ' · outside your assigned regions — the server will reject check-in'}
          </p>
        ) : null}
      </Card>

      <LocationCard fix={fix} locating={locating} locationError={locationError} onLocate={() => void locate()} />

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">3. Evidence & details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="stamped-document">Stamped school document</Label>
            <Input id="stamped-document" type="file" accept="image/*" capture="environment" onChange={(e) => setDocument(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-muted">Before you capture — check for the school stamp. The document must carry the school's official stamp and be clearly visible before uploading.</p>
          </div>
          <div>
            <Label htmlFor="veda-selfie">Selfie</Label>
            <Input id="veda-selfie" type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label htmlFor="learner-count">Learner count</Label>
            <Input id="learner-count" type="number" min="0" step="1" inputMode="numeric" value={learnerCount} onChange={(e) => setLearnerCount(e.target.value)} placeholder="0" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="veda-notes">Notes</Label>
            <textarea id="veda-notes" className={FIELD} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for the supervisor" />
          </div>
        </div>
      </Card>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy || !canUseSchool || !fix || !selfie || !document}>
        {busy ? 'Submitting log…' : 'Start school log'}
      </Button>

      {selectedSchool ? (
        !openSession && !sessionDone ? (
          <p className="text-xs text-muted">After you start a log, record stationery distributed per grade and check out here.</p>
        ) : sessionDone ? (
          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink">Visit complete</h2>
            <p className="mt-1 text-xs text-muted">This school visit has already been checked out.</p>
            {existingDistributions.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-ink">
                {existingDistributions.map((d) => (
                  <li key={d.id} className="flex justify-between">
                    <span>{d.item_name}{d.grade_name ? ` · ${d.grade_name}` : d.grade_id ? '' : ' · General'}</span>
                    <span className="tabular-nums">×{d.quantity}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">No distributions were recorded.</p>
            )}
          </Card>
        ) : (
          <>
            <Card className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-ink">Stationery distributed</h2>
              <p className="mt-1 text-xs text-muted">Choose a grade, then set how many of each item were distributed to that grade this visit.</p>

              <div className="mt-4">
                <Label htmlFor="veda-grade">Grade / class band</Label>
                <Select id="veda-grade" value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
                  <option value="">General (no specific grade)</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </Select>
              </div>

              <div className="mt-3 space-y-2">
                {stationeryItems.length === 0 ? (
                  <p className="text-xs text-muted">No stationery items configured yet.</p>
                ) : (
                  stationeryItems.map((item) => {
                    const key = draftKey(gradeId, item.id);
                    const value = draft[key] ?? originalQty(gradeId, item.id);
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-ink">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setDraft((d) => ({ ...d, [key]: Math.max(0, value - 1) }))}>−</Button>
                          <input
                            className="w-20 rounded-lg border border-ink/15 bg-white px-2 py-1 text-center text-sm tabular-nums text-ink"
                            type="number" min="0" step="1" inputMode="numeric"
                            value={value}
                            onChange={(e) => setDraft((d) => ({ ...d, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={() => setDraft((d) => ({ ...d, [key]: Math.min(100000, value + 1) }))}>+</Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <Button type="button" className="mt-4 w-full sm:w-auto" disabled={savingDist || stationeryItems.length === 0} onClick={() => void saveDistributions()}>
                {savingDist ? 'Saving…' : 'Save distributions'}
              </Button>
            </Card>

            <Card className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-ink">Check out</h2>
              <p className="mt-1 text-xs text-muted">Verify your GPS then check out of this school visit. Re-capture your location if it changed.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="button" variant="outline" onClick={() => void locate()} disabled={locating}>
                  {locating ? 'Getting location…' : fix ? 'Refresh location' : 'Get my location'}
                </Button>
                <Button type="button" disabled={checkingOut || !fix} onClick={() => void checkout()}>
                  {checkingOut ? 'Checking out…' : 'Check out school visit'}
                </Button>
              </div>
              {fix ? <p className="mt-2 text-xs text-muted">Checking out from last captured location{fix.accuracy ? ` (≈${Math.round(fix.accuracy)} m)` : ''}.</p> : null}
            </Card>
          </>
        )
      ) : null}
    </form>
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
