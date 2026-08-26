'use client';

import { useEffect } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import * as Sentry from '@sentry/react-native';

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
    <View className="flex-1 items-center justify-center bg-lavender px-6">
      <View className="items-center rounded-2xl bg-white p-8">
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <Text className="text-xl font-bold text-red-500">!</Text>
        </View>
        <Text className="text-lg font-semibold text-gray-900">Something went wrong</Text>
        <Text className="mt-2 text-center text-sm text-gray-500">
          This screen encountered an error. Please try again.
        </Text>
        <TouchableOpacity
          onPress={reset}
          className="mt-6 rounded-xl bg-purple-600 px-6 py-3"
          accessibilityLabel="Try again"
        >
          <Text className="text-sm font-medium text-white">Try again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
