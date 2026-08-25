import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { PASSWORD_MIN_LENGTH } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import { signOut, useSessionProfile } from '@/lib/session';
import { PrimaryButton } from '@/components/primary-button';

export default function Profile() {
  const { profile, loading } = useSessionProfile();
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePassword() {
    setError(null);
    setMessage(null);
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (err) {
      setError('Could not change the password. Try again.');
      return;
    }
    setNewPassword('');
    setMessage('Password updated.');
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in with your mobile number.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-lavender" contentContainerClassName="px-5 py-8">
      <Text className="text-xs text-muted">Profile</Text>
      {loading ? (
        <Text className="text-muted mt-2">Loading…</Text>
      ) : (
        <>
          <Text className="text-2xl font-bold text-ink">{profile?.full_name}</Text>
          <Text className="text-charcoal">{profile?.phone}</Text>
          <View className="rounded-xl bg-white px-4 py-3 mt-4">
            <Row label="Status" value={profile?.account_status ?? '—'} />
            <Row label="Role" value={profile?.role ?? '—'} />
          </View>

          <Text className="text-lg font-semibold text-ink mt-8 mb-2">Change password</Text>
          <TextInput
            secureTextEntry
            autoComplete="password-new"
            placeholder={`New password (min ${PASSWORD_MIN_LENGTH} characters)`}
            placeholderTextColor="#9a94a5"
            className="h-14 rounded-xl bg-white px-4 text-lg mb-3"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <PrimaryButton
            label="Update password"
            onPress={() => void changePassword()}
            busy={busy}
            disabled={!newPassword}
          />
          {error ? <Text role="alert" className="text-bad font-medium">{error}</Text> : null}
          {message ? <Text role="status" className="text-ok font-medium">{message}</Text> : null}

          <View className="mt-10">
            <PrimaryButton label="Sign out" variant="ghost" onPress={confirmSignOut} />
          </View>
          <Text className="text-center text-xs text-muted mt-6">
            Fazoo field app · your data syncs securely when online
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-muted capitalize">{label}</Text>
      <Text className="font-medium text-charcoal capitalize">{value}</Text>
    </View>
  );
}
