'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fazooToast } from '@/components/toast';
export function GradeOrderActions({
  gradeRequestId,
  jobId,
  hasWord,
  canAct,
}: {
  gradeRequestId: string;
  jobId: string;
  conversionStatus: string;
  conversionProvider: string | null;
  hasWord: boolean;
  canAct: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const wordInputRef = useRef<HTMLInputElement>(null);
  async function publishWord() {
    if (!wordFile) return;
    setBusy(true);
    setFailed(false);
    setFeedback('Uploading the corrected document…');
    try {
      const form = new FormData();
      form.set('file', wordFile);
      form.set('client_request_id', crypto.randomUUID());
      const response = await fetch(`/api/booklists/grades/${gradeRequestId}/word`, {
        method: 'POST',
        body: form,
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? 'Could not publish the corrected document.');
      setFeedback(
        'Corrected document attached. It is ready to share with the school for approval.',
      );
      fazooToast('Corrected document attached successfully.');
      setWordFile(null);
      if (wordInputRef.current) wordInputRef.current.value = '';
      router.refresh();
    } catch (error) {
      setFailed(true);
      setFeedback(
        error instanceof Error ? error.message : 'Could not publish the corrected document.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          className="text-sm text-primary underline"
          href={`/api/booklists/grades/${gradeRequestId}/download?kind=raw`}
        >
          Download original
        </a>
        {hasWord ? (
          <a
            className="text-sm text-primary underline"
            href={`/api/booklists/grades/${gradeRequestId}/download?kind=word`}
          >
            Download prepared document
          </a>
        ) : null}
      </div>
      {canAct ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Prepared Word or PDF document"
            ref={wordInputRef}
            type="file"
            accept=".doc,.docx,.pdf"
            className="sr-only"
            onChange={(e) => {
              setWordFile(e.target.files?.[0] ?? null);
              setFeedback(null);
              setFailed(false);
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => (wordFile ? void publishWord() : wordInputRef.current?.click())}
          >
            {busy
              ? 'Uploading…'
              : wordFile
                ? 'Upload prepared document'
                : 'Attach prepared document'}
          </Button>
          {wordFile ? <span className="text-xs text-muted">{wordFile.name}</span> : null}
        </div>
      ) : null}
      <p className="text-xs text-muted">
        OCR is temporarily disabled. Download the original and upload a prepared Word or PDF
        document (maximum 4 MB).
      </p>
      {hasWord ? (
        <Link className="text-sm text-primary underline" href={`/booklists/${jobId}`}>
          Open next step
        </Link>
      ) : null}
      {feedback ? (
        <p role="status" className={`text-xs ${failed ? 'text-warn' : 'text-ok'}`}>
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
