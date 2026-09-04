import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, Switch, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { leaveRequestSchema, type LeaveRequestInput } from '@fazoo/validation';
import type { BaTodayResult } from '@fazoo/types';
import { PrimaryButton } from '@/components/primary-button';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { supabase } from '@/lib/supabase';
import { Screen, Card, HeroCard, SectionLabel, MultilineField, GlassCard, EmptyState } from '@/components/ui';

type LeaveRow = {
  id: string;
  leave_type: LeaveRequestInput['leave_type'];
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  review_note: string | null;
  created_at: string;
};

type LeaveFormState = Omit<LeaveRequestInput, 'policy_acknowledged'> & { policy_acknowledged: boolean };

const LEAVE_TYPES: { value: LeaveRequestInput['leave_type']; label: string }[] = [
  { value: 'annual_leave', label: 'Annual' },
  { value: 'sick_leave', label: 'Sick' },
  { value: 'paternity_leave', label: 'Paternity' },
  { value: 'maternity_leave', label: 'Maternity' },
  { value: 'casual_leave', label: 'Casual' },
  { value: 'other', label: 'Other' },
];

const DOCUMENTS = [
  ['medical_report', 'Medical report'],
  ['hospital_card', 'Hospital card'],
  ['travel_confirmation', 'Travel confirmation'],
  ['other_supporting_document', 'Other document'],
  ['not_applicable', 'Not applicable'],
] as const;

const initialForm: LeaveFormState = {
  leave_type: 'annual_leave',
  start_date: '',
  end_date: '',
  expected_return_date: '',
  supervisor_informed: true,
  supervisor_not_informed_reason: '',
  reason: '',
  supporting_document_types: [],
  policy_acknowledged: true,
};

function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} className={`mb-2 mr-2 rounded-full border px-4 py-2 ${selected ? 'border-white/20 bg-white/18' : 'border-white/12 bg-white/8'}`}>
      <Text className={`font-medium ${selected ? 'text-white' : 'text-white/72'}`}>{label}</Text>
    </Pressable>
  );
}

function toDate(value: string): Date {
  if (!value) return new Date();
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function DateField({ label, value, onChange, minimumDate, icon = 'calendar' }: { label: string; value: string; onChange: (value: string) => void; minimumDate?: Date; icon?: keyof typeof Ionicons.glyphMap }) {
  const [show, setShow] = useState(false);
  function onEvent(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShow(false);
    if (selected) onChange(toISO(selected));
  }
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-medium text-white/82">{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value || 'not set'}`} onPress={() => setShow((open) => !open)} className="h-14 flex-row items-center justify-between rounded-2xl border border-white/12 bg-white/10 px-4">
        <Text className={value ? 'text-white' : 'text-white/52'}>{value || 'Pick a date'}</Text>
        <Ionicons name={icon} size={18} color="#D8DDFF" />
      </Pressable>
      {show ? (
        <View className="mt-2 overflow-hidden rounded-2xl border border-white/12 bg-white">
          <DateTimePicker value={toDate(value)} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={minimumDate} onChange={onEvent} />
        </View>
      ) : null}
    </View>
  );
}

