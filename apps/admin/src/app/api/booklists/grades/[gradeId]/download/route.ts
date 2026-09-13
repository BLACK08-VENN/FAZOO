import { type NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { signedDocumentUrl } from '@/server/documents';

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
  const extension = storagePath.split('.').pop() || (kind === 'word' ? 'docx' : 'bin');
  const schoolName = row.booklist_jobs?.veda_schools?.name ?? 'school';
  const fileName = safeFileName(`${schoolName}-${row.grade_label}-${kind}.${extension}`);

  try {
    const url = await signedDocumentUrl(storagePath, fileName, bucket);
    return NextResponse.redirect(url, { status: 302 });
  } catch (signError) {
    const message = signError instanceof Error ? signError.message : 'Could not create a download link';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
