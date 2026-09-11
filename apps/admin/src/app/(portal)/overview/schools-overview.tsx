import Link from 'next/link';
import { ADMIN_OWNED_STAGES, BOOKLIST_STAGE_ORDER } from '@fazoo/config';
import type { BooklistStage } from '@fazoo/types';
import type { FazooClient } from '@fazoo/database';
import { PageHeader, StatCard } from '@/components/page';
import { SectionCards } from '@/components/section-cards';
import { StageBadge } from '@/components/stage-badge';
import { Card } from '@/components/ui/card';
import { pipelineBoard, baDailyTargets } from '@/server/booklists';

/**
 * Landing view for a schools-org admin: where every logged school currently
 * sits in the booklist journey, and which of them are waiting on us rather
 * than on the BA or the school.
 */
export async function SchoolsOverview({ client }: { client: FazooClient }) {
  // `admin_pipeline_board` clamps p_limit to a minimum of 1, so ask for a
  // single row purely to read the organization-wide `stage_counts` it returns
  // alongside — those deliberately ignore every filter.
  let counts: Partial<Record<BooklistStage, number>> = {};
  let total = 0;
  let unavailable = false;
  try {
    const board = await pipelineBoard(client, { limit: 1 });
    counts = board.stage_counts;
    total = board.total;
  } catch {
    unavailable = true;
  }

  let daily;
  try {
    daily = await baDailyTargets(client);
  } catch {
    daily = null;
  }

  const at = (stage: BooklistStage): number => counts[stage] ?? 0;
  const waitingOnAdmin = ADMIN_OWNED_STAGES.reduce((sum, stage) => sum + at(stage), 0);
  const populated = BOOKLIST_STAGE_ORDER.filter((stage) => at(stage) > 0);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Every logged school and where it sits in the booklist journey."
      >
        <Link
          href="/booklists"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Open the pipeline
        </Link>
        <Link
          href="/booklists/conversion"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-ink/5"
        >
          Conversion queue{waitingOnAdmin > 0 ? ` (${waitingOnAdmin})` : ''}
        </Link>
      </PageHeader>

      {daily ? (
        <Card className="mb-6 p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Daily BA targets (today)</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Schools logged today"
              value={daily.summary.schools_logged_today}
              hint={`${daily.summary.bas_active_today} active BA${daily.summary.bas_active_today === 1 ? '' : 's'}`}
            />
            <StatCard
              label="On daily target"
              value={`${daily.summary.bas_on_target_today} of ${daily.summary.bas_with_daily_target}`}
              hint="Hit minimum"
            />
            <StatCard
              label="Missed today"
              value={daily.summary.bas_missed_today}
            />
            <StatCard
              label="Compliance today"
              value={daily.summary.compliance_pct !== null ? `${daily.summary.compliance_pct}%` : 'n/a'}
              hint={`Default target ${daily.default_target_daily_schools ?? 'unset'} school${daily.default_target_daily_schools === 1 ? '' : 's'}/day`}
            />
          </div>
        </Card>
      ) : null}

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Sections</h2>
        <SectionCards orgKind="schools" />
      </Card>

      {unavailable ? (
        <Card className="mb-6 border-bad/40 bg-bad/5 p-4">
          <p className="text-sm font-semibold text-ink">Pipeline totals unavailable</p>
          <p className="mt-1 text-xs text-muted">
            The board could not be read just now. The links above still work — the counts are
            what is missing.
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Schools logged" value={total} hint="Booklist jobs, all stages" />
        <StatCard
          label="Waiting on us"
          value={waitingOnAdmin}
          hint="Document received through in production"
        />
        <StatCard label="Ready to print" value={at('formatted')} />
        <StatCard label="Completed" value={at('completed')} hint="Stamped +1 copy on file" />
        <StatCard label="With the school" value={at('pending_school_approval')} />
        <StatCard label="In production" value={at('in_production')} />
        <StatCard label="Dispatched" value={at('dispatched')} />
        <StatCard label="Declined" value={at('declined')} />
      </div>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Stage breakdown</h2>
          <p className="mt-0.5 text-xs text-muted">
            Counts are organization-wide. Pick a stage to open those schools on the board.
          </p>
        </div>
        {populated.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            No schools have been logged yet. A BA starts one from the app the moment they
            approach a school.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/8 text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-2 font-medium">
                  Stage
                </th>
                <th scope="col" className="px-5 py-2 text-right font-medium">
                  Schools
                </th>
                <th scope="col" className="px-5 py-2 font-medium">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {populated.map((stage) => (
                <tr key={stage} className="border-b border-ink/5 last:border-0">
                  <td className="px-5 py-2.5">
                    <StageBadge stage={stage} />
                  </td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-ink">
                    {at(stage)}
                  </td>
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/booklists?stage=${encodeURIComponent(stage)}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
