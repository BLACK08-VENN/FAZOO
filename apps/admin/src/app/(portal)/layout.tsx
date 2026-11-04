import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminPortalShell } from '@/components/admin-portal-shell';
import { MaintenanceEntry } from '@/components/maintenance/entry';
import { loadAdminBrandHub } from '@/lib/admin-workspace-server';
import {
  ADMIN_WORKSPACE_COOKIE,
  isAdminHubPath,
  workspaceSelectionMatches,
} from '@/lib/admin-workspace';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, hub } = await loadAdminBrandHub();
  const cookie = (await cookies()).get(ADMIN_WORKSPACE_COOKIE)?.value;
  const selected = workspaceSelectionMatches(cookie, profile.id, profile.organization_id)
    ? (hub.brands.find((b) => b.id === profile.organization_id) ?? null)
    : null;
  const path = (await headers()).get('x-fazoo-pathname') ?? '/overview';
  if (!isAdminHubPath(path) && !selected) redirect('/overview');
  return (
    <AdminPortalShell
      brand={selected}
      fullName={profile.full_name}
      role={profile.role}
      maintenanceEntry={<MaintenanceEntry />}
    >
      {children}
    </AdminPortalShell>
  );
}
