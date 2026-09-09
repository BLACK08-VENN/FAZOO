import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router, useFocusEffect } from 'expo-router';
import type { BaTodayResult } from '@fazoo/types';
import { lagosDate, weeklyOffDayName } from '@fazoo/config';
import { useToday } from '@/lib/today';
import { useOrgKind } from '@/lib/org-kind';
import { operationCounts, retryTerminal } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { Card, HeroCard, MetricTile, Page } from '@/components/ui';
import VedaToday from '@/components/veda-today';

/**
 * Today dashboard — routes between two flows based on the active
 * organization's kind, which only the server can assert:
 *   'schools' → Veda activation dashboard (school visit + stationery)
 *   'retail'  → in-store dashboard (below, driven by ba_today)
 */
export default function Today() {
  const { kind, loading: kindLoading } = useOrgKind();

  if (kind === 'schools') return <VedaToday />;
  if (kindLoading && kind === null) {
    return (
      <View className="flex-1 items-center justify-center bg-transparent">
        <ActivityIndicator size="large" color="#7C5CFF" />
      </View>
    );
  }

  return <RetailToday />;
}

function RetailToday() {
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

  useFocusEffect(
    useCallback(() => {
      void flushQueue();
      void refreshCounts();
      void refresh();
    }, [refresh]),
  );

  if (loading) {
    return (
      <Center>
        <ActivityIndicator size="large" color="#3139B4" />
      </Center>
    );
  }

  const assignments = data?.assignments ?? [];

  return (
    <Page bottomInset={false}>
      <HeroCard
        eyebrow={`Today · ${lagosDate()} (Nigeria)`}
        title={data?.attendance_date ?? 'Today'}
        subtitle="Your live field dashboard for assignments, sales, and next actions."
        icon="sparkles"
        trailing={
          <View className="items-end">
            <View className="rounded-full bg-lavender px-3 py-2">
              <Text className="font-sans text-xs font-semibold text-charcoal">
                {online === false ? 'Offline' : 'Ready'}
              </Text>
            </View>
          </View>
        }
      />

      <Card className="mb-4">
        <View className="flex-row gap-3">
          <MetricTile label="Assignments" value={assignments.length} />
          <MetricTile label="Pending sync" value={counts.pending} tone={counts.pending > 0 ? 'warning' : 'default'} />
        </View>
      </Card>

      <Card className="mb-4">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="font-sans text-base font-bold text-ink">Need time off?</Text>
        </View>
        <Text className="font-sans mb-3 text-sm leading-6 text-muted">Request annual, sick, or other leave that an admin will review.</Text>
        <PrimaryButton
          label="Apply for leave"
          variant="secondary"
          icon="calendar-clear"
          onPress={() => router.push('/leave')}
        />
      </Card>

      {counts.failed > 0 ? (
        <Card className="mb-4 border-bad/25 bg-bad/10">
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="font-sans text-base font-semibold text-bad">{counts.failed} action{counts.failed > 1 ? 's' : ''} failed to sync</Text>
              <Text className="font-sans mt-1 text-sm leading-6 text-bad/80">
                Retry now when you have a stable connection.
              </Text>
            </View>
            <PrimaryButton label="Retry" variant="ghost" onPress={() => void retryTerminal().then(refreshCounts)} />
          </View>
        </Card>
      ) : null}

      {assignments.length === 0 ? (
        <Card>
          <Text className="font-sans text-lg font-semibold text-ink">No assignment scheduled.</Text>
          <Text className="font-sans mt-2 text-base leading-7 text-muted">
            Check back later or contact your supervisor if you expected a route today.
          </Text>
        </Card>
      ) : (
        <View className="gap-4 pb-28">
          {assignments.map((item: BaTodayResult['assignments'][number]) => {
            const assignment = item.assignment;

            return (
              <Card key={assignment.id}>
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="font-sans text-xs uppercase tracking-[2px] text-primary">{assignment.campaign_name}</Text>
                    <Text className="font-sans mt-2 text-[24px] font-bold leading-8 text-ink">{assignment.store_name}</Text>
                    <Text className="font-sans mt-2 text-base leading-7 text-muted">{assignment.store_address}</Text>
                  </View>
                  {item.log ? (
                    <StatusPill
                      tone={item.log.status === 'completed' ? 'ok' : item.log.attendance_status === 'sick_leave' ? 'warn' : 'purple'}
                      label={`${item.log.attendance_status.replace('_', ' ')} · ${item.log.status.replace('_', ' ')}`}
                    />
                  ) : null}
                </View>

                <View className="mt-3 rounded-2xl bg-lavender p-3">
                  <Text className="font-sans text-xs uppercase tracking-wide text-muted">
                    Units sold today
                  </Text>
                  <Text className="font-sans mt-1 text-3xl font-bold tabular-nums text-primaryText">
                    {item.total_units_today ?? 0}
                  </Text>
                  {(item.sales ?? []).length > 0 ? (
                    <View className="mt-2 space-y-1">
                      {(item.sales ?? []).map((sale: NonNullable<BaTodayResult['assignments'][number]['sales']>[number]) => (
                        <View key={sale.id} className="flex-row justify-between">
                          <Text className="font-sans text-ink/70">{sale.sku_name}</Text>
                          <Text className="font-sans font-medium tabular-nums text-ink/70">{sale.quantity}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text className="font-sans mt-1 text-muted">No sales recorded yet.</Text>
                  )}
                </View>

                <View className="mt-4 space-y-2">
                  {item.is_weekly_off_today ? (
                    <StatusPill
                      tone="purple"
                      label={`Today is your weekly off (${weeklyOffDayName(item.weekly_off_day)})`}
                    />
                  ) : !item.log ? (
                    <>
                      <PrimaryButton
                        label="Check In"
                        onPress={() =>
                          router.push({ pathname: '/checkin', params: { assignment: assignment.id } })
                        }
                      />
                      <PrimaryButton
                        label="Mark Sick Leave"
                        variant="ghost"
                        onPress={() =>
                          router.push({ pathname: '/sick-leave', params: { assignment: assignment.id } })
                        }
                      />
                    </>
                  ) : item.log.status === 'open' && item.log.attendance_status === 'present' ? (
                    <>
                      <PrimaryButton
                        label="Record Sale"
                        onPress={() =>
                          router.push({ pathname: '/sales', params: { assignment: assignment.id } })
                        }
                      />
                      <PrimaryButton
                        label="Check Out"
                        onPress={() =>
                          router.push({ pathname: '/checkout', params: { assignment: assignment.id } })
                        }
                      />
                    </>
                  ) : item.log.status === 'completed' && item.log.attendance_status === 'sick_leave' ? (
                    <StatusPill tone="warn" label="Sick leave recorded for today — get well soon." />
                  ) : (
                    <StatusPill tone="ok" label="Day complete. Well done!" />
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {error ? <StatusPill tone="bad" label={error} /> : null}

      <Text className="font-sans mt-10 text-center text-xs text-muted">Fazoo · v0.1</Text>
    </Page>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 items-center justify-center bg-transparent">{children}</View>;
}
