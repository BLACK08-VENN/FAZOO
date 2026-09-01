import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router, useFocusEffect } from 'expo-router';
import { weeklyOffDayName } from '@fazoo/config';
import { useVedaToday } from '@/lib/veda-today';
import { operationCounts, retryTerminal } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';

/**
 * Veda (schools) dashboard — a state machine driven by the server-computed
 * `veda_today` result:
 *   no assignment      → message + refresh
 *   weekly off today   → off-day notice
 *   open visit         → Manage stationery / Check Out
 *   completed visit    → read-only summary
 *   otherwise          → Check In
 */
export default function VedaToday() {
  const { data, loading, error, refresh } = useVedaToday();
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });
  const [online, setOnline] = useState<boolean | null>(null);

  async function refreshCounts() {
    setCounts(await operationCounts());
  }

  useEffect(() => {
    void refreshCounts();
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(connected);
      if (connected) void flushQueue().then(refreshCounts);
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushQueue().then(refreshCounts);
    });
    return () => {
      unsubscribeNetInfo();
      subscription.remove();
    };
  }, []);

  useFocusEffect(() => {
    void flushQueue();
    void refreshCounts();
    void refresh();
  });

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-lavender">
        <ActivityIndicator size="large" color="#7B2FBE" />
      </View>
    );
  }

  const assignment = data?.assignment ?? null;
  const session = data?.session ?? null;
  const totalItems = (data?.distributions ?? []).reduce((sum, d) => sum + d.quantity, 0);

  return (
    <ScrollView className="flex-1 bg-lavender" contentContainerClassName="px-5 py-8">
      {/* Header */}
      <Text className="text-xs text-muted">Today · {data?.attendance_date} (Kenya)</Text>
      {assignment ? (
        <>
          <Text className="text-xl font-bold text-ink mt-1">{assignment.school_name}</Text>
          <Text className="text-charcoal mt-1">{assignment.school_region}</Text>
          {data?.weekly_off_day !== null && data?.weekly_off_day !== undefined ? (
            <Text className="text-muted">
              Weekly off: {weeklyOffDayName(data.weekly_off_day)}
            </Text>
          ) : null}
        </>
      ) : (
        <Text className="text-xl font-bold text-ink mt-1">No active school visit</Text>
      )}

      {online === false ? (
        <StatusPill tone="warn" label={`Offline · ${counts.pending} waiting to sync`} />
      ) : counts.failed > 0 ? (
        <View>
          <StatusPill
            tone="bad"
            label={`${counts.failed} item${counts.failed > 1 ? 's' : ''} need attention`}
          />
          <PrimaryButton
            label="Retry failed items"
            variant="ghost"
            onPress={() =>
              void retryTerminal()
                .then(() => flushQueue())
                .then(refreshCounts)
            }
          />
        </View>
      ) : counts.pending > 0 ? (
        <StatusPill
          tone="warn"
          label={`Waiting to sync · ${counts.pending} item${counts.pending > 1 ? 's' : ''}`}
        />
      ) : (
        <StatusPill tone="ok" label="All synced" />
      )}

      {error ? <StatusPill tone="bad" label={error} /> : null}

      {/* Distribution summary */}
      <View className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <Text className="text-xs uppercase tracking-wide text-muted">
          Stationery distributed today
        </Text>
        <Text className="text-4xl font-bold tabular-nums text-primary mt-1">
          {totalItems}
          <Text className="text-base font-normal text-muted"> units</Text>
        </Text>
        {(data?.distributions ?? []).length > 0 ? (
          <View className="mt-3 space-y-1">
            {(data?.distributions ?? []).map((d) => (
              <View key={d.id} className="flex-row justify-between">
                <Text className="text-charcoal">{d.item_name}</Text>
                <Text className="font-medium tabular-nums">×{d.quantity}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-muted mt-2">No distribution recorded yet.</Text>
        )}
      </View>

      {/* Next actions */}
      <View className="mt-8 space-y-2">
        {!assignment ? (
          <Text className="text-center text-muted">
            Contact your supervisor — you&apos;ll see your school visit here once assigned.
          </Text>
        ) : data?.is_weekly_off_today ? (
          <StatusPill tone="warn" label="Today is your weekly off — enjoy the day!" />
        ) : !session ? (
          <PrimaryButton label="Check In" onPress={() => router.push('/veda-checkin')} />
        ) : session.status === 'open' ? (
          <>
            <PrimaryButton
              label="Manage Stationery"
              onPress={() => router.push('/veda-activation')}
            />
            <PrimaryButton label="Check Out" onPress={() => router.push('/veda-checkout')} />
          </>
        ) : (
          <StatusPill tone="ok" label="Visit complete. Well done!" />
        )}
      </View>

      <Text className="text-center text-xs text-muted mt-10">Fazoo · v0.1</Text>
    </ScrollView>
  );
}