import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { distanceMetres } from '@fazoo/config';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { readCachedProfile } from '@/lib/cache';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';

/**
 * VEDA new log flow — 2-step photo capture:
 *   1. School list document photo
 *   2. Selfie
 * Uses the existing veda_checkin RPC with GPS for submission.
 */
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

  const params = useLocalSearchParams<{
    assignmentId?: string;
    schoolId?: string;
    schoolName?: string;
  }>();

  const [geofenceRadius, setGeofenceRadius] = useState(200);
  const [schoolCoords, setSchoolCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    async function loadSchool() {
      if (!params.schoolId) return;
      const { data } = await supabase
        .from('veda_schools')
        .select('latitude, longitude, geofence_radius_metres')
        .eq('id', params.schoolId)
        .single();
      if (data) {
        setSchoolCoords(
          data.latitude && data.longitude
            ? { latitude: data.latitude, longitude: data.longitude }
            : null,
        );
        setGeofenceRadius(data.geofence_radius_metres ?? 200);
      }
    }
    void loadSchool();
  }, [params.schoolId]);

  const distance =
    fix && schoolCoords
      ? Math.round(distanceMetres(fix.latitude, fix.longitude, schoolCoords.latitude, schoolCoords.longitude))
      : null;
  const insideGeofence = distance !== null && distance <= geofenceRadius;

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
    if (!fix || !document || !selfie || !params.assignmentId) return;
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
        p_assignment_id: params.assignmentId,
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

      router.push({
        pathname: '/campaign-logs',
        params: {
          kind: 'schools',
          assignmentId: params.assignmentId,
          schoolId: params.schoolId,
          schoolName: params.schoolName,
        },
      });
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not submit log — it will sync automatically.',
      );
    }
  }

  const stepTitle = step === 1 ? 'School list document' : 'Your selfie';

  return (
    <View className="flex-1 bg-lavender px-6 pt-14">
      {/* Progress */}
      <View className="flex-row items-center mb-2" accessibilityRole="progressbar">
        {[1, 2].map((n) => (
          <View
            key={n}
            className={`h-2 flex-1 rounded-full mx-1 ${n <= step ? 'bg-primary' : 'bg-ink/10'}`}
          />
        ))}
      </View>
      <Text className="text-xs text-muted">Step {step} of 2</Text>
      <Text className="text-2xl font-bold text-ink mb-1">{stepTitle}</Text>
      <Text className="text-sm text-charcoal mb-4">{params.schoolName}</Text>

      {error ? <StatusPill tone="bad" label={error} /> : null}

      {/* Step 1: School list document */}
      {step === 1 && (
        <View>
          <Text className="text-charcoal mb-3">
            Photograph the school list document.
          </Text>
          <CaptureBox
            photo={document}
            onSnap={() => void snap('document')}
            hint="Tap to photograph the school list"
          />
          <PrimaryButton
            label="Retake"
            variant="ghost"
            disabled={!document}
            onPress={() => void snap('document')}
          />
          <PrimaryButton
            label="Continue"
            disabled={!document}
            onPress={() => setStep(2)}
          />
        </View>
      )}

      {/* Step 2: Selfie */}
      {step === 2 && (
        <View>
          <Text className="text-charcoal mb-3">
            Take a selfie showing you are at the school.
          </Text>
          <CaptureBox
            photo={selfie}
            onSnap={() => void snap('selfie')}
            hint="Tap to take your selfie"
          />
          <PrimaryButton
            label="Retake"
            variant="ghost"
            disabled={!selfie}
            onPress={() => void snap('selfie')}
          />

          {/* Location section */}
          <View className="mt-4 rounded-2xl bg-white p-4">
            <Text className="font-semibold text-charcoal mb-2">Location verification</Text>
            {locating ? (
              <ActivityIndicator color="#7B2FBE" className="mt-2" />
            ) : distance !== null ? (
              <StatusPill
                tone={insideGeofence ? 'ok' : 'bad'}
                label={
                  insideGeofence
                    ? `You are ${distance} m from the school — within the ${geofenceRadius} m zone`
                    : `You are ${distance} m away — move closer than ${geofenceRadius} m`
                }
              />
            ) : (
              <Text className="text-sm text-muted">
                Get your location to verify you are at the school.
              </Text>
            )}
          </View>
          <PrimaryButton
            label={fix ? 'Refresh location' : 'Get my location'}
            onPress={() => void locate()}
            busy={locating}
          />

          <TextInput
            placeholder="Learner count (optional)"
            placeholderTextColor="#9a94a5"
            keyboardType="number-pad"
            className="rounded-xl bg-white p-4 mb-3 mt-3"
            value={learnerCount}
            onChangeText={setLearnerCount}
          />
          <TextInput
            placeholder="Notes (optional)"
            placeholderTextColor="#9a94a5"
            multiline
            className="rounded-xl bg-white p-4 min-h-16 mb-3"
            value={notes}
            onChangeText={setNotes}
          />

          <PrimaryButton
            label="Submit Log"
            onPress={() => void submit()}
            busy={busy}
            disabled={!selfie || !insideGeofence}
          />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
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
