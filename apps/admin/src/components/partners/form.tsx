'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { lagosDate } from '@fazoo/config';
import {
  PARTNER_STATES,
  PARTNER_BRANDS,
  PARTNER_PRODUCTS,
  PARTNER_MOSTLY,
  PARTNER_CUSTOMERS,
  partnerTotals,
  type PartnerLogInput,
} from '@fazoo/validation';
import { searchPartners, submitPartnerLog } from '@/app/(brand)/brand/partners/actions';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { PartnerLog, PartnerOutlet } from '@/lib/partners';

type Draft = { values: Record<string, string>; requestId: string; frozen: boolean };
export function PartnerForm({
  userId,
  organizationId,
  collectorName,
  high,
  medium,
  correction,
}: {
  userId: string;
  organizationId: string;
  collectorName: string;
  high: number;
  medium: number;
  correction?: PartnerLog;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({
    visit_date: lagosDate(),
    reporting_month: lagosDate().slice(0, 7),
    visit_method: 'Visit',
    sales_basis: 'Actual month',
  });
  const [requestId, setRequestId] = useState('');
  const [frozen, setFrozen] = useState(false);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState('');
  const [outlets, setOutlets] = useState<PartnerOutlet[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const draftKey = `fazoo-partner:${organizationId}:${userId}${correction ? `:${correction.id}` : ''}`;
  useEffect(() => {
    setRequestId(crypto.randomUUID());
    if (correction) {
      const d = correction.payload;
      const v: Record<string, string> = {};
      for (const [key, value] of Object.entries(d))
        if (key !== 'sales' && key !== 'products') v[key] = value === null ? '' : String(value);
      v.reporting_month = d.reporting_month.slice(0, 7);
      v.correction_of = correction.id;
      for (const b of PARTNER_BRANDS)
        v[`sales.${b}`] = d.sales[b] === null ? 'Unknown' : String(d.sales[b]);
      v.employees = d.employees === null ? 'Unknown' : String(d.employees);
      for (const b of PARTNER_PRODUCTS) v[`products.${b}`] = d.products[b];
      setValues(v);
    }
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setSaved(JSON.parse(raw) as Draft);
    } catch {
      setNotice('Saved drafts are unavailable in this browser.');
    }
  }, [draftKey, correction]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError('');
      searchPartners(query)
        .then((rows) => {
          if (!cancelled) setOutlets(rows);
        })
        .catch(() => {
          if (!cancelled) setSearchError('Outlet search could not load. Retry when connected.');
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  function update(key: string, value: string) {
    setValues((old) => ({ ...old, [key]: value }));
    setNotice('');
  }
  function saveDraft(message = 'Draft saved on this device.') {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ values, requestId, frozen }));
      setNotice(message);
    } catch {
      setNotice('Could not save this draft. Keep this page open.');
    }
  }
  function field(
    key: string,
    label: string,
    options?: readonly string[],
    type = 'text',
    required = true,
  ) {
    return (
      <div key={key}>
        <Label htmlFor={`partner-${key}`}>
          {label}
          {required ? ' *' : ' (optional)'}
        </Label>
        {options ? (
          <Select
            id={`partner-${key}`}
            value={values[key] ?? ''}
            onChange={(e) => update(key, e.target.value)}
            required={required}
          >
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        ) : (
          <Input
            id={`partner-${key}`}
            type={type}
            maxLength={key === 'email' ? 254 : 200}
            value={values[key] ?? ''}
            onChange={(e) => update(key, e.target.value)}
            required={required}
            max={
              key === 'visit_date'
                ? lagosDate()
                : key === 'reporting_month'
                  ? lagosDate().slice(0, 7)
                  : undefined
            }
          />
        )}
      </div>
    );
  }
  function count(key: string, label: string) {
    const unknown = values[key] === 'Unknown';
    return (
      <div key={key}>
        <Label htmlFor={`partner-${key}`}>{label} *</Label>
        <Input
          id={`partner-${key}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={10000000}
          step={1}
          disabled={unknown}
          required={!unknown}
          value={unknown ? '' : (values[key] ?? '')}
          onChange={(e) => update(key, e.target.value)}
        />
        <label className="mt-2 flex min-h-8 items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={unknown}
            onChange={(e) => update(key, e.target.checked ? 'Unknown' : '')}
          />
          Unknown / not provided
        </label>
      </div>
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
  const totals = partnerTotals(sales, high, medium);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    const payload: PartnerLogInput = {
      partner_id: values.partner_id || null,
      company_name: values.company_name || '',
      city: values.city || '',
      state: values.state as PartnerLogInput['state'],
      branch: values.branch || '',
      visit_date: values.visit_date || '',
      visit_method: values.visit_method as PartnerLogInput['visit_method'],
      reporting_month: `${values.reporting_month}-01`,
      sales_basis: values.sales_basis as PartnerLogInput['sales_basis'],
      contact_person: values.contact_person || '',
      phone: values.phone || '',
      email: values.email || '',
      employees: values.employees === 'Unknown' ? null : Number(values.employees),
      sales,
      other_brand_names: values.other_brand_names || '',
      sells_mostly: values.sells_mostly as PartnerLogInput['sells_mostly'],
      products: Object.fromEntries(
        PARTNER_PRODUCTS.map((b) => [b, values[`products.${b}`]]),
      ) as PartnerLogInput['products'],
      main_customers: values.main_customers as PartnerLogInput['main_customers'],
      notes: values.notes || '',
      correction_of: correction?.id || null,
    };
    // Freeze the exact request after an attempt, so a lost response can be retried safely.
    setFrozen(true);
    try {
      localStorage.setItem(draftKey, JSON.stringify({ values, requestId, frozen: true }));
    } catch {
      /* Submission can proceed without local persistence. */
    }
    try {
      const result = await submitPartnerLog(requestId, payload);
      if (result.error) {
        setNotice(result.error);
        return;
      }
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* The server receipt remains authoritative. */
      }
      setSaved(null);
      setFrozen(false);
      setRequestId(crypto.randomUUID());
      setValues({
        visit_date: lagosDate(),
        reporting_month: lagosDate().slice(0, 7),
        visit_method: 'Visit',
        sales_basis: 'Actual month',
      });
      setNotice(
        `Submitted successfully. Receipt: ${result.data?.id}. Your log is now available to admin.`,
      );
      if (correction)
        router.replace(`/brand/partners?month=${payload.reporting_month.slice(0, 7)}`);
      router.refresh();
    } catch {
      setNotice(
        'Submission was not confirmed. Reconnect and retry the same log. Your answers have been kept.',
      );
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  return (
    <Card className="mb-6 p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">
        {correction ? 'Correct a submitted log' : 'New partner log'}
      </h2>
      <p className="mt-1 text-sm text-muted">
        One outlet per log. Collected by {collectorName}. Required fields are marked *. Use zero
        for no sales and Unknown for unavailable figures.
      </p>
      {saved ? (
        <div className="my-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          A saved draft is available on this device.
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setValues(saved.values);
                setRequestId(saved.requestId);
                setFrozen(saved.frozen);
                setSaved(null);
                setNotice('Draft restored.');
              }}
            >
              Restore draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                localStorage.removeItem(draftKey);
                setSaved(null);
              }}
            >
              Discard draft
            </Button>
          </div>
        </div>
      ) : null}
      <form onSubmit={submit} className="mt-5 space-y-6">
        <fieldset disabled={busy || frozen} className="space-y-6 disabled:opacity-75">
          <section>
            <h3 className="mb-3 font-semibold">Company and visit</h3>
            {!correction ? (
              <>
                <Label htmlFor="partner-search">
                  Find an existing outlet before adding one
                </Label>
                <Input
                  id="partner-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search company, city or branch"
                />
                <p className="my-2 text-xs text-muted">
                  {searching
                    ? 'Searching…'
                    : 'Showing up to 50 matching outlets. Narrow your search if needed.'}
                </p>
                {searchError ? (
                  <p role="alert" className="text-sm text-bad">
                    {searchError}
                  </p>
                ) : null}
                <Label htmlFor="partner-outlet">Existing outlet or new company</Label>
                <Select
                  id="partner-outlet"
                  value={values.partner_id || ''}
                  onChange={(e) => {
                    const o = outlets.find((x) => x.id === e.target.value);
                    setValues((old) => ({
                      ...old,
                      partner_id: o?.id || '',
                      company_name: o?.company_name || '',
                      city: o?.city || '',
                      state: o?.state || '',
                      branch: o?.branch || '',
                    }));
                  }}
                >
                  <option value="">Add a new company / outlet</option>
                  {values.partner_id && !outlets.some((o) => o.id === values.partner_id) ? (
                    <option value={values.partner_id}>
                      {values.company_name} — {values.city}
                    </option>
                  ) : null}
                  {outlets.map((o) => (
                    <option value={o.id} key={o.id}>
                      {o.company_name} — {o.city}
                      {o.branch ? ` / ${o.branch}` : ''} ({o.state})
                    </option>
                  ))}
                </Select>
              </>
            ) : null}
            <fieldset
              disabled={Boolean(values.partner_id)}
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              {field('company_name', 'Company name')}
              {field('city', 'City / area')}
              {field('state', 'State', PARTNER_STATES)}
              {field('branch', 'Branch / outlet identifier', undefined, 'text', false)}
            </fieldset>
            <p className="my-2 text-xs text-muted">
              Use a branch name or address to distinguish outlets of the same company. Existing
              outlet identity is preserved.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('visit_date', 'Visit / call date', undefined, 'date')}
              {field('visit_method', 'Contact method', ['Visit', 'Call'])}
              {field('reporting_month', 'Sales reporting month', undefined, 'month')}
              {field('sales_basis', 'Sales figures', [
                'Actual month',
                'Typical month estimate',
              ])}
            </div>
          </section>
          <section>
            <h3 className="mb-3 font-semibold">Contact and company size</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('contact_person', 'Contact person (or “Not provided”)')}
              {field('phone', 'Phone', undefined, 'tel', false)}
              {field('email', 'Email', undefined, 'email', false)}
              {count('employees', 'Number of employees')}
            </div>
          </section>
          <section>
            <h3 className="mb-3 font-semibold">PCs sold per month by brand</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PARTNER_BRANDS.map((b) => count(`sales.${b}`, b))}
              {field(
                'other_brand_names',
                'Other brand names',
                undefined,
                'text',
                (sales.Other ?? 0) > 0,
              )}
            </div>
          </section>
          <section>
            <h3 className="mb-3 font-semibold">Products and customers</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('sells_mostly', 'Sells mostly', PARTNER_MOSTLY)}
              {field('main_customers', 'Main customers', PARTNER_CUSTOMERS)}
              {PARTNER_PRODUCTS.map((b) => field(`products.${b}`, b, ['Yes', 'No', 'Unknown']))}
            </div>
          </section>
          <div>
            <Label htmlFor="partner-notes">Notes (optional)</Label>
            <textarea
              id="partner-notes"
              className="min-h-24 w-full rounded-lg border border-ink/15 bg-white p-3 text-sm text-ink"
              maxLength={3000}
              value={values.notes ?? ''}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </fieldset>
        <div
          className="grid gap-3 rounded-xl bg-primary/5 p-4 text-sm sm:grid-cols-3"
          aria-live="polite"
        >
          <p>
            Total PCs/month: <strong>{totals.total ?? 'Unknown'}</strong>
          </p>
          <p>
            Lenovo share:{' '}
            <strong>
              {totals.share === null ? 'Not available' : `${(totals.share * 100).toFixed(1)}%`}
            </strong>
          </p>
          <p>
            Priority: <strong>{totals.priority}</strong>
          </p>
        </div>
        {frozen ? (
          <p className="text-sm text-muted">
            This submission is held for a safe retry. To change answers after an error, unlock
            it. If a submission succeeded, use its correction action in the log history.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy || !requestId}>
            {busy ? 'Submitting…' : frozen ? 'Retry submission' : 'Submit partner log'}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => saveDraft()}>
            Save draft
          </Button>
          {frozen ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setFrozen(false);
                setNotice(
                  'Answers unlocked. Retry protection still uses the same receipt. If already submitted, use a correction.',
                );
              }}
            >
              Unlock answers
            </Button>
          ) : null}
        </div>
        {notice ? (
          <p
            role="status"
            className="break-words rounded-lg border border-primary/20 p-3 text-sm"
          >
            {notice}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
