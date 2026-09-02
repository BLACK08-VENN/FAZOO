import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router, useFocusEffect } from 'expo-router';
import { lagosDate, weeklyOffDayName } from '@fazoo/config';
import { useToday } from '@/lib/today';
import { useOrgKind } from '@/lib/org-kind';
import { operationCounts, retryTerminal } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
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
      <View className="flex-1 items-center justify-center bg-lavender">
        <ActivityIndicator size="large" color="#7B2FBE" />
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

  const assignments = data?.assignments ?? [];

  return (
    <ScrollView className="flex-1 bg-lavender" contentContainerClassName="px-5 py-8">
      {/* Header */}
      <Text className="text-xs text-muted">Today · {lagosDate()} (Nigeria)</Text>
      <Text className="text-xl font-bold text-ink mt-1">{data?.attendance_date}</Text>

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

      {assignments.length === 0 ? (
        <View className="mt-6">
          <Text className="text-center text-muted mt-4">
            Contact your supervisor — you&apos;ll see your assignments here once you&apos;re
            signed up.
          </Text>
        </View>
      ) : (
        <View className="mt-2 space-y-4">
          {assignments.map((item) => {
            const a = item.assignment;
            const loc = a.store_name || a.school_name || '';
            const campaign = a.campaign_name;
            const title = campaign ? `${loc} · ${campaign}` : loc;
            return (
              <View key={a.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <Text className="text-base font-bold text-ink">{title}</Text>
                <Text className="text-xs uppercase tracking-wide text-muted mt-1">
                  Weekly off: {weeklyOffDayName(item.weekly_off_day)}
                </Text>

                {item.log ? (
                  <StatusPill
                    tone={item.log.attendance_status === 'present' ? 'ok' : 'warn'}
                    label={`${item.log.attendance_status.replace('_', ' ')} · ${item.log.status.replace('_', ' ')}`}
                  />
                ) : null}

                <View className="mt-3 rounded-xl bg-lavender p-3">
                  <Text className="text-xs uppercase tracking-wide text-muted">
                    Units sold today
                  </Text>
                  <Text className="text-3xl font-bold tabular-nums text-primary mt-1">
                    {item.total_units_today ?? 0}
                  </Text>
                  {(item.sales ?? []).length > 0 ? (
                    <View className="mt-2 space-y-1">
                      {(item.sales ?? []).map((s) => (
                        <View key={s.id} className="flex-row justify-between">
                          <Text className="text-charcoal">{s.sku_name}</Text>
                          <Text className="font-medium tabular-nums">{s.quantity}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text className="text-muted mt-1">No sales recorded yet.</Text>
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
                          router.push({ pathname: '/checkin', params: { assignment: a.id } })
                        }
                      />
                      <PrimaryButton
                        label="Mark Sick Leave"
                        variant="ghost"
                        onPress={() =>
                          router.push({ pathname: '/sick-leave', params: { assignment: a.id } })
                        }
                      />
                    </>
                  ) : item.log.status === 'open' && item.log.attendance_status === 'present' ? (
                    <>
                      <PrimaryButton
                        label="Record Sale"
                        onPress={() =>
                          router.push({ pathname: '/sales', params: { assignment: a.id } })
                        }
                      />
                      <PrimaryButton
                        label="Check Out"
                        onPress={() =>
                          router.push({ pathname: '/checkout', params: { assignment: a.id } })
                        }
                      />
                    </>
                  ) : item.log.status === 'completed' && item.log.attendance_status === 'sick_leave' ? (
                    <StatusPill tone="warn" label="Sick leave recorded for today — get well soon." />
                  ) : (
                    <StatusPill tone="ok" label="Day complete. Well done!" />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {error ? <StatusPill tone="bad" label={error} /> : null}

      <Text className="text-center text-xs text-muted mt-10">Fazoo · v0.1</Text>
    </ScrollView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 items-center justify-center bg-lavender">{children}</View>;
}
