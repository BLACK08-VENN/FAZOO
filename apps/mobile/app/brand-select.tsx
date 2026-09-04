import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';
import { BrandLogo } from '@/components/brand-logo';
import { HeroCard, Screen, Card, GlassCard, EmptyState, Field, SectionLabel } from '@/components/ui';

interface Membership {
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  role: string;
  account_status: string;
  has_code_gate: boolean;
  logo_url: string | null;
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
    const { data, error: err } = await supabase.rpc('my_memberships');
    const next = (data as Membership[]) ?? [];
    setMemberships(next);
    if (err) setError(err.message);
    if (!err) {
      const approved = next.filter((m) => m.account_status === 'approved');
      if (approved.length === 1) {
        await switchBrand(approved[0]!);
        return;
      }
    }
    setLoading(false);
  }

  async function openBrand(m: Membership) {
    if (m.account_status !== 'approved') return;
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
    router.replace('/today');
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#D8DDFF" />
        </View>
      </Screen>
    );
  }

  if (!memberships || memberships.length === 0) {
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <HeroCard
          eyebrow="Workspace"
          title="No brands yet"
          subtitle="You don't belong to any brand yet. Contact your administrator once you have been added."
          icon="business"
        />
        <EmptyState title="Nothing to unlock yet" body="Refresh after your administrator adds you to a brand." actionLabel="Refresh" onAction={() => void load()} />
      </Screen>
    );
  }

  const approved = memberships.filter((m) => m.account_status === 'approved');
  const others = memberships.filter((m) => m.account_status !== 'approved');

  return (
    <Screen>
      <HeroCard
        eyebrow="Workspace"
        title="Choose a brand"
        subtitle={`You belong to ${memberships.length} brand${memberships.length > 1 ? 's' : ''}. Unlock one to continue.`}
        icon="layers"
      />

      {error ? <Text role="alert" className="mb-3 text-sm font-medium text-rose-200">{error}</Text> : null}

      <SectionLabel>Available brands</SectionLabel>
      {approved.map((m) => (
        <Card key={m.organization_id} className="mb-4">
          {m.logo_url ? (
            <View className="mb-4 overflow-hidden rounded-2xl">
              <BrandLogo name={m.organization_name} slug={m.organization_slug} logoUrl={m.logo_url} />
            </View>
          ) : null}
          <Text className="text-xl font-bold text-ink">{m.organization_name}</Text>
          <Text className="mt-1 text-sm text-slate-500">{m.organization_slug}</Text>
          <Text className="mt-3 text-sm leading-6 text-slate-600">
            {m.has_code_gate ? 'Enter your supervisor-issued access code to unlock this brand.' : 'Open your dashboard and continue your shift.'}
          </Text>

          {m.has_code_gate ? (
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
            disabled={unlocking === m.organization_id}
            busy={unlocking === m.organization_id}
            accessibilityLabel={`Open ${m.organization_name}`}
            label={m.has_code_gate ? 'Unlock & open' : 'Open dashboard'}
            onPress={() => void openBrand(m)}
            icon={m.has_code_gate ? 'lock-open' : 'arrow-forward'}
          />
        </Card>
      ))}

      {others.length > 0 ? (
        <>
          <SectionLabel>Pending memberships</SectionLabel>
          <GlassCard>
            {others.map((m) => (
              <View key={m.organization_id} className="border-b border-white/10 py-3 last:border-b-0">
                <Text className="text-base font-semibold text-white">{m.organization_name}</Text>
                <Text className="mt-1 text-sm capitalize text-white/68">{m.account_status.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </GlassCard>
        </>
      ) : null}
    </Screen>
  );
}
