import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { useRouteGuard } from '@/lib/guard';
import { useRecoveryLinks } from '@/lib/recovery';
import { AppBackdrop } from '@/components/ui';
import soraFont from '../assets/fonts/Sora-Variable.ttf';
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
  const [fontsLoaded] = useFonts({
    Sora: soraFont,
  });

  if (!ready || !fontsLoaded) {
    return (
      <AppBackdrop>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#A985FF" accessibilityLabel="Loading session" />
        </View>
      </AppBackdrop>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#080616' },
        }}
      >
        <Stack.Screen name="(app)" />
        <Stack.Screen name="update-password" />
        <Stack.Screen name="brand-select" />
      </Stack>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
