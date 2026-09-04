import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { distanceMetres } from '@fazoo/config';
import type { AssignmentToday, VedaTodayResult } from '@fazoo/types';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedProfile, readCachedVedaToday, writeCachedVedaToday } from '@/lib/cache';
import { Screen, ScreenHeader, Card, Field, GlassCard } from '@/components/ui';

export default function VedaCheckIn() {
  const [step, setStep] = useState(1);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [selfie, setSelfie] = useState<CapturedPhoto | null>(null);
  const [document, setDocument] = useState<CapturedPhoto | null>(null);
  const [learnerCount, setLearnerCount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
  const [assignment, setAssignment] = useState<{ id: string; assignment: AssignmentToday; geofence: number; } | null>(null);

  async function loadVisit(): Promise<typeof assignment> {
    const { data, error: todayError } = await supabase.rpc('veda_today');
    if (!todayError && data) {
      const today = data as unknown as VedaTodayResult;
      await writeCachedVedaToday(today);
      const match = today.assignments.find((item) => item.assignment.id === assignmentParam) ?? today.assignments[0];
      if (!match) return null;
      return { id: match.assignment.id, assignment: match.assignment, geofence: match.assignment.geofence_radius_metres ?? 200 };
    }
    const cached = await readCachedVedaToday();
    const match = cached?.assignments.find((item) => item.assignment.id === assignmentParam) ?? cached?.assignments[0];
    return match ? { id: match.assignment.id, assignment: match.assignment, geofence: match.assignment.geofence_radius_metres ?? 200 } : null;
  }

  useEffect(() => { void loadVisit().then(setAssignment); }, [assignmentParam]);

  const radius = assignment?.geofence ?? 200;
  const distance = fix && assignment && assignment.assignment.school_latitude && assignment.assignment.school_longitude ? Math.round(distanceMetres(fix.latitude, fix.longitude, assignment.assignment.school_latitude, assignment.assignment.school_longitude)) : null;
  const insideGeofence = distance !== null && distance <= radius;

  async function locate() {
    setError(null);
    setLocating(true);
    try { setFix(await getFix()); } catch (err) { setError(err instanceof Error ? err.message : 'Location failed.'); } finally { setLocating(false); }
  }

  async function snap(slot: 'selfie' | 'document') {
    try {
      const photo = await capturePhoto(slot === 'selfie');
      if (!photo) return;
      if (slot === 'selfie') setSelfie(photo);
      else setDocument(photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera failed.');
    }
  }

  async function submit() {
    if (!fix || !assignment || !selfie || !document) return;
    setBusy(true);
    setError(null);
    const requestId = newRequestId();
    try {
      const { data: remoteProfile } = await supabase.from('profiles').select('id, organization_id').single();
      const cachedProfile = remoteProfile ? null : await readCachedProfile();
      const me = remoteProfile ?? cachedProfile;
      if (!me) throw new Error('Your profile could not be loaded. Sign in again and retry.');
      const selfiePath = photoPath(me.organization_id, me.id, requestId, 'selfie');
      const documentPath = photoPath(me.organization_id, me.id, requestId, 'stamped-doc');
      const [localSelfie, localDocument] = await Promise.all([persistPhoto(selfie, requestId, 'selfie'), persistPhoto(document, requestId, 'stamped-doc')]);
      const payload = {
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy,
        p_selfie_photo_path: selfiePath,
        p_stamped_document_path: documentPath,
        p_learner_count: Math.max(0, Number(learnerCount) || 0),
        p_notes: notes.trim() || null,
        p_client_request_id: requestId,
        p_assignment_id: assignment.id,
      };
      await enqueue('veda_checkin', payload, requestId, [
        { localUri: localSelfie, bucket: 'daily-log-photos', remotePath: selfiePath, mimeType: selfie.mimeType },
        { localUri: localDocument, bucket: 'daily-log-photos', remotePath: documentPath, mimeType: document.mimeType },
      ]);
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not check in — it will sync automatically.');
    }
  }

  const stepTitle = ['School & location', 'Site selfie', 'Stamped document'][step - 1] ?? 'Check-in';

  return (
    <Screen>
      <ScreenHeader eyebrow={`Step ${step} of 3`} title={stepTitle} subtitle="Verify your location, capture school evidence, and record the learner count." />
      <View className="mb-5 flex-row items-center" accessibilityRole="progressbar">
        {[1, 2, 3].map((n) => <View key={n} className={`mx-1 h-2 flex-1 rounded-full ${n <= step ? 'bg-white' : 'bg-white/14'}`} />)}
      </View>

      {error ? <StatusPill tone="bad" label={error} /> : null}

      {step === 1 ? (
        <>
          <Card>
            <Text className="text-xl font-bold text-ink">{assignment?.assignment.school_name ?? 'Loading…'}</Text>
            <Text className="mt-1 text-sm text-slate-500">{assignment?.assignment.school_region}</Text>
            <Text className="mt-4 text-sm font-semibold text-slate-700">Allowed radius: {radius} m</Text>
            {locating ? <ActivityIndicator color="#5B6CFF" className="mt-4" /> : distance !== null ? <StatusPill tone={insideGeofence ? 'ok' : 'bad'} label={insideGeofence ? `You are about ${distance} m from the school — within the ${radius} m zone` : `You are ${distance} m away — move closer than ${radius} m to check in`} /> : <Text className="mt-3 text-sm text-slate-500">Tap “Get my location” so we can verify you are at the school.</Text>}
          </Card>
          <GlassCard className="mb-1 mt-4"><Text className="text-sm leading-6 text-white/72">Your displayed distance is for guidance. The server makes the final geofence decision.</Text></GlassCard>
          <PrimaryButton label={fix ? 'Refresh location' : 'Get my location'} onPress={() => void locate()} busy={locating} icon="locate" />
          <PrimaryButton label="Continue" disabled={!insideGeofence} onPress={() => setStep(2)} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Card>
            <Text className="text-base leading-6 text-slate-600">Take a selfie showing you are at the school, with school signage in frame where possible.</Text>
            <CaptureBox photo={selfie} onSnap={() => void snap('selfie')} hint="Tap to take your site selfie" />
          </Card>
          <PrimaryButton label="Retake" variant="ghost" disabled={!selfie} onPress={() => void snap('selfie')} />
          <PrimaryButton label="Continue" disabled={!selfie} onPress={() => setStep(3)} />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Card>
            <Text className="text-base leading-6 text-slate-600">Photograph the stamped confirmation document and enter the learner count.</Text>
            <CaptureBox photo={document} onSnap={() => void snap('document')} hint="Tap to photograph the stamped document" />
          </Card>
          <Field label="Learner count" placeholder="Learner count" keyboardType="number-pad" value={learnerCount} onChangeText={setLearnerCount} />
          <Field label="Notes" placeholder="Notes (optional)" multiline value={notes} onChangeText={setNotes} />
          <PrimaryButton label="Check In" onPress={() => void submit()} busy={busy} disabled={!document} icon="checkmark-circle" />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(2)} />
        </>
      ) : null}
    </Screen>
  );
}

function CaptureBox({ photo, onSnap, hint }: { photo: CapturedPhoto | null; onSnap: () => void; hint: string }) {
  return (
    <PrimaryButton onPress={onSnap} label="" accessibilityLabel={hint}>
      {photo ? <Image source={{ uri: photo.uri }} className="h-full w-full rounded-2xl" resizeMode="cover" /> : <View className="min-h-48 w-full items-center justify-center rounded-2xl border border-dashed border-white/25 bg-white/6"><Text className="font-semibold text-white">{hint}</Text></View>}
    </PrimaryButton>
  );
}
