import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lagosDate } from '@fazoo/config';
import {
  PARTNER_BRANDS,
  PARTNER_STATES,
  PARTNER_PRODUCTS,
  PARTNER_MOSTLY,
  PARTNER_CUSTOMERS,
  partnerLogSchema,
  partnerTotals,
  type PartnerLogInput,
} from '@fazoo/validation';
import type { Json } from '@fazoo/database/database.types';
import { supabase } from '@/lib/supabase';
import { useSessionProfile } from '@/lib/session';
import { Page, Card } from '@/components/ui';

type Outlet = { id: string; company_name: string; city: string; state: string; branch: string };
type Draft = { values: Record<string, string>; requestId: string; frozen: boolean };
const initial = () => ({
  visit_date: lagosDate(),
  reporting_month: lagosDate().slice(0, 7),
  visit_method: 'Visit',
  sales_basis: 'Actual month',
});
export default function PartnerLogScreen() {
  const { profile } = useSessionProfile();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [requestId, setRequestId] = useState(() => Crypto.randomUUID());
  const [frozen, setFrozen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [notice, setNotice] = useState('');
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [thresholds, setThresholds] = useState({ high: 100, medium: 30 });
  const [checked, setChecked] = useState(false);
  const [picker, setPicker] = useState<{
    key: string;
    label: string;
    options: readonly string[];
  } | null>(null);
  const draftKey = profile ? `fazoo-partner:${profile.organization_id}:${profile.id}` : null;
  useEffect(() => {
    if (!draftKey) return;
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (raw) setSaved(JSON.parse(raw) as Draft);
      })
      .catch(() => setNotice('Could not load the saved draft.'));
  }, [draftKey]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      supabase.rpc('partner_directory', { p_search: query }).then(({ data, error }) => {
        if (cancelled) return;
        setChecked(true);
        setAllowed(!error);
        if (error) setNotice(error.message);
        else setOutlets(data as unknown as Outlet[]);
        setSearching(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    supabase.rpc('partner_context').then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setNotice(error.message);
        return;
      }
      setThresholds(data as { high: number; medium: number });
    });
    return () => {
      cancelled = true;
    };
  }, [profile]);
  function change(key: string, value: string) {
    setValues((old) => ({ ...old, [key]: value }));
  }
  function field(
    key: string,
    label: string,
    options?: readonly string[],
    optional = false,
    numeric = false,
  ) {
    return (
      <View key={key} className="mb-4">
        <Text className="mb-2 font-sans text-sm font-semibold text-ink">
          {label}
          {optional ? ' (optional)' : ' *'}
        </Text>
        {options ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={frozen || busy}
            onPress={() => setPicker({ key, label, options })}
            className="min-h-12 rounded-xl border border-primary/20 bg-white p-3"
          >
            <Text className="font-sans text-sm text-ink">{values[key] || 'Choose…'}</Text>
          </Pressable>
        ) : (
          <TextInput
            accessibilityLabel={label}
            editable={
              !frozen &&
              !busy &&
              !(values.partner_id && ['company_name', 'city', 'state', 'branch'].includes(key))
            }
            value={values[key] ?? ''}
            onChangeText={(v) => change(key, v)}
            keyboardType={
              numeric
                ? 'number-pad'
                : key === 'email'
                  ? 'email-address'
                  : key === 'phone'
                    ? 'phone-pad'
                    : 'default'
            }
            autoCapitalize={key === 'email' ? 'none' : 'sentences'}
            maxLength={key === 'notes' ? 3000 : 254}
            placeholder={
              key === 'visit_date' ? 'YYYY-MM-DD' : key === 'reporting_month' ? 'YYYY-MM' : ''
            }
            className="min-h-12 rounded-xl border border-primary/20 bg-white px-3 font-sans text-sm text-ink"
          />
        )}
      </View>
    );
  }
  function count(key: string, label: string) {
    return (
      <View key={key}>
        {field(key, label, undefined, false, true)}
        <Pressable
          disabled={frozen || busy}
          className="mb-5 min-h-10 justify-center rounded-lg bg-primary/5 px-3"
          onPress={() => change(key, values[key] === 'Unknown' ? '' : 'Unknown')}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: values[key] === 'Unknown' }}
        >
          <Text className="font-sans text-xs text-primary">
            {values[key] === 'Unknown'
              ? '✓ Unknown / not provided'
              : 'Mark as unknown / not provided'}
          </Text>
        </Pressable>
      </View>
    );
  }
  const sales = Object.fromEntries(
    PARTNER_BRANDS.map((b) => [
      b,
      values[`sales.${b}`] && values[`sales.${b}`] !== 'Unknown'
        ? Number(values[`sales.${b}`])
        : null,
    ]),
  ) as PartnerLogInput['sales'];
  const totals = partnerTotals(sales, thresholds.high, thresholds.medium);
  async function persist() {
    if (!draftKey) return;
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify({ values, requestId, frozen }));
      setNotice('Draft saved on this device.');
    } catch {
      setNotice('Could not save this draft. Keep this screen open.');
    }
  }
  async function submit() {
    if (pending.current || !profile || !draftKey) return;
    if (PARTNER_BRANDS.some((b) => !values[`sales.${b}`]) || !values.employees) {
      setNotice('Answer every brand quantity and employee count, or mark it unknown.');
      return;
    }
    const candidate = {
      partner_id: values.partner_id || null,
      company_name: values.company_name || '',
      city: values.city || '',
      state: values.state,
      branch: values.branch || '',
      visit_date: values.visit_date,
      visit_method: values.visit_method,
      reporting_month: `${values.reporting_month}-01`,
      sales_basis: values.sales_basis,
      contact_person: values.contact_person || '',
      phone: values.phone || '',
      email: values.email || '',
      employees: values.employees === 'Unknown' ? null : Number(values.employees),
      sales,
      other_brand_names: values.other_brand_names || '',
      sells_mostly: values.sells_mostly,
      products: Object.fromEntries(PARTNER_PRODUCTS.map((b) => [b, values[`products.${b}`]])),
      main_customers: values.main_customers,
      notes: values.notes || '',
      correction_of: values.correction_of || null,
    };
    const parsed = partnerLogSchema.safeParse(candidate);
    if (!parsed.success) {
      setNotice(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
      return;
    }
    pending.current = true;
    setBusy(true);
    setFrozen(true);
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify({ values, requestId, frozen: true }));
    } catch {
      /* Server receipt still protects retries. */
    }
    try {
      const { data, error } = await supabase.rpc('partner_submit_log', {
        p_client_request_id: requestId,
        p_payload: parsed.data as unknown as Json,
      });
      if (error) {
        setNotice(error.message);
        return;
      }
      const receipt = data as { id: string };
      try {
        await AsyncStorage.removeItem(draftKey);
      } catch {
        /* Best effort clearing of local draft. */
      }
      setSaved(null);
      setFrozen(false);
      setValues(initial());
      setRequestId(Crypto.randomUUID());
      setNotice(`Submitted successfully. Receipt: ${receipt.id}. Admin can now see your log.`);
    } catch {
      setNotice(
        'Submission was not confirmed. Reconnect and retry the same log. Your answers are saved on this device.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Page>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        className="mb-4 min-h-11 justify-center"
      >
        <Text className="font-sans text-sm font-semibold text-primary">Back to dashboard</Text>
      </Pressable>
      <Text className="mb-2 font-sans text-2xl font-bold text-ink">Partner collection</Text>
      <Text className="mb-4 font-sans text-sm text-muted">
        Lenovo Nigeria. One outlet per log. Use zero for no sales and Unknown for unavailable
        figures.
      </Text>
      {!checked ? (
        <ActivityIndicator accessibilityLabel="Checking collection access" />
      ) : !allowed ? (
        <Text accessibilityRole="alert" className="font-sans text-sm text-bad">
          {notice || 'Partner collection is unavailable. Reconnect and try again.'}
        </Text>
      ) : (
        <>
          {saved ? (
            <Card>
              <Text className="mb-3 font-sans text-sm">A saved draft is available.</Text>
              <Pressable
                className="min-h-11 justify-center"
                onPress={() => {
                  setValues(saved.values);
                  setRequestId(saved.requestId);
                  setFrozen(saved.frozen);
                  setSaved(null);
                }}
              >
                <Text className="font-sans font-bold text-primary">Restore draft</Text>
              </Pressable>
              <Pressable
                className="min-h-11 justify-center"
                onPress={() => {
                  if (draftKey) void AsyncStorage.removeItem(draftKey);
                  setSaved(null);
                }}
              >
                <Text className="font-sans text-muted">Discard draft</Text>
              </Pressable>
            </Card>
          ) : null}
          <Card>
            <Text className="mb-4 font-sans text-lg font-bold">Company and visit</Text>
            {field('search', 'Search existing outlets', undefined, true)}
            <Pressable
              disabled={busy || frozen}
              className="mb-3 min-h-11 justify-center rounded-lg bg-primary/5 px-3"
              onPress={() => setQuery(values.search || '')}
            >
              <Text className="font-sans font-semibold text-primary">
                {searching ? 'Searching…' : 'Find outlets'}
              </Text>
            </Pressable>
            <Text className="mb-2 font-sans text-xs text-muted">
              Up to 50 matches. Narrow the search to find more.
            </Text>
            <ScrollView className="mb-4 max-h-40" nestedScrollEnabled>
              {outlets.map((o) => (
                <Pressable
                  disabled={busy || frozen}
                  key={o.id}
                  className="min-h-12 border-b border-primary/10 py-3"
                  onPress={() =>
                    setValues((old) => ({
                      ...old,
                      partner_id: o.id,
                      company_name: o.company_name,
                      city: o.city,
                      state: o.state,
                      branch: o.branch,
                    }))
                  }
                >
                  <Text className="font-sans text-sm text-primary">
                    {o.company_name} — {o.city} / {o.branch} ({o.state})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {values.partner_id ? (
              <Pressable
                disabled={busy || frozen}
                className="mb-3 min-h-11 justify-center"
                onPress={() =>
                  setValues((old) => ({
                    ...old,
                    partner_id: '',
                    company_name: '',
                    city: '',
                    state: '',
                    branch: '',
                  }))
                }
              >
                <Text className="font-sans text-primary">Add a different new outlet</Text>
              </Pressable>
            ) : null}
            {field('company_name', 'Company name')}
            {field('city', 'City / area')}
            {values.partner_id
              ? field('state', 'State')
              : field('state', 'State', PARTNER_STATES)}
            {field('branch', 'Branch / outlet identifier', undefined, true)}
            {field('visit_date', 'Visit / call date (YYYY-MM-DD)')}
            {field('visit_method', 'Contact method', ['Visit', 'Call'])}
            {field('reporting_month', 'Sales reporting month (YYYY-MM)')}
            {field('sales_basis', 'Sales figures', ['Actual month', 'Typical month estimate'])}
          </Card>
          <Card>
            <Text className="mb-4 font-sans text-lg font-bold">Contact and size</Text>
            {field('contact_person', 'Contact person (or Not provided)')}
            {field('phone', 'Phone', undefined, true)}
            {field('email', 'Email', undefined, true)}
            {count('employees', 'Number of employees')}
          </Card>
          <Card>
            <Text className="mb-4 font-sans text-lg font-bold">PCs sold per month</Text>
            {PARTNER_BRANDS.map((b) => count(`sales.${b}`, b))}
            {field(
              'other_brand_names',
              'Other brand names',
              undefined,
              (sales.Other ?? 0) === 0,
            )}
          </Card>
          <Card>
            <Text className="mb-4 font-sans text-lg font-bold">Products and customers</Text>
            {field('sells_mostly', 'Sells mostly', PARTNER_MOSTLY)}
            {PARTNER_PRODUCTS.map((b) => field(`products.${b}`, b, ['Yes', 'No', 'Unknown']))}
            {field('main_customers', 'Main customers', PARTNER_CUSTOMERS)}
            {field('notes', 'Notes', undefined, true)}
          </Card>
          <Card>
            <Text className="font-sans text-sm">
              Total PCs/month: {totals.total ?? 'Unknown'}
              {'\n'}Lenovo share:{' '}
              {totals.share === null ? 'Not available' : `${(totals.share * 100).toFixed(1)}%`}
              {'\n'}Priority: {totals.priority}
            </Text>
            <Text className="mt-2 font-sans text-xs text-muted">
              Priority uses the organization thresholds loaded when this form opens.
            </Text>
          </Card>
          <Pressable
            disabled={busy}
            className="my-3 min-h-12 items-center justify-center rounded-xl bg-primary p-3"
            onPress={() => void submit()}
          >
            <Text className="font-sans font-bold text-white">
              {busy ? 'Submitting…' : frozen ? 'Retry submission' : 'Submit partner log'}
            </Text>
          </Pressable>
          <Pressable
            disabled={busy}
            className="mb-3 min-h-12 items-center justify-center rounded-xl border border-primary p-3"
            onPress={() => void persist()}
          >
            <Text className="font-sans font-bold text-primary">Save draft</Text>
          </Pressable>
          {frozen ? (
            <Pressable
              disabled={busy}
              className="mb-3 min-h-11 justify-center"
              onPress={() => setFrozen(false)}
            >
              <Text className="font-sans text-primary">Unlock answers after an error</Text>
            </Pressable>
          ) : null}
          {notice ? (
            <Text accessibilityRole="alert" className="my-3 font-sans text-sm text-ink">
              {notice}
            </Text>
          ) : null}
          <Text className="mb-6 font-sans text-xs text-muted">
            View submitted history and correct a log in the web workspace under Partner
            collection.
          </Text>
        </>
      )}
      <Modal
        visible={Boolean(picker)}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(null)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[80%] rounded-t-3xl bg-white p-5">
            <Text className="mb-3 font-sans text-lg font-bold">{picker?.label}</Text>
            <ScrollView>
              {picker?.options.map((o) => (
                <Pressable
                  key={o}
                  accessibilityRole="button"
                  className="min-h-12 justify-center border-b border-primary/10 py-3"
                  onPress={() => {
                    change(picker.key, o);
                    setPicker(null);
                  }}
                >
                  <Text className="font-sans text-sm text-ink">{o}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              className="mt-3 min-h-12 justify-center"
              onPress={() => setPicker(null)}
            >
              <Text className="font-sans font-bold text-primary">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Page>
  );
}
