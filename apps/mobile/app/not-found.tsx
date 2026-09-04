import { router } from 'expo-router';
import { Text } from 'react-native';
import { PrimaryButton } from '@/components/primary-button';
import { HeroCard, Screen, GlassCard } from '@/components/ui';

export default function NotFound() {
  return (
    <Screen scroll={false}>
      <HeroCard
        eyebrow="Navigation"
        title="Page not found"
        subtitle="The screen you are looking for does not exist or may have been moved."
        icon="compass"
      />
      <GlassCard>
        <Text className="text-sm leading-6 text-white/72">
          Return to Today to continue your shift, review assignments, or resume an in-progress task.
        </Text>
      </GlassCard>
      <PrimaryButton label="Go to Today" onPress={() => router.replace('/today')} icon="arrow-forward" />
    </Screen>
  );
}