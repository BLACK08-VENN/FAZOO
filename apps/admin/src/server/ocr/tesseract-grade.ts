import 'server-only';
import { serviceSupabase } from '@fazoo/database';
import { buildBooklistDocx } from './docx';
import { BOOKLIST_BUCKET, DOCX_MIME } from './convert';
import { OCR_MIN_CONFIDENCE, type OcrResult } from './types';
import type { GradeConvertResult } from './convert-grade';

type GradeRow = {
  id: string;
  organization_id: string;
  job_id: string;
  grade_label: string;
};

type JobRow = {
  id: string;
  organization_id: string;
  veda_schools: { name: string; region: string | null } | null;
  profiles: { full_name: string } | null;
};

export type BrowserOcrPayload = {
  text: string;
  confidence?: number | null;
  pageCount?: number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function tesseractResult(payload: BrowserOcrPayload): OcrResult {
  const text = payload.text.replace(/\r\n/g, '\n').trim();
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    provider: 'tesseract-browser',
    model: 'tesseract-eng',
    confidence: Number.isFinite(payload.confidence)
      ? clamp(Number(payload.confidence), 0, 100)
      : 0,
    pageCount: Number.isFinite(payload.pageCount)
      ? clamp(Math.round(Number(payload.pageCount)), 1, 100)
      : 1,
    blocks: lines.map((line) => ({ kind: 'paragraph' as const, text: line })),
    text,
  };
}

export async function createGradeBooklistFromTesseract(
  gradeRequestId: string,
  actorId: string,
  payload: BrowserOcrPayload,
): Promise<GradeConvertResult> {
  const text = payload.text?.trim() ?? '';
  if (!text) {
    return { outcome: 'failed', message: 'Tesseract could not find readable text in this document.' };
  }
  if (text.length > 500_000) {
    return { outcome: 'failed', message: 'The extracted text is too large to convert safely.' };
  }

  const db: any = serviceSupabase();
  const { data: gradeData, error: gradeError } = await db
    .from('booklist_grade_requests')
    .select('id, organization_id, job_id, grade_label')
    .eq('id', gradeRequestId)
    .single();

  if (gradeError || !gradeData) {
    return {
      outcome: 'failed',
      message: `Grade print order not found: ${gradeError?.message ?? 'unknown'}`,
    };
  }
  const grade = gradeData as GradeRow;

  const { data: jobData, error: jobError } = await db
    .from('booklist_jobs')
    .select(
      `id, organization_id,
       veda_schools(name, region),
       profiles!booklist_jobs_owner_ba_id_fkey(full_name)`,
    )
    .eq('id', grade.job_id)
    .single();

  if (jobError || !jobData) {
    return {
      outcome: 'failed',
      message: `Parent school job not found: ${jobError?.message ?? 'unknown'}`,
    };
  }
  const job = jobData as JobRow;
  if (job.organization_id !== grade.organization_id) {
    return { outcome: 'failed', message: 'The grade order does not belong to the parent school job.' };
  }

  const result = tesseractResult(payload);
  const docx = await buildBooklistDocx(result, {
    schoolName: job.veda_schools?.name ?? 'School',
    schoolRegion: job.veda_schools?.region ?? null,
    isPerGrade: true,
    gradeNotes: grade.grade_label,
    gradeLabel: grade.grade_label,
    baName: job.profiles?.full_name ?? null,
    generatedAt: new Date(),
  });

  const storagePath = `${grade.organization_id}/grade-requests/${grade.id}/word-${Date.now()}.docx`;
  const { error: uploadError } = await db.storage
    .from(BOOKLIST_BUCKET)
    .upload(storagePath, Buffer.from(docx), { contentType: DOCX_MIME, upsert: false });

  if (uploadError) {
    return { outcome: 'failed', message: `Could not store the Word document: ${uploadError.message}` };
  }

  const needsReview = result.confidence < OCR_MIN_CONFIDENCE;
  const now = new Date().toISOString();
  const { error: updateError } = await db
    .from('booklist_grade_requests')
    .update({
      conversion_status: 'succeeded',
      conversion_provider: result.provider,
      conversion_confidence: result.confidence,
      conversion_error: needsReview
        ? `Tesseract confidence ${result.confidence.toFixed(0)}%. Review the Word document before printing.`
        : null,
      conversion_finished_at: now,
      word_storage_bucket: BOOKLIST_BUCKET,
      word_storage_path: storagePath,
      word_mime_type: DOCX_MIME,
      word_size_bytes: docx.byteLength,
      word_page_count: result.pageCount,
      word_published_at: now,
      word_published_by: actorId,
      updated_at: now,
    })
    .eq('id', grade.id);

  if (updateError) {
    await db.storage.from(BOOKLIST_BUCKET).remove([storagePath]);
    return { outcome: 'failed', message: `Could not save the conversion result: ${updateError.message}` };
  }

  return {
    outcome: 'draft_created',
    storagePath,
    mimeType: DOCX_MIME,
    confidence: result.confidence,
    pageCount: result.pageCount,
    needsReview,
    message: needsReview
      ? `${grade.grade_label} was converted to Word with free Tesseract OCR. Confidence is ${result.confidence.toFixed(0)}%, so review it before printing.`
      : `${grade.grade_label} was converted to Word with free Tesseract OCR and is ready for review and printing.`,
  };
}
