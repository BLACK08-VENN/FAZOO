import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isAdminHubPath, workspaceSelectionMatches } from './admin-workspace';
import type { AdminBrand } from './admin-workspace';

const route = vi.hoisted(() => ({ pathname: '/overview' }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/app/(portal)/actions', () => ({ signOutAction: vi.fn() }));
import { AdminPortalShell } from '@/components/admin-portal-shell';

const school: AdminBrand = {
  id: 'example-id',
  name: 'Example School Brand',
  slug: 'example-school',
  logo_url: null,
  kind: 'schools',
  status: 'active',
  active_campaigns: 0,
  total_campaigns: 0,
};
function shell(brand: AdminBrand | null = school) {
  return renderToStaticMarkup(
    createElement(AdminPortalShell, {
      brand,
      fullName: 'Test administrator',
      role: 'super_admin',
      maintenanceEntry: createElement('span', null, 'Service operations'),
      children: createElement('div', null, 'Page content'),
    }),
  );
}
describe('Neutral administration and explicit brand entry', () => {
  it('does not show a previously selected brand or campaign tools on the neutral dashboard', () => {
    route.pathname = '/overview';
    const markup = shell();
    expect(markup).toContain('Administration');
    expect(markup).toContain('Manage brands');
    expect(markup).not.toContain('Example School Brand');
    expect(markup).not.toContain('Booklist pipeline');
    expect(markup).not.toContain('Service operations');
  });
  it('keeps brand management neutral too', () => {
    route.pathname = '/brands';
    const markup = shell();
    expect(markup).not.toContain('Booklist pipeline');
    expect(markup).not.toContain('Example School Brand');
  });
  it('shows school tools only inside an explicitly opened school workspace', () => {
    route.pathname = '/workspace';
    const markup = shell();
    expect(markup).toContain('Example School Brand');
    expect(markup).toContain('Booklist pipeline');
    expect(markup).toContain('All brands');
  });
  it('shows Lenovo partner collection and retail tools without school tools', () => {
    route.pathname = '/workspace';
    const markup = shell({
      ...school,
      name: 'Lenovo Nigeria',
      slug: 'lenovo-nigeria',
      kind: 'retail',
    });
    expect(markup).toContain('Partner collection');
    expect(markup).toContain('Store management');
    expect(markup).not.toContain('Booklist pipeline');
  });
  it('never treats an unrelated path as a neutral hub path', () => {
    expect(isAdminHubPath('/overview')).toBe(true);
    expect(isAdminHubPath('/brands')).toBe(true);
    expect(isAdminHubPath('/booklists')).toBe(false);
    expect(isAdminHubPath('/brands-other')).toBe(false);
  });
  it('rejects stale and cross-user workspace cookies', () => {
    expect(workspaceSelectionMatches(undefined, 'staff-a', 'org-a')).toBe(false);
    expect(workspaceSelectionMatches('staff-b:org-a', 'staff-a', 'org-a')).toBe(false);
    expect(workspaceSelectionMatches('staff-a:org-b', 'staff-a', 'org-a')).toBe(false);
    expect(workspaceSelectionMatches('staff-a:org-a', 'staff-a', 'org-a')).toBe(true);
  });
});
