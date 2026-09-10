import { useCallback, useEffect, useRef, useState } from 'react';
import type { Database } from '@fazoo/database';
import type {
  BaCreateSchoolResult,
  BaSchoolJobDetailResult,
  BaSchoolMatch,
  BaSchoolPipelineResult,
  BaSearchSchoolsResult,
  BaVisitStatsResult,
  BooklistStage,
} from '@fazoo/types';
import { supabase } from './supabase';
import {
  readCachedPipeline,
  readCachedProfile,
  readCachedVisitStats,
  writeCachedPipeline,
  writeCachedVisitStats,
} from './cache';
import type { SessionProfile } from './session';

/** The BA's own id + tenant, from the network when available and the cache when
 *  not — every storage path and RPC payload is built from it. */
export async function resolveProfile(): Promise<SessionProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, organization_id, full_name, phone, profile_photo_path, role, account_status, agency')
    .single();
  if (data) return data as SessionProfile;
  return readCachedProfile();
}

/** A Postgres function the generated schema knows about. */
type RpcName = keyof Database['public']['Functions'];

async function call<T>(rpc: RpcName, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(rpc, params as never);
  if (error) throw error;
  return data as T;
}

/** Search the master school list. */
export async function searchSchools(
  query: string | null,
  region: string | null,
  limit = 25,
): Promise<{ regions: string[]; schools: BaSchoolMatch[] }> {
  try {
    const result = await call<BaSearchSchoolsResult>('ba_search_schools', {
      p_query: query,
      p_region: region,
      p_limit: limit,
    });
    return { regions: result.regions ?? [], schools: result.schools ?? [] };
  } catch {
    throw new Error('Could not reach the school list. Check your connection and try again.');
  }
}

/** BA self-serve school creation for a school that is not on the master list. */
export async function createSchool(input: {
  name: string;
  region?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  schoolType?: string | null;
  contactPersonName?: string | null;
  contactPersonPhone?: string | null;
  clientRequestId: string;
}): Promise<BaCreateSchoolResult> {
  return call<BaCreateSchoolResult>('ba_create_school', {
    p_name: input.name,
    p_region: input.region ?? null,
    p_address: input.address ?? null,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_school_type: input.schoolType ?? null,
    p_contact_person_name: input.contactPersonName ?? null,
    p_contact_person_phone: input.contactPersonPhone ?? null,
    p_client_request_id: input.clientRequestId,
  });
}

/** Cached-first hook so the dashboard paints instantly on a cold start. */
function useCached<T>(
  read: () => Promise<T | null>,
  load: () => Promise<T>,
  write: (value: T) => Promise<void>,
  offlineMessage: string,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
      try {
        const next = await load();
        setData(next);
        setError(null);
        void write(next);
      } catch (err) {
        const cached = await read();
        if (cached) {
          setData(cached);
          setError(offlineMessage);
        } else {
          setError(err instanceof Error ? err.message : 'Could not load your schools.');
        }
      } finally {
        setLoading(false);
      }
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = request;
    return request;
  }, [load, read, write, offlineMessage]);

  useEffect(() => {
    let cancelled = false;
    void read().then((cached) => {
      if (cached && !cancelled) {
        setData(cached);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [read]);

  return { data, loading, error, refresh };
}

/** Scoreboard for the BA: agency rules, schools reached, selfie compliance. */
export function useVisitStats() {
  const load = useCallback(
    () => call<BaVisitStatsResult>('ba_visit_stats'),
    [],
  );
  const read = useCallback(() => readCachedVisitStats(), []);
  const write = useCallback((value: BaVisitStatsResult) => writeCachedVisitStats(value), []);
  return useCached<BaVisitStatsResult>(
    read,
    load,
    write,
    'Offline — showing your most recently synced numbers.',
  );
}

/** The BA's own pipeline: one row per school they have engaged. */
export function useSchoolPipeline() {
  const load = useCallback(
    () => call<BaSchoolPipelineResult>('ba_school_pipeline', { p_limit: 100 }),
    [],
  );
  const read = useCallback(() => readCachedPipeline(), []);
  const write = useCallback((value: BaSchoolPipelineResult) => writeCachedPipeline(value), []);
  return useCached<BaSchoolPipelineResult>(
    read,
    load,
    write,
    'Offline — showing the most recently synced pipeline.',
  );
}

/** Full journey for one school: visits, documents, print orders, timeline. */
export function useSchoolJobDetail(jobId: string | null) {
  const [data, setData] = useState<BaSchoolJobDetailResult | null>(null);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!jobId) return;
    setLoading(true);
    try {
      setData(await call<BaSchoolJobDetailResult>('ba_school_job_detail', { p_job_id: jobId }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this school.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

/**
 * Plain-language next step for a stage, so the BA is told what to do rather
 * than having to learn the stage vocabulary. `formatted` needs the extra flag
 * because a job can reach that stage before the file is actually published.
 */
export function nextActionFor(stage: BooklistStage, formattedReady: boolean): string {
  switch (stage) {
    case 'engaged':
      return 'Record what the person in charge said — declined or booklist offered.';
    case 'declined':
      return 'Declined. You can revisit this school later to re-open it.';
    case 'booklist_offered':
      return 'Upload the booklist the school gave you.';
    case 'document_received':
    case 'awaiting_conversion':
    case 'converting':
      return 'With our admin — being converted to an editable Word document.';
    case 'formatted':
      return formattedReady
        ? 'Download the formatted document, print it, and take it back for approval.'
        : 'Formatted document is ready to collect.';
    case 'pending_school_approval':
      return 'With the school for approval. Confirm the copy count once they sign off.';
    case 'school_approved':
      return 'Approved — record how many copies the school needs.';
    case 'in_production':
      return 'Being printed. Track dispatch and receipt from this card.';
    case 'dispatched':
      return 'On its way. Record receipt when the copies arrive.';
    case 'received':
      return 'Copies received. Upload the stamped +1 copy to close the log.';
    case 'completed':
      return 'Complete — the stamped copy is on file.';
    case 'on_hold':
      return 'On hold — check with your supervisor.';
    case 'cancelled':
      return 'Cancelled. Speak to your supervisor if this is wrong.';
    default:
      return 'Open this school to see the full history.';
  }
}
