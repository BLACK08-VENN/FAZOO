import 'server-only';
import { serviceSupabase } from '@fazoo/database';
import { buildBooklistDocx } from './docx';
import { resolveOcrProvider } from './provider';
import { isSupportedForOcr, OCR_MIN_CONFIDENCE, type OcrResult } from './types';
import { BOOKLIST_BUCKET, DOCX_MIME } from './convert';

const DOC_MIME = 'application/msword';
const TEXT_MIME = 'text/plain';
const RTF_TYPES = new Set(['application/rtf', 'text/rtf']);
const WORD_TYPES = new Set([DOCX_MIME, DOC_MIME]);

export type GradeConvertResult =
  | {
      outcome: 'draft_created';
      message: string;
      storagePath: string;
      mimeType: string;
      confidence: number | null;
      pageCount: number | null;
      needsReview: boolean;
    }
  | { outcome: 'manual_required'; message: string }
  | { outcome: 'failed'; message: string };

type GradeRow = {
  id: string;
  organization_id: string;
  job_id: string;
  grade_label: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  source_format: string | null;
};

type JobRow = {
  id: string;
  organization_id: string;
  school_id: string;
  owner_ba_id: string | null;
  veda_schools: { name: string; region: string | null } | null;
  profiles: { full_name: string } | null;
};

function extension(path: string): string {
  return path.includes('.') ? path.split('.').pop()!.toLowerCase() : '';
}

function normalizedMime(mimeType: string | null, path: string): string {
  const mime = (mimeType ?? '').toLowerCase().trim();
  if (mime && mime !== 'application/octet-stream') return mime;
  switch (extension(path)) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'tif':
    case 'tiff': return 'image/tiff';
    case 'heic':
    case 'heif': return 'image/heic';
    case 'docx': return DOCX_MIME;
    case 'doc': return DOC_MIME;
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls': return 'application/vnd.ms-excel';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'html':
    case 'htm': return 'text/html';
    case 'rtf': return 'application/rtf';
    case 'txt': return TEXT_MIME;
    default: return mime || 'application/octet-stream';
  }
}

function plainTextResult(text: string, provider: string): OcrResult {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    provider,
    model: provider,
    confidence: 100,
    pageCount: 1,
    blocks: lines.map((text) => ({ kind: 'paragraph' as const, text })),
    text: lines.join('\n'),
  };
}

function decodeRtf(bytes: Uint8Array): string {
  let value = new TextDecoder('latin1').decode(bytes);
  value = value.replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
  value = value
    .replace(/\\par[d]?\b ?/g, '\n')
    .replace(/\\tab\b ?/g, '\t')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/\\[{}\\]/g, (token) => token.slice(1))
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n');
  return value.trim();
}

async function updateGrade(
  gradeId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await serviceSupabase()
    .from('booklist_grade_requests')
    .update({ ...values, updated_at: new Date().toISOString() } as never)
    .eq('id', gradeId);
  if (error) throw new Error(error.message);
}

