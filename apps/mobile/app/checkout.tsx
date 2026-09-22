import { useEffect, useState } from 'react';
import { Image, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { BaTodayResult } from '@fazoo/types';
import { stockCountEntrySchema } from '@fazoo/validation';
import { getFix, type Fix } from '@/lib/location';
import { capturePhoto, persistPhoto, photoPath, type CapturedPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId, type QueuedAttachment } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedProfile, readCachedToday } from '@/lib/cache';
import { Page, ScreenHeader, Card, Field, GlassCard, EmptyState } from '@/components/ui';

export default function Checkout() {
  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
  const [selected, setSelected] = useState<BaTodayResult['assignments'][number] | null>(null);
  const [step, setStep] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [closing, setClosing] = useState<Record<string, string>>({});
  const [closingSaved, setClosingSaved] = useState(false);
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
      if (active) {
        setSelected(match ?? null);
        if (match?.counting) {
          const initial: Record<string, string> = {};
          for (const row of match.stock ?? []) {
            if (row.closing != null) initial[row.sku_id] = String(row.closing);
          }
          setClosing(initial);
        }
      }
    })();
    return () => { active = false; };
  }, [assignmentParam, selected]);

  const counting = selected?.counting ?? false;
  const steps = counting ? ['Review & confirm', 'Closing stock counts'] : ['Summary & lock', 'Stock on shelf', 'Uniform selfie'];
  const skus = selected?.stock ?? [];
  const countsComplete = counting && skus.length > 0 && skus.every((s) => closing[s.sku_id] != null && closing[s.sku_id] !== '');

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

  function setClosingFor(skuId: string, value: string) {
    setClosing((prev) => ({ ...prev, [skuId]: value.replace(/[^0-9]/g, '') }));
    setClosingSaved(false);
  }

  async function submit() {
    if (!selfie || !selected) return;
    if (!counting && !stock) return;
    if (counting && !countsComplete) {
      setError('Enter a closing count for every SKU before checking out.');
      return;
    }
    setBusy(true);
    setError(null);
    const requestId = newRequestId();
    try {
      if (counting && !closingSaved) {
        for (const s of skus) {
          const entry = { sku_id: s.sku_id, count_type: 'closing' as const, quantity: Number(closing[s.sku_id] ?? '') };
          const parsed = stockCountEntrySchema.safeParse(entry);
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the closing counts.');
          const countRequestId = newRequestId();
          await enqueue('record_stock_snapshot', {
            p_sku_id: entry.sku_id,
            p_count_type: 'closing',
            p_quantity: entry.quantity,
            p_client_request_id: countRequestId,
            p_daily_log_id: selected.log?.id,
          }, countRequestId);
        }
        setClosingSaved(true);
      }

      const fix: Fix = await getFix();
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
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy ?? undefined,
        p_daily_log_id: selected.log?.id,
        p_stock_photo_path: stockPath ?? undefined,
        p_uniform_selfie_path: selfiePath,
        p_client_request_id: requestId,
      };
      try {
        const { error: rpcError } = await supabase.rpc('ba_checkout', payload);
        if (rpcError) throw new Error(rpcError.message);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (/(geofence|m or less\.?$)/i.test(message)) throw err;
        await enqueue('checkout', payload, requestId, uploads);
      }
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed — try again.');
    } finally {
      setBusy(false);
    }
  }

  const stepTitle = steps[step - 1] ?? 'Checkout';

  return (
    <Page>
      <ScreenHeader eyebrow={`Step ${step} of ${steps.length}`} title={stepTitle} subtitle={counting ? 'Review stock, count the shelf again, capture evidence, and lock the day.' : 'Review totals, capture fresh evidence, and lock the day.'} onBack={() => router.back()} />
      <View className="mb-5 flex-row items-center" accessibilityRole="progressbar">
        {steps.map((_, n) => <View key={n} className={`mx-1 h-2 flex-1 rounded-full ${n < step ? 'bg-primary' : 'bg-ink/10'}`} />)}
      </View>

      {error ? <StatusPill tone="bad" label={error} /> : null}

      {step === 1 ? (
        <>
          {selected ? <Text className="font-sans mb-3 text-sm text-muted">{selected.assignment.store_name || selected.assignment.campaign_name}{selected.assignment.campaign_name ? ` · ${selected.assignment.campaign_name}` : ''}</Text> : null}
          <Card>
            <Text className="font-sans text-4xl font-bold text-primaryText">{counting ? (selected?.diff_total ?? 0) : (selected?.total_units_today ?? 0)}<Text className="font-sans text-base font-normal text-muted"> units sold today</Text></Text>
            {counting ? (
              (selected?.stock ?? []).map((s) => (
                <View key={s.sku_id} className="mt-2 flex-row justify-between">
                  <Text className="font-sans flex-1 text-ink/70">{s.sku_name}</Text>
                  <Text className="font-sans tabular-nums text-ink/70">opening {s.opening ?? '–'} · closing {s.closing ?? '–'} · {s.diff != null ? `${s.diff} sold` : 'pending'}</Text>
                </View>
              ))
            ) : (
              (selected?.sales ?? []).map((s) => (
                <View key={s.id} className="mt-2 flex-row justify-between">
                  <Text className="font-sans text-ink/70">{s.sku_name}</Text>
                  <Text className="font-sans tabular-nums text-ink/70">×{s.quantity}</Text>
                </View>
              ))
            )}
            {(counting ? (selected?.stock ?? []).length : (selected?.sales ?? []).length) === 0 ? <Text className="font-sans mt-2 text-muted">No activity was recorded today.</Text> : null}
          </Card>
          <GlassCard className="mt-4">
            <View className="flex-row items-center justify-between gap-4">
              <Text className="font-sans flex-1 text-sm leading-6 text-ink">{counting ? 'I understand these counts become read-only after checkout.' : 'I understand today\u2019s sales become read-only after checkout.'}</Text>
              <Switch value={confirmed} onValueChange={setConfirmed} accessibilityLabel="Confirm checkout lock" />
            </View>
          </GlassCard>
          <PrimaryButton label="Continue" disabled={!confirmed} onPress={() => setStep(2)} />
          <PrimaryButton label="Not yet" variant="ghost" onPress={() => router.back()} />
        </>
      ) : null}

      {counting && step === 2 ? (
        <>
          {skus.length === 0 ? (
            <>
              <EmptyState title="No SKUs to count" body="This campaign has no active SKUs — tell your supervisor." />
              <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
            </>
          ) : (
            <>
              <Card className="mb-4">
                <View className="mb-2 rounded-xl bg-lavender px-4 py-3">
                  <Text className="font-sans text-sm leading-5 text-charcoal">Count what is left on the shelf now. Sold units = opening − closing.</Text>
                </View>
                {skus.map((s) => {
                  const close = Number(closing[s.sku_id] ?? '');
                  const diff = s.opening != null && Number.isInteger(close) ? s.opening - close : null;
                  return (
                    <View key={s.sku_id} className="mb-4">
                      <Text className="font-sans text-base font-semibold text-ink">{s.sku_name}</Text>
                      <Text className="font-sans mb-2 text-sm text-muted">{s.sku_code}{s.opening != null ? ` · opening ${s.opening}` : ''}{diff != null ? ` · sold ${diff}` : ''}</Text>
                      <Field
                        label="Closing count"
                        keyboardType="number-pad"
                        value={closing[s.sku_id] ?? ''}
                        onChangeText={(v) => setClosingFor(s.sku_id, v)}
                        placeholder="0"
                      />
                    </View>
                  );
                })}
              </Card>
              <PrimaryButton label="Continue" disabled={!countsComplete} onPress={() => setStep(3)} />
              <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(1)} />
            </>
          )}
        </>
      ) : null}

      {!counting && step === 2 ? (
        <>
          <Card>
            <Text className="font-sans text-base leading-6 text-muted">Take a clear photo of the product or stock evidence for this completed visit.</Text>
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
            <Text className="font-sans text-base leading-6 text-muted">Take a clear selfie of yourself for this checkout.</Text>
            <CaptureBox photo={selfie} onSnap={() => void snap('selfie')} hint="Tap to take your selfie" />
          </Card>
          <PrimaryButton label="Retake" variant="ghost" disabled={!selfie} onPress={() => void snap('selfie')} />
          <PrimaryButton label="Check Out" onPress={() => void submit()} busy={busy} disabled={!selfie} icon="log-out" />
          <PrimaryButton label="Back" variant="ghost" onPress={() => setStep(2)} />
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