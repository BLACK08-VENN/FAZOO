import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BaTodayResult, VedaTodayResult, OrganizationKind } from '@fazoo/types';
import { supabase } from './supabase';
import type { SessionProfile } from './session';

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function key(name: string): Promise<string | null> {
  const id = await userId();
  return id ? `fazoo.${name}.${id}` : null;
}

async function read<T>(name: string): Promise<T | null> {
  const storageKey = await key(name);
  if (!storageKey) return null;
  const value = await AsyncStorage.getItem(storageKey);
  return value ? (JSON.parse(value) as T) : null;
}

async function write<T>(name: string, value: T): Promise<void> {
  const storageKey = await key(name);
  if (storageKey) await AsyncStorage.setItem(storageKey, JSON.stringify(value));
}

export const readCachedProfile = (): Promise<SessionProfile | null> => read('profile');
export const writeCachedProfile = (profile: SessionProfile): Promise<void> =>
  write('profile', profile);
export const readCachedToday = (): Promise<BaTodayResult | null> => read('today');
export const writeCachedToday = (today: BaTodayResult): Promise<void> => write('today', today);
export const readCachedVedaToday = (): Promise<VedaTodayResult | null> => read('veda-today');
export const writeCachedVedaToday = (today: VedaTodayResult): Promise<void> =>
  write('veda-today', today);
export const readCachedOrgKind = (): Promise<OrganizationKind | null> => read('org-kind');
export const writeCachedOrgKind = (kind: OrganizationKind): Promise<void> =>
  write('org-kind', kind);

export async function clearUserCache(id: string): Promise<void> {
  await AsyncStorage.multiRemove([
    `fazoo.profile.${id}`,
    `fazoo.today.${id}`,
    `fazoo.veda-today.${id}`,
    `fazoo.org-kind.${id}`,
  ]);
}
