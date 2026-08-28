import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Link, router } from 'expo-router';
import { toAuthEmail, normalizeInternationalPhone } from '@fazoo/validation';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
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
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) {
      setError('Invalid mobile number or password.');
      return;
    }
    router.replace('/today');
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
      <TextInput
        className="h-14 rounded-xl bg-charcoal text-white text-lg px-4 mb-2"
        placeholder="Password"
        placeholderTextColor="#6B6472"
        secureTextEntry
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
      />

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
