import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { formatLagosDisplay } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import { readUserCache, writeUserCache } from '@/lib/cache';
import { PrimaryButton } from '@/components/primary-button';
import { Page, ScreenHeader, Card, EmptyState } from '@/components/ui';

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
  const params = useLocalSearchParams<{ kind: string; campaignId?: string; campaignName?: string; storeName?: string; schoolId?: string; schoolName?: string; }>();
  const isVeda = params.kind === 'schools';
  const [logs, setLogs] = useState<(RetailLog | VedaLog)[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
    setError(null);
    const targetId = isVeda ? params.schoolId : params.campaignId;
    const cacheKey = targetId ? `campaign-logs.${isVeda ? 'schools' : 'retail'}.${targetId}` : null;
    if (cacheKey) {
      const cached = await readUserCache<(RetailLog | VedaLog)[]>(cacheKey);
      if (cached) {
        setLogs(cached);
        setLoading(false);
      }
    }
    if (isVeda && params.schoolId) {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      if (!userId) {
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
      else {
        const nextLogs = (data as VedaLog[] | null) ?? [];
        setLogs(nextLogs);
        if (cacheKey) void writeUserCache(cacheKey, nextLogs);
      }
    } else if (params.campaignId) {
      const { data, error: err } = await supabase
        .from('daily_logs')
        .select('id, attendance_date, attendance_status, status, checkin_at, checkout_at, notes')
        .eq('campaign_id', params.campaignId)
        .order('attendance_date', { ascending: false })
        .limit(30);
      if (err) setError('Could not load logs.');
      else {
        const nextLogs = (data as RetailLog[] | null) ?? [];
        setLogs(nextLogs);
        if (cacheKey) void writeUserCache(cacheKey, nextLogs);
      }
    }
    setLoading(false);
    setRefreshing(false);
    })().finally(() => { inFlight.current = null; });
    inFlight.current = request;
    return request;
  }, [isVeda, params.schoolId, params.campaignId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const headerTitle = isVeda ? params.schoolName : params.campaignName;
  const headerSubtitle = isVeda ? 'Recent activity and visit notes' : params.storeName;
  const canAddVedaLog = isVeda && Boolean(params.schoolId);

  return (
    <Page refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <ScreenHeader eyebrow="Logs" title={headerTitle ?? ''} subtitle={headerSubtitle ?? undefined} onBack={() => router.back()} />

      {error ? <Text role="alert" className="font-sans mb-3 text-sm font-medium text-bad">{error}</Text> : null}

      {canAddVedaLog ? (
        <PrimaryButton
          label="Add new log"
          onPress={() => router.push({ pathname: '/veda-new-log', params: { schoolId: params.schoolId, schoolName: params.schoolName } })}
          icon="add-circle"
        />
      ) : null}

      {loading ? (
        <View className="mt-10 items-center justify-center">
          <ActivityIndicator size="large" color="#7B2FBE" />
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
                      <Text className="font-sans text-lg font-bold text-ink">{v.session_date}</Text>
                      <Text className="font-sans mt-1 text-sm leading-6 text-muted">
                        Learners: {v.learner_count}
                        {v.checkin_at ? ` · in ${formatLagosDisplay(v.checkin_at)}` : ''}
                        {v.checkout_at ? ` · out ${formatLagosDisplay(v.checkout_at)}` : ''}
                      </Text>
                    </View>
                    <Text className="font-sans rounded-full bg-lavender px-3 py-1 text-xs font-semibold capitalize text-ink/80">{v.status}</Text>
                  </View>
                  {v.notes ? <Text className="font-sans mt-3 text-sm leading-6 text-muted">{v.notes}</Text> : null}
                </Card>
              );
            }
            const r = log as RetailLog;
            return (
              <Card key={r.id} className="mb-3">
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="font-sans text-lg font-bold text-ink">{r.attendance_date}</Text>
                    <Text className="font-sans mt-1 text-sm capitalize leading-6 text-muted">
                      {r.attendance_status.replace('_', ' ')}
                      {r.checkin_at ? ` · in ${formatLagosDisplay(r.checkin_at)}` : ''}
                      {r.checkout_at ? ` · out ${formatLagosDisplay(r.checkout_at)}` : ''}
                    </Text>
                  </View>
                  <Text className="font-sans rounded-full bg-lavender px-3 py-1 text-xs font-semibold capitalize text-ink/80">{r.status}</Text>
                </View>
                {r.notes ? <Text className="font-sans mt-3 text-sm leading-6 text-muted">{r.notes}</Text> : null}
              </Card>
            );
          })}
        </View>
      )}

      <PrimaryButton label="Back" variant="ghost" onPress={() => router.back()} />
    </Page>
  );
}
