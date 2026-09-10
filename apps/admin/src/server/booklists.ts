import 'server-only';
import type { FazooClient } from '@fazoo/database';
import type {
  AdminBaPerformanceResult,
  AdminBooklistQueueResult,
  AdminPipelineBoardInput,
  AdminPipelineBoardResult,
  AdminSchoolDossierResult,
  BaAgency,
  BooklistStage,
  OcrStatus,
} from '@fazoo/types';

/**
 * Typed wrappers for the admin booklist RPCs.
 *
 * Every pipeline read goes through a SECURITY DEFINER function that scopes
 * itself to the caller's organization via `assert_org_staff()`, so these
 * helpers deliberately take no organization argument — passing one would
 * invite a caller to read another tenant's pipeline.
 *
 * The RPCs return `jsonb`, which Supabase types as `Json`. Each wrapper casts
 * once, here, to the matching interface in `@fazoo/types`, so the pages render
 * real fields instead of reaching into `Record<string, unknown>`.
 */

async function call<T>(
  client: FazooClient,
  fn: string,
  params?: object,
): Promise<T> {
  const { data, error } = await client.rpc(fn as never, (params ?? {}) as never);
  if (error) throw new Error(error.message);
  return data as unknown as T;
}

function unwrap<T extends { status: string }>(result: T, fn: string): T {
  if (result.status !== 'ok') {
    throw new Error(`${fn} returned an unexpected status (${result.status})`);
  }
  return result;
}

export interface PipelineFilters {
  query?: string | null;
  stage?: BooklistStage | null;
  region?: string | null;
  baId?: string | null;
  agency?: BaAgency | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}

/** The cross-school pipeline board: every logged school and where it is. */
export async function pipelineBoard(
  client: FazooClient,
  filters: PipelineFilters = {},
): Promise<AdminPipelineBoardResult> {
  const params: AdminPipelineBoardInput = {
    p_query: filters.query ?? null,
    p_stage: filters.stage ?? null,
    p_region: filters.region ?? null,
    p_ba_id: filters.baId ?? null,
    p_agency: filters.agency ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_limit: filters.limit ?? 100,
    p_offset: filters.offset ?? 0,
  };
  return unwrap(
    await call<AdminPipelineBoardResult>(client, 'admin_pipeline_board', params),
    'admin_pipeline_board',
  );
}

/** Jobs waiting on the admin: raw upload received, conversion not yet published. */
export async function conversionQueue(
  client: FazooClient,
  options: { ocrStatus?: OcrStatus | null; limit?: number } = {},
): Promise<AdminBooklistQueueResult> {
  return unwrap(
    await call<AdminBooklistQueueResult>(client, 'admin_booklist_queue', {
      p_ocr_status: options.ocrStatus ?? null,
      p_limit: options.limit ?? 100,
    }),
    'admin_booklist_queue',
  );
}

/** One school's master-list row, its booklist jobs and every visit to it. */
export async function schoolDossier(
  client: FazooClient,
  schoolId: string,
): Promise<AdminSchoolDossierResult> {
  return unwrap(
    await call<AdminSchoolDossierResult>(client, 'admin_school_dossier', {
      p_school_id: schoolId,
    }),
    'admin_school_dossier',
  );
}

/**
 * BA scoreboard: agency, whether a gate selfie is mandatory for them, whether
 * they are complying, and schools reached against their target.
 */
export async function baPerformance(
  client: FazooClient,
  options: { agency?: BaAgency | null; from?: string | null; to?: string | null } = {},
): Promise<AdminBaPerformanceResult> {
  return unwrap(
    await call<AdminBaPerformanceResult>(client, 'admin_ba_performance', {
      p_agency: options.agency ?? null,
      p_period_start: options.from ?? null,
      p_period_end: options.to ?? null,
    }),
    'admin_ba_performance',
  );
}
