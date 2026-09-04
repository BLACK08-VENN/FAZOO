'use client';

import { useEffect } from 'react';
import { Text } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { PrimaryButton } from '@/components/primary-button';
import { HeroCard, Screen, GlassCard } from '@/components/ui';

export default function GlobalError({
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
        eyebrow="Unexpected problem"
        title="Something went wrong"
        subtitle="An unexpected error occurred. Please try again."
        icon="alert-circle"
      />
      <GlassCard>
        <Text className="text-sm leading-6 text-white/72">
          We captured the error for follow-up. Reset the screen to retry the last action.
        </Text>
      </GlassCard>
      <PrimaryButton label="Try again" onPress={reset} icon="refresh" />
    </Screen>
  );
}