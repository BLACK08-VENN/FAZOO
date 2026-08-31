import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import { formatLagosDisplay } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import type { Database } from '@fazoo/database/database.types';

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

/** Attendance & activity history — own records only (RLS enforced). */
export default function History() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [{ data: logsData, error: logsError }, { data: photosData, error: photosError }] =
      await Promise.all([
        supabase
          .from('daily_logs')
          .select('*')
          .order('attendance_date', { ascending: false })
          .limit(60),
        supabase
          .from('daily_log_photos')
          .select('*')
          .order('captured_at', { ascending: false })
          .limit(120),
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
      {logs.map((l) => {
        const logPhotos = photosByLog.get(l.id) ?? [];
        return (
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
            <PhotoThumbnails photos={logPhotos} />
          </View>
        );
      })}
      {!loading && logs.length === 0 ? (
        <Text className="text-muted">No attendance history yet.</Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * Renders the BA's own check-in/checkout photos through short-lived signed
 * URLs minted from their session (storage_read_own policy). URLs expire in
 * minutes and are never persisted. Thumbnail state is keyed by log so it
 * survives pull-to-refresh re-renders.
 */
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
        const { data } = await supabase.storage
          .from('daily-log-photos')
          .createSignedUrl(photo.storage_path, 300);
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
    <View className="mt-2 flex-row flex-wrap gap-2">
      {photos.map((photo) => {
        const url = urls[photo.storage_path];
        const isFailed = failed[photo.storage_path];
        if (!url) {
          return (
            <View
              key={photo.id}
              className="h-20 w-20 items-center justify-center rounded-lg bg-ink/5"
            >
              <ActivityIndicator size="small" color="#7B2FBE" />
            </View>
          );
        }
        return (
          <View key={photo.id} className="w-20">
            <Image
              source={{ uri: url }}
              className={`h-20 w-20 rounded-lg bg-ink/5 ${isFailed ? 'opacity-40' : ''}`}
              resizeMode="cover"
              accessibilityLabel={PHOTO_TYPE_LABELS[photo.photo_type]}
              onError={() => setFailed((prev) => ({ ...prev, [photo.storage_path]: true }))}
            />
            <Text className="text-center text-[10px] text-muted mt-0.5">
              {PHOTO_TYPE_LABELS[photo.photo_type]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
