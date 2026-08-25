import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { PASSWORD_MIN_LENGTH } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';

export default function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError('This recovery link is invalid or expired. Request a new one.');
      return;
    }
    router.replace('/today');
  }

  return (
    <View className="flex-1 bg-lavender px-6 justify-center">
      <Text className="text-2xl font-bold text-ink mb-2">Choose a new password</Text>
      <Text className="text-muted mb-6">Use at least {PASSWORD_MIN_LENGTH} characters.</Text>
      <TextInput
        accessibilityLabel="New password"
        secureTextEntry
        autoComplete="password-new"
        className="h-14 rounded-xl bg-white px-4 text-lg mb-3"
        placeholder="New password"
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        accessibilityLabel="Confirm new password"
        secureTextEntry
        autoComplete="password-new"
        className="h-14 rounded-xl bg-white px-4 text-lg mb-3"
        placeholder="Confirm new password"
        value={confirmation}
        onChangeText={setConfirmation}
      />
      {error ? (
        <Text role="alert" className="text-bad font-medium mb-3">
          {error}
        </Text>
      ) : null}
      <PrimaryButton label="Update password" onPress={() => void submit()} busy={busy} />
      <PrimaryButton
        label="Back to sign in"
        variant="ghost"
        onPress={() => router.replace('/sign-in')}
      />
    </View>
  );
}
