import Link from 'next/link';
import {
  Boxes,
  Building2,
  CalendarRange,
  GraduationCap,
  MapPin,
  Store,
  Users,
} from 'lucide-react';
import { requireStaff } from '@/lib/auth';
import { MobileNav } from '@/components/mobile-nav';
import { signOutAction } from './actions';

const NAV = [
  { href: '/brand-ambassadors', label: 'Brand ambassadors', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Store },
  { href: '/stores', label: 'Stores', icon: MapPin },
  { href: '/skus', label: 'SKUs', icon: Boxes },
  { href: '/veda-activations', label: 'Brand activations', icon: GraduationCap },
  { href: '/veda-assignments', label: 'Brand assignments', icon: CalendarRange },
  { href: '/brands', label: 'Add brand', icon: Building2 },
] as const;

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();

  return (
    <div className="fazoo-shell flex min-h-screen">
      <aside
        className="fazoo-glass-dark sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-5 lg:flex"
        aria-label="Sidebar navigation"
      >
        <div className="mb-8 px-3">
          <span className="text-lg font-bold tracking-tight text-white">
            Fazoo<span className="text-bright">.</span>
          </span>
        </div>
        <nav aria-label="Primary" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => (
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
          <p className="truncate px-3 text-xs text-white/50">
            {profile.role.replace('_', ' ')}
          </p>
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

      {/* Mobile top bar */}
      <div className="flex w-full flex-col">
        <header className="fazoo-glass-dark no-print sticky top-0 z-20 flex min-h-14 items-center justify-between border-b px-4 lg:hidden">
          <div className="min-w-0">
            <span className="text-lg font-bold text-white">
              Fazoo<span className="text-bright">.</span>
            </span>
            <p className="truncate text-[11px] capitalize text-white/55">
              {profile.role.replace('_', ' ')}
            </p>
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
        <main
          className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:p-6 sm:pb-28 lg:p-8"
          id="main-content"
        >
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
