import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { toAuthEmail, normalizeInternationalPhone } from '@fazoo/validation';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const normalized = normalizeInternationalPhone(phone);
    const email = normalized.ok && normalized.e164 ? toAuthEmail(normalized.e164) : null;
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
      router.replace('/today');
    } catch (cause) {
      console.error('[sign-in] unexpected failure', cause);
      Sentry.captureException(cause);
      setError('Something went wrong. This has been noted — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-ink px-6 justify-center"
    >
      <Text className="text-white text-3xl font-bold mb-1">Fazoo</Text>
      <Text className="text-white/60 mb-10">Sign in with your mobile number</Text>
      <TextInput
        className="h-14 rounded-xl bg-charcoal text-white text-lg px-4 mb-3"
        placeholder="+234 803 123 4567"
        placeholderTextColor="#6B6472"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={phone}
        onChangeText={setPhone}
      />
      <View className="relative mb-2">
        <TextInput
          className="h-14 rounded-xl bg-charcoal text-white text-lg px-4 pr-16"
          placeholder="Password"
          placeholderTextColor="#6B6472"
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
          <Text className={`text-sm font-semibold ${showPassword ? 'text-bright' : 'text-white/60'}`}>
            {showPassword ? 'Hide' : 'Show'}
          </Text>
        </Pressable>
      </View>

      {error ? (
        <Text role="alert" className="text-bad font-medium mb-2">
          {error}
        </Text>
      ) : null}

      <TouchableOpacity
        className="h-14 rounded-xl bg-primary items-center justify-center mt-4"
        onPress={submit}
        disabled={busy}
        accessibilityLabel="Sign in"
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold text-lg">Sign in</Text>
        )}
      </TouchableOpacity>

      <Link href="/register" className="mt-8 self-center">
        <Text className="text-bright">New here? Register as a Brand Ambassador</Text>
      </Link>
      <Link href="/forgot-password" className="mt-3 self-center">
        <Text className="text-white/50">Forgot password?</Text>
      </Link>
    </KeyboardAvoidingView>
  );
}
