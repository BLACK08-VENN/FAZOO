import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { BaTodayResult } from '@fazoo/types';
import { saleEntrySchema } from '@fazoo/validation';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { classifySyncError } from '@/lib/offline/errors';
import { readCachedToday } from '@/lib/cache';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { Screen, ScreenHeader, Card, Field, EmptyState } from '@/components/ui';

export default function Sales() {
  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
  const [selected, setSelected] = useState<BaTodayResult['assignments'][number] | null>(null);
  const [skus, setSkus] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [skuId, setSkuId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState('');

  const load = useCallback(async () => {
    const { data: t } = await supabase.rpc('ba_today');
    const result = (t as unknown as BaTodayResult | null) ?? (await readCachedToday());
    const match = result?.assignments.find((item) => item.assignment.id === assignmentParam) ?? result?.assignments[0];
    setSelected(match ?? null);
    if (match?.assignment.campaign_id) {
      const { data: skuRows } = await supabase.from('skus').select('id, name, code').eq('campaign_id', match.assignment.campaign_id).eq('status', 'active').order('name');
      setSkus((skuRows as Array<{ id: string; name: string; code: string }> | null) ?? []);
    } else {
      setSkus([]);
    }
  }, [assignmentParam]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    setError(null);
    const parsed = saleEntrySchema.safeParse({ sku_id: skuId, quantity: Number(quantity) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the sale details.');
      return;
    }
    setBusy(true);
    const requestId = newRequestId();
    const payload = { p_sku_id: parsed.data.sku_id, p_quantity: parsed.data.quantity, p_client_request_id: requestId, p_recorded_at_hint: new Date().toISOString(), p_daily_log_id: selected?.log?.id };
    try {
      const { error: rpcError } = await supabase.rpc('ba_record_sale', payload);
      if (rpcError) throw new Error(rpcError.message);
    } catch (err) {
      if (classifySyncError(err) === 'terminal') setError(err instanceof Error ? err.message : 'The sale was rejected.');
      else await enqueue('sale', payload, requestId);
    } finally {
      setBusy(false);
      setQuantity('');
      void flushQueue();
      void load();
    }
  }

  async function saveEdit() {
    const value = Number(editQuantity);
    if (!editingId || !Number.isInteger(value) || value < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    const requestId = newRequestId();
    await enqueue('update_sale', { p_sales_entry_id: editingId, p_quantity: value, p_client_request_id: requestId }, requestId);
    setEditingId(null);
    setEditQuantity('');
    await flushQueue();
    await load();
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert('Delete sale?', `${name} will be removed from today’s sales.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteSale(id) },
    ]);
  }

  async function deleteSale(id: string) {
    const requestId = newRequestId();
    await enqueue('delete_sale', { p_sales_entry_id: id, p_client_request_id: requestId }, requestId);
    await flushQueue();
    await load();
  }

  const logOpen = selected?.log?.status === 'open';

  return (
    <Screen bottomInset={false}>
      <ScreenHeader eyebrow="Record a sale" title={`Today: ${selected?.total_units_today ?? 0} units`} subtitle={selected ? `${selected.assignment.store_name || selected.assignment.campaign_name}${selected.assignment.campaign_name ? ` · ${selected.assignment.campaign_name}` : ''}` : 'Choose an active assignment to record units sold.'} />

      {skus.length === 0 ? (
        <EmptyState title="No active SKUs" body="There are no active SKUs on this campaign yet." />
      ) : (
        <>
          <Card className="mb-4">
            <Text className="mb-3 text-lg font-bold text-ink">Choose SKU</Text>
            {skus.map((s) => (
              <Pressable key={s.id} onPress={() => setSkuId(s.id)} accessibilityRole="button" className={`mb-2 rounded-2xl border px-4 py-4 ${skuId === s.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                <Text className="text-base font-semibold text-slate-800">{s.name}</Text>
                <Text className="mt-1 text-sm text-slate-500">{s.code}{skuId === s.id ? ' · selected' : ''}</Text>
              </Pressable>
            ))}
          </Card>

          <Field label="Quantity" keyboardType="number-pad" value={quantity} onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ''))} placeholder="1" />
          {error ? <StatusPill tone="bad" label={error} /> : null}
          <PrimaryButton label="Save sale" onPress={() => void submit()} busy={busy} icon="add" />
        </>
      )}

      {(selected?.sales ?? []).length > 0 ? (
        <Card className="mt-6">
          <Text className="mb-2 text-lg font-bold text-ink">Recorded today</Text>
          {(selected?.sales ?? []).map((s, index, arr) => (
            <View key={s.id} className={`py-3 ${index < arr.length - 1 ? 'border-b border-slate-200' : ''}`}>
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 text-base font-medium text-slate-800">{s.sku_name}</Text>
                <Text className="tabular-nums text-base text-slate-700">×{s.quantity}</Text>
              </View>
              {logOpen ? (
                editingId === s.id ? (
                  <>
                    <Field label={`Quantity for ${s.sku_name}`} keyboardType="number-pad" value={editQuantity} onChangeText={(value) => setEditQuantity(value.replace(/[^0-9]/g, ''))} placeholder="Quantity" />
                    <View className="flex-row gap-3">
                      <View className="flex-1"><PrimaryButton label="Save" onPress={() => void saveEdit()} /></View>
                      <View className="flex-1"><PrimaryButton label="Cancel" variant="ghost" onPress={() => setEditingId(null)} /></View>
                    </View>
                  </>
                ) : (
                  <View className="mt-2 flex-row gap-3">
                    <View className="flex-1"><PrimaryButton label="Edit" variant="secondary" onPress={() => { setEditingId(s.id); setEditQuantity(String(s.quantity)); }} /></View>
                    <View className="flex-1"><PrimaryButton label="Delete" variant="danger" onPress={() => confirmDelete(s.id, s.sku_name)} /></View>
                  </View>
                )
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <PrimaryButton label="Back to today" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
