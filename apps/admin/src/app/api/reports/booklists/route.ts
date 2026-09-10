import { type NextRequest } from 'next/server';
import type { BaAgency, BooklistStage } from '@fazoo/types';
import { booklistStageLabel, BOOKLIST_STAGE_LABELS } from '@fazoo/config';
import { requireStaff, isElevated } from '@/lib/auth';
import { nairobiTime } from '@/lib/format';
import { serviceSupabase } from '@fazoo/database';
import {
  CSV_EXPORT_MAX_ROWS,
  RATE_LIMIT_EXPORT_MAX,
  RATE_LIMIT_EXPORT_WINDOW_S,
} from '@fazoo/config';
import { pipelineBoard } from '@/server/booklists';

/**
 * CSV export of the booklist pipeline — one row per logged school, carrying
 * every milestone timestamp so the export is a complete audit of the journey
 * from the gate visit to the stamped +1 copy.
 *
 * Honours the same filters as the /booklists board, so what a supervisor sees
 * on screen is exactly what lands in the file.
 */

const COLUMNS = [
  'Job ID',
  'School ID',
  'School name',
  'Region',
  'Address',
  'Stage',
  'Stage label',
  'Per grade',
  'BA ID',
  'BA name',
  'Agency',
  'Copies requested',
  'Copies to print (incl. +1 stamped)',
  'Conversion status',
  'Document received (Africa/Nairobi)',
  'Formatted (Africa/Nairobi)',
  'Approved by school (Africa/Nairobi)',
  'Dispatched (Africa/Nairobi)',
  'Received (Africa/Nairobi)',
  'Completed (Africa/Nairobi)',
  'Latest print order',
  'Has raw document',
  'Has formatted document',
  'Has stamped copy',
  'Visits',
  'Last visit date',
  'Logged (Africa/Nairobi)',
  'Stage updated (Africa/Nairobi)',
] as const;

/** Hard ceiling per request, matching the other report exports. */
const EXPORT_LIMIT = Math.min(5000, CSV_EXPORT_MAX_ROWS);

function csvEscape(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  // A leading =, +, - or @ turns a cell into a formula in Excel. Prefix with a
  // tab so a school name like "=SUM(A1)" exports as literal text.
  if (/^[=+\-@\t\r]/.test(s)) return `"'\u0009${s.replaceAll('"', '""')}"`;
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function isStage(value: string | null): value is BooklistStage {
  return value !== null && value in BOOKLIST_STAGE_LABELS;
}

function isAgency(value: string | null): value is BaAgency {
  return value === 'ael' || value === 'veda';
}

export async function GET(request: NextRequest) {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) {
    return new Response('Forbidden', { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const stageParam = params.get('stage');
  const agencyParam = params.get('agency');
  const baParam = params.get('ba');

  try {
    const limiter = serviceSupabase();
    const { data: allowed } = await limiter.rpc('check_rate_limit', {
      p_key: `csv-export:booklists:${profile.id}`,
      p_max: RATE_LIMIT_EXPORT_MAX,
      p_window_seconds: RATE_LIMIT_EXPORT_WINDOW_S,
    });
    if (allowed === false) {
      return new Response('Too many exports — please wait a few minutes.', { status: 429 });
    }
  } catch {
    // Limiter unavailable (e.g. local dev without a service key): continue.
  }

  let board;
  try {
    board = await pipelineBoard(client, {
      query: params.get('q'),
      stage: isStage(stageParam) ? stageParam : null,
      region: params.get('region'),
      baId: baParam && /^[0-9a-f-]{36}$/i.test(baParam) ? baParam : null,
      agency: isAgency(agencyParam) ? agencyParam : null,
      from: params.get('from'),
      to: params.get('to'),
      limit: EXPORT_LIMIT,
      offset: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    return new Response(message, { status: 502 });
  }

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [
    encoder.encode(`\uFEFF${COLUMNS.map(csvEscape).join(',')}\r\n`),
  ];

  for (const job of board.jobs) {
    chunks.push(
      encoder.encode(
        [
          job.job_id,
          job.school_id,
          job.school_name,
          job.school_region,
          job.school_address,
          job.stage,
          booklistStageLabel(job.stage),
          job.is_per_grade ? 'yes' : 'no',
          job.owner_ba_id,
          job.owner_ba_name,
          job.owner_ba_agency === 'ael'
            ? 'Advert Eyes Limited (AEL)'
            : job.owner_ba_agency === 'veda'
              ? 'Veda'
              : 'Agency not set',
          job.copies_requested,
          job.copies_to_print,
          job.ocr_status,
          nairobiTime(job.document_received_at),
          nairobiTime(job.formatted_at),
          nairobiTime(job.approved_by_school_at),
          nairobiTime(job.dispatched_at),
          nairobiTime(job.received_at),
          nairobiTime(job.completed_at),
          job.latest_print_order,
          job.has_raw_document ? 'yes' : 'no',
          job.has_formatted_document ? 'yes' : 'no',
          job.has_stamped_copy ? 'yes' : 'no',
          job.visit_count,
          job.last_visit_date,
          nairobiTime(job.created_at),
          nairobiTime(job.stage_updated_at),
        ]
          .map(csvEscape)
          .join(',') + '\r\n',
      ),
    );
  }

  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17);
  const truncated = board.total > board.jobs.length;

  return new Response(Buffer.concat(chunks, totalBytes), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fazoo-booklist-pipeline-${stamp}.csv"`,
      'Cache-Control': 'no-store',
      // Surface the row cap so a truncated file is never mistaken for the whole pipeline.
      'X-Rows-Exported': String(board.jobs.length),
      'X-Rows-Matched': String(board.total),
      'X-Export-Truncated': truncated ? 'true' : 'false',
    },
  });
}
