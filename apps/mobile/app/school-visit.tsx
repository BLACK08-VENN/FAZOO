import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  BUCKET_BOOKLIST_DOCUMENTS,
  BUCKET_DAILY_LOG_PHOTOS,
  DECLINE_REASONS,
  SOURCE_FORMATS,
  agencyLabel,
  booklistStageLabel,
  distanceMetres,
} from '@fazoo/config';
import type { BaSchoolMatch, VisitOutcome } from '@fazoo/types';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import {
  documentPath,
  persistDocument,
  pickBooklistFile,
  type PickedDocument,
} from '@/lib/documents';
import { createSchool, resolveProfile, searchSchools, useVisitStats } from '@/lib/booklist';
import { enqueueReplace, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { StageBadge } from '@/components/stage-badge';
import { CaptureBox } from '@/components/capture-box';
import { AnswerButtons, ChipRow, ChoiceGroup, type ChipOption } from '@/components/choice';
import { Card, Field, GlassCard, MultilineField, Page, ScreenHeader } from '@/components/ui';

type Step = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<Step, string> = {
  1: 'Find the school',
  2: 'At the gate',
  3: 'The person in charge',
  4: 'Upload the booklist',
};
const SEARCH_DEBOUNCE_MS = 350;

export default function SchoolVisit() {
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const { data: stats } = useVisitStats();

  // ── Step 1: which school ───────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [matches, setMatches] = useState<BaSchoolMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [school, setSchool] = useState<BaSchoolMatch | null>(null);
  const [addingSchool, setAddingSchool] = useState(false);
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [draft, setDraft] = useState({ name: '', region: '', address: '', contactName: '', contactPhone: '' });

  // ── Step 2: presence at the gate ───────────────────────────────────────────
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [selfie, setSelfie] = useState<CapturedPhoto | null>(null);
  const [savingVisit, setSavingVisit] = useState(false);
  const [visitRequestId] = useState(newRequestId);

  // ── Step 3: what the person in charge said ─────────────────────────────────
  const [outcome, setOutcome] = useState<VisitOutcome | null>(null);
  const [declineCode, setDeclineCode] = useState<string | null>(null);
  const [declineNotes, setDeclineNotes] = useState('');
  const [contact, setContact] = useState({ name: '', role: '', phone: '' });
  const [isPerGrade, setIsPerGrade] = useState<string | null>(null);
  const [outcomeRequestId] = useState(newRequestId);

  // ── Step 4: the booklist itself ────────────────────────────────────────────
  const [docPhoto, setDocPhoto] = useState<CapturedPhoto | null>(null);
  const [docFile, setDocFile] = useState<PickedDocument | null>(null);
  const [sourceFormat, setSourceFormat] = useState<string | null>(null);
  const [gradeNotes, setGradeNotes] = useState('');
  const [docRequestId] = useState(newRequestId);
  const [submitting, setSubmitting] = useState(false);

  const searchGeneration = useRef(0);

  const runSearch = useCallback(async (term: string, regionFilter: string | null) => {
    const generation = searchGeneration.current + 1;
    searchGeneration.current = generation;
    setSearching(true);
    try {
      const result = await searchSchools(term.trim() || null, regionFilter, 25);
      if (generation !== searchGeneration.current) return;
      setMatches(result.schools);
      setRegions(result.regions);
      setError(null);
    } catch (err) {
      if (generation !== searchGeneration.current) return;
      setError(err instanceof Error ? err.message : 'Could not search schools.');
    } finally {
      if (generation === searchGeneration.current) {
        setSearching(false);
        setSearched(true);
      }
    }
  }, []);

  useEffect(() => {
    if (step !== 1) return;
    const timer = setTimeout(() => void runSearch(query, region), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, region, runSearch, step]);

  const distance = useMemo(() => {
    if (!fix || !school?.latitude || !school?.longitude) return null;
    return Math.round(distanceMetres(fix.latitude, fix.longitude, school.latitude, school.longitude));
  }, [fix, school]);

  const regionOptions = useMemo<ChipOption[]>(
    () => [{ code: null, label: 'All regions' }, ...regions.map((name) => ({ code: name, label: name }))],
    [regions],
  );

  async function locate() {
    setError(null);
    setLocating(true);
    try {
      setFix(await getFix());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  async function snapSelfie() {
    setError(null);
    try {
      const photo = await capturePhoto(true);
      if (photo) setSelfie(photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the camera.');
    }
  }

  async function snapDocument() {
    setError(null);
    try {
      const photo = await capturePhoto(false);
      if (photo) {
        setDocPhoto(photo);
        setDocFile(null);
        setSourceFormat('photo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the camera.');
    }
  }

  async function chooseFile() {
    setError(null);
    try {
      const picked = await pickBooklistFile();
      if (picked) {
        setDocFile(picked);
        setDocPhoto(null);
        setSourceFormat('softcopy');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that file.');
    }
  }

  async function addSchoolManually() {
    const name = draft.name.trim();
    if (name.length < 3) {
      setError('Enter the school name exactly as it appears on the sign (at least 3 letters).');
      return;
    }
    setCreatingSchool(true);
    setError(null);
    try {
      const result = await createSchool({
        name,
        region: draft.region.trim() || null,
        address: draft.address.trim() || null,
        contactPersonName: draft.contactName.trim() || null,
        contactPersonPhone: draft.contactPhone.trim() || null,
        clientRequestId: newRequestId(),
      });
      setSchool({
        school_id: result.school_id,
        school_name: result.school_name,
        school_region: result.school_region,
        school_address: draft.address.trim() || null,
        latitude: null,
        longitude: null,
        has_active_job: false,
        job_stage: null,
      });
      setContact((current) => ({
        ...current,
        name: current.name || draft.contactName.trim(),
        phone: current.phone || draft.contactPhone.trim(),
      }));
      setAddingSchool(false);
      setSaved(result.duplicate ? 'That school was already on the list — opened it for you.' : 'School added to the master list.');
      setStep(2);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Adding a new school needs a connection — the rest of the visit works offline.`
          : 'Could not add that school. Check your connection and try again.',
      );
    } finally {
      setCreatingSchool(false);
    }
  }

  /** Step 2 → queue the gate visit. Re-taking the selfie replaces the payload. */
  async function saveVisit(): Promise<boolean> {
    setError(null);
    if (!school) {
      setError('Choose a school first.');
      return false;
    }
    if (!fix) {
      setError('Get your location so the visit is verifiable.');
      return false;
    }
    if (!selfie) {
      setError('Take your gate selfie before continuing.');
      return false;
    }
    setSavingVisit(true);
    try {
      const me = await resolveProfile();
      if (!me) throw new Error('Your profile could not be loaded. Sign in again and retry.');

      const selfiePath = photoPath(me.organization_id, me.id, visitRequestId, 'gate-selfie');
      const localSelfie = await persistPhoto(selfie, visitRequestId, 'gate-selfie');

      await enqueueReplace(
        'start_school_visit',
        {
          p_school_id: school.school_id,
          p_client_request_id: visitRequestId,
          p_latitude: fix.latitude,
          p_longitude: fix.longitude,
          p_accuracy_metres: fix.accuracy,
          p_selfie_photo_path: selfiePath,
          p_contact_person_name: contact.name.trim() || null,
          p_contact_person_role: contact.role.trim() || null,
          p_contact_person_phone: contact.phone.trim() || null,
        },
        visitRequestId,
        [
          {
            localUri: localSelfie,
            bucket: BUCKET_DAILY_LOG_PHOTOS,
            remotePath: selfiePath,
            mimeType: selfie.mimeType,
          },
        ],
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this visit.');
      return false;
    } finally {
      setSavingVisit(false);
    }
  }

  async function saveOutcome(): Promise<boolean> {
    setError(null);
    if (!outcome) return false;
    if (outcome === 'declined' && !declineCode && !declineNotes.trim()) {
      setError('Record why the school declined — pick a reason or write it down.');
      return false;
    }
    try {
      await enqueueReplace(
        'record_visit_outcome',
        {
          p_visit_client_request_id: visitRequestId,
          p_client_request_id: outcomeRequestId,
          p_outcome: outcome,
          p_declined_reason_code: outcome === 'declined' ? declineCode : null,
          p_declined_reason_notes: outcome === 'declined' ? declineNotes.trim() || null : null,
          p_contact_person_name: contact.name.trim() || null,
          p_contact_person_role: contact.role.trim() || null,
          p_contact_person_phone: contact.phone.trim() || null,
          p_is_per_grade: isPerGrade === null ? null : isPerGrade === 'yes',
        },
        outcomeRequestId,
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the outcome.');
      return false;
    }
  }

  async function submitBooklist() {
    setSubmitting(true);
    setError(null);
    const attachment = docPhoto ?? docFile;
    if (!attachment) {
      setSubmitting(false);
      setError('Photograph the booklist or choose the file the school gave you.');
      return;
    }
    try {
      const me = await resolveProfile();
      if (!me) throw new Error('Your profile could not be loaded. Sign in again and retry.');

      const isPhoto = Boolean(docPhoto);
      const fileName = isPhoto ? 'booklist.jpg' : (docFile?.name ?? 'booklist');
      const mimeType = attachment.mimeType;
      const remotePath = documentPath(
        me.organization_id,
        me.id,
        docRequestId,
        'booklist',
        fileName,
        mimeType,
      );
      const localUri = isPhoto
        ? await persistPhoto(docPhoto as CapturedPhoto, docRequestId, 'booklist')
        : await persistDocument(docFile as PickedDocument, docRequestId, 'booklist');

      await enqueueReplace(
        'submit_booklist_document',
        {
          p_visit_client_request_id: visitRequestId,
          p_client_request_id: docRequestId,
          p_storage_path: remotePath,
          p_mime_type: mimeType,
          p_file_size_bytes: attachment.fileSize,
          p_source_format: sourceFormat ?? (isPhoto ? 'photo' : 'softcopy'),
          p_captured_on_site: isPhoto,
          p_is_per_grade: isPerGrade === null ? null : isPerGrade === 'yes',
          p_grade_notes: gradeNotes.trim() || null,
        },
        docRequestId,
        [{ localUri, bucket: BUCKET_BOOKLIST_DOCUMENTS, remotePath, mimeType }],
      );

      await finish();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Could not queue the booklist.');
    }
  }

  async function finish() {
    await flushQueue();
    router.replace('/schools');
  }

  async function recordDecline() {
    if (!(await saveOutcome())) return;
    await finish();
  }

  const selfieRuleNote = stats?.selfie_required
    ? `Your agency (${agencyLabel(stats.agency)}) requires a gate selfie for every school — it is audited.`
    : 'A gate selfie is expected for every school. It is the proof that you were at the entrance.';

  return (
    <Page>
      <ScreenHeader
        eyebrow={`Step ${step} of 4`}
        title={STEP_TITLES[step]}
        subtitle={school ? school.school_name : 'From the gate to the booklist.'}
        onBack={() => (step === 1 ? router.back() : setStep((current) => (current - 1) as Step))}
      />

      <View className="mb-5 flex-row items-center" accessibilityRole="progressbar">
        {[1, 2, 3, 4].map((n) => (
          <View key={n} className={`mx-1 h-2 flex-1 rounded-full ${n <= step ? 'bg-primary' : 'bg-ink/10'}`} />
        ))}
      </View>

      {error ? <StatusPill tone="bad" label={error} /> : null}
      {saved ? <StatusPill tone="ok" label={saved} /> : null}

      {step === 1 ? (
        <>
          <Field
            label="School name"
            placeholder="Start typing the school name"
            autoCorrect={false}
            autoCapitalize="words"
            value={query}
            onChangeText={setQuery}
          />

          {regions.length > 0 ? (
            <ChipRow label="Region" options={regionOptions} value={region} onChange={setRegion} />
          ) : null}

          <View className="mb-4 flex-row items-center justify-between">
            <Text className="font-sans text-sm uppercase tracking-[2px] text-muted">
              {searching ? 'Searching…' : `${matches.length} match${matches.length === 1 ? '' : 'es'}`}
            </Text>
            <PrimaryButton
              label="Not on the list? Add it"
              variant="ghost"
              onPress={() => {
                setAddingSchool((current) => !current);
                setError(null);
              }}
            />
          </View>

          {addingSchool ? (
            <Card className="mb-4">
              <Text className="font-sans mb-3 text-base font-bold text-ink">Add a school</Text>
              <Text className="font-sans mb-4 text-sm leading-6 text-muted">
                Only add a school that is genuinely missing. Duplicates make the pipeline unreliable.
              </Text>
              <Field
                label="School name (as on the sign)"
                placeholder="e.g. Nairobi Primary School"
                value={draft.name}
                onChangeText={(value) => setDraft((d) => ({ ...d, name: value }))}
              />
              <Field
                label="Region / county"
                placeholder="e.g. Nairobi"
                value={draft.region}
                onChangeText={(value) => setDraft((d) => ({ ...d, region: value }))}
              />
              <Field
                label="Address or landmark"
                placeholder="Optional"
                value={draft.address}
                onChangeText={(value) => setDraft((d) => ({ ...d, address: value }))}
              />
              <Field
                label="Person in charge"
                placeholder="Optional"
                value={draft.contactName}
                onChangeText={(value) => setDraft((d) => ({ ...d, contactName: value }))}
              />
              <Field
                label="Their phone number"
                placeholder="Optional"
                keyboardType="phone-pad"
                value={draft.contactPhone}
                onChangeText={(value) => setDraft((d) => ({ ...d, contactPhone: value }))}
              />
              <PrimaryButton
                label="Add school and continue"
                icon="add-circle"
                busy={creatingSchool}
                onPress={() => void addSchoolManually()}
              />
            </Card>
          ) : null}

          {searching && matches.length === 0 ? (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color="#7B2FBE" />
            </View>
          ) : matches.length === 0 && searched ? (
            <GlassCard className="mb-4">
              <Text className="font-sans text-base font-semibold text-ink">No school matches that.</Text>
              <Text className="font-sans mt-2 text-sm leading-6 text-muted">
                Try fewer words, or add the school if it is genuinely not on our list.
              </Text>
            </GlassCard>
          ) : (
            <View className="gap-3">
              {matches.map((match) => (
                <Card key={match.school_id}>
                  <View className="flex-row items-start justify-between gap-4">
                    <View className="flex-1">
                      <Text className="font-sans text-lg font-bold text-ink">{match.school_name}</Text>
                      {match.school_region ? (
                        <Text className="font-sans mt-1 text-sm text-muted">{match.school_region}</Text>
                      ) : null}
                      {match.school_address ? (
                        <Text className="font-sans mt-1 text-sm leading-5 text-muted">{match.school_address}</Text>
                      ) : null}
                    </View>
                    {match.has_active_job ? <StageBadge stage={match.job_stage} /> : null}
                  </View>
                  <PrimaryButton
                    label={match.has_active_job ? `Continue — ${booklistStageLabel(match.job_stage)}` : 'I am at this school'}
                    onPress={() => {
                      setSchool(match);
                      setSaved(null);
                      setStep(2);
                    }}
                  />
                </Card>
              ))}
            </View>
          )}
        </>
      ) : null}

      {step === 2 && school ? (
        <>
          <Card className="mb-4">
            <Text className="font-sans text-xl font-bold text-ink">{school.school_name}</Text>
            {school.school_region ? (
              <Text className="font-sans mt-1 text-sm text-muted">{school.school_region}</Text>
            ) : null}
            <Text className="font-sans mt-4 text-base leading-6 text-muted">{selfieRuleNote}</Text>
          </Card>

          <GlassCard className="mb-4">
            <Text className="font-sans text-sm font-semibold text-ink">Your location</Text>
            {locating ? (
              <ActivityIndicator color="#7B2FBE" className="mt-3" />
            ) : fix ? (
              <>
                <Text className="font-sans mt-2 text-sm leading-6 text-muted">
                  Accuracy {fix.accuracy ? `${Math.round(fix.accuracy)} m` : 'unknown'}
                  {distance !== null ? ` · about ${distance} m from the recorded school position` : ''}
                </Text>
                {distance !== null && distance > 500 ? (
                  <StatusPill
                    tone="warn"
                    label={`You are ${distance} m away. This is recorded but will not block you — make sure this is the right school.`}
                  />
                ) : (
                  <StatusPill tone="ok" label="Location captured." />
                )}
              </>
            ) : (
              <Text className="font-sans mt-2 text-sm leading-6 text-muted">
                Stand at the entrance or gate, then capture your location.
              </Text>
            )}
          </GlassCard>

          <PrimaryButton
            label={fix ? 'Refresh my location' : 'Capture my location'}
            variant="secondary"
            icon="locate"
            busy={locating}
            onPress={() => void locate()}
          />

          <Card className="mt-3 mb-4">
            <Text className="font-sans mb-3 text-base font-bold text-ink">Gate selfie</Text>
            <Text className="font-sans mb-3 text-sm leading-6 text-muted">
              Take it at the entrance or gate, with the school signage in frame where you can.
            </Text>
            <CaptureBox photo={selfie} onSnap={() => void snapSelfie()} hint="Tap to take your gate selfie" />
            {selfie ? (
              <PrimaryButton label="Retake selfie" variant="ghost" onPress={() => void snapSelfie()} />
            ) : null}
          </Card>

          <PrimaryButton
            label="Save visit and continue"
            icon="checkmark-circle"
            disabled={!fix || !selfie}
            busy={savingVisit}
            onPress={() => void (async () => {
              if (await saveVisit()) {
                setSaved('Visit saved — it syncs automatically.');
                setStep(3);
              }
            })()}
          />
        </>
      ) : null}

      {step === 3 && school ? (
        <>
          <Card className="mb-4">
            <Text className="font-sans mb-2 text-base font-bold text-ink">
              What did {school.school_name} say?
            </Text>
            <Text className="font-sans text-sm leading-6 text-muted">
              Ask the principal or the person in charge for the school's booklist. Record the answer either way —
              a decline is a result too.
            </Text>
          </Card>

          {!outcome ? (
            <AnswerButtons
              options={[
                {
                  code: 'booklist_offered',
                  label: 'They gave me the booklist',
                  hint: 'Continue to upload it.',
                  icon: 'checkmark-circle',
                },
                {
                  code: 'declined',
                  label: 'They declined',
                  hint: 'Record why, then move on to the next school.',
                  icon: 'close-circle',
                },
              ]}
              onSelect={(code) => setOutcome(code as VisitOutcome)}
            />
          ) : null}

          {outcome ? (
            <>
              <StatusPill
                tone={outcome === 'declined' ? 'warn' : 'ok'}
                label={outcome === 'declined' ? 'Recording a decline' : 'Booklist offered'}
              />

              <Card className="mt-4 mb-4">
                <Text className="font-sans mb-3 text-base font-bold text-ink">Person in charge</Text>
                <Field
                  label="Name"
                  placeholder="Who did you speak to?"
                  value={contact.name}
                  onChangeText={(value) => setContact((c) => ({ ...c, name: value }))}
                />
                <Field
                  label="Role"
                  placeholder="e.g. Principal, Deputy, Secretary"
                  value={contact.role}
                  onChangeText={(value) => setContact((c) => ({ ...c, role: value }))}
                />
                <Field
                  label="Phone number"
                  placeholder="Optional"
                  keyboardType="phone-pad"
                  value={contact.phone}
                  onChangeText={(value) => setContact((c) => ({ ...c, phone: value }))}
                />
              </Card>

              {outcome === 'declined' ? (
                <>
                  <ChoiceGroup
                    label="Why did they decline?"
                    options={DECLINE_REASONS}
                    value={declineCode}
                    onChange={setDeclineCode}
                    hint="Pick the closest reason, or write your own below."
                  />
                  <MultilineField
                    label="What exactly did they say?"
                    placeholder="Their words help us follow up better."
                    value={declineNotes}
                    onChangeText={setDeclineNotes}
                  />
                  <PrimaryButton label="Save decline" icon="save" onPress={() => void recordDecline()} />
                  <PrimaryButton label="Change the answer" variant="ghost" onPress={() => setOutcome(null)} />
                </>
              ) : (
                <>
                  <ChoiceGroup
                    label="Is the booklist per grade?"
                    options={[
                      { code: 'yes', label: 'Yes — one list per grade' },
                      { code: 'no', label: 'No — one list for the school' },
                      { code: 'unknown', label: 'Not sure yet' },
                    ]}
                    value={isPerGrade}
                    onChange={setIsPerGrade}
                    hint="If you are not sure, our admin will work it out from the document."
                  />
                  <PrimaryButton
                    label="Continue to upload"
                    icon="document-attach"
                    onPress={() => void saveOutcome().then((ok) => ok && setStep(4))}
                  />
                  <PrimaryButton label="Change the answer" variant="ghost" onPress={() => setOutcome(null)} />
                  <PrimaryButton
                    label="Save without the document"
                    variant="secondary"
                    onPress={() => void saveOutcome().then((ok) => ok && void finish())}
                  />
                </>
              )}
            </>
          ) : null}
        </>
      ) : null}

      {step === 4 && school ? (
        <>
          <Card className="mb-4">
            <Text className="font-sans mb-2 text-base font-bold text-ink">
              Upload the booklist from {school.school_name}
            </Text>
            <Text className="font-sans text-sm leading-6 text-muted">
              Handwritten, printed, a scan or a softcopy — all of them work. Our admin converts it into an
              editable Word document you can print and take back for approval.
            </Text>
          </Card>

          <Card className="mb-4">
            <Text className="font-sans mb-3 text-base font-semibold text-ink">Photograph it here</Text>
            <CaptureBox
              photo={docPhoto}
              onSnap={() => void snapDocument()}
              hint="Tap to photograph the booklist"
            />
          </Card>

          <Card className="mb-4">
            <Text className="font-sans mb-2 text-base font-semibold text-ink">Or choose a file</Text>
            <Text className="font-sans mb-3 text-sm leading-6 text-muted">
              PDF, Word or an image already on your phone — for example one the school sent by WhatsApp.
            </Text>
            <PrimaryButton
              label={docFile ? docFile.name : 'Choose a file'}
              variant="secondary"
              icon="folder-open"
              onPress={() => void chooseFile()}
            />
          </Card>

          <ChoiceGroup
            label="How did the school hand it over?"
            options={SOURCE_FORMATS}
            value={sourceFormat}
            onChange={setSourceFormat}
          />

          {isPerGrade === 'yes' || isPerGrade === null ? (
            <MultilineField
              label="Grade notes"
              placeholder="e.g. Grade 4 and 5 lists were separate sheets"
              value={gradeNotes}
              onChangeText={setGradeNotes}
            />
          ) : null}

          <PrimaryButton
            label="Submit booklist"
            icon="cloud-upload"
            busy={submitting}
            disabled={!docPhoto && !docFile}
            onPress={() => void submitBooklist()}
          />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(3)} />
        </>
      ) : null}

      <View className="h-12" />
    </Page>
  );
}
