import { type NextRequest, NextResponse } from 'next/server';
import { isElevated, requireStaff } from '@/lib/auth';
import { isAcceptableFormattedUpload, publishFormattedDocument } from '@/server/documents';

/**
 * Publish the admin's finished Word document. This is the printable source the
 * admin uses to create the print order before dispatching copies to the school.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { profile } = await requireStaff();
  if (!isElevated(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form upload' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose the final Word document to upload' }, { status: 400 });
  }
  if (!isAcceptableFormattedUpload(file.type)) {
    return NextResponse.json(
      { error: 'Upload a Word document (.docx or .doc)' },
      { status: 415 },
    );
  }

  const perGradeRaw = form.get('is_per_grade');
  const note = form.get('note');

  try {
    const result = await publishFormattedDocument({
      jobId,
      actorId: profile.id,
      file,
      isPerGrade:
        perGradeRaw === null || perGradeRaw === '' ? null : perGradeRaw === 'true',
      note: typeof note === 'string' ? note : null,
    });
    return NextResponse.json({ outcome: 'published', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
