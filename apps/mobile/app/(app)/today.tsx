import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router, useFocusEffect } from 'expo-router';
import { lagosDate, weeklyOffDayName } from '@fazoo/config';
import { useToday } from '@/lib/today';
import { operationCounts, retryTerminal } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';

/**
 * Today dashboard — a strict state machine driven entirely by the
 * server-computed `ba_today` result:
 *   no assignment      → message + refresh
 *   weekly off today   → off-day notice
 *   sick leave logged  → sick-leave status
 *   open log           → Record Sale / Check Out
 *   completed day      → read-only summary
 *   otherwise          → Check In / Mark Sick Leave
 */
export default function Today() {
  const { data, loading, error, refresh } = useToday();
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
      <Center>
        <ActivityIndicator size="large" color="#7B2FBE" />
      </Center>
    );
  }

  const assignment = data?.assignment ?? null;
  const log = data?.log ?? null;

  return (
    <ScrollView className="flex-1 bg-lavender" contentContainerClassName="px-5 py-8">
      {/* Header */}
      <Text className="text-xs text-muted">Today · {lagosDate()} (Nigeria)</Text>
      {assignment ? (
        <>
          <Text className="text-xl font-bold text-ink mt-1">{data?.attendance_date}</Text>
          <Text className="text-charcoal mt-1">
            {assignment.store_name} · {assignment.campaign_name}
          </Text>
          <Text className="text-muted">
            Weekly off: {weeklyOffDayName(data?.weekly_off_day ?? 0)}
          </Text>
        </>
      ) : (
        <Text className="text-xl font-bold text-ink mt-1">No active assignment</Text>
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

      {/* Attendance status */}
      {log ? (
        <View className="mt-4">
          <StatusPill
            tone={log.attendance_status === 'present' ? 'ok' : 'warn'}
            label={log.attendance_status.replace('_', ' ')}
          />
        </View>
      ) : null}

      {/* Sales summary */}
      <View className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <Text className="text-xs uppercase tracking-wide text-muted">Units sold today</Text>
        <Text className="text-4xl font-bold tabular-nums text-primary mt-1">
          {data?.total_units_today ?? 0}
        </Text>
        {(data?.sales ?? []).length > 0 ? (
          <View className="mt-3 space-y-1">
            {(data?.sales ?? []).map((s) => (
              <View key={s.id} className="flex-row justify-between">
                <Text className="text-charcoal">{s.sku_name}</Text>
                <Text className="font-medium tabular-nums">{s.quantity}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-muted mt-2">No sales recorded yet.</Text>
        )}
      </View>

      {error ? <StatusPill tone="bad" label={error} /> : null}

      {/* Next actions */}
      <View className="mt-8 space-y-2">
        {!assignment ? (
          <Text className="text-center text-muted">
            Contact your supervisor — you&apos;ll see your actions here once assigned.
          </Text>
        ) : data?.is_weekly_off_today ? (
          <StatusPill
            tone="purple"
            label={`Today is your weekly off (${weeklyOffDayName(data?.weekly_off_day ?? 0)})`}
          />
        ) : !log ? (
          <>
            <PrimaryButton label="Check In" onPress={() => router.push('/checkin')} />
            <PrimaryButton
              label="Mark Sick Leave"
              variant="ghost"
              onPress={() => router.push('/sick-leave')}
            />
          </>
        ) : log.status === 'open' && log.attendance_status === 'present' ? (
          <>
            <PrimaryButton label="Record Sale" onPress={() => router.push('/sales')} />
            <PrimaryButton label="Check Out" onPress={() => router.push('/checkout')} />
          </>
        ) : log.status === 'completed' && log.attendance_status === 'sick_leave' ? (
          <StatusPill tone="warn" label="Sick leave recorded for today — get well soon." />
        ) : (
          <StatusPill tone="ok" label="Day complete. Well done!" />
        )}
      </View>

      <Text className="text-center text-xs text-muted mt-10">Fazoo · v0.1</Text>
    </ScrollView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 items-center justify-center bg-lavender">{children}</View>;
}
