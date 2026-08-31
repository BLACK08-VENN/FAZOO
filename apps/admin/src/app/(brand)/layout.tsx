import Link from 'next/link';
import Image from 'next/image';
import { BarChart3, ClipboardList, LogOut, Store, Users } from 'lucide-react';
import { requireClient } from '@/lib/client-auth';
import { signOutAction } from '../(portal)/actions';

const NAV = [
  { href: '/brand', label: 'Overview', icon: BarChart3, exact: true },
  { href: '/brand/campaigns', label: 'Campaigns', icon: ClipboardList },
  { href: '/brand/stores', label: 'Stores', icon: Store },
  { href: '/brand/bas', label: 'Brand Ambassadors', icon: Users },
] as const;

const ROLE_LABEL = { client: 'Client', brand_ambassador: 'Brand Ambassador' } as const;

export default async function BrandLayout({ children }: { children: React.ReactNode }) {
  const { profile, brand } = await requireClient();
  const roleLabel = ROLE_LABEL[profile.role as keyof typeof ROLE_LABEL] ?? 'Brand workspace';
  const nav = NAV.filter((item) => item.href === '/brand' || profile.role !== 'brand_ambassador');

  return (
    <div className="fazoo-shell flex min-h-screen">
      <aside className="fazoo-glass-dark sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-5 lg:flex" aria-label="Brand dashboard navigation">
        <div className="mb-8 px-3">
          {brand.logo_url ? (
            <div className="relative mb-3 h-14 overflow-hidden rounded-xl border border-white/10 bg-white">
              <Image
                src={brand.logo_url}
                alt={`${brand.name} logo`}
                fill
                sizes="208px"
                className={brand.slug === 'lenovo-nigeria' ? 'object-cover' : 'object-contain'}
                priority
              />
            </div>
          ) : (
            <span className="text-lg font-bold tracking-tight text-white">
              Fazoo<span className="text-bright">.</span>
            </span>
          )}
          <p className="truncate text-xs font-medium text-white/70">{brand.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">
            Powered by Fazoo
          </p>
        </div>
        <nav aria-label="Brand navigation" className="flex-1 space-y-1">
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
          <p className="truncate px-3 text-sm font-medium text-white">{profile.full_name}</p>
          <p className="truncate px-3 text-xs text-white/50">{roleLabel}</p>
          <form action={signOutAction} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex w-full flex-col">
        <header className="fazoo-glass-dark sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 lg:hidden">
          <div>
            <span className="text-sm font-bold text-white">{brand.name}</span>
            <span className="ml-2 text-xs text-white/40">via Fazoo</span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="text-xs font-medium text-white/80 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white">
              Sign out
            </button>
          </form>
        </header>
        <nav
          aria-label="Brand mobile"
          className="fazoo-glass-dark sticky top-[52px] z-20 flex gap-1 overflow-x-auto border-b px-2 py-2 lg:hidden"
          role="navigation"
        >
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8" id="main-content">{children}</main>
      </div>
    </div>
  );
}
