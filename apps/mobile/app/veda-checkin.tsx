import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { distanceMetres } from '@fazoo/config';
import type { VedaTodayResult } from '@fazoo/types';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedProfile, readCachedVedaToday, writeCachedVedaToday } from '@/lib/cache';

/**
 * Guided 3-step Veda activation check-in:
 *   1. School + GPS geofence verification (distance computed locally for UX;
 *      recomputed server-side in veda_checkin — that result is authoritative)
 *   2. Site selfie proving you are at the school
 *   3. Photo of the stamped document + learner count
 * The visit only opens in veda_sessions after all steps succeed.
 */
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

  async function loadVisit(): Promise<VedaTodayResult['assignment']> {
    const { data, error: todayError } = await supabase.rpc('veda_today');
    if (!todayError && data) {
      const today = data as unknown as VedaTodayResult;
      await writeCachedVedaToday(today);
      return today.assignment;
    }
    return (await readCachedVedaToday())?.assignment ?? null;
  }
  const [assignment, setAssignment] =
    useState<Awaited<ReturnType<typeof loadVisit>>>(null);

  useEffect(() => {
    void loadVisit().then(setAssignment);
  }, []);

  const radius = assignment?.geofence_radius_metres ?? 200;
  const distance =
    fix && assignment && assignment.school_latitude && assignment.school_longitude
      ? Math.round(
          distanceMetres(
            fix.latitude,
            fix.longitude,
            assignment.school_latitude,
            assignment.school_longitude,
          ),
        )
      : null;
  const insideGeofence = distance !== null && distance <= radius;

  async function locate() {
    setError(null);
    setLocating(true);
    try {
      setFix(await getFix());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Location failed.');
    } finally {
      setLocating(false);
    }
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
      const { data: remoteProfile } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .single();
      const cachedProfile = remoteProfile ? null : await readCachedProfile();
      const me = remoteProfile ?? cachedProfile;
      if (!me) throw new Error('Your profile could not be loaded. Sign in again and retry.');
      const selfiePath = photoPath(me.organization_id, me.id, requestId, 'selfie');
      const documentPath = photoPath(me.organization_id, me.id, requestId, 'stamped-doc');
      const [localSelfie, localDocument] = await Promise.all([
        persistPhoto(selfie, requestId, 'selfie'),
        persistPhoto(document, requestId, 'stamped-doc'),
      ]);
      const payload = {
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy,
        p_selfie_photo_path: selfiePath,
        p_stamped_document_path: documentPath,
        p_learner_count: Math.max(0, Number(learnerCount) || 0),
        p_notes: notes.trim() || null,
        p_client_request_id: requestId,
      };
      await enqueue('veda_checkin', payload, requestId, [
        {
          localUri: localSelfie,
          bucket: 'daily-log-photos',
          remotePath: selfiePath,
          mimeType: selfie.mimeType,
        },
        {
          localUri: localDocument,
          bucket: 'daily-log-photos',
          remotePath: documentPath,
          mimeType: document.mimeType,
        },
      ]);
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not check in — it will sync automatically.',
      );
    }
  }

  const stepTitle = ['School & location', 'Site selfie', 'Stamped document'][step - 1];

  return (
    <View className="flex-1 bg-lavender px-6 pt-14">
      {/* Progress */}
      <View className="flex-row items-center mb-2" accessibilityRole="progressbar">
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            className={`h-2 flex-1 rounded-full mx-1 ${n <= step ? 'bg-primary' : 'bg-ink/10'}`}
          />
        ))}
      </View>
      <Text className="text-xs text-muted">Step {step} of 3</Text>
      <Text className="text-2xl font-bold text-ink mb-4">{stepTitle}</Text>

      {error ? <StatusPill tone="bad" label={error} /> : null}

      {/* Step 1 */}
      {step === 1 && (
        <View>
          <View className="rounded-2xl bg-white p-5">
            <Text className="font-semibold text-charcoal">
              {assignment?.school_name ?? 'Loading…'}
            </Text>
            <Text className="text-muted">{assignment?.school_region}</Text>
            <Text className="mt-3 text-sm text-charcoal">Allowed radius: {radius} m</Text>
            {locating ? (
              <ActivityIndicator color="#7B2FBE" className="mt-4" />
            ) : distance !== null ? (
              <StatusPill
                tone={insideGeofence ? 'ok' : 'bad'}
                label={
                  insideGeofence
                    ? `You are about ${distance} m from the school — within the ${radius} m zone`
                    : `You are ${distance} m away — move closer than ${radius} m to check in`
                }
              />
            ) : (
              <Text className="mt-3 text-sm text-muted">
                Tap “Get my location” so we can verify you are at the school.
              </Text>
            )}
          </View>

          <PrimaryButton
            label={fix ? 'Refresh location' : 'Get my location'}
            onPress={() => void locate()}
            busy={locating}
          />
          <PrimaryButton
            label="Continue"
            disabled={!insideGeofence}
            onPress={() => setStep(2)}
          />
        </View>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <View>
          <Text className="text-charcoal mb-3">
            Take a selfie showing you are at the school (school signage in frame).
          </Text>
          <CaptureBox
            photo={selfie}
            onSnap={() => void snap('selfie')}
            hint="Tap to take your site selfie"
          />
          <PrimaryButton
            label="Retake"
            variant="ghost"
            disabled={!selfie}
            onPress={() => void snap('selfie')}
          />
          <PrimaryButton label="Continue" disabled={!selfie} onPress={() => setStep(3)} />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
        </View>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <View>
          <Text className="text-charcoal mb-3">
            Photograph the stamped confirmation document and enter the learner count.
          </Text>
          <CaptureBox
            photo={document}
            onSnap={() => void snap('document')}
            hint="Tap to photograph the stamped document"
          />
          <TextInput
            placeholder="Learner count"
            placeholderTextColor="#9a94a5"
            keyboardType="number-pad"
            className="rounded-xl bg-white p-4 mb-3"
            value={learnerCount}
            onChangeText={setLearnerCount}
          />
          <TextInput
            placeholder="Notes (optional)"
            placeholderTextColor="#9a94a5"
            multiline
            className="rounded-xl bg-white p-4 min-h-20 mb-3"
            value={notes}
            onChangeText={setNotes}
          />
          <PrimaryButton
            label="Check In"
            onPress={() => void submit()}
            busy={busy}
            disabled={!document}
          />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(2)} />
        </View>
      )}
    </View>
  );
}

function CaptureBox({
  photo,
  onSnap,
  hint,
}: {
  photo: CapturedPhoto | null;
  onSnap: () => void;
  hint: string;
}) {
  return (
    <PrimaryButton onPress={onSnap} label="" accessibilityLabel={hint}>
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          className="h-full w-full rounded-xl"
          resizeMode="cover"
        />
      ) : (
        <Text className="text-white font-semibold">{hint}</Text>
      )}
    </PrimaryButton>
  );
}