import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { HeroCard, Screen, SectionLabel, MultilineField, GlassCard } from '@/components/ui';

export default function SickLeave() {
  const { assignment: assignmentParam } = useLocalSearchParams<{ assignment?: string }>();
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
      p_assignment_id: assignmentParam,
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
    <Screen>
      <HeroCard
        eyebrow="Attendance status"
        title="Mark sick leave"
        subtitle="Let your supervisor know you are unavailable today. This blocks check-in for the rest of the day."
        icon="medkit"
      />

      <SectionLabel>Details</SectionLabel>
      <GlassCard>
        <Text className="text-base leading-6 text-white/78">
          Sick leave is recorded against today’s server-verified attendance date and becomes visible to your supervisor immediately or on next sync.
        </Text>
      </GlassCard>

      <SectionLabel>Optional note</SectionLabel>
      <MultilineField
        label="Message to your supervisor"
        placeholder="Add any context that will help your supervisor respond quickly"
        value={note}
        onChangeText={setNote}
        maxLength={500}
      />

      {error ? <StatusPill tone="bad" label={error} /> : null}

      <PrimaryButton label="Confirm sick leave" variant="danger" onPress={confirmDialog} busy={busy} icon="warning" />
      <PrimaryButton label="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}