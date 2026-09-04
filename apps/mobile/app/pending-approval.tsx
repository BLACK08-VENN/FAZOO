import { Text } from 'react-native';
import { router } from 'expo-router';
import { signOut, useSessionProfile } from '@/lib/session';
import { PrimaryButton } from '@/components/primary-button';
import { HeroCard, Screen, GlassCard } from '@/components/ui';

export default function PendingApproval() {
  const { profile } = useSessionProfile();

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <HeroCard
        eyebrow="Application status"
        title="Waiting for approval"
        subtitle={`Hi ${profile?.full_name ?? 'there'} — your registration is in review and you'll be able to start once an administrator approves your account.`}
        icon="hourglass"
      />

      <GlassCard>
        <Text className="text-base leading-7 text-white/76">
          You will be able to check in as soon as an administrator approves your account and assigns you to a store or school.
        </Text>
        {profile?.account_status === 'rejected' ? (
          <Text role="alert" className="mt-4 text-sm font-medium leading-6 text-rose-200">
            Your application was not approved. Please contact your supervisor.
          </Text>
        ) : null}
      </GlassCard>

      <PrimaryButton label="Check again" onPress={() => router.replace('/pending-approval')} icon="refresh" />
      <PrimaryButton
        label="Sign out"
        variant="ghost"
        onPress={() => {
          void (async () => {
            await signOut();
            router.replace('/sign-in');
          })();
        }}
      />
    </Screen>
  );
}