import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { formatLagosDisplay } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';

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
  const params = useLocalSearchParams<{
    kind: string;
    campaignId?: string;
    campaignName?: string;
    storeName?: string;
    assignmentId?: string;
    schoolId?: string;
    schoolName?: string;
  }>();

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
      if (err) {
        setError('Could not load logs.');
      } else {
        setLogs((data as VedaLog[] | null) ?? []);
      }
    } else if (params.campaignId) {
      const { data, error: err } = await supabase
        .from('daily_logs')
        .select('id, attendance_date, attendance_status, status, checkin_at, checkout_at, notes')
        .eq('campaign_id', params.campaignId)
        .order('attendance_date', { ascending: false })
        .limit(30);
      if (err) {
        setError('Could not load logs.');
      } else {
        setLogs((data as RetailLog[] | null) ?? []);
      }
    }
    setLoading(false);
    setRefreshing(false);
  }, [isVeda, params.schoolId, params.campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const headerTitle = isVeda ? params.schoolName : params.campaignName;
  const headerSubtitle = isVeda ? null : params.storeName;

  return (
    <ScrollView
      className="flex-1 bg-lavender"
      contentContainerClassName="px-5 py-8"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <Text className="text-xs text-muted mb-1">Logs</Text>
      <Text className="text-xl font-bold text-ink">{headerTitle}</Text>
      {headerSubtitle ? (
        <Text className="text-sm text-charcoal mb-4">{headerSubtitle}</Text>
      ) : (
        <View className="h-4" />
      )}

      {error ? (
        <Text role="alert" className="text-bad font-medium mb-3">
          {error}
        </Text>
      ) : null}

      {isVeda ? (
        <PrimaryButton
          label="Add New Log"
          onPress={() =>
            router.push({
              pathname: '/veda-new-log',
              params: {
                assignmentId: params.assignmentId,
                schoolId: params.schoolId,
                schoolName: params.schoolName,
              },
            })
          }
        />
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color="#7B2FBE" className="mt-6" />
      ) : logs.length === 0 ? (
        <Text className="text-muted text-center mt-6">
          No logs yet for this {isVeda ? 'school' : 'campaign'}.
        </Text>
      ) : (
        <View className="mt-4">
          {logs.map((log) => {
            if (isVeda) {
              const v = log as VedaLog;
              return (
                <View key={v.id} className="rounded-xl bg-white px-4 py-3 mb-2">
                  <View className="flex-row justify-between">
                    <Text className="font-semibold text-charcoal">{v.session_date}</Text>
                    <Text className="text-muted capitalize">{v.status}</Text>
                  </View>
                  <Text className="text-sm text-charcoal mt-1">
                    Learners: {v.learner_count}
                    {v.checkin_at ? ` · in ${formatLagosDisplay(v.checkin_at)}` : ''}
                    {v.checkout_at ? ` · out ${formatLagosDisplay(v.checkout_at)}` : ''}
                  </Text>
                  {v.notes ? (
                    <Text className="text-sm text-muted mt-1">{v.notes}</Text>
                  ) : null}
                </View>
              );
            }
            const r = log as RetailLog;
            return (
              <View key={r.id} className="rounded-xl bg-white px-4 py-3 mb-2">
                <View className="flex-row justify-between">
                  <Text className="font-semibold text-charcoal">{r.attendance_date}</Text>
                  <Text className="text-muted capitalize">{r.status}</Text>
                </View>
                <Text className="text-sm text-charcoal mt-1 capitalize">
                  {r.attendance_status.replace('_', ' ')}
                  {r.checkin_at ? ` · in ${formatLagosDisplay(r.checkin_at)}` : ''}
                  {r.checkout_at ? ` · out ${formatLagosDisplay(r.checkout_at)}` : ''}
                </Text>
                {r.notes ? (
                  <Text className="text-sm text-muted mt-1">{r.notes}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <View className="mt-6">
        <PrimaryButton label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}
