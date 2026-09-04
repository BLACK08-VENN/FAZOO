import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { formatLagosDisplay } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';
import { Screen, ScreenHeader, Card, EmptyState } from '@/components/ui';

interface RetailLog {
  id: string;
  attendance_date: string;
  attendance_status: string;
  status: string;
  checkin_at: string | null;
  checkout_at: string | null;
  notes: string | null;
}

interface VedaLog {
  id: string;
  session_date: string;
  status: string;
  learner_count: number;
  checkin_at: string | null;
  checkout_at: string | null;
  notes: string | null;
}

export default function CampaignLogs() {
  const params = useLocalSearchParams<{ kind: string; campaignId?: string; campaignName?: string; storeName?: string; assignmentId?: string; schoolId?: string; schoolName?: string; }>();
  const isVeda = params.kind === 'schools';
  const [logs, setLogs] = useState<(RetailLog | VedaLog)[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (isVeda && params.schoolId) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) {
        setError('Your account could not be verified. Sign in again.');
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const { data, error: err } = await supabase
        .from('veda_sessions')
        .select('id, session_date, status, learner_count, checkin_at, checkout_at, notes')
        .eq('brand_ambassador_id', userId)
        .eq('school_id', params.schoolId)
        .order('session_date', { ascending: false })
        .limit(30);
      if (err) setError('Could not load logs.');
      else setLogs((data as VedaLog[] | null) ?? []);
    } else if (params.campaignId) {
      const { data, error: err } = await supabase
        .from('daily_logs')
        .select('id, attendance_date, attendance_status, status, checkin_at, checkout_at, notes')
        .eq('campaign_id', params.campaignId)
        .order('attendance_date', { ascending: false })
        .limit(30);
      if (err) setError('Could not load logs.');
      else setLogs((data as RetailLog[] | null) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, [isVeda, params.schoolId, params.campaignId]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const headerTitle = isVeda ? params.schoolName : params.campaignName;
  const headerSubtitle = isVeda ? 'Recent activity and visit notes' : params.storeName;
  const canAddVedaLog = isVeda && Boolean(params.schoolId);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <ScreenHeader eyebrow="Logs" title={headerTitle ?? ''} subtitle={headerSubtitle ?? undefined} />

      {error ? <Text role="alert" className="mb-3 text-sm font-medium text-rose-200">{error}</Text> : null}

      {canAddVedaLog ? (
        <PrimaryButton
          label="Add new log"
          onPress={() => router.push({ pathname: '/veda-new-log', params: { assignmentId: params.assignmentId, schoolId: params.schoolId, schoolName: params.schoolName } })}
          icon="add-circle"
        />
      ) : null}

      {isVeda && !params.assignmentId ? (
        <Text className="mb-3 text-sm leading-6 text-white/72">
          No active assignment was found for this school, but you can still start a new school log from here.
        </Text>
      ) : null}

      {loading ? (
        <View className="mt-10 items-center justify-center">
          <ActivityIndicator size="large" color="#D8DDFF" />
        </View>
      ) : logs.length === 0 ? (
        <EmptyState title="No logs yet" body={`No logs yet for this ${isVeda ? 'school' : 'campaign'}.`} />
      ) : (
        <View className="mt-2">
          {logs.map((log) => {
            if (isVeda) {
              const v = log as VedaLog;
              return (
                <Card key={v.id} className="mb-3">
                  <View className="flex-row items-start justify-between gap-4">
                    <View className="flex-1">
                      <Text className="text-lg font-bold text-ink">{v.session_date}</Text>
                      <Text className="mt-1 text-sm leading-6 text-slate-600">
                        Learners: {v.learner_count}
                        {v.checkin_at ? ` · in ${formatLagosDisplay(v.checkin_at)}` : ''}
                        {v.checkout_at ? ` · out ${formatLagosDisplay(v.checkout_at)}` : ''}
                      </Text>
                    </View>
                    <Text className="rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold capitalize text-slate-600">{v.status}</Text>
                  </View>
                  {v.notes ? <Text className="mt-3 text-sm leading-6 text-slate-600">{v.notes}</Text> : null}
                </Card>
              );
            }
            const r = log as RetailLog;
            return (
              <Card key={r.id} className="mb-3">
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-ink">{r.attendance_date}</Text>
                    <Text className="mt-1 text-sm capitalize leading-6 text-slate-600">
                      {r.attendance_status.replace('_', ' ')}
                      {r.checkin_at ? ` · in ${formatLagosDisplay(r.checkin_at)}` : ''}
                      {r.checkout_at ? ` · out ${formatLagosDisplay(r.checkout_at)}` : ''}
                    </Text>
                  </View>
                  <Text className="rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold capitalize text-slate-600">{r.status}</Text>
                </View>
                {r.notes ? <Text className="mt-3 text-sm leading-6 text-slate-600">{r.notes}</Text> : null}
              </Card>
            );
          })}
        </View>
      )}

      <PrimaryButton label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
