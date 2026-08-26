import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { BaTodayResult } from '@fazoo/types';
import { getFix, type Fix } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';

export default function Checkout() {
  const [today, setToday] = useState<BaTodayResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
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

  async function submit() {
    if (!confirmed) {
      setError('Please confirm you understand sales cannot be edited after checkout.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fix: Fix = await getFix();
      const requestId = newRequestId();
      const payload = {
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_accuracy_metres: fix.accuracy ?? undefined,
        p_client_request_id: requestId,
      };
      try {
        const { error: rpcError } = await supabase.rpc('ba_checkout', payload);
        if (rpcError) throw new Error(rpcError.message);
      } catch (err) {
        if (/distance|geofence/i.test(err instanceof Error ? err.message : '')) throw err;
        await enqueue('checkout', payload, requestId); // offline → sync later
      }
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-lavender" contentContainerClassName="px-5 py-8">
      <Text className="text-xs text-muted">Check out</Text>
      <Text className="text-2xl font-bold text-ink mb-4">Final summary</Text>

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

      {error ? <StatusPill tone="bad" label={error} /> : null}

      <PrimaryButton label="Check Out" onPress={() => void submit()} busy={busy} disabled={!confirmed} />
      <PrimaryButton label="Not yet" variant="ghost" onPress={() => router.back()} />
    </ScrollView>
  );
}
