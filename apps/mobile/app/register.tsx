import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { registrationSchema, normalizeNigerianPhone, phoneToAuthEmail } from '@fazoo/validation';
import { supabase } from '@/lib/supabase';
import { capturePhoto, uploadPhotoWithRetry, type CapturedPhoto } from '@/lib/photos';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneConfirm, setPhoneConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function takePhoto() {
    try {
      const captured = await capturePhoto();
      if (captured) setPhoto(captured);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the camera.');
    }
  }

  async function submit() {
    setError(null);

    // Client-side validation mirrors server rules; Supabase + RPC re-check.
    const parsed = registrationSchema.safeParse({
      full_name: fullName,
      phone,
      phone_confirm: phoneConfirm,
      password,
      password_confirm: passwordConfirm,
      profile_photo: photo
        ? { mime_type: photo.mimeType, size_bytes: photo.fileSize ?? 1_000_000 }
        : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
      return;
    }

    const e164 = normalizeNigerianPhone(phone);
    if (!e164.ok || !e164.e164) {
      setError('Enter a valid Nigerian mobile number.');
      return;
    }

    // Duplicate check (fast feedback; DB remains authoritative).
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
        setError(
          /already registered|already exists/i.test(signUpError.message)
            ? 'An account with this mobile number already exists.'
            : 'Registration failed — check your details and connection.',
        );
        return;
      }
      if (!signUp.session || !signUp.user) {
        setError('Registration succeeded but sign-in is pending — please contact support.');
        return;
      }

      // Upload photo into the user's own private folder.
      const { data: me } = await supabase.from('profiles').select('organization_id').single();
      if (me && photo) {
        const path = `${me.organization_id}/${signUp.user.id}/profile.jpg`;
        await uploadPhotoWithRetry('profile-photos', path, photo);
        await supabase
          .from('profiles')
          .update({ profile_photo_path: path })
          .eq('id', signUp.user.id);
      }

      router.replace('/pending-approval');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView contentContainerClassName="bg-lavender px-6 py-12" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-ink">Become a Brand Ambassador</Text>
        <Text className="text-muted mt-1 mb-8">
          All fields are required. You can start after an administrator approves you.
        </Text>

        {/* Photo */}
        <Text className="font-medium text-charcoal mb-2">Profile photograph *</Text>
        <TouchableOpacity
          onPress={takePhoto}
          accessibilityLabel="Take profile photograph"
          className="h-40 rounded-xl border-2 border-dashed border-primary/40 bg-white items-center justify-center mb-4 overflow-hidden"
        >
          {photo ? (
            <Image source={{ uri: photo.uri }} className="h-full w-full" resizeMode="cover" />
          ) : (
            <Text className="text-primary font-semibold">Tap to take a photo</Text>
          )}
        </TouchableOpacity>

        <Field label="Full name (as on ID)" value={fullName} onChange={setFullName} />
        <Field label="Mobile number" value={phone} onChange={setPhone} keyboardType="phone-pad" />
        <Field label="Confirm mobile number" value={phoneConfirm} onChange={setPhoneConfirm} keyboardType="phone-pad" />
        <Field label="Password" value={password} onChange={setPassword} secure />
        <Field label="Confirm password" value={passwordConfirm} onChange={setPasswordConfirm} secure />

        {error ? (
          <Text role="alert" className="text-bad font-medium mb-3">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={submit}
          disabled={busy}
          accessibilityLabel="Create account"
          className="h-14 rounded-xl bg-primary items-center justify-center mt-2"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-lg">Create my account</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  keyboardType?: 'default' | 'phone-pad';
}) {
  return (
    <View className="mb-4">
      <Text className="font-medium text-charcoal mb-2">{label}</Text>
      <TextInput
        className="h-14 rounded-xl bg-white px-4 text-lg"
        placeholderTextColor="#9a94a5"
        autoCapitalize="none"
        secureTextEntry={secure}
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}
