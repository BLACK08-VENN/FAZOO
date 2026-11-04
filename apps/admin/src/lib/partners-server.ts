import 'server-only';
import { notFound } from 'next/navigation';
import { requireApprovedProfile } from '@/lib/auth';
import { lagosDate } from '@fazoo/config';
import type { PartnerWorkspace } from './partners';

export async function requirePartnerAccess() {
  const context = await requireApprovedProfile();
  // Resolve tenant access through the guarded RPC. Historical organization
  // SELECT policies may still carry the authenticator requirement that is paused.
  const { error } = await context.client.rpc('partner_context');
  if (error?.code === '42501') notFound();
  if (error) throw error;
  return context;
}
export function partnerFilters(params: URLSearchParams) {
  const rawMonth = params.get('month') || lagosDate().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth)
    ? `${rawMonth}-01`
    : `${lagosDate().slice(0, 7)}-01`;
  const collector = params.get('collector') || null;
  return {
    p_month: month,
    p_state: (params.get('state') || '').slice(0, 100),
    p_collector:
      collector &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(collector)
        ? collector
        : null,
    p_search: (params.get('search') || '').slice(0, 200),
    p_page: Math.max(1, Math.min(100000, Number.parseInt(params.get('page') || '1', 10) || 1)),
  };
}
export async function loadPartnerWorkspace(params: URLSearchParams) {
  const context = await requirePartnerAccess();
  const filters = partnerFilters(params);
  const { data, error } = await context.client.rpc('partner_workspace', filters);
  if (error) throw new Error(`Partner reporting could not load: ${error.message}`);
  return { ...context, filters, workspace: data as unknown as PartnerWorkspace };
}
