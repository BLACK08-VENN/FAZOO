import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { distanceMetres } from '@fazoo/config';
import type { AssignmentToday, BaTodayResult, StockSnapshotToday } from '@fazoo/types';
import { stockCountEntrySchema } from '@fazoo/validation';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId, type QueuedAttachment } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedProfile, readCachedToday, writeCachedToday } from '@/lib/cache';
import { Page, ScreenHeader, Card, Field, MultilineField, GlassCard, EmptyState } from '@/components/ui';

export default function CheckIn() {
  const [step, setStep] = useState(1);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [stock, setStock] = useState<CapturedPhoto | null>(null);
  const [selfie, setSelfie] = useState<CapturedPhoto | null>(null);
  const [notes, setNotes] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
  const [assignment, setAssignment] = useState<{ id: string; assignment: AssignmentToday; geofence: number; counting: boolean; skus: StockSnapshotToday[]; } | null>(null);

  async function loadAssignment(): Promise<typeof assignment> {
    const { data, error: todayError } = await supabase.rpc('ba_today');
    if (!todayError && data) {
      const today = data as unknown as BaTodayResult;
      await writeCachedToday(today);
      const match = today.assignments.find((item) => item.assignment.id === assignmentParam) ?? today.assignments[0];
      if (!match) return null;
      return { id: match.assignment.id, assignment: match.assignment, geofence: match.assignment.geofence_radius_metres ?? 200, counting: match.counting ?? false, skus: match.stock ?? [] };
    }
    const cached = await readCachedToday();
    const match = cached?.assignments.find((item) => item.assignment.id === assignmentParam) ?? cached?.assignments[0];
    return match ? { id: match.assignment.id, assignment: match.assignment, geofence: match.assignment.geofence_radius_metres ?? 200, counting: match.counting ?? false, skus: match.stock ?? [] } : null;
  }

  useEffect(() => { void loadAssignment().then(setAssignment); }, [assignmentParam]);

  const counting = assignment?.counting ?? false;
  const skus = assignment?.skus ?? [];
  const radius = assignment?.geofence ?? 200;
  const countsComplete = counting && skus.length > 0 && skus.every((s) => counts[s.sku_id] != null && counts[s.sku_id] !== '');
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
    if (!fix || !assignment || !selfie) return;
    if (!counting && !stock) return;
    if (counting && !countsComplete) return;
    setBusy(true);
    setError(null);
    const requestId = newRequestId();
    try {
      const { data: remoteProfile } = await supabase.from('profiles').select('id, organization_id').single();
      const cachedProfile = remoteProfile ? null : await readCachedProfile();
      const me = remoteProfile ?? cachedProfile;
      if (!me) throw new Error('Your profile could not be loaded. Sign in again and retry.');
      const selfiePath = photoPath(me.organization_id, me.id, requestId, 'selfie');
      const localSelfie = await persistPhoto(selfie, requestId, 'selfie');
      const uploads: QueuedAttachment[] = [{ localUri: localSelfie, bucket: 'daily-log-photos', remotePath: selfiePath, mimeType: selfie.mimeType }];
      let stockPath: string | null = null;
      if (!counting && stock) {
        stockPath = photoPath(me.organization_id, me.id, requestId, 'stock');
        const localStock = await persistPhoto(stock, requestId, 'stock');
        uploads.unshift({ localUri: localStock, bucket: 'daily-log-photos', remotePath: stockPath, mimeType: stock.mimeType });
      }
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
      await enqueue('checkin', payload, requestId, uploads);
      if (counting) {
        for (const s of skus) {
          const entry = { sku_id: s.sku_id, count_type: 'opening' as const, quantity: Number(counts[s.sku_id]) };
          const parsed = stockCountEntrySchema.safeParse(entry);
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the opening counts.');
          const countRequestId = newRequestId();
          await enqueue('record_stock_snapshot', {
            p_sku_id: entry.sku_id,
            p_count_type: 'opening',
            p_quantity: entry.quantity,
            p_client_request_id: countRequestId,
            p_daily_log_id: null,
          }, countRequestId);
        }
      }
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not complete check-in — it will sync automatically.');
    }
  }

  const stepTitles = counting ? ['Store & location', 'Uniform selfie', 'Opening stock counts'] : ['Store & location', 'Stock on shelf', 'Uniform selfie'];
  const stepTitle = stepTitles[step - 1] ?? 'Check in';

  return (
    <Page>
      <ScreenHeader eyebrow={`Step ${step} of ${stepTitles.length}`} title={stepTitle} subtitle="Follow each step to verify location and capture the required evidence." onBack={() => router.back()} />
      <View className="mb-5 flex-row items-center" accessibilityRole="progressbar">
        {stepTitles.map((_, n) => <View key={n} className={`mx-1 h-2 flex-1 rounded-full ${n < step ? 'bg-primary' : 'bg-ink/10'}`} />)}
      </View>

      {error ? <StatusPill tone="bad" label={error} /> : null}

      {step === 1 ? (
        <>
          <Card>
            <Text className="font-sans text-xl font-bold text-ink">{assignment?.assignment.store_name ?? 'Loading…'}</Text>
            <Text className="font-sans mt-1 text-sm leading-6 text-muted">{assignment?.assignment.store_address}</Text>
            <Text className="font-sans mt-4 text-sm font-semibold text-charcoal">Allowed radius: {radius} m</Text>
            {locating ? (
              <ActivityIndicator color="#7B2FBE" className="mt-4" />
            ) : distance !== null ? (
              <StatusPill tone={insideGeofence ? 'ok' : 'bad'} label={insideGeofence ? `You are about ${distance} m from the store — within the ${radius} m zone` : `You are ${distance} m away — move closer than ${radius} m to check in`} />
            ) : (
              <Text className="font-sans mt-3 text-sm text-muted">Tap “Get my location” so we can verify you are at the store.</Text>
            )}
          </Card>
          <GlassCard className="mb-1 mt-4">
            <Text className="font-sans text-sm leading-6 text-muted">Distance is shown for guidance only. The server rechecks the geofence before your attendance is accepted.</Text>
          </GlassCard>
          <PrimaryButton label={fix ? 'Refresh location' : 'Get my location'} onPress={() => void locate()} busy={locating} icon="locate" />
          <PrimaryButton label="Continue" disabled={!insideGeofence} onPress={() => setStep(2)} />
        </>
      ) : null}

      {step === 2 && !counting ? (
        <>
          <Card>
            <Text className="font-sans text-base leading-6 text-muted">Take a clear photo of the Lenovo product or stock evidence for this visit.</Text>
            <CaptureBox photo={stock} onSnap={() => void snap('stock')} hint="Tap to take the product photo" />
          </Card>
          <PrimaryButton label="Retake" variant="ghost" disabled={!stock} onPress={() => void snap('stock')} />
          <PrimaryButton label="Continue" disabled={!stock} onPress={() => setStep(3)} />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 2 && counting ? (
        <>
          <Card>
            <Text className="font-sans text-base leading-6 text-muted">Take a clear selfie of yourself for this check-in. It is only allowed while you are inside the store geofence.</Text>
            <CaptureBox photo={selfie} onSnap={() => void snap('selfie')} hint="Tap to take your selfie" />
          </Card>
          <MultilineField label="Notes" placeholder="Optional notes for your supervisor" value={notes} onChangeText={setNotes} />
          <PrimaryButton label="Continue" disabled={!selfie} onPress={() => setStep(3)} />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 3 && !counting ? (
        <>
          <Card>
            <Text className="font-sans text-base leading-6 text-muted">Take a clear selfie of yourself for this Lenovo visit.</Text>
            <CaptureBox photo={selfie} onSnap={() => void snap('selfie')} hint="Tap to take your selfie" />
          </Card>
          <MultilineField label="Notes" placeholder="Optional notes for your supervisor" value={notes} onChangeText={setNotes} />
          <PrimaryButton label="Check In" onPress={() => void submit()} busy={busy} disabled={!selfie} icon="checkmark-circle" />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(2)} />
        </>
      ) : null}

      {step === 3 && counting ? (
        <>
          {skus.length === 0 ? (
            <>
              <EmptyState title="No SKUs to count" body="This campaign has no active SKUs yet — the check-in will still record your arrival and selfie." />
              <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(2)} />
            </>
          ) : (
            <>
              <Card className="mb-4">
                <View className="mb-2 rounded-xl bg-lavender px-4 py-3">
                  <Text className="font-sans text-sm leading-5 text-charcoal">Count what is on the shelf as the day begins. The closing count you record at checkout is subtracted from this to show units sold.</Text>
                </View>
                {skus.map((s) => (
                  <View key={s.sku_id} className="mb-4">
                    <Text className="font-sans text-base font-semibold text-ink">{s.sku_name}</Text>
                    <Text className="font-sans mb-2 text-sm text-muted">{s.sku_code}</Text>
                    <Field
                      label="Stock on shelf"
                      keyboardType="number-pad"
                      value={counts[s.sku_id] ?? ''}
                      onChangeText={(v) => setCounts((prev) => ({ ...prev, [s.sku_id]: v.replace(/[^0-9]/g, '') }))}
                      placeholder="0"
                    />
                  </View>
                ))}
              </Card>
              <PrimaryButton
                label="Complete check-in"
                onPress={() => void submit()}
                busy={busy}
                disabled={!countsComplete}
                icon="checkmark-circle"
              />
              <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(2)} />
            </>
          )}
        </>
      ) : null}
    </Page>
  );
}

function CaptureBox({ photo, onSnap, hint }: { photo: CapturedPhoto | null; onSnap: () => void; hint: string; }) {
  return (
    <PrimaryButton onPress={onSnap} label="" accessibilityLabel={hint}>
      {photo ? <Image source={{ uri: photo.uri }} className="h-full w-full rounded-2xl" resizeMode="cover" /> : <View className="min-h-48 w-full items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-lavender"><Text className="font-sans font-semibold text-ink">{hint}</Text></View>}
    </PrimaryButton>
  );
}
