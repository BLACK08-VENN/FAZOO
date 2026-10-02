import { type NextRequest, NextResponse } from 'next/server';
import { isElevated, requireStaff } from '@/lib/auth';
import { serviceSupabase } from '@fazoo/database';

import { inspectPreparedDocument, MAX_PREPARED_DOCUMENT_BYTES } from '@/lib/document-upload';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gradeId: string }> },
) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { gradeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(gradeId)) {
    return NextResponse.json({ error: 'Invalid grade order' }, { status: 400 });
  }

  const { data: rawGrade } = await client
    .from('booklist_grade_requests' as never)
    .select('id, organization_id')
    .eq('id', gradeId)
    .single();
  const grade = rawGrade as { id: string; organization_id: string } | null;
  if (
    !grade ||
    (profile.role !== 'super_admin' && grade.organization_id !== profile.organization_id)
  ) {
    return NextResponse.json({ error: 'Grade order not found' }, { status: 404 });
  }

  const service = serviceSupabase();
  const { data: allowed, error: limitError } = await service.rpc('check_rate_limit', {
    p_key: `manual-grade-word:${profile.id}`,
    p_max: 20,
    p_window_seconds: 600,
  });
  if (limitError || allowed === false) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart upload' }, { status: 400 });
  }
  const file = form.get('file');
  const requestId = form.get('client_request_id');
  if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }
  if (!(file instanceof File) || !file.size || file.size > MAX_PREPARED_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: 'Choose a Word or PDF file up to 4 MB' },
      { status: 400 },
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let documentType;
  try {
    documentType = inspectPreparedDocument(file.name, file.type, bytes);
  } catch {
    return NextResponse.json({ error: 'Invalid Word or PDF document' }, { status: 415 });
  }

  const path = `${grade.organization_id}/grade-requests/${grade.id}/manual-${requestId}.${documentType.extension}`;
  const storage = service.storage.from('booklist-documents');
  const { error: uploadError } = await storage.upload(path, bytes, {
    contentType: documentType.mimeType,
    upsert: false,
  });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
    return NextResponse.json(
      { error: 'Could not store the corrected document' },
      { status: 502 },
    );
  }

  const { error } = await client.rpc(
    'admin_publish_grade_word' as never,
    {
      p_grade_request_id: gradeId,
      p_storage_path: path,
      p_file_size_bytes: file.size,
      p_client_request_id: requestId,
    } as never,
  );
  if (error) {
    if (!uploadError) await storage.remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await service
    .from('booklist_grade_requests' as never)
    .update({ word_mime_type: documentType.mimeType } as never)
    .eq('id', gradeId);
  return NextResponse.json({ status: 'ok' });
}
