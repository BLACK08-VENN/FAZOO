import 'server-only';
import { serviceSupabase } from '@fazoo/database';
import { BOOKLIST_BUCKET, DOCX_MIME } from './ocr/convert';

/**
 * Document handling for the booklist pipeline.
 *
 * All admin-side document traffic goes through the service-role client so
 * artefacts can live at a stable, job-scoped path
 * (`{org}/documents/{jobId}/…`) instead of being scattered under whoever
 * happened to upload them. Because the service role bypasses storage
 * policies, every caller-facing route must select the `booklist_documents`
 * row through the user's own RLS-scoped client *before* asking for a signed
 * URL — that select, not the bucket policy, is what stops a BA reaching a
 * document on a job they do not own.
 */

/** Vercel's serverless body limit is 4.5 MB; leave headroom for multipart. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const SIGNED_URL_TTL_SECONDS = Number(process.env.ADMIN_SIGNED_URL_TTL_SECONDS ?? 300);

const ACCEPTED_FORMATTED_TYPES = new Set([
  DOCX_MIME,
  'application/msword',
  'application/pdf',
]);

export function isAcceptableFormattedUpload(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && ACCEPTED_FORMATTED_TYPES.has(mimeType.toLowerCase()));
}

export async function signedDocumentUrl(
  storagePath: string,
  downloadName?: string,
  bucket: string = BOOKLIST_BUCKET,
): Promise<string> {
  const db = serviceSupabase();
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, {
      download: downloadName ?? true,
    });
  if (error || !data?.signedUrl) {
    throw new Error(`Could not create a download link: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
}

export interface StoreDocumentInput {
  jobId: string;
  actorId: string;
  organizationId: string;
  file: File;
  slug: string;
}

/** Upload bytes to the job-scoped documents folder and return the storage path. */
export async function storeJobDocument({
  jobId,
  organizationId,
  file,
  slug,
}: StoreDocumentInput): Promise<{ storagePath: string; sizeBytes: number }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }

  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'docx';
  const storagePath = `${organizationId}/documents/${jobId}/${slug}-${Date.now()}.${extension}`;

  const db = serviceSupabase();
  const { error } = await db.storage
    .from(BOOKLIST_BUCKET)
    .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || DOCX_MIME,
      upsert: false,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { storagePath, sizeBytes: file.size };
}

/** Publish an admin-formatted Word document and advance the job to `formatted`. */
export async function publishFormattedDocument(params: {
  jobId: string;
  actorId: string;
  file: File;
  isPerGrade?: boolean | null;
  note?: string | null;
}): Promise<{ documentId: string; storagePath: string }> {
  const db = serviceSupabase();

  const { data: job, error: jobError } = await db
    .from('booklist_jobs')
    .select('id, organization_id')
    .eq('id', params.jobId)
    .single();

  if (jobError || !job) throw new Error(`Booklist job not found: ${jobError?.message ?? 'unknown'}`);

  const { storagePath, sizeBytes } = await storeJobDocument({
    jobId: params.jobId,
    actorId: params.actorId,
    organizationId: job.organization_id,
    file: params.file,
    slug: 'formatted',
  });

  const { data, error } = await db.rpc('admin_publish_formatted_document', {
    p_job_id: params.jobId,
    p_storage_path: storagePath,
    p_mime_type: params.file.type || DOCX_MIME,
    p_file_size_bytes: sizeBytes,
    p_is_per_grade: params.isPerGrade ?? undefined,
    p_note: params.note ?? undefined,
  });

  if (error) {
    // Do not leave an orphaned object if the RPC rejected the publish.
    await db.storage.from(BOOKLIST_BUCKET).remove([storagePath]);
    throw new Error(error.message);
  }

  return { documentId: String((data as { document_id?: string } | null)?.document_id ?? ''), storagePath };
}
