import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';
import { BrandLogo } from '@/components/brand-logo';
import { HeroCard, Page, Card, GlassCard, EmptyState, Field, SectionLabel } from '@/components/ui';

interface Membership {
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  role: string;
  account_status: string;
  has_code_gate: boolean;
  logo_url: string | null;
  kind: 'retail' | 'schools';
  assigned: boolean;
}

export default function BrandSelect() {
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState<Record<string, string>>({});
  const [unlocking, setUnlocking] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('ba_brand_options' as never);
    const next = (data as unknown as Membership[] | null) ?? [];
    setMemberships(next);
    if (err) setError(err.message);
    setLoading(false);
  }

  async function openBrand(m: Membership) {
    if (m.account_status !== 'approved') return;
    if (!m.assigned) {
      setError('Your administrator has not assigned you to an active campaign for this brand.');
      return;
    }
    if (!m.has_code_gate) {
      await switchBrand(m);
      return;
    }
    const code = (codeInput[m.organization_id] ?? '').trim();
    if (!code) {
      setError('Enter the access code for this brand.');
      return;
    }
    setUnlocking(m.organization_id);
    setError(null);
    const { error: err } = await supabase.rpc('ba_unlock_brand', {
      p_organization_id: m.organization_id,
      p_code: code,
    });
    if (err) {
      setError(
        /invalid access code/i.test(err.message)
          ? 'That access code is incorrect — try again or contact your admin.'
          : /not a member/i.test(err.message)
            ? 'You are not a member of this brand.'
            : err.message,
      );
      setUnlocking(null);
      return;
    }
    await switchBrand(m);
  }

  async function switchBrand(m: Membership) {
    setError(null);
    const { error: err } = await supabase.rpc('ba_switch_brand', {
      p_organization_id: m.organization_id,
    });
    setUnlocking(null);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace('/profile');
  }

  if (loading) {
    return (
      <Page scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B2FBE" />
        </View>
      </Page>
    );
  }

  if (!memberships || memberships.length === 0) {
    return (
      <Page contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <HeroCard
          eyebrow="Workspace"
          title="No active brands"
          subtitle="There are no brands with active campaigns available to your account right now."
          icon="business"
        />
        <EmptyState title="Nothing to open yet" body="Refresh after your administrator assigns you to an active campaign." actionLabel="Refresh" onAction={() => void load()} />
      </Page>
    );
  }

  const approved = memberships.filter((m) => m.account_status === 'approved');
  const others = memberships.filter((m) => m.account_status !== 'approved');

  return (
    <Page>
      <HeroCard
        eyebrow="Workspace"
        title="Choose a brand"
        subtitle="Brands with active campaigns are shown below. You can open only the ones assigned to you by an administrator."
        icon="layers"
      />

      {error ? <Text role="alert" className="font-sans mb-3 text-sm font-medium text-bad">{error}</Text> : null}

      <SectionLabel>Brands with active campaigns</SectionLabel>
      {approved.map((m) => (
        <Card key={m.organization_id} className="mb-4">
          {m.logo_url ? (
            <View className="mb-4 overflow-hidden rounded-2xl">
              <BrandLogo name={m.organization_name} slug={m.organization_slug} logoUrl={m.logo_url} />
            </View>
          ) : null}
          <Text className="font-sans text-xl font-bold text-ink">{m.organization_name}</Text>
          <Text className="font-sans mt-1 text-sm text-muted">{m.organization_slug}</Text>
          <Text className="font-sans mt-3 text-sm leading-6 text-muted">
            {!m.assigned
              ? 'Not assigned — contact your administrator if you should work on this brand.'
              : m.has_code_gate
                ? 'Enter your supervisor-issued access code to unlock this brand.'
                : 'Assigned to you — open your dashboard and continue your shift.'}
          </Text>

          {m.assigned && m.has_code_gate ? (
            <View className="mt-4">
              <Field
                label="Access code"
                placeholder="Enter access code"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={codeInput[m.organization_id] ?? ''}
                onChangeText={(v) => setCodeInput((prev) => ({ ...prev, [m.organization_id]: v }))}
              />
            </View>
          ) : null}

          <PrimaryButton
            disabled={!m.assigned || unlocking === m.organization_id}
            busy={unlocking === m.organization_id}
            accessibilityLabel={`Open ${m.organization_name}`}
            label={!m.assigned ? 'Not assigned' : m.has_code_gate ? 'Unlock & open' : 'Open dashboard'}
            onPress={() => void openBrand(m)}
            icon={!m.assigned ? 'lock-closed' : m.has_code_gate ? 'lock-open' : 'arrow-forward'}
          />
        </Card>
      ))}

      {others.length > 0 ? (
        <>
          <SectionLabel>Pending memberships</SectionLabel>
          <GlassCard>
            {others.map((m) => (
              <View key={m.organization_id} className="border-b border-edge py-3 last:border-b-0">
                <Text className="font-sans text-base font-semibold text-ink">{m.organization_name}</Text>
                <Text className="font-sans mt-1 text-sm capitalize text-muted">{m.account_status.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </GlassCard>
        </>
      ) : null}
    </Page>
  );
}
