import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { agencyLabel, declineReasonLabel } from '@fazoo/config';
import { requireStaff, isElevated } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { AgencyBadge, StageBadge } from '@/components/stage-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { mapsLink, nairobiDate, nairobiTime, NOT_YET } from '@/lib/format';
import { schoolDossier } from '@/server/booklists';

const OUTCOME_LABELS = {
  pending: 'No answer recorded',
  booklist_offered: 'Booklist offered',
  declined: 'Declined',
} as const;

const GEOFENCE_LABELS = {
  inside: 'GPS matched the school position',
  outside: 'GPS was away from the recorded school position',
  no_coordinates: 'No coordinates on file at the time',
  not_checked: 'GPS recorded — distance not checked',
} as const;

/** One school: its master-list record, every booklist job and every approach. */
export default async function SchoolDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, profile } = await requireStaff();
  const { id: schoolId } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(schoolId)) notFound();

  let dossier;
  try {
    dossier = await schoolDossier(client, schoolId);
  } catch {
    notFound();
  }

  const { school, jobs, visits } = dossier;
  const canAct = isElevated(profile.role);
  const link = mapsLink(school.latitude, school.longitude);
  const liveJob = jobs.find((job) => job.stage !== 'cancelled') ?? null;

  const booklists = visits.filter((visit) => visit.outcome === 'booklist_offered').length;
  const declines = visits.filter((visit) => visit.outcome === 'declined').length;
  const selfiesRequired = visits.filter((visit) => visit.selfie_required).length;
  const selfiesCaptured = visits.filter(
    (visit) => visit.selfie_required && visit.selfie_photo_path !== null,
  ).length;

  async function updateSchool(formData: FormData) {
    'use server';
    const { client: c, profile: actor } = await requireStaff();
    if (!isElevated(actor.role)) return;

    const latitude = String(formData.get('latitude') ?? '').trim();
    const longitude = String(formData.get('longitude') ?? '').trim();
    const radius = String(formData.get('geofence_radius_metres') ?? '').trim();

    const { error } = await c.rpc('admin_update_school', {
      p_school_id: schoolId,
      p_name: String(formData.get('name') ?? '').trim() || undefined,
      p_region: String(formData.get('region') ?? '').trim() || undefined,
      p_address: String(formData.get('address') ?? '').trim() || undefined,
      // Blank means "leave it alone": the argument is omitted, so the SQL default
      // null reaches the RPC, which coalesces it onto the current value.
      p_latitude: latitude === '' ? undefined : Number(latitude),
      p_longitude: longitude === '' ? undefined : Number(longitude),
      p_geofence_radius_metres: radius === '' ? undefined : Number(radius),
      p_school_type: String(formData.get('school_type') ?? '').trim() || undefined,
      p_contact_person_name: String(formData.get('contact_person_name') ?? '').trim() || undefined,
      p_contact_person_designation:
        String(formData.get('contact_person_designation') ?? '').trim() || undefined,
      p_contact_person_phone: String(formData.get('contact_person_phone') ?? '').trim() || undefined,
      p_status: String(formData.get('status') ?? '') === 'inactive' ? 'inactive' : 'active',
    });
    if (!error) {
      revalidatePath(`/schools/${schoolId}`);
      revalidatePath('/schools');
      revalidatePath('/booklists');
    }
  }

  return (
    <>
      <PageHeader
        title={school.name}
        description={[school.region, school.address].filter(Boolean).join(' · ') || 'No region or address recorded.'}
      >
        <Link
          href="/schools"
          className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Back to schools
        </Link>
        {liveJob ? (
          <Link
            href={`/booklists/${liveJob.id}`}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep"
          >
            Open the booklist job
          </Link>
        ) : null}
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={school.status === 'active' ? 'success' : 'neutral'}>{school.status}</Badge>
        {liveJob ? <StageBadge stage={liveJob.stage} /> : <Badge tone="neutral">Not engaged</Badge>}
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center rounded-lg border border-ink/15 bg-white px-3 text-xs font-medium text-primary hover:bg-lavender"
          >
            Open position in Maps
          </a>
        ) : (
          <Badge tone="warning">No coordinates yet</Badge>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Approaches" value={visits.length} />
        <StatCard label="Booklists offered" value={booklists} />
        <StatCard label="Declines" value={declines} />
        <StatCard
          label="Gate selfies"
          value={selfiesRequired === 0 ? NOT_YET : `${selfiesCaptured}/${selfiesRequired}`}
          hint={
            selfiesRequired === 0
              ? 'No visit required a selfie.'
              : 'Required by agency rules versus actually captured.'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Booklist jobs"
            description="One live journey per school. A cancelled job stays visible as history."
          />
          <TableWrap className="rounded-none border-0 shadow-none">
            <Table>
              <caption className="sr-only">Booklist jobs for this school</caption>
              <thead>
                <tr>
                  <Th>Stage</Th>
                  <Th>Copies</Th>
                  <Th>Logged</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <EmptyRow colSpan={4}>
                    No booklist job yet. One is created the first time a BA records an approach.
                  </EmptyRow>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id}>
                      <Td>
                        <Link
                          href={`/booklists/${job.id}`}
                          className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <StageBadge stage={job.stage} />
                        </Link>
                      </Td>
                      <Td className="text-xs tabular-nums">
                        {job.copies_requested === null
                          ? NOT_YET
                          : `${job.copies_requested.toLocaleString()} +1`}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">{nairobiTime(job.created_at)}</Td>
                      <Td className="whitespace-nowrap text-xs">{nairobiTime(job.stage_updated_at)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        </Card>

        {canAct ? (
          <Card>
            <CardHeader
              title="Edit this school"
              description="Coordinates matter: they are what turn the advisory distance check into a meaningful one."
            />
            <CardBody>
              <form action={updateSchool} className="space-y-3">
                <div>
                  <Label htmlFor="ed-name">School name</Label>
                  <Input id="ed-name" name="name" defaultValue={school.name} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ed-region">Region</Label>
                    <Input id="ed-region" name="region" defaultValue={school.region ?? ''} />
                  </div>
                  <div>
                    <Label htmlFor="ed-type">School type</Label>
                    <Input id="ed-type" name="school_type" defaultValue={school.school_type ?? ''} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="ed-address">Address</Label>
                  <Input id="ed-address" name="address" defaultValue={school.address ?? ''} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="ed-lat">Latitude</Label>
                    <Input
                      id="ed-lat"
                      name="latitude"
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      defaultValue={school.latitude ?? ''}
                      placeholder="Leave blank to keep"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ed-lng">Longitude</Label>
                    <Input
                      id="ed-lng"
                      name="longitude"
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      defaultValue={school.longitude ?? ''}
                      placeholder="Leave blank to keep"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ed-radius">Geofence (m)</Label>
                    <Input
                      id="ed-radius"
                      name="geofence_radius_metres"
                      type="number"
                      min="20"
                      max="2000"
                      step="1"
                      defaultValue={school.geofence_radius_metres}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ed-contact">Person in charge</Label>
                    <Input
                      id="ed-contact"
                      name="contact_person_name"
                      defaultValue={school.contact_person_name ?? ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ed-designation">Designation</Label>
                    <Input
                      id="ed-designation"
                      name="contact_person_designation"
                      defaultValue={school.contact_person_designation ?? ''}
                      placeholder="e.g. Head teacher"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ed-phone">Contact phone</Label>
                    <Input
                      id="ed-phone"
                      name="contact_person_phone"
                      type="tel"
                      defaultValue={school.contact_person_phone ?? ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ed-status">Status</Label>
                    <Select id="ed-status" name="status" defaultValue={school.status}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full">Save school</Button>
              </form>
            </CardBody>
          </Card>
        ) : null}
      </div>

      <Card className="mt-6">
        <CardHeader
          title={`Approaches (${visits.length})`}
          description="Every visit to this school, including the ones that were declined. Declines are logged here rather than dropped."
        />
        <TableWrap className="rounded-none border-0 shadow-none">
          <Table>
            <caption className="sr-only">Visits to this school</caption>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Brand ambassador</Th>
                <Th>Outcome</Th>
                <Th>Gate selfie</Th>
                <Th>GPS check</Th>
                <Th>Spoke to</Th>
              </tr>
            </thead>
            <tbody>
              {visits.length === 0 ? (
                <EmptyRow colSpan={6}>No BA has approached this school yet.</EmptyRow>
              ) : (
                visits.map((visit) => (
                  <tr key={visit.id}>
                    <Td className="whitespace-nowrap text-xs">
                      {nairobiDate(visit.visit_date)}
                      <p className="text-muted">{nairobiTime(visit.arrived_at)}</p>
                    </Td>
                    <Td className="text-xs">
                      {visit.ba_name ?? 'Unknown'}
                      <div className="mt-1">
                        <AgencyBadge agency={visit.ba_agency} selfieRequired={visit.selfie_required} />
                      </div>
                    </Td>
                    <Td className="text-xs">
                      <span
                        className={
                          visit.outcome === 'declined'
                            ? 'font-medium text-bad'
                            : visit.outcome === 'booklist_offered'
                              ? 'font-medium text-ok'
                              : 'text-muted'
                        }
                      >
                        {OUTCOME_LABELS[visit.outcome]}
                      </span>
                      {visit.declined_reason_code ? (
                        <p className="text-muted">
                          {declineReasonLabel(visit.declined_reason_code)}
                          {visit.declined_reason_notes ? ` — ${visit.declined_reason_notes}` : ''}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-xs">
                      {visit.selfie_photo_path ? (
                        <span className="font-medium text-ok">Captured</span>
                      ) : visit.selfie_required ? (
                        <span className="font-medium text-bad">Required — missing</span>
                      ) : (
                        <span className="text-muted">Not required ({agencyLabel(visit.agency)})</span>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {GEOFENCE_LABELS[visit.geofence_status]}
                      {visit.distance_metres !== null ? (
                        <p className="text-muted">
                          {Math.round(visit.distance_metres).toLocaleString()} m
                          {visit.accuracy_metres !== null
                            ? ` · accuracy ≈${Math.round(visit.accuracy_metres)} m`
                            : ''}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-xs">
                      {visit.contact_person_name ?? <span className="text-muted">Not recorded</span>}
                      {visit.contact_person_role ? (
                        <p className="text-muted">{visit.contact_person_role}</p>
                      ) : null}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}

export function generateMetadata() {
  return { title: 'School dossier — Fazoo' };
}
