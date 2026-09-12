'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { OcrStatus } from '@fazoo/types';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { OcrBadge } from '@/components/stage-badge';

type Feedback = { tone: 'ok' | 'bad'; text: string } | null;

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
      if (!response.ok) throw new Error(body.error ?? body.message ?? 'Conversion failed.');

      if (body.outcome === 'draft_created') {
        setFeedback({
          tone: 'ok',
          text: 'Auto-conversion produced an editable draft. Check it, format it, then publish the final Word document below.',
        });
      } else {
        setFeedback({
          tone: 'bad',
          text: body.message
            ? `${body.message} Format the document manually and publish the final Word file below.`
            : 'Auto-conversion could not produce a usable draft. Format it manually and publish the final Word file below.',
        });
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback({ tone: 'bad', text: error instanceof Error ? error.message : 'Conversion failed.' });
    } finally {
      setConverting(false);
    }
  }

  async function publishFormatted(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setFeedback({ tone: 'bad', text: 'Choose the final Word document to publish.' });
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
        text: 'Final Word document published. The print request is now ready for admin production and shipping.',
      });
      event.currentTarget.reset();
      setPerGrade('unchanged');
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback({ tone: 'bad', text: error instanceof Error ? error.message : 'Upload failed.' });
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
          title="1. Convert the school booklist"
          description="The BA may upload handwriting, a photo, scan, PDF or other softcopy. Use auto-conversion as a draft, then prepare the final Word document."
          actions={<OcrBadge status={ocrStatus} />}
        />
        <CardBody>
          {!hasRawDocument ? (
            <p className="text-sm text-muted">The BA has not uploaded the original booklist yet.</p>
          ) : !canAct ? (
            <p className="text-sm text-muted">Your role can view this pipeline but not run conversions. Ask an administrator.</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="button" onClick={() => void runConversion()} disabled={busy}>
                {converting ? 'Converting…' : 'Run auto-conversion'}
              </Button>
              <p className="text-xs text-muted">
                {ocrStatus === 'manual_required' || ocrStatus === 'failed'
                  ? 'Auto-conversion could not make a usable draft. Prepare the Word document manually.'
                  : 'Review the converted content carefully before publishing the final Word document.'}
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="2. Publish the final Word document"
          description="FAZOO stores the final printable version as a Word file. Publishing it makes the job ready for the admin print order and delivery process."
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
            <p className="text-sm text-muted">Only administrators can publish the final Word document.</p>
          ) : (
            <form onSubmit={publishFormatted} className="space-y-4">
              <div>
                <Label htmlFor="formatted-file">Word document (.docx or .doc)</Label>
                <Input
                  id="formatted-file"
                  name="file"
                  type="file"
                  accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
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
                <Input id="formatted-note" name="note" placeholder="e.g. Reformatted the handwriting into a per-grade table" />
              </div>
              <Button type="submit" disabled={busy}>
                {uploading ? 'Publishing…' : formattedPublishedAt ? 'Replace Word document' : 'Publish Word document'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
