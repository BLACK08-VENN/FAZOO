import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSessionProfile } from '@/lib/session';

export function PartnerEntry() {
  const { profile } = useSessionProfile();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!profile) return;
    supabase
      .from('organizations')
      .select('slug')
      .eq('id', profile.organization_id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setEnabled(data?.slug === 'lenovo-nigeria');
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);
  if (!enabled) return null;
  return (
    <Pressable
      className="my-4 min-h-14 rounded-2xl bg-primary p-4"
      onPress={() => router.push('/partner-log')}
      accessibilityRole="button"
    >
      <Text className="font-sans text-base font-bold text-white">Partner collection</Text>
      <Text className="mt-1 font-sans text-xs text-white">
        Record a company visit or call and monthly PC figures
      </Text>
    </Pressable>
  );
}
