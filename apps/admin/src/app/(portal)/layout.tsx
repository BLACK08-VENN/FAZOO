import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { requireStaff } from '@/lib/auth';
import { signOutAction } from './actions';

const NAV = [{ href: '/overview', label: 'Overview', icon: BarChart3 }] as const;

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
        <nav aria-label="Primary" className="flex-1 space-y-1">
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
        <header className="fazoo-glass-dark no-print sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 lg:hidden">
          <span className="text-lg font-bold text-white">Fazoo.</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-xs font-medium text-white/80 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              Sign out
            </button>
          </form>
        </header>
        <nav
          aria-label="Primary mobile"
          className="fazoo-glass-dark no-print sticky top-[52px] z-20 flex gap-1 overflow-x-auto border-b px-2 py-2 lg:hidden"
          role="navigation"
        >
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
