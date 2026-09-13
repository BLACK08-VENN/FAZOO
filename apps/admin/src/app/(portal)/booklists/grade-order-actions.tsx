'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function GradeOrderActions({
  gradeRequestId,
  conversionStatus,
  hasWord,
  conversionError,
  canAct,
}: {
  gradeRequestId: string;
  conversionStatus: string;
  hasWord: boolean;
  conversionError: string | null;
  canAct: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function convert() {
    setBusy(true);
    setFeedback(null);
    setFailed(false);
    try {
      const response = await fetch(`/api/booklists/grades/${gradeRequestId}/convert`, { method: 'POST' });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        outcome?: 'draft_created' | 'manual_required' | 'failed';
      };
      if (!response.ok) throw new Error(body.error ?? body.message ?? 'Conversion failed.');
      if (body.outcome === 'manual_required') {
        setFailed(true);
        setFeedback(body.message ?? 'This file needs manual conversion.');
      } else {
        setFeedback(body.message ?? 'Word document created.');
        router.refresh();
      }
    } catch (error) {
      setFailed(true);
      setFeedback(error instanceof Error ? error.message : 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/booklists/grades/${gradeRequestId}/download?kind=raw`}
          className="inline-flex h-8 items-center rounded-lg border border-ink/15 bg-white px-2.5 text-xs font-medium text-ink hover:bg-lavender"
        >
          Original
        </a>
        {hasWord ? (
          <a
            href={`/api/booklists/grades/${gradeRequestId}/download?kind=word`}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-xs font-medium text-white hover:bg-deep"
          >
            Word document
          </a>
        ) : canAct ? (
          <Button type="button" size="sm" onClick={() => void convert()} disabled={busy}>
            {busy ? 'Converting…' : conversionStatus === 'failed' ? 'Retry conversion' : 'Convert to Word'}
          </Button>
        ) : null}
      </div>
      <p className={`text-[11px] ${conversionStatus === 'succeeded' ? 'text-ok' : conversionStatus === 'failed' || conversionStatus === 'manual_required' ? 'text-bad' : 'text-muted'}`}>
        {hasWord
          ? 'Word ready'
          : conversionStatus === 'processing'
            ? 'Conversion in progress'
            : conversionStatus === 'failed'
              ? 'Conversion failed'
              : conversionStatus === 'manual_required'
                ? 'Manual review required'
                : 'Waiting for conversion'}
      </p>
      {conversionError && !feedback ? <p className="max-w-72 text-[11px] text-bad">{conversionError}</p> : null}
      {feedback ? <p className={`max-w-72 text-[11px] ${failed ? 'text-bad' : 'text-ok'}`}>{feedback}</p> : null}
    </div>
  );
}
