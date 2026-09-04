import { useEffect, useState } from 'react';
import { Image, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { BaTodayResult } from '@fazoo/types';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedProfile, readCachedToday } from '@/lib/cache';
import { Screen, ScreenHeader, Card, GlassCard } from '@/components/ui';

export default function Checkout() {
  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
  const [selected, setSelected] = useState<BaTodayResult['assignments'][number] | null>(null);
  const [step, setStep] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [stock, setStock] = useState<CapturedPhoto | null>(null);
  const [selfie, setSelfie] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (selected) return;
      const { data } = await supabase.rpc('ba_today');
      const today = (data as unknown as BaTodayResult | null) ?? (await readCachedToday());
      const match = today?.assignments.find((item) => item.assignment.id === assignmentParam) ?? today?.assignments[0];
      if (active) setSelected(match ?? null);
    })();
    return () => { active = false; };
  }, [assignmentParam, selected]);

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
    if (!stock || !selfie || !selected) return;
    setBusy(true);
    setError(null);
    const requestId = newRequestId();
    try {
      const fix: Fix = await getFix();
      const { data: remoteProfile } = await supabase.from('profiles').select('id, organization_id').single();
      const cachedProfile = remoteProfile ? null : await readCachedProfile();
      const me = remoteProfile ?? cachedProfile;
      if (!me) throw new Error('Your profile could not be loaded. Sign in again and retry.');
      const stockPath = photoPath(me.organization_id, me.id, requestId, 'stock');
      const selfiePath = photoPath(me.organization_id, me.id, requestId, 'selfie');
      const [localStock, localSelfie] = await Promise.all([persistPhoto(stock, requestId, 'stock'), persistPhoto(selfie, requestId, 'selfie')]);
      const payload = {
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy ?? undefined,
        p_daily_log_id: selected.log?.id,
        p_stock_photo_path: stockPath,
        p_uniform_selfie_path: selfiePath,
        p_client_request_id: requestId,
      };
      try {
        const { error: rpcError } = await supabase.rpc('ba_checkout', payload);
        if (rpcError) throw new Error(rpcError.message);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (/(geofence|m or less\.?$)/i.test(message)) throw err;
        await enqueue('checkout', payload, requestId, [
          { localUri: localStock, bucket: 'daily-log-photos', remotePath: stockPath, mimeType: stock.mimeType },
          { localUri: localSelfie, bucket: 'daily-log-photos', remotePath: selfiePath, mimeType: selfie.mimeType },
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

  const stepTitle = ['Summary & lock', 'Stock on shelf', 'Uniform selfie'][step - 1] ?? 'Checkout';

  return (
    <Screen>
      <ScreenHeader eyebrow={`Step ${step} of 3`} title={stepTitle} subtitle="Review totals, capture fresh evidence, and lock the day." />
      <View className="mb-5 flex-row items-center" accessibilityRole="progressbar">
        {[1, 2, 3].map((n) => <View key={n} className={`mx-1 h-2 flex-1 rounded-full ${n <= step ? 'bg-white' : 'bg-white/14'}`} />)}
      </View>

      {error ? <StatusPill tone="bad" label={error} /> : null}

      {step === 1 ? (
        <>
          {selected ? <Text className="mb-3 text-sm text-white/70">{selected.assignment.store_name || selected.assignment.campaign_name}{selected.assignment.campaign_name ? ` · ${selected.assignment.campaign_name}` : ''}</Text> : null}
          <Card>
            <Text className="text-4xl font-bold text-indigo-700">{selected?.total_units_today ?? 0}<Text className="text-base font-normal text-slate-500"> units today</Text></Text>
            {(selected?.sales ?? []).map((s) => (
              <View key={s.id} className="mt-2 flex-row justify-between">
                <Text className="text-slate-700">{s.sku_name}</Text>
                <Text className="tabular-nums text-slate-700">×{s.quantity}</Text>
              </View>
            ))}
            {(selected?.sales ?? []).length === 0 ? <Text className="mt-2 text-slate-500">No sales were recorded.</Text> : null}
          </Card>
          <GlassCard className="mt-4">
            <View className="flex-row items-center justify-between gap-4">
              <Text className="flex-1 text-sm leading-6 text-white/80">I understand today's sales become read-only after checkout.</Text>
              <Switch value={confirmed} onValueChange={setConfirmed} accessibilityLabel="Confirm checkout lock" />
            </View>
          </GlassCard>
          <PrimaryButton label="Continue" disabled={!confirmed} onPress={() => setStep(2)} />
          <PrimaryButton label="Not yet" variant="ghost" onPress={() => router.back()} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Card>
            <Text className="text-base leading-6 text-slate-600">Take a clear photo of the Lenovo product or stock evidence for this completed visit.</Text>
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
            <Text className="text-base leading-6 text-slate-600">Take a clear selfie of yourself for this Lenovo checkout.</Text>
            <CaptureBox photo={selfie} onSnap={() => void snap('selfie')} hint="Tap to take your selfie" />
          </Card>
          <PrimaryButton label="Retake" variant="ghost" disabled={!selfie} onPress={() => void snap('selfie')} />
          <PrimaryButton label="Check Out" onPress={() => void submit()} busy={busy} disabled={!selfie} icon="log-out" />
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
