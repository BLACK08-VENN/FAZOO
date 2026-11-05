import 'server-only';
import type { FazooClient } from '@fazoo/database';
import { lagosDate } from '@fazoo/config';
import { Card } from '@/components/ui/card';
import { loadCampaignTeam } from '@/lib/campaign-team';

export async function CampaignTeam({
  client, organizationId, campaignId,
}: {
  client: FazooClient;
  organizationId: string;
  campaignId?: string;
}) {
  let team;
  try {
    team = await loadCampaignTeam(client, organizationId, campaignId);
  } catch {
    return (
      <Card className="mb-6 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Assigned BAs</h2>
        <p role="status" className="mt-2 text-sm text-muted">
          Campaign team could not be loaded. Please refresh to try again.
        </p>
      </Card>
    );
  }
  if (team.invalidCampaign) {
    return (
      <Card className="mb-6 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Assigned BAs</h2>
        <p className="mt-2 text-sm text-muted">This campaign is unavailable in the current brand.</p>
      </Card>
    );
  }
  const today = lagosDate();
  return (
    <Card className="mb-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Assigned BAs ({team.members.length})</h2>
        <p className="text-xs text-muted">
          {team.campaigns.map((campaign) => campaign.name).join(' · ') || 'No active campaigns'}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted">
        Campaign assignments, including BAs who have not submitted logs.
      </p>
      {team.members.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No approved BAs have active assignments in this campaign selection.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {team.members.map((member) => (
            <div key={member.id} className="rounded-xl border border-ink/10 p-3">
              <h3 className="text-sm font-semibold text-ink">{member.name}</h3>
              <ul className="mt-2 space-y-2 text-xs text-muted">
                {member.assignments.map((assignment) => (
                  <li key={assignment.id}>
                    <p className="font-medium text-ink">{assignment.campaign.name}</p>
                    {assignment.store ? <p>{assignment.store.name}</p> : null}
                    <p>
                      {assignment.start_date} — {assignment.end_date ?? 'Ongoing'}
                      {assignment.end_date && assignment.end_date < today
                        ? ' · Assignment period ended'
                        : assignment.start_date > today ? ' · Upcoming' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
