'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { formatNairobiDisplay } from '@fazoo/config';
import { PageHeader, StatCard } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import {
  assignmentSchema,
  needsFollowUp,
  reportSchema,
  sampleVisits,
  visitsSchema,
  type Visit,
} from '@/lib/merchandising-preview/model';
import { readPreviewPhoto } from '@/lib/preview-photo';

const storageKey = 'fazoo-mars-wrigley-merchandising-v1';
const assignees = ['Retail merchandiser', 'Relief merchandiser'] as const;

function visitStatus(visit: Visit) {
  if (needsFollowUp(visit)) return 'Follow-up needed';
  if (visit.resolved) return 'Follow-up resolved';
  if (visit.report) return 'Report received';
  return visit.arrival ? 'Checked in' : 'Assigned';
}

export function MerchandisingWorkspace() {
  const [visits, setVisits] = useState<Visit[]>(sampleVisits);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState('supervisor');
  const [selected, setSelected] = useState(sampleVisits[0]!.id);
  const [allocating, setAllocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const supervisor = role === 'supervisor';
  const visibleVisits = supervisor ? visits : visits.filter((visit) => visit.assignee === role);
  const current = visibleVisits.find((visit) => visit.id === selected) ?? visibleVisits[0];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setVisits(visitsSchema.parse(JSON.parse(saved)));
    } catch {
      setError('Saved visits could not be loaded. Sample visits are shown.');
    } finally {
      setReady(true);
    }
  }, []);

  function save(change: (previous: Visit[]) => Visit[], confirmation: string) {
    setMessage('');
    setError('');
    try {
      const saved = localStorage.getItem(storageKey);
      const stored = saved ? visitsSchema.safeParse(JSON.parse(saved)) : null;
      const next = change(stored?.success ? stored.data : visits);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setVisits(next);
      setMessage(confirmation);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The visit could not be saved.');
      return false;
    }
  }

  function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = assignmentSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setError('Enter an outlet, campaign, product and assignee.');
      return;
    }
    const visit = { ...parsed.data, id: crypto.randomUUID() };
    if (save((previous) => [visit, ...previous], 'Visit assigned.')) {
      setSelected(visit.id);
      setAllocating(false);
    }
  }

  function updateVisit(visit: Visit, update: (stored: Visit) => Visit, confirmation: string) {
    save(
      (previous) =>
        previous.map((row) => {
          if (row.id !== visit.id) return row;
          if (
            row.arrival !== visit.arrival ||
            Boolean(row.report) !== Boolean(visit.report) ||
            row.resolved !== visit.resolved
          )
            throw new Error(
              'This visit has already changed. Reopen the workspace to refresh it.',
            );
          return update(row);
        }),
      confirmation,
    );
  }

  async function submitReport(event: FormEvent<HTMLFormElement>, visit: Visit) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const file = form.get('photo');
      const photo =
        file instanceof File && file.size > 0 ? await readPreviewPhoto(file) : undefined;
      const parsed = reportSchema.safeParse({
        quantity: Number(form.get('quantity')),
        display: form.get('display'),
        promotion: form.get('promotion'),
        notes: form.get('notes'),
        photo,
      });
      if (!parsed.success) throw new Error('Check the stock count and visit details.');
      updateVisit(visit, (row) => ({ ...row, report: parsed.data }), 'Visit report submitted.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The report could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-lavender/30 text-ink">
      <div className="mx-auto max-w-7xl p-4 sm:p-7">
        <PageHeader
          title="Mars Wrigley · Merchandising"
          description="Assign outlet visits, track product availability, verify displays and follow up on promotion issues."
        >
          {supervisor && (
            <Button disabled={!ready || busy} onClick={() => setAllocating(!allocating)}>
              {allocating ? 'Close assignment form' : 'Assign outlet visit'}
            </Button>
          )}
        </PageHeader>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Label htmlFor="mars-role" className="mb-0">
            View as
          </Label>
          <Select
            id="mars-role"
            className="w-auto"
            value={role}
            disabled={!ready || busy}
            onChange={(event) => {
              setRole(event.target.value);
              setAllocating(false);
              setMessage('');
              setError('');
            }}
          >
            <option value="supervisor">Field supervisor</option>
            {assignees.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </Select>
        </div>
        {error && (
          <p role="alert" className="mb-4 text-sm text-bad">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mb-4 text-sm text-ink">
            {message}
          </p>
        )}
        {supervisor && allocating && (
          <Card className="mb-5 p-4">
            <form onSubmit={assign} className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['outlet', 'Outlet and display location'],
                  ['campaign', 'Campaign'],
                  ['product', 'Product and pack size'],
                ] as const
              ).map(([name, label]) => (
                <div key={name}>
                  <Label htmlFor={`mars-${name}`}>{label}</Label>
                  <Input
                    id={`mars-${name}`}
                    name={name}
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </div>
              ))}
              <div>
                <Label htmlFor="mars-assignee">Assign to</Label>
                <Select id="mars-assignee" name="assignee">
                  {assignees.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </Select>
              </div>
              <Button type="submit" className="w-fit">
                Save assignment
              </Button>
            </form>
          </Card>
        )}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Assigned visits" value={visibleVisits.length} />
          <StatCard
            label="Check-ins recorded"
            value={visibleVisits.filter((row) => row.arrival).length}
          />
          <StatCard
            label="Reports received"
            value={visibleVisits.filter((row) => row.report).length}
          />
          <StatCard
            label="Follow-up needed"
            value={visibleVisits.filter(needsFollowUp).length}
          />
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,1fr)_2fr]">
          <Card className="space-y-2 p-3">
            <h2 className="p-2 font-semibold">Outlet visits</h2>
            {visibleVisits.length === 0 && (
              <p className="p-2 text-sm text-muted">No visits assigned.</p>
            )}
            {visibleVisits.map((visit) => (
              <button
                key={visit.id}
                type="button"
                disabled={!ready || busy}
                aria-pressed={current?.id === visit.id}
                onClick={() => setSelected(visit.id)}
                className={`w-full rounded-xl border p-3 text-left ${current?.id === visit.id ? 'border-primary bg-primary/5' : 'border-ink/10'}`}
              >
                <strong className="block text-sm">{visit.outlet}</strong>
                <span className="block text-xs text-muted">{visit.product}</span>
                <span className="mt-1 block text-xs">{visitStatus(visit)}</span>
              </button>
            ))}
          </Card>
          {current && (
            <Card key={current.id} className="space-y-4 p-4 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase text-muted">{current.campaign}</p>
                <h2 className="mt-1 text-xl font-semibold">{current.outlet}</h2>
                <p className="text-sm">
                  {current.product} · {current.assignee}
                </p>
                {current.arrival && (
                  <p className="mt-2 text-sm text-muted">
                    Sample check-in · {formatNairobiDisplay(current.arrival)} EAT
                  </p>
                )}
              </div>
              {current.report ? (
                <>
                  <dl className="grid gap-3 rounded-xl bg-lavender/50 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="font-semibold">Units on shelf</dt>
                      <dd>{current.report.quantity}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Display</dt>
                      <dd>{current.report.display}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Promotion</dt>
                      <dd>{current.report.promotion}</dd>
                    </div>
                  </dl>
                  {current.report.notes && (
                    <p className="whitespace-pre-wrap text-sm">{current.report.notes}</p>
                  )}
                  {current.report.photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={current.report.photo}
                      alt="Merchandiser’s shelf or display photo"
                      className="max-h-64 max-w-full rounded-lg object-contain"
                    />
                  )}
                  {supervisor && needsFollowUp(current) && (
                    <Button
                      disabled={!ready}
                      onClick={() =>
                        updateVisit(
                          current,
                          (row) => ({ ...row, resolved: true }),
                          'Follow-up marked resolved.',
                        )
                      }
                    >
                      Mark follow-up resolved
                    </Button>
                  )}
                </>
              ) : supervisor ? (
                <p className="text-sm text-muted">
                  Waiting for the assigned merchandiser’s report.
                </p>
              ) : !current.arrival ? (
                <Button
                  disabled={!ready}
                  onClick={() =>
                    updateVisit(
                      current,
                      (row) => ({ ...row, arrival: new Date().toISOString() }),
                      'Sample check-in recorded.',
                    )
                  }
                >
                  Record sample check-in
                </Button>
              ) : (
                <form onSubmit={(event) => void submitReport(event, current)}>
                  <fieldset disabled={!ready || busy} className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="mars-quantity">Units on shelf</Label>
                      <Input
                        id="mars-quantity"
                        name="quantity"
                        type="number"
                        required
                        min={0}
                        max={999999}
                      />
                    </div>
                    <div>
                      <Label htmlFor="mars-display">Display condition</Label>
                      <Select id="mars-display" name="display">
                        <option>In place</option>
                        <option>Needs correction</option>
                        <option>Missing</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="mars-promotion">Promotion status</Label>
                      <Select id="mars-promotion" name="promotion">
                        <option>Not scheduled</option>
                        <option>Running</option>
                        <option>Missing or incorrect</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="mars-photo">Shelf or checkout photo (optional)</Label>
                      <Input
                        id="mars-photo"
                        name="photo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="mars-notes">Visit notes and follow-up needed</Label>
                      <textarea
                        id="mars-notes"
                        name="notes"
                        maxLength={1200}
                        className="fazoo-field min-h-24 w-full rounded-lg border p-3"
                      />
                    </div>
                    <Button type="submit" className="w-fit">
                      {busy ? 'Saving…' : 'Submit visit report'}
                    </Button>
                  </fieldset>
                </form>
              )}
            </Card>
          )}
        </div>
        <p className="mt-8 text-xs text-muted">
          Sample records and photos stay in this browser. Check-ins simulate arrival without
          collecting GPS coordinates.
        </p>
      </div>
    </main>
  );
}
