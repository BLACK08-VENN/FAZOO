import { type NextRequest, NextResponse } from 'next/server';
import { isElevated, requireStaff } from '@/lib/auth';
import { serviceSupabase } from '@fazoo/database';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gradeId: string }> },
) {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { gradeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(gradeId)) {
    return NextResponse.json({ error: 'Invalid grade order' }, { status: 400 });
  }

  const { data: rawGrade } = await client.from('booklist_grade_requests' as never)
    .select('id, organization_id').eq('id', gradeId).single();
  const grade = rawGrade as { id: string; organization_id: string } | null;
  if (!grade || (profile.role !== 'super_admin' && grade.organization_id !== profile.organization_id)) {
    return NextResponse.json({ error: 'Grade order not found' }, { status: 404 });
  }

  const service = serviceSupabase();
  const { data: allowed, error: limitError } = await service.rpc('check_rate_limit', {
    p_key: `manual-grade-word:${profile.id}`,
    p_max: 20,
    p_window_seconds: 600,
  });
  if (limitError || allowed === false) {
    return NextResponse.json({ error: 'Too many uploads. Please try again later.' }, { status: 429 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const requestId = form.get('client_request_id');
  if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.docx')
      || file.size < 1 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Choose a .docx file up to 20 MB' }, { status: 400 });
  }

  const path = `${grade.organization_id}/grade-requests/${grade.id}/manual-${requestId}.docx`;
  const storage = service.storage.from('booklist-documents');
  const { error: uploadError } = await storage.upload(path, await file.arrayBuffer(), {
    contentType: DOCX_MIME,
    upsert: false,
  });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
    return NextResponse.json({ error: 'Could not store the Word document' }, { status: 502 });
  }

  const { error } = await client.rpc('admin_publish_grade_word' as never, {
    p_grade_request_id: gradeId,
    p_storage_path: path,
    p_file_size_bytes: file.size,
    p_client_request_id: requestId,
  } as never);
  if (error) {
    if (!uploadError) await storage.remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ status: 'ok' });
}
