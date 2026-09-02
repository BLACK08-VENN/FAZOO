import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { VedaTodayResult } from '@fazoo/types';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { readCachedVedaToday, writeCachedVedaToday } from '@/lib/cache';

/** Quantity stepper row for one stationery item. */
function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-3 my-1.5">
      <Text className="text-charcoal flex-1 pr-3">{label}</Text>
      <View className="flex-row items-center">
        <StepButton
          symbol="−"
          disabled={value <= 0}
          accessibilityLabel={`Reduce ${label}`}
          onPress={() => onChange(Math.max(0, value - 1))}
        />
        <Text className="min-w-10 text-center font-bold tabular-nums text-lg">{value}</Text>
        <StepButton
          symbol="+"
          accessibilityLabel={`Increase ${label}`}
          onPress={() => onChange(Math.min(100000, value + 1))}
        />
      </View>
    </View>
  );
}

function StepButton({
  symbol,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  symbol: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <PrimaryButton
      label=""
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
    >
      <Text className="text-white text-2xl font-bold">{symbol}</Text>
    </PrimaryButton>
  );
}

/**
 * Stationery distribution for an open visit. Edits are queued as idempotent
 * offline operations (one per changed line + removals), so they sync reliably
 * and can never be double-applied.
 */
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

  useEffect(() => {
    void refresh();
  }, []);

  const selected =
    data?.assignments.find((item) => item.assignment.id === assignmentParam) ??
    data?.assignments[0] ??
    null;
  const session = selected?.session ?? null;
  const stationeryItems = data?.stationery_items ?? [];
  const distributions = selected?.distributions ?? [];
  const originalByItem = new Map(distributions.map((d) => [d.stationery_item_id, d.quantity]));

  // Seed the editor once the current distributions arrive.
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
          await enqueue('veda_distribution', {
            p_session_id: session.id,
            p_stationery_item_id: item.id,
            p_quantity: next,
            p_client_request_id: requestId,
          });
        } else {
          await enqueue('veda_remove_distribution', {
            p_session_id: session.id,
            p_stationery_item_id: item.id,
            p_client_request_id: requestId,
          });
        }
        changed += 1;
      }
      if (changed === 0) {
        setSavedMessage('Nothing changed.');
      } else {
        setSavedMessage(
          `${changed} change${changed > 1 ? 's' : ''} saved — will sync when online.`,
        );
      }
      await refresh();
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  if (data === null) {
    return (
      <View className="flex-1 items-center justify-center bg-lavender px-6">
        <Text className="text-muted text-center">Loading today&apos;s visit…</Text>
      </View>
    );
  }

  const school = selected?.assignment ?? null;

  return (
    <ScrollView className="flex-1 bg-lavender" contentContainerClassName="px-5 py-8">
      <Text className="text-xs text-muted">Today&apos;s visit</Text>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-ink">{school?.school_name ?? 'No school'}</Text>
          <Text className="text-muted">{school?.school_region}</Text>
        </View>
        {selected?.is_weekly_off_today ? (
          <StatusPill tone="warn" label="Weekly off" />
        ) : session?.status === 'completed' ? (
          <StatusPill tone="ok" label="Complete" />
        ) : (
          <StatusPill tone="purple" label="In progress" />
        )}
      </View>

      {error ? <StatusPill tone="bad" label={error} /> : null}
      {savedMessage ? <StatusPill tone="ok" label={savedMessage} /> : null}

      {session && session.status === 'open' ? (
        <>
          <Text className="mt-6 mb-1 text-sm font-medium text-muted">
            Stationery distributed to learners (units)
          </Text>
          {stationeryItems.length === 0 ? (
            <Text className="text-muted">No stationery items configured yet.</Text>
          ) : (
            <>
              {stationeryItems.map((item) => (
                <Stepper
                  key={item.id}
                  label={item.name}
                  value={edited[item.id] ?? 0}
                  onChange={(next) =>
                    setEdited((current) => ({ ...current, [item.id]: next }))
                  }
                />
              ))}
              <PrimaryButton
                label="Save changes"
                onPress={() => void saveChanges()}
                busy={saving}
              />
            </>
          )}
          <StatusPill
            tone="neutral"
            label={`Checked in · ${session.learner_count} learners`}
          />
          <View className="mt-4">
            <PrimaryButton
              label="Check Out"
              onPress={() =>
                router.push({
                  pathname: '/veda-checkout',
                  params: { assignment: school?.id },
                })
              }
            />
            <PrimaryButton label="Back to Today" variant="ghost" onPress={() => router.back()} />
          </View>
        </>
      ) : session?.status === 'completed' ? (
        <>
          <View className="mt-6 rounded-2xl bg-white p-5">
            <Text className="text-xs uppercase tracking-wide text-muted">
              Stationery distributed
            </Text>
            {distributions.length === 0 ? (
              <Text className="text-muted mt-2">Nothing was recorded.</Text>
            ) : (
              distributions.map((d) => (
                <View key={d.id} className="flex-row justify-between py-1 mt-1">
                  <Text className="text-charcoal">{d.item_name}</Text>
                  <Text className="tabular-nums">×{d.quantity}</Text>
                </View>
              ))
            )}
          </View>
          <PrimaryButton label="Done" variant="ghost" onPress={() => router.back()} />
        </>
      ) : (
        <View className="mt-6">
          <StatusPill tone="warn" label="This visit hasn't been checked in yet." />
          <PrimaryButton
            label="Check In"
            onPress={() =>
              router.replace({
                pathname: '/veda-checkin',
                params: { assignment: school?.id },
              })
            }
          />
        </View>
      )}
    </ScrollView>
  );
}