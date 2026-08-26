import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';

export default function SickLeave() {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const requestId = newRequestId();
    const payload = {
      p_note: note.trim() || undefined,
      p_client_request_id: requestId,
    };
    try {
      const { error: rpcError } = await supabase.rpc('ba_mark_sick_leave', payload);
      if (rpcError) throw new Error(rpcError.message);
      router.replace('/today');
      setTimeout(() => void flushQueue(), 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not record sick leave.';
      if (/network|fetch/i.test(message)) {
        await enqueue('sick_leave', payload, requestId);
        router.replace('/today');
        setTimeout(() => void flushQueue(), 0);
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function confirmDialog() {
    Alert.alert(
      'Mark sick leave?',
      'This records sick leave for today and prevents check-in. You cannot undo it yourself.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark sick leave', style: 'destructive', onPress: () => void confirm() },
      ],
    );
  }

  return (
    <View className="flex-1 bg-lavender px-6 pt-16">
      <Text className="text-2xl font-bold text-ink">Mark sick leave</Text>
      <Text className="text-muted mt-2 mb-6">
        Records sick leave for today (Nigerian date). Check-in will be disabled
        for the rest of the day and your supervisor will see it.
      </Text>

      <TextInput
        placeholder="Optional note for your supervisor"
        placeholderTextColor="#9a94a5"
        multiline
        className="rounded-xl bg-white p-4 min-h-24 mb-4"
        value={note}
        onChangeText={setNote}
        maxLength={500}
      />

      {error ? <StatusPill tone="bad" label={error} /> : null}

      <PrimaryButton label="Confirm sick leave" variant="danger" onPress={confirmDialog} busy={busy} />
      <PrimaryButton label="Cancel" variant="ghost" onPress={() => router.back()} />
    </View>
  );
}
