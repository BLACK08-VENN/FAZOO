import type { FazooClient } from '@fazoo/database';

export type TeamAssignment = {
  id: string;
  brand_ambassador_id: string;
  campaign_id: string;
  start_date: string;
  end_date: string | null;
  ambassador: { id: string; full_name: string };
  campaign: { id: string; name: string };
  store: { name: string; organization_id: string } | null;
};

export function groupCampaignTeam(rows: TeamAssignment[], organizationId: string) {
  const team = new Map<string, { id: string; name: string; assignments: TeamAssignment[] }>();
  for (const row of rows) {
    // A stale store reference must never display another brand's location.
    const assignment = {
      ...row,
      store: row.store?.organization_id === organizationId ? row.store : null,
    };
    const member: { id: string; name: string; assignments: TeamAssignment[] } = team.get(row.brand_ambassador_id) ?? {
      id: row.brand_ambassador_id,
      name: row.ambassador.full_name,
      assignments: [],
    };
    member.assignments.push(assignment);
    team.set(member.id, member);
  }
  return [...team.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Called only by staff server components with the authenticated profile's organization. */
export async function loadCampaignTeam(
  client: FazooClient,
  organizationId: string,
  campaignId?: string,
) {
  if (campaignId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId)) {
    return { invalidCampaign: true, campaigns: [], members: [] };
  }
  let campaignsQuery = client.from('campaigns').select('id, name')
    .eq('organization_id', organizationId).order('name');
  campaignsQuery = campaignId
    ? campaignsQuery.eq('id', campaignId)
    : campaignsQuery.eq('status', 'active');
  const { data: campaigns, error: campaignError } = await campaignsQuery;
  if (campaignError) throw campaignError;
  if (!campaigns?.length) {
    return { invalidCampaign: Boolean(campaignId), campaigns: [], members: [] };
  }

  const assignments: TeamAssignment[] = [];
  // Page rather than silently truncating larger campaign teams at the API row limit.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('brand_ambassador_assignments')
      .select('id, brand_ambassador_id, campaign_id, start_date, end_date, ambassador:profiles!brand_ambassador_assignments_brand_ambassador_id_fkey!inner(id, full_name), campaign:campaigns!inner(id, name), store:stores(name, organization_id)')
      .eq('organization_id', organizationId)
      .eq('campaign.organization_id', organizationId)
      .eq('ambassador.organization_id', organizationId)
      .eq('ambassador.role', 'brand_ambassador')
      .eq('ambassador.account_status', 'approved')
      .eq('status', 'active')
      .in('campaign_id', campaigns.map((campaign) => campaign.id))
      .order('id')
      .range(offset, offset + 499);
    if (error) throw error;
    assignments.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return {
    invalidCampaign: false,
    campaigns,
    members: groupCampaignTeam(assignments, organizationId),
  };
}
