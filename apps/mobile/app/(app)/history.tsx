import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, Text, View } from 'react-native';
import { formatLagosDisplay } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import type { Database } from '@fazoo/database/database.types';
import { Screen, ScreenHeader, Card, EmptyState } from '@/components/ui';

type Log = Database['public']['Tables']['daily_logs']['Row'];
type Photo = Database['public']['Tables']['daily_log_photos']['Row'];
type PhotoType = Photo['photo_type'];

const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  stock_shelf: 'Stock',
  uniform_selfie: 'Selfie',
  checkout_stock_shelf: 'Out: Stock',
  checkout_uniform_selfie: 'Out: Selfie',
  checkout: 'Checkout',
  other: 'Photo',
};

export default function History() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [{ data: logsData, error: logsError }, { data: photosData, error: photosError }] = await Promise.all([
      supabase.from('daily_logs').select('*').order('attendance_date', { ascending: false }).limit(60),
      supabase.from('daily_log_photos').select('*').order('captured_at', { ascending: false }).limit(120),
    ]);
    if (logsError || photosError) {
      setError('History could not be loaded. Pull down to retry.');
    } else {
      setLogs((logsData as Log[] | null) ?? []);
      setPhotos((photosData as Photo[] | null) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const photosByLog = new Map<string, Photo[]>();
  for (const photo of photos) {
    const bucket = photosByLog.get(photo.daily_log_id) ?? [];
    bucket.push(photo);
    photosByLog.set(photo.daily_log_id, bucket);
  }

  return (
    <Screen bottomInset={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <ScreenHeader eyebrow="History" title="Your activity" subtitle="Attendance records, timings, and submitted evidence from recent days." />
      {loading ? <Text className="text-white/70">Loading…</Text> : null}
      {error ? <Text role="alert" className="mb-3 text-sm font-medium text-rose-200">{error}</Text> : null}
      {!loading && logs.length === 0 ? (
        <EmptyState title="No attendance history yet" body="Your check-ins and photos will appear here after your first completed visit." />
      ) : null}
      {logs.map((l) => (
        <Card key={l.id} className="mb-4">
          <View className="flex-row justify-between gap-4">
            <View className="flex-1">
              <Text className="text-lg font-bold text-ink">{l.attendance_date}</Text>
              <Text className="mt-1 capitalize text-slate-600">
                {l.attendance_status.replace('_', ' ')}
                {l.checkin_at ? ` · in ${formatLagosDisplay(l.checkin_at)}` : ''}
                {l.checkout_at ? ` · out ${formatLagosDisplay(l.checkout_at)}` : ''}
              </Text>
            </View>
            <Text className="rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-600">{l.status}</Text>
          </View>
          <PhotoThumbnails photos={photosByLog.get(l.id) ?? []} />
        </Card>
      ))}
    </Screen>
  );
}

function PhotoThumbnails({ photos }: { photos: Photo[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const seen = new Set<string>();
    async function mint() {
      const next: Record<string, string> = {};
      for (const photo of photos) {
        if (seen.has(photo.storage_path)) continue;
        seen.add(photo.storage_path);
        const { data } = await supabase.storage.from('daily-log-photos').createSignedUrl(photo.storage_path, 300);
        if (active && data) next[photo.storage_path] = data.signedUrl;
      }
      if (active) setUrls((prev) => ({ ...prev, ...next }));
    }
    void mint();
    return () => {
      active = false;
    };
  }, [photos]);

  if (photos.length === 0) return null;

  return (
    <View className="mt-4 flex-row flex-wrap gap-3">
      {photos.map((photo) => {
        const url = urls[photo.storage_path];
        const isFailed = failed[photo.storage_path];
        if (!url) {
          return (
            <View key={photo.id} className="h-20 w-20 items-center justify-center rounded-2xl bg-slate-100">
              <ActivityIndicator size="small" color="#5B6CFF" />
            </View>
          );
        }
        return (
          <View key={photo.id} className="w-20">
            <Image
              source={{ uri: url }}
              className={`h-20 w-20 rounded-2xl bg-slate-100 ${isFailed ? 'opacity-40' : ''}`}
              resizeMode="cover"
              accessibilityLabel={PHOTO_TYPE_LABELS[photo.photo_type]}
              onError={() => setFailed((prev) => ({ ...prev, [photo.storage_path]: true }))}
            />
            <Text className="mt-1 text-center text-[10px] text-slate-500">{PHOTO_TYPE_LABELS[photo.photo_type]}</Text>
          </View>
        );
      })}
    </View>
  );
}
