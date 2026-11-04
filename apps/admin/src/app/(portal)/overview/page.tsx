import Link from 'next/link';
import { Building2, ArrowUpRight } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/page';
import { Card } from '@/components/ui/card';
import { BrandOpenForm } from '@/components/brand-open-form';
import { loadAdminBrandHub } from '@/lib/admin-workspace-server';

export default async function AdminOverviewPage() {
  const { profile, hub } = await loadAdminBrandHub();
  return (
    <>
      <div className="mb-7 rounded-2xl border border-ink/10 bg-white/70 p-5 sm:p-7">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          FAZOO Administration
        </p>
        <PageHeader
          title="Your brands"
          description="Choose an active brand to open its campaigns, team, reports and operations."
        />
        <p className="text-sm text-muted">
          {profile.role === 'super_admin'
            ? 'A platform view across your active brands.'
            : 'The brands available to your staff account.'}
        </p>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active brands" value={hub.active_brands} />
        <StatCard label="Active campaigns" value={hub.active_campaigns} />
        <StatCard label="Approved team members" value={hub.team_members} />
        <StatCard label="Pending approvals" value={hub.pending_approvals} />
      </div>
      <section aria-labelledby="active-brands-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="active-brands-heading" className="text-lg font-semibold text-ink">
              Active brands
            </h2>
            <p className="mt-1 text-sm text-muted">
              Each brand has its own workspace and reporting.
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary hover:underline"
            href="/brands"
          >
            Manage brands
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hub.brands.map((brand) => (
            <Card key={brand.id} className="flex flex-col p-5 sm:p-6">
              <div className="mb-6 flex items-start justify-between gap-3">
                {brand.logo_url ? (
                  <div className="flex h-16 w-24 items-center justify-center rounded-xl border border-ink/8 bg-white p-2">
                    <img
                      src={brand.logo_url}
                      alt={`${brand.name} logo`}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <span className="flex size-16 items-center justify-center rounded-xl bg-primary/5 text-xl font-bold text-primary">
                    <Building2 size={25} />
                  </span>
                )}
                <span className="rounded-full border border-ok/20 bg-ok/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ok">
                  Active
                </span>
              </div>
              <h3 className="text-xl font-semibold text-ink">{brand.name}</h3>
              <div className="mb-6 mt-4 flex gap-6 text-sm">
                <div>
                  <p className="text-xl font-bold tabular-nums text-ink">
                    {brand.active_campaigns}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">Active campaigns</p>
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums text-ink">
                    {brand.total_campaigns}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">Total campaigns</p>
                </div>
              </div>
              <div className="mt-auto border-t border-ink/8 pt-4">
                <BrandOpenForm
                  organizationId={brand.id}
                  brandName={brand.name}
                  requestId={crypto.randomUUID()}
                />
              </div>
            </Card>
          ))}
        </div>
        {hub.brands.length === 0 ? (
          <Card className="p-8 text-center">
            <Building2 className="mx-auto mb-3 text-muted" size={28} />
            <h3 className="font-semibold text-ink">No active brands available</h3>
            <p className="mt-2 text-sm text-muted">
              {profile.role === 'super_admin'
                ? 'Create or activate a brand from Manage brands.'
                : 'Contact your administrator to activate or assign your brand access.'}
            </p>
          </Card>
        ) : null}
      </section>
    </>
  );
}
export const metadata = { title: 'Administration — Fazoo' };
