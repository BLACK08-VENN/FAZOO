import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PASSWORD_MIN_LENGTH } from '@fazoo/config';
import { supabase } from '@/lib/supabase';
import { signOut, useSessionProfile } from '@/lib/session';
import { PrimaryButton } from '@/components/primary-button';
import { Card, Field, HeroCard, MetricTile, Screen, SectionLabel } from '@/components/ui';

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
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await signOut();
            router.replace('/sign-in');
          })();
        },
      },
    ]);
  }

  return (
    <Screen bottomInset={false}>
      <HeroCard
        eyebrow="Profile"
        title={loading ? 'Loading…' : (profile?.full_name ?? '')}
        subtitle={profile?.phone ?? 'Your account and preferences'}
        icon="person-circle"
      />
      {loading ? null : (
        <>
          <Card className="mt-3">
            <View className="flex-row gap-3">
              <MetricTile label="Status" value={profile?.account_status ?? '—'} />
              <MetricTile label="Role" value={profile?.role ?? '—'} />
            </View>
          </Card>

          <SectionLabel>My Logs</SectionLabel>
          <PrimaryButton
            label="View or add logs"
            icon="albums"
            onPress={() => router.push('/campaigns')}
          />

          <SectionLabel>Actions</SectionLabel>
          <PrimaryButton label="Apply for leave" icon="medical" onPress={() => router.push('/leave')} />

          <SectionLabel>Change password</SectionLabel>
          <Card>
            <Field
              label="New password"
              secureTextEntry
              autoComplete="password-new"
              placeholder={`Minimum ${PASSWORD_MIN_LENGTH} characters`}
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <PrimaryButton
              label="Update password"
              icon="key"
              onPress={() => void changePassword()}
              busy={busy}
              disabled={!newPassword}
            />
            {error ? (
              <Text role="alert" className="mt-2 font-medium text-white">
                {error}
              </Text>
            ) : null}
            {message ? (
              <Text role="status" className="mt-2 font-medium text-emerald-200">
                {message}
              </Text>
            ) : null}
          </Card>

          <View className="mt-8">
            <PrimaryButton
              label="Switch brand"
              variant="ghost"
              icon="swap-horizontal"
              onPress={() => router.replace('/brand-select')}
            />
            <View className="h-3" />
            <PrimaryButton label="Sign out" variant="secondary" icon="log-out" onPress={confirmSignOut} />
          </View>

          <View className="mt-6 flex-row items-center justify-center gap-2">
            <Ionicons name="cloud-done" size={14} color="#D8DDFF" />
            <Text className="text-center text-xs text-white/58">
            Fazoo field app · your data syncs securely when online
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}
