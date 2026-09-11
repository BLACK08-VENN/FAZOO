import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import type { BaAgency } from '@fazoo/types';
import { agencyLabel } from '@fazoo/config';
import { requireStaff, isElevated } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { AgencyBadge } from '@/components/stage-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { nairobiDate, NOT_YET } from '@/lib/format';
import { baPerformance, baDailyTargets } from '@/server/booklists';

const AGENCIES: ReadonlyArray<{ value: BaAgency; label: string }> = [
  { value: 'ael', label: 'Advert Eyes Limited (AEL)' },
  { value: 'veda', label: 'Veda' },
];

function isAgency(value: string | undefined): value is BaAgency {
  return value === 'ael' || value === 'veda';
}

/**
 * The AEL / Veda split the supervisors need: AEL BAs are held to a mandatory
 * gate selfie and a monthly school target, Veda BAs are not. Every figure here
 * comes from `admin_ba_performance`, which derives the rules server-side from
 * the organization's `agency_rules` rather than trusting anything the page sends.
 */
export default async function BaPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ agency?: string; from?: string; to?: string }>;
}) {
  const { client, profile } = await requireStaff();
  const params = await searchParams;

  const agency = isAgency(params.agency) ? params.agency : null;
  const from = params.from?.trim() || null;
  const to = params.to?.trim() || null;
  const canAct = isElevated(profile.role);

  const result = await baPerformance(client, { agency, from, to });
  const rows = result.brand_ambassadors;

  let daily;
  try {
    daily = await baDailyTargets(client);
  } catch {
    daily = null;
  }

  const totals = rows.reduce(
    (acc, row) => ({
      schools: acc.schools + row.schools_visited,
      visits: acc.visits + row.visits,
      booklists: acc.booklists + row.booklists_collected,
      declines: acc.declines + row.declines,
      selfiesRequired: acc.selfiesRequired + row.selfies_required,
      selfiesCaptured: acc.selfiesCaptured + row.selfies_captured,
      missingSelfies: acc.missingSelfies + (row.selfies_required - row.selfies_captured),
    }),
    { schools: 0, visits: 0, booklists: 0, declines: 0, selfiesRequired: 0, selfiesCaptured: 0, missingSelfies: 0 },
  );

  const aelCount = rows.filter((row) => row.agency === 'ael').length;
  const unsetCount = rows.filter((row) => row.agency === null).length;

  async function setAgency(formData: FormData) {
    'use server';
    const { client: c, profile: actor } = await requireStaff();
    if (!isElevated(actor.role)) return;

    const baId = String(formData.get('ba_id') ?? '');
    const next = String(formData.get('agency') ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(baId) || (next !== 'ael' && next !== 'veda')) return;

    const { error } = await c.rpc('admin_set_ba_agency', { p_ba_id: baId, p_agency: next });
    if (!error) revalidatePath('/ba-performance');
  }

  async function setTarget(formData: FormData) {
    'use server';
    const { client: c, profile: actor } = await requireStaff();
    if (!isElevated(actor.role)) return;

    const baId = String(formData.get('ba_id') ?? '');
    const periodStart = String(formData.get('period_start') ?? '');
    const periodEnd = String(formData.get('period_end') ?? '');
    const target = Number(formData.get('target_schools') ?? 0);
    const targetDailyRaw = String(formData.get('target_daily_schools') ?? '').trim();
    const targetDaily = targetDailyRaw ? Number(targetDailyRaw) : null;
    if (!/^[0-9a-f-]{36}$/i.test(baId) || !periodStart || !periodEnd) return;
    if (!Number.isInteger(target) || target < 0) return;

    const { error } = await c.rpc('admin_set_ba_target', {
      p_ba_id: baId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_target_schools: target,
      p_target_daily_schools: targetDaily,
    });
    if (!error) revalidatePath('/ba-performance');
  }

  return (
    <>
      <PageHeader
        title="BA performance"
        description="Who is from AEL and who is from Veda, who must capture a gate selfie, whether they are, and how many schools each one actually reached."
      >
        <Link
          href="/booklists"
          className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Booklist pipeline
        </Link>
      </PageHeader>

      {daily ? (
        <>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Daily school targets (today)</h3>
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard
              label="Schools logged today"
              value={daily.summary.schools_logged_today}
              hint={`${daily.summary.bas_active_today} BA${daily.summary.bas_active_today === 1 ? '' : 's'} active`}
            />
            <StatCard
              label="On daily target"
              value={`${daily.summary.bas_on_target_today} of ${daily.summary.bas_with_daily_target}`}
              hint="Hit their minimum today"
            />
            <StatCard
              label="Missed today"
              value={daily.summary.bas_missed_today}
              hint={daily.summary.bas_missed_today === 0 ? 'All clear' : 'Below minimum'}
            />
            <StatCard
              label="Compliance today"
              value={daily.summary.compliance_pct !== null ? `${daily.summary.compliance_pct}%` : 'n/a'}
              hint={`Default daily target ${daily.default_target_daily_schools ?? 'unset'} school${daily.default_target_daily_schools === 1 ? '' : 's'}`}
            />
          </div>
        </>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Brand ambassadors" value={rows.length} hint={`${aelCount} from AEL`} />
        <StatCard label="Schools reached" value={totals.schools} hint="Distinct schools, this period" />
        <StatCard label="Approaches" value={totals.visits} />
        <StatCard label="Booklists collected" value={totals.booklists} />
        <StatCard label="Declines recorded" value={totals.declines} />
        <StatCard
          label="Selfies missing"
          value={totals.missingSelfies}
          hint={`${totals.selfiesCaptured} of ${totals.selfiesRequired} required selfies captured`}
        />
      </div>

      {unsetCount > 0 ? (
        <Card className="mb-5 border-warn/30 bg-warn/5 p-4">
          <p className="text-sm font-medium text-ink">
            {unsetCount} brand ambassador{unsetCount === 1 ? ' has' : 's have'} no agency set.
          </p>
          <p className="mt-1 text-xs text-muted">
            Until an agency is recorded we cannot tell whether a gate selfie is mandatory for them,
            so their visits are treated as selfie-optional. Set it below.
          </p>
        </Card>
      ) : null}

      <Card className="mb-5 p-4">
        <form
          method="get"
          action="/ba-performance"
          role="search"
          aria-label="Filter BA performance"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div>
            <Label htmlFor="bp-agency">Agency</Label>
            <Select id="bp-agency" name="agency" defaultValue={agency ?? ''}>
              <option value="">All agencies</option>
              {AGENCIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bp-from">Period from</Label>
            <Input id="bp-from" name="from" type="date" defaultValue={from ?? ''} />
          </div>
          <div>
            <Label htmlFor="bp-to">Period to</Label>
            <Input id="bp-to" name="to" type="date" defaultValue={to ?? ''} />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="h-10 flex-1 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Apply
            </button>
            <Link
              href="/ba-performance"
              className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
            >
              Reset
            </Link>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted">
          Period {nairobiDate(result.period_start)} to {nairobiDate(result.period_end)}. Leaving the
          dates blank reports the current month.
        </p>
      </Card>

      <TableWrap>
        <Table>
          <caption className="sr-only">Brand ambassador performance for the selected period</caption>
          <thead>
            <tr>
              <Th>Brand ambassador</Th>
              <Th>Agency</Th>
              <Th>Selfie rule</Th>
              <Th className="text-right">Target</Th>
              <Th className="text-right">Schools reached</Th>
              <Th className="text-right">Daily</Th>
              <Th className="text-right">Booklists</Th>
              <Th className="text-right">Declines</Th>
              <Th className="text-right">Selfies</Th>
              <Th className="text-right">All time</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={9}>
                No approved brand ambassadors match that filter.
              </EmptyRow>
            ) : (
              rows.map((row) => {
                const target = row.target_schools;
                const reached = row.schools_visited;
                const met = target !== null && target > 0 && reached >= target;
                const selfieGap = row.selfies_required - row.selfies_captured;
                return (
                  <tr key={row.ba_id}>
                    <Td>
                      <span className="font-medium text-ink">{row.full_name}</span>
                      {row.phone ? <p className="text-xs text-muted">{row.phone}</p> : null}
                      {row.target_period_start ? (
                        <p className="text-xs text-muted">
                          Target period {nairobiDate(row.target_period_start)} →{' '}
                          {nairobiDate(row.target_period_end)}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <AgencyBadge agency={row.agency} selfieRequired={row.selfie_required} />
                      {canAct ? (
                        <form action={setAgency} className="mt-2 flex gap-1">
                          <input type="hidden" name="ba_id" value={row.ba_id} />
                          <select
                            name="agency"
                            defaultValue={row.agency ?? ''}
                            aria-label={`Agency for ${row.full_name}`}
                            className="h-8 min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-2 text-xs text-ink focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary"
                          >
                            <option value="">Not set</option>
                            {AGENCIES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" size="sm" variant="outline">
                            Set
                          </Button>
                        </form>
                      ) : null}
                    </Td>
                    <Td className="text-xs">
                      {row.selfie_required ? (
                        <span className="font-medium text-ink">Mandatory gate selfie</span>
                      ) : (
                        <span className="text-muted">Not enforced for this agency</span>
                      )}
                    </Td>
                    <Td className="text-right text-xs tabular-nums">
                      {target === null ? (
                        <span className="text-muted">None set</span>
                      ) : (
                        <>
                          {target}
                          <p className="text-muted">per period</p>
                        </>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      <span className="text-base font-bold text-ink">{reached}</span>
                      {target !== null && target > 0 ? (
                        <p className="text-xs">
                          <Badge tone={met ? 'success' : 'warning'}>
                            {met ? 'Target met' : `${Math.round((reached / target) * 100)}% of target`}
                          </Badge>
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums text-xs">
                      {(() => {
                        const dRow = daily?.rows.find((r) => r.ba_id === row.ba_id);
                        if (!dRow || dRow.target_daily_schools === null) {
                          return <span className="text-muted">n/a</span>;
                        }
                        const dMet = dRow.schools_visited_today >= dRow.target_daily_schools;
                        return (
                          <span className="font-semibold tabular-nums">
                            {dRow.schools_visited_today}/{dRow.target_daily_schools}
                            <p className="mt-0.5">
                              <Badge tone={dMet ? 'success' : 'warning'}>
                                {dMet ? 'Met' : `${dRow.days_met_last_7_days}/7 days`}
                              </Badge>
                            </p>
                          </span>
                        );
                      })()}
                    </Td>
                    <Td className="text-right tabular-nums text-xs">{row.booklists_collected}</Td>
                    <Td className="text-right tabular-nums text-xs">{row.declines}</Td>
                    <Td className="text-right text-xs tabular-nums">
                      {row.selfies_required === 0 ? (
                        <span className="text-muted">n/a</span>
                      ) : (
                        <>
                          <span
                            className={
                              selfieGap === 0 ? 'font-medium text-ok' : 'font-medium text-bad'
                            }
                          >
                            {row.selfies_captured}/{row.selfies_required}
                          </span>
                          {selfieGap > 0 ? <p className="text-bad">{selfieGap} missing</p> : null}
                        </>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums text-xs">
                      {row.schools_visited_all_time}
                      <p className="text-muted">{row.visits} visits</p>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrap>

      {canAct ? (
        <Card className="mt-6">
          <CardHeader
            title="Set a school target"
            description="AEL supervisors set a target number of schools per period. Where none is set, the agency default from the organization settings applies."
          />
          <CardBody>
            <form action={setTarget} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <Label htmlFor="tg-ba">Brand ambassador</Label>
                <Select id="tg-ba" name="ba_id" required>
                  <option value="">Choose a brand ambassador</option>
                  {rows.map((row) => (
                    <option key={row.ba_id} value={row.ba_id}>
                      {row.full_name} — {agencyLabel(row.agency)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="tg-start">Period start</Label>
                <Input id="tg-start" name="period_start" type="date" required />
              </div>
              <div>
                <Label htmlFor="tg-end">Period end</Label>
                <Input id="tg-end" name="period_end" type="date" required />
              </div>
              <div>
                <Label htmlFor="tg-target">Target schools (period)</Label>
                <Input
                  id="tg-target"
                  name="target_schools"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="20"
                  required
                />
              </div>
              <div>
                <Label htmlFor="tg-daily">Daily target (AEL)</Label>
                <Input
                  id="tg-daily"
                  name="target_daily_schools"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 7"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-6">
                <Button type="submit">Save target</Button>
                <p className="mt-2 text-xs text-muted">
                  Saving over an existing period for the same BA updates that target rather than
                  creating a second one. Leave the daily field blank to use the agency default.
                </p>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        Schools reached counts distinct schools, so visiting the same school twice does not inflate
        it. “All time” ignores the period filter and is the figure to quote for a BA&apos;s cumulative
        coverage. {NOT_YET} means the value has not been recorded.
      </p>
    </>
  );
}

export function generateMetadata() {
  return { title: 'BA performance — Fazoo' };
}
