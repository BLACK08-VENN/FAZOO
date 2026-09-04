import { useState } from 'react';
import * as Linking from 'expo-linking';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { normalizeInternationalPhone, phoneToAuthEmail } from '@fazoo/validation';
import { PrimaryButton } from '@/components/primary-button';
import { Field, Screen, ScreenHeader, GlassCard } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestReset() {
    setError(null);
    const normalized = normalizeInternationalPhone(phone);
    if (!normalized.ok || !normalized.e164) {
      setError('Enter a valid mobile number (include your country code, e.g. +2547…).');
      return;
    }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      phoneToAuthEmail(normalized.e164),
      { redirectTo: Linking.createURL('/update-password') },
    );
    setBusy(false);
    if (resetError) {
      setError('The reset request could not be sent. Check your connection and try again.');
      return;
    }
    setSent(true);
  }

  return (
    <Screen scroll={false}>
      <View className="flex-1 justify-center">
        <ScreenHeader
          eyebrow="Account recovery"
          title="Reset your password"
          subtitle="Request a secure reset path. If self-service messaging is unavailable, your supervisor can complete the handoff."
        />

        <GlassCard>
          {sent ? (
            <View className="rounded-2xl border border-emerald-300/30 bg-emerald-400/12 px-4 py-4">
              <Text role="status" className="font-medium text-white">
                Request received. Contact your supervisor to complete the reset if no message arrives.
              </Text>
            </View>
          ) : null}

          {error ? (
            <View className="mb-3 rounded-2xl border border-rose-300/30 bg-rose-400/12 px-4 py-4">
              <Text role="alert" className="font-medium text-white">
                {error}
              </Text>
            </View>
          ) : null}

          <Field
            label="Mobile number"
            placeholder="+234 803 123 4567"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          <PrimaryButton label="Request reset" icon="mail-open" onPress={() => void requestReset()} busy={busy} />
          <PrimaryButton label="Back to sign in" variant="ghost" onPress={() => router.back()} />
        </GlassCard>
      </View>
    </Screen>
  );
}