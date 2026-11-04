'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, ArrowLeft, ArrowUpRight, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { WorkspaceBrand } from './workspace-brand';
import { FazooMark } from './fazoo-mark';
import { ThemeToggle } from './theme-toggle';
import { CommandPalette } from './command-palette';
import { Toaster } from './toast';
import { navFor } from '@/lib/nav';
import { isAdminHubPath, type AdminBrand } from '@/lib/admin-workspace';
import { signOutAction } from '@/app/(portal)/actions';

export function AdminPortalShell({
  brand,
  fullName,
  role,
  maintenanceEntry,
  children,
}: {
  brand: AdminBrand | null;
  fullName: string;
  role: string;
  maintenanceEntry: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  const global = isAdminHubPath(path) || !brand;
  const kind = brand?.kind ?? 'retail';
  const hubNav = [
    { href: '/overview', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/brands', label: 'Manage brands', icon: Building2 },
  ];
  const brandNav = [
    { href: '/workspace', label: 'Brand overview', icon: LayoutDashboard },
    ...(brand?.slug === 'lenovo-nigeria' && role !== 'supervisor'
      ? [{ href: '/partners', label: 'Partner collection', icon: Building2 }]
      : []),
    ...navFor(kind).filter((n) => n.href !== '/brands'),
  ];
  const items = global ? hubNav : brandNav;
  const mobileItems = global
    ? items
    : [...items.slice(0, 5), { href: '/overview', label: 'All brands', icon: Building2 }];
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <div className="fazoo-shell flex min-h-screen">
      <aside
        className="fazoo-glass-dark sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-5 xl:flex"
        aria-label="Admin navigation"
      >
        <WorkspaceBrand />
        {global ? (
          <div className="mx-1 mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
              Administration
            </p>
            <p className="mt-2 text-sm leading-6 text-white/75">
              Manage brands and open a workspace to view its operations.
            </p>
          </div>
        ) : (
          <div className="mx-1 mb-5 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/50">
              Brand workspace
            </p>
            <div className="flex items-center gap-3">
              {brand.logo_url ? (
                <img
                  className="size-10 rounded-lg bg-white object-contain p-1"
                  src={brand.logo_url}
                  alt=""
                />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 font-bold text-white">
                  {brand.name.slice(0, 1)}
                </span>
              )}
              <p className="text-sm font-semibold text-white">{brand.name}</p>
            </div>
            <Link
              className="mt-3 flex min-h-9 items-center gap-2 text-xs font-semibold text-white/70 hover:text-white"
              href="/overview"
            >
              <ArrowLeft size={13} />
              All brands
            </Link>
          </div>
        )}
        {!global ? maintenanceEntry : null}
        <p className="fazoo-nav-caption">{global ? 'Platform' : 'Workspace'}</p>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Primary">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? 'page' : undefined}
              className="fazoo-nav-link"
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 border-t border-white/10 pt-4">
          {!global ? <CommandPalette orgKind={kind} /> : null}
          <ThemeToggle />
          <div>
            <p className="truncate px-3 text-sm font-medium text-white">{fullName}</p>
            <p className="px-3 text-xs capitalize text-white/50">{role.replaceAll('_', ' ')}</p>
          </div>
          <form action={signOutAction}>
            <button className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-medium text-white/80 hover:bg-white/10">
              <LogOut size={13} />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="fazoo-glass-dark sticky top-0 z-20 flex min-h-[64px] items-center justify-between gap-3 border-b px-4 xl:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <FazooMark className="size-9" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {global ? 'FAZOO Administration' : brand.name}
              </p>
              <p className="text-[10px] text-white/50">
                {global ? 'All your brands in one place' : 'Brand workspace'}
              </p>
            </div>
          </div>
          {!global ? (
            <Link
              href="/overview"
              className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-white"
            >
              <Building2 size={14} />
              All brands
            </Link>
          ) : (
            <form action={signOutAction}>
              <button className="min-h-11 px-2 text-xs font-semibold text-white/80">
                Sign out
              </button>
            </form>
          )}
        </header>
        <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-3 text-xs text-muted sm:px-6 xl:px-8">
          <span>{global ? 'Administration' : `${brand.name} workspace`}</span>
          {global ? (
            <span className="flex items-center gap-1">
              <Building2 size={13} />
              All brands
            </span>
          ) : (
            <Link
              className="flex min-h-8 items-center gap-1 font-semibold text-primary"
              href="/overview"
            >
              Switch brand
              <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:p-6 sm:pb-28 xl:p-8"
        >
          {children}
        </main>
        {!global ? (
          <div className="fixed bottom-24 right-4 z-30 rounded-lg bg-[#0A1A3A] px-2 xl:hidden">
            {maintenanceEntry}
          </div>
        ) : null}
        <nav
          aria-label="Primary mobile"
          className="fazoo-mobile-nav no-print fixed inset-x-0 bottom-0 z-30 border-t xl:hidden"
        >
          <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 pt-1.5">
            {mobileItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? 'page' : undefined}
                className={`flex min-h-14 min-w-20 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-center text-[10px] font-semibold ${active(href) ? 'text-primary' : 'text-muted hover:bg-primary/5'}`}
              >
                <Icon size={20} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </nav>
        <Toaster />
      </div>
    </div>
  );
}
