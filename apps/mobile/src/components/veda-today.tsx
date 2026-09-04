import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router, useFocusEffect } from 'expo-router';
import { weeklyOffDayName } from '@fazoo/config';
import { useVedaToday } from '@/lib/veda-today';
import { operationCounts, retryTerminal } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { Card, Screen, HeroCard, MetricTile, EmptyState } from '@/components/ui';

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
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#D8DDFF" />
        </View>
      </Screen>
    );
  }

  const assignments = data?.assignments ?? [];

  return (
    <Screen bottomInset={false} backdropOverlayOpacity={0.2}>
        <HeroCard eyebrow={`Today · ${data?.attendance_date} (Kenya)`} title="Schools dashboard" subtitle="Track active school visits, stationery distribution, and sync health in one place." icon="school" />

        <View className="mb-5 flex-row gap-3">
          <MetricTile label="Assignments" value={assignments.length} />
          <MetricTile label="Pending sync" value={counts.pending} tone={counts.pending > 0 ? 'warning' : 'success'} />
        </View>

        <Card className="mb-4">
          <Text className="text-base font-bold text-ink">Add a log</Text>
          <Text className="mb-2 mt-1 text-sm leading-6 text-slate-600">Choose a school, then add a visit log with a document photo and selfie.</Text>
          <PrimaryButton label="Choose school & add log" onPress={() => router.push('/campaigns')} icon="add-circle" />
        </Card>

        {online === false ? (
          <StatusPill tone="warn" label={`Offline · ${counts.pending} waiting to sync`} />
        ) : counts.failed > 0 ? (
          <View>
            <StatusPill tone="bad" label={`${counts.failed} item${counts.failed > 1 ? 's' : ''} need attention`} />
            <PrimaryButton label="Retry failed items" variant="ghost" onPress={() => void retryTerminal().then(() => flushQueue()).then(refreshCounts)} />
          </View>
        ) : counts.pending > 0 ? (
          <StatusPill tone="warn" label={`Waiting to sync · ${counts.pending} item${counts.pending > 1 ? 's' : ''}`} />
        ) : (
          <StatusPill tone="ok" label="All synced" />
        )}

        {error ? <StatusPill tone="bad" label={error} /> : null}

        {assignments.length === 0 ? (
          <EmptyState title="No school visits yet" body="Contact your supervisor — you'll see your school visits here once assigned." />
        ) : (
          <View className="mt-2 gap-4">
            {assignments.map((item) => {
              const a = item.assignment;
              const totalItems = (item.distributions ?? []).reduce((sum, d) => sum + d.quantity, 0);
              return (
                <Card key={a.id}>
                  <Text className="text-base font-bold text-ink">{a.school_name}</Text>
                  {a.school_region ? <Text className="mt-0.5 text-sm text-slate-500">{a.school_region}</Text> : null}
                  {item.weekly_off_day && item.weekly_off_day.length > 0 ? <Text className="mt-1 text-xs uppercase tracking-wide text-slate-500">Weekly off: {weeklyOffDayName(item.weekly_off_day)}</Text> : null}
                  <View className="mt-4 rounded-3xl bg-slate-100 p-4">
                    <Text className="text-xs uppercase tracking-wide text-slate-500">Stationery distributed today</Text>
                    <Text className="mt-1 text-3xl font-bold text-indigo-700">{totalItems}<Text className="text-base font-normal text-slate-500"> units</Text></Text>
                    {(item.distributions ?? []).length > 0 ? (
                      <View className="mt-2 gap-1">
                        {(item.distributions ?? []).map((d) => (
                          <View key={d.id} className="flex-row justify-between">
                            <Text className="text-slate-700">{d.item_name}</Text>
                            <Text className="font-medium tabular-nums text-slate-700">×{d.quantity}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text className="mt-1 text-slate-500">No distribution recorded yet.</Text>
                    )}
                  </View>
                  <View className="mt-4 gap-2">
                    {item.is_weekly_off_today ? (
                      <StatusPill tone="warn" label="Today is your weekly off — enjoy the day!" />
                    ) : !item.session ? (
                      <PrimaryButton label="Check In" onPress={() => router.push({ pathname: '/veda-checkin', params: { assignment: a.id } })} />
                    ) : item.session.status === 'open' ? (
                      <>
                        <PrimaryButton label="Manage Stationery" onPress={() => router.push({ pathname: '/veda-activation', params: { assignment: a.id } })} />
                        <PrimaryButton label="Check Out" onPress={() => router.push({ pathname: '/veda-checkout', params: { assignment: a.id } })} />
                      </>
                    ) : (
                      <StatusPill tone="ok" label="Visit complete. Well done!" />
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        <Text className="mt-10 text-center text-xs text-white/42">Fazoo · v0.1</Text>
    </Screen>
  );
}
