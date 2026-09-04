import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { VedaTodayResult } from '@fazoo/types';
import { supabase } from '@/lib/supabase';
import { useOrgKind } from '@/lib/org-kind';
import { PrimaryButton } from '@/components/primary-button';
import { Screen, ScreenHeader, Card, GlassCard, EmptyState, Field } from '@/components/ui';

interface RetailCampaign {
  campaign_id: string;
  campaign_name: string;
  status: string;
  start_date: string;
  end_date: string | null;
  stores: string[] | null;
  locked: boolean;
  unlocked: boolean;
}

interface VedaSchool {
  assignment_id?: string | null;
  school_id: string;
  school_name: string;
  school_region: string | null;
  status: string;
  locked: boolean;
  unlocked: boolean;
}

type SchoolItem = {
  key: string;
  id: string;
  title: string;
  subtitle?: string;
  locked: boolean;
  unlocked: boolean;
  isSchool: true;
  assignmentId: string | null;
};

type CampaignItem = {
  key: string;
  id: string;
  title: string;
  subtitle?: string;
  locked: boolean;
  unlocked: boolean;
  isSchool: false;
};

export default function Campaigns() {
  const { kind, loading: kindLoading } = useOrgKind();
  const [retailCampaigns, setRetailCampaigns] = useState<RetailCampaign[]>([]);
  const [vedaSchools, setVedaSchools] = useState<VedaSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState<Record<string, string>>({});
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState<string | null>(null);

  function openCode(id: string) {
    setCodeOpen((current) => (current === id ? null : id));
    setError(null);
  }

  const load = useCallback(async () => {
    setError(null);
    if (kind === 'schools') {
      const [{ data, error: err }, { data: todayData, error: todayError }] = await Promise.all([
        supabase.rpc('ba_list_veda_schools'),
        supabase.rpc('veda_today'),
      ]);
      if (err) setError('Could not load schools.');
      else {
        const assignmentsBySchoolId = new Map<string, string>();
        if (!todayError && todayData) {
          const today = todayData as unknown as VedaTodayResult;
          for (const item of today.assignments) {
            if (item.assignment.school_id) {
              assignmentsBySchoolId.set(item.assignment.school_id, item.assignment.id);
            }
          }
        }
        setVedaSchools(
          ((data as VedaSchool[] | null) ?? []).map((school) => ({
            ...school,
            assignment_id: assignmentsBySchoolId.get(school.school_id) ?? null,
          })),
        );
      }
    } else {
      const { data, error: err } = await supabase.rpc('ba_list_campaigns');
      if (err) setError('Could not load campaigns.');
      else setRetailCampaigns((data as RetailCampaign[] | null) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, [kind]);

  useEffect(() => {
    if (!kindLoading) void load();
  }, [kindLoading, load]);

  useFocusEffect(
    useCallback(() => {
      if (!kindLoading) void load();
    }, [kindLoading, load]),
  );

  async function open(id: string, isSchool: boolean, name: string, assignmentId?: string | null) {
    if (isSchool) {
      router.push({ pathname: '/campaign-logs', params: { kind: 'schools', schoolId: id, schoolName: name, ...(assignmentId ? { assignmentId } : {}) } });
      return;
    }
    router.push({ pathname: '/campaign-logs', params: { kind: 'retail', campaignId: id, campaignName: name } });
  }

  async function unlockAndOpen(id: string, isSchool: boolean, name: string) {
    const code = (codeInput[id] ?? '').trim();
    if (!code) {
      setError('Enter the access code for this item.');
      return;
    }
    setUnlocking(id);
    setError(null);
    const { error: err } = isSchool
      ? await supabase.rpc('ba_unlock_veda_school', { p_school_id: id, p_code: code })
      : await supabase.rpc('ba_unlock_campaign', { p_campaign_id: id, p_code: code });
    setUnlocking(null);
    if (err) {
      setError(/invalid access code/i.test(err.message) ? 'That access code is incorrect — try again or contact your admin.' : err.message);
      return;
    }
    await load();
    const assignmentId = isSchool ? vedaSchools.find((school) => school.school_id === id)?.assignment_id ?? null : null;
    await open(id, isSchool, name, assignmentId);
  }

  const items: Array<SchoolItem | CampaignItem> =
    kind === 'schools'
      ? vedaSchools.map((s) => ({ key: s.school_id, id: s.school_id, title: s.school_name, subtitle: s.school_region ?? undefined, locked: s.locked, unlocked: s.unlocked, isSchool: true, assignmentId: s.assignment_id ?? null }))
      : retailCampaigns.map((c) => ({ key: c.campaign_id, id: c.campaign_id, title: c.campaign_name, subtitle: (c.stores ?? []).join(', ') || undefined, locked: c.locked, unlocked: c.unlocked, isSchool: false }));

  function renderItem(item: (typeof items)[number]) {
    const needsCode = item.locked && !item.unlocked;
    return (
      <Card key={item.key} className="mb-4">
        <TouchableOpacity
          onPress={() => {
            if (needsCode) openCode(item.id);
            else void open(item.id, item.isSchool, item.title, item.isSchool ? item.assignmentId : null);
          }}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          activeOpacity={0.8}
        >
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-xl font-bold text-ink">{item.title}</Text>
              {item.subtitle ? <Text className="mt-2 text-sm leading-6 text-slate-600">{item.subtitle}</Text> : null}
            </View>
            <View className={`rounded-full px-3 py-1 ${item.locked ? 'bg-slate-900/8' : 'bg-emerald-500/10'}`}>
              <Text className={`text-xs font-semibold uppercase ${item.locked ? (item.unlocked ? 'text-emerald-700' : 'text-slate-500') : 'text-emerald-700'}`}>
                {item.locked ? (item.unlocked ? 'Unlocked' : 'Locked') : 'Open'}
              </Text>
            </View>
          </View>
          <View className="mt-4 flex-row items-center justify-between">
            <Text className="text-sm text-slate-500">
              {needsCode ? 'Unlock once to add logs.' : 'Tap to view logs and continue.'}
            </Text>
            <Ionicons name={needsCode ? 'lock-closed' : 'chevron-forward'} size={18} color="#667085" />
          </View>
        </TouchableOpacity>

        {needsCode && codeOpen === item.id ? (
          <View className="mt-4 border-t border-slate-200 pt-4">
            <Field
              label="Access code"
              placeholder="Enter access code"
              secureTextEntry
              autoCapitalize="none"
              value={codeInput[item.id] ?? ''}
              onChangeText={(v) => setCodeInput((prev) => ({ ...prev, [item.id]: v }))}
              onSubmitEditing={() => void unlockAndOpen(item.id, item.isSchool, item.title)}
            />
            <PrimaryButton
              label="Unlock & continue"
              onPress={() => void unlockAndOpen(item.id, item.isSchool, item.title)}
              busy={unlocking === item.id}
              icon="lock-open"
            />
          </View>
        ) : null}
      </Card>
    );
  }

  if (kindLoading || loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#D8DDFF" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <ScreenHeader
        eyebrow="Add a log"
        title={kind === 'schools' ? 'Choose a school' : 'Choose a campaign'}
        subtitle={kind === 'schools' ? 'Pick any active school. Locked ones need a passcode from your supervisor before you can add logs.' : 'Pick any active campaign. Locked ones need a passcode from your supervisor before you can add logs.'}
      />

      <GlassCard className="mb-5">
        <Text className="text-sm leading-6 text-white/72">
          Access codes are validated server-side. Once unlocked, you can keep moving without re-entering the passcode on every visit.
        </Text>
      </GlassCard>

      {error ? <Text role="alert" className="mb-3 text-sm font-medium text-rose-200">{error}</Text> : null}

      {items.length === 0 ? (
        <EmptyState
          title={`No active ${kind === 'schools' ? 'schools' : 'campaigns'} yet`}
          body="Contact your supervisor to confirm the current rollout and your assignment access."
        />
      ) : (
        items.map(renderItem)
      )}

      <PrimaryButton label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
