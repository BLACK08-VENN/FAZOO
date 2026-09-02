import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { leaveRequestSchema, type LeaveRequestInput } from '@fazoo/validation';
import type { BaTodayResult } from '@fazoo/types';
import { PrimaryButton } from '@/components/primary-button';
import { enqueue, newRequestId } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { supabase } from '@/lib/supabase';

type LeaveRow = {
  id: string;
  leave_type: LeaveRequestInput['leave_type'];
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  review_note: string | null;
  created_at: string;
};

type LeaveFormState = Omit<LeaveRequestInput, 'policy_acknowledged'> & {
  policy_acknowledged: boolean;
};

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

function Choice({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-full border px-4 py-2 mr-2 mb-2 ${
        selected ? 'border-primary bg-primary' : 'border-ink/15 bg-white'
      }`}
    >
      <Text className={selected ? 'font-semibold text-white' : 'font-medium text-charcoal'}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-semibold text-charcoal">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8B8492"
        multiline={multiline}
        maxLength={multiline ? 2000 : 10}
        autoCapitalize="none"
        className={`rounded-xl border border-ink/10 bg-white px-4 text-charcoal ${multiline ? 'min-h-28 py-3' : 'h-13'}`}
      />
    </View>
  );
}

export default function LeavePage() {
  const [form, setForm] = useState<LeaveFormState>(initialForm);
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [assignments, setAssignments] = useState<
    BaTodayResult['assignments'][number]['assignment'][]
  >([]);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, status, review_note, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
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

  useEffect(() => {
    void loadRequests();
    void loadAssignments();
  }, [loadRequests, loadAssignments]);

  function toggleDocument(value: LeaveRequestInput['supporting_document_types'][number]) {
    setForm((current) => {
      if (value === 'not_applicable') {
        return {
          ...current,
          supporting_document_types: current.supporting_document_types.includes(value)
            ? []
            : [value],
        };
      }
      const withoutNA = current.supporting_document_types.filter(
        (item) => item !== 'not_applicable',
      );
      return {
        ...current,
        supporting_document_types: withoutNA.includes(value)
          ? withoutNA.filter((item) => item !== value)
          : [...withoutNA, value],
      };
    });
  }

  async function submit() {
    const result = leaveRequestSchema.safeParse(form);
    if (!result.success) {
      setMessage({
        tone: 'bad',
        text: result.error.issues[0]?.message ?? 'Check the form and try again.',
      });
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
        setMessage({
          tone: 'ok',
          text: 'Saved offline. It will send automatically when you reconnect.',
        });
        setTimeout(() => void flushQueue(), 0);
      } else setMessage({ tone: 'bad', text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-lavender"
      contentContainerClassName="px-5 pb-12 pt-8"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadRequests();
          }}
        />
      }
    >
      <View className="mb-5 overflow-hidden rounded-3xl bg-ink p-6">
        <Text className="text-xs font-semibold uppercase tracking-widest text-bright">
          Time away
        </Text>
        <Text className="mt-2 text-3xl font-bold text-white">Leave request</Text>
        <Text className="mt-2 leading-5 text-white/70">
          Your verified profile, phone number and current store are attached automatically.
        </Text>
      </View>

      <View className="mb-5 rounded-2xl bg-white p-5">
        <Text className="mb-2 text-lg font-bold text-ink">0. Which assignment?</Text>
        {assignments.length === 0 ? (
          <Text className="text-muted">
            You have no active assignments — leave is linked to a store or school.
          </Text>
        ) : (
          <View className="flex-row flex-wrap">
            {assignments.map((a) => {
              const label = a.campaign_name
                ? `${a.store_name || a.school_name || ''} · ${a.campaign_name}`
                : a.store_name || a.school_name || 'Assignment';
              return (
                <Choice
                  key={a.id}
                  label={label}
                  selected={assignmentId === a.id}
                  onPress={() => setAssignmentId(a.id)}
                />
              );
            })}
          </View>
        )}
      </View>

      <View className="mb-5 rounded-2xl bg-white p-5">
        <Text className="mb-3 text-lg font-bold text-ink">1. Leave details</Text>
        <Text className="mb-2 text-sm font-semibold text-charcoal">Type of leave</Text>
        <View className="mb-2 flex-row flex-wrap">
          {LEAVE_TYPES.map((item) => (
            <Choice
              key={item.value}
              label={item.label}
              selected={form.leave_type === item.value}
              onPress={() => setForm((v) => ({ ...v, leave_type: item.value }))}
            />
          ))}
        </View>
        <Field
          label="Start date"
          placeholder="YYYY-MM-DD"
          value={form.start_date}
          onChangeText={(value) => setForm((v) => ({ ...v, start_date: value }))}
        />
        <Field
          label="End date"
          placeholder="YYYY-MM-DD"
          value={form.end_date}
          onChangeText={(value) => setForm((v) => ({ ...v, end_date: value }))}
        />
        <Field
          label="Expected return date"
          placeholder="YYYY-MM-DD"
          value={form.expected_return_date}
          onChangeText={(value) => setForm((v) => ({ ...v, expected_return_date: value }))}
        />
      </View>

      <View className="mb-5 rounded-2xl bg-white p-5">
        <Text className="mb-3 text-lg font-bold text-ink">2. Communication</Text>
        <View className="mb-4 flex-row items-center justify-between">
          <View className="mr-4 flex-1">
            <Text className="font-semibold text-charcoal">Supervisor informed</Text>
            <Text className="mt-1 text-sm text-muted">
              Confirm you have discussed this request.
            </Text>
          </View>
          <Switch
            value={form.supervisor_informed}
            onValueChange={(value) => setForm((v) => ({ ...v, supervisor_informed: value }))}
            trackColor={{ true: '#7B2FBE' }}
          />
        </View>
        {!form.supervisor_informed ? (
          <Field
            multiline
            label="Why have they not been informed?"
            placeholder="Explain briefly"
            value={form.supervisor_not_informed_reason ?? ''}
            onChangeText={(value) =>
              setForm((v) => ({ ...v, supervisor_not_informed_reason: value }))
            }
          />
        ) : null}
        <Field
          multiline
          label="Reason for leave"
          placeholder="Provide the information the reviewing admin needs"
          value={form.reason}
          onChangeText={(value) => setForm((v) => ({ ...v, reason: value }))}
        />
      </View>

      <View className="mb-5 rounded-2xl bg-white p-5">
        <Text className="mb-1 text-lg font-bold text-ink">3. Supporting documents</Text>
        <Text className="mb-3 text-sm text-muted">
          Select the documents you can provide to your supervisor.
        </Text>
        <View className="flex-row flex-wrap">
          {DOCUMENTS.map(([value, label]) => (
            <Choice
              key={value}
              label={label}
              selected={form.supporting_document_types.includes(value)}
              onPress={() => toggleDocument(value)}
            />
          ))}
        </View>
      </View>

      <View className="mb-5 rounded-2xl border border-primary/15 bg-white p-5">
        <Text className="font-semibold text-ink">Leave policy acknowledgement</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">
          By sending this form, I confirm the details are accurate and understand the request is
          not approved until an admin confirms it.
        </Text>
        <View className="mt-3 flex-row items-center justify-between">
          <Text className="font-semibold text-deep">I acknowledge</Text>
          <Switch
            value={form.policy_acknowledged}
            onValueChange={(value) => setForm((v) => ({ ...v, policy_acknowledged: value }))}
            trackColor={{ true: '#7B2FBE' }}
          />
        </View>
      </View>

      {message ? (
        <View
          accessibilityRole="alert"
          className={`mb-3 rounded-xl p-3 ${message.tone === 'ok' ? 'bg-ok/10' : 'bg-bad/10'}`}
        >
          <Text className={`font-medium ${message.tone === 'ok' ? 'text-ok' : 'text-bad'}`}>
            {message.text}
          </Text>
        </View>
      ) : null}
      <PrimaryButton label="Send leave request" busy={busy} onPress={() => void submit()} />

      <Text className="mb-3 mt-8 text-xl font-bold text-ink">My requests</Text>
      {loading ? <Text className="text-muted">Loading…</Text> : null}
      {!loading && requests.length === 0 ? (
        <Text className="text-muted">No leave requests yet.</Text>
      ) : null}
      {requests.map((request) => (
        <View key={request.id} className="mb-3 rounded-2xl bg-white p-4">
          <View className="flex-row items-start justify-between">
            <View>
              <Text className="font-bold capitalize text-charcoal">
                {request.leave_type.replaceAll('_', ' ')}
              </Text>
              <Text className="mt-1 text-sm text-muted">
                {request.start_date} — {request.end_date}
              </Text>
            </View>
            <Text
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${request.status === 'approved' ? 'bg-ok/10 text-ok' : request.status === 'denied' ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn'}`}
            >
              {request.status}
            </Text>
          </View>
          {request.review_note ? (
            <Text className="mt-3 border-t border-ink/5 pt-3 text-sm text-charcoal">
              Admin note: {request.review_note}
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
