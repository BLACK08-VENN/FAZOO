import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { formatLagosDisplay } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import { readUserCache, writeUserCache } from '@/lib/cache';
import { PrimaryButton } from '@/components/primary-button';
import { Card, EmptyState, Page, ScreenHeader } from '@/components/ui';

interface RetailLog {
  id: string;
  attendance_date: string;
  attendance_status: string;
  status: string;
  checkin_at: string | null;
  checkout_at: string | null;
  notes: string | null;
}

/**
 * Retail campaign history. The school programme no longer logs here — its
 * history lives on the booklist pipeline (/schools → /school-job).
 */
export default function CampaignLogs() {
  const params = useLocalSearchParams<{
    campaignId?: string;
    campaignName?: string;
    storeName?: string;
  }>();
  const [logs, setLogs] = useState<RetailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
      setError(null);
      const campaignId = params.campaignId;
      const cacheKey = campaignId ? `campaign-logs.retail.${campaignId}` : null;
      if (cacheKey) {
        const cached = await readUserCache<RetailLog[]>(cacheKey);
        if (cached) {
          setLogs(cached);
          setLoading(false);
        }
      }
      if (campaignId) {
        const { data, error: err } = await supabase
          .from('daily_logs')
          .select('id, attendance_date, attendance_status, status, checkin_at, checkout_at, notes')
          .eq('campaign_id', campaignId)
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
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = request;
    return request;
  }, [params.campaignId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Page
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
      <ScreenHeader
        eyebrow="Logs"
        title={params.campaignName ?? ''}
        subtitle={params.storeName}
        onBack={() => router.back()}
      />

      {error ? (
        <Text role="alert" className="font-sans mb-3 text-sm font-medium text-bad">
          {error}
        </Text>
      ) : null}

      {loading ? (
        <View className="mt-10 items-center justify-center">
          <ActivityIndicator size="large" color="#7B2FBE" />
        </View>
      ) : logs.length === 0 ? (
        <EmptyState title="No logs yet" body="No logs yet for this campaign." />
      ) : (
        <View className="mt-2">
          {logs.map((log) => (
            <Card key={log.id} className="mb-3">
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="font-sans text-lg font-bold text-ink">{log.attendance_date}</Text>
                  <Text className="font-sans mt-1 text-sm capitalize leading-6 text-muted">
                    {log.attendance_status.replaceAll('_', ' ')}
                    {log.checkin_at ? ` · in ${formatLagosDisplay(log.checkin_at)}` : ''}
                    {log.checkout_at ? ` · out ${formatLagosDisplay(log.checkout_at)}` : ''}
                  </Text>
                </View>
                <Text className="font-sans rounded-full bg-lavender px-3 py-1 text-xs font-semibold capitalize text-ink/80">
                  {log.status}
                </Text>
              </View>
              {log.notes ? (
                <Text className="font-sans mt-3 text-sm leading-6 text-muted">{log.notes}</Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <PrimaryButton label="Back" variant="ghost" onPress={() => router.back()} />
    </Page>
  );
}
