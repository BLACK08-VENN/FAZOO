import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { navFor, resolveOrgKind } from '@/lib/nav';
import { MobileNav } from '@/components/mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { CommandPalette } from '@/components/command-palette';
import { Toaster } from '@/components/toast';
import { FazooMark } from '@/components/fazoo-mark';
import { signOutAction, switchAdminBrandAction } from './actions';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { client, profile } = await requireStaff();
  const orgKind = await resolveOrgKind(client);
  const nav = navFor(orgKind);

  const { data: organizations } = await client
    .from('organizations')
    .select('id, name, slug, logo_url, status, kind')
    .eq('status', 'active')
    .order('name');

  const activeBrands = organizations ?? [];
  const activeBrand =
    activeBrands.find((brand) => brand.id === profile.organization_id) ?? activeBrands[0] ?? null;
  const canSwitchBrand = profile.role === 'super_admin' && activeBrands.length > 1;

  return (
    <div className="fazoo-shell flex min-h-screen">
      <aside
        className="fazoo-glass-dark sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-5 xl:flex"
        aria-label="Sidebar navigation"
      >
        <div className="mb-5 px-3">
          <FazooMark className="size-12" />
          <span className="sr-only">Fazoo</span>
        </div>

        {activeBrand ? (
          <div className="mx-1 mb-5 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Active brand
            </p>
            <div className="flex items-center gap-2.5">
              {activeBrand.logo_url ? (
                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeBrand.logo_url}
                    alt={`${activeBrand.name} logo`}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">
                  {activeBrand.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{activeBrand.name}</p>
                <p className="truncate text-[11px] capitalize text-white/50">
                  {activeBrand.kind} workspace
                </p>
              </div>
            </div>

            {canSwitchBrand ? (
              <form action={switchAdminBrandAction} className="mt-3 space-y-2">
                <label htmlFor="admin-active-brand" className="sr-only">
                  Change active brand
                </label>
                <select
                  id="admin-active-brand"
                  name="organization_id"
                  defaultValue={activeBrand.id}
                  className="h-9 w-full rounded-lg border border-white/15 bg-[#241238] px-2 text-xs text-white outline-none focus:border-white/40"
                >
                  {activeBrands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
                >
                  Switch brand
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        <nav aria-label="Primary" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 pt-4">
          <CommandPalette orgKind={orgKind} />
          <div className="mt-3">
            <ThemeToggle />
          </div>
          <div className="mt-3">
            <p className="truncate px-3 text-sm font-medium text-white">{profile.full_name}</p>
            <p className="truncate px-3 text-xs text-white/50">
              {profile.role.replace('_', ' ')}
            </p>
          </div>
          <form action={signOutAction} className="mt-3">
            <button
              type="submit"
              className="w-full rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex w-full flex-col">
        <header className="fazoo-glass-dark no-print sticky top-0 z-20 flex min-h-14 items-center justify-between border-b px-4 xl:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <FazooMark className="size-9" />
            {activeBrand?.logo_url ? (
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeBrand.logo_url}
                  alt={`${activeBrand.name} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">
                {activeBrand?.name ?? 'Fazoo'}
              </p>
              <p className="truncate text-[10px] capitalize text-white/55">
                {profile.role.replace('_', ' ')}
              </p>
            </div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="min-h-11 min-w-11 rounded-xl px-3 text-xs font-medium text-white/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              Sign out
            </button>
          </form>
        </header>

        {canSwitchBrand && activeBrand ? (
          <div className="no-print border-b border-ink/10 bg-white/90 px-4 py-2 xl:hidden">
            <form action={switchAdminBrandAction} className="flex items-center gap-2">
              <label htmlFor="mobile-admin-active-brand" className="shrink-0 text-xs font-semibold text-muted">
                Brand
              </label>
              <select
                id="mobile-admin-active-brand"
                name="organization_id"
                defaultValue={activeBrand.id}
                className="h-9 min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-2 text-xs text-ink"
              >
                {activeBrands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-white"
              >
                Switch
              </button>
            </form>
          </div>
        ) : null}

        <main
          className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:p-6 sm:pb-28 xl:p-8"
          id="main-content"
        >
          {children}
        </main>
        <MobileNav orgKind={orgKind} />
        <Toaster />
      </div>
    </div>
  );
}
