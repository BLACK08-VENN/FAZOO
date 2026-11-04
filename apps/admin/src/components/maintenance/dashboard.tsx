import 'server-only';
import type { FazooClient } from '@fazoo/database';
import Link from 'next/link';
import { loadMaintenanceWorkspace } from '@/lib/maintenance/server';
import { maintenanceSummary } from '@/lib/maintenance/summary';
import { MaintenanceDashboardCard } from './dashboard-card';

/** Parent dashboards establish identity; the RPC scopes every count to that caller. */
export async function MaintenanceDashboard({
  client,
  requester = false,
}: {
  client: FazooClient;
  requester?: boolean;
}) {
  if (process.env.MAINTENANCE_ENABLED !== 'true') return null;
  try {
    const workspace = await loadMaintenanceWorkspace(client);
    return (
      <MaintenanceDashboardCard
        summary={maintenanceSummary(workspace, requester, Date.now())}
      />
    );
  } catch {
    return (
      <section
        className="my-5 rounded-xl border border-ink/15 bg-white p-5 text-ink"
        aria-label="Maintenance unavailable"
      >
        <h2 className="font-semibold">Maintenance & services</h2>
        <p className="mt-2 text-sm text-muted">
          Service information is temporarily unavailable.
        </p>
        <Link
          href="/service-desk"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
        >
          Open service desk
        </Link>
      </section>
    );
  }
}