export default function LeavePage() {
  const [form, setForm] = useState<LeaveFormState>(initialForm);
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [assignments, setAssignments] = useState<BaTodayResult['assignments'][number]['assignment'][]>([]);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const loadRequests = useCallback(async () => {
    const { data } = await supabase.from('leave_requests').select('id, leave_type, start_date, end_date, status, review_note, created_at').order('created_at', { ascending: false }).limit(10);
    setRequests((data as LeaveRow[] | null) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const loadAssignments = useCallback(async () => {
    const { data } = await supabase.rpc('ba_today');
    const today = data as unknown as BaTodayResult | null;
    const list = today?.assignments.map((item) => item.assignment) ?? [];
    setAssignments(list);
    setAssignmentId((current) => current ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => { void loadRequests(); void loadAssignments(); }, [loadRequests, loadAssignments]);

  function toggleDocument(value: LeaveRequestInput['supporting_document_types'][number]) {
    setForm((current) => {
      if (value === 'not_applicable') {
        return { ...current, supporting_document_types: current.supporting_document_types.includes(value) ? [] : [value] };
      }
      const withoutNA = current.supporting_document_types.filter((item) => item !== 'not_applicable');
      return { ...current, supporting_document_types: withoutNA.includes(value) ? withoutNA.filter((item) => item !== value) : [...withoutNA, value] };
    });
  }

  async function submit() {
    const result = leaveRequestSchema.safeParse(form);
    if (!result.success) {
      setMessage({ tone: 'bad', text: result.error.issues[0]?.message ?? 'Check the form and try again.' });
      return;
    }
    if (!assignmentId) {
      setMessage({ tone: 'bad', text: 'Choose which assignment the leave is for.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const requestId = newRequestId();
    const payload = {
      p_assignment_id: assignmentId,
      p_leave_type: result.data.leave_type,
      p_start_date: result.data.start_date,
      p_end_date: result.data.end_date,
      p_expected_return_date: result.data.expected_return_date,
      p_supervisor_informed: result.data.supervisor_informed,
      p_supervisor_not_informed_reason: result.data.supervisor_not_informed_reason ?? '',
      p_reason: result.data.reason,
      p_supporting_document_types: result.data.supporting_document_types,
      p_policy_acknowledged: result.data.policy_acknowledged,
      p_client_request_id: requestId,
    };
    try {
      const { error } = await supabase.rpc('ba_submit_leave_request', payload);
      if (error) throw new Error(error.message);
      setForm(initialForm);
      setMessage({ tone: 'ok', text: 'Leave request sent for admin review.' });
      await loadRequests();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not submit leave request.';
      if (/network|fetch/i.test(text)) {
        await enqueue('leave_request', payload, requestId);
        setForm(initialForm);
        setMessage({ tone: 'ok', text: 'Saved offline. It will send automatically when you reconnect.' });
        setTimeout(() => void flushQueue(), 0);
      } else setMessage({ tone: 'bad', text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen bottomInset={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadRequests(); }} />}>
      <HeroCard eyebrow="Time away" title="Leave request" subtitle="Your verified profile and assignment determine how this request is reviewed. Complete the details carefully." icon="calendar-clear" />

      <SectionLabel>Assignment</SectionLabel>
      {assignments.length === 0 ? (
        <EmptyState title="No active assignments" body="Leave requests are linked to a store or school assignment." />
      ) : (
        <GlassCard>
          <View className="flex-row flex-wrap">
            {assignments.map((a) => {
              const label = a.campaign_name ? `${a.store_name || a.school_name || ''} · ${a.campaign_name}` : a.store_name || a.school_name || 'Assignment';
              return <Choice key={a.id} label={label} selected={assignmentId === a.id} onPress={() => setAssignmentId(a.id)} />;
            })}
          </View>
        </GlassCard>
      )}

      <SectionLabel>1. Leave details</SectionLabel>
      <Card className="mb-4">
        <Text className="mb-2 text-lg font-bold text-ink">Type of leave</Text>
        <View className="mb-2 flex-row flex-wrap rounded-3xl bg-slate-950 px-3 py-3">
          {LEAVE_TYPES.map((item) => <Choice key={item.value} label={item.label} selected={form.leave_type === item.value} onPress={() => setForm((v) => ({ ...v, leave_type: item.value }))} />)}
        </View>
        <DateField label="Start date" value={form.start_date} minimumDate={new Date()} onChange={(value) => setForm((v) => ({ ...v, start_date: value }))} />
        <DateField label="End date" value={form.end_date} minimumDate={toDate(form.start_date) || new Date()} onChange={(value) => setForm((v) => ({ ...v, end_date: value }))} />
        <DateField label="Expected return date" value={form.expected_return_date} minimumDate={toDate(form.end_date) || new Date()} icon="return-up-back" onChange={(value) => setForm((v) => ({ ...v, expected_return_date: value }))} />
      </Card>

      <SectionLabel>2. Communication</SectionLabel>
      <Card className="mb-4">
        <View className="mb-4 flex-row items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-4">
          <View className="flex-1">
            <Text className="font-semibold text-slate-800">Supervisor informed</Text>
            <Text className="mt-1 text-sm leading-6 text-slate-500">Confirm you have discussed this request.</Text>
          </View>
          <Switch value={form.supervisor_informed} onValueChange={(value) => setForm((v) => ({ ...v, supervisor_informed: value }))} trackColor={{ true: '#5B6CFF' }} />
        </View>
        {!form.supervisor_informed ? (
          <MultilineField label="Why have they not been informed?" placeholder="Explain briefly" value={form.supervisor_not_informed_reason ?? ''} onChangeText={(value) => setForm((v) => ({ ...v, supervisor_not_informed_reason: value }))} />
        ) : null}
        <MultilineField label="Reason for leave" placeholder="Provide the information the reviewing admin needs" value={form.reason} onChangeText={(value) => setForm((v) => ({ ...v, reason: value }))} />
      </Card>

      <SectionLabel>3. Supporting documents</SectionLabel>
      <GlassCard>
        <Text className="mb-3 text-sm leading-6 text-white/72">Select the documents you can provide to your supervisor.</Text>
        <View className="flex-row flex-wrap">
          {DOCUMENTS.map(([value, label]) => <Choice key={value} label={label} selected={form.supporting_document_types.includes(value)} onPress={() => toggleDocument(value)} />)}
        </View>
      </GlassCard>

      <SectionLabel>Acknowledgement</SectionLabel>
      <GlassCard>
        <Text className="text-sm leading-6 text-white/76">By sending this form, I confirm the details are accurate and understand the request is not approved until an admin confirms it.</Text>
        <View className="mt-4 flex-row items-center justify-between gap-4">
          <Text className="font-semibold text-white">I acknowledge</Text>
          <Switch value={form.policy_acknowledged} onValueChange={(value) => setForm((v) => ({ ...v, policy_acknowledged: value }))} trackColor={{ true: '#5B6CFF' }} />
        </View>
      </GlassCard>

      {message ? <Text accessibilityRole="alert" className={`mb-3 mt-4 text-sm font-medium ${message.tone === 'ok' ? 'text-emerald-200' : 'text-rose-200'}`}>{message.text}</Text> : null}
      <PrimaryButton label="Send leave request" busy={busy} onPress={() => void submit()} icon="send" />

      <SectionLabel>My requests</SectionLabel>
      {loading ? <Text className="text-white/70">Loading…</Text> : null}
      {!loading && requests.length === 0 ? <EmptyState title="No leave requests yet" body="Your recent submissions will appear here." /> : null}
      {requests.map((request) => (
        <Card key={request.id} className="mb-4">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-lg font-bold capitalize text-ink">{request.leave_type.replaceAll('_', ' ')}</Text>
              <Text className="mt-1 text-sm text-slate-500">{request.start_date} — {request.end_date}</Text>
            </View>
            <Text className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${request.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : request.status === 'denied' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{request.status}</Text>
          </View>
          {request.review_note ? <Text className="mt-3 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-600">Admin note: {request.review_note}</Text> : null}
        </Card>
      ))}
    </Screen>
  );
}
