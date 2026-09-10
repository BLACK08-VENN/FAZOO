import { type NextRequest, NextResponse } from 'next/server';
import { isElevated, requireStaff } from '@/lib/auth';
import { convertBooklistDocument } from '@/server/ocr/convert';
import { serviceSupabase } from '@fazoo/database';
import { RATE_LIMIT_EXPORT_MAX, RATE_LIMIT_EXPORT_WINDOW_S } from '@fazoo/config';

/**
 * Kick off the automated conversion of a school's raw booklist into an editable
 * Word draft. Elevated staff only; rate-limited because each call spends money
 * with the OCR vendor and can run for minutes on a long PDF.
 */
export async function POST(
  _request: NextRequest,
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

  try {
    const { data: allowed, error } = await serviceSupabase().rpc('check_rate_limit', {
      p_key: `booklist-convert:${profile.id}`,
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
    // The limiter is best-effort: a local stack without it must not block work.
  }

  const result = await convertBooklistDocument(jobId, profile.id);

  if (result.outcome === 'failed') {
    return NextResponse.json({ ...result, error: result.message }, { status: 502 });
  }
  return NextResponse.json(result);
}
