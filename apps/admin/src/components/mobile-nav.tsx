'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { mobileNavFor, type OrgKind } from '@/lib/nav';

/**
 * Tailwind only emits classes it can see as literals, so the column count is
 * looked up from a fixed table rather than interpolated into `grid-cols-${n}`.
 */
const GRID_COLS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

export function MobileNav({ orgKind }: { orgKind: OrgKind }) {
  const pathname = usePathname();
  const items = mobileNavFor(orgKind);

  return (
    <nav
      aria-label="Primary mobile"
      className="fazoo-mobile-nav no-print fixed inset-x-0 bottom-0 z-30 border-t lg:hidden"
    >
      <div
        className={cn(
          'mx-auto grid max-w-lg px-2 pt-1.5',
          GRID_COLS[items.length] ?? 'grid-cols-6',
        )}
      >
        {items.map(({ href, shortLabel, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                active ? 'text-primary' : 'text-muted hover:bg-primary/5 hover:text-ink',
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              <span>{shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
