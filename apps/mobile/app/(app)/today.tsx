import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router, useFocusEffect } from 'expo-router';
import type { BaTodayResult } from '@fazoo/types';
import { lagosDate, weeklyOffDayName } from '@fazoo/config';
import { useSessionProfile } from '@/lib/session';
import { useToday } from '@/lib/today';
import { useOrgKind } from '@/lib/org-kind';
import { operationCounts, retryTerminal } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { Card, MetricTile, Page } from '@/components/ui';
import SchoolsToday from '@/components/schools-today';

/**
 * Today dashboard — routes between two flows based on the active
 * organization's kind, which only the server can assert:
 *   'schools' → school booklist pipeline (approach → booklist → print → stamp)
 *   'retail'  → in-store dashboard (below, driven by ba_today)
 */
export default function Today() {
  const { kind, loading: kindLoading } = useOrgKind();

  if (kind === 'schools') return <SchoolsToday />;
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
  const { profile } = useSessionProfile();
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
      <View className="mb-5 items-center pt-2">
        <Text className="font-sans text-3xl font-black tracking-[2px] text-ink">FAZOO</Text>
        <Text className="font-sans text-[10px] font-bold tracking-[2.5px] text-primary">FIELD ACTIVATIONS</Text>
      </View>
      <Text className="font-sans text-[27px] font-extrabold leading-9 text-ink">
        {(() => {
          const hour = new Date().getHours();
          const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
          return `${greeting}${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`;
        })()}
      </Text>
      <Text className="font-sans mb-5 mt-1 text-base text-muted">Let's make today count.</Text>

      <View className="mb-4 flex-row gap-3">
        <MetricTile label="Assignments" value={assignments.length} />
        <MetricTile
          label="Pending sync"
          value={counts.pending}
          tone={counts.pending > 0 ? 'warning' : 'default'}
        />
      </View>

      {counts.failed > 0 ? (
        <Card className="mb-4 border-bad/25 bg-bad/10">
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="font-sans text-base font-semibold text-bad">
                {counts.failed} action{counts.failed > 1 ? 's' : ''} failed to sync
              </Text>
              <Text className="font-sans mt-1 text-sm leading-6 text-bad/80">
                Retry now when you have a stable connection.
              </Text>
            </View>
            <PrimaryButton
              label="Retry"
              variant="ghost"
              onPress={() => void retryTerminal().then(refreshCounts)}
            />
          </View>
        </Card>
      ) : null}

      {assignments.length === 0 ? (
        <Card>
          <Text className="font-sans text-lg font-semibold text-ink">
            No assignment scheduled.
          </Text>
          <Text className="font-sans mt-2 text-base leading-7 text-muted">
            Check back later or contact your supervisor if you expected a route today.
          </Text>
        </Card>
      ) : (
        <View className="gap-4 pb-28">
          {assignments.map((item: BaTodayResult['assignments'][number]) => {
            const assignment = item.assignment;

            return (
              <Card key={assignment.id} className="overflow-hidden border-primary/15 bg-white/90">
                <View className="-mx-4 -mt-4 mb-4 rounded-t-2xl bg-primary px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-sans text-base font-bold text-white">Your shift today</Text>
                    <Text className="font-sans text-xs text-white/85">{lagosDate()}</Text>
                  </View>
                </View>
                <Text className="font-sans text-lg font-extrabold text-ink">
                  {assignment.campaign_name}
                </Text>
                <Text className="font-sans mt-1 text-xs text-muted">Your assigned campaign</Text>
                <View className="mt-4 rounded-xl border border-primary/10 bg-lavender/60 px-3 py-3">
                  <Text className="font-sans text-xs text-muted">⌖  Assigned location</Text>
                  <Text className="font-sans mt-1 text-lg font-bold text-ink">{assignment.store_name || 'Location to be confirmed'}</Text>
                  {assignment.store_address ? (
                    <Text className="font-sans mt-1 text-sm text-muted">{assignment.store_address}</Text>
                  ) : null}
                </View>
                {item.log ? (
                  <View className="self-start">
                    <StatusPill
                      tone={
                        item.log.status === 'completed'
                          ? 'ok'
                          : item.log.attendance_status === 'sick_leave'
                            ? 'warn'
                            : 'purple'
                      }
                      label={`${item.log.attendance_status.replace('_', ' ')} · ${item.log.status.replace('_', ' ')}`}
                    />
                  </View>
                ) : null}

                {!item.is_weekly_off_today && item.log?.attendance_status !== 'sick_leave' ? (
                  <View className="mt-5">
                    <View className="mb-3 flex-row items-center justify-between">
                      <Text className="font-sans text-lg font-extrabold text-ink">Today's tasks</Text>
                      <Text className="font-sans text-xs text-muted">
                        {[
                          !!item.log,
                          item.counting ? (item.stock ?? []).some((row) => row.opening != null) : (item.sales ?? []).length > 0,
                          item.log?.status === 'completed',
                        ].filter(Boolean).length} of 3 done
                      </Text>
                    </View>
                    {([
                      {
                        title: item.counting ? 'Morning stock' : 'Check in',
                        detail: item.counting ? 'Count and record opening stock' : 'Verify your location and start the shift',
                        done: item.counting
                          ? (item.stock ?? []).some((row) => row.opening != null)
                          : !!item.log,
                        route: item.log ? '/opening-counts' : '/checkin',
                      },
                      {
                        title: item.counting ? 'Daily sales' : 'Daily sales',
                        detail: item.counting ? 'Review sales from stock movements' : 'Log units sold during your shift',
                        done: item.counting
                          ? item.log?.status === 'completed'
                          : (item.sales ?? []).length > 0,
                        route: item.counting ? '/opening-counts' : '/sales',
                      },
                      {
                        title: item.counting ? 'Evening stock' : 'Check out',
                        detail: item.counting ? 'Count and record closing stock' : 'Finish your shift and submit',
                        done: item.log?.status === 'completed',
                        route: '/checkout',
                      },
                    ] as const).map((task, index) => (
                      <Pressable
                        key={task.title}
                        accessibilityRole="button"
                        accessibilityLabel={`${task.title}, ${task.done ? 'completed' : 'pending'}`}
                        onPress={() => router.push({
                          pathname: task.route,
                          params: { assignment: assignment.id },
                        })}
                        className={`flex-row items-center rounded-xl border border-primary/10 bg-white px-3 py-3 ${index > 0 ? 'mt-2' : ''}`}
                      >
                        <View className={`mr-3 h-7 w-7 items-center justify-center rounded-full border-2 ${task.done ? 'border-primary bg-primary' : 'border-primary/45'}`}>
                          {task.done ? <Text className="font-sans text-sm font-bold text-white">✓</Text> : null}
                        </View>
                        <View className="flex-1">
                          <Text className="font-sans text-base font-bold text-ink">{task.title}</Text>
                          <Text className="font-sans mt-0.5 text-xs text-muted">{task.detail}</Text>
                        </View>
                        <Text className="font-sans text-xl text-primary/70">›</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <View className="mt-3 rounded-2xl bg-lavender px-3 py-2.5">
                  <Text className="font-sans text-xs uppercase tracking-wide text-muted">
                    {item.counting ? 'Units sold today · stock counts' : 'Units sold today'}
                  </Text>
                  <Text className="font-sans mt-0.5 text-2xl font-bold tabular-nums text-primaryText">
                    {item.counting ? (item.diff_total ?? 0) : (item.total_units_today ?? 0)}
                  </Text>
                  {item.counting ? (
                    (item.stock ?? []).length > 0 ? (
                      <View className="mt-2 space-y-1">
                        {(item.stock ?? []).map((row) => (
                          <View key={row.sku_id} className="flex-row justify-between">
                            <Text className="font-sans flex-1 text-ink/70">{row.sku_name}</Text>
                            <Text className="font-sans font-medium tabular-nums text-ink/70">
                              {row.opening ?? '–'} → {row.closing ?? '–'}
                              {row.diff != null ? ` · ${row.diff} sold` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text className="font-sans mt-1 text-muted">No counts recorded yet.</Text>
                    )
                  ) : (item.sales ?? []).length > 0 ? (
                    <View className="mt-2 space-y-1">
                      {(item.sales ?? []).map(
                        (
                          sale: NonNullable<
                            BaTodayResult['assignments'][number]['sales']
                          >[number],
                        ) => (
                          <View key={sale.id} className="flex-row justify-between">
                            <Text className="font-sans text-ink/70">{sale.sku_name}</Text>
                            <Text className="font-sans font-medium tabular-nums text-ink/70">
                              {sale.quantity}
                            </Text>
                          </View>
                        ),
                      )}
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
                          router.push({
                            pathname: '/checkin',
                            params: { assignment: assignment.id },
                          })
                        }
                      />
                      <PrimaryButton
                        label="Mark Sick Leave"
                        variant="ghost"
                        onPress={() =>
                          router.push({
                            pathname: '/sick-leave',
                            params: { assignment: assignment.id },
                          })
                        }
                      />
                    </>
                  ) : item.log.status === 'open' && item.log.attendance_status === 'present' ? (
                    item.counting ? (
                      <>
                        <PrimaryButton
                          label="Update opening counts"
                          onPress={() =>
                            router.push({
                              pathname: '/opening-counts',
                              params: { assignment: assignment.id },
                            })
                          }
                        />
                        <PrimaryButton
                          label="Check Out"
                          variant="secondary"
                          onPress={() =>
                            router.push({
                              pathname: '/checkout',
                              params: { assignment: assignment.id },
                            })
                          }
                        />
                      </>
                    ) : (
                      <>
                        <PrimaryButton
                          label="Record Sale"
                          onPress={() =>
                            router.push({
                              pathname: '/sales',
                              params: { assignment: assignment.id },
                            })
                          }
                        />
                        <PrimaryButton
                          label="Check Out"
                          variant="secondary"
                          onPress={() =>
                            router.push({
                              pathname: '/checkout',
                              params: { assignment: assignment.id },
                            })
                          }
                        />
                      </>
                    )
                  ) : item.log.status === 'completed' &&
                    item.log.attendance_status === 'sick_leave' ? (
                    <StatusPill
                      tone="warn"
                      label="Sick leave recorded for today — get well soon."
                    />
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

      <Card className="mt-5">
        <Text className="font-sans text-base font-bold text-ink">Need time off?</Text>
        <Text className="font-sans mt-1 text-sm leading-5 text-muted">
          Submit a leave request for admin review.
        </Text>
        <PrimaryButton
          label="Apply for leave"
          variant="secondary"
          icon="calendar-clear"
          onPress={() => router.push('/leave')}
        />
      </Card>

      <Text className="font-sans mb-24 mt-8 text-center text-xs text-muted">Fazoo · v0.1</Text>
    </Page>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 items-center justify-center bg-transparent">{children}</View>;
}
