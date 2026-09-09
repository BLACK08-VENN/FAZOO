import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { toAuthEmail, normalizeInternationalPhone } from '@fazoo/validation';
import { PrimaryButton } from '@/components/primary-button';
import { AppBackdrop, Field, GlassCard, HeroCard } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const trimmed = phone.trim();
    const email = trimmed.includes('@')
      ? trimmed
      : (() => {
          const normalized = normalizeInternationalPhone(trimmed);
          return normalized.ok && normalized.e164 ? toAuthEmail(normalized.e164) : null;
        })();

    if (!email || !password) {
      setError('Enter your mobile number and password.');
      return;
    }

    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(
          err.name === 'AuthRetryableFetchError'
            ? 'Cannot reach the server. Check your connection and try again.'
            : 'Invalid mobile number or password.',
        );
        return;
      }
      router.replace('/profile');
    } catch (cause) {
      console.error('[sign-in] unexpected failure', cause);
      Sentry.captureException(cause);
      setError('Something went wrong. This has been noted — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppBackdrop>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 20,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
          }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
        >
          <HeroCard
            eyebrow="Field-force platform"
            title="Fazoo"
            subtitle="A premium daily workflow for brand ambassadors — check in fast, capture great evidence, and stay synced beautifully."
            icon="sparkles"
          />

          <GlassCard>
            <Text className="font-sans text-xs uppercase tracking-[2px] text-primaryText">Welcome back</Text>
            <Text className="font-sans mt-2 text-[26px] font-bold leading-8 text-ink">Sign in to start today&apos;s route</Text>
            <Text className="font-sans mt-2 text-base leading-7 text-muted">
              Use your mobile number or provisioned email, then continue into your daily dashboard.
            </Text>

            <View className="mt-6">
              <Field
                label="Mobile number"
                placeholder="+234 803 123 4567"
                keyboardType="phone-pad"
                autoComplete="tel"
                value={phone}
                onChangeText={setPhone}
              />

              <View className="mb-3">
                <Text className="font-sans mb-2 text-base font-medium text-ink">Password</Text>
                <View className="relative">
                  <Field
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    value={password}
                    onChangeText={setPassword}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    hitSlop={8}
                    className="absolute inset-y-0 right-0 items-center justify-center pr-4"
                  >
                    <Text className={`font-sans text-sm font-semibold ${showPassword ? 'text-ink' : 'text-muted'}`}>
                      {showPassword ? 'Hide' : 'Show'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {error ? (
                <View className="mb-2 rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3">
                  <Text role="alert" className="font-sans font-medium text-bad">
                    {error}
                  </Text>
                </View>
              ) : null}

              <PrimaryButton label="Sign in" icon="arrow-forward" onPress={submit} busy={busy} />

              <View className="mt-5 flex-row flex-wrap items-center justify-between gap-3">
                <Link href="/forgot-password" asChild>
                  <Pressable>
                    <Text className="font-sans text-base font-medium text-primaryText">Forgot password?</Text>
                  </Pressable>
                </Link>
                <View className="flex-row items-center gap-2 rounded-full bg-lavender px-3 py-2">
                  <Ionicons name="shield-checkmark" size={14} color="#7B2FBE" />
                  <Text className="font-sans text-xs text-muted">Secure sign-in</Text>
                </View>
              </View>
            </View>
          </GlassCard>

          <Link href="/register" asChild>
            <Pressable className="mt-6 max-w-full self-center rounded-full border border-edge bg-white px-5 py-3">
              <Text className="font-sans text-center text-base font-medium text-ink">New here? Register as a Brand Ambassador</Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppBackdrop>
  );
}
