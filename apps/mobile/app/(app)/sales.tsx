import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { BaTodayResult } from '@fazoo/types';
import { saleEntrySchema } from '@fazoo/validation';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { classifySyncError } from '@/lib/offline/errors';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';

export default function Sales() {
  const [skus, setSkus] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [skuId, setSkuId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<BaTodayResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState('');

  const load = useCallback(async () => {
    const { data: t } = await supabase.rpc('ba_today');
    const result = t as unknown as BaTodayResult;
    setToday(result);
    if (result?.assignment) {
      const { data: skuRows } = await supabase
        .from('skus')
        .select('id, name, code')
        .eq('campaign_id', result.assignment.campaign_id)
        .eq('status', 'active')
        .order('name');
      setSkus((skuRows as Array<{ id: string; name: string; code: string }> | null) ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setError(null);
    const parsed = saleEntrySchema.safeParse({
      sku_id: skuId,
      quantity: Number(quantity),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the sale details.');
      return;
    }

    setBusy(true);
    const requestId = newRequestId();
    const payload = {
      p_sku_id: parsed.data.sku_id,
      p_quantity: parsed.data.quantity,
      p_client_request_id: requestId,
      p_recorded_at_hint: new Date().toISOString(),
    };
    try {
      const { error: rpcError } = await supabase.rpc('ba_record_sale', payload);
      if (rpcError) throw new Error(rpcError.message);
    } catch (err) {
      if (classifySyncError(err) === 'terminal') {
        setError(err instanceof Error ? err.message : 'The sale was rejected.');
      } else {
        await enqueue('sale', payload, requestId);
      }
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
    await enqueue(
      'update_sale',
      { p_sales_entry_id: editingId, p_quantity: value, p_client_request_id: requestId },
      requestId,
    );
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
    await enqueue(
      'delete_sale',
      { p_sales_entry_id: id, p_client_request_id: requestId },
      requestId,
    );
    await flushQueue();
    await load();
  }

  return (
    <ScrollView className="flex-1 bg-lavender" contentContainerClassName="px-5 py-8">
      <Text className="text-xs text-muted">Record a sale</Text>
      <Text className="text-2xl font-bold text-ink mb-4">
        Today: {today?.total_units_today ?? 0} units
      </Text>

      {skus.length === 0 ? (
        <StatusPill tone="warn" label="No active SKUs on your campaign." />
      ) : (
        <>
          <Text className="font-medium text-charcoal mb-2">SKU</Text>
          <View className="rounded-xl overflow-hidden mb-4">
            {skus.map((s) => (
              <Text
                key={s.id}
                onPress={() => setSkuId(s.id)}
                role="button"
                className={`px-4 py-4 text-lg border-b border-ink/5 ${
                  skuId === s.id ? 'bg-primary/10 font-semibold' : 'bg-white'
                }`}
              >
                {s.name}
                <Text className="text-muted text-sm"> · {s.code}</Text>
                {skuId === s.id ? ' ✓' : ''}
              </Text>
            ))}
          </View>

          <Text className="font-medium text-charcoal mb-2">Quantity</Text>
          <TextInput
            keyboardType="number-pad"
            className="h-14 rounded-xl bg-white px-4 text-lg mb-1"
            value={quantity}
            onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ''))}
            placeholder="1"
            placeholderTextColor="#9a94a5"
          />
          {error ? <StatusPill tone="bad" label={error} /> : null}

          <PrimaryButton label="Save sale" onPress={() => void submit()} busy={busy} />
        </>
      )}

      {/* Line items recorded today */}
      {(today?.sales ?? []).length > 0 ? (
        <View className="mt-6 rounded-2xl bg-white p-4">
          <Text className="font-semibold mb-2">Recorded today</Text>
          {(today?.sales ?? []).map((s) => (
            <View key={s.id} className="py-2 border-b border-ink/5">
              <View className="flex-row justify-between items-center">
                <Text>{s.sku_name}</Text>
                <Text className="tabular-nums">×{s.quantity}</Text>
              </View>
              {today?.log?.status === 'open' ? (
                editingId === s.id ? (
                  <View className="flex-row items-center mt-2">
                    <TextInput
                      accessibilityLabel={`Quantity for ${s.sku_name}`}
                      keyboardType="number-pad"
                      value={editQuantity}
                      onChangeText={(value) => setEditQuantity(value.replace(/[^0-9]/g, ''))}
                      className="h-11 flex-1 rounded-lg bg-lavender px-3"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Save ${s.sku_name} quantity`}
                      onPress={() => void saveEdit()}
                      className="p-3"
                    >
                      <Text className="text-primary font-semibold">Save</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setEditingId(null)}
                      className="p-3"
                    >
                      <Text className="text-muted">Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="flex-row justify-end">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${s.sku_name}`}
                      onPress={() => {
                        setEditingId(s.id);
                        setEditQuantity(String(s.quantity));
                      }}
                      className="p-3"
                    >
                      <Text className="text-primary font-semibold">Edit</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${s.sku_name}`}
                      onPress={() => confirmDelete(s.id, s.sku_name)}
                      className="p-3"
                    >
                      <Text className="text-bad font-semibold">Delete</Text>
                    </Pressable>
                  </View>
                )
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <PrimaryButton label="Back to today" variant="ghost" onPress={() => router.back()} />
    </ScrollView>
  );
}
