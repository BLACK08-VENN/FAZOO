'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { OcrStatus } from '@fazoo/types';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { OcrBadge } from '@/components/stage-badge';

type Feedback = { tone: 'ok' | 'bad'; text: string } | null;

/**
 * The two document operations that cannot be plain server actions: both move
 * bytes, so they go through the API routes that own the multipart handling,
 * the OCR vendor call and the service-role storage writes.
 */
export function DocumentWorkspace({
  jobId,
  ocrStatus,
  hasRawDocument,
  formattedPublishedAt,
  canAct,
}: {
  jobId: string;
  ocrStatus: OcrStatus;
  hasRawDocument: boolean;
  formattedPublishedAt: string | null;
  canAct: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [converting, setConverting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [perGrade, setPerGrade] = useState<'unchanged' | 'true' | 'false'>('unchanged');

  async function runConversion() {
    setConverting(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/booklists/${jobId}/convert`, { method: 'POST' });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        outcome?: 'draft_created' | 'manual_required' | 'failed';
      };
      if (!response.ok) {
        throw new Error(body.error ?? body.message ?? 'Conversion failed.');
      }
      if (body.outcome === 'draft_created') {
        setFeedback({
          tone: 'ok',
          text: 'Auto-conversion produced an editable draft. Check it below, then format and publish the final Word document.',
        });
      } else {
        setFeedback({
          tone: 'bad',
          text: body.message
            ? `${body.message} Format the document by hand and publish it below.`
            : 'Auto-conversion could not produce a usable draft. Format the document by hand and publish it below.',
        });
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback({
        tone: 'bad',
        text: error instanceof Error ? error.message : 'Conversion failed.',
      });
    } finally {
      setConverting(false);
    }
  }

  async function publishFormatted(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setFeedback({ tone: 'bad', text: 'Choose the formatted Word document to publish.' });
      return;
    }

    setUploading(true);
    setFeedback(null);
    try {
      const payload = new FormData();
      payload.set('file', file);
      if (perGrade !== 'unchanged') payload.set('is_per_grade', perGrade);
      const note = form.get('note');
      if (typeof note === 'string' && note.trim()) payload.set('note', note.trim());

      const response = await fetch(`/api/booklists/${jobId}/formatted`, {
        method: 'POST',
        body: payload,
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Upload failed.');

      setFeedback({
        tone: 'ok',
        text: 'Formatted document published. The BA can now download, print and take it back to the school.',
      });
      event.currentTarget.reset();
      setPerGrade('unchanged');
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback({
        tone: 'bad',
        text: error instanceof Error ? error.message : 'Upload failed.',
      });
    } finally {
      setUploading(false);
    }
  }

  const busy = converting || uploading || pending;

  return (
    <div className="space-y-4">
      {feedback ? (
        <div
          role="status"
          className={
            feedback.tone === 'ok'
              ? 'rounded-xl border border-ok/25 bg-ok/10 px-4 py-3 text-sm font-medium text-ink'
              : 'rounded-xl border border-bad/25 bg-bad/10 px-4 py-3 text-sm font-medium text-bad'
          }
        >
          {feedback.text}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="1. Convert what the school gave you"
          description="Auto-OCR produces an editable draft. It is a starting point — you still format and publish the final Word document."
          actions={<OcrBadge status={ocrStatus} />}
        />
        <CardBody>
          {!hasRawDocument ? (
            <p className="text-sm text-muted">
              No document has been uploaded for this school yet. The BA uploads it from the app
              after the school offers the booklist.
            </p>
          ) : !canAct ? (
            <p className="text-sm text-muted">
              Your role can view this pipeline but not run conversions. Ask an administrator.
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="button" onClick={() => void runConversion()} disabled={busy}>
                {converting ? 'Converting…' : 'Run auto-conversion'}
              </Button>
              <p className="text-xs text-muted">
                {ocrStatus === 'manual_required' || ocrStatus === 'failed'
                  ? 'Auto-conversion could not produce a usable draft — upload your own formatted document below.'
                  : 'Long PDFs can take a few minutes. You can leave this page and come back.'}
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="2. Publish the formatted document"
          description="This is the file the BA downloads, prints and takes back to the school for approval. Publishing it moves the school to “Formatted — ready to print”."
          actions={
            formattedPublishedAt ? (
              <span className="text-xs font-medium text-ok">Published — you can replace it</span>
            ) : (
              <span className="text-xs font-medium text-warn">Not published yet</span>
            )
          }
        />
        <CardBody>
          {!canAct ? (
            <p className="text-sm text-muted">Only administrators can publish a formatted document.</p>
          ) : (
            <form onSubmit={publishFormatted} className="space-y-4">
              <div>
                <Label htmlFor="formatted-file">Word document (.docx or .doc) or PDF</Label>
                <Input
                  id="formatted-file"
                  name="file"
                  type="file"
                  accept=".docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  required
                />
                <p className="mt-1 text-xs text-muted">Maximum 4 MB.</p>
              </div>
              <div>
                <Label htmlFor="formatted-per-grade">Is this booklist issued per grade?</Label>
                <select
                  id="formatted-per-grade"
                  name="is_per_grade_select"
                  value={perGrade}
                  onChange={(event) => setPerGrade(event.target.value as typeof perGrade)}
                  className="h-10 w-full rounded-lg border border-ink/15 bg-white px-3 pr-8 text-sm text-ink focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary"
                >
                  <option value="unchanged">Leave as recorded</option>
                  <option value="true">Yes — one list per grade</option>
                  <option value="false">No — a single list</option>
                </select>
              </div>
              <div>
                <Label htmlFor="formatted-note">Note for the timeline</Label>
                <Input
                  id="formatted-note"
                  name="note"
                  placeholder="e.g. Reformatted the handwriting into a per-grade table"
                />
              </div>
              <Button type="submit" disabled={busy}>
                {uploading ? 'Publishing…' : formattedPublishedAt ? 'Replace document' : 'Publish document'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
