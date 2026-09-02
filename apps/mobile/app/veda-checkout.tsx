import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { distanceMetres } from '@fazoo/config';
import type { VedaTodayResult } from '@fazoo/types';
import { getFix, type Fix } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedVedaToday, writeCachedVedaToday } from '@/lib/cache';

/**
 * Completes today's activation: confirms the totals, verifies presence at the
 * school (server re-checks the geofence), then closes the visit. Closes online
 * when possible; queues the checkout for offline sync otherwise. A geofence
 * rejection is surfaced immediately — it must be retried while at the school.
 */
export default function VedaCheckout() {
  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
  const [today, setToday] = useState<VedaTodayResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!today) {
        const { data, error: todayError } = await supabase.rpc('veda_today');
        if (!todayError && data) {
          const result = data as unknown as VedaTodayResult;
          setToday(result);
          await writeCachedVedaToday(result);
        } else {
          setToday(await readCachedVedaToday());
        }
      }
    })();
  }, [today]);

  const selected =
    today?.assignments.find((item) => item.assignment.id === assignmentParam) ??
    today?.assignments[0] ??
    null;
  const assignment = selected?.assignment ?? null;
  const session = selected?.session ?? null;
  const totalItems = (selected?.distributions ?? []).reduce(
    (sum, d) => sum + d.quantity,
    0,
  );

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

  async function submit() {
    if (!fix || !session || !assignment) return;
    setBusy(true);
    setError(null);

    const requestId = newRequestId();
    const payload = {
      p_session_id: session.id,
      p_latitude: fix.latitude,
      p_longitude: fix.longitude,
      p_accuracy_metres: fix.accuracy ?? undefined,
      p_notes: notes.trim() || undefined,
      p_client_request_id: requestId,
    };
    try {
      try {
        const { error: rpcError } = await supabase.rpc('veda_checkout', payload);
        if (rpcError) throw new Error(rpcError.message);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (/(too far|m or less\.?$)/i.test(message)) throw err;
        await enqueue('veda_checkout', payload, requestId);
      }
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed — try again.');
      setBusy(false);
    }
  }

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

  return (
    <ScrollView className="flex-1 bg-lavender" contentContainerClassName="px-5 py-8">
      <Text className="text-xs text-muted">Check out</Text>
      <Text className="text-2xl font-bold text-ink mb-4">Complete today&apos;s visit</Text>

      {error ? <StatusPill tone="bad" label={error} /> : null}

      <View className="rounded-2xl bg-white p-5">
        <Text className="font-semibold text-charcoal">{assignment?.school_name ?? 'Loading…'}</Text>
        <Text className="text-muted">{assignment?.school_region}</Text>
        <View className="mt-4 flex-row justify-between">
          <Text className="text-muted">Stationery distributed</Text>
          <Text className="font-bold tabular-nums text-primary">{totalItems} units</Text>
        </View>
        {(selected?.distributions ?? []).map((d) => (
          <View key={d.id} className="flex-row justify-between py-1 mt-1">
            <Text className="text-charcoal">{d.item_name}</Text>
            <Text className="tabular-nums">×{d.quantity}</Text>
          </View>
        ))}
        {(selected?.distributions ?? []).length === 0 ? (
          <Text className="text-muted mt-2">No stationery was recorded.</Text>
        ) : null}
      </View>

      <View className="mt-4 rounded-2xl bg-white p-5">
        <Text className="mb-3 font-medium text-charcoal">Verify you are still at the school</Text>
        {locating ? (
          <Text className="text-muted text-sm">Getting your location…</Text>
        ) : distance !== null ? (
          <StatusPill
            tone={insideGeofence ? 'ok' : 'bad'}
            label={
              insideGeofence
                ? `You are about ${distance} m from the school — within the ${radius} m zone`
                : `You are ${distance} m away — move closer than ${radius} m to check out`
            }
          />
        ) : (
          <Text className="text-muted text-sm">
            We&apos;ll verify your location against the school before closing the visit.
          </Text>
        )}
        <View className="mt-3">
          <PrimaryButton
            label={fix ? 'Refresh location' : 'Get my location'}
            onPress={() => void locate()}
            busy={locating}
          />
        </View>
      </View>

      <TextInput
        placeholder="Notes (optional)"
        placeholderTextColor="#9a94a5"
        multiline
        className="rounded-xl bg-white p-4 min-h-20 mt-4 mb-3"
        value={notes}
        onChangeText={setNotes}
      />

      <View className="flex-row items-center justify-between rounded-xl bg-white px-4 py-3">
        <Text className="text-charcoal flex-1 pr-3">
          I confirm today&apos;s distribution totals are final.
        </Text>
        <Switch
          value={confirmed}
          onValueChange={setConfirmed}
          accessibilityLabel="Confirm visit completion"
        />
      </View>

      <PrimaryButton
        label="Check Out"
        onPress={() => void submit()}
        busy={busy}
        disabled={!confirmed || !fix || !insideGeofence || !session}
      />
      <PrimaryButton label="Not yet" variant="ghost" onPress={() => router.back()} />
    </ScrollView>
  );
}