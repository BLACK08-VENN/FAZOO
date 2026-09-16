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
 * CSV export of the booklist pipeline. Whole-school submissions produce one
 * row; multi-grade submissions produce one row per collected grade.
 *
 * Honours the same filters as the /booklists board, so what a supervisor sees
 * on screen is exactly what lands in the file.
 */

const COLUMNS = [
  'School name',
  'Region / location',
  'BA name',
  'Grade / class',
  'Booklist status',
  'Copies requested',
  'Due date',
  'Shipping status',
  'Completed (Africa/Nairobi)',
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

/**
 * Multi-grade jobs keep their operational details on individual grade rows.
 * Load those rows so the flat CSV can preserve each grade instead of merging
 * all requested copies into one school-level total.
 */
type GradeBooklistRow = {
  job_id: string;
  grade_label: string;
  copies_requested: number;
  due_date: string;
  printables_shipped: boolean;
  sort_order: number;
  created_at: string;
};

async function gradeBooklistsByJob(
  client: Awaited<ReturnType<typeof requireStaff>>['client'],
  jobIds: string[],
): Promise<Map<string, GradeBooklistRow[]>> {
  type GradeCopiesClient = {
    from(table: 'booklist_grade_requests'): {
      select(
        columns: 'job_id,grade_label,copies_requested,due_date,printables_shipped,sort_order,created_at',
      ): {
        in(
          column: 'job_id',
          values: string[],
        ): PromiseLike<{ data: GradeBooklistRow[] | null; error: { message: string } | null }>;
      };
    };
  };

  // The generated database types predate this live table. Keep the temporary
  // compatibility cast local to this report-only read.
  const gradeCopiesClient = client as unknown as GradeCopiesClient;
  const rowsByJob = new Map<string, GradeBooklistRow[]>();
  const batchSize = 100;

  for (let index = 0; index < jobIds.length; index += batchSize) {
    const batch = jobIds.slice(index, index + batchSize);
    const { data, error } = await gradeCopiesClient
      .from('booklist_grade_requests')
      .select(
        'job_id,grade_label,copies_requested,due_date,printables_shipped,sort_order,created_at',
      )
      .in('job_id', batch);

    if (error) throw new Error(`Could not load grade booklists: ${error.message}`);

    for (const row of data ?? []) {
      const jobRows = rowsByJob.get(row.job_id) ?? [];
      jobRows.push(row);
      rowsByJob.set(row.job_id, jobRows);
    }
  }

  for (const rows of rowsByJob.values()) {
    rows.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  }

  return rowsByJob;
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

  let gradeRowsByJob: Map<string, GradeBooklistRow[]>;
  try {
    gradeRowsByJob = await gradeBooklistsByJob(
      client,
      board.jobs.filter((job) => job.is_per_grade).map((job) => job.job_id),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load grade booklists';
    return new Response(message, { status: 502 });
  }

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [
    encoder.encode(`\uFEFF${COLUMNS.map(csvEscape).join(',')}\r\n`),
  ];

  let exportedRows = 0;
  for (const job of board.jobs) {
    const gradeRows = gradeRowsByJob.get(job.job_id);
    const reportRows = job.is_per_grade && gradeRows?.length
      ? gradeRows.map((grade) => ({
          grade: grade.grade_label,
          copiesRequested: grade.copies_requested,
          dueDate: grade.due_date,
          shippingStatus: grade.printables_shipped ? 'Shipped' : 'Pending',
        }))
      : [{
          grade: job.is_per_grade ? 'Per-grade list' : 'Whole school',
          copiesRequested: job.copies_requested,
          dueDate: job.due_date,
          shippingStatus: job.dispatched_at ? 'Shipped' : 'Pending',
        }];

    for (const reportRow of reportRows) {
      chunks.push(
        encoder.encode(
          [
          job.school_name,
          job.school_region,
          job.owner_ba_name,
          reportRow.grade,
          job.completed_at ? 'Completed' : booklistStageLabel(job.stage),
          reportRow.copiesRequested,
          reportRow.dueDate,
          reportRow.shippingStatus,
          nairobiTime(job.completed_at),
          ]
            .map(csvEscape)
            .join(',') + '\r\n',
        ),
      );
      exportedRows += 1;
    }
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
      'X-Rows-Exported': String(exportedRows),
      'X-Rows-Matched': String(board.total),
      'X-Export-Truncated': truncated ? 'true' : 'false',
    },
  });
}
