import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useOrgKind } from '@/lib/org-kind';
import { readUserCache, writeUserCache } from '@/lib/cache';
import { PrimaryButton } from '@/components/primary-button';
import { Card, EmptyState, Field, GlassCard, Page, ScreenHeader } from '@/components/ui';

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

/**
 * Retail campaign picker. School-programme BAs are sent to the booklist
 * pipeline instead — that is where their schools and log history live now.
 */
export default function Campaigns() {
  const { kind, loading: kindLoading } = useOrgKind();
  const [campaigns, setCampaigns] = useState<RetailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState<Record<string, string>>({});
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const isSchools = kind === 'schools';

  function openCode(id: string) {
    setCodeOpen((current) => (current === id ? null : id));
    setError(null);
  }

  const load = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
      setError(null);
      const cached = await readUserCache<RetailCampaign[]>('campaigns.retail');
      if (cached) {
        setCampaigns(cached);
        setLoading(false);
      }
      const { data, error: err } = await supabase.rpc('ba_list_campaigns');
      if (err) setError('Could not load campaigns.');
      else {
        const next = (data as RetailCampaign[] | null) ?? [];
        setCampaigns(next);
        void writeUserCache('campaigns.retail', next);
      }
      setLoading(false);
      setRefreshing(false);
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = request;
    return request;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!kindLoading && !isSchools) void load();
      if (!kindLoading && isSchools) setLoading(false);
    }, [kindLoading, isSchools, load]),
  );

  function open(id: string, name: string) {
    router.push({ pathname: '/campaign-logs', params: { campaignId: id, campaignName: name } });
  }

  async function unlockAndOpen(id: string, name: string) {
    const code = (codeInput[id] ?? '').trim();
    if (!code) {
      setError('Enter the access code for this campaign.');
      return;
    }
    setUnlocking(id);
    setError(null);
    const { error: err } = await supabase.rpc('ba_unlock_campaign', { p_campaign_id: id, p_code: code });
    setUnlocking(null);
    if (err) {
      setError(
        /invalid access code/i.test(err.message)
          ? 'That access code is incorrect — try again or contact your admin.'
          : err.message,
      );
      return;
    }
    await load();
    open(id, name);
  }

  if (kindLoading || (loading && !isSchools)) {
    return (
      <Page scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B2FBE" />
        </View>
      </Page>
    );
  }

  if (isSchools) {
    return (
      <Page>
        <ScreenHeader
          eyebrow="School programme"
          title="Your schools live on the pipeline"
          subtitle="Every school you approach, and the point of the process it is at."
          onBack={() => router.back()}
        />
        <GlassCard className="mb-5">
          <Text className="font-sans text-sm leading-6 text-muted">
            School booklists are no longer logged as campaigns. Search a school, record the visit and upload
            the booklist from the pipeline instead.
          </Text>
        </GlassCard>
        <PrimaryButton
          label="Open the school pipeline"
          icon="school"
          onPress={() => router.replace('/schools')}
        />
        <PrimaryButton label="Start a school visit" variant="secondary" icon="camera" onPress={() => router.push('/school-visit')} />
        <PrimaryButton label="Back" variant="ghost" onPress={() => router.back()} />
      </Page>
    );
  }

  return (
    <Page
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
      <ScreenHeader
        eyebrow="Add a log"
        title="Choose a campaign"
        subtitle="Pick any active campaign. Locked ones need a passcode from your supervisor before you can add logs."
        onBack={() => router.back()}
      />

      <GlassCard className="mb-5">
        <Text className="font-sans text-sm leading-6 text-muted">
          Access codes are validated server-side. Once unlocked, you can keep moving without re-entering the
          passcode on every visit.
        </Text>
      </GlassCard>

      {error ? (
        <Text role="alert" className="font-sans mb-3 text-sm font-medium text-bad">
          {error}
        </Text>
      ) : null}

      {campaigns.length === 0 ? (
        <EmptyState
          title="No active campaigns yet"
          body="Contact your supervisor to confirm the current rollout and your assignment access."
        />
      ) : (
        campaigns.map((campaign) => {
          const needsCode = campaign.locked && !campaign.unlocked;
          return (
            <Card key={campaign.campaign_id} className="mb-4">
              <TouchableOpacity
                onPress={() => {
                  if (needsCode) openCode(campaign.campaign_id);
                  else open(campaign.campaign_id, campaign.campaign_name);
                }}
                accessibilityRole="button"
                accessibilityLabel={campaign.campaign_name}
                activeOpacity={0.8}
              >
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="font-sans text-xl font-bold text-ink">{campaign.campaign_name}</Text>
                    {(campaign.stores ?? []).length > 0 ? (
                      <Text className="font-sans mt-2 text-sm leading-6 text-muted">
                        {(campaign.stores ?? []).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                  <View className={`rounded-full px-3 py-1 ${campaign.locked ? 'bg-lavender' : 'bg-ok/12'}`}>
                    <Text
                      className={`font-sans text-xs font-semibold uppercase ${
                        campaign.locked ? (campaign.unlocked ? 'text-ok' : 'text-muted') : 'text-ok'
                      }`}
                    >
                      {campaign.locked ? (campaign.unlocked ? 'Unlocked' : 'Locked') : 'Open'}
                    </Text>
                  </View>
                </View>
                <View className="mt-4 flex-row items-center justify-between">
                  <Text className="font-sans text-sm text-muted">
                    {needsCode ? 'Unlock once to add logs.' : 'Tap to view logs and continue.'}
                  </Text>
                  <Ionicons
                    name={needsCode ? 'lock-closed' : 'chevron-forward'}
                    size={18}
                    color="#6B6472"
                  />
                </View>
              </TouchableOpacity>

              {needsCode && codeOpen === campaign.campaign_id ? (
                <View className="mt-4 border-t border-edge pt-4">
                  <Field
                    label="Access code"
                    placeholder="Enter access code"
                    secureTextEntry
                    autoCapitalize="none"
                    value={codeInput[campaign.campaign_id] ?? ''}
                    onChangeText={(value) =>
                      setCodeInput((previous) => ({ ...previous, [campaign.campaign_id]: value }))
                    }
                    onSubmitEditing={() => void unlockAndOpen(campaign.campaign_id, campaign.campaign_name)}
                  />
                  <PrimaryButton
                    label="Unlock & continue"
                    onPress={() => void unlockAndOpen(campaign.campaign_id, campaign.campaign_name)}
                    busy={unlocking === campaign.campaign_id}
                    icon="lock-open"
                  />
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      <PrimaryButton label="Back" variant="ghost" onPress={() => router.back()} />
    </Page>
  );
}
