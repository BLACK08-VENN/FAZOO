import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useOrgKind } from '@/lib/org-kind';
import { PrimaryButton } from '@/components/primary-button';

interface RetailCampaign {
  campaign_id: string;
  campaign_name: string;
  status: string;
  start_date: string;
  end_date: string | null;
  store_id: string;
  store_name: string;
}

interface VedaAssignment {
  id: string;
  school_id: string;
  school_name: string;
  school_region: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
}

/** Campaign / school selection for the BA's logs — pick one to view or add to. */
export default function Campaigns() {
  const { kind, loading: kindLoading } = useOrgKind();
  const [retailCampaigns, setRetailCampaigns] = useState<RetailCampaign[]>([]);
  const [vedaAssignments, setVedaAssignments] = useState<VedaAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (kind === 'schools') {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) {
        setError('Your account could not be verified. Sign in again.');
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const { data, error: err } = await supabase
        .from('veda_assignments')
        .select('id, school_id, school:veda_schools(name, region), start_date, end_date, status')
        .eq('brand_ambassador_id', userId)
        .eq('status', 'active')
        .order('start_date', { ascending: false });
      if (err) {
        setError('Could not load school assignments.');
      } else {
        const rows = (data ?? []) as Array<{
          id: string;
          school_id: string;
          school: { name: string; region: string | null } | null;
          start_date: string;
          end_date: string | null;
          status: string;
        }>;
        setVedaAssignments(
          rows.map((r) => ({
            id: r.id,
            school_id: r.school_id,
            school_name: r.school?.name ?? 'Unknown school',
            school_region: r.school?.region ?? null,
            start_date: r.start_date,
            end_date: r.end_date,
            status: r.status,
          })),
        );
      }
    } else {
      const { data, error: err } = await supabase.rpc('ba_my_campaigns');
      if (err) {
        setError('Could not load campaigns.');
      } else {
        setRetailCampaigns((data as RetailCampaign[] | null) ?? []);
      }
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

  if (kindLoading || loading) {
    return (
      <View className="flex-1 items-center justify-center bg-lavender">
        <ActivityIndicator size="large" color="#7B2FBE" />
      </View>
    );
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
      <Text className="text-xs text-muted mb-2">My Logs</Text>
      <Text className="text-xl font-bold text-ink mb-4">
        {kind === 'schools' ? 'Choose a school' : 'Choose a campaign'}
      </Text>

      <Text className="text-sm text-charcoal mb-4">
        Pick a {kind === 'schools' ? 'school' : 'campaign'} you are active on to view your
        logs or add a new one.
      </Text>

      {error ? (
        <Text role="alert" className="text-bad font-medium mb-3">
          {error}
        </Text>
      ) : null}

      {kind === 'schools' ? (
        vedaAssignments.length === 0 ? (
          <Text className="text-muted text-center mt-6">
            No active school assignments. Contact your supervisor.
          </Text>
        ) : (
          vedaAssignments.map((a) => (
            <PrimaryButton
              key={a.id}
              label=""
              onPress={() =>
                router.push({
                  pathname: '/campaign-logs',
                  params: {
                    kind: 'schools',
                    assignmentId: a.id,
                    schoolId: a.school_id,
                    schoolName: a.school_name,
                  },
                })
              }
            >
              <View className="w-full flex-row justify-between items-center px-1">
                <View className="flex-1">
                  <Text className="text-white font-semibold text-left">{a.school_name}</Text>
                  {a.school_region ? (
                    <Text className="text-white/70 text-sm text-left">{a.school_region}</Text>
                  ) : null}
                </View>
                <Text className="text-white/70 text-sm">›</Text>
              </View>
            </PrimaryButton>
          ))
        )
      ) : retailCampaigns.length === 0 ? (
        <Text className="text-muted text-center mt-6">
          No active campaigns. Contact your supervisor.
        </Text>
      ) : (
        retailCampaigns.map((c) => (
          <PrimaryButton
            key={c.campaign_id}
            label=""
            onPress={() =>
              router.push({
                pathname: '/campaign-logs',
                params: {
                  kind: 'retail',
                  campaignId: c.campaign_id,
                  campaignName: c.campaign_name,
                  storeName: c.store_name,
                },
              })
            }
          >
            <View className="w-full flex-row justify-between items-center px-1">
              <View className="flex-1">
                <Text className="text-white font-semibold text-left">{c.campaign_name}</Text>
                <Text className="text-white/70 text-sm text-left">{c.store_name}</Text>
              </View>
              <Text className="text-white/70 text-sm">›</Text>
            </View>
          </PrimaryButton>
        ))
      )}

      <View className="mt-6">
        <PrimaryButton label="Back" variant="ghost" onPress={() => router.back()} />
      </View>

      <Text className="text-center text-xs text-muted mt-10">Fazoo · v0.1</Text>
    </ScrollView>
  );
}
