import 'server-only';
import { serviceSupabase } from '@fazoo/database';
import { buildBooklistDocx } from './docx';
import { resolveOcrProvider } from './provider';
import { isSupportedForOcr, OCR_MIN_CONFIDENCE } from './types';

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const BOOKLIST_BUCKET = 'booklist-documents';

export type ConvertResult =
  | {
      outcome: 'draft_created';
      confidence: number;
      pageCount: number;
      storagePath: string;
      /** True when confidence was too low for the draft to be trusted as-is. */
      needsReview: boolean;
      message: string;
    }
  | { outcome: 'manual_required'; message: string }
  | { outcome: 'failed'; message: string };

interface JobRow {
  id: string;
  organization_id: string;
  school_id: string;
  raw_document_id: string | null;
  is_per_grade: boolean;
  grade_notes: string | null;
  owner_ba_id: string | null;
  veda_schools: { name: string; region: string | null } | null;
  profiles: { full_name: string } | null;
  booklist_documents: {
    id: string;
    storage_path: string;
    storage_bucket: string;
    mime_type: string | null;
  } | null;
}

async function recordResult(
  jobId: string,
  actorId: string,
  payload: {
    status: 'succeeded' | 'failed' | 'manual_required';
    provider?: string | null;
    confidence?: number | null;
    error?: string | null;
    draftStoragePath?: string | null;
    draftSizeBytes?: number | null;
    pageCount?: number | null;
  },
): Promise<void> {
  const db = serviceSupabase();
  const { error } = await db.rpc('admin_record_ocr_result', {
    p_job_id: jobId,
    p_status: payload.status,
    p_provider: payload.provider ?? null,
    p_confidence: payload.confidence ?? null,
    p_error: payload.error ?? null,
    p_draft_storage_path: payload.draftStoragePath ?? null,
    p_draft_mime_type: payload.draftStoragePath ? DOCX_MIME : null,
    p_draft_size_bytes: payload.draftSizeBytes ?? null,
    p_page_count: payload.pageCount ?? null,
    p_actor_id: actorId,
  });
  if (error) throw new Error(`Failed to record the OCR result: ${error.message}`);
}

/**
 * Run the automated half of the conversion: raw upload → OCR → editable .docx
 * draft stored against the job.
 *
 * Always resolves rather than throwing for expected outcomes. "No provider
 * configured", "unsupported media type" and "confidence too low" are normal
 * states that route the job to the manual queue — they are not failures, and
 * the admin queue shows which is which.
 */
export async function convertBooklistDocument(
  jobId: string,
  actorId: string,
): Promise<ConvertResult> {
  const db = serviceSupabase();

  const { data: job, error: jobError } = await db
    .from('booklist_jobs')
    .select(
      `id, organization_id, school_id, raw_document_id, is_per_grade, grade_notes, owner_ba_id,
       veda_schools(name, region),
       profiles!booklist_jobs_owner_ba_id_fkey(full_name),
       booklist_documents!booklist_jobs_raw_document_id_fkey(id, storage_path, storage_bucket, mime_type)`,
    )
    .eq('id', jobId)
    .single<JobRow>();

  if (jobError || !job) {
    return { outcome: 'failed', message: `Booklist job not found: ${jobError?.message ?? 'unknown'}` };
  }

  const raw = job.booklist_documents;
  if (!raw) {
    return { outcome: 'manual_required', message: 'No raw booklist document has been uploaded yet.' };
  }

  if (!isSupportedForOcr(raw.mime_type)) {
    await recordResult(jobId, actorId, {
      status: 'manual_required',
      error: `Unsupported media type for OCR (${raw.mime_type ?? 'unknown'})`,
    });
    return {
      outcome: 'manual_required',
      message: `OCR cannot read ${raw.mime_type ?? 'this file'}. Convert it by hand and upload the Word document.`,
    };
  }

  const provider = resolveOcrProvider();
  if (!provider) {
    await recordResult(jobId, actorId, {
      status: 'manual_required',
      error: 'No OCR provider configured',
    });
    return {
      outcome: 'manual_required',
      message:
        'No OCR provider is configured, so this booklist stays in the manual queue. Set DOCUMENT_AI_PROVIDER and the Azure credentials to automate it.',
    };
  }

  const { data: blob, error: downloadError } = await db.storage
    .from(raw.storage_bucket || BOOKLIST_BUCKET)
    .download(raw.storage_path);

  if (downloadError || !blob) {
    return {
      outcome: 'failed',
      message: `Could not read the uploaded document: ${downloadError?.message ?? 'missing file'}`,
    };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) {
    return { outcome: 'failed', message: 'The uploaded document is empty.' };
  }

  await db
    .from('booklist_documents')
    .update({ ocr_status: 'processing', ocr_started_at: new Date().toISOString(), ocr_provider: provider.name })
    .eq('id', raw.id);

  let result;
  try {
    result = await provider.analyze({ bytes, mimeType: raw.mime_type ?? 'application/octet-stream' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordResult(jobId, actorId, { status: 'failed', provider: provider.name, error: message });
    return { outcome: 'failed', message: `OCR failed: ${message}` };
  }

  const needsReview = result.confidence < OCR_MIN_CONFIDENCE;

  const docx = await buildBooklistDocx(result, {
    schoolName: job.veda_schools?.name ?? 'School',
    schoolRegion: job.veda_schools?.region ?? null,
    isPerGrade: job.is_per_grade,
    gradeNotes: job.grade_notes,
    baName: job.profiles?.full_name ?? null,
    generatedAt: new Date(),
  });

  const storagePath = `${job.organization_id}/documents/${job.id}/ocr-draft-${Date.now()}.docx`;
  const { error: uploadError } = await db.storage
    .from(BOOKLIST_BUCKET)
    .upload(storagePath, Buffer.from(docx), { contentType: DOCX_MIME, upsert: false });

  if (uploadError) {
    await recordResult(jobId, actorId, {
      status: 'failed',
      provider: provider.name,
      confidence: result.confidence,
      error: `Draft upload failed: ${uploadError.message}`,
    });
    return { outcome: 'failed', message: `Could not store the generated draft: ${uploadError.message}` };
  }

  await recordResult(jobId, actorId, {
    status: needsReview ? 'manual_required' : 'succeeded',
    provider: provider.name,
    confidence: result.confidence,
    pageCount: result.pageCount,
    draftStoragePath: storagePath,
    draftSizeBytes: docx.byteLength,
    error: needsReview
      ? `OCR confidence ${result.confidence.toFixed(0)}% is below the ${OCR_MIN_CONFIDENCE}% threshold — review the draft carefully or convert by hand`
      : null,
  });

  return {
    outcome: 'draft_created',
    confidence: result.confidence,
    pageCount: result.pageCount,
    storagePath,
    needsReview,
    message: needsReview
      ? `Draft generated, but OCR confidence was only ${result.confidence.toFixed(0)}%. Review it closely before publishing.`
      : `Editable draft generated from ${result.pageCount} page(s) at ${result.confidence.toFixed(0)}% confidence. Review and publish.`,
  };
}
