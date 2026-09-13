'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const NETWORK_ATTEMPTS = 3;

type ConvertResponse = {
  error?: string;
  message?: string;
  outcome?: 'draft_created' | 'manual_required' | 'failed';
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  attempts = NETWORK_ATTEMPTS,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok || response.status < 500 || attempt === attempts) return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }

    await sleep(attempt * 500);
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed.');
}

function isNetworkLikeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /failed to fetch|network|fetch|connection|timeout/i.test(message);
}

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

  async function serverConvert(): Promise<ConvertResponse> {
    const response = await fetchWithRetry(`/api/booklists/grades/${gradeRequestId}/convert`, {
      method: 'POST',
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => ({}))) as ConvertResponse;
    if (!response.ok) {
      throw new Error(body.error ?? body.message ?? `Conversion failed (${response.status}).`);
    }
    return body;
  }

  async function convert() {
    setBusy(true);
    setFeedback('FAZOO AI is reading the original document…');
    setFailed(false);

    try {
      const body = await serverConvert();

      if (body.outcome === 'manual_required') {
        setFailed(true);
        setFeedback(body.message ?? 'The server AI converter needs to be configured for this file.');
        return;
      }

      if (body.outcome === 'failed') {
        setFailed(true);
        setFeedback(body.message ?? 'AI conversion failed.');
        return;
      }

      setFeedback(body.message ?? 'Word document created with FAZOO AI.');
      router.refresh();
    } catch (error) {
      setFailed(true);
      const message = error instanceof Error ? error.message : 'Conversion failed.';
      setFeedback(
        isNetworkLikeError(error)
          ? 'The FAZOO server could not complete the AI conversion. Please retry once.'
          : `AI conversion failed: ${message}`,
      );
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
            {busy ? 'Converting with AI…' : conversionStatus === 'failed' ? 'Retry AI conversion' : 'Convert to Word'}
          </Button>
        ) : null}
      </div>
      <p className={`text-[11px] ${conversionStatus === 'succeeded' ? 'text-ok' : conversionStatus === 'failed' || conversionStatus === 'manual_required' ? 'text-bad' : 'text-muted'}`}>
        {hasWord
          ? 'Word ready'
          : conversionStatus === 'processing'
            ? 'AI conversion in progress'
            : conversionStatus === 'failed'
              ? 'AI conversion failed'
              : conversionStatus === 'manual_required'
                ? 'AI conversion setup required'
                : 'Waiting for conversion'}
      </p>
      {conversionError && !feedback ? <p className="max-w-72 text-[11px] text-bad">{conversionError}</p> : null}
      {feedback ? <p className={`max-w-72 text-[11px] ${failed ? 'text-bad' : 'text-ok'}`}>{feedback}</p> : null}
    </div>
  );
}
