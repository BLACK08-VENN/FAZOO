import { useState } from 'react';
import * as Linking from 'expo-linking';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { normalizeInternationalPhone, phoneToAuthEmail } from '@fazoo/validation';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password reset strategy (docs/roles-and-permissions.md):
  //  • Self-service SMS/OTP once the phone provider is enabled, or
  //  • administrator-triggered secure reset link.
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
    <View className="flex-1 bg-lavender px-6 justify-center">
      <Text className="text-2xl font-bold text-ink mb-2">Forgot password</Text>
      <Text className="text-muted mb-6">
        Enter your mobile number. If self-service reset is available you&apos;ll receive
        instructions; otherwise your supervisor can trigger a secure reset for you.
      </Text>
      {sent ? (
        <Text role="status" className="text-ok font-medium">
          Request received. Contact your supervisor to complete the reset if no message arrives.
        </Text>
      ) : null}
      {error ? (
        <Text role="alert" className="text-bad font-medium mb-3">
          {error}
        </Text>
      ) : null}
      <TextInput
        placeholder="+234 803 123 4567"
        placeholderTextColor="#9a94a5"
        keyboardType="phone-pad"
        className="h-14 rounded-xl bg-white px-4 text-lg mb-4"
        value={phone}
        onChangeText={setPhone}
      />
      <PrimaryButton label="Request reset" onPress={() => void requestReset()} busy={busy} />
      <PrimaryButton label="Back to sign in" variant="ghost" onPress={() => router.back()} />
    </View>
  );
}
