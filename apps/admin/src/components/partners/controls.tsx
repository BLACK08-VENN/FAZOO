'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPartnerThresholds } from '@/app/(brand)/brand/partners/actions';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function PartnerRefresh({ automatic = false }: { automatic?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!automatic) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [automatic, router]);
  return (
    <Button type="button" variant="outline" onClick={() => router.refresh()}>
      Refresh results
    </Button>
  );
}
export function PartnerThresholds({ high, medium }: { high: number; medium: number }) {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <details className="mb-5 rounded-xl border border-ink/10 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Priority settings: High ≥ {high}; Medium ≥ {medium}
      </summary>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const result = await setPartnerThresholds(
              crypto.randomUUID(),
              Number(f.get('high')),
              Number(f.get('medium')),
            );
            setNotice(result.error || 'Priority settings updated for this organization.');
          } catch {
            setNotice(
              'Could not confirm the update. Refresh the results to check the current thresholds.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <Label htmlFor="partner-high">High minimum</Label>
          <Input
            id="partner-high"
            name="high"
            type="number"
            min={1}
            max={10000000}
            step={1}
            defaultValue={high}
            required
          />
        </div>
        <div>
          <Label htmlFor="partner-medium">Medium minimum</Label>
          <Input
            id="partner-medium"
            name="medium"
            type="number"
            min={0}
            max={9999999}
            step={1}
            defaultValue={medium}
            required
          />
        </div>
        <Button disabled={busy}>Save settings</Button>
        {notice ? (
          <p role="status" className="w-full text-sm">
            {notice}
          </p>
        ) : null}
      </form>
    </details>
  );
}
