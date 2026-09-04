import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { registrationSchema, normalizeInternationalPhone, phoneToAuthEmail } from '@fazoo/validation';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';
import { AppBackdrop, HeroCard, Field } from '@/components/ui';

function SecureField({ label, value, onChange, keyboardType }: { label: string; value: string; onChange: (v: string) => void; keyboardType?: 'default' | 'phone-pad'; }) {
  const [show, setShow] = useState(false);
  return (
    <View className="mb-1">
      <Field
        label={label}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        secureTextEntry={!show}
        autoCapitalize="none"
      />
      <Pressable
        onPress={() => setShow((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        hitSlop={8}
        className="-mt-1 mb-3 self-end"
      >
        <Text className="text-sm font-semibold text-white/70">{show ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );
}

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (busy) return;

    const parsed = registrationSchema.safeParse({
      full_name: fullName,
      phone,
      password,
      password_confirm: passwordConfirm,
      profile_photo: null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
      return;
    }

    const e164 = normalizeInternationalPhone(phone);
    if (!e164.ok || !e164.e164) {
      setError('Enter a valid mobile number (include your country code, e.g. +2547…).');
      return;
    }

    const alias = phoneToAuthEmail(e164.e164);
    setBusy(true);
    try {
      const { data: signUp, error: signUpError } = await supabase.auth.signUp({
        email: alias,
        password,
        options: {
          data: {
            full_name: parsed.data.full_name,
            phone: e164.e164,
            organization_slug: 'lenovo-nigeria',
          },
        },
      });
      if (signUpError) {
        setError(/already registered|already exists/i.test(signUpError.message) ? 'An account with this mobile number already exists.' : 'Registration failed — check your details and connection.');
        return;
      }
      if (!signUp.session || !signUp.user) {
        setError('Registration succeeded but sign-in is pending — please contact support.');
        return;
      }

      router.replace('/pending-approval');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppBackdrop overlayOpacity={0.22}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <HeroCard
            eyebrow="Join Fazoo"
            title="Become a Brand Ambassador"
            subtitle="Create your account in one quick step and wait for an administrator to approve it."
            icon="person-add"
          />
          <View className="mb-4 rounded-3xl border border-white/14 bg-white/10 px-4 py-4">
            <Text className="text-sm leading-6 text-[#4D3426]">
              Sign up first. Your administrator will connect you to the right brand and assign your stores or schools.
            </Text>
          </View>

          <Field label="Full name (as on ID)" value={fullName} onChangeText={setFullName} />
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <SecureField label="Password" value={password} onChange={setPassword} />
          <SecureField label="Confirm password" value={passwordConfirm} onChange={setPasswordConfirm} />

          {error ? <Text role="alert" className="mb-3 text-sm font-medium text-rose-200">{error}</Text> : null}

          <PrimaryButton
            label={busy ? 'Creating account…' : 'Create my account'}
            onPress={() => void submit()}
            busy={busy}
            disabled={busy}
            icon="checkmark-circle"
          />
          <PrimaryButton label="Back to sign in" variant="ghost" onPress={() => router.replace('/sign-in')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </AppBackdrop>
  );
}
