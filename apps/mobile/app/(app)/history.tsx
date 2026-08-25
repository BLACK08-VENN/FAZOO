import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { formatLagosDisplay } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import type { Database } from '@fazoo/database/database.types';

type Log = Database['public']['Tables']['daily_logs']['Row'];

/** Attendance & activity history — own records only (RLS enforced). */
export default function History() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: queryError } = await supabase
      .from('daily_logs')
      .select('*')
      .order('attendance_date', { ascending: false })
      .limit(60);
    if (queryError) setError('History could not be loaded. Pull down to retry.');
    else setLogs((data as Log[] | null) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      <Text className="text-xs text-muted mb-2">History</Text>
      {loading ? <Text className="text-muted">Loading…</Text> : null}
      {error ? (
        <Text role="alert" className="text-bad font-medium mb-3">
          {error}
        </Text>
      ) : null}
      {logs.map((l) => (
        <View key={l.id} className="rounded-xl bg-white px-4 py-3 mb-2">
          <View className="flex-row justify-between">
            <Text className="font-semibold text-charcoal">{l.attendance_date}</Text>
            <Text className="text-muted">{l.status}</Text>
          </View>
          <Text className="capitalize">
            {l.attendance_status.replace('_', ' ')}
            {l.checkin_at ? ` · in ${formatLagosDisplay(l.checkin_at)}` : ''}
            {l.checkout_at ? ` · out ${formatLagosDisplay(l.checkout_at)}` : ''}
          </Text>
        </View>
      ))}
      {!loading && logs.length === 0 ? (
        <Text className="text-muted">No attendance history yet.</Text>
      ) : null}
    </ScrollView>
  );
}
