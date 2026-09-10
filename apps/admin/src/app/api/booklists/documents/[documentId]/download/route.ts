import { type NextRequest, NextResponse } from 'next/server';
import { requireApprovedProfile } from '@/lib/auth';
import { signedDocumentUrl } from '@/server/documents';

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/-{2,}/g, '-').slice(0, 120);
}

/**
 * Redirect to a short-lived signed URL for a pipeline document.
 *
 * Both staff and the BA who owns the job need this — the BA downloads the
 * formatted booklist to print and carry back to the school. The URL is signed
 * with the service-role key, which bypasses storage policies, so the
 * RLS-scoped select on `booklist_documents` below is the actual access gate:
 * it resolves to org staff or to a BA who owns the job, and nothing else.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { client, profile } = await requireApprovedProfile();
  const { documentId } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
    return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
  }

  const { data: doc, error } = await client
    .from('booklist_documents')
    .select(
      `id, kind, storage_path, storage_bucket, mime_type,
       booklist_jobs(organization_id, veda_schools(name))`,
    )
    .eq('id', documentId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const schoolName =
    (doc.booklist_jobs as { veda_schools?: { name?: string } } | null)?.veda_schools?.name ??
    'school';
  const extension = doc.storage_path.split('.').pop() ?? 'bin';
  const fileName = safeFileName(`${schoolName}-booklist-${doc.kind}.${extension}`);

  try {
    const url = await signedDocumentUrl(doc.storage_path, fileName, doc.storage_bucket);
    return NextResponse.redirect(url, { status: 302 });
  } catch (signError) {
    const message = signError instanceof Error ? signError.message : 'Could not create a download link';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
