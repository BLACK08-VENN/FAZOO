export const ADMIN_WORKSPACE_COOKIE = 'fazoo-admin-workspace';
export function isAdminHubPath(pathname: string) {
  return pathname === '/overview' || pathname === '/brands' || pathname.startsWith('/brands/');
}
export function workspaceSelectionMatches(
  value: string | undefined,
  userId: string,
  organizationId: string,
) {
  return value === `${userId}:${organizationId}`;
}
export type AdminBrand = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  kind: 'retail' | 'schools';
  status: string;
  active_campaigns: number;
  total_campaigns: number;
};
export type AdminBrandHub = {
  brands: AdminBrand[];
  active_brands: number;
  active_campaigns: number;
  team_members: number;
  pending_approvals: number;
};
