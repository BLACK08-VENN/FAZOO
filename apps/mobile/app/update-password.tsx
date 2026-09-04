import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { PASSWORD_MIN_LENGTH } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';
import { HeroCard, Screen, SectionLabel, Field } from '@/components/ui';

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
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <HeroCard
        eyebrow="Account recovery"
        title="Choose a new password"
        subtitle={`Use at least ${PASSWORD_MIN_LENGTH} characters and keep it memorable for your next sign in.`}
        icon="key"
      />

      <SectionLabel>Secure your account</SectionLabel>
      <Field
        label="New password"
        secureTextEntry
        autoComplete="password-new"
        value={password}
        onChangeText={setPassword}
        placeholder="New password"
      />
      <Field
        label="Confirm new password"
        secureTextEntry
        autoComplete="password-new"
        value={confirmation}
        onChangeText={setConfirmation}
        placeholder="Confirm new password"
      />

      {error ? (
        <Text role="alert" className="mb-3 text-sm font-medium text-rose-200">
          {error}
        </Text>
      ) : null}

      <PrimaryButton label="Update password" onPress={() => void submit()} busy={busy} icon="shield-checkmark" />
      <PrimaryButton
        label="Back to sign in"
        variant="ghost"
        onPress={() => router.replace('/sign-in')}
      />
    </Screen>
  );
}