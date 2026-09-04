import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
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
import { Screen, ScreenHeader, Card, Field, GlassCard } from '@/components/ui';

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

  const selected = today?.assignments.find((item) => item.assignment.id === assignmentParam) ?? today?.assignments[0] ?? null;
  const assignment = selected?.assignment ?? null;
  const session = selected?.session ?? null;
  const totalItems = (selected?.distributions ?? []).reduce((sum, d) => sum + d.quantity, 0);

  async function locate() {
    setError(null);
    setLocating(true);
    try { setFix(await getFix()); } catch (err) { setError(err instanceof Error ? err.message : 'Location failed.'); } finally { setLocating(false); }
  }

  async function submit() {
    if (!fix || !session || !assignment) return;
    setBusy(true);
    setError(null);
    const requestId = newRequestId();
    const payload = { p_session_id: session.id, p_latitude: fix.latitude, p_longitude: fix.longitude, p_accuracy_metres: fix.accuracy ?? undefined, p_notes: notes.trim() || undefined, p_client_request_id: requestId };
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
  const distance = fix && assignment && assignment.school_latitude && assignment.school_longitude ? Math.round(distanceMetres(fix.latitude, fix.longitude, assignment.school_latitude, assignment.school_longitude)) : null;
  const insideGeofence = distance !== null && distance <= radius;

  return (
    <Screen>
      <ScreenHeader eyebrow="Check out" title="Complete today's visit" subtitle="Confirm totals, verify presence at the school, and close the session." />
      {error ? <StatusPill tone="bad" label={error} /> : null}
      <Card>
        <Text className="text-lg font-bold text-ink">{assignment?.school_name ?? 'Loading…'}</Text>
        <Text className="text-sm text-slate-500">{assignment?.school_region}</Text>
        <View className="mt-4 flex-row justify-between">
          <Text className="text-slate-500">Stationery distributed</Text>
          <Text className="font-bold tabular-nums text-indigo-700">{totalItems} units</Text>
        </View>
        {(selected?.distributions ?? []).map((d) => <View key={d.id} className="mt-2 flex-row justify-between"><Text className="text-slate-700">{d.item_name}</Text><Text className="tabular-nums text-slate-700">×{d.quantity}</Text></View>)}
        {(selected?.distributions ?? []).length === 0 ? <Text className="mt-2 text-slate-500">No stationery was recorded.</Text> : null}
      </Card>
      <GlassCard className="mt-4">
        <Text className="mb-3 font-medium text-white">Verify you are still at the school</Text>
        {locating ? <Text className="text-sm text-white/68">Getting your location…</Text> : distance !== null ? <StatusPill tone={insideGeofence ? 'ok' : 'bad'} label={insideGeofence ? `You are about ${distance} m from the school — within the ${radius} m zone` : `You are ${distance} m away — move closer than ${radius} m to check out`} /> : <Text className="text-sm text-white/68">We'll verify your location against the school before closing the visit.</Text>}
        <View className="mt-3">
          <PrimaryButton label={fix ? 'Refresh location' : 'Get my location'} onPress={() => void locate()} busy={locating} icon="locate" />
        </View>
      </GlassCard>
      <Field label="Notes" placeholder="Notes (optional)" multiline value={notes} onChangeText={setNotes} />
      <GlassCard>
        <View className="flex-row items-center justify-between gap-4">
          <Text className="flex-1 text-sm leading-6 text-white/80">I confirm today's distribution totals are final.</Text>
          <Switch value={confirmed} onValueChange={setConfirmed} accessibilityLabel="Confirm visit completion" />
        </View>
      </GlassCard>
      <PrimaryButton label="Check Out" onPress={() => void submit()} busy={busy} disabled={!confirmed || !fix || !insideGeofence || !session} icon="log-out" />
      <PrimaryButton label="Not yet" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
