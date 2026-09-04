import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { distanceMetres } from '@fazoo/config';
import type { VedaTodayResult } from '@fazoo/types';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { readCachedProfile } from '@/lib/cache';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { Screen, ScreenHeader, Card, Field, GlassCard } from '@/components/ui';

export default function VedaNewLog() {
  const [step, setStep] = useState(1);
  const [document, setDocument] = useState<CapturedPhoto | null>(null);
  const [selfie, setSelfie] = useState<CapturedPhoto | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [learnerCount, setLearnerCount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useLocalSearchParams<{ assignmentId?: string; schoolId?: string; schoolName?: string }>();
  const [assignmentId, setAssignmentId] = useState<string | null>(params.assignmentId ?? null);
  const [geofenceRadius, setGeofenceRadius] = useState(200);
  const [schoolCoords, setSchoolCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    async function loadSchool() {
      if (!params.schoolId) return;
      if (!params.assignmentId) {
        const { data: todayData } = await supabase.rpc('veda_today');
        if (todayData) {
          const today = todayData as unknown as VedaTodayResult;
          const match = today.assignments.find((item) => item.assignment.school_id === params.schoolId);
          if (match?.assignment.id) setAssignmentId(match.assignment.id);
        }
      }
      const { data } = await supabase.from('veda_schools').select('latitude, longitude, geofence_radius_metres').eq('id', params.schoolId).single();
      if (data) {
        setSchoolCoords(data.latitude && data.longitude ? { latitude: data.latitude, longitude: data.longitude } : null);
        setGeofenceRadius(data.geofence_radius_metres ?? 200);
      }
    }
    void loadSchool();
  }, [params.schoolId]);

  const distance = fix && schoolCoords ? Math.round(distanceMetres(fix.latitude, fix.longitude, schoolCoords.latitude, schoolCoords.longitude)) : null;
  const insideGeofence = distance !== null && distance <= geofenceRadius;

  async function locate() {
    setError(null);
    setLocating(true);
    try { setFix(await getFix()); } catch (err) { setError(err instanceof Error ? err.message : 'Location failed.'); } finally { setLocating(false); }
  }

  async function snap(slot: 'document' | 'selfie') {
    try {
      const photo = await capturePhoto(slot === 'selfie');
      if (!photo) return;
      if (slot === 'document') setDocument(photo);
      else setSelfie(photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera failed.');
    }
  }

  async function submit() {
    if (!fix || !document || !selfie || !params.schoolId) {
      setError('Choose a school, then capture both the stamped document and your selfie.');
      return;
    }
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
        p_assignment_id: assignmentId,
        p_school_id: params.schoolId,
      };
      await enqueue('veda_checkin', payload, requestId, [
        { localUri: localSelfie, bucket: 'daily-log-photos', remotePath: selfiePath, mimeType: selfie.mimeType },
        { localUri: localDocument, bucket: 'daily-log-photos', remotePath: documentPath, mimeType: document.mimeType },
      ]);
      router.push({ pathname: '/campaign-logs', params: { kind: 'schools', assignmentId, schoolId: params.schoolId, schoolName: params.schoolName } });
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not submit log — it will sync automatically.');
    }
  }

  const stepTitle = step === 1 ? 'School list document' : 'Your selfie';

  return (
    <Screen>
      <ScreenHeader eyebrow={`Step ${step} of 2`} title={stepTitle} subtitle={params.schoolName} />
      <View className="mb-5 flex-row items-center" accessibilityRole="progressbar">
        {[1, 2].map((n) => <View key={n} className={`mx-1 h-2 flex-1 rounded-full ${n <= step ? 'bg-white' : 'bg-white/14'}`} />)}
      </View>
      {error ? <StatusPill tone="bad" label={error} /> : null}

      {step === 1 ? (
        <>
          <Card>
            <Text className="text-base leading-6 text-slate-600">Photograph the stamped document for this school visit.</Text>
            <CaptureBox photo={document} onSnap={() => void snap('document')} hint="Tap to photograph the stamped document" />
          </Card>
          <PrimaryButton label="Retake" variant="ghost" disabled={!document} onPress={() => void snap('document')} />
          <PrimaryButton label="Continue" disabled={!document} onPress={() => setStep(2)} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Card>
            <Text className="text-base leading-6 text-slate-600">Take a clear selfie of yourself at the school.</Text>
            <CaptureBox photo={selfie} onSnap={() => void snap('selfie')} hint="Tap to take your selfie" />
          </Card>
          <PrimaryButton label="Retake" variant="ghost" disabled={!selfie} onPress={() => void snap('selfie')} />
          <GlassCard className="mt-4">
            <Text className="mb-2 text-sm font-semibold text-white">Location verification</Text>
            {locating ? <ActivityIndicator color="#D8DDFF" className="mt-2" /> : distance !== null ? <StatusPill tone={insideGeofence ? 'ok' : 'bad'} label={insideGeofence ? `You are ${distance} m from the school — within the ${geofenceRadius} m zone` : `You are ${distance} m away — move closer than ${geofenceRadius} m`} /> : <Text className="text-sm text-white/68">Get your location to verify you are at the school.</Text>}
          </GlassCard>
          <PrimaryButton label={fix ? 'Refresh location' : 'Get my location'} onPress={() => void locate()} busy={locating} icon="locate" />
          <Field label="Learner count" placeholder="Learner count (optional)" keyboardType="number-pad" value={learnerCount} onChangeText={setLearnerCount} />
          <Field label="Notes" placeholder="Notes (optional)" multiline value={notes} onChangeText={setNotes} />
          <PrimaryButton label="Submit log" onPress={() => void submit()} busy={busy} disabled={!document || !selfie || !insideGeofence} icon="send" />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
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
