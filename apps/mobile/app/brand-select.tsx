import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';
import { BrandLogo } from '@/components/brand-logo';

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
    setMemberships((data as Membership[]) ?? []);
    if (err) setError(err.message);
    setLoading(false);
  }

  async function openBrand(m: Membership) {
    // Not approved → nothing to do here.
    if (m.account_status !== 'approved') return;
    // No code gate → switch and go straight to Today.
    if (!m.has_code_gate) {
      await switchBrand(m);
      return;
    }
    // Code gate → require a code before proceeding.
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
      setError(/invalid access code/i.test(err.message)
        ? 'That access code is incorrect — try again or contact your admin.'
        : /not a member/i.test(err.message)
          ? 'You are not a member of this brand.'
          : err.message);
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
      <View className="flex-1 items-center justify-center bg-lavender">
        <ActivityIndicator size="large" color="#7B2FBE" />
      </View>
    );
  }

  if (!memberships || memberships.length === 0) {
    return (
      <View className="flex-1 bg-lavender items-center justify-center px-8">
        <Text className="text-2xl font-bold text-ink text-center">No brands yet</Text>
        <Text className="text-center text-muted mt-3 leading-6">
          You don&apos;t belong to any brand yet. Contact your administrator once
          you have been added.
        </Text>
        <PrimaryButton label="Refresh" onPress={() => void load()} />
      </View>
    );
  }

  const approved = memberships.filter((m) => m.account_status === 'approved');
  const others = memberships.filter((m) => m.account_status !== 'approved');

  return (
    <ScrollView contentContainerClassName="bg-lavender px-6 py-12" keyboardShouldPersistTaps="handled">
      <Text className="text-2xl font-bold text-ink">Choose a brand</Text>
      <Text className="text-muted mt-1 mb-8">
        You belong to {memberships.length} brand{memberships.length > 1 ? 's' : ''}.
        Unlock one to get started.
      </Text>

      {error ? (
        <Text role="alert" className="text-bad font-medium mb-3">{error}</Text>
      ) : null}

      {approved.map((m) => (
        <View key={m.organization_id} className="bg-white rounded-2xl p-5 mb-4">
          {m.logo_url ? (
            <View className="mb-4">
              <BrandLogo
                name={m.organization_name}
                slug={m.organization_slug}
                logoUrl={m.logo_url}
              />
            </View>
          ) : null}
          <Text className="text-lg font-semibold text-ink">{m.organization_name}</Text>
          <Text className="text-muted text-sm mb-3">{m.organization_slug}</Text>

          {m.has_code_gate ? (
            <TextInput
              className="h-12 rounded-xl bg-lavender px-4 text-base mb-3"
              placeholder="Access code"
              placeholderTextColor="#9a94a5"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={codeInput[m.organization_id] ?? ''}
              onChangeText={(v) =>
                setCodeInput((prev) => ({ ...prev, [m.organization_id]: v }))
              }
            />
          ) : null}

          <TouchableOpacity
            disabled={unlocking === m.organization_id}
            accessibilityLabel={`Open ${m.organization_name}`}
            className="h-12 rounded-xl bg-primary items-center justify-center"
            onPress={() => void openBrand(m)}
          >
            {unlocking === m.organization_id ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">
                {m.has_code_gate ? 'Unlock & open' : 'Open dashboard'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ))}

      {others.length > 0 ? (
        <View className="bg-white/50 rounded-2xl p-5 mb-4">
          <Text className="font-medium text-charcoal mb-1">Awaiting approval</Text>
          {others.map((m) => (
            <Text key={m.organization_id} className="text-muted text-sm mt-1">
              {m.organization_name} — {m.account_status.replace(/_/g, ' ')}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
