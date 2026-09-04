'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { PrimaryButton } from '@/components/primary-button';
import { HeroCard, Screen, GlassCard } from '@/components/ui';
import { Text } from 'react-native';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Screen scroll={false}>
      <HeroCard
        eyebrow="This screen hit a problem"
        title="Something went wrong"
        subtitle="This area encountered an error. Please try again."
        icon="warning"
      />
      <GlassCard>
        <Text className="text-sm leading-6 text-white/72">
          Your session is still active. Retry this screen first; if the issue continues, sign out and back in.
        </Text>
      </GlassCard>
      <PrimaryButton label="Try again" onPress={reset} icon="refresh" />
    </Screen>
  );
}