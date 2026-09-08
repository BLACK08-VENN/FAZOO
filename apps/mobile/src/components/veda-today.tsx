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
          <ActivityIndicator size="large" color="#7B2FBE" />
        </View>
      </Screen>
    );
  }

  const regions = data?.regions ?? [];

  return (
    <Screen bottomInset={false}>
        <HeroCard eyebrow={`Today · ${data?.attendance_date} (Kenya)`} title="Schools dashboard" subtitle="Track active school visits, stationery distribution, and sync health in one place." icon="school" />

        <View className="mb-5 flex-row gap-3">
          <MetricTile label="Regions" value={regions.length} />
          <MetricTile label="Pending sync" value={counts.pending} tone={counts.pending > 0 ? 'warning' : 'success'} />
        </View>

        <Card className="mb-4">
          <Text className="font-sans mb-2 text-base font-bold text-ink">Need time off?</Text>
          <Text className="font-sans mb-3 text-sm leading-6 text-slate-600">Request annual, sick, or other leave that an admin will review.</Text>
          <PrimaryButton
            label="Apply for leave"
            variant="secondary"
            icon="calendar-clear"
            onPress={() => router.push('/leave')}
          />
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

        {regions.length === 0 ? (
          <EmptyState title="No regions yet" body="Contact your supervisor — your assigned regions and schools will appear here." />
        ) : (
          <View className="mt-2 gap-4">
            {regions.map((region) => {
              const offToday = region.is_weekly_off_today;
              return (
                <Card key={region.assignment_id}>
                  <Text className="font-sans text-base font-bold text-ink">{region.region}</Text>
                  {region.weekly_off_day && region.weekly_off_day.length > 0 ? (
                    <Text className="font-sans mt-1 text-xs uppercase tracking-wide text-slate-500">Weekly off: {weeklyOffDayName(region.weekly_off_day)}</Text>
                  ) : null}
                  <Text className="font-sans mt-1 text-sm text-slate-500">{region.schools.length} school{region.schools.length === 1 ? '' : 's'} in this region</Text>

                  {region.schools.length === 0 ? (
                    <Text className="font-sans mt-3 text-sm text-muted">No active schools in this region yet.</Text>
                  ) : (
                    <View className="mt-3 gap-3">
                      {region.schools.map((school) => {
                        const totalItems = school.distributions.reduce((sum, d) => sum + d.quantity, 0);
                        return (
                          <View key={school.school_id} className="rounded-3xl bg-slate-100 p-4">
                            <Text className="font-sans text-base font-semibold text-slate-800">{school.school_name}</Text>
                            {school.school_region ? <Text className="font-sans mt-0.5 text-sm text-slate-500">{school.school_region}</Text> : null}
                            <View className="mt-3 rounded-2xl bg-white p-3">
                              <Text className="font-sans text-xs uppercase tracking-wide text-slate-500">Stationery distributed today</Text>
                              <Text className="font-sans mt-1 text-2xl font-bold text-indigo-700">{totalItems}<Text className="font-sans text-base font-normal text-slate-500"> units</Text></Text>
                              {school.distributions.length > 0 ? (
                                <View className="mt-1 gap-1">
                                  {school.distributions.map((d) => (
                                    <View key={d.id} className="flex-row justify-between">
                                      <Text className="font-sans text-slate-700">{d.item_name}</Text>
                                      <Text className="font-sans font-medium tabular-nums text-slate-700">×{d.quantity}</Text>
                                    </View>
                                  ))}
                                </View>
                              ) : (
                                <Text className="font-sans mt-1 text-slate-500">No distribution recorded yet.</Text>
                              )}
                            </View>
                            <View className="mt-3 gap-2">
                              {offToday ? (
                                <StatusPill tone="warn" label="Today is your weekly off — enjoy the day!" />
                              ) : !school.session ? (
                                <PrimaryButton label="Check In" onPress={() => router.push({ pathname: '/veda-checkin', params: { school: school.school_id } })} />
                              ) : school.session.status === 'open' ? (
                                <>
                                  <PrimaryButton label="Manage Stationery" onPress={() => router.push({ pathname: '/veda-activation', params: { school: school.school_id } })} />
                                  <PrimaryButton label="Check Out" onPress={() => router.push({ pathname: '/veda-checkout', params: { school: school.school_id } })} />
                                </>
                              ) : (
                                <StatusPill tone="ok" label="Visit complete. Well done!" />
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}

        <Text className="font-sans mt-10 text-center text-xs text-muted">Fazoo · v0.1</Text>
    </Screen>
  );
}