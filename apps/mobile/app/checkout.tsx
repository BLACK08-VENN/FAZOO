import { useEffect, useState } from 'react';
import { Image, ScrollView, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { BaTodayResult } from '@fazoo/types';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedProfile } from '@/lib/cache';

/**
 * Guided completion flow: the log can only be closed after the BA captures
 * a fresh stock-on-shelf photo and a uniform selfie. These are uploaded
 * (or queued for offline sync) together with the checkout RPC call.
 */
export default function Checkout() {
  const [today, setToday] = useState<BaTodayResult | null>(null);
  const [step, setStep] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [stock, setStock] = useState<CapturedPhoto | null>(null);
  const [selfie, setSelfie] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!today) {
        const { data } = await supabase.rpc('ba_today');
        setToday((data as unknown as BaTodayResult) ?? null);
      }
    })();
  }, [today]);

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
    if (!stock || !selfie) return;
    setBusy(true);
    setError(null);

    const requestId = newRequestId();
    try {
      const fix: Fix = await getFix();
      const { data: remoteProfile } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .single();
      const cachedProfile = remoteProfile ? null : await readCachedProfile();
      const me = remoteProfile ?? cachedProfile;
      if (!me) throw new Error('Your profile could not be loaded. Sign in again and retry.');
      const stockPath = photoPath(me.organization_id, me.id, requestId, 'stock');
      const selfiePath = photoPath(me.organization_id, me.id, requestId, 'selfie');
      const [localStock, localSelfie] = await Promise.all([
        persistPhoto(stock, requestId, 'stock'),
        persistPhoto(selfie, requestId, 'selfie'),
      ]);
      const payload = {
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy ?? undefined,
        p_stock_photo_path: stockPath,
        p_uniform_selfie_path: selfiePath,
        p_client_request_id: requestId,
      };
      try {
        const { error: rpcError } = await supabase.rpc('ba_checkout', payload);
        if (rpcError) throw new Error(rpcError.message);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        // A geofence rejection is authoritative and must be retried while at
        // the store, so surface it immediately instead of queuing offline.
        if (/(geofence|m or less\.?$)/i.test(message)) throw err;
        await enqueue('checkout', payload, requestId, [
          {
            localUri: localStock,
            bucket: 'daily-log-photos',
            remotePath: stockPath,
            mimeType: stock.mimeType,
          },
          {
            localUri: localSelfie,
            bucket: 'daily-log-photos',
            remotePath: selfiePath,
            mimeType: selfie.mimeType,
          },
        ]);
      }
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed — try again.');
    } finally {
      setBusy(false);
    }
  }

  const stepTitle = ['Summary & lock', 'Stock on shelf', 'Uniform selfie'][step - 1];

  return (
    <ScrollView className="flex-1 bg-lavender" contentContainerClassName="px-5 py-8">
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

      {step === 1 && (
        <View>
          <View className="rounded-2xl bg-white p-5">
            <Text className="text-4xl font-bold tabular-nums text-primary">
              {today?.total_units_today ?? 0}
              <Text className="text-base font-normal text-muted"> units today</Text>
            </Text>
            {(today?.sales ?? []).map((s) => (
              <View key={s.id} className="flex-row justify-between py-1 mt-1">
                <Text className="text-charcoal">{s.sku_name}</Text>
                <Text className="tabular-nums">×{s.quantity}</Text>
              </View>
            ))}
            {(today?.sales ?? []).length === 0 ? (
              <Text className="text-muted mt-2">No sales were recorded.</Text>
            ) : null}
          </View>

          <View className="mt-4 flex-row items-center justify-between rounded-xl bg-white px-4 py-3">
            <Text className="text-charcoal flex-1 pr-3">
              I understand today&apos;s sales become read-only after checkout.
            </Text>
            <Switch
              value={confirmed}
              onValueChange={setConfirmed}
              accessibilityLabel="Confirm checkout lock"
            />
          </View>

          <PrimaryButton label="Continue" disabled={!confirmed} onPress={() => setStep(2)} />
          <PrimaryButton label="Not yet" variant="ghost" onPress={() => router.back()} />
        </View>
      )}

      {step === 2 && (
        <View>
          <Text className="text-charcoal mb-3">
            Take a clear photo of the Lenovo stock currently on the shelf.
          </Text>
          <CaptureBox
            photo={stock}
            onSnap={() => void snap('stock')}
            hint="Tap to take a stock photo"
          />
          <PrimaryButton
            label="Retake"
            variant="ghost"
            disabled={!stock}
            onPress={() => void snap('stock')}
          />
          <PrimaryButton label="Continue" disabled={!stock} onPress={() => setStep(3)} />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
        </View>
      )}

      {step === 3 && (
        <View>
          <Text className="text-charcoal mb-3">
            Take a clear selfie of yourself wearing your Lenovo uniform.
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
          <PrimaryButton
            label="Check Out"
            onPress={() => void submit()}
            busy={busy}
            disabled={!selfie}
          />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(2)} />
        </View>
      )}
    </ScrollView>
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
