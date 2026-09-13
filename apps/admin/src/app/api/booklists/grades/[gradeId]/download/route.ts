import { type NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { signedDocumentUrl } from '@/server/documents';

export const dynamic = 'force-dynamic';

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/-{2,}/g, '-').slice(0, 120);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gradeId: string }> },
) {
  const { client, profile } = await requireStaff();
  const { gradeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(gradeId)) {
    return NextResponse.json({ error: 'Invalid grade print order id' }, { status: 400 });
  }

  const kind = request.nextUrl.searchParams.get('kind') === 'word' ? 'word' : 'raw';
  const proxy = request.nextUrl.searchParams.get('proxy') === '1';
  const gradeTable = (client as any).from('booklist_grade_requests');
  const { data, error } = await gradeTable
    .select(
      'id, organization_id, grade_label, storage_bucket, storage_path, mime_type, word_storage_bucket, word_storage_path, word_mime_type, booklist_jobs(veda_schools(name))',
    )
    .eq('id', gradeId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Grade print order not found' }, { status: 404 });
  }

  const row = data as {
    grade_label: string;
    storage_bucket: string;
    storage_path: string;
    mime_type: string | null;
    word_storage_bucket: string;
    word_storage_path: string | null;
    word_mime_type: string | null;
    booklist_jobs: { veda_schools?: { name?: string } | null } | null;
  };

  const storagePath = kind === 'word' ? row.word_storage_path : row.storage_path;
  if (!storagePath) {
    return NextResponse.json(
      { error: kind === 'word' ? 'Word document not generated yet' : 'Original document not found' },
      { status: 404 },
    );
  }

  const bucket = kind === 'word' ? row.word_storage_bucket : row.storage_bucket;
  const mimeType = kind === 'word' ? row.word_mime_type : row.mime_type;
  const extension = storagePath.split('.').pop() || (kind === 'word' ? 'docx' : 'bin');
  const schoolName = row.booklist_jobs?.veda_schools?.name ?? 'school';
  const fileName = safeFileName(`${schoolName}-${row.grade_label}-${kind}.${extension}`);

  try {
    const url = await signedDocumentUrl(storagePath, fileName, bucket);

    if (!proxy) {
      return NextResponse.redirect(url, { status: 302 });
    }

    // Browser OCR must not follow the signed Supabase URL itself. Some browsers,
    // PWAs and privacy settings turn that cross-origin redirect into a generic
    // "Failed to fetch". Stream the file through this authenticated same-origin
    // route instead, while keeping the normal download link as a redirect.
    const upstream = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Could not read the stored document (${upstream.status}).` },
        { status: 502 },
      );
    }

    const headers = new Headers({
      'Content-Type': mimeType || upstream.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Fazoo-File-Extension': extension.toLowerCase(),
    });
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);

    return new Response(upstream.body, { status: 200, headers });
  } catch (signError) {
    const message = signError instanceof Error ? signError.message : 'Could not create a download link';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