async function storeWord(
  grade: GradeRow,
  bytes: Uint8Array,
  mimeType: string,
  ext: 'docx' | 'doc',
  actorId: string,
  provider: string,
  confidence: number | null,
  pageCount: number | null,
): Promise<{ storagePath: string; mimeType: string }> {
  const db = serviceSupabase();
  const storagePath = `${grade.organization_id}/grade-requests/${grade.id}/word-${Date.now()}.${ext}`;
  const { error: uploadError } = await db.storage
    .from(BOOKLIST_BUCKET)
    .upload(storagePath, Buffer.from(bytes), { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(`Could not store the Word document: ${uploadError.message}`);

  const { error: updateError } = await db
    .from('booklist_grade_requests')
    .update({
      conversion_status: 'succeeded',
      conversion_provider: provider,
      conversion_confidence: confidence,
      conversion_error: null,
      conversion_finished_at: new Date().toISOString(),
      word_storage_bucket: BOOKLIST_BUCKET,
      word_storage_path: storagePath,
      word_mime_type: mimeType,
      word_size_bytes: bytes.byteLength,
      word_page_count: pageCount,
      word_published_at: new Date().toISOString(),
      word_published_by: actorId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', grade.id);

  if (updateError) {
    await db.storage.from(BOOKLIST_BUCKET).remove([storagePath]);
    throw new Error(`Could not save the conversion result: ${updateError.message}`);
  }
  return { storagePath, mimeType };
}

export async function convertGradeBooklistDocument(
  gradeRequestId: string,
  actorId: string,
): Promise<GradeConvertResult> {
  const db = serviceSupabase();
  const { data: gradeData, error: gradeError } = await db
    .from('booklist_grade_requests')
    .select('id, organization_id, job_id, grade_label, storage_bucket, storage_path, mime_type, source_format')
    .eq('id', gradeRequestId)
    .single();

  if (gradeError || !gradeData) {
    return { outcome: 'failed', message: `Grade print order not found: ${gradeError?.message ?? 'unknown'}` };
  }
  const grade = gradeData as unknown as GradeRow;

  const { data: jobData, error: jobError } = await db
    .from('booklist_jobs')
    .select(
      `id, organization_id, school_id, owner_ba_id,
       veda_schools(name, region),
       profiles!booklist_jobs_owner_ba_id_fkey(full_name)`,
    )
    .eq('id', grade.job_id)
    .single();
  if (jobError || !jobData) {
    return { outcome: 'failed', message: `Parent school job not found: ${jobError?.message ?? 'unknown'}` };
  }
  const job = jobData as unknown as JobRow;
  if (job.organization_id !== grade.organization_id) {
    return { outcome: 'failed', message: 'The grade order does not belong to the parent school job.' };
  }

  const { data: blob, error: downloadError } = await db.storage
    .from(grade.storage_bucket || BOOKLIST_BUCKET)
    .download(grade.storage_path);
  if (downloadError || !blob) {
    return {
      outcome: 'failed',
      message: `Could not read the uploaded ${grade.grade_label} document: ${downloadError?.message ?? 'missing file'}`,
    };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) return { outcome: 'failed', message: 'The uploaded document is empty.' };

  const mimeType = normalizedMime(grade.mime_type, grade.storage_path);
  await updateGrade(grade.id, {
    conversion_status: 'processing',
    conversion_started_at: new Date().toISOString(),
    conversion_finished_at: null,
    conversion_error: null,
  });

  try {
    if (WORD_TYPES.has(mimeType)) {
      const ext = mimeType === DOC_MIME ? 'doc' : 'docx';
      const stored = await storeWord(
        grade,
        bytes,
        mimeType,
        ext,
        actorId,
        'native-word',
        null,
        null,
      );
      return {
        outcome: 'draft_created',
        storagePath: stored.storagePath,
        mimeType: stored.mimeType,
        confidence: null,
        pageCount: null,
        needsReview: false,
        message: `${grade.grade_label} was already a Word document and is ready for printing.`,
      };
    }

    let result: OcrResult | null = null;
    if (mimeType === TEXT_MIME) {
      result = plainTextResult(new TextDecoder('utf-8').decode(bytes), 'native-text');
    } else if (RTF_TYPES.has(mimeType)) {
      result = plainTextResult(decodeRtf(bytes), 'native-rtf');
    } else if (isSupportedForOcr(mimeType)) {
      const provider = resolveOcrProvider();
      if (!provider) {
        await updateGrade(grade.id, {
          conversion_status: 'manual_required',
          conversion_error: 'Azure Document Intelligence is not configured for automated image/PDF/Office conversion.',
          conversion_finished_at: new Date().toISOString(),
        });
        return {
          outcome: 'manual_required',
          message: 'Automated conversion is not configured for this file type. Configure Azure Document Intelligence or upload a Word/TXT/RTF source.',
        };
      }
      result = await provider.analyze({ bytes, mimeType });
    } else {
      await updateGrade(grade.id, {
        conversion_status: 'manual_required',
        conversion_error: `Unsupported conversion type: ${mimeType}`,
        conversion_finished_at: new Date().toISOString(),
      });
      return {
        outcome: 'manual_required',
        message: `This file type (${mimeType}) cannot be auto-converted safely yet.`,
      };
    }

    if (!result || result.blocks.length === 0) {
      throw new Error('The converter could not find readable content in this document.');
    }

    const docx = await buildBooklistDocx(result, {
      schoolName: job.veda_schools?.name ?? 'School',
      schoolRegion: job.veda_schools?.region ?? null,
      isPerGrade: true,
      gradeNotes: grade.grade_label,
      gradeLabel: grade.grade_label,
      baName: job.profiles?.full_name ?? null,
      generatedAt: new Date(),
    });
    const needsReview = result.provider.startsWith('azure') && result.confidence < OCR_MIN_CONFIDENCE;
    const stored = await storeWord(
      grade,
      docx,
      DOCX_MIME,
      'docx',
      actorId,
      result.provider,
      result.confidence,
      result.pageCount,
    );

    return {
      outcome: 'draft_created',
      storagePath: stored.storagePath,
      mimeType: stored.mimeType,
      confidence: result.confidence,
      pageCount: result.pageCount,
      needsReview,
      message: needsReview
        ? `${grade.grade_label} was converted to Word. OCR confidence is ${result.confidence.toFixed(0)}%, so review the Word document before printing.`
        : `${grade.grade_label} was converted to Word and is ready for review and printing.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateGrade(grade.id, {
      conversion_status: 'failed',
      conversion_error: message,
      conversion_finished_at: new Date().toISOString(),
    }).catch(() => undefined);
    return { outcome: 'failed', message: `Conversion failed: ${message}` };
  }
}
