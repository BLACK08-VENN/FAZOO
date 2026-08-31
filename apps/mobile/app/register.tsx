import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { registrationSchema, normalizeInternationalPhone, phoneToAuthEmail } from '@fazoo/validation';
import { supabase } from '@/lib/supabase';
import { capturePhoto, uploadPhotoWithRetry, type CapturedPhoto } from '@/lib/photos';
import { BrandLogo } from '@/components/brand-logo';

interface Brand {
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  logo_url: string | null;
  has_code_gate: boolean;
}

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneConfirm, setPhoneConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc('joinable_brands').then(({ data }) => {
      const list = (data as Brand[] | null) ?? [];
      setBrands(list);
      const first = list[0];
      if (list.length === 1 && first) setBrandId(first.organization_id);
    });
  }, []);

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

    if (!brandId) {
      setError('Select the brand you are joining.');
      return;
    }

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

      // Join the chosen brand (gated brands can self-approve with the code).
      const { error: joinErr } = await supabase.rpc('ba_request_org_membership', {
        p_organization_id: brandId,
        ...(accessCode.trim() ? { p_org_code: accessCode.trim() } : {}),
      });
      if (joinErr) {
        setError(joinErr.message);
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

        {/* Brand selection */}
        <Text className="font-medium text-charcoal mb-2">Brand you are joining *</Text>
        {brands.length === 0 ? (
          <ActivityIndicator color="#7B2FBE" className="mb-4" />
        ) : (
          brands.map((b) => (
            <TouchableOpacity
              key={b.organization_id}
              onPress={() => setBrandId(b.organization_id)}
              accessibilityLabel={`Join ${b.organization_name}`}
              className={`rounded-xl border-2 px-4 py-3 mb-2 ${
                brandId === b.organization_id ? 'border-primary bg-primary/10' : 'border-transparent bg-white'
              }`}
            >
              <BrandLogo
                name={b.organization_name}
                slug={b.organization_slug}
                logoUrl={b.logo_url}
              />
              <Text
                className={`mt-3 font-semibold ${brandId === b.organization_id ? 'text-primary' : 'text-ink'}`}
              >
                {b.organization_name}
              </Text>
              {b.has_code_gate ? (
                <Text className="text-muted text-sm">Access code required</Text>
              ) : null}
            </TouchableOpacity>
          ))
        )}
        {brands.find((b) => b.organization_id === brandId)?.has_code_gate ? (
          <TextInput
            className="h-14 rounded-xl bg-white px-4 text-lg mb-4"
            placeholder="Access code (if you have one)"
            placeholderTextColor="#9a94a5"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={accessCode}
            onChangeText={setAccessCode}
          />
        ) : null}

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
  const [show, setShow] = useState(false);
  return (
    <View className="mb-4">
      <Text className="font-medium text-charcoal mb-2">{label}</Text>
      <View className="relative">
        <TextInput
          className={`h-14 rounded-xl bg-white px-4 text-lg ${secure ? 'pr-16' : ''}`}
          placeholderTextColor="#9a94a5"
          autoCapitalize="none"
          secureTextEntry={secure && !show}
          keyboardType={keyboardType}
          value={value}
          onChangeText={onChange}
        />
        {secure ? (
          <Pressable
            onPress={() => setShow((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            hitSlop={8}
            className="absolute inset-y-0 right-0 items-center justify-center pr-4"
          >
            <Text className={`text-sm font-semibold ${show ? 'text-primary' : 'text-muted'}`}>
              {show ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
