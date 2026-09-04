import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { distanceMetres } from '@fazoo/config';
import type { AssignmentToday, BaTodayResult } from '@fazoo/types';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedProfile, readCachedToday, writeCachedToday } from '@/lib/cache';
import { Screen, ScreenHeader, Card, MultilineField, GlassCard } from '@/components/ui';

export default function CheckIn() {
  const [step, setStep] = useState(1);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [stock, setStock] = useState<CapturedPhoto | null>(null);
  const [selfie, setSelfie] = useState<CapturedPhoto | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
  const [assignment, setAssignment] = useState<{ id: string; assignment: AssignmentToday; geofence: number; } | null>(null);

  async function loadAssignment(): Promise<typeof assignment> {
    const { data, error: todayError } = await supabase.rpc('ba_today');
    if (!todayError && data) {
      const today = data as unknown as BaTodayResult;
      await writeCachedToday(today);
      const match = today.assignments.find((item) => item.assignment.id === assignmentParam) ?? today.assignments[0];
      if (!match) return null;
      return { id: match.assignment.id, assignment: match.assignment, geofence: match.assignment.geofence_radius_metres ?? 200 };
    }
    const cached = await readCachedToday();
    const match = cached?.assignments.find((item) => item.assignment.id === assignmentParam) ?? cached?.assignments[0];
    return match ? { id: match.assignment.id, assignment: match.assignment, geofence: match.assignment.geofence_radius_metres ?? 200 } : null;
  }

  useEffect(() => { void loadAssignment().then(setAssignment); }, [assignmentParam]);

  const radius = assignment?.geofence ?? 200;
  const distance = fix && assignment ? Math.round(distanceMetres(fix.latitude, fix.longitude, assignment.assignment.store_latitude ?? 0, assignment.assignment.store_longitude ?? 0)) : null;
  const insideGeofence = distance !== null && distance <= radius;

  async function locate() {
    setError(null);
    setLocating(true);
    try { setFix(await getFix()); } catch (err) { setError(err instanceof Error ? err.message : 'Location failed.'); } finally { setLocating(false); }
  }

  async function snap(slot: 'stock' | 'selfie') {
    try {
      const photo = await capturePhoto(false);
      if (!photo) return;
      if (slot === 'stock') setStock(photo);
      else setSelfie(photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera failed.');
    }
  }

  async function submit() {
    if (!fix || !assignment || !stock || !selfie) return;
    setBusy(true);
    setError(null);
    const requestId = newRequestId();
    try {
      const { data: remoteProfile } = await supabase.from('profiles').select('id, organization_id').single();
      const cachedProfile = remoteProfile ? null : await readCachedProfile();
      const me = remoteProfile ?? cachedProfile;
      if (!me) throw new Error('Your profile could not be loaded. Sign in again and retry.');
      const stockPath = photoPath(me.organization_id, me.id, requestId, 'stock');
      const selfiePath = photoPath(me.organization_id, me.id, requestId, 'selfie');
      const [localStock, localSelfie] = await Promise.all([persistPhoto(stock, requestId, 'stock'), persistPhoto(selfie, requestId, 'selfie')]);
      const payload = {
        p_assignment_id: assignment.id,
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy,
        p_notes: notes.trim() || null,
        p_stock_photo_path: stockPath,
        p_uniform_selfie_path: selfiePath,
        p_client_request_id: requestId,
      };
      await enqueue('checkin', payload, requestId, [
        { localUri: localStock, bucket: 'daily-log-photos', remotePath: stockPath, mimeType: stock.mimeType },
        { localUri: localSelfie, bucket: 'daily-log-photos', remotePath: selfiePath, mimeType: selfie.mimeType },
      ]);
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not complete check-in — it will sync automatically.');
    }
  }

  const stepTitle = ['Store & location', 'Stock on shelf', 'Uniform selfie'][step - 1] ?? 'Check in';

  return (
    <Screen>
      <ScreenHeader eyebrow={`Step ${step} of 3`} title={stepTitle} subtitle="Follow each step to verify location and capture the required evidence." />
      <View className="mb-5 flex-row items-center" accessibilityRole="progressbar">
        {[1, 2, 3].map((n) => <View key={n} className={`mx-1 h-2 flex-1 rounded-full ${n <= step ? 'bg-white' : 'bg-white/14'}`} />)}
      </View>

      {error ? <StatusPill tone="bad" label={error} /> : null}

      {step === 1 ? (
        <>
          <Card>
            <Text className="text-xl font-bold text-ink">{assignment?.assignment.store_name ?? 'Loading…'}</Text>
            <Text className="mt-1 text-sm leading-6 text-slate-600">{assignment?.assignment.store_address}</Text>
            <Text className="mt-4 text-sm font-semibold text-slate-700">Allowed radius: {radius} m</Text>
            {locating ? (
              <ActivityIndicator color="#5B6CFF" className="mt-4" />
            ) : distance !== null ? (
              <StatusPill tone={insideGeofence ? 'ok' : 'bad'} label={insideGeofence ? `You are about ${distance} m from the store — within the ${radius} m zone` : `You are ${distance} m away — move closer than ${radius} m to check in`} />
            ) : (
              <Text className="mt-3 text-sm text-slate-500">Tap “Get my location” so we can verify you are at the store.</Text>
            )}
          </Card>
          <GlassCard className="mb-1 mt-4">
            <Text className="text-sm leading-6 text-white/72">Distance is shown for guidance only. The server rechecks the geofence before your attendance is accepted.</Text>
          </GlassCard>
          <PrimaryButton label={fix ? 'Refresh location' : 'Get my location'} onPress={() => void locate()} busy={locating} icon="locate" />
          <PrimaryButton label="Continue" disabled={!insideGeofence} onPress={() => setStep(2)} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Card>
            <Text className="text-base leading-6 text-slate-600">Take a clear photo of the Lenovo product or stock evidence for this visit.</Text>
            <CaptureBox photo={stock} onSnap={() => void snap('stock')} hint="Tap to take the product photo" />
          </Card>
          <PrimaryButton label="Retake" variant="ghost" disabled={!stock} onPress={() => void snap('stock')} />
          <PrimaryButton label="Continue" disabled={!stock} onPress={() => setStep(3)} />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Card>
            <Text className="text-base leading-6 text-slate-600">Take a clear selfie of yourself for this Lenovo visit.</Text>
            <CaptureBox photo={selfie} onSnap={() => void snap('selfie')} hint="Tap to take your selfie" />
          </Card>
          <MultilineField label="Notes" placeholder="Optional notes for your supervisor" value={notes} onChangeText={setNotes} />
          <PrimaryButton label="Check In" onPress={() => void submit()} busy={busy} disabled={!selfie} icon="checkmark-circle" />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(2)} />
        </>
      ) : null}
    </Screen>
  );
}

function CaptureBox({ photo, onSnap, hint }: { photo: CapturedPhoto | null; onSnap: () => void; hint: string; }) {
  return (
    <PrimaryButton onPress={onSnap} label="" accessibilityLabel={hint}>
      {photo ? <Image source={{ uri: photo.uri }} className="h-full w-full rounded-2xl" resizeMode="cover" /> : <View className="min-h-48 w-full items-center justify-center rounded-2xl border border-dashed border-white/25 bg-white/6"><Text className="font-semibold text-white">{hint}</Text></View>}
    </PrimaryButton>
  );
}
