import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireApprovedProfile } from '@/lib/auth';
import { loadMaintenanceWorkspace } from '@/lib/maintenance/server';
import { MaintenanceWorkspace } from '@/components/maintenance/workspace';

export const metadata = { title: 'Service desk — Fazoo' };
export default async function ServiceDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  if (process.env.MAINTENANCE_ENABLED !== 'true') notFound();
  // Authentication redirects must propagate outside the data-loading error boundary.
  const { client, profile } = await requireApprovedProfile();
  let workspace;
  try {
    workspace = await loadMaintenanceWorkspace(client);
  } catch {
    return (
      <main id="main-content" className="mx-auto max-w-lg p-10">
        <h1 className="text-2xl font-semibold">Service desk unavailable</h1>
        <p className="mt-4">
          We could not load the service workspace. Check your connection or contact your
          administrator.
        </p>
        <Link href="/service-desk" className="mt-6 inline-block underline">
          Try again
        </Link>
      </main>
    );
  }
  const params = await searchParams;
  return (
    <MaintenanceWorkspace
      initial={workspace}
      startNew={params.new === '1'}
      operationsEnabled={process.env.OPERATIONS_ENABLED === 'true' && profile.role !== 'client'}
    />
  );
}
