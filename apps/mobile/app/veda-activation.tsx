import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { VedaTodayResult } from '@fazoo/types';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedVedaToday, writeCachedVedaToday } from '@/lib/cache';
import { Screen, Card, HeroCard, EmptyState } from '@/components/ui';

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  return (
    <View className="my-1.5 flex-row items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
      <Text className="flex-1 pr-3 text-slate-700">{label}</Text>
      <View className="flex-row items-center gap-2">
        <PrimaryButton label="−" variant="secondary" onPress={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} accessibilityLabel={`Reduce ${label}`} />
        <Text className="min-w-10 text-center text-lg font-bold tabular-nums text-slate-800">{value}</Text>
        <PrimaryButton label="+" variant="secondary" onPress={() => onChange(Math.min(100000, value + 1))} accessibilityLabel={`Increase ${label}`} />
      </View>
    </View>
  );
}

export default function VedaActivation() {
  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
  const [data, setData] = useState<VedaTodayResult | null>(null);
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const { data: result, error: err } = await supabase.rpc('veda_today');
    if (err) {
      const cached = await readCachedVedaToday();
      if (cached) {
        setData(cached);
        setError('Offline — showing the most recently synced visit.');
      } else setError(err.message);
      return;
    }
    const today = result as unknown as VedaTodayResult;
    setData(today);
    setError(null);
    await writeCachedVedaToday(today);
  }

  useEffect(() => { void refresh(); }, []);

  const selected = data?.assignments.find((item) => item.assignment.id === assignmentParam) ?? data?.assignments[0] ?? null;
  const session = selected?.session ?? null;
  const stationeryItems = data?.stationery_items ?? [];
  const distributions = selected?.distributions ?? [];
  const originalByItem = new Map(distributions.map((d) => [d.stationery_item_id, d.quantity]));

  useEffect(() => {
    if (stationeryItems.length === 0 || Object.keys(edited).length > 0) return;
    const seed: Record<string, number> = {};
    for (const item of stationeryItems) seed[item.id] = originalByItem.get(item.id) ?? 0;
    setEdited(seed);
  }, [stationeryItems.length, distributions.length]);

  async function saveChanges() {
    if (!session) return;
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      let changed = 0;
      for (const item of stationeryItems) {
        const next = edited[item.id] ?? 0;
        const original = originalByItem.get(item.id) ?? 0;
        if (next === original) continue;
        const requestId = newRequestId();
        if (next > 0) {
          await enqueue('veda_distribution', { p_session_id: session.id, p_stationery_item_id: item.id, p_quantity: next, p_client_request_id: requestId });
        } else {
          await enqueue('veda_remove_distribution', { p_session_id: session.id, p_stationery_item_id: item.id, p_client_request_id: requestId });
        }
        changed += 1;
      }
      if (changed === 0) setSavedMessage('Nothing changed.');
      else setSavedMessage(`${changed} change${changed > 1 ? 's' : ''} saved — will sync when online.`);
      await refresh();
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  if (data === null) {
    return <Screen scroll={false}><View className="flex-1 items-center justify-center"><Text className="text-white/70">Loading today&apos;s visit…</Text></View></Screen>;
  }

  const school = selected?.assignment ?? null;

  return (
    <Screen>
      <HeroCard eyebrow="Today's visit" title={school?.school_name ?? 'No school'} subtitle={school?.school_region ?? undefined} icon="albums" />
      {selected?.is_weekly_off_today ? <StatusPill tone="warn" label="Weekly off" /> : session?.status === 'completed' ? <StatusPill tone="ok" label="Complete" /> : <StatusPill tone="purple" label="In progress" />}
      {error ? <StatusPill tone="bad" label={error} /> : null}
      {savedMessage ? <StatusPill tone="ok" label={savedMessage} /> : null}

      {session && session.status === 'open' ? (
        <>
          <Card>
            <Text className="mb-1 text-lg font-bold text-ink">Stationery distributed</Text>
            <Text className="mb-4 text-sm leading-6 text-slate-600">Update the quantities distributed to learners for this visit.</Text>
            {stationeryItems.length === 0 ? <EmptyState title="No stationery items yet" body="Ask your administrator to configure stationery items for this programme." /> : stationeryItems.map((item) => <Stepper key={item.id} label={item.name} value={edited[item.id] ?? 0} onChange={(next) => setEdited((current) => ({ ...current, [item.id]: next }))} />)}
            {stationeryItems.length > 0 ? <PrimaryButton label="Save changes" onPress={() => void saveChanges()} busy={saving} icon="save" /> : null}
          </Card>
          <StatusPill tone="neutral" label={`Checked in · ${session.learner_count} learners`} />
          <PrimaryButton label="Check Out" onPress={() => router.push({ pathname: '/veda-checkout', params: { assignment: school?.id } })} />
          <PrimaryButton label="Back to Today" variant="ghost" onPress={() => router.back()} />
        </>
      ) : session?.status === 'completed' ? (
        <>
          <Card>
            <Text className="text-xs uppercase tracking-wide text-slate-500">Stationery distributed</Text>
            {distributions.length === 0 ? <Text className="mt-2 text-slate-500">Nothing was recorded.</Text> : distributions.map((d) => <View key={d.id} className="mt-2 flex-row justify-between"><Text className="text-slate-700">{d.item_name}</Text><Text className="tabular-nums text-slate-700">×{d.quantity}</Text></View>)}
          </Card>
          <PrimaryButton label="Done" variant="ghost" onPress={() => router.back()} />
        </>
      ) : (
        <View className="mt-6">
          <StatusPill tone="warn" label="This visit hasn't been checked in yet." />
          <PrimaryButton label="Check In" onPress={() => router.replace({ pathname: '/veda-checkin', params: { assignment: school?.id } })} />
        </View>
      )}
    </Screen>
  );
}
