import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useRouteGuard } from '@/lib/guard';
import { useRecoveryLinks } from '@/lib/recovery';
import '../global.css';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN),
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  sendDefaultPii: false,
});

function RootLayout() {
  useRecoveryLinks();
  const { ready } = useRouteGuard();

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-ink">
        <ActivityIndicator size="large" color="#C084FC" accessibilityLabel="Loading session" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F6F2FA' },
        }}
      >
        <Stack.Screen name="(app)" />
        <Stack.Screen name="update-password" />
      </Stack>
    </>
  );
}

export default Sentry.wrap(RootLayout);
