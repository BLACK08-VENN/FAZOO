import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { BaTodayResult } from '@fazoo/types';
import { stockCountEntrySchema } from '@fazoo/validation';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { readCachedToday } from '@/lib/cache';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { Page, ScreenHeader, Card, Field, EmptyState } from '@/components/ui';

export default function OpeningCounts() {
  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
  const [selected, setSelected] = useState<BaTodayResult['assignments'][number] | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const { data: t } = await supabase.rpc('ba_today');
    const result = (t as unknown as BaTodayResult | null) ?? (await readCachedToday());
    const match = result?.assignments.find((item) => item.assignment.id === assignmentParam) ?? result?.assignments[0];
    setSelected(match ?? null);
    const initial: Record<string, string> = {};
    for (const row of match?.stock ?? []) {
      if (row.opening != null) initial[row.sku_id] = String(row.opening);
    }
    setCounts(initial);
  }, [assignmentParam]);

  useEffect(() => { void load(); }, [load]);

  const skus = selected?.stock ?? [];
  const alreadyRecorded = skus.length > 0 && skus.every((s) => counts[s.sku_id] != null && counts[s.sku_id] !== '');

  async function save() {
    setError(null);
    const entries = skus.map((s) => ({
      sku_id: s.sku_id,
      count_type: 'opening' as const,
      quantity: Number(counts[s.sku_id]),
    }));
    if (entries.length === 0) {
      setError('No SKUs to count on this campaign yet.');
      return;
    }
    for (const entry of entries) {
      if (counts[entry.sku_id] == null || counts[entry.sku_id] === '') {
        setError('Enter an opening count for every SKU.');
        return;
      }
      const parsed = stockCountEntrySchema.safeParse(entry);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Check the counts.');
        return;
      }
    }
    setBusy(true);
    try {
      for (const entry of entries) {
        const requestId = newRequestId();
        const payload = {
          p_sku_id: entry.sku_id,
          p_count_type: 'opening',
          p_quantity: entry.quantity,
          p_client_request_id: requestId,
          p_daily_log_id: selected?.log?.id,
        };
        await enqueue('record_stock_snapshot', payload, requestId);
      }
      setSaved(true);
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the counts — they will sync automatically.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page bottomInset={false}>
      <ScreenHeader eyebrow="Opening stock" title={saved ? 'Opening counts saved' : 'Opening stock counts'} subtitle={selected ? `${selected.assignment.store_name || selected.assignment.campaign_name} · opening counts become today's baseline` : 'Loading your assignment…'} onBack={() => router.back()} />

      {skus.length === 0 ? (
        <>
          <EmptyState title="No SKUs to count" body="This campaign has no active SKUs yet — opening counts will unlock once the admin adds products." />
          <PrimaryButton label="Back to today" variant="ghost" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Card className="mb-4">
            <View className="mb-2 rounded-xl bg-lavender px-4 py-3">
              <Text className="font-sans text-sm leading-5 text-charcoal">Count what is on the shelf now. The closing count you enter at the end of the day is subtracted from this to show units sold.</Text>
            </View>
            {skus.map((s) => (
              <View key={s.sku_id} className="mb-4">
                <Text className="font-sans text-base font-semibold text-ink">{s.sku_name}</Text>
                <Text className="font-sans mb-2 text-sm text-muted">{s.sku_code}</Text>
                <Field
                  label="Opening count"
                  keyboardType="number-pad"
                  value={counts[s.sku_id] ?? ''}
                  onChangeText={(v) => setCounts((prev) => ({ ...prev, [s.sku_id]: v.replace(/[^0-9]/g, '') }))}
                  placeholder="0"
                />
              </View>
            ))}
          </Card>
          {error ? <StatusPill tone="bad" label={error} /> : null}
          <PrimaryButton
            label={alreadyRecorded && !saved ? 'Update opening counts' : 'Save opening counts'}
            onPress={() => void save()}
            busy={busy}
            disabled={skus.length === 0}
            icon="checkmark-circle"
          />
          <PrimaryButton label="Back to today" variant="ghost" onPress={() => router.back()} />
        </>
      )}
    </Page>
  );
}