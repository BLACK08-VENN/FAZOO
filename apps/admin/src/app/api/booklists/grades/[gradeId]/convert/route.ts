import { type NextRequest, NextResponse } from 'next/server';
import { isElevated, requireStaff } from '@/lib/auth';
import { serviceSupabase } from '@fazoo/database';
import { RATE_LIMIT_EXPORT_MAX, RATE_LIMIT_EXPORT_WINDOW_S } from '@fazoo/config';
import { convertGradeBooklistDocument } from '@/server/ocr/convert-grade';
import {
  createGradeBooklistFromTesseract,
  type BrowserOcrPayload,
} from '@/server/ocr/tesseract-grade';

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gradeId: string }> },
) {
  const { profile } = await requireStaff();
  if (!isElevated(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { gradeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(gradeId)) {
    return NextResponse.json({ error: 'Invalid grade print order id' }, { status: 400 });
  }

  try {
    const { data: allowed, error } = await serviceSupabase().rpc('check_rate_limit', {
      p_key: `grade-booklist-convert:${profile.id}`,
      p_max: RATE_LIMIT_EXPORT_MAX,
      p_window_seconds: RATE_LIMIT_EXPORT_WINDOW_S,
    });
    if (!error && allowed === false) {
      return NextResponse.json(
        { error: 'Too many conversion requests. Please wait a few minutes and try again.' },
        { status: 429 },
      );
    }
  } catch {
    // Best effort. A missing limiter must not block conversion.
  }

  let browserOcr: BrowserOcrPayload | null = null;
  if (request.headers.get('content-type')?.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as
      | { clientOcr?: BrowserOcrPayload }
      | null;
    if (body?.clientOcr) {
      browserOcr = body.clientOcr;
    }
  }

  const result = browserOcr
    ? await createGradeBooklistFromTesseract(gradeId, profile.id, browserOcr)
    : await convertGradeBooklistDocument(gradeId, profile.id);

  if (result.outcome === 'failed') {
    return NextResponse.json({ ...result, error: result.message }, { status: 502 });
  }
  return NextResponse.json(result);
}
