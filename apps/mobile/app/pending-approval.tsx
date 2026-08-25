import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { signOut, useSessionProfile } from '@/lib/session';
import { PrimaryButton } from '@/components/primary-button';

export default function PendingApproval() {
  const { profile } = useSessionProfile();

  return (
    <View className="flex-1 bg-lavender items-center justify-center px-8">
      <Text className="text-6xl mb-6">⏳</Text>
      <Text className="text-2xl font-bold text-ink text-center">
        Waiting for approval
      </Text>
      <Text className="text-center text-muted mt-3 leading-6">
        Hi {profile?.full_name ?? 'there'} — your registration is in review.
        You&apos;ll be able to check in as soon as an administrator approves your
        account and assigns you to a store.
      </Text>
      {profile?.account_status === 'rejected' ? (
        <Text role="alert" className="text-bad font-medium mt-4 text-center">
          Your application was not approved. Please contact your supervisor.
        </Text>
      ) : null}
      <PrimaryButton label="Check again" onPress={() => router.replace('/pending-approval')} />
      <PrimaryButton label="Sign out" variant="ghost" onPress={() => void signOut()} />
    </View>
  );
}
